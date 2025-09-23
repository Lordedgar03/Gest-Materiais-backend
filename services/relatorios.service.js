// services/relatorios.service.js
"use strict";

const { Op, fn, col, literal, QueryTypes } = require("sequelize");
const sequelize = require("../config/db");

// Importa os models já definidos no projeto (com associações)
const { Material, Tipo, Categoria } = require("../models/index");

// util
const round2 = n => Math.round(Number(n || 0) * 100) / 100;

module.exports = {
    name: "relatorios",

    actions: {
        /**
         * GET /api/relatorios/materiais/estoque-agrupado
         * Query:
         *  - groupBy = "local" | "tipo" | "categoria" (default: "local")
         *  - local? (prefixo), tipo_id?, categoria_id?, vendavel? ("SIM"/"NAO"), status? ("ativo"/"inativo")
         */
        iltrosMateriais: {
            rest: "GET /materiais/filtros",
            cache: false,
            async handler() {
                // Descobre dinamicamente o nome da coluna de localização
                const attrs = Material?.rawAttributes || {};
                const localCol =
                    attrs.mat_localizacao ? "mat_localizacao" :
                        (attrs.mat_local ? "mat_local" : null);

                // Localizações distintas
                let locais = [];
                if (localCol) {
                    const rows = await Material.findAll({
                        attributes: [[fn("DISTINCT", col(localCol)), "loc"]],
                        raw: true,
                    });
                    locais = rows
                        .map(r => r.loc)
                        .filter(v => v && String(v).trim().length > 0)
                        .sort((a, b) => String(a).localeCompare(String(b), "pt"));
                }

                // Tipos
                let tipos = [];
                if (Tipo) {
                    const rows = await Tipo.findAll({
                        attributes: ["tipo_id", "tipo_nome"],
                        raw: true,
                        order: [["tipo_nome", "ASC"]],
                    });
                    tipos = rows.map(r => ({ id: r.tipo_id, nome: r.tipo_nome }));
                }

                // Categorias
                let categorias = [];
                if (Categoria) {
                    const rows = await Categoria.findAll({
                        attributes: ["cat_id", "cat_nome"],
                        raw: true,
                        order: [["cat_nome", "ASC"]],
                    });
                    categorias = rows.map(r => ({ id: r.cat_id, nome: r.cat_nome }));
                }

                return { ok: true, locais, tipos, categorias };
            },
        },

        /** (opcional) Ajuste para não depender de alias "material" no SQL */
        estoqueAgrupado: {
            rest: "GET /materiais/estoque-agrupado",
            cache: false,
            params: {
                groupBy: { type: "string", optional: true, enum: ["local", "tipo", "categoria"] },
                local: { type: "string", optional: true, trim: true },
                tipo_id: { type: "number", convert: true, optional: true },
                categoria_id: { type: "number", convert: true, optional: true },
                vendavel: { type: "enum", values: ["SIM", "NAO"], optional: true },
                status: { type: "enum", values: ["ativo", "inativo"], optional: true },
            },
            async handler(ctx) {
                const groupBy = ctx.params.groupBy || "local";
                const { local, tipo_id, categoria_id, vendavel, status } = ctx.params;

                const attrs = Material?.rawAttributes || {};
                const localCol =
                    attrs.mat_localizacao ? "mat_localizacao" :
                        (attrs.mat_local ? "mat_local" : null);

                // Filtros
                const whereMat = {};
                if (local && localCol) whereMat[localCol] = { [Op.like]: `${local}%` };
                if (vendavel) whereMat.mat_vendavel = vendavel;
                if (status) whereMat.mat_status = status;
                if (tipo_id) whereMat.mat_fk_tipo = Number(tipo_id);

                // Include
                const include = [{
                    model: Tipo, as: "tipo", required: false,
                    attributes: ["tipo_id", "tipo_nome", "tipo_fk_categoria"],
                    include: (Categoria ? [{ model: Categoria, as: "categoria", required: false, attributes: ["cat_id", "cat_nome"] }] : []),
                }];

                if (categoria_id) {
                    if (Categoria) {
                        include[0].include[0] = include[0].include[0] || {
                            model: Categoria, as: "categoria", required: false, attributes: ["cat_id", "cat_nome"],
                        };
                        include[0].include[0].where = { cat_id: Number(categoria_id) };
                        include[0].required = true;
                    } else {
                        include[0].where = { tipo_fk_categoria: Number(categoria_id) };
                        include[0].required = true;
                    }
                }

                // Agregações
                const aggAttrs = [
                    [fn("COUNT", col("mat_id")), "itens"],
                    [fn("SUM", col("mat_quantidade_estoque")), "quantidade"],
                    [fn("SUM", literal("mat_quantidade_estoque * COALESCE(mat_preco,0)")), "valor_estoque"],
                ];

                // Chave de agrupamento
                let groupAttr, selectLabel;
                if (groupBy === "local" && localCol) {
                    groupAttr = col(localCol);
                    selectLabel = [col(localCol), "grupo"];
                } else if (groupBy === "tipo") {
                    groupAttr = col("tipo.tipo_nome");
                    selectLabel = [col("tipo.tipo_nome"), "grupo"];
                } else {
                    if (Categoria) {
                        groupAttr = col("tipo->categoria.cat_nome");
                        selectLabel = [col("tipo->categoria.cat_nome"), "grupo"];
                    } else {
                        groupAttr = col("tipo.tipo_fk_categoria");
                        selectLabel = [literal("COALESCE(CASE WHEN tipo.tipo_fk_categoria IS NULL THEN '-' ELSE CAST(tipo.tipo_fk_categoria AS CHAR) END,'-')"), "grupo"];
                    }
                }

                const rows = await Material.findAll({
                    where: whereMat,
                    include,
                    raw: true,
                    attributes: [selectLabel, ...aggAttrs],
                    group: [groupAttr],
                    order: [[literal("grupo"), "ASC"]],
                });

                const grupos = rows.map(r => ({
                    grupo: r.grupo || "-",
                    itens: Number(r.itens || 0),
                    quantidade: Number(r.quantidade || 0),
                    valor_estoque: round2(r.valor_estoque || 0),
                }));

                const total = grupos.reduce((s, x) => ({
                    itens: s.itens + x.itens,
                    quantidade: s.quantidade + x.quantidade,
                    valor_estoque: round2(s.valor_estoque + x.valor_estoque),
                }), { itens: 0, quantidade: 0, valor_estoque: 0 });

                return { ok: true, criterio: groupBy, filtros: { local, tipo_id, categoria_id, vendavel, status }, grupos, total };
            },
        },

        /**
         * GET /api/relatorios/vendas/mensal?ano=YYYY
         * Soma ven_total por mês (apenas status 'Paga')
         */
        vendasMensal: {
            rest: "GET /vendas/mensal",
            cache: false,
            params: { ano: { type: "number", convert: true } },
            async handler(ctx) {
                const ano = Number(ctx.params.ano) || new Date().getFullYear();

                // 1) Tenta somar pelo cabeçalho (ven_total) com status flexível
                const [rowsHeader] = await sequelize.query(
                    `
      SELECT
        MONTH(v.ven_data) AS mes,
        SUM(COALESCE(v.ven_total, 0)) AS total
      FROM tb_vendas v
      WHERE YEAR(v.ven_data) = :ano
        AND LOWER(v.ven_status) IN ('paga','pago')
      GROUP BY MONTH(v.ven_data)
      ORDER BY MONTH(v.ven_data)
      `,
                    { replacements: { ano } }
                );

                // Se deu tudo zero (ou não há linhas), faz fallback somando itens
                const tudoZero = !rowsHeader?.length || rowsHeader.every(r => Number(r.total || 0) === 0);

                let rows = rowsHeader;
                if (tudoZero) {
                    const [rowsItens] = await sequelize.query(
                        `
        SELECT
          MONTH(v.ven_data) AS mes,
          SUM(vi.vit_quantidade * vi.vit_preco) AS total
        FROM tb_vendas v
        JOIN tb_vendas_itens vi ON vi.vit_fk_venda = v.ven_id
        WHERE YEAR(v.ven_data) = :ano
          AND LOWER(v.ven_status) IN ('paga','pago')
        GROUP BY MONTH(v.ven_data)
        ORDER BY MONTH(v.ven_data)
        `,
                        { replacements: { ano } }
                    );
                    rows = rowsItens;
                }

                const byMonth = Array.from({ length: 12 }, (_, i) => ({
                    mes: i + 1,
                    total: 0,
                }));

                for (const r of rows || []) {
                    const m = Number(r.mes);
                    if (m >= 1 && m <= 12) byMonth[m - 1].total = Math.round(Number(r.total || 0) * 100) / 100;
                }

                const totalAno = byMonth.reduce((s, x) => s + x.total, 0);
                return { ok: true, ano, meses: byMonth, totalAno: Math.round(totalAno * 100) / 100 };
            },
        }

    }
};
