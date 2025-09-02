"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { Sequelize, Op } = require("sequelize"); // <— IMPORT CORRIGIDO

const {
  Requisicao,
  Movimentacao,
  RequisicaoItem,
  Material,
  Tipo,
  Venda,        // <— NOVO
  VendaItem,    // <— NOVO
} = require("../models/index");

module.exports = {
  name: "dashboard",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: {},

  actions: {
    resumo: {
      rest: "GET /dashboard/resumo",
      async handler(ctx) {
        const userId = ctx?.meta?.user ? (ctx.meta.user.id ?? ctx.meta.user.user_id ?? ctx.meta.user.userId) : null;
        if (!userId) throw new Error("Autenticação necessária.");

        const tpls = (ctx?.meta?.user?.templates) || (ctx?.meta?.user?.permissionTemplates) || [];
        const allowed = new Set(
          (Array.isArray(tpls) ? tpls : [])
            .filter(t => t.template_code === "manage_category" && t.resource_id)
            .map(t => Number(t.resource_id))
            .filter(Boolean)
        );
        const hasGlobal = (Array.isArray(tpls) ? tpls : [])
          .some(t => t.template_code === "manage_category" && (t.resource_id == null));

        this.logger.debug("[dashboard.resumo] userId:", userId, "hasGlobal:", hasGlobal, "allowed:", [...allowed]);

        // helper de datas
        const now = new Date();
        const last7 = new Date(now);
        last7.setDate(now.getDate() - 7);

        if (hasGlobal) {
          // --- GLOBAL (sem restrição) ---
          const [
            usersCount,
            materiaisCount,
            movimentacoesCount,
            requisicoesCount,
            vendasCount,
            receitaTotal,
            receita7dRow,
            vendas7dRow,
            topProdutos
          ] = await Promise.all([
            ctx.call("users.count", { query: { user_status: "ativo" } }).catch(() => 0),
            Material.count({ where: { mat_status: "ativo" } }).catch(() => 0),
            Movimentacao.count().catch(() => 0),
            Requisicao.count().catch(() => 0),

            // Vendas
            Venda.count().catch(() => 0),
            // Receita total
            sequelize.query(
              `SELECT COALESCE(SUM(ven_total),0) AS soma FROM tb_vendas`,
              { type: sequelize.QueryTypes.SELECT }
            ).then(r => r?.[0]?.soma ?? 0).catch(() => 0),

            // Receita 7d
            sequelize.query(
              `SELECT COALESCE(SUM(ven_total),0) AS soma
               FROM tb_vendas
               WHERE DATE(ven_data) >= :d7`,
              { replacements: { d7: last7.toISOString().slice(0,10) }, type: sequelize.QueryTypes.SELECT }
            ).then(r => r?.[0]?.soma ?? 0).catch(() => 0),

            // Nº vendas 7d
            sequelize.query(
              `SELECT COUNT(*) AS cnt
               FROM tb_vendas
               WHERE DATE(ven_data) >= :d7`,
              { replacements: { d7: last7.toISOString().slice(0,10) }, type: sequelize.QueryTypes.SELECT }
            ).then(r => r?.[0]?.cnt ?? 0).catch(() => 0),

            // Top produtos por quantidade (global)
            sequelize.query(
              `SELECT m.mat_id, m.mat_nome, COALESCE(SUM(vi.vqi_quantidade),0) AS qtd
               FROM tb_vendas_itens vi
               JOIN tb_materiais m ON m.mat_id = vi.vqi_fk_material
               GROUP BY m.mat_id, m.mat_nome
               ORDER BY qtd DESC
               LIMIT 5`,
              { type: sequelize.QueryTypes.SELECT }
            ).catch(() => []),
          ]);

          return {
            scope: "global",
            totals: {
              utilizadores_ativos: Number(usersCount || 0),
              materiais_ativos: Number(materiaisCount || 0),
              total_movimentacoes: Number(movimentacoesCount || 0),
              total_requisicoes: Number(requisicoesCount || 0),

              // Vendas
              total_vendas: Number(vendasCount || 0),
              receita_total: Number(receitaTotal || 0),
              receita_7d: Number(receita7dRow || 0),
              vendas_7d: Number(vendas7dRow || 0),
            },
            top_produtos: topProdutos,
          };
        }

        if (allowed.size > 0) {
          // --- POR CATEGORIAS PERMITIDAS ---
          const catArr = [...allowed];

          // Tipos nessas categorias
          const tipos = await Tipo.findAll({
            where: { tipo_fk_categoria: catArr },
            attributes: ["tipo_id"],
            raw: true
          });
          const tipoIds = tipos.map(t => t.tipo_id).filter(Boolean);
          if (tipoIds.length === 0) {
            return {
              scope: "categories",
              totals: {
                utilizadores_ativos: 0,
                materiais_ativos: 0,
                total_movimentacoes: 0,
                total_requisicoes: 0,
                total_vendas: 0,
                receita_total: 0,
                receita_7d: 0,
                vendas_7d: 0,
              },
              top_produtos: [],
              category_ids: catArr
            };
          }

          // Materiais dessas categorias
          const materiais = await Material.findAll({
            where: { mat_fk_tipo: tipoIds, mat_status: "ativo" },
            attributes: ["mat_id"],
            raw: true
          });
          const matIds = materiais.map(m => m.mat_id).filter(Boolean);

          const [
            movimentacoesCount,
            requisicoesDistinct,
            vendasCount,
            receitaTotal,
            receita7dRow,
            vendas7dRow,
            topProdutos
          ] = await Promise.all([
            matIds.length
              ? Movimentacao.count({ where: { mov_fk_material: matIds } }).catch(() => 0)
              : 0,

            sequelize.query(
              `SELECT COUNT(DISTINCT r.req_id) AS cnt
               FROM tb_requisicoes r
               JOIN tb_requisicoes_itens ri ON ri.rqi_fk_requisicao = r.req_id
               JOIN tb_materiais m ON m.mat_id = ri.rqi_fk_material
               WHERE m.mat_id IN (:matIds)`,
              { replacements: { matIds }, type: sequelize.QueryTypes.SELECT }
            ).then(r => r?.[0]?.cnt ?? 0).catch(() => 0),

            // Nº de vendas que têm itens desses materiais
            sequelize.query(
              `SELECT COUNT(DISTINCT v.ven_id) AS cnt
               FROM tb_vendas v
               JOIN tb_vendas_itens vi ON vi.vqi_fk_venda = v.ven_id
               WHERE vi.vqi_fk_material IN (:matIds)`,
              { replacements: { matIds }, type: sequelize.QueryTypes.SELECT }
            ).then(r => r?.[0]?.cnt ?? 0).catch(() => 0),

            // Receita total dessas categorias
            sequelize.query(
              `SELECT COALESCE(SUM(v.ven_total),0) AS soma
               FROM tb_vendas v
               WHERE v.ven_id IN (
                 SELECT DISTINCT vi.vqi_fk_venda
                 FROM tb_vendas_itens vi
                 WHERE vi.vqi_fk_material IN (:matIds)
               )`,
              { replacements: { matIds }, type: sequelize.QueryTypes.SELECT }
            ).then(r => r?.[0]?.soma ?? 0).catch(() => 0),

            // Receita 7d
            sequelize.query(
              `SELECT COALESCE(SUM(v.ven_total),0) AS soma
               FROM tb_vendas v
               WHERE DATE(v.ven_data) >= :d7
                 AND v.ven_id IN (
                   SELECT DISTINCT vi.vqi_fk_venda
                   FROM tb_vendas_itens vi
                   WHERE vi.vqi_fk_material IN (:matIds)
                 )`,
              {
                replacements: { d7: last7.toISOString().slice(0,10), matIds },
                type: sequelize.QueryTypes.SELECT
              }
            ).then(r => r?.[0]?.soma ?? 0).catch(() => 0),

            // Nº vendas 7d
            sequelize.query(
              `SELECT COUNT(DISTINCT v.ven_id) AS cnt
               FROM tb_vendas v
               JOIN tb_vendas_itens vi ON vi.vqi_fk_venda = v.ven_id
               WHERE vi.vqi_fk_material IN (:matIds)
                 AND DATE(v.ven_data) >= :d7`,
              {
                replacements: { d7: last7.toISOString().slice(0,10), matIds },
                type: sequelize.QueryTypes.SELECT
              }
            ).then(r => r?.[0]?.cnt ?? 0).catch(() => 0),

            // Top produtos por quantidade nessas categorias
            sequelize.query(
              `SELECT m.mat_id, m.mat_nome, COALESCE(SUM(vi.vqi_quantidade),0) AS qtd
               FROM tb_vendas_itens vi
               JOIN tb_materiais m ON m.mat_id = vi.vqi_fk_material
               WHERE vi.vqi_fk_material IN (:matIds)
               GROUP BY m.mat_id, m.mat_nome
               ORDER BY qtd DESC
               LIMIT 5`,
              { replacements: { matIds }, type: sequelize.QueryTypes.SELECT }
            ).catch(() => []),
          ]);

          // utilizadores (distintos) que fizeram requisições de materiais nessas categorias (aproximação)
          let utilizadoresCount = 0;
          if (matIds.length) {
            const reqUsers = await sequelize.query(
              `SELECT DISTINCT r.req_fk_user
               FROM tb_requisicoes r
               JOIN tb_requisicoes_itens ri ON ri.rqi_fk_requisicao = r.req_id
               WHERE ri.rqi_fk_material IN (:matIds)`,
              { replacements: { matIds }, type: sequelize.QueryTypes.SELECT }
            ).catch(() => []);
            utilizadoresCount = (reqUsers || []).map(r => r.req_fk_user).filter(Boolean).length;
          }

          return {
            scope: "categories",
            category_ids: catArr,
            totals: {
              utilizadores_ativos: utilizadoresCount,
              materiais_ativos: matIds.length,
              total_movimentacoes: Number(movimentacoesCount || 0),
              total_requisicoes: Number(requisicoesDistinct || 0),

              // Vendas
              total_vendas: Number(vendasCount || 0),
              receita_total: Number(receitaTotal || 0),
              receita_7d: Number(receita7dRow || 0),
              vendas_7d: Number(vendas7dRow || 0),
            },
            top_produtos: topProdutos,
          };
        }

        // --- POR UTILIZADOR (sem permissão de manage_category) ---
        // Requisições do próprio
        const requisicoesCount = await Requisicao.count({ where: { req_fk_user: userId } }).catch(() => 0)

        // Materiais distintos requisitados pelo próprio (para derivar movimentações relacionadas)
        const itensDoUser = await RequisicaoItem.findAll({
          include: [{
            model: Requisicao,
            as: "requisicao",
            attributes: [],
            where: { req_fk_user: userId }
          }],
          attributes: ["rqi_fk_material"],
          raw: true
        }).catch(() => [])
        const matIdsUser = [...new Set((itensDoUser || []).map(i => i.rqi_fk_material).filter(Boolean))]
        const materiaisCount = matIdsUser.length
        const movimentacoesCount = matIdsUser.length
          ? await Movimentacao.count({ where: { mov_fk_material: matIdsUser } }).catch(() => 0)
          : 0

        // Vendas feitas pelo próprio utilizador (assumindo tb_vendas.ven_fk_user)
        const [vendasCount, receitaTotal, receita7dRow, vendas7dRow, topProdutos] = await Promise.all([
          sequelize.query(
            `SELECT COUNT(*) AS cnt
             FROM tb_vendas
             WHERE ven_fk_user = :uid`,
            { replacements: { uid: userId }, type: sequelize.QueryTypes.SELECT }
          ).then(r => r?.[0]?.cnt ?? 0).catch(() => 0),

          sequelize.query(
            `SELECT COALESCE(SUM(ven_total),0) AS soma
             FROM tb_vendas
             WHERE ven_fk_user = :uid`,
            { replacements: { uid: userId }, type: sequelize.QueryTypes.SELECT }
          ).then(r => r?.[0]?.soma ?? 0).catch(() => 0),

          sequelize.query(
            `SELECT COALESCE(SUM(ven_total),0) AS soma
             FROM tb_vendas
             WHERE ven_fk_user = :uid AND DATE(ven_data) >= :d7`,
            { replacements: { uid: userId, d7: last7.toISOString().slice(0,10) }, type: sequelize.QueryTypes.SELECT }
          ).then(r => r?.[0]?.soma ?? 0).catch(() => 0),

          sequelize.query(
            `SELECT COUNT(*) AS cnt
             FROM tb_vendas
             WHERE ven_fk_user = :uid AND DATE(ven_data) >= :d7`,
            { replacements: { uid: userId, d7: last7.toISOString().slice(0,10) }, type: sequelize.QueryTypes.SELECT }
          ).then(r => r?.[0]?.cnt ?? 0).catch(() => 0),

          sequelize.query(
            `SELECT m.mat_id, m.mat_nome, COALESCE(SUM(vi.vqi_quantidade),0) AS qtd
             FROM tb_vendas v
             JOIN tb_vendas_itens vi ON vi.vqi_fk_venda = v.ven_id
             JOIN tb_materiais m ON m.mat_id = vi.vqi_fk_material
             WHERE v.ven_fk_user = :uid
             GROUP BY m.mat_id, m.mat_nome
             ORDER BY qtd DESC
             LIMIT 5`,
            { replacements: { uid: userId }, type: sequelize.QueryTypes.SELECT }
          ).catch(() => []),
        ])

        return {
          scope: "user",
          userId: Number(userId),
          totals: {
            utilizadores_ativos: 1,
            materiais_ativos: Number(materiaisCount || 0),
            total_movimentacoes: Number(movimentacoesCount || 0),
            total_requisicoes: Number(requisicoesCount || 0),

            // Vendas
            total_vendas: Number(vendasCount || 0),
            receita_total: Number(receitaTotal || 0),
            receita_7d: Number(receita7dRow || 0),
            vendas_7d: Number(vendas7dRow || 0),
          },
          top_produtos: topProdutos,
        };
      }
    }
  }
};
