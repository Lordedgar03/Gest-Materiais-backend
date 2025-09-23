"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Material = sequelize.define(
  "tb_materiais",
  {
    mat_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    mat_nome: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    mat_descricao: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    mat_preco: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    mat_quantidade_estoque: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    mat_estoque_minimo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    },
    mat_fk_tipo: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    mat_localizacao: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    mat_vendavel: {
      type: DataTypes.ENUM("SIM", "NAO"),
      allowNull: false,
      defaultValue: "SIM"
    },
    mat_status: {
      type: DataTypes.ENUM("ativo", "inativo"),
      allowNull: false,
      defaultValue: "ativo"
    },
    mat_consumivel: {
      type: DataTypes.ENUM("sim", "não"),
      allowNull: false,
      defaultValue: "não"
    }

  },
  {
    tableName: "tb_materiais",
    timestamps: false
  }
);

module.exports = Material;
