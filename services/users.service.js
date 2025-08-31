// services/users.service.js
"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { Op } = require("sequelize");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Modelos centralizados + associações (conforme o teu index)
const {
  User,
  Role,
  UserRole,
  PermissionTemplate,
  UserTemplate,
  Log,
  Reciclagem,
} = require("../models/index");

module.exports = {
  name: "users",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: User,

  actions: {
    // ───────────────── CREATE USER ─────────────────
    createuser: {
      rest: "POST /users",
      params: {
        user_nome: { type: "string", min: 3 },
        user_email: { type: "email" },
        user_senha: { type: "string", min: 6 },
        roles: { type: "array", optional: true, items: "string" },
        templates: { type: "array", optional: true, items: "object" },
        avatar_url: { type: "string", optional: true },
        user_status: { type: "string", optional: true },
        user_tipo: { type: "string", optional: true }
      },
      async handler(ctx) {
        return sequelize.transaction(async (tx) => {
          const {
            user_nome,
            user_email,
            user_senha,
            roles = [],
            templates = [],
            avatar_url = null,
            user_status = "ativo",
          } = ctx.params;

          // email único
          const exists = await this.adapter.findOne({ where: { user_email }, transaction: tx });
          if (exists) throw new Error("Email já cadastrado.");

          // hash
          const hash = await bcrypt.hash(user_senha, 8);

          // cria user
          const novo = await this.adapter.model.create(
            { user_nome, user_email, user_senha: hash, avatar_url, user_status },
            { transaction: tx }
          );
          const userId = novo.user_id;

          // roles
          if (roles.length) {
            const found = await Role.findAll({ where: { role_name: { [Op.in]: roles } }, transaction: tx });
            await UserRole.bulkCreate(
              found.map((r) => ({ user_id: userId, role_id: r.role_id })),
              { transaction: tx }
            );
          }

          // templates
          if (roles.includes("admin")) {
            // admin = tudo
            const allTemplates = await PermissionTemplate.findAll({ transaction: tx });
            const utAll = allTemplates.map((tpl) => ({
              user_id: userId,
              template_id: tpl.template_id,
              resource_type: null,
              resource_id: null,
            }));
            await UserTemplate.bulkCreate(utAll, { transaction: tx });
          } else {
            // baseline global
            const baseline = await PermissionTemplate.findOne({
              where: { template_code: "baseline" }, transaction: tx
            });
            if (baseline) {
              await UserTemplate.create({
                user_id: userId,
                template_id: baseline.template_id,
                resource_type: null,
                resource_id: null,
              }, { transaction: tx });
            }
            // custom
            for (const t of templates) {
              const tpl = await PermissionTemplate.findOne({
                where: { template_code: t.template_code }, transaction: tx
              });
              if (tpl) {
                await UserTemplate.create({
                  user_id: userId,
                  template_id: tpl.template_id,
                  resource_type: t.resource_type ?? null,
                  resource_id: t.resource_id ?? null,
                }, { transaction: tx });
              }
            }
          }

          // log
          await Log.create({
            log_action: "create",
            log_table: "tb_users",
            log_description: `Usuário ${userId} criado`,
          }, { transaction: tx });

          return { message: "Utilizador cadastrado com sucesso." };
        });
      },
    },

    // ───────────────── LIST USERS ─────────────────
    listUsers: {
      rest: "GET /users",
      async handler(ctx) {
        const currentId = ctx.meta.user?.user_id;

        const users = await User.findAll({
          include: [
            { model: Role, as: "roles", attributes: ["role_name"] }
          ],
        });

        return users
          .filter((u) => u.user_id !== currentId) // oculta o próprio na listagem
          .map((u) => {
            const obj = u.toJSON();
            delete obj.user_senha;
            delete obj.createdAt;
            delete obj.updatedAt;
            obj.user_tipo = (u.roles?.[0]?.role_name) || null;
            return obj;
          });
      },
    },

    // ───────────────── GET ONE USER (+templates) ─────────────────
    getUser: {
      rest: "GET /users/:id",
      params: { id: { type: "number", convert: true } },
      async handler(ctx) {
        const user = await this.adapter.model.findByPk(ctx.params.id);
        if (!user) throw new Error("Utilizador não encontrado.");

        // CONSISTÊNCIA: mesmo alias do loginUser -> 'permissionTemplate'
        const uts = await UserTemplate.findAll({
          where: { user_id: user.user_id },
          include: [{
            model: PermissionTemplate,
            as: "permissionTemplate",
            attributes: ["template_code", "template_label"],
          }],
        });

        const templates = uts
          .map((ut) => {
            const tpl = ut.permissionTemplate || ut.dataValues?.permissionTemplate || ut.dataValues?.PermissionTemplate;
            if (!tpl) return null;
            return {
              template_code: tpl.template_code,
              resource_type: ut.resource_type ?? null,
              resource_id: ut.resource_id ?? null,
            };
          })
          .filter(Boolean);

        const json = user.toJSON();
        delete json.user_senha;
        delete json.createdAt;
        delete json.updatedAt;
        return { ...json, templates };
      },
    },

    // ───────────────── UPDATE (admin / manage_users) ─────────────────
    updateUser: {
      rest: "PUT /users/:id",
      params: {
        id: { type: "number", convert: true },
        user_nome: { type: "string", optional: true, min: 3 },
        user_email: { type: "email", optional: true },
        user_senha: { type: "string", optional: true, min: 6 },
        roles: { type: "array", optional: true, items: "string" },
        templates: { type: "array", optional: true, items: "object" },
        user_status: { type: "string", optional: true },
        user_tipo: { type: "string", optional: true },
        avatar_url: { type: "string", optional: true },
      },
      async handler(ctx) {
        const { id } = ctx.params;

        // tem manage_users?
        const hasManageUsers = Array.isArray(ctx.meta.user?.templates) &&
          ctx.meta.user.templates.some((t) => t.template_code === "manage_users");

        // se não tem, só pode editar a si mesmo e apenas nome/email/senha/avatar
        if (!hasManageUsers) {
          if (ctx.meta.user?.user_id !== id) throw new Error("Acesso negado.");
          delete ctx.params.roles;
          delete ctx.params.templates;
          delete ctx.params.user_status;
          delete ctx.params.user_tipo;
        }

        return sequelize.transaction(async (tx) => {
          const user = await User.findByPk(id, { transaction: tx });
          if (!user) throw new Error("Utilizador não encontrado.");
          const before = user.toJSON();

          const { user_nome, user_email, user_senha, avatar_url } = ctx.params;

          if (user_nome) user.user_nome = user_nome;
          if (user_email) user.user_email = user_email;
          if (avatar_url !== undefined) user.avatar_url = avatar_url;
          if (user_senha) user.user_senha = await bcrypt.hash(user_senha, 8);
          await user.save({ transaction: tx });

          if (hasManageUsers) {
            // roles
            if (ctx.params.roles) {
              await UserRole.destroy({ where: { user_id: id }, transaction: tx });
              const found = await Role.findAll({
                where: { role_name: { [Op.in]: ctx.params.roles } },
                transaction: tx,
              });
              await UserRole.bulkCreate(
                found.map((r) => ({ user_id: id, role_id: r.role_id })),
                { transaction: tx }
              );
            }

            // templates
            if (ctx.params.templates) {
              await UserTemplate.destroy({ where: { user_id: id }, transaction: tx });

              // baseline
              const baseline = await PermissionTemplate.findOne({
                where: { template_code: "baseline" }, transaction: tx
              });
              if (baseline) {
                await UserTemplate.create({
                  user_id: id,
                  template_id: baseline.template_id,
                  resource_type: null,
                  resource_id: null,
                }, { transaction: tx });
              }

              for (const t of ctx.params.templates) {
                const tpl = await PermissionTemplate.findOne({
                  where: { template_code: t.template_code }, transaction: tx
                });
                if (tpl) {
                  await UserTemplate.create({
                    user_id: id,
                    template_id: tpl.template_id,
                    resource_type: t.resource_type ?? null,
                    resource_id: t.resource_id ?? null,
                  }, { transaction: tx });
                }
              }
            }
          }

          await Log.create({
            log_action: "update",
            log_table: "tb_users",
            log_description: JSON.stringify({ before, after: user.toJSON() }),
          }, { transaction: tx });

          return { message: "Utilizador atualizado com sucesso." };
        });
      },
    },

    // ───────────────── UPDATE PROFILE (self) ─────────────────
    updateProfile: {
      rest: "PUT /profile",
      params: {
        user_nome: { type: "string", optional: true, min: 3 },
        user_email: { type: "email", optional: true },
        user_senha: { type: "string", optional: true, min: 6 },
        avatar_url: { type: "string", optional: true },
      },
      async handler(ctx) {
        const userId = ctx.meta.user?.user_id;
        const user = await User.findByPk(userId);
        if (!user) throw new Error("Perfil não encontrado.");

        const before = user.toJSON();
        const { user_nome, user_email, user_senha, avatar_url } = ctx.params;

        if (user_nome) user.user_nome = user_nome;
        if (user_email) user.user_email = user_email;
        if (avatar_url !== undefined) user.avatar_url = avatar_url;
        if (user_senha) user.user_senha = await bcrypt.hash(user_senha, 8);
        await user.save();

        await Log.create({
          log_action: "update",
          log_table: "tb_users",
          log_description: JSON.stringify({ before, after: user.toJSON() }),
        });

        return { message: "Perfil atualizado com sucesso." };
      },
    },

    // ───────────────── DELETE USER ─────────────────
    deleteUser: {
      rest: "DELETE /users/:id",
      params: { id: { type: "number", convert: true } },
      async handler(ctx) {
        return sequelize.transaction(async (tx) => {
          const userId = ctx.params.id;
          const user = await User.findByPk(userId, { transaction: tx });
          if (!user) throw new Error("Utilizador não encontrado.");

          const oldUser = user.toJSON();

          user.user_status = "inativo";
          await user.save({ transaction: tx });

          await Log.create({
            log_action: "delete",
            log_table: "tb_users",
            log_description: JSON.stringify(oldUser),
          }, { transaction: tx });

          await Reciclagem.create({
            reci_table: "tb_users",
            reci_record_id: userId,
            reci_action: "delete",
            reci_data_antiga: oldUser,
            reci_data_nova: null,
            reci_fk_user: ctx.meta.user?.user_id || null,
          }, { transaction: tx });

          const roles = await UserRole.findAll({ where: { user_id: userId }, transaction: tx });
          for (const ur of roles) {
            await Reciclagem.create({
              reci_table: "tb_user_roles",
              reci_record_id: ur.ur_id,
              reci_action: "delete",
              reci_data_antiga: ur.toJSON(),
              reci_data_nova: null,
              reci_fk_user: ctx.meta.user?.user_id || null,
            }, { transaction: tx });
          }
          await UserRole.destroy({ where: { user_id: userId }, transaction: tx });

          const tpls = await UserTemplate.findAll({ where: { user_id: userId }, transaction: tx });
          for (const ut of tpls) {
            await Reciclagem.create({
              reci_table: "tb_user_templates",
              reci_record_id: ut.id,
              reci_action: "delete",
              reci_data_antiga: ut.toJSON(),
              reci_data_nova: null,
              reci_fk_user: ctx.meta.user?.user_id || null,
            }, { transaction: tx });
          }
          await UserTemplate.destroy({ where: { user_id: userId }, transaction: tx });

          await user.destroy({ transaction: tx });

          return { message: "Utilizador e associações reciclados com sucesso." };
        });
      },
    },

    // ───────────────── LOGIN ─────────────────
    loginUser: {
      rest: "POST /users/login",
      params: { user_email: { type: "email" }, user_senha: { type: "string", min: 6 } },
      async handler(ctx) {
        const { user_email, user_senha } = ctx.params;
        const user = await this.adapter.findOne({ where: { user_email } });
        if (!user || !(await bcrypt.compare(user_senha, user.user_senha))) {
          throw new Error("Credenciais inválidas.");
        }

        // templates com alias CONSISTENTE: 'permissionTemplate'
        const uts = await UserTemplate.findAll({
          where: { user_id: user.user_id },
          include: [{ model: PermissionTemplate, as: "permissionTemplate", attributes: ["template_code"] }],
        });
        const templates = uts.map((ut) => ({
          template_code: ut.permissionTemplate?.template_code,
          resource_type: ut.resource_type,
          resource_id: ut.resource_id,
        }));

        // roles
        const urs = await UserRole.findAll({
          where: { user_id: user.user_id },
          include: [{ model: Role, as: "loginRole", attributes: ["role_name"] }],
        });
        const roles = urs.map((ur) => ur.loginRole.role_name);

        const payload = {
          user_id: user.user_id,
          user_nome: user.user_nome,
          roles,
          templates,
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET || "segredo_muito_forte", {
          expiresIn: process.env.JWT_EXPIRES_IN || "1h",
        });

        return { message: "Login ok", token, roles, templates };
      },
    },

    // ───────────────── LOGOUT ─────────────────
    logout: {
      rest: "POST /users/logout",
      auth: true,
      async handler(ctx) {
        const token = ctx.meta.token;
        if (!token) throw new Error("Sem token para revogar.");
        await ctx.call("blacklist.add", {
          token,
          expiresAt: new Date(ctx.meta.user.exp * 1000).toISOString(),
        });
        return { message: "Logout ok" };
      },
    },

    // ───────────────── RECYCLE LIST ─────────────────
    listRecycleUsers: {
      rest: "GET /users/recycle",
      async handler() {
        return Reciclagem.findAll({
          where: { reci_table: "tb_users", reci_action: "delete" },
        });
      },
    },
  },
};
