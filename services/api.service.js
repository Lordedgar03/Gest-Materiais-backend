// services/api.service.js

const ApiGateway = require("moleculer-web");
const jwt = require("jsonwebtoken");

module.exports = {
	name: "api",
	mixins: [ApiGateway],
	settings: {
		port: 3000,

		routes: [
			{
				path: "/",
				aliases: {
					"POST users/login": "users.loginUser"
				},
				bodyParsers: { json: true, urlencoded: { extended: true } },
				cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }
			},
			{
				path: "/api",
				authentication: true,
				authorization: true,
				aliases: {
					// Usuários
					"POST   /users/logout": { action: "users.logout", module: "usuario", actionName: "logout" },
					"POST   /users": { action: "users.createuser", module: "usuario", actionName: "criar" },
					"GET    /users": { action: "users.listUsers", module: "usuario", actionName: "visualizar" },
					"GET    /users/:id": { action: "users.getUser", module: "usuario", actionName: "visualizar" },
					"PUT    /users/:id": { action: "users.updateUser", module: "usuario", actionName: "editar" },
					"GET    /users/recycle": { action: "users.listRecycleUsers", module: "usuario", actionName: "visualizar" },
					"DELETE /users/:id": { action: "users.deleteUser", module: "usuario", actionName: "eliminar" },

					// Categorias
					"GET    /categorias": { action: "categorias.find", module: "categoria", actionName: "visualizar" },
					"GET    /categorias/:id": { action: "categorias.get", module: "categoria", actionName: "visualizar" },
					"POST   /categorias": { action: "categorias.criar", module: "categoria", actionName: "criar" },
					"PUT    /categorias/:id": { action: "categorias.update", module: "categoria", actionName: "editar" },
					"DELETE /categorias/:id": { action: "categorias.remove", module: "categoria", actionName: "eliminar" },

					// Tipos
					"GET    /tipos": { action: "tipos.list", module: "tipo", actionName: "visualizar" },
					"GET    /tipos/:id": { action: "tipos.get", module: "tipo", actionName: "visualizar" },
					"POST   /tipos": { action: "tipos.create", module: "tipo", actionName: "criar" },
					"PUT    /tipos/:id": { action: "tipos.update", module: "tipo", actionName: "editar" },
					"DELETE /tipos/:id": { action: "tipos.delete", module: "tipo", actionName: "eliminar" },

					// Materiais
					"GET    /materiais": { action: "materiais.list", module: "material", actionName: "visualizar" },
					"GET    /materiais/:id": { action: "materiais.get", module: "material", actionName: "visualizar" },
					"POST   /materiais": { action: "materiais.create", module: "material", actionName: "criar" },
					"PUT    /materiais/:id": { action: "materiais.update", module: "material", actionName: "editar" },
					"DELETE /materiais/:id": { action: "materiais.delete", module: "material", actionName: "eliminar" },

					// Movimentacoes
					"GET    /movimentacoes": { action: "movimentacoes.list", module: "movimentacao", actionName: "visualizar" },
					"GET    /movimentacoes/:id": { action: "movimentacoes.get", module: "movimentacao", actionName: "visualizar" },
					"POST   /movimentacoes": { action: "movimentacoes.create", module: "movimentacao", actionName: "criar" },
					"PUT    /movimentacoes/:id": { action: "movimentacoes.update", module: "movimentacao", actionName: "editar" },
					"DELETE /movimentacoes/:id": { action: "movimentacoes.delete", module: "movimentacao", actionName: "eliminar" },

					// Requisições
					"GET    /requisicoes": { action: "requisicoes.list", module: "requisicao", actionName: "visualizar" },
					"GET    /requisicoes/:id": { action: "requisicoes.get", module: "requisicao", actionName: "visualizar" },
					"POST   /requisicoes": { action: "requisicoes.create", module: "requisicao", actionName: "criar" },
					"PUT    /requisicoes/:id": { action: "requisicoes.updateStatus", module: "requisicao", actionName: "editar" },
					"DELETE /requisicoes/:id": { action: "requisicoes.remove", module: "requisicao", actionName: "eliminar" },

					// Dashboard
					"GET    /dashboard/resumo": { action: "dashboard.resumo", module: "dashboard", actionName: "visualizar" }
				},
				bodyParsers: { json: true, urlencoded: { extended: true } },
				cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }
			}
		],

		assets: {
			folder: "public"
		}
	},

	methods: {
		// 1) Autentica: decodifica JWT e verifica blacklist
		async authenticate(ctx, route, req) {
			const auth = req.headers.authorization;
			if (!auth || !auth.startsWith("Bearer ")) {
				throw new Error("Token não fornecido.");
			}
			const token = auth.slice(7);

			// Verifica blacklist
			const black = await ctx.call("blacklist.check", { token });
			if (black) {
				throw new Error("Token revogado. Faça login novamente.");
			}

			try {
				const decoded = jwt.verify(token, process.env.JWT_SECRET || "segredo_muito_forte");
				ctx.meta.user = decoded;
				ctx.meta.token = token;
				return decoded;
			} catch (err) {
				ctx.meta.$statusCode = 401;
				throw new Error("Token inválido ou expirado.");
			}
		},



		// 2) Autoriza: usa o serviço de permissões genérico
		async authorize(ctx, route, req) {
			// Só proteger rotas em /api
			if (route.path !== "/api") return;

			// Verifica se o alias foi configurado corretamente
			const alias = req.$alias;
			if (!alias || !alias.module || !alias.actionName) {
				throw new Error("Rota mal configurada: falta module/actionName.");
			}

			// Mapa PT → códigos da sua ACL
			const actionMap = {
				visualizar: "view",
				criar: "create",
				editar: "edit",
				eliminar: "delete",
				autorizar: "approve",
				requisitar: "request",
				gerarRecibo: "generate_receipt",
				logout: null
			};

			const { module, actionName } = alias;
			const actionCode = actionMap[actionName];

			// Se for logout (actionCode null) não faz checagem de permissão
			if (!actionCode) return;

			// Garante que o usuário foi autenticado
			if (!ctx.meta.user || !ctx.meta.user.user_id) {
				throw new Error("Usuário não autenticado.");
			}
			const userId = ctx.meta.user.user_id;

			// Pega o ID do recurso usando req.$params (sempre existe, mas pode vir vazio)
			const params = req.$params || {};
			const resourceId = params.id
				? Number(params.id)
				: null;

			// Chama seu serviço de ACL
			const ok = await ctx.call("permissions.check", {
				userId,
				resourceType: module,
				actionCode,
				resourceId
			});

			if (!ok) {
				throw new Error(`Acesso negado: ${module}:${actionName}`);
			}
		}



	},

	async started() {
		console.log("=== ALIASES REGISTRADOS ===");
		this.settings.routes.forEach(route => {
			if (route.aliases) {
				console.log(`Rota ${route.path}:`);
				Object.keys(route.aliases).forEach(a => console.log("  -", a));
			}
		});
	}
};
