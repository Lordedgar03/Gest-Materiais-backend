// models/requisicaoDecisao.model.js
"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const RequisicaoDecisao = sequelize.define(
  "requisicao_decisao",
  {
    dec_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    dec_fk_requisicao: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    dec_fk_user: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    dec_tipo: {
      type: DataTypes.ENUM("Aprovar", "Rejeitar", "Cancelar"),
      allowNull: false
    },
    dec_motivo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    dec_data: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: "tb_requisicoes_decisoes",
    timestamps: false
  }
);

module.exports = RequisicaoDecisao;
