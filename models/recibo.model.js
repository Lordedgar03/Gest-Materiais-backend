"use strict";
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Recibo = sequelize.define(
  "tb_recibos",
  {
    rec_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    rec_fk_user: { type: DataTypes.INTEGER, allowNull: false },
    rec_tipo: { type: DataTypes.ENUM("Almoço","Venda de Material"), allowNull: false },
    rec_total: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    rec_ref: { type: DataTypes.STRING(100), allowNull: true },
    rec_fk_venda: { type: DataTypes.INTEGER, allowNull: true },
    rec_cliente_nome: { type: DataTypes.STRING(120), allowNull: true },
    rec_fk_almoco: { type: DataTypes.INTEGER, allowNull: true },
    data: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  },
  { tableName: "tb_recibos", timestamps: false }
);

module.exports = Recibo;
