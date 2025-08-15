// models/tokenBlacklist.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TokenBlacklist = sequelize.define('tb_token_blacklist', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  token:      { type: DataTypes.TEXT, allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false }
}, {
  tableName: 'tb_token_blacklist',
  freezeTableName: true,
  timestamps: false
});
module.exports = TokenBlacklist;
