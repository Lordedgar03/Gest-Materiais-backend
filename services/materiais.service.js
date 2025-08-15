// services/materiais.service.js
"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { DataTypes } = require("sequelize");
const { Tipo, Reciclagem, Movimentacao } = require("../models/index");

module.exports = {
	name: "materiais",
	mixins: [DbService],
	adapter: new SequelizeAdapter(sequelize, {
		primaryKey: "mat_id",
		raw: true
	}),
	model: {
		name: "material",
		define: {
			mat_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
			mat_nome: { type: DataTypes.STRING(100), allowNull: false },
			mat_descricao: { type: DataTypes.TEXT, allowNull: true },
			mat_preco: { type: DataTypes.DECIMAL(10, 2) },
			mat_quantidade_estoque: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
			mat_estoque_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
			mat_fk_tipo: { type: DataTypes.INTEGER, allowNull: false },
			mat_localizacao: { type: DataTypes.STRING(255), allowNull: false },
			mat_vendavel: { type: DataTypes.ENUM("SIM", "NAO"), allowNull: false, defaultValue: "SIM" },
			mat_status: { type: DataTypes.ENUM("ativo", "inativo"), defaultValue: "ativo" }
		},
		options: {
			tableName: "tb_materiais",
			timestamps: false
		}
	},

	actions: {
		// Listar todos os materiais
		list: {
			rest: "GET /materiais",
			cache: false,
			async handler() {
				return this.adapter.find({ where: { mat_status: "ativo" } });
			}
		},

		// Criar novo material
		create: {
			rest: "POST /materiais",
			params: {
				mat_nome: { type: "string", min: 1 },
				mat_descricao: { type: "string", optional: true },
				mat_preco: { type: "number", convert: true },
				mat_quantidade_estoque: { type: "number", convert: true, optional: true },
				mat_estoque_minimo: { type: "number", convert: true },
				mat_fk_tipo: { type: "number", convert: true },
				mat_localizacao: { type: "string", min: 1 },
				mat_vendavel: { type: "enum", values: ["SIM", "NAO"] }
			},
			async handler(ctx) {
				const data = { ...ctx.params, mat_vendavel: ctx.params.mat_vendavel || "SIM" };
				const novo = await this.adapter.insert(data);
				await this.clearCache();

				// Busca nome do tipo
				const tipoRec = await Tipo.findByPk(novo.mat_fk_tipo, { raw: true });
				const tipoNome = tipoRec ? tipoRec.tipo_nome : null;

				// Log de estoque inicial, se houver quantidade
				if (novo.mat_quantidade_estoque > 0) {
					await Movimentacao.create({
						mov_fk_material: novo.mat_id,
						mov_material_nome: novo.mat_nome,    // nome do material
						mov_tipo_nome: tipoNome,         // nome do tipo
						mov_tipo: "entrada",
						mov_quantidade: novo.mat_quantidade_estoque,
						mov_preco: novo.mat_preco,
						mov_descricao: "Estoque inicial",
						mov_fk_requisicao: null
					});
				}

				return novo;
			}
		},

		// Atualização de material + log de ajuste de estoque
		update: {
			rest: "PUT /materiais/:id",
			params: {
				id: { type: "number", convert: true },
				mat_nome: { type: "string", optional: true },
				mat_descricao: { type: "string", optional: true },
				mat_preco: { type: "number", convert: true, optional: true },
				mat_quantidade_estoque: { type: "number", convert: true, optional: true },
				mat_estoque_minimo: { type: "number", convert: true, optional: true },
				mat_fk_tipo: { type: "number", convert: true, optional: true },
				mat_localizacao: { type: "string", optional: true },
				mat_vendavel: { type: "enum", values: ["SIM", "NAO"], optional: true },
				mat_status: { type: "enum", values: ["ativo", "inativo"], optional: true }
			},
			async handler(ctx) {
				const { id } = ctx.params;
				const rec = await this.adapter.findById(id);
				if (!rec) throw new Error("Material não encontrado.");
				const oldQty = rec.mat_quantidade_estoque;

				// Monta dados de update
				const updateData = {};
				[
					"mat_nome", "mat_descricao", "mat_preco",
					"mat_quantidade_estoque", "mat_estoque_minimo",
					"mat_fk_tipo", "mat_localizacao",
					"mat_vendavel", "mat_status"
				].forEach(key => {
					if (ctx.params[key] !== undefined) updateData[key] = ctx.params[key];
				});
				if (!Object.keys(updateData).length) throw new Error("Nenhum campo para atualizar.");

				// Executa update e limpa cache
				const [affected] = await this.adapter.model.update(updateData, { where: { mat_id: id } });
				if (!affected) throw new Error("Falha ao atualizar material.");
				await this.clearCache();
				const updated = await this.adapter.model.findOne({ where: { mat_id: id }, raw: true });

				// Busca nome do tipo (pode ter mudado)
				const tipoRec = await Tipo.findByPk(updated.mat_fk_tipo, { raw: true });
				const tipoNome = tipoRec ? tipoRec.tipo_nome : null;

				// Log de ajuste de estoque
				if (updateData.mat_quantidade_estoque !== undefined) {
					const diff = updated.mat_quantidade_estoque - oldQty;
					if (diff !== 0) {
						await Movimentacao.create({
							mov_fk_material: id,
							mov_material_nome: updated.mat_nome,
							mov_tipo_nome: tipoNome,
							mov_tipo: diff > 0 ? "entrada" : "saida",
							mov_quantidade: Math.abs(diff),
							mov_preco: updated.mat_preco,
							mov_descricao: `Ajuste de estoque: ${diff > 0 ? '+' : ''}${diff}`,
							mov_fk_requisicao: null
						});
					}
				}

				return { success: true, message: "Material atualizado com sucesso.", data: updated };
			}
		},

		// Apagar (marca inativo + remove) material
		// Apagar (descontar estoque ou remover) material — exige quantidade e motivo
		delete: {
			rest: "DELETE /materiais/:id",
			params: {
				id: { type: "number", convert: true },
				quantidade: { type: "number", integer: true, positive: true },
				descricao: { type: "string", min: 3, trim: true }
			},
			async handler(ctx) {
				const { id, quantidade, descricao } = ctx.params;

				return await sequelize.transaction(async tx => {
					// 1) Carrega instância
					const inst = await this.adapter.model.findByPk(id, { transaction: tx });
					if (!inst) throw new Error("Material não encontrado.");

					const estoqueAtual = Number(inst.mat_quantidade_estoque) || 0;

					// 2) Regras de quantidade
					if (quantidade > estoqueAtual) {
						throw new Error(`Quantidade solicitada (${quantidade}) maior que o estoque atual (${estoqueAtual}).`);
					}

					// 3) Busca nome do tipo (para log)
					const tipoRec = await Tipo.findByPk(inst.mat_fk_tipo, { raw: true, transaction: tx });
					const tipoNome = tipoRec ? tipoRec.tipo_nome : null;

					// 4) Grava movimentação (SAÍDA) com o motivo recebido
					await Movimentacao.create({
						mov_fk_material: id,
						mov_material_nome: inst.mat_nome,
						mov_tipo_nome: tipoNome,
						mov_tipo: "saida",
						mov_quantidade: quantidade,
						mov_preco: inst.mat_preco,
						mov_descricao: descricao,            // <-- motivo registrado aqui
						mov_fk_requisicao: null
					}, { transaction: tx });

					// 5) Auditoria/reciclagem
					const oldData = inst.toJSON();
					const newQty = estoqueAtual - quantidade;
					const newData = { ...oldData, mat_quantidade_estoque: newQty };

					await Reciclagem.create({
						reci_table: "tb_materiais",
						reci_record_id: id,
						reci_action: "delete",               // mantendo a semântica anterior
						reci_data_antiga: oldData,
						reci_data_nova: newData,
						reci_fk_user: ctx.meta.user?.id || null
					}, { transaction: tx });

					// 6) Atualiza estoque ou remove o registro se zerar
					if (newQty > 0) {
						await inst.update({ mat_quantidade_estoque: newQty }, { transaction: tx });
					} else {
						await inst.destroy({ transaction: tx });
					}

					// 7) Limpa cache
					await this.clearCache();

					return {
						success: true,
						message: newQty > 0
							? `Removidas ${quantidade} unidades. Estoque atualizado para ${newQty}.`
							: `Removidas ${quantidade} unidades. Estoque zerado — material excluído.`
					};
				});
			}
		}
	}
};
