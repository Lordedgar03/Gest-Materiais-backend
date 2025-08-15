"use strict";

const DbService        = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize        = require("../config/db");

// Importe seus modelos centrais:
const {
  UserTemplate,
  TemplateAction,
  Action,
  Tipo,
  Material
} = require("../models/index");

module.exports = {
  name: "permissions",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: UserTemplate,

  actions: {
    /**
     * ctx.params deve conter:
     *  - userId
     *  - resourceType: 'categoria' | 'tipo' | 'material' | …
     *  - actionCode:   'view' | 'create' | 'edit' | 'delete' | …
     *  - resourceId:   número (quando aplicável)
     */
    async check(ctx) {
      const {
        userId,
        resourceType,
        actionCode,
        resourceId = null
      } = ctx.params;

      // 1) Pega todos os templates atribuídos ao usuário
      const userTemplates = await UserTemplate.findAll({
        where: { user_id: userId },
        attributes: ["template_id", "resource_type", "resource_id"]
      });
      if (userTemplates.length === 0) return false;

      // 2) Para cada template, checa escopo e ação
      for (let ut of userTemplates) {
        const tplId     = ut.template_id;
        const scopeType = ut.resource_type;  // ex: null | 'categoria'
        const scopeId   = ut.resource_id;    // ex: null | 1

        // 2.1) Se o template tiver um escopo explícito NO MESMO tipo
        //      e não bater com o resourceId, pule-o:
        if (
          scopeType === resourceType &&
          scopeId !== null &&
          resourceId !== scopeId
        ) {
          continue;
        }

        // 2.2) Se escopo for 'categoria', verifique pertença
        if (scopeType === "categoria" && scopeId !== null && resourceId !== null) {
          let belongs = false;

          if (resourceType === "tipo") {
            // tipo.tipo_fk_categoria === scopeId?
            const tipo = await Tipo.findByPk(resourceId);
            belongs = tipo && tipo.tipo_fk_categoria === scopeId;
          }
          else if (resourceType === "material") {
            // material → seu tipo → verifica categoria
            const mat = await Material.findByPk(resourceId);
            if (mat) {
              const pai = await Tipo.findByPk(mat.mat_fk_tipo);
              belongs = pai && pai.tipo_fk_categoria === scopeId;
            }
          }

          if (!belongs) {
            // não pertence àquela categoria → pula
            continue;
          }
        }

        // 2.3) Agora veja se o template inclui aquela ação no resourceType
        const found = await TemplateAction.findOne({
          where: {
            template_id:   tplId,
            resource_type: resourceType
          },
          include: [{
            model: Action,
            as:    "action",
            where: { action_code: actionCode }
          }]
        });

        if (found) {
          // template autoriza esta ação → PERMITIDO
          return true;
        }
      }

      // nenhum template deu match → NEGADO
      return false;
    }
  }
};
