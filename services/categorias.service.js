// services/categorias.service.js
"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { DataTypes } = require("sequelize");
const Reciclagem = require("../models/reciclagem.model");

module.exports = {
	name: "categorias",
	mixins: [DbService],
	adapter: new SequelizeAdapter(sequelize, {
		primaryKey: "cat_id",  // muda para o nome da PK das categorias
		raw: true
	}),
	model: {
		name: "categoria",
		define: {
			cat_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
			cat_nome: { type: DataTypes.STRING(50), allowNull: false }
		},
		options: {
			tableName: "tb_categorias",
			timestamps: false
		}
	},

	settings: {
		maxLimit: -1,
		
	},

	actions: {
		// GET /api/categorias
		find: {
			rest: "GET /categorias",
			cache: false,
			async handler(ctx) {
				return this.adapter.find();

			}
		},

		// GET /api/categorias/:id
		get: {
			rest: "GET /categorias/:id",
			params: {
				id: { type: "number", convert: true }
			},
			async handler(ctx) {
				const rec = await this.adapter.findById(ctx.params.id);
				if (!rec) throw new Error("Categoria não encontrada.");
				return rec;
			}
		},

		// POST /api/categorias
		criar: {
			rest: "POST /categorias",
			params: {
				cat_nome: { type: "string", min: 1 }
			},
			async handler(ctx) {
				const { cat_nome } = ctx.params;
				// evita duplicados
				if (await this.adapter.findOne({ where: { cat_nome } }))
					throw new Error("Categoria já existe.");

				// insere com o método do DbService
				const nova = await this.adapter.insert({ cat_nome });

				// regista na reciclagem
				await Reciclagem.create({
					reci_table: "tb_categorias",
					reci_record_id: nova.cat_id,
					reci_action: "create",
					reci_data_nova: nova,
					reci_fk_user: ctx.meta.user?.id || null
				});

				return nova;
			}
		},

		update: {
			rest: "PUT /categorias/:id",
			params: {
				id: { type: "number", convert: true },
				cat_nome: { type: "string", min: 1 }
			},
			async handler(ctx) {
				const { id, cat_nome } = ctx.params;

				// 1) Busca o registo
				const rec = await this.adapter.findById(id);
				if (!rec) throw new Error("Categoria não encontrada.");

				const oldData = rec;  // já é JS puro por causa do raw:true

				// 2) Executa UPDATE via Sequelize Model
				const [affected] = await this.adapter.model.update(
					{ cat_nome },
					{ where: { cat_id: id } }
				);
				if (affected === 0) throw new Error("Falha ao atualizar categoria.");


				// 4) Retorna confirmação
				const updated = await this.adapter.model.findOne({
					where: { cat_id: id },
					raw: true
				});

				return {
					success: true,
					message: "Categoria atualizada com sucesso",
					data: updated
				};
			}
		},

		remove: {
			rest: "DELETE /categorias/:id",
			params: { id: { type: "number", convert: true } },
			async handler(ctx) {
				const { id } = ctx.params;
				const rec = await this.adapter.findById(id);
				if (!rec) throw new Error("Categoria não encontrada.");

				const oldData = rec;
				await this.adapter.removeById(id);

				await Reciclagem.create({
					reci_table: "tb_categorias",
					reci_record_id: id,
					reci_action: "delete",
					reci_data_antiga: oldData,
					reci_data_nova: null,
					reci_fk_user: ctx.meta.user?.id || null
				});

				return { message: "Categoria enviada para reciclagem." };
			}
		}
	}
};
