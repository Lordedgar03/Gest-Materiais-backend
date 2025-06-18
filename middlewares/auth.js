const jwt = require("jsonwebtoken");

module.exports = async function authMiddleware(ctx, route, req) {
	const auth = req.headers.authorization;

	if (!auth || !auth.startsWith("Bearer ")) {
		throw new Error("Token não fornecido.");
	}

	const token = auth.slice(7);

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET || "segredo_muito_forte");

		console.log("Auth header:", auth);
		console.log("Decoded:", decoded);
		console.log("Route roles:", route && route.opts && route.opts.roles);
		console.log("User tipo:", decoded.tipo);

		ctx.meta.user = {
			id: decoded.id,
			nome: decoded.nome,
			tipo: decoded.tipo
		};

		// ✅ Verifica papéis permitidos para a rota
		const roles = route && route.opts && route.opts.roles;
		if (roles && !roles.includes(decoded.tipo)) {
			// Aqui o token é válido, mas o tipo não tem acesso
			throw new Error(`Acesso negado. O tipo '${decoded.tipo}' não tem permissão para esta operação.`);
		}
		// ✅ Retorna sucesso explícito
		return Promise.resolve();
		
	} catch (err) {
		// ⚠️ Distinção clara entre erro de permissão e erro de token
		if (err.message.startsWith("Acesso negado")) {
			throw err;
		}
		throw new Error("Token inválido ou expirado.");
	}
};
