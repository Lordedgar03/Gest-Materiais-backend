// models/action.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Action = sequelize.define('tb_actions', {
  action_id:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  action_code:  { type: DataTypes.STRING(50), allowNull: false, unique: true },
  action_label: { type: DataTypes.STRING(100), allowNull: false }
}, {
  tableName: 'tb_actions',
  freezeTableName: true,
  timestamps: false
});
module.exports = Action;
