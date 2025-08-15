// models/user.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('tb_users', {
  user_id:     { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_nome:   { type: DataTypes.STRING(100), allowNull: false },
  user_email:  { type: DataTypes.STRING(255), allowNull: false, unique: true },
  user_senha:  { type: DataTypes.STRING(255), allowNull: false },
  user_status: { type: DataTypes.ENUM('ativo','inativo'), allowNull: false, defaultValue: 'ativo' }
}, {
  tableName: 'tb_users',
  freezeTableName: true,
  timestamps: true
});
module.exports = User;
