"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
// usa o sequelize + models centralizados
const {  
  Aluno,
AlunoAlmoco,
Reciclagem

} = require("../models/index");

module.exports = {
  name: "alunos",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: Aluno,

  actions: {
    // GET /api/alunos?num_processo=&nome=&numero=&turma=&ano=&status=
    list: {
      rest: "GET /",
      cache: false,
      params: {
        num_processo: { type: "number", optional: true, convert: true },
        nome: { type: "string", optional: true },
        numero: { type: "string", optional: true }, // alu_numero é VARCHAR(40)
        turma: { type: "string", optional: true },
        ano: { type: "number", optional: true, convert: true },
        status: { type: "enum", optional: true, values: ["ativo", "inativo"] },
      },
      async handler(ctx) {
        const { num_processo, nome, numero, turma, ano, status } = ctx.params || {};
        const where = {};

        if (num_processo != null) where.alu_num_processo = Number(num_processo);
        if (nome) where.alu_nome = { [Op.like]: `%${nome}%` };
        if (numero) where.alu_numero = String(numero);
        if (turma) where.alu_turma = turma;
        if (ano != null) where.alu_ano = Number(ano);
        if (status) where.alu_status = status;

        const rows = await Aluno.findAll({ where, order: [["alu_nome", "ASC"]] });
        return rows.map(r => r.toJSON());
      },
    },

    // POST /api/alunos
    create: {
      rest: "POST /",
      params: {
        alu_nome: { type: "string", min: 2 },
        alu_num_processo: { type: "number", convert: true },
        alu_numero: { type: "string", optional: true }, // VARCHAR(40)
        alu_turma: { type: "string", optional: true },
        alu_ano: { type: "number", convert: true },
        alu_status: { type: "enum", optional: true, values: ["ativo", "inativo"] },
      },
      async handler(ctx) {
        const {
          alu_nome,
          alu_num_processo,
          alu_numero = null,
          alu_turma = null,
          alu_ano,
          alu_status = "ativo",
        } = ctx.params;

        try {
          const created = await Aluno.create({
            alu_nome,
            alu_num_processo: Number(alu_num_processo),
            alu_numero: alu_numero ? String(alu_numero) : null,
            alu_turma,
            alu_ano: Number(alu_ano),
            alu_status,
          });

          await this.clearCache?.();
          return { ok: true, message: "Aluno criado.", aluno: created.toJSON() };
        } catch (e) {
          // trata possível unique de alu_num_processo, se definires no DB
          if (e?.name === "SequelizeUniqueConstraintError") {
            throw new Error("Número de processo já existe.");
          }
          throw e;
        }
      },
    },

    // PATCH /api/alunos/:id
    update: {
      rest: "PUT /alunos/:id",
      params: {
        id: { type: "number", convert: true },
        alu_nome: { type: "string", optional: true, min: 2 },
        alu_num_processo: { type: "number", optional: true, convert: true },
        alu_numero: { type: "string", optional: true },
        alu_turma: { type: "string", optional: true },
        alu_ano: { type: "number", optional: true, convert: true },
        alu_status: { type: "enum", optional: true, values: ["ativo", "inativo"] },
      },
      async handler(ctx) {
        const { id } = ctx.params;
        const inst = await Aluno.findByPk(id);
        if (!inst) throw new Error("Aluno não encontrado.");

        const {
          alu_nome,
          alu_num_processo,
          alu_numero,
          alu_turma,
          alu_ano,
          alu_status,
        } = ctx.params;

        if (alu_nome !== undefined) inst.alu_nome = alu_nome;
        if (alu_num_processo !== undefined) inst.alu_num_processo = Number(alu_num_processo);
        if (alu_numero !== undefined) inst.alu_numero = alu_numero ? String(alu_numero) : null;
        if (alu_turma !== undefined) inst.alu_turma = alu_turma || null;
        if (alu_ano !== undefined) inst.alu_ano = Number(alu_ano);
        if (alu_status !== undefined) inst.alu_status = alu_status;

        try {
          await inst.save();
          await this.clearCache?.();
          return { ok: true, message: "Aluno atualizado.", aluno: inst.toJSON() };
        } catch (e) {
          if (e?.name === "SequelizeUniqueConstraintError") {
            throw new Error("Número de processo já existe.");
          }
          throw e;
        }
      },
    },


    // === APAGAR ALUNO COM RECICLAGEM ===
    remove: {
      rest: "DELETE /:id",
      params: { id: { type: "number", convert: true } },
      async handler(ctx) {
        const { id } = ctx.params;

        return await sequelize.transaction(async (tx) => {
          // 1) Carrega o aluno
          const aluno = await Aluno.findByPk(id, { transaction: tx });
          if (!aluno) throw new Error("Aluno não encontrado.");
          const oldAluno = aluno.toJSON();

          // 2) Busca marcações ligadas a este aluno
          const marcacoes = await AlunoAlmoco.findAll({
            where: { ala_fk_aluno: id },
            raw: true,
            transaction: tx
          });

          // 3) Recicla cada marcação e apaga-as
          for (const m of marcacoes) {
            await Reciclagem.create({
              reci_table: "tb_alunos_almocos",
              reci_record_id: m.ala_id,
              reci_action: "delete",
              reci_data_antiga: m,
              reci_data_nova: null,
              reci_fk_user: ctx.meta.user?.user_id ?? null
            }, { transaction: tx });
          }
          await AlunoAlmoco.destroy({ where: { ala_fk_aluno: id }, transaction: tx });

          // 4) Recicla o próprio aluno
          await Reciclagem.create({
            reci_table: "tb_alunos",
            reci_record_id: id,
            reci_action: "delete",
            reci_data_antiga: oldAluno,
            reci_data_nova: null,
            reci_fk_user: ctx.meta.user?.user_id ?? null
          }, { transaction: tx });

          // 5) Apaga o aluno
          await aluno.destroy({ transaction: tx });

          // 6) Limpa cache do serviço, se existir
          await this.clearCache?.();

          return { ok: true, message: "Aluno removido e enviado para reciclagem." };
        });
      }
    }
  }
};
