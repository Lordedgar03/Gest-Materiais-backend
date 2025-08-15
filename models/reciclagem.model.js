// models/reciclagem.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Reciclagem = sequelize.define('tb_reciclagem', {
  reci_id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  reci_table:       { type: DataTypes.STRING(50), allowNull: false },
  reci_record_id:   { type: DataTypes.INTEGER, allowNull: false },
  reci_action:      { type: DataTypes.ENUM('delete','update'), allowNull: false },
  reci_data:        { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  reci_data_antiga: { type: DataTypes.JSON },
  reci_data_nova:   { type: DataTypes.JSON },
  reci_fk_user:     { type: DataTypes.INTEGER }
}, {
  tableName: 'tb_reciclagem',
  freezeTableName: true,
  timestamps: false
});
module.exports = Reciclagem;