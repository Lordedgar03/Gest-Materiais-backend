// services/movimentacoes.service.js
"use strict";

const DbService        = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize        = require("../config/db");
const Movimentacao     = require("../models/movimentacao.model");
const { MoleculerClientError } = require("moleculer").Errors;

/** Lê ACL mínima: admin, tem template 'manage_sales', e escopos de categoria */
async function loadUserACL(userId) {
  const rows = await sequelize.query(
    `
    WITH user_roles AS (
      SELECT r.role_name
      FROM tb_user_roles ur
      JOIN tb_roles r ON r.role_id = ur.role_id
      WHERE ur.user_id = :uid
    ),
    ut AS (
      SELECT ut.resource_type, ut.resource_id, ut.template_id
      FROM tb_user_templates ut
      WHERE ut.user_id = :uid
    )
    SELECT
      EXISTS(SELECT 1 FROM user_roles WHERE role_name='admin') AS is_admin,
      EXISTS(
        SELECT 1
        FROM ut u2
        JOIN tb_permission_templates pt ON pt.template_id = u2.template_id
        WHERE pt.template_code='manage_sales'
      ) AS has_sales,
      GROUP_CONCAT(DISTINCT CASE
        WHEN ut.resource_type='categoria' AND ut.resource_id IS NOT NULL
        THEN ut.resource_id END
      ) AS cat_ids_csv
    FROM ut
    `,
    { replacements: { uid: userId }, type: sequelize.QueryTypes.SELECT }
  );
  const row = rows[0] || {};
  const isAdmin     = !!Number(row.is_admin || 0);
  const hasSales    = !!Number(row.has_sales || 0);
  const categoryIds = row.cat_ids_csv ? String(row.cat_ids_csv).split(",").map(n => parseInt(n, 10)).filter(Boolean) : [];
  return { isAdmin, hasSales, categoryIds };
}

module.exports = {
  name: "movimentacoes",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize, { primaryKey: "mov_id", raw: true }),
  model: Movimentacao,

  actions: {
    list: {
      rest: "GET /movimentacoes",
      cache: false,
      async handler(ctx) {
        const u = ctx.meta?.user;
        if (!u?.user_id) throw new MoleculerClientError("Sessão inválida.", 401, "UNAUTHORIZED");
        const { isAdmin, hasSales, categoryIds } = await loadUserACL(u.user_id);

        const rep = {};
        let whereVisibility = "";

        if (isAdmin) {
          // Admin → sem restrições
          whereVisibility = "";
        } else if (categoryIds.length > 0 && !hasSales) {
          // Tem CATEGORIAS mas NÃO tem vendas → só categorias e EXCLUI vendas
          whereVisibility = `
            WHERE t.tipo_fk_categoria IN (:cats)
              AND NOT (
                mat.mat_vendavel = 'SIM'
                AND m.mov_fk_requisicao IS NULL
                AND (
                  m.mov_tipo = 'saida'
                  OR m.mov_descricao LIKE 'Venda %'
                  OR m.mov_descricao LIKE 'Estorno venda %'
                )
              )
          `;
          rep.cats = categoryIds;
        } else if (categoryIds.length > 0 && hasSales) {
          // Tem CATEGORIAS e vendas → vê tudo das categorias (inclui vendas)
          whereVisibility = `WHERE t.tipo_fk_categoria IN (:cats)`;
          rep.cats = categoryIds;
        } else if (hasSales) {
          // Só vendas → tudo que for de materiais vendáveis (entrada/saída)
          whereVisibility = `WHERE mat.mat_vendavel = 'SIM'`;
        } else {
          // Sem permissão útil → vazio (200)
          return [];
        }

        const sql = `
          SELECT
            m.*,
            mat.mat_nome,
            mat.mat_vendavel,
            t.tipo_fk_categoria AS cat_id
          FROM tb_movimentacoes m
          LEFT JOIN tb_materiais  mat ON mat.mat_id = m.mov_fk_material
          LEFT JOIN tb_tipos      t   ON t.tipo_id   = mat.mat_fk_tipo
          LEFT JOIN tb_categorias c   ON c.cat_id    = t.tipo_fk_categoria
          ${whereVisibility}
          ORDER BY m.mov_data DESC, m.mov_id DESC
        `;
        const rows = await sequelize.query(sql, { replacements: rep, type: sequelize.QueryTypes.SELECT });
        return rows;
      }
    },

    get: {
      rest: "GET /movimentacoes/:id",
      params: { id: "number" },
      async handler(ctx) {
        const u = ctx.meta?.user;
        if (!u?.user_id) throw new MoleculerClientError("Sessão inválida.", 401, "UNAUTHORIZED");
        const { isAdmin, hasSales, categoryIds } = await loadUserACL(u.user_id);

        const rep = { id: ctx.params.id };
        let extra = "";

        if (isAdmin) {
          extra = "";
        } else if (categoryIds.length > 0 && !hasSales) {
          // Categorias sem vendas → aplica filtro e exclui vendas
          extra = `
            AND t.tipo_fk_categoria IN (:cats)
            AND NOT (
              mat.mat_vendavel = 'SIM'
              AND m.mov_fk_requisicao IS NULL
              AND (
                m.mov_tipo = 'saida'
                OR m.mov_descricao LIKE 'Venda %'
                OR m.mov_descricao LIKE 'Estorno venda %'
              )
            )
          `;
          rep.cats = categoryIds;
        } else if (categoryIds.length > 0 && hasSales) {
          extra = `AND t.tipo_fk_categoria IN (:cats)`;
          rep.cats = categoryIds;
        } else if (hasSales) {
          extra = `AND mat.mat_vendavel = 'SIM'`;
        } else {
          throw new MoleculerClientError("Sem permissão para ver esta movimentação.", 403, "FORBIDDEN");
        }

        const sql = `
          SELECT
            m.*,
            mat.mat_nome,
            mat.mat_vendavel,
            t.tipo_fk_categoria AS cat_id
          FROM tb_movimentacoes m
          LEFT JOIN tb_materiais  mat ON mat.mat_id = m.mov_fk_material
          LEFT JOIN tb_tipos      t   ON t.tipo_id   = mat.mat_fk_tipo
          LEFT JOIN tb_categorias c   ON c.cat_id    = t.tipo_fk_categoria
          WHERE m.mov_id = :id
          ${extra}
          LIMIT 1
        `;
        const rows = await sequelize.query(sql, { replacements: rep, type: sequelize.QueryTypes.SELECT });
        const row = rows[0];
        if (!row) throw new MoleculerClientError("Sem permissão para ver esta movimentação ou não existe.", 403, "FORBIDDEN");
        return row;
      }
    }
  }
};
