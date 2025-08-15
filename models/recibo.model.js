// models/recibo.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Recibo = sequelize.define('tb_recibos', {
  rec_id:      { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  rec_fk_user: { type: DataTypes.INTEGER, allowNull: false },
  rec_tipo:    { type: DataTypes.ENUM('Almoço','Venda de Material'), allowNull: false },
  rec_total:   { type: DataTypes.FLOAT, allowNull: false },
  data:        { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  tableName: 'tb_recibos',
  freezeTableName: true,
  timestamps: false
});
module.exports = Recibo;
