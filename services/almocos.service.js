"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");

module.exports = {
  name: "almocos",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: {},

  actions: {
    // PATCH /almocos/preco  { novo_preco }
    atualizarPrecoPadrao: {
      rest: "PATCH /preco",
      params: { novo_preco: { type: "number", positive: true, convert: true } },
      async handler(ctx) {
        const { novo_preco } = ctx.params;
        // 1) Atualiza via SP (seu procedimento)
        await sequelize.query("CALL sp_atualizar_preco_almoco(:preco)", {
          replacements: { preco: novo_preco },
        });
        // 2) Persiste também em configurações
        await ctx.call("configuracoes.upsert", {
          cfg_chave: "ALMOCO_PRECO_PADRAO",
          cfg_valor_n: Number(novo_preco),
          cfg_valor_s: null,
        });
        return { ok: true, message: "Preço padrão atualizado." };
      },
    },

    // GET /almocos/preco-padrao -> lê de configurações
    precoPadrao: {
      rest: "GET /preco-padrao",
      cache: { ttl: 60 },
      async handler(ctx) {
        const valor = await ctx.call("configuracoes.getValue", {
          chave: "ALMOCO_PRECO_PADRAO",
          fallbackN: 0,
        });
        return { preco: Number(valor || 0) };
      },
    },

    // RELATÓRIOS via SPs existentes
    relatorioPorData: {
      rest: "GET /relatorios/por-data",
      cache: { ttl: 30 },
      params: { date: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/ } },
      async handler(ctx) {
        const { date } = ctx.params;
        const rows = await sequelize.query("CALL sp_relatorio_por_data(:date)", { replacements: { date } });
        const data = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0][0] : rows[0];
        return {
          total_almocos: Number(data?.total_almocos || 0),
          total_arrecadado: Number(data?.total_arrecadado || 0),
          date,
        };
      },
    },

    relatorioIntervalo: {
      rest: "GET /relatorios/intervalo",
      cache: { ttl: 30 },
      params: {
        inicio: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/ },
        fim: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/ },
      },
      async handler(ctx) {
        const { inicio, fim } = ctx.params;
        const rows = await sequelize.query("CALL sp_relatorio_intervalo(:ini, :fim)", {
          replacements: { ini: inicio, fim },
        });
        const data = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0][0] : rows[0];
        return {
          total_almocos: Number(data?.total_almocos || 0),
          total_arrecadado: Number(data?.total_arrecadado || 0),
          inicio,
          fim,
        };
      },
    },

    relatorioMensal: {
      rest: "GET /relatorios/mensal",
      cache: { ttl: 60 },
      params: { ano: { type: "number", convert: true }, mes: { type: "string", min: 3 } },
      async handler(ctx) {
        const { ano, mes } = ctx.params;
        const result = await sequelize.query("CALL sp_relatorio_mensal_almoços(:ano, :mes)", {
          replacements: { ano, mes },
        });

        let porTurma = [];
        let totalGeral = { Total_Geral_Arrecadado: 0 };

        if (Array.isArray(result)) {
          if (Array.isArray(result[0]) && Array.isArray(result[1])) {
            porTurma = result[0];
            totalGeral = result[1][0] || totalGeral;
          } else {
            porTurma = result[0] || result;
          }
        }

        return {
          ano,
          mes,
          porTurma,
          totalGeral: { total_arrecadado: Number(totalGeral?.Total_Geral_Arrecadado || 0) },
        };
      },
    },

    relatorioHoje: {
      rest: "GET /relatorios/hoje",
      cache: { ttl: 30 },
      async handler() {
        const result = await sequelize.query("CALL sp_relatorio_day()");
        let alunosHoje = [];
        let totais = { total_arrecadado: 0, total_almocos: 0 };

        if (Array.isArray(result)) {
          if (Array.isArray(result[0]) && Array.isArray(result[1])) {
            alunosHoje = result[0];
            const t = result[1][0] || {};
            totais = {
              total_arrecadado: Number(t?.Total_Geral_Arrecadado || 0),
              total_almocos: Number(t?.Total_Almocos || 0),
            };
          } else {
            alunosHoje = result[0] || result;
          }
        }
        return { alunosHoje, totais };
      },
    },
  },
};
