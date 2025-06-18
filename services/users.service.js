const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { DataTypes } = require("sequelize");
const bcrypt = require("bcrypt");
const Permissao = require("../models/permissoes.model");
const jwt = require("jsonwebtoken");

module.exports = {
	name: "users",
	mixins: [DbService],
	adapter: new SequelizeAdapter(sequelize),
	model: {
		name: "User",
		define: {
			user_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
			user_nome: { type: DataTypes.STRING(100), allowNull: false },
			user_email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
			user_senha: { type: DataTypes.STRING(255), allowNull: false },
			user_tipo: { type: DataTypes.ENUM("admin", "funcionario", "professor"), allowNull: false },
			user_status: { type: DataTypes.ENUM("ativo", "inativo"), defaultValue: "ativo" },
		},
		options: {
			tableName: "tb_users",
			timestamps: true
		}
	},

	actions: {

		createuser: {
			params: {
				user_nome: { type: "string", min: 3 },
				user_email: { type: "email" },
				user_senha: { type: "string", min: 6 },
				user_tipo: { type: "enum", values: ["admin", "funcionario", "professor"] },
				permissoes: { type: "array", optional: true, items: "object" }
			},

			async handler(ctx) {
				// ⛔ Verificar se o utilizador autenticado é admin
			/*	if (!ctx.meta.user || ctx.meta.user.tipo !== "admin") {
					throw new Error("Acesso negado. Apenas administradores podem criar utilizadores.");
				}*/
				const { user_nome, user_email, user_senha, user_tipo } = ctx.params;

				// Verifica se o email já está cadastrado
				const existingUser = await this.adapter.findOne({ where: { user_email } });
				if (existingUser) {
					throw new Error("Email já cadastrado.");
				}
				// Criptografa a senha
				const bcrypt = require("bcrypt");
				const hashedPassword = await bcrypt.hash(user_senha, 16);



				const novouser = await this.adapter.model.create({
					user_nome,
					user_email,
					user_senha: hashedPassword,
					user_tipo,
					user_status: "ativo"

				});


				const userId = novouser.user_id;

				const permissoes = [];

				if (ctx.params.permissoes && ctx.params.permissoes.length > 0) {
					// ➕ Se o frontend mandou permissões, usa elas diretamente
					ctx.params.permissoes.forEach(p => {
						permissoes.push({
							perm_fk_user: userId,
							perm_modulo: p.perm_modulo,
							perm_acao: p.perm_acao
						});
					});
				} else {
					// ⚙ Senão, usa as permissões automáticas padrão com base no tipo
					if (user_tipo === "admin") {
						const modulos = ["utilizador", "categorias", "tipos", "materiais", "movimentacoes", "requisicoes", "recibos", "logs"];
						const acoes = ["visualizar", "criar", "editar", "eliminar", "autorizar"];
						modulos.forEach(mod => {
							acoes.forEach(acao => {
								permissoes.push({ perm_fk_user: userId, perm_modulo: mod, perm_acao: acao });
							});
						});
					} else if (user_tipo === "funcionario") {
						permissoes.push(
							{ perm_fk_user: userId, perm_modulo: "materiais", perm_acao: "visualizar" },
							{ perm_fk_user: userId, perm_modulo: "requisicoes", perm_acao: "visualizar" },
							{ perm_fk_user: userId, perm_modulo: "requisicoes", perm_acao: "criar" },
							{ perm_fk_user: userId, perm_modulo: "recibos", perm_acao: "visualizar" },
							{ perm_fk_user: userId, perm_modulo: "compras", perm_acao: "criar" },
							{ perm_fk_user: userId, perm_modulo: "compras", perm_acao: "visualizar" }
						);
					} else if (user_tipo === "professor") {
						permissoes.push(
							{ perm_fk_user: userId, perm_modulo: "materiais", perm_acao: "visualizar" },
							{ perm_fk_user: userId, perm_modulo: "requisicoes", perm_acao: "visualizar" },
							{ perm_fk_user: userId, perm_modulo: "requisicoes", perm_acao: "criar" },
							{ perm_fk_user: userId, perm_modulo: "recibos", perm_acao: "visualizar" },
							{ perm_fk_user: userId, perm_modulo: "compras", perm_acao: "criar" },
							{ perm_fk_user: userId, perm_modulo: "compras", perm_acao: "visualizar" }
						);

					}
				}
				// ...
				// Após preencher o array permissoes

				// Salvar permissões no banco
				await Permissao.bulkCreate(permissoes);

				return "Utilizador cadastrado com sucesso.";






			}
		},

		listUsers: {
			async handler() {
				const users = await this.adapter.find();
				return users.map(user => {
					const { user_senha, createdAt, updatedAt, user_status, ...dadosVisiveis } = user.toJSON();
					return dadosVisiveis;
				});
			}
		},

		getUser: {
			params: {
				id: { type: "number", optional: true, convert: true },
				nome: { type: "string", optional: true }
			},
			async handler(ctx) {
				const { id, nome } = ctx.params;

				let user;
				if (id) {
					user = await this.adapter.model.findByPk(id);
				} else if (nome) {
					user = await this.adapter.model.findOne({ where: { user_nome: nome } });
				}
				if (!user) throw new Error("Utilizador não encontrado.");

				const userData = user.toJSON();
				const permissoes = await Permissao.findAll({ where: { perm_fk_user: userData.user_id } });

				return {
					...userData,
					permissoes: permissoes.map(p => `${p.perm_modulo} - ${p.perm_acao}`)
				};
			}
		},

		updateUser: {
			params: {
				user_nome: { type: "string", optional: true, min: 3 },
				user_email: { type: "email", optional: true },
				user_senha: { type: "string", optional: true, min: 6 },
				user_tipo: { type: "enum", values: ["admin", "funcionario", "professor"], optional: true },
				permissoes: { type: "array", optional: true, items: "object" }
			},
			async handler(ctx) {
				if (!ctx.meta || !ctx.meta.user || !ctx.meta.user.id) {
					throw new Error("Não autenticado.");
				}

				const userId = ctx.meta.user.id; // ✅ Definido corretamente
				const { user_nome, user_email, user_senha, user_tipo, permissoes } = ctx.params;

				const user = await this.adapter.model.findByPk(userId);
				if (!user) throw new Error("Utilizador não encontrado.");

				if (user_nome) user.user_nome = user_nome;
				if (user_email) user.user_email = user_email;

				if (user_tipo) {
					if (ctx.meta.user.tipo !== "admin") throw new Error("Apenas administradores podem alterar o tipo.");
					user.user_tipo = user_tipo;
				}

				if (user_senha) {
					const hashed = await bcrypt.hash(user_senha, 16);
					user.user_senha = hashed;
				}

				await user.save();

				if (permissoes && permissoes.length > 0) {
					await Permissao.destroy({ where: { perm_fk_user: userId } });

					const novasPerms = permissoes.map(p => ({
						perm_fk_user: userId,
						perm_modulo: p.perm_modulo,
						perm_acao: p.perm_acao
					}));

					await Permissao.bulkCreate(novasPerms);
				}

				return { message: "Utilizador atualizado com sucesso." };
			}
		},


		loginUser: {
			params: {
				user_email: { type: "email" },
				user_senha: { type: "string", min: 6 }
			},
			async handler(ctx) {
				const { user_email, user_senha } = ctx.params;

				const user = await this.adapter.findOne({ where: { user_email:user_email } });
				if (!user) throw new Error("Email ou palavra-passe inválidos.");

				const valid = await bcrypt.compare(user_senha, user.user_senha);
				if (!valid) throw new Error("Email ou palavra-passe inválidos.");

				const token = jwt.sign(
					{ id: user.user_id, tipo: user.user_tipo, nome: user.user_nome },
					process.env.JWT_SECRET || "segredo_muito_forte",
					{ expiresIn: "1d" }
				);

				return {
					message: "Login realizado com sucesso.",
					token
				};
			}
		}
	}
};

