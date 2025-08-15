// models/userRole.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const UserRole = sequelize.define('tb_user_roles', {
  ur_id:   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  role_id: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'tb_user_roles',
  freezeTableName: true,
  timestamps: false
});
module.exports = UserRole;
