// services/tipos.service.js
"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { DataTypes } = require("sequelize");

// IMPORTAÇÃO NECESSÁRIA DOS MODELS
const { TipoModel  ,Reciclagem, Material, Movimentacao } = require("../models/index");

module.exports = {
	name: "tipos",
	mixins: [DbService],
	adapter: new SequelizeAdapter(sequelize, {
		primaryKey: "tipo_id",
		raw: true
	}),
	model: {
		name: "tipo",
		define: {
			tipo_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
			tipo_nome: { type: DataTypes.STRING(100), allowNull: false },
			tipo_fk_categoria: { type: DataTypes.INTEGER, allowNull: false }
		},
		options: {
			tableName: "tb_tipos",
			timestamps: false
		}
	},

	actions: {
		// LISTAGEM
		list: {
			rest: "GET /tipos",
			cache: false,
			handler() {
				return this.adapter.find();
			}
		},

		// CRIAÇÃO
		create: {
			rest: "POST /tipos",
			params: {
				tipo_nome: { type: "string", min: 3 },
				tipo_fk_categoria: { type: "number", positive: true }
			},
			async handler(ctx) {
				const novo = await this.adapter.insert({
					tipo_nome: ctx.params.tipo_nome,
					tipo_fk_categoria: ctx.params.tipo_fk_categoria
				});
				await this.clearCache();

				// Log de reciclagem de criação
				await Reciclagem.create({
					reci_table: "tb_tipos",
					reci_record_id: novo.tipo_id,
					reci_action: "create",
					reci_data_nova: novo,
					reci_fk_user: ctx.meta.user?.id || null
				});

				return novo;
			}
		},

		// ATUALIZAÇÃO
		update: {
			rest: "PUT /tipos/:id",
			params: {
				id: { type: "number", convert: true },
				tipo_nome: { type: "string", optional: true },
				tipo_fk_categoria: { type: "number", optional: true, convert: true }
			},
			async handler(ctx) {
				const { id, tipo_nome, tipo_fk_categoria } = ctx.params;
				const rec = await this.adapter.findById(id);
				if (!rec) throw new Error("Tipo não encontrado.");

				const oldData = rec;
				const updateData = {};
				if (tipo_nome) updateData.tipo_nome = tipo_nome;
				if (tipo_fk_categoria) updateData.tipo_fk_categoria = tipo_fk_categoria;
				if (Object.keys(updateData).length === 0) throw new Error("Nenhum campo para atualizar.");

				const [affectedCount] = await this.adapter.model.update(
					updateData,
					{ where: { tipo_id: id } }
				);
				if (affectedCount === 0) throw new Error("Falha ao atualizar o tipo.");

				const updatedRec = await this.adapter.model.findOne({
					where: { tipo_id: id },
					raw: true
				});

				return {
					success: true,
					message: "Tipo atualizado com sucesso",
					data: updatedRec
				};
			}
		},

		// EXCLUSÃO COM RECICLAGEM E MOVIMENTAÇÕES
		 delete: {
      rest: "DELETE /tipos/:id",
      params: {
        id: { type: "number", convert: true }
      },
      async handler(ctx) {
        const { id } = ctx.params;

        return await sequelize.transaction(async (tx) => {
          // 1) Carrega o tipo
          const tipoInst = await this.adapter.model.findByPk(id, { transaction: tx });
          if (!tipoInst) throw new Error("Tipo não encontrado.");
          const oldTipo = tipoInst.toJSON();

          // 2) Busca todos os materiais desse tipo
          const materiais = await Material.findAll({
            where: { mat_fk_tipo: id },
            raw: true,
            transaction: tx
          });

          // 3) Para cada material, registra reciclagem e movimentação
          for (let mat of materiais) {
            // 3.1) Reciclagem do material
            await Reciclagem.create({
              reci_table:        "tb_materiais",
              reci_record_id:    mat.mat_id,
              reci_action:       "delete",
              reci_data_antiga:  mat,
              reci_data_nova:    null,
              reci_fk_user:      ctx.meta.user?.id || null
            }, { transaction: tx });

            // 3.2) Movimentação de saída do material
            await Movimentacao.create({
              mov_fk_material:    mat.mat_id,
              mov_material_nome:  mat.mat_nome,
              mov_tipo_nome:      oldTipo.tipo_nome,
              mov_tipo:           "saida",
              mov_quantidade:     mat.mat_quantidade_estoque,
              mov_preco:          mat.mat_preco,
              mov_descricao:      `Material ${mat.mat_nome} removido junto com tipo ${oldTipo.tipo_nome}`,
              mov_fk_requisicao:  null
            }, { transaction: tx });
          }

          // 4) Apaga fisicamente os materiais daquele tipo
          await Material.destroy({
            where: { mat_fk_tipo: id },
            transaction: tx
          });

          // 5) Regista reciclagem do tipo
          await Reciclagem.create({
            reci_table:        "tb_tipos",
            reci_record_id:    id,
            reci_action:       "delete",
            reci_data_antiga:  oldTipo,
            reci_data_nova:    null,
            reci_fk_user:      ctx.meta.user?.id || null
          }, { transaction: tx });

          // 6) Remove o tipo
          await tipoInst.destroy({ transaction: tx });

          // 7) Limpa cache do serviço
          await this.clearCache();

          return {
            success: true,
            message: "Tipo e seus materiais enviados para reciclagem e removidos com sucesso."
          };
        });
      }
    }
  }
};