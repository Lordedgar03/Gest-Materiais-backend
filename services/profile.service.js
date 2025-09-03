"use strict";

const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { Op } = require("sequelize");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Modelos centralizados
const {
  User,
  Role,
  UserRole,
  PermissionTemplate,
  UserTemplate,
  Log
} = require("../models/index");

const JWT_SECRET = process.env.JWT_SECRET || "segredo_muito_forte";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

// Campos de perfil que o próprio utilizador pode editar
const ALLOWED_FIELDS = ["user_nome", "user_email", "user_telefone", "user_endereco", "avatar_url"];

/** Remove campos sensíveis do objeto user */
function sanitizeUser(userInstance) {
  const u = userInstance.toJSON();
  delete u.user_senha;
  delete u.createdAt;
  delete u.updatedAt;
  return u;
}

/** Busca roles e templates (sem depender de alias de associação) */
async function getClaims(userId, tx) {
  // ---- Roles
  const userRoles = await UserRole.findAll({
    where: { user_id: userId },
    attributes: ["role_id"],
    transaction: tx,
    raw: true
  });

  let roles = [];
  if (userRoles.length) {
    const roleIds = userRoles.map(r => r.role_id);
    const roleRows = await Role.findAll({
      where: { role_id: { [Op.in]: roleIds } },
      attributes: ["role_name"],
      transaction: tx,
      raw: true
    });
    roles = roleRows.map(r => r.role_name).filter(Boolean);
  }

  // ---- Templates
  const userTemps = await UserTemplate.findAll({
    where: { user_id: userId },
    attributes: ["template_id", "resource_type", "resource_id"],
    transaction: tx,
    raw: true
  });

  let templates = [];
  if (userTemps.length) {
    const tIds = userTemps.map(ut => ut.template_id);
    const tplRows = await PermissionTemplate.findAll({
      where: { template_id: { [Op.in]: tIds } },
      attributes: ["template_id", "template_code"],
      transaction: tx,
      raw: true
    });
    const byId = new Map(tplRows.map(t => [t.template_id, t.template_code]));
    templates = userTemps
      .map(ut => ({
        template_code: byId.get(ut.template_id),
        resource_type: ut.resource_type,
        resource_id: ut.resource_id
      }))
      .filter(t => t.template_code);
  }

  return { roles, templates };
}

/** Assina novo token com as claims atuais */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

module.exports = {
  name: "profile",
  adapter: new SequelizeAdapter(sequelize),
  // Não usamos DbService; operamos direto nos modelos

  actions: {
    /** GET /profile – retorna o próprio perfil (sanitizado) + roles + templates */
    me: {
      rest: "GET /profile",
      auth: true,
      async handler(ctx) {
        const userId = ctx.meta.user?.user_id;
        if (!userId) throw new Error("Não autenticado.");

        return sequelize.transaction(async (tx) => {
          const user = await User.findByPk(userId, { transaction: tx });
          if (!user) throw new Error("Perfil não encontrado.");

          const safe = sanitizeUser(user);
          const { roles, templates } = await getClaims(userId, tx);

          return { ...safe, roles, templates };
        });
      }
    },

    /** PUT /profile – atualiza campos próprios + (opcional) senha nova no mesmo payload */
    update: {
      rest: "PUT /profile",
      auth: true,
      params: {
        user_nome: { type: "string", optional: true, min: 3 },
        user_email: { type: "email", optional: true },
        user_telefone: { type: "string", optional: true, max: 60 },
        user_endereco: { type: "string", optional: true, max: 255 },
        avatar_url: { type: "string", optional: true },
        user_senha: { type: "string", optional: true, min: 6 } // compatível com teu front
      },
      async handler(ctx) {
        const userId = ctx.meta.user?.user_id;
        if (!userId) throw new Error("Não autenticado.");

        return sequelize.transaction(async (tx) => {
          const user = await User.findByPk(userId, { transaction: tx });
          if (!user) throw new Error("Perfil não encontrado.");

          const before = sanitizeUser(user);

          // Unicidade de email (ignora o próprio)
          if (ctx.params.user_email) {
            const exists = await User.findOne({
              where: {
                user_email: ctx.params.user_email,
                user_id: { [Op.ne]: userId }
              },
              transaction: tx
            });
            if (exists) throw new Error("Este email já está em uso.");
          }

          // Aplica apenas os campos permitidos
          let touched = false;
          for (const key of ALLOWED_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(ctx.params, key)) {
              user[key] = ctx.params[key];
              touched = true;
            }
          }

          // Atualiza senha se veio "user_senha"
          let passwordChanged = false;
          if (ctx.params.user_senha) {
            user.user_senha = await bcrypt.hash(ctx.params.user_senha, 8);
            passwordChanged = true;
            touched = true;
          }

          if (!touched) {
            return { message: "Nada para atualizar." };
          }

          await user.save({ transaction: tx });

          // Log
          await Log.create({
            log_action: "update",
            log_table: "tb_users",
            log_description: JSON.stringify({ before, after: sanitizeUser(user) })
          }, { transaction: tx });

          // Rotação de token se nome/email/senha mudaram
          const nameChanged = ctx.params.user_nome && ctx.params.user_nome !== before.user_nome;
          const emailChanged = ctx.params.user_email && ctx.params.user_email !== before.user_email;

          if (nameChanged || emailChanged || passwordChanged) {
            // Revoga token antigo (se houver serviço de blacklist)
            const oldToken = ctx.meta.token;
            if (oldToken && ctx.meta.user?.exp) {
              try {
                await ctx.call("blacklist.add", {
                  token: oldToken,
                  expiresAt: new Date(ctx.meta.user.exp * 1000).toISOString()
                });
              } catch (_) { /* silencioso */ }
            }

            const { roles, templates } = await getClaims(userId, tx);
            const token = signToken({
              user_id: user.user_id,
              user_nome: user.user_nome,
              roles,
              templates
            });

            return { message: "Perfil atualizado com sucesso.", token };
          }

          return { message: "Perfil atualizado com sucesso." };
        });
      }
    },

    /** PUT /profile/password – troca de senha (fluxo alternativo com senha atual) */
    changePassword: {
      rest: "PUT /profile/password",
      auth: true,
      params: {
        current_senha: { type: "string", min: 6 },
        nova_senha: { type: "string", min: 6 }
      },
      async handler(ctx) {
        const userId = ctx.meta.user?.user_id;
        if (!userId) throw new Error("Não autenticado.");

        return sequelize.transaction(async (tx) => {
          const user = await User.findByPk(userId, { transaction: tx });
          if (!user) throw new Error("Perfil não encontrado.");

          const ok = await bcrypt.compare(ctx.params.current_senha, user.user_senha);
          if (!ok) throw new Error("Senha atual incorreta.");

          const before = sanitizeUser(user);

          user.user_senha = await bcrypt.hash(ctx.params.nova_senha, 8);
          await user.save({ transaction: tx });

          await Log.create({
            log_action: "update",
            log_table: "tb_users",
            log_description: JSON.stringify({ before, after: { ...before, user_senha: "alterada" } })
          }, { transaction: tx });

          // Rotaciona token após troca de senha
          const oldToken = ctx.meta.token;
          if (oldToken && ctx.meta.user?.exp) {
            try {
              await ctx.call("blacklist.add", {
                token: oldToken,
                expiresAt: new Date(ctx.meta.user.exp * 1000).toISOString()
              });
            } catch (_) {}

          }

          const { roles, templates } = await getClaims(userId, tx);
          const token = signToken({
            user_id: user.user_id,
            user_nome: user.user_nome,
            roles,
            templates
          });

          return { message: "Senha atualizada com sucesso.", token };
        });
      }
    }
  }
};
