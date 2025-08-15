// models/permissionTemplate.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const PermissionTemplate = sequelize.define('tb_permission_templates', {
  template_id:   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  template_code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  template_label:{ type: DataTypes.STRING(100), allowNull: false }
}, {
  tableName: 'tb_permission_templates',
  freezeTableName: true,
  timestamps: false
});
module.exports = PermissionTemplate;