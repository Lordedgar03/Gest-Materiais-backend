"use strict";
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const AlunoAlmoco = sequelize.define(
  "tb_alunos_almocos",
  {
    ala_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ala_fk_aluno: { type: DataTypes.INTEGER, allowNull: false },
    ala_fk_almoco: { type: DataTypes.INTEGER, allowNull: false },
    ala_status: { type: DataTypes.ENUM("Marcado","Pago","Cancelado"), allowNull: false, defaultValue: "Marcado" },
    ala_valor: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    ala_obs: { type: DataTypes.STRING(255), allowNull: true },
    ala_criado_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    ala_pago_em: { type: DataTypes.DATE, allowNull: true }
  },
  { tableName: "tb_alunos_almocos", timestamps: false }
);

module.exports = AlunoAlmoco;
