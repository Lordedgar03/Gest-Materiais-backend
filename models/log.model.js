// models/log.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Log = sequelize.define('tb_logs', {
  log_id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  log_action:    { type: DataTypes.STRING(50), allowNull: false },
  log_table:     { type: DataTypes.STRING(50), allowNull: false },
  log_description: { type: DataTypes.TEXT },
  log_date:      { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  tableName: 'tb_logs',
  freezeTableName: true,
  timestamps: false
});
module.exports = Log;