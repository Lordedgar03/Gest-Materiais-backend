"use strict";
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Aluno = sequelize.define(
  "tb_alunos",
  {
    alu_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    alu_nome: { type: DataTypes.STRING(120), allowNull: false },
    alu_numero: { type: DataTypes.STRING(40), allowNull: true },
    alu_turma: { type: DataTypes.STRING(80), allowNull: true },
    alu_status: { type: DataTypes.ENUM("ativo","inativo"), allowNull: false, defaultValue: "ativo" },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  },
  { tableName: "tb_alunos", timestamps: false }
);

module.exports = Aluno;
