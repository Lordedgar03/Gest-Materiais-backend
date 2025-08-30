"use strict";
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Venda = sequelize.define(
  "tb_vendas",
  {
    ven_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ven_codigo: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    ven_fk_caixa: { type: DataTypes.INTEGER, allowNull: false },
    ven_fk_user: { type: DataTypes.INTEGER, allowNull: false },
    ven_cliente_nome: { type: DataTypes.STRING(120), allowNull: false },
    ven_status: { type: DataTypes.ENUM("Aberta","Paga","Cancelada","Estornada"), allowNull: false, defaultValue: "Aberta" },
    ven_subtotal: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
    ven_desconto: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
    ven_total: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
    ven_obs: { type: DataTypes.STRING(255), allowNull: true },
    ven_data: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  },
  { tableName: "tb_vendas", timestamps: false }
);

module.exports = Venda;
