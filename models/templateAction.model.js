// models/templateAction.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TemplateAction = sequelize.define('tb_template_actions', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  template_id:   { type: DataTypes.INTEGER, allowNull: false },
  action_id:     { type: DataTypes.INTEGER, allowNull: false },
  resource_type: { type: DataTypes.STRING(50), allowNull: false }
}, {
  tableName: 'tb_template_actions',
  freezeTableName: true,
  timestamps: false
});
module.exports = TemplateAction;