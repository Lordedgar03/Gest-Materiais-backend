"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const TokenBlacklist = require("../models/tokenBlacklist.model");

module.exports = {
	name: "blacklist",
	mixins: [DbService],
	adapter: new SequelizeAdapter(sequelize),
	model: TokenBlacklist,

	actions: {
		/**
		 * Adiciona um token ao blacklist
		 * params.token      — string
		 * params.expiresAt  — ISO date string ou número ms desde epoch
		 */
		add: {
			rest: false,
			params: {
				token: { type: "string" },
				expiresAt: { type: "string" }
			},
			async handler(ctx) {
				return await this.adapter.model.create({
					token: ctx.params.token,
					expires_at: new Date(ctx.params.expiresAt)
				});
			}
		},

		/**
		 * Verifica se um token está no blacklist
		 * params.token — string
		 */
		check: {
			rest: false,
			params: { token: "string" },
			async handler(ctx) {
				return await this.adapter.model.findOne({
					where: { token: ctx.params.token }
				});
			}
		}
	}
};
