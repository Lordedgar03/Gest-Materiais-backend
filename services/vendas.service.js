"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { DataTypes, Op } = require("sequelize");

const {
    Material,
    Tipo,
    Movimentacao,
    Recibo,
    VendaItem
} = require("../models"); // header usaremos via this.adapter.model

module.exports = {
    name: "vendas",
    mixins: [DbService],

    adapter: new SequelizeAdapter(sequelize, {
        primaryKey: "ven_id",
        raw: true
    }),

    model: {
        name: "venda",
        define: {
            ven_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            ven_codigo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
            ven_fk_caixa: { type: DataTypes.INTEGER, allowNull: false },
            ven_fk_user: { type: DataTypes.INTEGER, allowNull: false },
            ven_cliente_nome: { type: DataTypes.STRING(120), allowNull: false },
            ven_status: { type: DataTypes.ENUM("Aberta", "Paga", "Cancelada", "Estornada"), allowNull: false, defaultValue: "Aberta" },
            ven_subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
            ven_desconto: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
            ven_total: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
            ven_obs: { type: DataTypes.STRING(255), allowNull: true },
            ven_data: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
            updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        },
        options: {
            tableName: "tb_vendas",
            timestamps: false
        }
    },

    actions: {
        /**
         * GET /vendas
         * Query: status?, data_ini?, data_fim?, caixa?
         */
        // dentro de module.exports.actions
        list: {
            rest: "GET /vendas",
            cache: false,
            params: {
                q: { type: "string", optional: true },                                   // pesquisa (código/cliente)
                status: { type: "string", optional: true, enum: ["Todos", "Aberta", "Paga", "Cancelada", "Estornada"] },
                caixa: { type: "number", convert: true, optional: true },
                from: { type: "string", optional: true },                                 // aceitamos from/to...
                to: { type: "string", optional: true },
                data_ini: { type: "string", optional: true },                             // ...e também data_ini/data_fim (retrocompat)
                data_fim: { type: "string", optional: true }
            },
            async handler(ctx) {
                const where = {};

                // status
                if (ctx.params.status && ctx.params.status !== "Todos") {
                    where.ven_status = ctx.params.status;
                }

                // caixa (opcional)
                if (ctx.params.caixa) where.ven_fk_caixa = Number(ctx.params.caixa);

                // datas (from/to ou data_ini/data_fim)
                const from = ctx.params.from || ctx.params.data_ini;
                const to = ctx.params.to || ctx.params.data_fim;
                if (from || to) {
                    where.ven_data = {};
                    if (from) where.ven_data[Op.gte] = new Date(from + "T00:00:00");
                    if (to) where.ven_data[Op.lte] = new Date(to + "T23:59:59");
                }

                // busca textual (q) em código e nome do cliente
                const q = (ctx.params.q || "").trim();
                if (q) {
                    const rows = await this.adapter.model.findAll({
                        where: {
                            ...where,
                            [Op.or]: [
                                { ven_codigo: { [Op.like]: `%${q}%` } },
                                { ven_cliente_nome: { [Op.like]: `%${q}%` } }
                            ]
                        },
                        order: [["ven_id", "DESC"]]
                    });
                    return rows.map(r => (r.toJSON ? r.toJSON() : r));
                }

                // sem 'q': pode usar o helper do adapter
                return this.adapter.find({ query: where, sort: ["-ven_id"] });
            }
        },

        /**
         * GET /vendas/:id  (inclui itens)
         */
        get: {
            rest: "GET /vendas/:id",
            params: { id: { type: "number", convert: true } },
            async handler(ctx) {
                const id = Number(ctx.params.id);
                const header = await this.adapter.model.findByPk(id, { raw: true });
                if (!header) throw new Error("Venda não encontrada.");

                const itens = await VendaItem.findAll({ where: { vni_fk_venda: id }, raw: true });
                return { ...header, itens };
            }
        },

        /**
         * POST /vendas
         * Body: { ven_cliente_nome, ven_obs? }
         * exige caixa do dia aberto (service caixas)
         */
        create: {
            rest: "POST /vendas",
            params: {
                ven_cliente_nome: { type: "string", min: 1 },
                ven_obs: { type: "string", optional: true }
            },
            async handler(ctx) {
                const userId = this._getUserId(ctx);
                if (!userId) throw new Error("Autenticação necessária.");

                // caixa aberto hoje
                const cx = await ctx.call("caixas.aberto").catch(() => null);
                if (!cx) throw new Error("Abra o caixa do dia antes de registrar vendas.");

                return sequelize.transaction(async tx => {
                    const inst = await this.adapter.model.create({
                        ven_codigo: "TEMP",
                        ven_fk_caixa: cx.cx_id,
                        ven_fk_user: userId,
                        ven_cliente_nome: ctx.params.ven_cliente_nome,
                        ven_status: "Aberta",
                        ven_obs: ctx.params.ven_obs || null,
                        ven_subtotal: 0, ven_desconto: 0, ven_total: 0
                    }, { transaction: tx });

                    const codigo = `VEN-${String(inst.ven_id).padStart(6, "0")}`;
                    await this.adapter.model.update({ ven_codigo: codigo }, { where: { ven_id: inst.ven_id }, transaction: tx });

                    return { success: true, message: "Venda aberta.", data: { ...inst.toJSON(), ven_codigo: codigo } };
                });
            }
        },

        /**
         * POST /vendas/:id/itens
         * Body: { material_id, quantidade }
         * Adiciona item (preço = mat_preco no momento). Só se venda estiver 'Aberta'.
         */
        addItem: {
            rest: "POST /vendas/:id/itens",
            params: {
                id: { type: "number", convert: true, positive: true },
                material_id: { type: "number", convert: true, positive: true },
                quantidade: { type: "number", convert: true, positive: true }
            },
            async handler(ctx) {
                const { id, material_id, quantidade } = ctx.params;

                return sequelize.transaction(async tx => {
                    const venda = await this.adapter.model.findByPk(id, { transaction: tx });
                    if (!venda) throw new Error("Venda não encontrada.");
                    if (venda.ven_status !== "Aberta") throw new Error("Somente vendas 'Aberta' aceitam itens.");

                    const mat = await Material.findByPk(material_id, { raw: true, transaction: tx });
                    if (!mat) throw new Error("Material não encontrado.");
                    if (mat.mat_status !== "ativo" || mat.mat_vendavel !== "SIM")
                        throw new Error("Material indisponível para venda.");

                    const preco = Number(mat.mat_preco || 0);
                    const total = this._round2(preco * Number(quantidade));

                    await VendaItem.create({
                        vni_fk_venda: id,
                        vni_fk_material: material_id,
                        vni_qtd: quantidade,
                        vni_preco_unit: preco,
                        vni_total: total
                    }, { transaction: tx });

                    await this._recalcTotals(id, tx);

                    const itens = await VendaItem.findAll({ where: { vni_fk_venda: id }, raw: true, transaction: tx });
                    return { success: true, message: "Item adicionado.", data: { venda: venda.toJSON(), itens } };
                });
            }
        },

        /**
         * DELETE /vendas/:id/itens/:itemId
         */
        removeItem: {
            rest: "DELETE /vendas/:id/itens/:itemId",
            params: {
                id: { type: "number", convert: true, positive: true },
                itemId: { type: "number", convert: true, positive: true }
            },
            async handler(ctx) {
                const { id, itemId } = ctx.params;
                return sequelize.transaction(async tx => {
                    const venda = await this.adapter.model.findByPk(id, { transaction: tx });
                    if (!venda) throw new Error("Venda não encontrada.");
                    if (venda.ven_status !== "Aberta") throw new Error("Somente vendas 'Aberta' permitem excluir itens.");

                    const del = await VendaItem.destroy({ where: { vni_id: itemId, vni_fk_venda: id }, transaction: tx });
                    if (!del) throw new Error("Item não encontrado nesta venda.");

                    await this._recalcTotals(id, tx);

                    const itens = await VendaItem.findAll({ where: { vni_fk_venda: id }, raw: true, transaction: tx });
                    return { success: true, message: "Item removido.", data: { venda: venda.toJSON(), itens } };
                });
            }
        },

        /**
         * POST /vendas/:id/desconto
         * Body: { desconto }
         */
        desconto: {
            rest: "POST /vendas/:id/desconto",
            params: {
                id: { type: "number", convert: true, positive: true },
                desconto: { type: "number", convert: true, min: 0 }
            },
            async handler(ctx) {
                const { id, desconto } = ctx.params;
                return sequelize.transaction(async tx => {
                    const venda = await this.adapter.model.findByPk(id, { transaction: tx });
                    if (!venda) throw new Error("Venda não encontrada.");
                    if (venda.ven_status !== "Aberta") throw new Error("Somente vendas 'Aberta' aceitam desconto.");

                    await this._recalcTotals(id, tx, desconto);

                    const updated = await this.adapter.model.findByPk(id, { transaction: tx, raw: true });
                    return { success: true, message: "Desconto aplicado.", data: updated };
                });
            }
        },

        /**
         * POST /vendas/:id/pagar
         * Finaliza venda: baixa estoque, cria movimentações, gera recibo.
         */
        // ... dentro de actions:
        pagar: {
            rest: "POST /vendas/:id/pagar",
            params: { id: { type: "number", convert: true, positive: true } },
            async handler(ctx) {
                const { id } = ctx.params;

                return sequelize.transaction(async tx => {
                    const venda = await this.adapter.model.findByPk(id, { transaction: tx });
                    if (!venda) throw new Error("Venda não encontrada.");
                    if (venda.ven_status !== "Aberta") throw new Error("Somente vendas 'Aberta' podem ser pagas.");

                    const itens = await VendaItem.findAll({ where: { vni_fk_venda: id }, raw: true, transaction: tx });
                    if (!itens.length) throw new Error("Venda sem itens.");

                    // recalcula totais + foto atual da venda
                    await this._recalcTotals(id, tx);
                    const vendaNow = await this.adapter.model.findByPk(id, { transaction: tx, raw: true });

                    // baixa de estoque + movimentações
                    for (const it of itens) {
                        const mat = await Material.findByPk(it.vni_fk_material, { raw: true, transaction: tx });
                        if (!mat) throw new Error(`Material ${it.vni_fk_material} não encontrado.`);
                        if (mat.mat_status !== "ativo" || mat.mat_vendavel !== "SIM")
                            throw new Error(`Material indisponível p/ venda: ${mat.mat_nome}`);

                        const novo = Number(mat.mat_quantidade_estoque) - Number(it.vni_qtd);
                        if (novo < 0) throw new Error(`Estoque insuficiente: ${mat.mat_nome}`);

                        await Material.update(
                            { mat_quantidade_estoque: novo },
                            { where: { mat_id: mat.mat_id }, transaction: tx }
                        );

                        let tipoNome = "";
                        if (mat.mat_fk_tipo) {
                            const tipo = await Tipo.findByPk(mat.mat_fk_tipo, { raw: true, transaction: tx });
                            tipoNome = tipo ? (tipo.tipo_nome || "") : "";
                        }

                        await Movimentacao.create({
                            mov_fk_material: mat.mat_id,
                            mov_material_nome: mat.mat_nome,
                            mov_tipo_nome: tipoNome,
                            mov_tipo: "saida",
                            mov_quantidade: it.vni_qtd,
                            mov_data: new Date(),
                            mov_descricao: `Venda ${vendaNow.ven_codigo}`,
                            mov_preco: it.vni_preco_unit,
                            mov_fk_requisicao: null,
                            mov_fk_venda: vendaNow.ven_id
                        }, { transaction: tx });
                    }

                    // fecha venda
                    await this.adapter.model.update(
                        { ven_status: "Paga" },
                        { where: { ven_id: id }, transaction: tx }
                    );

                    // cria recibo
                    const rec = await Recibo.create({
                        rec_fk_user: venda.ven_fk_user,
                        rec_tipo: "Venda de Material",
                        rec_total: vendaNow.ven_total,
                        rec_ref: vendaNow.ven_codigo,
                        rec_fk_venda: vendaNow.ven_id,
                        rec_cliente_nome: vendaNow.ven_cliente_nome,
                        data: new Date()
                    }, { transaction: tx });

                    // devolve dados para o front imprimir
                    return {
                        success: true,
                        message: "Venda paga e estoque atualizado.",
                        venda: {
                            ven_id: vendaNow.ven_id,
                            ven_codigo: vendaNow.ven_codigo,
                            ven_total: vendaNow.ven_total
                        },
                        recibo: {
                            rec_id: rec.rec_id,
                            // dica de URL (o front já sabe usar isso se existir)
                            pdf_hint: `/api/vendas/${vendaNow.ven_id}/recibo/pdf`
                        }
                    };
                });
            }
        },

        /**
         * POST /vendas/:id/cancelar
         * - Aberta → Cancelada (sem mexer no estoque)
         * - Paga   → Estornada (devolve estoque e registra entrada)
         */
        cancelar: {
            rest: "POST /vendas/:id/cancelar",
            params: { id: { type: "number", convert: true, positive: true } },
            async handler(ctx) {
                const { id } = ctx.params;

                return sequelize.transaction(async tx => {
                    const venda = await this.adapter.model.findByPk(id, { transaction: tx });
                    if (!venda) throw new Error("Venda não encontrada.");

                    if (venda.ven_status === "Aberta") {
                        await this.adapter.model.update({ ven_status: "Cancelada" }, { where: { ven_id: id }, transaction: tx });
                        return { success: true, message: "Venda cancelada." };
                    }

                    if (venda.ven_status === "Paga") {
                        const itens = await VendaItem.findAll({ where: { vni_fk_venda: id }, raw: true, transaction: tx });

                        for (const it of itens) {
                            const mat = await Material.findByPk(it.vni_fk_material, { raw: true, transaction: tx });
                            if (!mat) continue;

                            await Material.update(
                                { mat_quantidade_estoque: Number(mat.mat_quantidade_estoque) + Number(it.vni_qtd) },
                                { where: { mat_id: mat.mat_id }, transaction: tx }
                            );

                            // tipo nome opcional
                            let tipoNome = "";
                            if (mat.mat_fk_tipo) {
                                const tipo = await Tipo.findByPk(mat.mat_fk_tipo, { raw: true, transaction: tx });
                                tipoNome = tipo ? (tipo.tipo_nome || "") : "";
                            }

                            await Movimentacao.create({
                                mov_fk_material: mat.mat_id,
                                mov_material_nome: mat.mat_nome,
                                mov_tipo_nome: tipoNome,
                                mov_tipo: "entrada",
                                mov_quantidade: it.vni_qtd,
                                mov_data: new Date(),
                                mov_descricao: `Estorno venda ${venda.ven_codigo}`,
                                mov_preco: it.vni_preco_unit,
                                mov_fk_requisicao: null,
                                mov_fk_venda: venda.ven_id
                            }, { transaction: tx });
                        }

                        await this.adapter.model.update({ ven_status: "Estornada" }, { where: { ven_id: id }, transaction: tx });
                        return { success: true, message: "Venda estornada e estoque devolvido." };
                    }

                    throw new Error("Nada a cancelar/estornar para este estado.");
                });
            }
        }
    },

    methods: {
        _getUserId(ctx) {
            const u = ctx?.meta?.user || {};
            return u.id ?? u.user_id ?? u.userId ?? null;
        },

        async _recalcTotals(vendaId, tx, overrideDesconto = undefined) {
            const itens = await VendaItem.findAll({ where: { vni_fk_venda: vendaId }, raw: true, transaction: tx });
            const subtotal = this._round2(itens.reduce((s, it) => s + Number(it.vni_total || 0), 0));
            const desconto = (overrideDesconto != null) ? Number(overrideDesconto) : undefined;

            if (desconto != null) {
                const total = this._round2(Math.max(subtotal - desconto, 0));
                await this.adapter.model.update(
                    { ven_subtotal: subtotal, ven_desconto: desconto, ven_total: total },
                    { where: { ven_id: vendaId }, transaction: tx }
                );
            } else {
                // mantém desconto atual
                const venda = await this.adapter.model.findByPk(vendaId, { transaction: tx, raw: true });
                const total = this._round2(Math.max(subtotal - Number(venda.ven_desconto || 0), 0));
                await this.adapter.model.update(
                    { ven_subtotal: subtotal, ven_total: total },
                    { where: { ven_id: vendaId }, transaction: tx }
                );
            }
        },

        _round2(n) {
            return Math.round(Number(n) * 100) / 100;
        }
    }
};
