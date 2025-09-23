// services/users.service.js

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { Op } = require("sequelize");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

// Centralized models with associations
const {
	User,
	Role,
	UserRole,
	PermissionTemplate,
	UserTemplate,
	Log,
	TokenBlacklist, // login verificar token expirado para não repetir, reiniciar após ......... 
	Reciclagem
} = require("../models/index");

module.exports = {
	name: "users",
	mixins: [DbService],
	adapter: new SequelizeAdapter(sequelize),
	model: User,

	actions: {
		// ─── CREATE USER ─────────────────────────────────────────────────────────
		createuser: {
			rest: "POST /users",
			params: {
				user_nome: { type: "string", min: 3 },
				user_email: { type: "email" },
				user_senha: { type: "string", min: 6 },
				roles: { type: "array", optional: true, items: "string" },
				templates: { type: "array", optional: true, items: "object" }
			},
			async handler(ctx) {
				return await sequelize.transaction(async tx => {
					const { user_nome, user_email, user_senha, roles = [], templates = [] } = ctx.params;

					// 1) Verificar email único
					if (await this.adapter.findOne({ where: { user_email }, transaction: tx })) {
						throw new Error("Email já cadastrado.");
					}

					// 2) Hash da senha
					const hash = await bcrypt.hash(user_senha, 8);

					// 3) Criar usuário
					const novo = await this.adapter.model.create({
						user_nome,
						user_email,
						user_senha: hash,
						user_status: "ativo"
					}, { transaction: tx });
					const userId = novo.user_id;

					// 4) Atribuir roles
					if (roles.length) {
						const foundRoles = await Role.findAll({
							where: { role_name: { [Op.in]: roles } },
							transaction: tx
						});
						const ur = foundRoles.map(r => ({ user_id: userId, role_id: r.role_id }));
						await UserRole.bulkCreate(ur, { transaction: tx });
					}

					// 5) Atribuição de templates
					if (roles.includes('admin')) {
						// Admin: acesso total -> atribui todos os templates
						const allTemplates = await PermissionTemplate.findAll({ transaction: tx });
						const utAll = allTemplates.map(tpl => ({
							user_id: userId,
							template_id: tpl.template_id,
							resource_type: null,
							resource_id: null
						}));
						await UserTemplate.bulkCreate(utAll, { transaction: tx });
					} else {
						// Usuário comum: baseline + custom
						// 5.1) baseline (escopo global)
						const baseline = await PermissionTemplate.findOne({
							where: { template_code: "baseline" }, transaction: tx
						});
						if (baseline) {
							await UserTemplate.create({
								user_id: userId,
								template_id: baseline.template_id,
								resource_type: null,
								resource_id: null
							}, { transaction: tx });
						}
						// 5.2) custom
						for (let t of templates) {
							const tpl = await PermissionTemplate.findOne({
								where: { template_code: t.template_code },
								transaction: tx
							});
							if (tpl) {
								await UserTemplate.create({
									user_id: userId,
									template_id: tpl.template_id,
									resource_type: t.resource_type || null,
									resource_id: t.resource_id || null
								}, { transaction: tx });
							}
						}
					}

					// 6) Log de criação
					await Log.create({
						log_action: "create",
						log_table: "tb_users",
						log_description: `Usuário ${userId} criado`
					}, { transaction: tx });

					return { message: "Utilizador cadastrado com sucesso." };
				});
			}
		},


		// ─── LIST USERS ───────────────────────────────────────────────────────────
		listUsers: {
			rest: "GET /users",
			async handler(ctx) {
				const currentId = ctx.meta.user.user_id;

				// Carrega todos, incluindo a associação 'roles'
				const users = await User.findAll({
					include: [{
						model: Role,
						as: "roles",
						attributes: ["role_name"]
					}]
				});

				return users
					.filter(u => u.user_id !== currentId)  // exclui o próprio
					.map(u => {
						const obj = u.toJSON();
						// Remove campos sensíveis / meta
						delete obj.user_senha;
						delete obj.createdAt;
						delete obj.updatedAt;

						// Extrai o tipo de utilizador a partir da primeira role
						obj.user_tipo = (u.roles[0] && u.roles[0].role_name) || null;

						return obj;
					});
			}
		},


		// ─── GET SINGLE USER ─────────────────────────────────────────────────────
		// ─── GET SINGLE USER ─────────────────────────────────────────────────────
		getUser: {
			rest: "GET /users/:id",
			params: { id: { type: "number", convert: true } },
			async handler(ctx) {
				const user = await this.adapter.model.findByPk(ctx.params.id);
				if (!user) throw new Error("Utilizador não encontrado.");

				const uts = await UserTemplate.findAll({
					where: { user_id: user.user_id },
					include: [{
						model: PermissionTemplate,
						as: "permissionTemplate", // <-- alias CORRETO (singular)
						attributes: ["template_code", "template_label"]
					}]
				});

				return {
					...user.toJSON(),
					templates: uts
						.map(ut => ({
							template_code: ut.permissionTemplate?.template_code,  // <-- acesso alinhandado ao alias
							template_label: ut.permissionTemplate?.template_label,
							resource_type: ut.resource_type,
							resource_id: ut.resource_id
						}))
						.filter(t => !!t.template_code) // evita entradas sem join (por segurança)
				};
			}
		},

		// ─── UPDATE FULL (admin / manage_users) ───────────────────────────────
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
				user_tipo: { type: "string", optional: true }
			},
			async handler(ctx) {
				const { id } = ctx.params;

				// verifica permissão manage_users no token
				const hasManageUsers = Array.isArray(ctx.meta.user.templates) &&
					ctx.meta.user.templates.some(t => t.template_code === "manage_users");

				// se não tem, bloqueia tudo exceto próprio nome/email/senha
				if (!hasManageUsers) {
					if (ctx.meta.user.user_id !== id)
						throw new Error("Acesso negado.");

					// remove campos proibidos
					delete ctx.params.roles;
					delete ctx.params.templates;
					delete ctx.params.user_status;
					delete ctx.params.user_tipo;
				}

				return await sequelize.transaction(async tx => {
					const user = await User.findByPk(id, { transaction: tx });
					if (!user) throw new Error("Utilizador não encontrado.");

					const before = user.toJSON();
					const { user_nome, user_email, user_senha } = ctx.params;

					// atualiza nome/email/senha
					if (user_nome) user.user_nome = user_nome;
					if (user_email) user.user_email = user_email;
					if (user_senha) user.user_senha = await bcrypt.hash(user_senha, 8);
					await user.save({ transaction: tx });

					// se tem manage_users, faz roles e templates
					if (hasManageUsers) {
						if (ctx.params.roles) {
							await UserRole.destroy({ where: { user_id: id }, transaction: tx });
							const found = await Role.findAll({
								where: { role_name: { [Op.in]: ctx.params.roles } },
								transaction: tx
							});
							const ur = found.map(r => ({ user_id: id, role_id: r.role_id }));
							await UserRole.bulkCreate(ur, { transaction: tx });
						}
						if (ctx.params.templates) {
							await UserTemplate.destroy({ where: { user_id: id }, transaction: tx });
							// reaplica baseline
							const baseline = await PermissionTemplate.findOne({
								where: { template_code: "baseline" }, transaction: tx
							});
							if (baseline) {
								await UserTemplate.create({
									user_id: id,
									template_id: baseline.template_id,
									resource_type: null,
									resource_id: null
								}, { transaction: tx });
							}
							for (let t of ctx.params.templates) {
								const tpl = await PermissionTemplate.findOne({
									where: { template_code: t.template_code }, transaction: tx
								});
								if (tpl) {
									await UserTemplate.create({
										user_id: id,
										template_id: tpl.template_id,
										resource_type: t.resource_type || null,
										resource_id: t.resource_id || null
									}, { transaction: tx });
								}
							}
						}
					}

					// log de atualização
					await Log.create({
						log_action: "update",
						log_table: "tb_users",
						log_description: JSON.stringify({ before, after: user.toJSON() })
					}, { transaction: tx });

					return { message: "Utilizador atualizado com sucesso." };
				});
			}
		},

		// ─── UPDATE PROFILE (self-service) ─────────────────────────────────────
		updateProfile: {
			rest: "PUT /profile",
			params: {
				user_nome: { type: "string", optional: true, min: 3 },
				user_email: { type: "email", optional: true },
				user_senha: { type: "string", optional: true, min: 6 }
			},
			async handler(ctx) {
				const userId = ctx.meta.user.user_id;
				const user = await User.findByPk(userId);
				if (!user) throw new Error("Perfil não encontrado.");

				const before = user.toJSON();
				const { user_nome, user_email, user_senha } = ctx.params;

				if (user_nome) user.user_nome = user_nome;
				if (user_email) user.user_email = user_email;
				if (user_senha) user.user_senha = await bcrypt.hash(user_senha, 8);
				await user.save();

				await Log.create({
					log_action: "update",
					log_table: "tb_users",
					log_description: JSON.stringify({ before, after: user.toJSON() })
				});

				return { message: "Perfil atualizado com sucesso." };
			}
		},
		// ─── DELETE USER ─────────────────────────────────────────────────────────
		deleteUser: {
			rest: "DELETE /users/:id",
			params: { id: { type: "number", convert: true } },
			async handler(ctx) {
				return await sequelize.transaction(async tx => {
					const userId = ctx.params.id;
					const user = await User.findByPk(userId, { transaction: tx });
					if (!user) throw new Error("Utilizador não encontrado.");

					// 1) Armazena dados antigos do usuário
					const oldUser = user.toJSON();

					// 2) Marca como inativo
					user.user_status = "inativo";
					await user.save({ transaction: tx });

					// 3) Log de delete em tb_logs
					await Log.create({
						log_action: "delete",
						log_table: "tb_users",
						log_description: JSON.stringify(oldUser)
					}, { transaction: tx });

					// 4) Recicla o próprio usuário
					await Reciclagem.create({
						reci_table: "tb_users",
						reci_record_id: userId,
						reci_action: "delete",
						reci_data_antiga: oldUser,
						reci_data_nova: null,
						reci_fk_user: ctx.meta.user.user_id
					}, { transaction: tx });

					// 5) Captura e recicla todas as UserRole vinculadas
					const roles = await UserRole.findAll({ where: { user_id: userId }, transaction: tx });
					for (let ur of roles) {
						const oldUR = ur.toJSON();
						await Reciclagem.create({
							reci_table: "tb_user_roles",
							reci_record_id: oldUR.ur_id,
							reci_action: "delete",
							reci_data_antiga: oldUR,
							reci_data_nova: null,
							reci_fk_user: ctx.meta.user.user_id
						}, { transaction: tx });
					}
					// E apaga-as
					await UserRole.destroy({ where: { user_id: userId }, transaction: tx });

					// 6) Captura e recicla todos os UserTemplate vinculados
					const tpls = await UserTemplate.findAll({ where: { user_id: userId }, transaction: tx });
					for (let ut of tpls) {
						const oldUT = ut.toJSON();
						await Reciclagem.create({
							reci_table: "tb_user_templates",
							reci_record_id: oldUT.id,
							reci_action: "delete",
							reci_data_antiga: oldUT,
							reci_data_nova: null,
							reci_fk_user: ctx.meta.user.user_id
						}, { transaction: tx });
					}
					// E apaga-as
					await UserTemplate.destroy({ where: { user_id: userId }, transaction: tx });

					// 7) Finalmente apaga o usuário
					await user.destroy({ transaction: tx });

					return { message: "Utilizador e associações reciclados com sucesso." };
				});
			}
		},

		// ─── LOGIN ───────────────────────────────────────────────────────────────
		loginUser: {
			rest: "POST /users/login",
			params: {
				user_email: { type: "email" },
				user_senha: { type: "string", min: 6 }
			},
			async handler(ctx) {
				const { user_email, user_senha } = ctx.params;

				const user = await this.adapter.findOne({ where: { user_email } });
				if (!user || !(await bcrypt.compare(user_senha, user.user_senha))) {
					throw new Error("Credenciais inválidas.");
				}

				// 1) Templates com o código
				const uts = await UserTemplate.findAll({
					where: { user_id: user.user_id },
					include: [
						{
							model: PermissionTemplate,
							as: "permissionTemplate",
							attributes: ["template_code"]
						}
					]
				});

				const templates = uts.map((ut) => ({
					template_code: ut.permissionTemplate.template_code,
					resource_type: ut.resource_type,
					resource_id: ut.resource_id
				}));

				// 2) Roles
				const urs = await UserRole.findAll({
					where: { user_id: user.user_id },
					include: [{ model: Role, as: "loginRole", attributes: ["role_name"] }]
				});
				const roles = urs.map((ur) => ur.loginRole.role_name);

				// 3) Payload do JWT
				const payload = {
					user_id: user.user_id,
					user_nome: user.user_nome,
					roles,
					templates
				};

				// 4) 🔐 Token único: adiciona jti (UUID)
				const token = jwt.sign(payload, process.env.JWT_SECRET || "segredo_muito_forte", {
					expiresIn: process.env.JWT_EXPIRES_IN || "1h",
					jwtid: uuidv4() // <- garante que NUNCA repete
				});

				return { message: "Login ok", token, roles, templates };
			}
		},

		// ─── LOGOUT ──────────────────────────────────────────────────────────────
		logout: {
			rest: "POST /users/logout",
			auth: true,
			async handler(ctx) {
				const token = ctx.meta.token;
				if (!token) throw new Error("Sem token para revogar.");
				// opcional: salvar exp para GC da blacklist
				await ctx.call("blacklist.add", {
					token,
					expiresAt: new Date(ctx.meta.user.exp * 1000).toISOString()
				});
				return { message: "Logout ok" };
			}
		},

		// ─── RECYCLE LIST ────────────────────────────────────────────────────────
		listRecycleUsers: {
			rest: "GET /users/recycle",
			async handler() {
				return await Reciclagem.findAll({
					where: { reci_table: "tb_users", reci_action: "delete" }
				});
			}
		}
	}
}