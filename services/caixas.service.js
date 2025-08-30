"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { DataTypes } = require("sequelize");

const { Venda } = require("../models"); // para fechar caixa somando vendas pagas

module.exports = {
    name: "caixas",
    mixins: [DbService],

    adapter: new SequelizeAdapter(sequelize, {
        primaryKey: "cx_id",
        raw: true
    }),

    model: {
        name: "caixa",
        define: {
            cx_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            cx_data: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
            cx_status: { type: DataTypes.ENUM("Aberto", "Fechado"), allowNull: false, defaultValue: "Aberto" },
            cx_aberto_por: { type: DataTypes.INTEGER, allowNull: false },
            cx_aberto_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            cx_saldo_inicial: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
            cx_qtd_vendas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            cx_total_vendas: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
            cx_saldo_final: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
            cx_fechado_por: { type: DataTypes.INTEGER, allowNull: true },
            cx_fechado_em: { type: DataTypes.DATE, allowNull: true },
            cx_obs: { type: DataTypes.STRING(255), allowNull: true }
        },
        options: {
            tableName: "tb_caixas",
            timestamps: false
        }
    },

    actions: {
        /**
         * POST /caixas/abrir
         * Body: { saldo_inicial?: number, obs?: string }
         */
        abrir: {
            rest: "POST /caixas/abrir",
            params: {
                saldo_inicial: { type: "number", convert: true, optional: true },
                obs: { type: "string", optional: true }
            },
            async handler(ctx) {
                const userId = this._getUserId(ctx);
                if (!userId) throw new Error("Autenticação necessária.");

                const hoje = this._hoje();
                // Existe caixa do dia?
                const existente = await this.adapter.model.findOne({ where: { cx_data: hoje }, raw: true });
                if (existente) {
                    if (existente.cx_status === "Fechado") {
                        throw new Error("O caixa de hoje já foi fechado.");
                    }
                    return { success: true, message: "Caixa já aberto.", data: existente };
                }

                const created = await this.adapter.model.create({
                    cx_data: hoje,
                    cx_status: "Aberto",
                    cx_aberto_por: userId,
                    cx_aberto_em: new Date(),
                    cx_saldo_inicial: ctx.params.saldo_inicial || 0,
                    cx_obs: ctx.params.obs || null
                });

                return { success: true, message: "Caixa aberto.", data: created.toJSON ? created.toJSON() : created };
            }
        },

        /**
         * GET /caixas/aberto
         * Retorna o caixa aberto do dia
         */
        aberto: {
            rest: "GET /caixas/hoje",
            async handler() {
                const hoje = this._hoje();
                const cx = await this.adapter.model.findOne({ where: { cx_data: hoje }, raw: true });
                return cx || null;
            }
        },
        /**
         * POST /caixas/fechar
         * Fecha o caixa do dia (soma vendas pagas)
         */
        fechar: {
            rest: "POST /caixas/fechar",
            async handler(ctx) {
                const userId = this._getUserId(ctx);
                if (!userId) throw new Error("Autenticação necessária.");

                const hoje = this._hoje();
                return sequelize.transaction(async tx => {
                    const cx = await this.adapter.model.findOne({
                        where: { cx_data: hoje, cx_status: "Aberto" },
                        transaction: tx,
                        raw: true
                    });
                    if (!cx) throw new Error("Nenhum caixa aberto hoje.");

                    const vendas = await Venda.findAll({
                        where: { ven_fk_caixa: cx.cx_id, ven_status: "Paga" },
                        transaction: tx,
                        raw: true
                    });

                    const qtd = vendas.length;
                    const total = vendas.reduce((s, v) => s + Number(v.ven_total || 0), 0);
                    const saldoFinal = Number(cx.cx_saldo_inicial || 0) + total;

                    await this.adapter.model.update({
                        cx_qtd_vendas: qtd,
                        cx_total_vendas: total,
                        cx_saldo_final: saldoFinal,
                        cx_status: "Fechado",
                        cx_fechado_por: userId,
                        cx_fechado_em: new Date()
                    }, { where: { cx_id: cx.cx_id }, transaction: tx });

                    const fechado = await this.adapter.model.findByPk(cx.cx_id, { transaction: tx, raw: true });
                    return { success: true, message: "Caixa fechado.", data: fechado };
                });
            }
        }
    },

    methods: {
        _getUserId(ctx) {
            const u = ctx?.meta?.user || {};
            return u.id ?? u.user_id ?? u.userId ?? null;
        },
        _hoje() {
            // YYYY-MM-DD local (sem timezone avançado)
            const d = new Date();
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${yyyy}-${mm}-${dd}`;
        }
    }
};
