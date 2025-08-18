-- --------------------------------------------------
-- 1) Criar a base de dados
-- --------------------------------------------------
DROP DATABASE IF EXISTS db_epstp_gestao;
CREATE DATABASE db_epstp_gestao CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE db_epstp_gestao;

-- --------------------------------------------------
-- 2) Usuários
-- --------------------------------------------------
CREATE TABLE tb_users (
    user_id     INT AUTO_INCREMENT PRIMARY KEY,
    user_nome   VARCHAR(100) NOT NULL,
    user_email  VARCHAR(255) UNIQUE NOT NULL,
    user_senha  VARCHAR(255) NOT NULL,
    user_status ENUM('ativo','inativo') NOT NULL DEFAULT 'ativo',
    createdAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP 
                ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tb_users (user_nome, user_email, user_senha) VALUES
  ('Administrador',       'admin@epstp.st',       'senha123'),
  ('Funcionário Exemplo', 'funcionario@epstp.st', 'senha123'),
  ('Professor Exemplo',   'professor@epstp.st',   'senha123');

-- --------------------------------------------------
-- 3) Papéis (roles) e mapeamento usuário↔papel
-- --------------------------------------------------
CREATE TABLE tb_roles (
    role_id    INT AUTO_INCREMENT PRIMARY KEY,
    role_name  VARCHAR(50) UNIQUE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tb_roles (role_name) VALUES
  ('admin'),
  ('funcionario'),
  ('professor');

CREATE TABLE tb_user_roles (
    ur_id     INT AUTO_INCREMENT PRIMARY KEY,
    user_id   INT NOT NULL,
    role_id   INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES tb_roles(role_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tb_user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM tb_users u
JOIN tb_roles r ON
     (u.user_email = 'admin@epstp.st'       AND r.role_name = 'admin')
  OR (u.user_email = 'funcionario@epstp.st' AND r.role_name = 'funcionario')
  OR (u.user_email = 'professor@epstp.st'   AND r.role_name = 'professor');

-- --------------------------------------------------
-- 4) Demais tabelas do sistema (logs, categorias, tipos, materiais, etc.)
-- --------------------------------------------------
CREATE TABLE tb_logs (
  log_id       INT AUTO_INCREMENT PRIMARY KEY,
  log_action   VARCHAR(50) NOT NULL,
  log_table    VARCHAR(50) NOT NULL,
  log_description TEXT,
  log_date     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tb_recibos (
  rec_id     INT AUTO_INCREMENT PRIMARY KEY,
  rec_fk_user INT NOT NULL,
  rec_tipo   ENUM('Almoço','Venda de Material') NOT NULL,
  rec_total  FLOAT NOT NULL,
  data       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rec_fk_user) REFERENCES tb_users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tb_categorias (
  cat_id   INT AUTO_INCREMENT PRIMARY KEY,
  cat_nome VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tb_categorias (cat_nome) VALUES
  ('Material Informático'),
  ('Material Escolar');

CREATE TABLE tb_tipos (
  tipo_id          INT AUTO_INCREMENT PRIMARY KEY,
  tipo_nome        VARCHAR(100) NOT NULL,
  tipo_fk_categoria INT NOT NULL,
  FOREIGN KEY (tipo_fk_categoria) REFERENCES tb_categorias(cat_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tb_tipos (tipo_nome, tipo_fk_categoria) VALUES
  ('Computadores', 1),
  ('Impressoras', 1),
  ('Cadernos', 2),
  ('Canetas', 2);

CREATE TABLE tb_materiais (
  mat_id              INT AUTO_INCREMENT PRIMARY KEY,
  mat_nome            VARCHAR(100) NOT NULL,
  mat_descricao       TEXT,
  mat_preco           DECIMAL(10,2),
  mat_quantidade_estoque INT NOT NULL DEFAULT 0,
  mat_estoque_minimo  INT NOT NULL DEFAULT 3,
  mat_fk_tipo         INT NOT NULL,
  mat_localizacao     VARCHAR(255) NOT NULL,
  mat_vendavel        ENUM('SIM','NAO') NOT NULL DEFAULT 'SIM',
  mat_status          ENUM('ativo','inativo') NOT NULL DEFAULT 'ativo',
  FOREIGN KEY (mat_fk_tipo) REFERENCES tb_tipos(tipo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tb_materiais (mat_nome, mat_descricao, mat_preco, mat_quantidade_estoque, mat_estoque_minimo, mat_fk_tipo, mat_localizacao, mat_vendavel) VALUES
  ('Laptop Dell','Laptop para uso administrativo',1500.00,10,2,1,'Sala 101','SIM'),
  ('Impressora HP','Impressora multifuncional',800.00,5,1,2,'Sala 102','SIM'),
  ('Caderno Universitário','Caderno 200 folhas',15.00,50,10,3,'Almoxarifado','SIM'),
  ('Caneta Azul','Caneta esferográfica azul',1.50,200,50,4,'Almoxarifado','SIM');
/* ------------------------------------------------------
-- ======================================================================
-- Tabelas de Requisições (sem preço) + Devolução por item
-- Compatível com MariaDB. Sem CHECK, sem TRIGGER, sem VIEW.
-- ======================================================================

/* ------------------------------------------------------
   1) Cabeçalho da requisição
   ------------------------------------------------------ */
DROP TABLE IF EXISTS tb_requisicoes_decisoes;
DROP TABLE IF EXISTS tb_requisicoes_itens;
DROP TABLE IF EXISTS tb_requisicoes;

CREATE TABLE tb_requisicoes (
  req_id            INT AUTO_INCREMENT PRIMARY KEY,
  req_codigo        VARCHAR(30) UNIQUE NOT NULL,   -- Ex.: REQ-000123
  req_fk_user       INT NOT NULL,                  -- Quem requisitou
  req_status        ENUM(
                      'Pendente',                  -- criada, aguardando aprovação/atendimento
                      'Aprovada',                  -- aprovada, ainda não atendida
                      'Atendida',                  -- todos os itens saíram
                      'Em Uso',                    -- itens estão com o requisitante
                      'Parcial',                   -- alguma parte atendida/devolvida
                      'Devolvida',                  -- tudo devolvido
                      'Rejeitada',
                      'Cancelada'
                    ) NOT NULL DEFAULT 'Pendente',
  req_date          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  req_needed_at     DATE NULL,                     -- quando precisa
  req_local_entrega VARCHAR(120) NULL,             -- onde entregar/retirar
  req_justificativa VARCHAR(255) NULL,             -- por que precisa
  req_observacoes   VARCHAR(255) NULL,             -- observações gerais
  req_approved_by   INT NULL,                      -- quem aprovou/rejeitou/cancelou
  req_approved_at   DATETIME NULL,                 -- quando decidiu
  createdAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_req_user       FOREIGN KEY (req_fk_user)     REFERENCES tb_users(user_id),
  CONSTRAINT fk_req_aprv_user  FOREIGN KEY (req_approved_by) REFERENCES tb_users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_req_hdr_status_date ON tb_requisicoes (req_status, req_date);
CREATE INDEX idx_req_hdr_user        ON tb_requisicoes (req_fk_user);
CREATE INDEX idx_req_hdr_needed      ON tb_requisicoes (req_needed_at);


/* ------------------------------------------------------
   2) Itens da requisição (sem preço) + campos de devolução
   ------------------------------------------------------ */
CREATE TABLE tb_requisicoes_itens (
  rqi_id               INT AUTO_INCREMENT PRIMARY KEY,
  rqi_fk_requisicao    INT NOT NULL,
  rqi_fk_material      INT NULL,                   -- ON DELETE SET NULL preserva histórico
  rqi_descricao        VARCHAR(255) NULL,          -- observação do item
  rqi_quantidade       INT NOT NULL,               -- solicitada (>0; valide no back)
  rqi_qtd_atendida     INT NOT NULL DEFAULT 0,     -- quanto saiu do estoque (saida; valide no back)
  -- ---- Devolução ----
  rqi_devolvido        ENUM('Nao','Parcial','Sim') NOT NULL DEFAULT 'Nao',
  rqi_qtd_devolvida    INT NOT NULL DEFAULT 0,     -- quanto voltou (entrada; valide no back)
  rqi_data_devolucao   DATETIME NULL,              -- última data de devolução registrada
  rqi_condicao_retorno ENUM('Boa','Danificada','Perdida') NULL,  -- estado ao retornar
  rqi_obs_devolucao    VARCHAR(255) NULL,          -- observações sobre devolução/avaria
  -- ---- Status por item ----
  rqi_status           ENUM('Pendente','Atendido','Em Uso','Parcial','Devolvido','Cancelado')
                       NOT NULL DEFAULT 'Pendente',
  createdAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rqi_req FOREIGN KEY (rqi_fk_requisicao)
    REFERENCES tb_requisicoes(req_id) ON DELETE CASCADE,
  CONSTRAINT fk_rqi_mat FOREIGN KEY (rqi_fk_material)
    REFERENCES tb_materiais(mat_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_rqi_req ON tb_requisicoes_itens (rqi_fk_requisicao);
CREATE INDEX idx_rqi_mat ON tb_requisicoes_itens (rqi_fk_material);


/* ------------------------------------------------------
   3) Trilhas de decisão (opcional, mas útil para auditoria)
   ------------------------------------------------------ */
CREATE TABLE tb_requisicoes_decisoes (
  dec_id            INT AUTO_INCREMENT PRIMARY KEY,
  dec_fk_requisicao INT NOT NULL,
  dec_fk_user       INT NOT NULL,                   -- quem decidiu
  dec_tipo          ENUM('Aprovar','Rejeitar','Cancelar') NOT NULL,
  dec_motivo        VARCHAR(255) NULL,
  dec_data          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dec_req  FOREIGN KEY (dec_fk_requisicao) REFERENCES tb_requisicoes(req_id) ON DELETE CASCADE,
  CONSTRAINT fk_dec_user FOREIGN KEY (dec_fk_user)       REFERENCES tb_users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_dec_req ON tb_requisicoes_decisoes (dec_fk_requisicao, dec_data);
  ------------------------------------------------------ */
drop table if exists tb_movimentacoes;
CREATE TABLE tb_movimentacoes (
  mov_id           INT AUTO_INCREMENT PRIMARY KEY,
  mov_fk_material  INT NOT NULL,
  mov_tipo         ENUM('entrada','saida') NOT NULL,
  mov_quantidade   INT NOT NULL,
  mov_data         DATETIME DEFAULT CURRENT_TIMESTAMP,
  mov_descricao    VARCHAR(255),
  mov_preco        DECIMAL(10,2) NOT NULL,
  mov_fk_requisicao INT,
  FOREIGN KEY (mov_fk_material ) REFERENCES tb_materiais(mat_id),
  FOREIGN KEY (mov_fk_requisicao) REFERENCES tb_requisicoes(req_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tb_reciclagem (
  reci_id         INT AUTO_INCREMENT PRIMARY KEY,
  reci_table      VARCHAR(50) NOT NULL,
  reci_record_id  INT NOT NULL,
  reci_action     ENUM('delete','update') NOT NULL,
  reci_data       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reci_data_antiga JSON,
  reci_data_nova  JSON,
  reci_fk_user    INT,
  FOREIGN KEY (reci_fk_user) REFERENCES tb_users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tb_token_blacklist (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  token      TEXT NOT NULL,
  expires_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------
-- 5) Estrutura genérica de ACL baseada em “templates”
-- --------------------------------------------------

-- 5.1) Ações disponíveis
CREATE TABLE tb_actions (
  action_id    INT AUTO_INCREMENT PRIMARY KEY,
  action_code  VARCHAR(50) UNIQUE NOT NULL,
  action_label VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tb_actions (action_code, action_label) VALUES
  ('view',            'Visualizar'),
  ('create',          'Criar'),
  ('edit',            'Editar'),
  ('delete',          'Eliminar'),
  ('approve',         'Autorizar/Rejeitar'),
  ('generate_receipt','Gerar Recibo'),
  ('request',         'Requisitar');

-- 5.2) Templates de permissão (grupos de ações)
CREATE TABLE tb_permission_templates (
  template_id    INT AUTO_INCREMENT PRIMARY KEY,
  template_code  VARCHAR(50) UNIQUE NOT NULL,
  template_label VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tb_permission_templates (template_code, template_label) VALUES
  ('baseline',         'Permissões Básicas de Usuário'),
  ('manage_category',  'Gerir Categoria e Relacionados'),
  ('manage_users',     'Gerir Usuários e Logs'),
  ('manage_sales',     'Gerir Vendas e Recibos');

-- 5.3) Ações incluídas em cada template
CREATE TABLE tb_template_actions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  template_id    INT NOT NULL,
  action_id      INT NOT NULL,
  resource_type  VARCHAR(50) NOT NULL,
  FOREIGN KEY (template_id) REFERENCES tb_permission_templates(template_id) ON DELETE CASCADE,
  FOREIGN KEY (action_id)   REFERENCES tb_actions(action_id)           ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5.3.1) baseline (todos podem view/create em requisição e compra, e view geral)
INSERT INTO tb_template_actions (template_id, action_id, resource_type)
VALUES
  ((SELECT template_id FROM tb_permission_templates WHERE template_code='baseline'),
   (SELECT action_id   FROM tb_actions             WHERE action_code='view'),   'categoria'),
  ((SELECT template_id FROM tb_permission_templates WHERE template_code='baseline'),
   (SELECT action_id   FROM tb_actions             WHERE action_code='view'),   'tipo'),
  ((SELECT template_id FROM tb_permission_templates WHERE template_code='baseline'),
   (SELECT action_id   FROM tb_actions             WHERE action_code='view'),   'material'),
  ((SELECT template_id FROM tb_permission_templates WHERE template_code='baseline'),
   (SELECT action_id   FROM tb_actions             WHERE action_code='request'),'material'),
  ((SELECT template_id FROM tb_permission_templates WHERE template_code='baseline'),
   (SELECT action_id   FROM tb_actions             WHERE action_code='view'),   'movimentacao'),
  ((SELECT template_id FROM tb_permission_templates WHERE template_code='baseline'),
   (SELECT action_id   FROM tb_actions             WHERE action_code='view'),   'requisicao'),
  ((SELECT template_id FROM tb_permission_templates WHERE template_code='baseline'),
   (SELECT action_id   FROM tb_actions             WHERE action_code='create'), 'requisicao'),
  ((SELECT template_id FROM tb_permission_templates WHERE template_code='baseline'),
   (SELECT action_id   FROM tb_actions             WHERE action_code='view'),   'compra'),
  ((SELECT template_id FROM tb_permission_templates WHERE template_code='baseline'),
   (SELECT action_id   FROM tb_actions             WHERE action_code='create'), 'compra'),
  ((SELECT template_id FROM tb_permission_templates WHERE template_code='baseline'),
   (SELECT action_id   FROM tb_actions             WHERE action_code='view'),   'venda');

-- 5.3.2) manage_category (view/create/edit/delete/approve sobre categoria→tipo→material→requisicao→movimentacao)
INSERT INTO tb_template_actions (template_id, action_id, resource_type)
SELECT
  (SELECT template_id FROM tb_permission_templates WHERE template_code='manage_category'),
  a.action_id,
  rt.resource_type
FROM
  (SELECT 'categoria'   AS resource_type
   UNION ALL SELECT 'tipo'
   UNION ALL SELECT 'material'
   UNION ALL SELECT 'requisicao'
   UNION ALL SELECT 'movimentacao') rt
CROSS JOIN tb_actions a
WHERE a.action_code IN ('view','create','edit','delete','approve');

-- 5.3.3) manage_users (view/create/edit/delete sobre usuário e log)
INSERT INTO tb_template_actions (template_id, action_id, resource_type)
SELECT
  (SELECT template_id FROM tb_permission_templates WHERE template_code='manage_users'),
  a.action_id,
  rt.resource_type
FROM
  (SELECT 'usuario' AS resource_type UNION ALL SELECT 'log') rt
CROSS JOIN tb_actions a
WHERE a.action_code IN ('view','create','edit','delete');

-- 5.3.4) manage_sales (view/create/generate_receipt/delete sobre venda e recibo)
INSERT INTO tb_template_actions (template_id, action_id, resource_type)
SELECT
  (SELECT template_id FROM tb_permission_templates WHERE template_code='manage_sales'),
  a.action_id,
  rt.resource_type
FROM
  (SELECT 'venda' AS resource_type UNION ALL SELECT 'recibo') rt
CROSS JOIN tb_actions a
WHERE a.action_code IN ('view','create','generate_receipt','delete');

-- 5.4) Atribuição de templates aos usuários, opcionalmente com escopo
CREATE TABLE tb_user_templates (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  template_id   INT NOT NULL,
  resource_type VARCHAR(50) DEFAULT NULL,
  resource_id   INT          DEFAULT NULL,
  FOREIGN KEY (user_id)     REFERENCES tb_users(user_id)                ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES tb_permission_templates(template_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5.5) Atribuir baseline a todos os usuários existentes (escopo global)
INSERT INTO tb_user_templates (user_id, template_id)
SELECT
  user_id,
  (SELECT template_id FROM tb_permission_templates WHERE template_code='baseline')
FROM tb_users;

-- ------------------------------
ALTER TABLE tb_movimentacoes
  DROP FOREIGN KEY tb_movimentacoes_ibfk_1;

-- 1.2) Torne mov_fk_material aceitável nulo
ALTER TABLE tb_movimentacoes
  MODIFY mov_fk_material INT NULL;

-- 1.3) Recrie a FK com ON DELETE SET NULL
ALTER TABLE tb_movimentacoes
  ADD CONSTRAINT fk_mov_material
    FOREIGN KEY (mov_fk_material)
    REFERENCES tb_materiais(mat_id)
    ON DELETE SET NULL;


ALTER TABLE tb_movimentacoes 
  ADD COLUMN mov_material_nome VARCHAR(100) NOT NULL AFTER mov_fk_material,
  ADD COLUMN mov_tipo_nome VARCHAR(100) NOT NULL AFTER mov_material_nome;

-- -----------------------------------




select* from tb_reciclagem;
select* from tb_users;
