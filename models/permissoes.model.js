// models/permissoes.model.js

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Permissao = sequelize.define("tb_permissoes", {
	perm_id: {
		type: DataTypes.INTEGER,
		primaryKey: true,
		autoIncrement: true
	},
	perm_fk_user: {
		type: DataTypes.INTEGER,
		allowNull: false
	},
	perm_modulo: {
		type: DataTypes.STRING,
		allowNull: false
	},
	perm_acao: {
		type: DataTypes.STRING,
		allowNull: false
	}
}, {
	timestamps: false,
	freezeTableName: true
});

module.exports = Permissao;
