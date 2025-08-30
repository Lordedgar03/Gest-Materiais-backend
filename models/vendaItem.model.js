"use strict";
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const VendaItem = sequelize.define(
  "tb_vendas_itens",
  {
    vni_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    vni_fk_venda: { type: DataTypes.INTEGER, allowNull: false },
    vni_fk_material: { type: DataTypes.INTEGER, allowNull: false },
    vni_qtd: { type: DataTypes.INTEGER, allowNull: false },
    vni_preco_unit: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    vni_total: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  },
  { tableName: "tb_vendas_itens", timestamps: false }
);

module.exports = VendaItem;
