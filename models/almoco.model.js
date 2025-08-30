"use strict";
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Almoco = sequelize.define(
  "tb_almocos",
  {
    alm_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    alm_data: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
    alm_preco: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    alm_status: { type: DataTypes.ENUM("aberto","fechado"), allowNull: false, defaultValue: "aberto" },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  },
  { tableName: "tb_almocos", timestamps: false }
);

module.exports = Almoco;
