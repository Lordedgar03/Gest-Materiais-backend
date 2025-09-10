"use strict";
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Aluno = sequelize.define(
  "Aluno", // nome do model (lógico)
  {
    alu_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    alu_nome: { type: DataTypes.STRING(120), allowNull: false },

    // novos campos no schema
    alu_num_processo: { type: DataTypes.INTEGER, allowNull: false, },
    alu_ano:          { type: DataTypes.INTEGER, allowNull: false },

    alu_numero: { type: DataTypes.STRING(40), allowNull: true },
    alu_turma:  { type: DataTypes.STRING(80), allowNull: true },

    alu_status: {
      type: DataTypes.ENUM("ativo", "inativo"),
      allowNull: false,
      defaultValue: "ativo"
    },

    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  },
  {
    tableName: "tb_alunos",
    timestamps: false,
    indexes: [
      { name: "idx_aluno_nome", fields: ["alu_nome"] },
      // se quiseres garantir unicidade do nº de processo, descomenta:
      // { name: "uk_aluno_num_processo", unique: true, fields: ["alu_num_processo"] },
    ]
  }
);

module.exports = Aluno;
