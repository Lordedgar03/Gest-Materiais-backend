"use strict";

require("dotenv").config();

const ApiGateway = require("moleculer-web");
const jwt = require("jsonwebtoken");

const isProd = process.env.NODE_ENV === "production";
const FALLBACK_DEV_SECRET = "dev_only_secret_change_me_32+chars";
const JWT_SECRET = process.env.JWT_SECRET || (isProd ? null : FALLBACK_DEV_SECRET);

if (!JWT_SECRET) {
  // Em produção: falha imediata. Em dev usamos fallback acima.
  throw new Error("JWT_SECRET não definido. Configure a variável de ambiente.");
}

if (!process.env.JWT_SECRET && !isProd) {
  // Aviso alto em dev se estiver usando fallback
  // (não impede subir o serviço)
  // eslint-disable-next-line no-console
  console.warn(
    "[api.service] Atenção: usando JWT_SECRET de DEV (fallback). Defina JWT_SECRET no .env!"
  );
}

const JWT_OPTIONS = {
  algorithms: ["HS256"],     // ajuste se usar outro alg
  clockTolerance: 30,        // segundos
  // issuer: "sua-issuer",
  // audience: "sua-audience",
};

// Mapa PT -> action codes na sua ACL
const ACTION_MAP = {
  visualizar: "view",
  criar: "create",
  editar: "edit",
  eliminar: "delete",
  autorizar: "approve",
  requisitar: "request",
  gerarRecibo: "generate_receipt",
  logout: null, // sem checagem de permissão (ainda requer autenticado)
};

module.exports = {
  name: "api",
  mixins: [ApiGateway],

  settings: {
    port: 3000,

    // Só expõe o que está mapeado em aliases
    whitelist: [],

    // Rate limit simples (ajuste conforme necessário)
    rateLimit: {
      window: 15 * 1000,
      limit: 100,
      headers: true,
    },

    routes: [
      // Rota pública (login)
      {
        path: "/",
        authorization: false,
        authentication: false,
        aliases: {
          "POST users/login": "users.loginUser",
        },
        bodyParsers: { json: true, urlencoded: { extended: true } },
        cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] },
      },

      // Rotas protegidas
      {
        path: "/api",
        authentication: true,
        authorization: true,

        aliases: {
          // Usuários
          "POST   /users/logout": { action: "users.logout", module: "usuario", actionName: "logout" },
          "POST   /users":        { action: "users.createuser", module: "usuario", actionName: "criar" },
          "GET    /users":        { action: "users.listUsers", module: "usuario", actionName: "visualizar" },
          "GET    /users/:id":    { action: "users.getUser", module: "usuario", actionName: "visualizar" },
          "PUT    /users/:id":    { action: "users.updateUser", module: "usuario", actionName: "editar" },
          "GET    /users/recycle":{ action: "users.listRecycleUsers", module: "usuario", actionName: "visualizar" },
          "DELETE /users/:id":    { action: "users.deleteUser", module: "usuario", actionName: "eliminar" },

          // Categorias
          "GET    /categorias":     { action: "categorias.find", module: "categoria", actionName: "visualizar" },
          "GET    /categorias/:id": { action: "categorias.get", module: "categoria", actionName: "visualizar" },
          "POST   /categorias":     { action: "categorias.criar", module: "categoria", actionName: "criar" },
          "PUT    /categorias/:id": { action: "categorias.update", module: "categoria", actionName: "editar" },
          "DELETE /categorias/:id": { action: "categorias.remove", module: "categoria", actionName: "eliminar" },

          // Tipos
          "GET    /tipos":        { action: "tipos.list", module: "tipo", actionName: "visualizar" },
          "GET    /tipos/:id":    { action: "tipos.get", module: "tipo", actionName: "visualizar" },
          "POST   /tipos":        { action: "tipos.create", module: "tipo", actionName: "criar" },
          "PUT    /tipos/:id":    { action: "tipos.update", module: "tipo", actionName: "editar" },
          "DELETE /tipos/:id":    { action: "tipos.delete", module: "tipo", actionName: "eliminar" },

          // Materiais
          "GET    /materiais":     { action: "materiais.list", module: "material", actionName: "visualizar" },
          "GET    /materiais/:id": { action: "materiais.get", module: "material", actionName: "visualizar" },
          "POST   /materiais":     { action: "materiais.create", module: "material", actionName: "criar" },
          "PUT    /materiais/:id": { action: "materiais.update", module: "material", actionName: "editar" },
          "DELETE /materiais/:id": { action: "materiais.delete", module: "material", actionName: "eliminar" },

          // Movimentações
          "GET    /movimentacoes":     { action: "movimentacoes.list", module: "movimentacao", actionName: "visualizar" },
          "GET    /movimentacoes/:id": { action: "movimentacoes.get", module: "movimentacao", actionName: "visualizar" },
          "POST   /movimentacoes":     { action: "movimentacoes.create", module: "movimentacao", actionName: "criar" },
          "PUT    /movimentacoes/:id": { action: "movimentacoes.update", module: "movimentacao", actionName: "editar" },
          "DELETE /movimentacoes/:id": { action: "movimentacoes.delete", module: "movimentacao", actionName: "eliminar" },

          // Requisições
          "GET    /requisicoes":     { action: "requisicoes.list", module: "requisicao", actionName: "visualizar" },
          "GET    /requisicoes/:id": { action: "requisicoes.get", module: "requisicao", actionName: "visualizar" },
          "POST   /requisicoes":     { action: "requisicoes.create", module: "requisicao", actionName: "criar" },
          "PUT    /requisicoes/:id": { action: "requisicoes.updateStatus", module: "requisicao", actionName: "editar" },
          "DELETE /requisicoes/:id": { action: "requisicoes.remove", module: "requisicao", actionName: "eliminar" },

          // Dashboard
          "GET    /dashboard/resumo": { action: "dashboard.resumo", module: "dashboard", actionName: "visualizar" },
        },

        bodyParsers: { json: true, urlencoded: { extended: true } },
        cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] },

        onBeforeCall(ctx, route, req, res) {
          // Auditoria básica
          ctx.meta.reqIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
          ctx.meta.userAgent = req.headers["user-agent"];
        },

        onError(req, res, err) {
          // Para 401 avisa esquema de auth
          if (err && err.code == 401) {
            res.setHeader("WWW-Authenticate", 'Bearer realm="api", charset="UTF-8"');
          }
          this.sendError(req, res, err);
        },
      },
    ],

    assets: { folder: "public" },
  },

  methods: {
    /** Autenticação: valida Bearer JWT + blacklist */
    async authenticate(ctx, route, req /*, res */) {
      const auth = req.headers.authorization;
      if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
        throw new ApiGateway.Errors.UnAuthorizedError("NO_TOKEN", { message: "Token não fornecido." });
      }

      const token = auth.slice(7).trim();

      // Blacklist (token revogado)
      try {
        const revoked = await ctx.call("blacklist.check", { token });
        if (revoked) {
          throw new ApiGateway.Errors.UnAuthorizedError("TOKEN_REVOKED", { message: "Token revogado. Faça login novamente." });
        }
      } catch (e) {
        if (e && e.code === 401) throw e;
        throw new ApiGateway.Errors.UnAuthorizedError("BLACKLIST_ERROR", { message: "Falha ao validar token." });
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET, JWT_OPTIONS);
        ctx.meta.user = decoded;
        ctx.meta.token = token;
        return decoded;
      } catch (err) {
        throw new ApiGateway.Errors.UnAuthorizedError("INVALID_TOKEN", { message: "Token inválido ou expirado." });
      }
    },

    /** Autorização: checa ACL com base no alias.module + alias.actionName */
    async authorize(ctx, route, req /*, res */) {
      const alias = req.$alias;
      if (!alias || !alias.module || !alias.actionName) {
        throw new ApiGateway.Errors.BadRequestError("BAD_ALIAS", { message: "Rota mal configurada: falta module/actionName." });
      }

      const actionCode = ACTION_MAP[alias.actionName];
      // logout: sem checagem de permissão (ainda requer user autenticado)
      if (actionCode === null) return;

      if (!ctx.meta.user || !ctx.meta.user.user_id) {
        throw new ApiGateway.Errors.UnAuthorizedError("NO_USER", { message: "Usuário não autenticado." });
      }

      const p = req.$params || {};
      let resourceId = null;
      if (p.id !== undefined) {
        const n = Number(p.id);
        resourceId = Number.isFinite(n) ? n : null;
      }

      const ok = await ctx.call("permissions.check", {
        userId: ctx.meta.user.user_id,
        resourceType: alias.module,
        actionCode,
        resourceId,
      });

      if (!ok) {
        throw new ApiGateway.Errors.ForbiddenError("ACL_DENIED", {
          message: `Acesso negado: ${alias.module}:${alias.actionName}`,
        });
      }
    },
  },

  async started() {
    this.logger.info("=== ALIASES REGISTRADOS ===");
    this.settings.routes.forEach((route) => {
      if (route.aliases) {
        this.logger.info(`Rota ${route.path}:`);
        Object.keys(route.aliases).forEach((a) => this.logger.info("  -", a));
      }
    });
  },
};
