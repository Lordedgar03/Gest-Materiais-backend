// models/role.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Role = sequelize.define('tb_roles', {
  role_id:   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  role_name: { type: DataTypes.STRING(50), allowNull: false, unique: true }
}, {
  tableName: 'tb_roles',
  freezeTableName: true,
  timestamps: false
});
module.exports = Role;