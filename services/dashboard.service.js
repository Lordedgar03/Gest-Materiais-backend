// services/dashboard.service.js
"use strict";

const { ServiceBroker } = require("moleculer");
const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { Op } = require("sequelize");

module.exports = {
	name: "dashboard",
	mixins: [DbService],
	adapter: new SequelizeAdapter(sequelize),
	model: {}, // Sem modelo associado diretamente

	actions: {
		resumo: {
			rest: "GET /dashboard/resumo",
			async handler(ctx) {
				const [users, materiais, movimentacoes, requisicoes] =
					await Promise.all([
						ctx.call("users.count", { query: { user_status: "ativo" } }),
						ctx.call("materiais.count", { query: { mat_status: "ativo" } }),
						ctx.call("movimentacoes.count"),
						ctx.call("requisicoes.count"),
					]);

				return {
					utilizadores_ativos: users,
					materiais_ativos: materiais,
					total_movimentacoes: movimentacoes,
					total_requisicoes: requisicoes,
				};
			},
		},
	},
};
