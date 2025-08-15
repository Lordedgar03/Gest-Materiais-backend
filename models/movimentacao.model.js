// models/movimentacao.model.js
"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Movimentacao = sequelize.define("movimentacao", {
  mov_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  mov_fk_material: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  // NOVOS CAMPOS
  mov_material_nome: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  mov_tipo_nome: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  // FIM DOS NOVOS CAMPOS
  mov_tipo: {
    type: DataTypes.ENUM("entrada", "saida"),
    allowNull: false
  },
  mov_quantidade: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  mov_data: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  mov_descricao: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: ""
  },
  mov_preco: {
    type: DataTypes.DECIMAL(10,2),
    allowNull: false
  },
  mov_fk_requisicao: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: "tb_movimentacoes",
  timestamps: false
});

module.exports = Movimentacao;
