// models/userTemplate.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const UserTemplate = sequelize.define('tb_user_templates', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  template_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  resource_type: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  resource_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'tb_user_templates',
  freezeTableName: true,
  timestamps: false
});

module.exports = UserTemplate;
