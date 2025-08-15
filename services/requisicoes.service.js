// services/requisicoes.service.js
"use strict";

const DbService        = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize        = require("../config/db");
const { DataTypes /*, Op*/ } = require("sequelize");

const Reciclagem       = require("../models/reciclagem.model");
const Movimentacao     = require("../models/movimentacao.model");

// Novos models
const Requisicao         = require("../models/requisicao.model");
const RequisicaoItem     = require("../models/requisicaoItem.model");
const RequisicaoDecisao  = require("../models/requisicaoDecisao.model");
const Material           = require("../models/material.model");
const Tipo               = require("../models/tipo.model");

module.exports = {
  name: "requisicoes",
  mixins: [DbService],

  // O serviço é baseado no cabeçalho (tb_requisicoes)
  adapter: new SequelizeAdapter(sequelize, {
    primaryKey: "req_id",
    raw: true
  }),
  model: {
    name: "requisicao",
    define: {
      req_id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      req_codigo:        { type: DataTypes.STRING(30), allowNull: false, unique: true },
      req_fk_user:       { type: DataTypes.INTEGER, allowNull: false },
      req_status:        { type: DataTypes.ENUM("Pendente","Aprovada","Atendida","Em Uso","Parcial","Devolvida","Rejeitada","Cancelada"), allowNull: false, defaultValue: "Pendente" },
      req_date:          { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      req_needed_at:     { type: DataTypes.DATEONLY, allowNull: true },
      req_local_entrega: { type: DataTypes.STRING(120), allowNull: true },
      req_justificativa: { type: DataTypes.STRING(255), allowNull: true },
      req_observacoes:   { type: DataTypes.STRING(255), allowNull: true },
      req_approved_by:   { type: DataTypes.INTEGER, allowNull: true },
      req_approved_at:   { type: DataTypes.DATE, allowNull: true },
      createdAt:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt:         { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    },
    options: {
      tableName: "tb_requisicoes",
      timestamps: false
    }
  },

  actions: {
    /**
     * GET /requisicoes
     * Query:
     *  - includeItems=true para trazer itens
     *  - includeDecisions=true para trazer decisões
     */
    list: {
      rest: "GET /requisicoes",
      cache: false,
      params: {
        includeItems:     { type: "boolean", optional: true, convert: true },
        includeDecisions: { type: "boolean", optional: true, convert: true }
      },
      async handler(ctx) {
        const userId = this._getUserId(ctx);
        if (!userId) throw new Error("Autenticação necessária.");

        // Mantido: exemplo simples de permissão existente
        const canEdit = Array.isArray(ctx.meta.user?.permissoes) &&
          ctx.meta.user.permissoes.some(p => p.modulo === "requisicoes" && p.acao === "editar");

        const query = canEdit ? {} : { req_fk_user: userId };
        const headers = await this.adapter.find({ query, sort: ["-req_id"] });

        if (!ctx.params.includeItems && !ctx.params.includeDecisions) return headers;

        const reqIds = headers.map(h => h.req_id);

        // Itens
        let itensByReq = {};
        if (ctx.params.includeItems) {
          const itens = reqIds.length
            ? await RequisicaoItem.findAll({ where: { rqi_fk_requisicao: reqIds }, raw: true })
            : [];
          itensByReq = itens.reduce((acc, it) => {
            (acc[it.rqi_fk_requisicao] ||= []).push(it);
            return acc;
          }, {});
        }

        // Decisões
        let decisByReq = {};
        if (ctx.params.includeDecisions) {
          const decis = reqIds.length
            ? await RequisicaoDecisao.findAll({ where: { dec_fk_requisicao: reqIds }, order: [["dec_data","ASC"]], raw: true })
            : [];
          decisByReq = decis.reduce((acc, d) => {
            (acc[d.dec_fk_requisicao] ||= []).push(d);
            return acc;
          }, {});
        }

        return headers.map(h => ({
          ...h,
          ...(ctx.params.includeItems ? { itens: itensByReq[h.req_id] || [] } : {}),
          ...(ctx.params.includeDecisions ? { decisoes: decisByReq[h.req_id] || [] } : {})
        }));
      }
    },

    /**
     * POST /requisicoes
     * Cria cabeçalho e itens.
     */
    create: {
      rest: "POST /requisicoes",
      params: {
        req_fk_user:       { type: "number", convert: true, positive: true },
        req_needed_at:     { type: "string", optional: true },
        req_local_entrega: { type: "string", optional: true },
        req_justificativa: { type: "string", optional: true },
        req_observacoes:   { type: "string", optional: true },
        itens: {
          type: "array", min: 1, items: {
            type: "object", props: {
              rqi_fk_material: { type: "number", convert: true, positive: true },
              rqi_quantidade:  { type: "number", convert: true, positive: true },
              rqi_descricao:   { type: "string", optional: true }
            }
          }
        }
      },
      async handler(ctx) {
        const { req_fk_user, req_needed_at, req_local_entrega, req_justificativa, req_observacoes, itens } = ctx.params;

        return await sequelize.transaction(async tx => {
          // 1) cria cabeçalho com código temporário
          const header = await this.adapter.model.create({
            req_codigo:        "TEMP",
            req_fk_user,
            req_status:        "Pendente",
            req_date:          new Date(),
            req_needed_at:     req_needed_at || null,
            req_local_entrega: req_local_entrega || null,
            req_justificativa: req_justificativa || null,
            req_observacoes:   req_observacoes || null,
            createdAt:         new Date(),
            updatedAt:         new Date()
          }, { transaction: tx });

          // 2) gera req_codigo definitivo
          const reqCodigo = `REQ-${String(header.req_id).padStart(6, "0")}`;
          await this.adapter.model.update({ req_codigo: reqCodigo }, { where: { req_id: header.req_id }, transaction: tx });

          // 3) cria itens
          for (const it of itens) {
            await RequisicaoItem.create({
              rqi_fk_requisicao: header.req_id,
              rqi_fk_material:   it.rqi_fk_material,
              rqi_descricao:     it.rqi_descricao || null,
              rqi_quantidade:    it.rqi_quantidade,
              rqi_qtd_atendida:  0,
              rqi_devolvido:     "Nao",
              rqi_qtd_devolvida: 0,
              rqi_status:        "Pendente",
              createdAt:         new Date(),
              updatedAt:         new Date()
            }, { transaction: tx });
          }

          await this.clearCache();
          return { success: true, message: "Requisição criada.", data: { ...header.toJSON(), req_codigo: reqCodigo } };
        });
      }
    },

    /**
     * PUT /requisicoes/:id/status
     * Atualiza apenas o status do cabeçalho (sem movimentar estoque)
     */
    updateStatus: {
      rest: "PUT /requisicoes/:id/status",
      params: {
        id:         { type: "number", convert: true },
        req_status: { type: "enum", values: ["Pendente","Aprovada","Atendida","Em Uso","Parcial","Devolvida","Rejeitada","Cancelada"] }
      },
      async handler(ctx) {
        const { id, req_status } = ctx.params;

        const [affected] = await this.adapter.model.update({ req_status }, { where: { req_id: id } });
        if (!affected) throw new Error("Requisição não encontrada ou status inalterado.");

        await this.clearCache();
        const updated = await this.adapter.model.findOne({ where: { req_id: id }, raw: true });

        return { success: true, message: "Status atualizado.", data: updated };
      }
    },

    /**
     * POST /requisicoes/:id/atender
     * Gera saída (movimentacao) e atualiza rqi_qtd_atendida/rqi_status.
     * Body: { itens: [{ rqi_id, quantidade }] }
     */
    atender: {
      rest: "POST /requisicoes/:id/atender",
      params: {
        id: { type: "number", convert: true },
        itens: {
          type: "array", min: 1, items: {
            type: "object", props: {
              rqi_id:     { type: "number", convert: true, positive: true },
              quantidade: { type: "number", convert: true, positive: true }
            }
          }
        }
      },
      async handler(ctx) {
        const { id, itens } = ctx.params;

        return await sequelize.transaction(async tx => {
          const header = await this.adapter.model.findByPk(id, { transaction: tx });
          if (!header) throw new Error("Requisição não encontrada.");

          // pega itens existentes
          const rqiIds = itens.map(i => i.rqi_id);
          const itensDb = await RequisicaoItem.findAll({ where: { rqi_id: rqiIds, rqi_fk_requisicao: id }, transaction: tx });

          const mapById = new Map(itensDb.map(i => [i.rqi_id, i]));

          for (const pedido of itens) {
            const it = mapById.get(pedido.rqi_id);
            if (!it) throw new Error(`Item ${pedido.rqi_id} não encontrado nesta requisição.`);

            const restante = it.rqi_quantidade - it.rqi_qtd_atendida;
            if (pedido.quantidade > restante) {
              throw new Error(`Quantidade solicitada (${pedido.quantidade}) excede o restante (${restante}) do item ${it.rqi_id}.`);
            }

            const material = await Material.findByPk(it.rqi_fk_material, { raw: true, transaction: tx });
            if (!material) throw new Error(`Material ${it.rqi_fk_material} não encontrado para o item ${it.rqi_id}.`);
            const tipo = await Tipo.findByPk(material.mat_fk_tipo, { raw: true, transaction: tx });

            // saída
            await Movimentacao.create({
              mov_fk_material:   material.mat_id,
              mov_material_nome: material.mat_nome,
              mov_tipo_nome:     tipo ? tipo.tipo_nome : "",
              mov_tipo:          "saida",
              mov_quantidade:    pedido.quantidade,
              mov_data:          new Date(),
              mov_descricao:     `Atendimento req ${header.req_codigo} (item ${it.rqi_id})`,
              mov_preco:         0,
              mov_fk_requisicao: id
            }, { transaction: tx });

            // estoque
            const estoqueNovo = Number(material.mat_quantidade_estoque) - Number(pedido.quantidade);
            if (estoqueNovo < 0) throw new Error(`Estoque insuficiente para o material ${material.mat_nome}.`);

            await Material.update(
              { mat_quantidade_estoque: estoqueNovo },
              { where: { mat_id: material.mat_id }, transaction: tx }
            );

            // item
            const novoAtendido = it.rqi_qtd_atendida + pedido.quantidade;
            const novoStatus =
              novoAtendido === it.rqi_quantidade ? "Atendido" :
              novoAtendido > 0 ? "Parcial" : "Pendente";

            await RequisicaoItem.update(
              { rqi_qtd_atendida: novoAtendido, rqi_status: novoStatus },
              { where: { rqi_id: it.rqi_id }, transaction: tx }
            );
          }

          // cabeçalho
          await this._recomputeHeaderStatus(id, tx);

          await this.clearCache();
          return { success: true, message: "Itens atendidos com sucesso." };
        });
      }
    },

    /**
     * POST /requisicoes/:id/devolver
     * Gera entrada (movimentacao) e atualiza rqi_qtd_devolvida/devolvido/status.
     * Body: { itens: [{ rqi_id, quantidade, condicao?("Boa"|"Danificada"|"Perdida"), obs? }] }
     */
    devolver: {
      rest: "POST /requisicoes/:id/devolver",
      params: {
        id: { type: "number", convert: true },
        itens: {
          type: "array", min: 1, items: {
            type: "object", props: {
              rqi_id:     { type: "number", convert: true, positive: true },
              quantidade: { type: "number", convert: true, positive: true },
              condicao:   { type: "enum", values: ["Boa","Danificada","Perdida"], optional: true },
              obs:        { type: "string", optional: true }
            }
          }
        }
      },
      async handler(ctx) {
        const { id, itens } = ctx.params;

        return await sequelize.transaction(async tx => {
          const header = await this.adapter.model.findByPk(id, { transaction: tx });
          if (!header) throw new Error("Requisição não encontrada.");

          const rqiIds = itens.map(i => i.rqi_id);
          const itensDb = await RequisicaoItem.findAll({ where: { rqi_id: rqiIds, rqi_fk_requisicao: id }, transaction: tx });
          const mapById = new Map(itensDb.map(i => [i.rqi_id, i]));

          for (const dev of itens) {
            const it = mapById.get(dev.rqi_id);
            if (!it) throw new Error(`Item ${dev.rqi_id} não encontrado nesta requisição.`);

            const emUso = it.rqi_qtd_atendida - it.rqi_qtd_devolvida;
            if (dev.quantidade > emUso) {
              throw new Error(`Quantidade de devolução (${dev.quantidade}) excede o em uso (${emUso}) no item ${it.rqi_id}.`);
            }

            const material = await Material.findByPk(it.rqi_fk_material, { raw: true, transaction: tx });
            if (!material) throw new Error(`Material ${it.rqi_fk_material} não encontrado para o item ${it.rqi_id}.`);
            const tipo = await Tipo.findByPk(material.mat_fk_tipo, { raw: true, transaction: tx });

            // entrada
            await Movimentacao.create({
              mov_fk_material:   material.mat_id,
              mov_material_nome: material.mat_nome,
              mov_tipo_nome:     tipo ? tipo.tipo_nome : "",
              mov_tipo:          "entrada",
              mov_quantidade:    dev.quantidade,
              mov_data:          new Date(),
              mov_descricao:     `Devolução req ${header.req_codigo} (item ${it.rqi_id})`,
              mov_preco:         0,
              mov_fk_requisicao: id
            }, { transaction: tx });

            // estoque
            const estoqueNovo = Number(material.mat_quantidade_estoque) + Number(dev.quantidade);
            await Material.update(
              { mat_quantidade_estoque: estoqueNovo },
              { where: { mat_id: material.mat_id }, transaction: tx }
            );

            // item
            const devolvidaNova = it.rqi_qtd_devolvida + dev.quantidade;
            const devolvidoFlag =
              devolvidaNova === it.rqi_qtd_atendida ? "Sim" :
              devolvidaNova > 0 ? "Parcial" : "Nao";

            const novoStatus =
              devolvidaNova === it.rqi_qtd_atendida
                ? "Devolvido"
                : (it.rqi_qtd_atendida > 0 ? "Em Uso" : it.rqi_status);

            await RequisicaoItem.update(
              {
                rqi_qtd_devolvida:   devolvidaNova,
                rqi_devolvido:       devolvidoFlag,
                rqi_data_devolucao:  new Date(),
                rqi_condicao_retorno: dev.condicao || it.rqi_condicao_retorno,
                rqi_obs_devolucao:    dev.obs || it.rqi_obs_devolucao,
                rqi_status:           novoStatus
              },
              { where: { rqi_id: it.rqi_id }, transaction: tx }
            );
          }

          // cabeçalho
          await this._recomputeHeaderStatus(id, tx);

          await this.clearCache();
          return { success: true, message: "Devolução registrada com sucesso." };
        });
      }
    },

    /**
     * POST /requisicoes/:id/decidir
     * Registra decisão (Aprovar / Rejeitar / Cancelar) na tb_requisicoes_decisoes
     * e atualiza o cabeçalho com aprovador/data/status.
     *
     * Body: { tipo: "Aprovar"|"Rejeitar"|"Cancelar", motivo?: string }
     */
    decidir: {
      rest: "POST /requisicoes/:id/decidir",
      params: {
        id:   { type: "number", convert: true, positive: true },
        tipo: { type: "enum", values: ["Aprovar","Rejeitar","Cancelar"] },
        motivo: { type: "string", optional: true }
      },
      async handler(ctx) {
        const { id, tipo, motivo } = ctx.params;
        const userId = this._getUserId(ctx);
        if (!userId) throw new Error("Autenticação necessária.");

        return await sequelize.transaction(async tx => {
          const header = await this.adapter.model.findByPk(id, { transaction: tx });
          if (!header) throw new Error("Requisição não encontrada.");

          // 1) cria registro de decisão
          await RequisicaoDecisao.create({
            dec_fk_requisicao: id,
            dec_fk_user:       userId,
            dec_tipo:          tipo,
            dec_motivo:        motivo || null,
            dec_data:          new Date()
          }, { transaction: tx });

          // 2) determina novo status do cabeçalho (somente de decisão)
          const statusMap = {
            Aprovar:  "Aprovada",
            Rejeitar: "Rejeitada",
            Cancelar: "Cancelada"
          };
          const novoStatus = statusMap[tipo];

          // 3) atualiza cabeçalho
          await this.adapter.model.update({
            req_status:      novoStatus,
            req_approved_by: userId,
            req_approved_at: new Date()
          }, { where: { req_id: id }, transaction: tx });

          await this.clearCache();
          const updated = await this.adapter.model.findOne({ where: { req_id: id }, raw: true, transaction: tx });

          return { success: true, message: `Decisão registrada: ${tipo}.`, data: updated };
        });
      }
    },

    /**
     * DELETE /requisicoes/:id
     * Remove cabeçalho (CASCADE itens/decisoes) e registra reciclagem
     */
    remove: {
      rest: "DELETE /requisicoes/:id",
      params: { id: { type: "number", convert: true } },
      async handler(ctx) {
        const userId = this._getUserId(ctx) || null;

        return await sequelize.transaction(async tx => {
          const inst = await this.adapter.model.findByPk(ctx.params.id, { transaction: tx });
          if (!inst) throw new Error("Requisição não encontrada.");

          const oldData = inst.toJSON();

          await Reciclagem.create({
            reci_table:        "tb_requisicoes",
            reci_record_id:    ctx.params.id,
            reci_action:       "delete",
            reci_data_antiga:  oldData,
            reci_data_nova:    null,
            reci_fk_user:      userId
          }, { transaction: tx });

          await inst.destroy({ transaction: tx }); // CASCADE itens e decisoes
          await this.clearCache();

          return { success: true, message: "Requisição removida e enviada para reciclagem." };
        });
      }
    }
  },

  methods: {
    /**
     * Obtém userId de forma resiliente (id | user_id | userId)
     */
    _getUserId(ctx) {
      const u = ctx?.meta?.user || {};
      return u.id ?? u.user_id ?? u.userId ?? null;
    },

    /**
     * (Opcional) Lê templates do usuário em formatos diferentes
     */
    _getUserTemplates(ctx) {
      const u = ctx?.meta?.user || {};
      return u.templates ?? u.permissionTemplates ?? u.templatesRaw ?? [];
    },

    /**
     * (Opcional) Extrai categorias permitidas pelo template manage_category
     * Retorna { allowed: Set<number>, hasGlobal: boolean }
     */
    _getAllowedCategoryIds(ctx) {
      const tpls = this._getUserTemplates(ctx);
      const allowed = new Set(
        (Array.isArray(tpls) ? tpls : [])
          .filter(t => t.template_code === "manage_category" && t.resource_id)
          .map(t => Number(t.resource_id))
          .filter(Boolean)
      );
      const hasGlobal = (Array.isArray(tpls) ? tpls : [])
        .some(t => t.template_code === "manage_category" && (t.resource_id == null));
      return { allowed, hasGlobal };
    },

    /**
     * Recalcula o status do cabeçalho com base nos itens.
     */
    async _recomputeHeaderStatus(reqId, tx) {
      const itens = await RequisicaoItem.findAll({ where: { rqi_fk_requisicao: reqId }, raw: true, transaction: tx });

      if (itens.length === 0) {
        await this.adapter.model.update({ req_status: "Pendente" }, { where: { req_id: reqId }, transaction: tx });
        return;
      }

      const total = itens.length;
      const atendidos = itens.filter(i => i.rqi_qtd_atendida > 0).length;
      const totalmenteAtendidos = itens.filter(i => i.rqi_qtd_atendida === i.rqi_quantidade).length;

      const emUsoQtd = itens.reduce((acc, i) => acc + (i.rqi_qtd_atendida - i.rqi_qtd_devolvida), 0);
      const todosDevolvidos = itens.every(i => i.rqi_qtd_atendida > 0 && i.rqi_qtd_devolvida === i.rqi_qtd_atendida);

      let status = "Pendente";
      if (todosDevolvidos) {
        status = "Devolvida";
      } else if (atendidos === 0) {
        status = "Pendente";
      } else if (emUsoQtd > 0) {
        status = (totalmenteAtendidos === total) ? "Em Uso" : "Parcial";
      } else {
        status = (totalmenteAtendidos === total) ? "Atendida" : "Parcial";
      }

      await this.adapter.model.update({ req_status: status }, { where: { req_id: reqId }, transaction: tx });
    }
  }
};
