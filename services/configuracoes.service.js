"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const Configuracao = require("../models/index");

module.exports = {
  name: "configuracoes",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: Configuracao,

  settings: {
    fields: ["cfg_id", "cfg_chave", "cfg_valor_s", "cfg_valor_n", "createdAt", "updatedAt"],
  },

  actions: {
    // GET /configuracoes -> lista todas (com cache breve)
    list: {
      rest: "GET /",
      cache: { ttl: 60 },
      async handler() {
        return Configuracao.findAll({ order: [["cfg_chave", "ASC"]], raw: true });
      },
    },

    // GET /configuracoes/:chave -> busca uma
    get: {
      rest: "GET /:chave",
      cache: { keys: ["chave"], ttl: 60 },
      params: { chave: { type: "string", min: 1 } },
      async handler(ctx) {
        const row = await Configuracao.findOne({ where: { cfg_chave: ctx.params.chave }, raw: true });
        return row || null;
      },
    },

    // GET /configuracoes/value/:chave -> devolve valor (resolve número/string e aceita fallback)
    getValue: {
      rest: "GET /value/:chave",
      cache: { keys: ["chave"], ttl: 60 },
      params: {
        chave: { type: "string", min: 1 },
        fallbackS: { type: "string", optional: true },
        fallbackN: { type: "number", optional: true, convert: true },
      },
      async handler(ctx) {
        const { chave, fallbackS = null, fallbackN = null } = ctx.params;
        const row = await Configuracao.findOne({ where: { cfg_chave: chave }, raw: true });
        if (!row) return fallbackN ?? fallbackS ?? null;
        // Se tiver número definido, prioriza número; senão string.
        if (row.cfg_valor_n != null) return Number(row.cfg_valor_n);
        if (row.cfg_valor_s != null) return row.cfg_valor_s;
        return fallbackN ?? fallbackS ?? null;
      },
    },

    // POST /configuracoes -> cria ou atualiza (UPSERT) uma chave
    upsert: {
      rest: "POST /",
      params: {
        cfg_chave: { type: "string", min: 1 },
        cfg_valor_s: { type: "string", optional: true },
        cfg_valor_n: { type: "number", optional: true, convert: true },
      },
      async handler(ctx) {
        const { cfg_chave, cfg_valor_s = null, cfg_valor_n = null } = ctx.params;
        const [row, created] = await Configuracao.findOrCreate({
          where: { cfg_chave },
          defaults: { cfg_valor_s, cfg_valor_n, createdAt: new Date(), updatedAt: new Date() },
        });
        if (!created) {
          row.cfg_valor_s = cfg_valor_s;
          row.cfg_valor_n = cfg_valor_n;
          row.updatedAt = new Date();
          await row.save();
        }
        // invalida cache da chave
        await this.broker.cacher?.del(`configuracoes.get:${cfg_chave}`);
        await this.broker.cacher?.del(`configuracoes.getValue:${cfg_chave}`);
        return { ok: true, created, data: row.get({ plain: true }) };
      },
    },

    // POST /configuracoes/bulk -> upsert em lote
    bulkUpsert: {
      rest: "POST /bulk",
      params: {
        items: { type: "array", items: "object", min: 1 },
      },
      async handler(ctx) {
        const { items } = ctx.params;
        const results = [];
        for (const it of items) {
          if (!it.cfg_chave) continue;
          const [row, created] = await Configuracao.findOrCreate({
            where: { cfg_chave: it.cfg_chave },
            defaults: {
              cfg_valor_s: it.cfg_valor_s ?? null,
              cfg_valor_n: it.cfg_valor_n ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
          if (!created) {
            row.cfg_valor_s = it.cfg_valor_s ?? null;
            row.cfg_valor_n = it.cfg_valor_n ?? null;
            row.updatedAt = new Date();
            await row.save();
          }
          await this.broker.cacher?.del(`configuracoes.get:${it.cfg_chave}`);
          await this.broker.cacher?.del(`configuracoes.getValue:${it.cfg_chave}`);
          results.push({ chave: it.cfg_chave, created });
        }
        return { ok: true, results };
      },
    },
  },
};
