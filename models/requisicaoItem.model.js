// models/requisicaoItem.model.js
"use strict";

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const RequisicaoItem = sequelize.define(
  "requisicao_item",
  {
    rqi_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    rqi_fk_requisicao: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    rqi_fk_material: {
      type: DataTypes.INTEGER,
      allowNull: true // ON DELETE SET NULL na base
    },
    rqi_descricao: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    rqi_quantidade: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    rqi_qtd_atendida: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    // ---- Devolução ----
    rqi_devolvido: {
      type: DataTypes.ENUM("Nao", "Parcial", "Sim"),
      allowNull: false,
      defaultValue: "Nao"
    },
    rqi_qtd_devolvida: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    rqi_data_devolucao: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rqi_condicao_retorno: {
      type: DataTypes.ENUM("Boa", "Danificada", "Perdida"),
      allowNull: true
    },
    rqi_obs_devolucao: {
      type: DataTypes.STRING(255),
      allowNull: true
    },

    // ---- Status por item ----
    rqi_status: {
      type: DataTypes.ENUM("Pendente", "Atendido", "Em Uso", "Parcial", "Devolvido", "Cancelado"),
      allowNull: false,
      defaultValue: "Pendente"
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
    tableName: "tb_requisicoes_itens",
    timestamps: false
  }
);

module.exports = RequisicaoItem;
