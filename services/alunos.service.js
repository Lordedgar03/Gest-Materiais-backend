"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");

module.exports = {
  name: "alunos",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: {},

  actions: {
    list: {
      rest: "GET /",
      cache: { ttl: 30 },
      params: {
        num_processo: { type: "number", optional: true, convert: true },
        nome: { type: "string", optional: true },
        numero: { type: "number", optional: true, convert: true },
        turma: { type: "string", optional: true },
        ano: { type: "number", optional: true, convert: true },
      },
      async handler(ctx) {
        const { num_processo = null, nome = null, numero = null, turma = null, ano = null } = ctx.params || {};
        const rows = await sequelize.query("CALL sp_SearchAlunos(:num_proc, :nome, :numero, :turma, :ano)", {
          replacements: { num_proc: num_processo, nome, numero, turma, ano },
        });
        return Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
      },
    },

    create: {
      rest: "POST /",
      params: {
        alu_nome: { type: "string", min: 2 },
        alu_num_processo: { type: "number", convert: true },
        alu_numero: { type: "number", optional: true, convert: true },
        alu_turma: { type: "string", min: 1 },
        alu_ano: { type: "number", convert: true },
      },
      async handler(ctx) {
        const { alu_nome, alu_num_processo, alu_numero = null, alu_turma, alu_ano } = ctx.params;
        await sequelize.query("CALL sp_ADDalunos(:nome, :num_proc, :numero, :turma, :ano)", {
          replacements: { nome: alu_nome, num_proc: alu_num_processo, numero: alu_numero, turma: alu_turma, ano: alu_ano },
        });
        return { ok: true, message: "Aluno criado." };
      },
    },

    update: {
      rest: "PATCH /:id",
      params: {
        id: { type: "number", convert: true },
        alu_num_processo: { type: "number", optional: true, convert: true },
        alu_nome: { type: "string", optional: true, min: 2 },
        alu_numero: { type: "number", optional: true, convert: true },
        alu_turma: { type: "string", optional: true },
        alu_ano: { type: "number", optional: true, convert: true },
      },
      async handler(ctx) {
        const { id, alu_num_processo = null, alu_nome = null, alu_numero = null, alu_turma = null, alu_ano = null } = ctx.params;
        await sequelize.query("CALL sp_UpdadteAluno(:id, :num_proc, :nome, :numero, :turma, :ano)", {
          replacements: { id, num_proc: alu_num_processo, nome: alu_nome, numero: alu_numero, turma: alu_turma, ano: alu_ano },
        });
        return { ok: true, message: "Aluno atualizado." };
      },
    },

    setStatus: {
      rest: "PATCH /:id/status",
      params: { id: { type: "number", convert: true }, status: { type: "enum", values: ["ativo", "inativo"] } },
      async handler(ctx) {
        const { id, status } = ctx.params;
        await sequelize.query("CALL sp_update_status(:id, :status)", { replacements: { id, status } });
        return { ok: true, message: "Status do aluno atualizado." };
      },
    },
  },
};
