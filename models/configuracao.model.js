"use strict";
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Configuracao = sequelize.define(
  "tb_configuracoes",
  {
    cfg_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cfg_chave: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    cfg_valor_s: { type: DataTypes.STRING(255), allowNull: true },
    cfg_valor_n: { type: DataTypes.DECIMAL(10,2), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  },
  { tableName: "tb_configuracoes", timestamps: false }
);

module.exports = Configuracao;
