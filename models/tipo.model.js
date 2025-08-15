"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Tipo = sequelize.define(
  "tb_tipos",
  {
    tipo_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tipo_nome: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    tipo_fk_categoria: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  },
  {
    tableName: "tb_tipos",
    timestamps: false
  }
);

module.exports = Tipo;
