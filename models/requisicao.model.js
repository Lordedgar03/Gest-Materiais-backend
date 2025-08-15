// models/requisicao.model.js
"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Requisicao = sequelize.define(
  "requisicao",
  {
    req_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    req_codigo: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true
    },
    req_fk_user: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    req_status: {
      type: DataTypes.ENUM(
        "Pendente",
        "Aprovada",
        "Atendida",
        "Em Uso",
        "Parcial",
        "Devolvida",
        "Rejeitada",
        "Cancelada"
      ),
      allowNull: false,
      defaultValue: "Pendente"
    },
    req_date: {
      type: DataTypes.DATE, // DATETIME
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    req_needed_at: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    req_local_entrega: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    req_justificativa: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    req_observacoes: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    req_approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    req_approved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: "tb_requisicoes",
    timestamps: false
  }
);

module.exports = Requisicao;
