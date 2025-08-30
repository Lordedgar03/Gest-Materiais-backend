// services/permission.service.js
"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const Permissao = require("../models/permissoes.model");

module.exports = {
	name: "permission",
	mixins: [DbService],
	adapter: new SequelizeAdapter(sequelize),
	// Diz ao Moleculer-DB para usar exatamente este model
	model: Permissao,

	actions: {
		/**
		 * Lista todas as permissões de um utilizador
		 * REST: GET /permissions/:userId
		 */
		listByUser: {
			rest: "GET /permissions/:userId",
			params: {
				userId: "number"
			},
			async handler(ctx) {
				// Sequelize -> SELECT * FROM tb_permissoes WHERE perm_fk_user = :userId
				return this.adapter.find({ query: { perm_fk_user: ctx.params.userId } });
			}
		}
	}
};
