// services/api.service.js

const ApiGateway = require("moleculer-web");
const jwt = require("jsonwebtoken");
const { actions } = require("./almocos.service");

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
					"POST /requisicoes/:id/decidir": { action: "requisicoes.decidir", module: "requisicao", actionName: "criar" },
					"POST /requisicoes/:id/devolver": { action: "requisicoes.devolver", module: "requisicao", actionName: "criar" },
					"POST /requisicoes/:id/atender": { action: "requisicoes.atender", module: "requisicao", actionName: "criar" },

					// ===== Vendas (Caixa de loja) =====
					"GET    /vendas": { action: "vendas.list", module: "venda", actionName: "visualizar" },
					"GET    /vendas/:id": { action: "vendas.get", module: "venda", actionName: "visualizar" },
					"POST   /vendas": { action: "vendas.create", module: "venda", actionName: "criar" },
					"POST   /vendas/:id/itens": { action: "vendas.addItem", module: "venda", actionName: "criar" },
					"DELETE /vendas/:id/itens/:itemId": { action: "vendas.removeItem", module: "venda", actionName: "criar" },
					"POST   /vendas/:id/desconto": { action: "vendas.desconto", module: "venda", actionName: "criar" },
					"POST   /vendas/:id/pagar": { action: "vendas.pagar", module: "venda", actionName: "criar" },
					"POST   /vendas/:id/cancelar": { action: "vendas.cancelar", module: "venda", actionName: "eliminar" },
					"POST /vendas/requisitar":{action:"vendasService.requisitar", module:"venda", actionName:"criar"},

					// ===== Caixa (um por dia) =====
					"GET    /caixas/aberto": { action: "caixas.aberto", module: "venda", actionName: "visualizar" },
					"POST   /caixas/abrir": { action: "caixas.abrir", module: "venda", actionName: "criar" },
					"POST   /caixas/fechar": { action: "caixas.fechar", module: "venda", actionName: "criar" },

					// Perfil (autoatendimento)
					"GET    /profile": { action: "profile.me", module: "profile", actionName: "self" },
					"PUT    /profile": { action: "profile.update", module: "profile", actionName: "self" },
					"PUT    /profile/password": { action: "profile.changePassword", module: "profile", actionName: "self" },

					// Recibos
					"POST   /vendas/:id/recibo": { action: "recibos.gerar", module: "recibo", actionName: "gerarRecibo" },
					"POST   /vendas/:id/recibo/pdf": { action: "recibos.receiptPdf", module: "recibo", actionName: "gerarRecibo" },
					"GET    /recibos/:id/pdf": { action: "recibos.pdf", module: "recibo", actionName: "visualizar" },
					// Dashboard
					"GET    /dashboard/resumo": { action: "dashboard.resumo", module: "dashboard", actionName: "visualizar" },

					// ============================================================
					// ================= MÓDULO ALMOÇOS (junto a Vendas) =========
					// ============================================================

					// ---- Configurações de Almoço ----
					"GET    /configuracoes": { action: "configuracoes.list", module: "configurar", actionName: "visualizar" },
					"GET    /configuracoes/:chave": { action: "configuracoes.get", module: "configurar", actionName: "visualizar" },
					"GET    /configuracoes/value/:chave": { action: "configuracoes.getValue", module: "configurar", actionName: "visualizar" },
					"POST   /configuracoes": { action: "configuracoes.upsert", module: "configurar", actionName: "editar" },
					"POST   /configuracoes/bulk": { action: "configuracoes.bulkUpsert", module: "configurar", actionName: "editar" },

					// ---- Almoços (preço + relatórios) ----
					"PUT   /almocos/preco": { action: "almocos.atualizarPrecoPadrao", module: "almoço", actionName: "editar" },
					"GET   /almocos/preco-padrao": { action: "almocos.precoPadrao", module: "almoço", actionName: "visualizar" },
					"GET   /almocos/relatorios/por-data": { action: "almocos.relatorioPorData", module: "alomoço", actionName: "visualizar" },
					"GET   /almocos/relatorios/intervalo": { action: "almocos.relatorioIntervalo", module: "almoço", actionName: "visualizar" },
					"GET   /almocos/relatorios/mensal": { action: "almocos.relatorioMensal", module: "almoço", actionName: "visualizar" },
					"GET   /almocos/relatorios/hoje": { action: "almocos.relatorioHoje", module: "almoço", actionName: "visualizar" },


					// ---- Marcações de Almoço ----
					"POST   /marcacoes": { action: "marcacoes.marcar", module: "almoço", actionName: "criar" },
					"POST /marcacoes/bulk": { action: "marcacoes.bulk", module: "almoço", actionName: "criar" },
					"PUT  /marcacoes/:id": { action: "marcacoes.atualizar", module: "almoço", actionName: "editar" },
					"GET    /marcacoes/marcados": { action: "marcacoes.marcados", module: "almoço", actionName: "visualizar" },

					// ---- Alunos (base do módulo Almoço) ----
					"GET    /alunos": { action: "alunos.list", module: "aluno", actionName: "visualizar" },
					"POST   /alunos": { action: "alunos.create", module: "aluno", actionName: "criar" },
					"PUT  /alunos/:id": { action: "alunos.update", module: "aluno", actionName: "editar" },
					"DELETE /alunos/:id": { action: "alunos.remove", module: "aluno", actionName: "eliminar" },

					// ===== Relatórios =====
					"GET  relatorios/materiais/detalhado": { action: "relatorio.materiaisDetalhado", module: "relatorio", actionName: "visualizar" },
  "GET  relatorios/estoque/movimentacoes": { action: "relatorio.estoqueMovimentacoes", module: "relatorio", actionName: "visualizar" },
  "GET  relatorios/requisicoes": { action: "relatorio.requisicoesResumo", module: "relatorio", actionName: "visualizar" },
  "GET  relatorios/vendas": { action: "relatorio.vendasResumo", module: "relatorio", actionName: "visualizar" },
  "GET  relatorios/caixa": { action: "relatorio.caixaResumo", module: "relatorio", actionName: "visualizar" },
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
			if (route.path !== "/api") return;

			const alias = req.$alias;
			if (!alias || !alias.module || !alias.actionName) {
				throw new Error("Rota mal configurada: falta module/actionName.");
			}

			// ===== BYPASS PARA ADMIN =====
			const u = ctx.meta.user || {};
			const isAdmin =
				u.is_admin === true ||
				(Array.isArray(u.roles) && u.roles.includes("admin"));

			// (A) Se a rota é de relatório: só ADMIN acessa
			if (alias.module === "relatorio") {
				if (!isAdmin) throw new Error("Acesso negado: relatórios apenas para administradores.");
				return; // admin passa sem consultar ACL/BD
			}

			// ===== Demais módulos seguem a ACL normalmente =====
			const actionMap = {
				visualizar: "view",
				criar: "create",
				editar: "edit",
				eliminar: "delete",
				autorizar: "approve",
				requisitar: "request",
				gerarRecibo: "generate_receipt",
				logout: null,
				self: null
			};

			const { module, actionName } = alias;
			const actionCode = actionMap[actionName];
			if (!actionCode) return; // ex.: logout/self

			if (!ctx.meta.user || !ctx.meta.user.user_id) {
				throw new Error("Usuário não autenticado.");
			}

			const params = req.$params || {};
			const resourceId = params.id ? Number(params.id) : null;

			const ok = await ctx.call("permissions.check", {
				userId: ctx.meta.user.user_id,
				resourceType: module,
				actionCode,
				resourceId
			});

			if (!ok) throw new Error(`Acesso negado: ${module}:${actionName}`);
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
