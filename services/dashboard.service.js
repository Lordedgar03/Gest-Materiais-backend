// services/dashboard.service.js
"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");

const {
	Requisicao,
	Movimentacao,
	RequisicaoItem,
	Material,
	Tipo
} = require("../models/index");


module.exports = {
  name: "dashboard",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: {}, // sem model direto

  actions: {
     resumo: {
      rest: "GET /dashboard/resumo",
      async handler(ctx) {
        // segurança: exige autenticação
        const userId = ctx?.meta?.user ? (ctx.meta.user.id ?? ctx.meta.user.user_id ?? ctx.meta.user.userId) : null;
        if (!userId) throw new Error("Autenticação necessária.");

        // lê templates do token/meta (mesma forma que outros serviços)
        const tpls = (ctx?.meta?.user?.templates) || (ctx?.meta?.user?.permissionTemplates) || [];
        const allowed = new Set(
          (Array.isArray(tpls) ? tpls : [])
            .filter(t => t.template_code === "manage_category" && t.resource_id)
            .map(t => Number(t.resource_id))
            .filter(Boolean)
        );
        const hasGlobal = (Array.isArray(tpls) ? tpls : [])
          .some(t => t.template_code === "manage_category" && (t.resource_id == null));

        // debug
        this.logger.debug("[dashboard.resumo] userId:", userId, "hasGlobal:", hasGlobal, "allowed:", [...allowed]);

        // helper: devolve object default com zeros
        const empty = () => ({
          utilizadores_ativos: 0,
          materiais_ativos: 0,
          total_movimentacoes: 0,
          total_requisicoes: 0
        });

        if (hasGlobal) {
          // admin / global manage_category -> tudo (rápido)
          const [users, materiaisCount, movimentacoes, requisicoes] = await Promise.all([
            ctx.call("users.count", { query: { user_status: "ativo" } }).catch(() => 0),
            Material.count({ where: { mat_status: "ativo" } }).catch(() => 0),
            Movimentacao.count().catch(() => 0),
            Requisicao.count().catch(() => 0)
          ]);
          return {
            utilizadores_ativos: users,
            materiais_ativos: materiaisCount,
            total_movimentacoes: movimentacoes,
            total_requisicoes: requisicoes
          };
        }

        // Se o utilizador tem allowed categorias (manage_category com scope)
        if (allowed.size > 0) {
          const catArr = [...allowed];

          // 1) tipos nas categorias permitidas
          const tipos = await Tipo.findAll({ where: { tipo_fk_categoria: catArr }, attributes: ["tipo_id"], raw: true });
          const tipoIds = tipos.map(t => t.tipo_id).filter(Boolean);
          if (tipoIds.length === 0) return empty();

          // 2) materiais cujos tipos estão nestes tipos
          const materiais = await Material.findAll({
            where: { mat_fk_tipo: tipoIds, mat_status: "ativo" },
            attributes: ["mat_id"],
            raw: true
          });
          const matIds = materiais.map(m => m.mat_id).filter(Boolean);

          // 3) contas:
          const materiaisCount = matIds.length;
          const movimentacoesCount = matIds.length ? await Movimentacao.count({ where: { mov_fk_material: matIds } }) : 0;

          // requisicoes relacionadas a esses materiais: pega reqIds distintos via RequisicaoItem
          let reqIds = [];
          if (matIds.length) {
            const itens = await RequisicaoItem.findAll({
              where: { rqi_fk_material: matIds },
              attributes: ["rqi_fk_requisicao"],
              raw: true
            });
            reqIds = [...new Set(itens.map(i => i.rqi_fk_requisicao).filter(Boolean))];
          }
          const requisicoesCount = reqIds.length;
          // utilizadores ativos/agregados: contar utilizadores que requisitaram essas requisicoes
          let utilizadoresCount = 0;
          if (reqIds.length) {
            const reqs = await Requisicao.findAll({
              where: { req_id: reqIds },
              attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("req_fk_user")), "req_fk_user"]],
              raw: true
            });
            utilizadoresCount = [...new Set(reqs.map(r => r.req_fk_user).filter(Boolean))].length;
          }

          return {
            utilizadores_ativos: utilizadoresCount,
            materiais_ativos: materiaisCount,
            total_movimentacoes: movimentacoesCount,
            total_requisicoes: requisicoesCount
          };
        }

        // Se não tem manage_category -> apenas os dados do próprio utilizador
        // count de requisicoes do próprio user (p.ex. as suas requisições)
        const requisicoesCount = await Requisicao.count({ where: { req_fk_user: userId } }).catch(() => 0);

        // materiais ativos: podemos mostrar 0 (ou os materiais que esse user requisitou).
        // Aqui mostraremos o número de materiais distintos requisitados por este user
        const itensDoUser = await RequisicaoItem.findAll({
          include: [{
            model: Requisicao, // pode necessitar do relacionamento; se não tiver, usa where rqi_fk_requisicao in ...
            as: "requisicao",
            attributes: [],
            where: { req_fk_user: userId }
          }],
          attributes: ["rqi_fk_material"],
          raw: true
        }).catch(() => []);
        const matIdsUser = [...new Set((itensDoUser || []).map(i => i.rqi_fk_material).filter(Boolean))];
        const materiaisCount = matIdsUser.length;
        const movimentacoesCount = matIdsUser.length ? await Movimentacao.count({ where: { mov_fk_material: matIdsUser } }).catch(() => 0) : 0;
        const utilizadoresCount = 1; // apenas o próprio utilizador

        return {
          utilizadores_ativos: utilizadoresCount,
          materiais_ativos: materiaisCount,
          total_movimentacoes: movimentacoesCount,
          total_requisicoes: requisicoesCount
        };
      }
    }
  },

  methods: {
    // ---- global: contagens gerais
    async _resumoGlobal(ctx) {
      // NOTE: nomes de tabelas assumidos:
      // tb_requisicoes, tb_requisicoes_itens, tb_materiais, tb_tipos, tb_users, tb_movimentacoes
      try {
        const [usersCount] = await sequelize.query(
          `SELECT COUNT(*) AS cnt FROM tb_users WHERE user_status = 'ativo'`,
          { type: sequelize.QueryTypes.SELECT }
        );

        const [matsCount] = await sequelize.query(
          `SELECT COUNT(*) AS cnt FROM tb_materiais WHERE mat_status = 'ativo'`,
          { type: sequelize.QueryTypes.SELECT }
        );

        const [movCount] = await sequelize.query(
          `SELECT COUNT(*) AS cnt FROM tb_movimentacoes`,
          { type: sequelize.QueryTypes.SELECT }
        );

        const [reqCount] = await sequelize.query(
          `SELECT COUNT(*) AS cnt FROM tb_requisicoes`,
          { type: sequelize.QueryTypes.SELECT }
        );

        // requisicoes por status
        const reqByStatus = await sequelize.query(
          `SELECT req_status, COUNT(*) AS cnt FROM tb_requisicoes GROUP BY req_status`,
          { type: sequelize.QueryTypes.SELECT }
        );

        // agregação por categoria (usa join: requisicoes_itens->materiais->tipos)
        // devolve: categoria_id, requisicoes_distintas, qtd_solicitada, qtd_atendida
        const perCategory = await sequelize.query(
          `SELECT t.tipo_fk_categoria AS categoria_id,
                  COUNT(DISTINCT r.req_id) AS requisicoes,
                  SUM(ri.rqi_quantidade) AS qtd_solicitada,
                  SUM(ri.rqi_qtd_atendida) AS qtd_atendida
           FROM tb_requisicoes r
           JOIN tb_requisicoes_itens ri ON ri.rqi_fk_requisicao = r.req_id
           JOIN tb_materiais m ON m.mat_id = ri.rqi_fk_material
           JOIN tb_tipos t ON t.tipo_id = m.mat_fk_tipo
           GROUP BY t.tipo_fk_categoria`,
          { type: sequelize.QueryTypes.SELECT }
        );

        return {
          scope: "global",
          totals: {
            utilizadores_ativos: Number(usersCount.cnt || usersCount.cnt === 0 ? usersCount.cnt : usersCount),
            materiais_ativos: Number(matsCount.cnt || matsCount.cnt === 0 ? matsCount.cnt : matsCount),
            total_movimentacoes: Number(movCount.cnt || movCount.cnt === 0 ? movCount.cnt : movCount),
            total_requisicoes: Number(reqCount.cnt || reqCount.cnt === 0 ? reqCount.cnt : reqCount)
          },
          requisicoes_por_status: reqByStatus,
          por_categoria: perCategory
        };
      } catch (err) {
        this.logger.error("[dashboard._resumoGlobal] erro:", err);
        throw err;
      }
    },

    // ---- categorias específicas (array de ids)
    async _resumoPorCategorias(ctx, catIds) {
      if (!Array.isArray(catIds) || catIds.length === 0) {
        return { scope: "categories", categories: [], totals: {} };
      }

      try {
        // material count limitado às categorias
        const mats = await sequelize.query(
          `SELECT COUNT(*) AS cnt
           FROM tb_materiais m
           JOIN tb_tipos t ON t.tipo_id = m.mat_fk_tipo
           WHERE t.tipo_fk_categoria IN (:catIds)`,
          { replacements: { catIds }, type: sequelize.QueryTypes.SELECT }
        );

        // movimentacoes relacionadas a materiais das categorias (opcional)
        const mov = await sequelize.query(
          `SELECT COUNT(*) AS cnt
           FROM tb_movimentacoes mv
           JOIN tb_materiais m ON m.mat_id = mv.mov_fk_material
           JOIN tb_tipos t ON t.tipo_id = m.mat_fk_tipo
           WHERE t.tipo_fk_categoria IN (:catIds)`,
          { replacements: { catIds }, type: sequelize.QueryTypes.SELECT }
        );

        // requisicoes distintas que possuem itens dessas categorias
        const requisicoesDistinct = await sequelize.query(
          `SELECT COUNT(DISTINCT r.req_id) AS cnt
           FROM tb_requisicoes r
           JOIN tb_requisicoes_itens ri ON ri.rqi_fk_requisicao = r.req_id
           JOIN tb_materiais m ON m.mat_id = ri.rqi_fk_material
           JOIN tb_tipos t ON t.tipo_id = m.mat_fk_tipo
           WHERE t.tipo_fk_categoria IN (:catIds)`,
          { replacements: { catIds }, type: sequelize.QueryTypes.SELECT }
        );

        // requisicoes por status (apenas aquelas com itens nas categorias)
        const reqByStatus = await sequelize.query(
          `SELECT r.req_status, COUNT(DISTINCT r.req_id) AS cnt
           FROM tb_requisicoes r
           JOIN tb_requisicoes_itens ri ON ri.rqi_fk_requisicao = r.req_id
           JOIN tb_materiais m ON m.mat_id = ri.rqi_fk_material
           JOIN tb_tipos t ON t.tipo_id = m.mat_fk_tipo
           WHERE t.tipo_fk_categoria IN (:catIds)
           GROUP BY r.req_status`,
          { replacements: { catIds }, type: sequelize.QueryTypes.SELECT }
        );

        // detalhe por categoria (simples)
        const perCategory = await sequelize.query(
          `SELECT t.tipo_fk_categoria AS categoria_id,
                  COUNT(DISTINCT r.req_id) AS requisicoes,
                  SUM(ri.rqi_quantidade) AS qtd_solicitada,
                  SUM(ri.rqi_qtd_atendida) AS qtd_atendida,
                  COUNT(DISTINCT m.mat_id) AS materiais
           FROM tb_requisicoes r
           JOIN tb_requisicoes_itens ri ON ri.rqi_fk_requisicao = r.req_id
           JOIN tb_materiais m ON m.mat_id = ri.rqi_fk_material
           JOIN tb_tipos t ON t.tipo_id = m.mat_fk_tipo
           WHERE t.tipo_fk_categoria IN (:catIds)
           GROUP BY t.tipo_fk_categoria`,
          { replacements: { catIds }, type: sequelize.QueryTypes.SELECT }
        );

        return {
          scope: "categories",
          category_ids: catIds,
          totals: {
            materiais: Number(mats[0]?.cnt || 0),
            movimentacoes: Number(mov[0]?.cnt || 0),
            requisicoes: Number(requisicoesDistinct[0]?.cnt || 0)
          },
          requisicoes_por_status: reqByStatus,
          por_categoria: perCategory
        };
      } catch (err) {
        this.logger.error("[dashboard._resumoPorCategorias] erro:", err);
        throw err;
      }
    },

    // ---- apenas para o utilizador (dados pessoais)
    async _resumoPorUsuario(ctx, userId) {
      try {
        const totalReqs = await sequelize.query(
          `SELECT COUNT(*) AS cnt FROM tb_requisicoes WHERE req_fk_user = :userId`,
          { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );

        const reqByStatus = await sequelize.query(
          `SELECT req_status, COUNT(*) AS cnt FROM tb_requisicoes WHERE req_fk_user = :userId GROUP BY req_status`,
          { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );

        // últimas 10 requisições do utilizador (com items)
        const recent = await sequelize.query(
          `SELECT r.req_id, r.req_codigo, r.req_status, r.req_date, r.req_needed_at, r.req_local_entrega
           FROM tb_requisicoes r
           WHERE r.req_fk_user = :userId
           ORDER BY r.req_id DESC
           LIMIT 10`,
          { replacements: { userId }, type: sequelize.QueryTypes.SELECT }
        );

        return {
          scope: "user",
          userId: Number(userId),
          totals: {
            total_requisicoes: Number(totalReqs[0]?.cnt || 0)
          },
          requisicoes_por_status: reqByStatus,
          recentes: recent
        };
      } catch (err) {
        this.logger.error("[dashboard._resumoPorUsuario] erro:", err);
        throw err;
      }
    }
  }
};
