"use strict";

const DbService        = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize        = require("../config/db");
const Movimentacao     = require("../models/movimentacao.model");

module.exports = {
  name: "movimentacoes",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize, { primaryKey: "mov_id", raw: true }),
  model: Movimentacao,

  actions: {
    list: {
      rest: "GET /movimentacoes",
	  cache: false,
      handler() {
        return this.adapter.find();
      }
    },
    get: {
      rest: "GET /movimentacoes/:id",
      params: { id: "number" },
      handler(ctx) {
        return this.adapter.findById(ctx.params.id);
      }
    }
    // create/update/delete geralmente não são necessários se for só log
  }
};
