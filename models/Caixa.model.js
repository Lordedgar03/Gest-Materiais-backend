"use strict";
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Caixa = sequelize.define(
  "tb_caixas",
  {
    cx_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    cx_data: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
    cx_status: { type: DataTypes.ENUM("Aberto", "Fechado"), allowNull: false, defaultValue: "Aberto" },
    cx_aberto_por: { type: DataTypes.INTEGER, allowNull: false },
    cx_aberto_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    cx_saldo_inicial: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
    cx_qtd_vendas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    cx_total_vendas: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
    cx_saldo_final: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
    cx_fechado_por: { type: DataTypes.INTEGER, allowNull: true },
    cx_fechado_em: { type: DataTypes.DATE, allowNull: true },
    cx_obs: { type: DataTypes.STRING(255), allowNull: true }
  },
  { tableName: "tb_caixas", timestamps: false }
);

module.exports = Caixa;
