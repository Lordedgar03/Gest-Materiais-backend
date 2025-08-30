// models/index.js
const sequelize            = require('../config/db');
const User                 = require('./user.model');
const Role                 = require('./role.model');
const UserRole             = require('./userRole.model');
const Log                  = require('./log.model');
const Recibo               = require('./recibo.model');
const Categoria            = require('./categoria.model');
const Tipo                 = require('./tipo.model');
const Material             = require('./material.model');
const Requisicao           = require('./requisicao.model');
const RequisicaoItem       = require('./requisicaoItem.model');
const RequisicaoDecisao    = require('./requisicaoDecisao.model');
const Movimentacao         = require('./movimentacao.model');
const Reciclagem           = require('./reciclagem.model');
const TokenBlacklist       = require('./tokenBlacklist.model');
const PermissionTemplate   = require('./permissionTemplate.model');
const Action               = require('./action.model');
const TemplateAction       = require('./templateAction.model');
const UserTemplate         = require('./userTemplate.model');

// === Novos models (apenas adicionados) ===
const Caixa               = require('./Caixa.model');
const Venda                = require('./venda.model');
const VendaItem            = require('./vendaItem.model');
const Aluno                = require('./aluno.model');
const Configuracao         = require('./configuracao.model');
const Almoco               = require('./almoco.model');
const AlunoAlmoco          = require('./alunoAlmoco.model');

// -----------------------------------------------------------------------------
// 1) Associação direta para UserRole → Role (usada, por exemplo, no loginUser)
//    **usando alias único** loginRole
// -----------------------------------------------------------------------------
UserRole.belongsTo(Role, {
  foreignKey: "role_id",
  targetKey:  "role_id",
  as:         "loginRole"       // <— foi alterado de "role"
});
Role.hasMany(UserRole, {
  foreignKey: "role_id",
  sourceKey:  "role_id",
  as:         "loginUserRoles"  // <— alias único complementar
});

// -----------------------------------------------------------------------------
// 2) Associação User ↔ UserRole
// -----------------------------------------------------------------------------
User.hasMany(UserRole, {
  foreignKey: "user_id",
  sourceKey:  "user_id",
  as:         "userRoles"
});
UserRole.belongsTo(User, {
  foreignKey: "user_id",
  targetKey:  "user_id",
  as:         "user"
});

// -----------------------------------------------------------------------------
// 3) Many-to-many User ↔ Role via UserRole
// -----------------------------------------------------------------------------
User.belongsToMany(Role, {
  through:    UserRole,
  foreignKey: "user_id",
  otherKey:   "role_id",
  as:         "roles"         // Papéis normais
});
Role.belongsToMany(User, {
  through:    UserRole,
  foreignKey: "role_id",
  otherKey:   "user_id",
  as:         "users"
});

// -----------------------------------------------------------------------------
// 4) PermissionTemplate ↔ TemplateAction
// -----------------------------------------------------------------------------
PermissionTemplate.hasMany(TemplateAction, {
  foreignKey: "template_id",
  sourceKey:  "template_id",
  as:         "templateActions"
});
TemplateAction.belongsTo(PermissionTemplate, {
  foreignKey: "template_id",
  targetKey:  "template_id",
  as:         "template"
});

// -----------------------------------------------------------------------------
// 5) TemplateAction ↔ Action
// -----------------------------------------------------------------------------
TemplateAction.belongsTo(Action, {
  foreignKey: "action_id",
  targetKey:   "action_id",
  as:          "action"
});
Action.hasMany(TemplateAction, {
  foreignKey: "action_id",
  sourceKey:  "action_id",
  as:         "templateActions"
});

// -----------------------------------------------------------------------------
// 6) User ↔ PermissionTemplate (via tb_user_templates)
// -----------------------------------------------------------------------------
User.belongsToMany(PermissionTemplate, {
  through:    UserTemplate,
  foreignKey: "user_id",
  otherKey:   "template_id",
  as:         "permissionTemplates"
});
PermissionTemplate.belongsToMany(User, {
  through:    UserTemplate,
  foreignKey: "template_id",
  otherKey:   "user_id",
  as:         "users"
});

// -----------------------------------------------------------------------------
// 7) Associação direta para includes de UserTemplate
// -----------------------------------------------------------------------------
UserTemplate.belongsTo(PermissionTemplate, {
  foreignKey: "template_id",
  targetKey:  "template_id",
  as:         "permissionTemplate"
});
PermissionTemplate.hasMany(UserTemplate, {
  foreignKey: "template_id",
  sourceKey:  "template_id",
  as:         "userTemplates"
});

// -----------------------------------------------------------------------------
// 8) Reciclagem ↔ User (audit)
// -----------------------------------------------------------------------------
Reciclagem.belongsTo(User, {
  foreignKey: "reci_fk_user",
  targetKey:  "user_id",
  as:         "user"
});
User.hasMany(Reciclagem, {
  foreignKey: "reci_fk_user",
  sourceKey:  "user_id",
  as:         "reciclagens"
});

// -----------------------------------------------------------------------------
// 9) Categoria ↔ Tipo ↔ Material
// -----------------------------------------------------------------------------
Categoria.hasMany(Tipo, {
  foreignKey: "tipo_fk_categoria",
  sourceKey:  "cat_id",
  as:         "tipos"
});
Tipo.belongsTo(Categoria, {
  foreignKey: "tipo_fk_categoria",
  targetKey:  "cat_id",
  as:         "categoria"
});
Tipo.hasMany(Material, {
  foreignKey: "mat_fk_tipo",
  sourceKey:  "tipo_id",
  as:         "materiais"
});
Material.belongsTo(Tipo, {
  foreignKey: "mat_fk_tipo",
  targetKey:  "tipo_id",
  as:         "tipo"
});

// Requisicao ↔ User (quem requisitou)
Requisicao.belongsTo(User, {
  foreignKey: "req_fk_user",
  targetKey:  "user_id",
  as:         "usuario"
});
User.hasMany(Requisicao, {
  foreignKey: "req_fk_user",
  sourceKey:  "user_id",
  as:         "requisicoes"
});

// Requisicao ↔ User (quem aprovou/rejeitou/cancelou)
Requisicao.belongsTo(User, {
  foreignKey: "req_approved_by",
  targetKey:  "user_id",
  as:         "aprovador"
});

// RequisicaoItem ↔ Requisicao
RequisicaoItem.belongsTo(Requisicao, {
  foreignKey: "rqi_fk_requisicao",
  targetKey:  "req_id",
  as:         "requisicao"
});
Requisicao.hasMany(RequisicaoItem, {
  foreignKey: "rqi_fk_requisicao",
  sourceKey:  "req_id",
  as:         "itens"
});

// RequisicaoItem ↔ Material
RequisicaoItem.belongsTo(Material, {
  foreignKey: "rqi_fk_material",
  targetKey:  "mat_id",
  as:         "material"
});
Material.hasMany(RequisicaoItem, {
  foreignKey: "rqi_fk_material",
  sourceKey:  "mat_id",
  as:         "requisicaoItens"
});

// RequisicaoDecisao ↔ Requisicao
RequisicaoDecisao.belongsTo(Requisicao, {
  foreignKey: "dec_fk_requisicao",
  targetKey:  "req_id",
  as:         "requisicao"
});
Requisicao.hasMany(RequisicaoDecisao, {
  foreignKey: "dec_fk_requisicao",
  sourceKey:  "req_id",
  as:         "decisoes"
});

// RequisicaoDecisao ↔ User (quem decidiu)
RequisicaoDecisao.belongsTo(User, {
  foreignKey: "dec_fk_user",
  targetKey:  "user_id",
  as:         "decisor"
});
User.hasMany(RequisicaoDecisao, {
  foreignKey: "dec_fk_user",
  sourceKey:  "user_id",
  as:         "decisoesTomadas"
});

// -----------------------------------------------------------------------------
// 10) Vendas & Caixa (NOVO)
// -----------------------------------------------------------------------------
Caixa.hasMany(Venda, {
  foreignKey: "ven_fk_caixa",
  sourceKey:  "cx_id",
  as:         "vendas"
});
Venda.belongsTo(Caixa, {
  foreignKey: "ven_fk_caixa",
  targetKey:  "cx_id",
  as:         "caixa"
});

Venda.hasMany(VendaItem, {
  foreignKey: "vni_fk_venda",
  sourceKey:  "ven_id",
  as:         "itens"
});
VendaItem.belongsTo(Venda, {
  foreignKey: "vni_fk_venda",
  targetKey:  "ven_id",
  as:         "venda"
});

// -----------------------------------------------------------------------------
// 11) Almoços (NOVO)
// -----------------------------------------------------------------------------
Almoco.hasMany(AlunoAlmoco, {
  foreignKey: "ala_fk_almoco",
  sourceKey:  "alm_id",
  as:         "marcacoes"
});
AlunoAlmoco.belongsTo(Almoco, {
  foreignKey: "ala_fk_almoco",
  targetKey:  "alm_id",
  as:         "almoco"
});

Aluno.hasMany(AlunoAlmoco, {
  foreignKey: "ala_fk_aluno",
  sourceKey:  "alu_id",
  as:         "almocos"
});
AlunoAlmoco.belongsTo(Aluno, {
  foreignKey: "ala_fk_aluno",
  targetKey:  "alu_id",
  as:         "aluno"
});

// -----------------------------------------------------------------------------
// 12) Recibo ↔ User/Venda/Almoço (NOVO)
// -----------------------------------------------------------------------------
Recibo.belongsTo(User, {
  foreignKey: "rec_fk_user",
  targetKey:  "user_id",
  as:         "operador"
});
User.hasMany(Recibo, {
  foreignKey: "rec_fk_user",
  sourceKey:  "user_id",
  as:         "recibosEmitidos"
});

Recibo.belongsTo(Venda, {
  foreignKey: "rec_fk_venda",
  targetKey:  "ven_id",
  as:         "venda"
});
Venda.hasMany(Recibo, {
  foreignKey: "rec_fk_venda",
  sourceKey:  "ven_id",
  as:         "recibos"
});

Recibo.belongsTo(AlunoAlmoco, {
  foreignKey: "rec_fk_almoco",
  targetKey:  "ala_id",
  as:         "almoco"
});
AlunoAlmoco.hasMany(Recibo, {
  foreignKey: "rec_fk_almoco",
  sourceKey:  "ala_id",
  as:         "recibos"
});

// -----------------------------------------------------------------------------
// Export all models + sequelize instance
// -----------------------------------------------------------------------------
module.exports = {
  sequelize,
  User,
  Role,
  UserRole,
  Log,
  Recibo,
  Categoria,
  Tipo,
  Material,
  Requisicao,
  RequisicaoItem,
  RequisicaoDecisao,
  Movimentacao,
  Reciclagem,
  TokenBlacklist,
  PermissionTemplate,
  Action,
  TemplateAction,
  UserTemplate,

  // Novos exports
  Caixa,
  Venda,
  VendaItem,
  Aluno,
  Configuracao,
  Almoco,
  AlunoAlmoco
};
