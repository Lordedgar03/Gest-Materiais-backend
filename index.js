// index.js
const { ServiceBroker } = require("moleculer");
require("dotenv").config();


// Cria uma instância do Service Broker
const broker = new ServiceBroker({
	nodeID: "node-1",
	transporter: "TCP", // Substitua por "NATS" ou outro transporter se necessário
	logger: console,
	logLevel: "info",
});

// Carrega todos os serviços da pasta 'services'
broker.loadServices("./services");

// Inicia o broker
broker
	.start()
	.then(() => {
		console.log("Broker iniciado com sucesso!");
	})
	.catch((err) => {
		console.error("Erro ao iniciar o broker:", err);
	});
