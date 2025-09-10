"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { Op, fn, col, literal } = require("sequelize");
const { Almoco, AlunoAlmoco, Aluno } = require("../models");

const today = () => new Date().toLocaleString("sv-SE").slice(0, 10);

module.exports = {
  name: "almocos",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: {},

  methods: {
    async getPrecoPadrao(ctx, fallback = 0) {
      const v = await ctx.call("configuracoes.getValue", {
        chave: "almoco.preco_padrao",
        fallbackN: fallback
      });
      return Number(v || 0);
    },

    // Garante existir o registro Almoco no dia; se não existir, cria com o preço padrão atual.
    async ensureAlmocoDoDia(ctx, dia) {
      let row = await Almoco.findOne({ where: { alm_data: dia } });
      if (!row) {
        const preco = await this.getPrecoPadrao(ctx, 0);
        row = await Almoco.create({
          alm_data: dia,
          alm_preco: Number(preco),
          alm_status: "aberto"
        });
      }
      return row;
    }
  },

  actions: {
    // PUT /almocos/preco  { preco?:number, novo_preco?:number, data?:YYYY-MM-DD, aplicar_no_dia?:boolean }
    // Define o preço PADRÃO (chave de configuração). Opcionalmente aplica no dia informado (atualiza/insere snapshot desse dia).
    atualizarPrecoPadrao: {
      rest: "PUT /preco",
      params: {
        preco: { type: "number", optional: true, convert: true, positive: true },
        novo_preco: { type: "number", optional: true, convert: true, positive: true },
        data: { type: "string", optional: true, pattern: /^\d{4}-\d{2}-\d{2}$/ },
        aplicar_no_dia: { type: "boolean", optional: true, convert: true }
      },
      async handler(ctx) {
        const dia = ctx.params.data || null;
        const valor = ctx.params.preco ?? ctx.params.novo_preco;
        if (!(Number.isFinite(valor) && Number(valor) > 0)) {
          ctx.meta.$statusCode = 422;
          throw new Error("Preço inválido.");
        }
        const novo = Number(valor);

        // 1) Atualiza FONTE DE VERDADE
        await ctx.call("configuracoes.upsert", {
          cfg_chave: "almoco.preco_padrao",
          cfg_valor_n: novo
        });

        // 2) Opcionalmente, aplica no snapshot do dia informado
        let aplicado = null;
        if (dia && ctx.params.aplicar_no_dia) {
          const [row, created] = await Almoco.findOrCreate({
            where: { alm_data: dia },
            defaults: { alm_data: dia, alm_preco: novo, alm_status: "aberto" }
          });
          if (!created) {
            row.alm_preco = novo;
            await row.save();
          }
          aplicado = { dia, preco: novo };
        }

        return {
          ok: true,
          message: "Preço padrão atualizado.",
          preco_padrao: novo,
          aplicado
        };
      }
    },

    // GET /almocos/preco-padrao  -> devolve a fonte de verdade (configuração) e o preço do dia se já existir snapshot
    precoPadrao: {
      rest: "GET /preco-padrao",
      cache: false,
      async handler(ctx) {
        const t = today();
        const padrao = await this.getPrecoPadrao(ctx, 0);
        const row = await Almoco.findOne({ where: { alm_data: t }, raw: true });
        return {
          data: t,
          preco_padrao: Number(padrao),
          preco_hoje: Number(row?.alm_preco ?? padrao)
        };
      }
    },

    // PUT /almocos/preco-dia  { data: YYYY-MM-DD, preco: number }
    // Ajusta o snapshot de UM dia específico, sem mexer no preço padrão global.
    atualizarPrecoDoDia: {
      rest: "PUT /preco-dia",
      params: {
        data: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/ },
        preco: { type: "number", convert: true, positive: true }
      },
      async handler(ctx) {
        const { data, preco } = ctx.params;
        const [row, created] = await Almoco.findOrCreate({
          where: { alm_data: data },
          defaults: { alm_data: data, alm_preco: Number(preco), alm_status: "aberto" }
        });
        if (!created) {
          row.alm_preco = Number(preco);
          await row.save();
        }
        return { ok: true, data, preco: Number(preco) };
      }
    },

    // GET /almocos/relatorios/por-data?date=YYYY-MM-DD
    relatorioPorData: {
      rest: "GET /relatorios/por-data",
      cache: false,
      params: { date: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/ } },
      async handler(ctx) {
        const { date } = ctx.params;
        const almoco = await Almoco.findOne({ where: { alm_data: date }, raw: true });
        if (!almoco) return { total_almocos: 0, total_arrecadado: 0, date };

        const agg = await AlunoAlmoco.findAll({
          where: { ala_fk_almoco: almoco.alm_id },
          attributes: [
            [fn("COUNT", col("ala_id")), "qtd"],
            [fn("SUM", literal("CASE WHEN ala_status='Pago' THEN ala_valor ELSE 0 END")), "total_pago"]
          ],
          raw: true
        });
        const r = agg[0] || {};
        return {
          total_almocos: Number(r.qtd || 0),
          total_arrecadado: Number(r.total_pago || 0),
          date
        };
      }
    },

    // GET /almocos/relatorios/intervalo?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
    relatorioIntervalo: {
      rest: "GET /relatorios/intervalo",
      cache: false,
      params: {
        inicio: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/ },
        fim: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/ }
      },
      async handler(ctx) {
        const { inicio, fim } = ctx.params;
        const ids = (
          await Almoco.findAll({
            where: { alm_data: { [Op.between]: [inicio, fim] } },
            attributes: ["alm_id"],
            raw: true
          })
        ).map((x) => x.alm_id);

        if (ids.length === 0) return { total_almocos: 0, total_arrecadado: 0, inicio, fim };

        const agg = await AlunoAlmoco.findAll({
          where: { ala_fk_almoco: { [Op.in]: ids } },
          attributes: [
            [fn("COUNT", col("ala_id")), "qtd"],
            [fn("SUM", literal("CASE WHEN ala_status='Pago' THEN ala_valor ELSE 0 END")), "total_pago"]
          ],
          raw: true
        });
        const r = agg[0] || {};
        return {
          total_almocos: Number(r.qtd || 0),
          total_arrecadado: Number(r.total_pago || 0),
          inicio,
          fim
        };
      }
    },

    // GET /almocos/relatorios/mensal?ano=2025&mes=setembro|09
    relatorioMensal: {
      rest: "GET /relatorios/mensal",
      cache: false,
      params: { ano: { type: "number", convert: true }, mes: { type: "string", min: 2 } },
      async handler(ctx) {
        const { ano } = ctx.params;
        const m = ctx.params.mes.toLowerCase();
        const map = {
          "1": 1, "01": 1, jan: 1, janeiro: 1,
          "2": 2, "02": 2, fev: 2, fevereiro: 2,
          "3": 3, "03": 3, mar: 3, março: 3, marco: 3,
          "4": 4, "04": 4, abr: 4, abril: 4,
          "5": 5, maio: 5,
          "6": 6, jun: 6, junho: 6,
          "7": 7, jul: 7, julho: 7,
          "8": 8, ago: 8, agosto: 8,
          "9": 9, "09": 9, set: 9, setembro: 9,
          "10": 10, out: 10, outubro: 10,
          "11": 11, nov: 11, novembro: 11,
          "12": 12, dez: 12, dezembro: 12
        };
        const mm = map[m];
        if (!mm) {
          ctx.meta.$statusCode = 422;
          throw new Error("Mês inválido.");
        }

        const inicio = new Date(Date.UTC(ano, mm - 1, 1)).toISOString().slice(0, 10);
        const fim = new Date(Date.UTC(ano, mm, 0)).toISOString().slice(0, 10);

        const ids = (
          await Almoco.findAll({
            where: { alm_data: { [Op.between]: [inicio, fim] } },
            attributes: ["alm_id"],
            raw: true
          })
        ).map((x) => x.alm_id);

        if (ids.length === 0) return { ano, mes: ctx.params.mes, porTurma: [], totalGeral: { total_arrecadado: 0 } };

        const rows = await AlunoAlmoco.findAll({
          where: { ala_fk_almoco: { [Op.in]: ids }, ala_status: "Pago" },
          include: [{ model: Aluno, as: "aluno", attributes: ["alu_turma"] }],
          attributes: [[fn("SUM", col("ala_valor")), "total"], [fn("COUNT", col("ala_id")), "qtd"]],
          group: ["aluno.alu_turma"],
          raw: true
        });

        const porTurma = rows.map((r) => ({
          turma: r["aluno.alu_turma"] || "-",
          qtd: Number(r.qtd || 0),
          total: Number(r.total || 0)
        }));
        const totalGeral = { total_arrecadado: porTurma.reduce((s, x) => s + x.total, 0) };

        return { ano, mes: ctx.params.mes, porTurma, totalGeral };
      }
    },

    // GET /almocos/relatorios/hoje
    relatorioHoje: {
      rest: "GET /relatorios/hoje",
      cache: false,
      async handler(ctx) {
        const d = today();
        const almoco = await Almoco.findOne({ where: { alm_data: d }, raw: true });
        if (!almoco) return { alunosHoje: [], totais: { total_arrecadado: 0, total_almocos: 0 } };

        const alunosHoje = await AlunoAlmoco.findAll({
          where: { ala_fk_almoco: almoco.alm_id },
          include: [{ model: Aluno, as: "aluno", attributes: ["alu_nome", "alu_num_processo", "alu_turma"] }],
          order: [[{ model: Aluno, as: "aluno" }, "alu_nome", "ASC"]]
        });

        const totaisAgg = await AlunoAlmoco.findAll({
          where: { ala_fk_almoco: almoco.alm_id },
          attributes: [
            [fn("COUNT", col("ala_id")), "qtd"],
            [fn("SUM", literal("CASE WHEN ala_status='Pago' THEN ala_valor ELSE 0 END")), "total_pago"]
          ],
          raw: true
        });
        const t = totaisAgg[0] || {};

        return {
          alunosHoje: alunosHoje.map((r) => ({
            ala_id: r.ala_id,
            ala_status: r.ala_status,
            ala_valor: Number(r.ala_valor),
            alu_nome: r.aluno?.alu_nome,
            alu_num_processo: r.aluno?.alu_num_processo,
            alu_turma: r.aluno?.alu_turma
          })),
          totais: { total_arrecadado: Number(t.total_pago || 0), total_almocos: Number(t.qtd || 0) }
        };
      }
    }
  }
};
