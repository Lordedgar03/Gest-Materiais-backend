"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const { MoleculerClientError } = require("moleculer").Errors;

const sequelize = require("../config/db");
const { Op } = require("sequelize");
const { Almoco, AlunoAlmoco, Aluno } = require("../models");

module.exports = {
  name: "marcacoes",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: {},

  actions: {
    // POST /marcacoes
    marcar: {
      rest: "POST /",
      params: {
        $$strict: "remove", // ignora extras/vazios
        alu_num_processo: { type: "number", optional: true, convert: true },
        aluno_id: { type: "number", optional: true, convert: true },
        aluno_nome: { type: "string", optional: true, min: 1 },
        data: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/ },
        status: { type: "string", optional: true },
      },
      async handler(ctx) {
        const { alu_num_processo, aluno_id, aluno_nome, data, status = "" } = ctx.params;

        // 1) almoço do dia com preço herdado do último
        let almoco = await Almoco.findOne({ where: { alm_data: data } });
        if (!almoco) {
          const last = await Almoco.findOne({ order: [["alm_data", "DESC"]] });
          const ultimoPreco = Number(last?.alm_preco ?? 0);
          almoco = await Almoco.create({
            alm_data: data,
            alm_preco: ultimoPreco,
            alm_status: "aberto",
          });
        }

        // 2) resolve aluno
        let aluno = null;
        if (aluno_id != null) {
          aluno = await Aluno.findByPk(aluno_id, { raw: true });
        } else if (alu_num_processo != null) {
          aluno = await Aluno.findOne({ where: { alu_num_processo }, raw: true });
        } else if (aluno_nome) {
          const alvo = aluno_nome.trim();
          if (alvo) {
            aluno =
              (await Aluno.findOne({ where: { alu_nome: alvo }, raw: true })) ||
              (await Aluno.findOne({ where: { alu_nome: { [Op.like]: `%${alvo}%` } }, raw: true }));
          }
        }
        if (!aluno) {
          ctx.meta.$statusCode = 404;
          throw new MoleculerClientError("Aluno não encontrado para marcar almoço.", 404, "ALUNO_NAO_ENCONTRADO");
        }

        // 3) status
        const s = (status || "").toLowerCase().trim();
        const ala_status = s === "pago" ? "Pago" : "Marcado";
        const ala_pago_em = s === "pago" ? new Date() : null;

        // 4) cria marcação (ala_valor corrigido)
        try {
          const created = await AlunoAlmoco.create({
            ala_fk_aluno: aluno.alu_id,
            ala_fk_almoco: almoco.alm_id,
            ala_status,
            ala_valor: Number(almoco?.alm_preco ?? 0),
            ala_obs: null,
            ala_criado_em: new Date(),
            ala_pago_em,
          });

          ctx.meta.$statusCode = 201;
          return {
            ok: true,
            message: "Marcação criada.",
            data: {
              ala_id: created.ala_id,
              ala_status: created.ala_status,
              ala_valor: Number(created.ala_valor),
              alm_data: data,
              alu_id: aluno.alu_id,
              alu_nome: aluno.alu_nome,
              alu_num_processo: aluno.alu_num_processo,
            },
          };
        } catch (err) {
          if (err?.name === "SequelizeUniqueConstraintError" || err?.original?.code === "ER_DUP_ENTRY") {
            throw new MoleculerClientError("Aluno já está marcado para este dia.", 409, "ALREADY_MARKED");
          }
          this.logger.error("[marcacoes.marcar] Falha ao criar:", {
            name: err?.name,
            code: err?.original?.code || err?.code,
            msg: err?.message,
            data: err?.data,
          });
          throw new MoleculerClientError(err?.message || "Falha ao criar marcação.", 400, "CREATE_FAILED");
        }
      },
    },

    // POST /marcacoes/bulk
    bulk: {
      rest: "POST /bulk",
      params: {
        $$strict: "remove",
        alu_num_processo: { type: "number", optional: true, convert: true },
        aluno_id: { type: "number", optional: true, convert: true },
        aluno_nome: { type: "string", optional: true, min: 1 },
        data: { type: "string", optional: true },
        datas: { type: "array", optional: true },
        status: { type: "string", optional: true },
      },
      async handler(ctx) {
        this.logger.info("marcacoes.bulk params =>", JSON.stringify(ctx.params));

        // normaliza seletor do aluno (sem strings vazias)
        const { alu_num_processo, aluno_id } = ctx.params;
        let { aluno_nome, status } = ctx.params;
        aluno_nome = (aluno_nome || "").trim();
        status = (status || "").trim();

        const alunoSel = {};
        if (aluno_id != null && String(aluno_id) !== "") {
          alunoSel.aluno_id = Number(aluno_id);
        } else if (alu_num_processo != null && String(alu_num_processo) !== "") {
          alunoSel.alu_num_processo = Number(alu_num_processo);
        } else if (aluno_nome) {
          alunoSel.aluno_nome = aluno_nome;
        }

        if (!Object.keys(alunoSel).length) {
          throw new MoleculerClientError(
            "Informe aluno_id, alu_num_processo ou aluno_nome.",
            422,
            "VALIDATION_ERROR"
          );
        }

        // normaliza datas
        const toYMD = (v) => {
          if (!v) return null;
          if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
          if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
          if (typeof v === "string") {
            const s = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : String(v).slice(0, 10);
            return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
          }
          return null;
        };

        const list = [];
        if (Array.isArray(ctx.params.datas)) list.push(...ctx.params.datas);
        if (ctx.params.data) list.push(ctx.params.data);

        const datas = [...new Set(list.map(toYMD).filter(Boolean))];
        if (!datas.length) {
          throw new MoleculerClientError(
            "Forneça pelo menos uma data válida (YYYY-MM-DD).",
            422,
            "VALIDATION_ERROR"
          );
        }

        const criadas = [];
        const duplicadas = [];
        const falhas = [];

        for (const d of datas) {
          try {
            await ctx.call("marcacoes.marcar", {
              ...alunoSel,
              data: d,
              status: status || undefined, // não envia string vazia
            });
            criadas.push(d);
          } catch (e) {
            const name = e?.name || e?.type || "";
            const code = e?.code || e?.original?.code || "";
            const msg = e?.message || String(e);
            const stackLine = String(e?.stack || "").split("\n")[0];
            const details = e?.data;

            const isDup =
              e?.type === "ALREADY_MARKED" ||
              e?.code === 409 ||
              /SequelizeUniqueConstraintError/i.test(name) ||
              /unique|duplicate|ER_DUP_ENTRY|SQLITE_CONSTRAINT|23505/i.test((code + " " + msg).toLowerCase());

            if (isDup) {
              duplicadas.push(d);
            } else {
              falhas.push({ data: d, name, code, message: msg, details, stack: stackLine });
              this.logger.error(`[marcacoes.bulk] ${d} ->`, { name, code, msg, details, stackLine });
            }
          }
        }

        if (falhas.length || duplicadas.length) {
          ctx.meta.$statusCode = criadas.length ? 207 : 400; // parcial ou tudo falhou
        } else {
          ctx.meta.$statusCode = 201;
        }

        return {
          ok: falhas.length === 0,
          resumo: {
            criadas: criadas.length,
            duplicadas: duplicadas.length,
            erros: falhas.length,
          },
          datas_criadas: criadas,
          datas_duplicadas: duplicadas,
          falhas,
        };
      },
    },

    // PUT /marcacoes/:id
    atualizar: {
      rest: "PUT /:id",
      params: {
        $$strict: "remove",
        id: { type: "number", convert: true },
        ala_status: { type: "string", optional: true },
        alm_statusot: { type: "string", optional: true }, // alias
      },
      async handler(ctx) {
        const { id } = ctx.params;
        let novo = (ctx.params.ala_status || ctx.params.alm_statusot || "").trim().toLowerCase();

        if (novo === "pago") novo = "Pago";
        else if (novo === "cancelado") novo = "Cancelado";
        else novo = "Marcado";

        if (!["Marcado", "Pago", "Cancelado"].includes(novo)) {
          ctx.meta.$statusCode = 400;
          throw new MoleculerClientError("Status inválido.", 400, "STATUS_INVALIDO");
        }

        const inst = await AlunoAlmoco.findByPk(id);
        if (!inst) {
          ctx.meta.$statusCode = 404;
          throw new MoleculerClientError("Marcação não encontrada.", 404, "NAO_ENCONTRADA");
        }

        inst.ala_status = novo;
        inst.ala_pago_em = novo === "Pago" ? new Date() : null;
        await inst.save();

        return {
          ok: true,
          message: "Marcação atualizada.",
          data: { ala_id: inst.ala_id, ala_status: inst.ala_status },
        };
      },
    },

    // GET /marcacoes/marcados
    marcados: {
      rest: "GET /marcados",
      cache: false,
      params: {
        $$strict: "remove",
        data: { type: "string", optional: true, pattern: /^\d{4}-\d{2}-\d{2}$/ },
        aluno_nome: { type: "string", optional: true },
        num_processo: { type: "number", optional: true, convert: true },
      },
      async handler(ctx) {
        const { data, aluno_nome = "", num_processo = null } = ctx.params;
        if (!data) return [];

        const almoco = await Almoco.findOne({ where: { alm_data: data }, raw: true });
        if (!almoco) return [];

        const whereAluno = {};
        if (aluno_nome) whereAluno.alu_nome = { [Op.like]: `%${aluno_nome}%` };
        if (num_processo != null) whereAluno.alu_num_processo = Number(num_processo);

        const rows = await AlunoAlmoco.findAll({
          where: { ala_fk_almoco: almoco.alm_id },
          include: [
            {
              model: Aluno,
              as: "aluno",
              where: Object.keys(whereAluno).length ? whereAluno : undefined,
              required: !!Object.keys(whereAluno).length,
              attributes: ["alu_id", "alu_nome", "alu_num_processo", "alu_turma", "alu_ano"],
            },
          ],
          order: [[{ model: Aluno, as: "aluno" }, "alu_nome", "ASC"]],
        });

        return rows.map((r) => ({
          ala_id: r.ala_id,
          ala_status: r.ala_status,
          ala_valor: Number(r.ala_valor),
          alu_id: r.aluno?.alu_id,
          alu_nome: r.aluno?.alu_nome,
          alu_num_processo: r.aluno?.alu_num_processo,
          alu_turma: r.aluno?.alu_turma,
          alu_ano: r.aluno?.alu_ano,
        }));
      },
    },
  },
};
