"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Categoria = sequelize.define(
  "tb_categorias",
  {
    cat_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    cat_nome: {
      type: DataTypes.STRING(50),
      allowNull: false
    }
  },
  {
    tableName: "tb_categorias",
    timestamps: false
  }
);

module.exports = Categoria;
