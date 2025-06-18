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
				authentication: false,
				authorization: false,
				aliases: {
					"POST users/login": "users.loginUser"
				},
				bodyParsers: {
					json: true,
					urlencoded: { extended: true }
				},
				cors: {
					origin: "*",
					methods: ["GET", "POST", "PUT", "DELETE"]
				}
			},
			{
				path: "/api",
				authentication: true,
				authorization: true,
				aliases: {
					"POST users": {
						action: "users.createuser",
						roles: ["admin"]
					},
					"GET users": {
						action: "users.listUsers",
						roles: ["admin", "funcionario"]
					},
					"GET users/:id": {
						action: "users.getUser",
						roles: ["admin", "funcionario"]
					},
					"PUT users": {
						action: "users.updateUser",
						roles: ["admin", "funcionario", "professor"]
					}
				},
				bodyParsers: {
					json: true,
					urlencoded: { extended: true }
				},
				cors: {
					origin: "*",
					methods: ["GET", "POST", "PUT", "DELETE"]
				}
			}
		],
		assets: {
			folder: "public"
		}
	},
	methods: {
		async authenticate(ctx, route, req) {
			const auth = req.headers.authorization;
			if (!auth || !auth.startsWith("Bearer ")) {
				throw new Error("Token não fornecido.");
			}

			const token = auth.slice(7);
			try {
				const decoded = jwt.verify(token, process.env.JWT_SECRET || "segredo_muito_forte");
				ctx.meta.user = {
					id: decoded.id,
					nome: decoded.nome,
					tipo: decoded.tipo
				};
				return ctx.meta.user;
			} catch (err) {
				throw new Error("Token inválido ou expirado.");
			}
		},
		async authorize(ctx, route, req) {
			const roles = route && route.opts && route.opts.roles;
			const userTipo = ctx.meta.user && ctx.meta.user.tipo;

			if (roles && !roles.includes(userTipo)) {
				throw new Error(`Acesso negado. O tipo '${userTipo}' não tem permissão para esta operação.`);
			}
		}
	}
};
