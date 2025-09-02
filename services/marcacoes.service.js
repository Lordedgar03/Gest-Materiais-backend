"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");

module.exports = {
  name: "marcacoes",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: {},

  actions: {
    // POST /marcacoes  { aluno_nome, data (YYYY-MM-DD), status? }
    marcar: {
      rest: "POST /",
      params: {
        aluno_nome: { type: "string", min: 2 },
        data: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/ },
        status: { type: "string", optional: true }, // "pago" | "não pago" | etc.
      },
      async handler(ctx) {
        const { aluno_nome, data } = ctx.params;

        // 1) Checa toggle de marcações
        const habilitada = await ctx.call("configuracoes.getValue", {
          chave: "ALMOCO_MARCACAO_HABILITADA",
          fallbackN: 1,
        });
        if (Number(habilitada) === 0) throw new Error("Marcações de almoço estão desativadas.");

        // 2) (Opcional) Checa limite diário, se existir
        const limite = await ctx.call("configuracoes.getValue", {
          chave: "ALMOCO_LIMITE_DIARIO",
          fallbackN: null,
        });
        if (limite != null) {
          // Usa seu procedure de “almoços por data” para contar marcados do dia
          const rows = await sequelize.query("CALL sp_relatorio_por_data(:date)", { replacements: { date: data } });
          const dataDia = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0][0] : rows[0];
          const total = Number(dataDia?.total_almocos || 0);
          if (total >= Number(limite)) throw new Error("Limite diário de marcações atingido.");
        }

        // 3) Status padrão (se não informado)
        const status = ctx.params.status ?? (await ctx.call("configuracoes.getValue", {
          chave: "ALMOCO_STATUS_PADRAO",
          fallbackS: "não pago",
        }));

        // 4) Chama procedure para efetivar marcação
        await sequelize.query("CALL sp_ADD_almoco(:aluno, :date_add, :statusot)", {
          replacements: {
            aluno: aluno_nome,
            date_add: data,
            statusot: status,
          },
        });

        return { ok: true, message: "Marcação criada." };
      },
    },

    // PATCH /marcacoes/:id  { alm_statusot?, alm_date_add?, alm_presenca? }
    atualizar: {
      rest: "PATCH /:id",
      params: {
        id: { type: "number", convert: true },
        alm_statusot: { type: "string", optional: true },
        alm_date_add: { type: "string", optional: true, pattern: /^\d{4}-\d{2}-\d{2}$/ },
        alm_presenca: { type: "string", optional: true },
      },
      async handler(ctx) {
        const { id, alm_statusot = null, alm_date_add = null, alm_presenca = null } = ctx.params;
        await sequelize.query("CALL sp_atualizar_almoco(:id, :statusot, :date_add, :presenca)", {
          replacements: {
            id,
            statusot: alm_statusot,
            date_add: alm_date_add,
            presenca: alm_presenca,
          },
        });
        return { ok: true, message: "Marcação atualizada." };
      },
    },

    // GET /marcacoes/marcados?aluno_nome=&data=
    marcados: {
      rest: "GET /marcados",
      cache: { ttl: 30 },
      params: {
        aluno_nome: { type: "string", optional: true },
        data: { type: "string", optional: true, pattern: /^\d{4}-\d{2}-\d{2}$/ },
      },
      async handler(ctx) {
        const { aluno_nome = null, data = null } = ctx.params || {};
        const rows = await sequelize.query("CALL sp_ver_almoços_marcados(:nome, :data)", {
          replacements: { nome: aluno_nome, data },
        });
        return Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
      },
    },
  },
};
