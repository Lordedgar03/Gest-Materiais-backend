-- Criar a base de dados
DROP DATABASE IF EXISTS db_epstp_gestao;
CREATE DATABASE db_epstp_gestao CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE db_epstp_gestao;

-- Tabela: tb_users
CREATE TABLE tb_users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    user_nome VARCHAR(100) NOT NULL,
    user_email VARCHAR(255) UNIQUE NOT NULL,
    user_senha VARCHAR(255) NOT NULL,
    user_tipo ENUM('admin', 'funcionario', 'professor') NOT NULL,
    user_status ENUM('ativo','inativo') NOT NULL DEFAULT 'ativo',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Inserir dados de exemplo em tb_users
INSERT INTO tb_users (user_nome, user_email, user_senha, user_tipo)
VALUES
('Administrador', 'admin@epstp.st', 'senha123', 'admin'),
('Funcionário Exemplo', 'funcionario@epstp.st', 'senha123', 'funcionario'),
('Professor Exemplo', 'professor@epstp.st', 'senha123', 'professor');


CREATE TABLE tb_permissoes (
    perm_id INT AUTO_INCREMENT PRIMARY KEY,
    perm_fk_user INT NOT NULL,
    perm_modulo ENUM(
         'utilizador',
        'categorias',
        'tipos',
        'materiais',
        'movimentacoes',
        'requisicoes',
        'recibos',
        'logs',
        'vendas',
        'compras'
    ) NOT NULL,
    perm_acao ENUM(
        'visualizar',
        'criar',
        'editar',
        'eliminar',
        'autorizar'
    ) NOT NULL,
    FOREIGN KEY (perm_fk_user) REFERENCES tb_users(user_id)
);


-- Tabela: tb_logs
CREATE TABLE tb_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    log_action VARCHAR(50) NOT NULL,
    log_table VARCHAR(50) NOT NULL,
    log_description TEXT,
    log_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela: tb_recibos
CREATE TABLE tb_recibos (
    rec_id INT AUTO_INCREMENT PRIMARY KEY,
    rec_fk_user INT NOT NULL,
    rec_tipo ENUM('Almoço', 'Venda de Material') NOT NULL,
    rec_total FLOAT NOT NULL,
    data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rec_fk_user) REFERENCES tb_users(user_id)
);

-- Tabela: tb_categorias
CREATE TABLE tb_categorias (
    cat_id INT AUTO_INCREMENT PRIMARY KEY,
    cat_nome VARCHAR(50) NOT NULL
);

-- Inserir dados de exemplo em tb_categorias
INSERT INTO tb_categorias (cat_nome)
VALUES
('Material Informático'),
('Material Escolar');

-- Tabela: tb_tipos
CREATE TABLE tb_tipos (
    tipo_id INT AUTO_INCREMENT PRIMARY KEY,
    tipo_nome VARCHAR(100) NOT NULL,
    tipo_fk_categoria INT NOT NULL,
    FOREIGN KEY (tipo_fk_categoria) REFERENCES tb_categorias(cat_id)
);

-- Inserir dados de exemplo em tb_tipos
INSERT INTO tb_tipos (tipo_nome, tipo_fk_categoria)
VALUES
('Computadores', 1),
('Impressoras', 1),
('Cadernos', 2),
('Canetas', 2);

-- Tabela: tb_materiais
CREATE TABLE tb_materiais (
    mat_id INT AUTO_INCREMENT PRIMARY KEY,
    mat_nome VARCHAR(100) NOT NULL,
    mat_descricao TEXT DEFAULT NULL,
    mat_preco DECIMAL(10,2),
    mat_quantidade_estoque INT NOT NULL DEFAULT 0,
    mat_estoque_minimo INT NOT NULL DEFAULT 3,
    mat_fk_tipo INT NOT NULL,
    mat_localizacao VARCHAR(255) NOT NULL,
    mat_vendavel ENUM('SIM', 'NAO') NOT NULL DEFAULT 'SIM',
    mat_status ENUM('ativo','inativo') DEFAULT 'ativo',
    FOREIGN KEY (mat_fk_tipo) REFERENCES tb_tipos(tipo_id)
);

-- Inserir dados de exemplo em tb_materiais
INSERT INTO tb_materiais (mat_nome, mat_descricao, mat_preco, mat_quantidade_estoque, mat_estoque_minimo, mat_fk_tipo, mat_localizacao, mat_vendavel)
VALUES
('Laptop Dell', 'Laptop para uso administrativo', 1500.00, 10, 2, 1, 'Sala 101', 'SIM'),
('Impressora HP', 'Impressora multifuncional', 800.00, 5, 1, 2, 'Sala 102', 'SIM'),
('Caderno Universitário', 'Caderno 200 folhas', 15.00, 50, 10, 3, 'Almoxarifado', 'SIM'),
('Caneta Azul', 'Caneta esferográfica azul', 1.50, 200, 50, 4, 'Almoxarifado', 'SIM');
-- Tabela: tb_requisicoes
CREATE TABLE tb_requisicoes (
    req_id INT AUTO_INCREMENT PRIMARY KEY,
    req_fk_user INT NOT NULL,
    req_fk_mat INT NOT NULL,
    req_status ENUM('Pendente', 'Aprovada', 'Rejeitada') DEFAULT 'Pendente',
    req_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (req_fk_user) REFERENCES tb_users(user_id),
    FOREIGN KEY (req_fk_mat) REFERENCES tb_materiais(mat_id)
);
-- Tabela: tb_movimentacoes
CREATE TABLE tb_movimentacoes (
    mov_id INT AUTO_INCREMENT PRIMARY KEY,
    mov_fk_material INT NOT NULL,
    mov_tipo ENUM('entrada', 'saida') NOT NULL,
    mov_quantidade INT NOT NULL,
    mov_data DATETIME DEFAULT CURRENT_TIMESTAMP,
    mov_descricao VARCHAR(255) DEFAULT '',
    mov_preco DECIMAL(10,2) NOT NULL,
    mov_fk_requisicao INT NULL,
	FOREIGN KEY (mov_fk_requisicao) REFERENCES tb_requisicoes(req_id),
    FOREIGN KEY (mov_fk_material) REFERENCES tb_materiais(mat_id)
);
-- Nova Tabela: tb_reciclagem** (registro de itens “apagados” ou movidos para a lixeira)
CREATE TABLE tb_reciclagem (
    reci_id INT AUTO_INCREMENT PRIMARY KEY,
    reci_table VARCHAR(50) NOT NULL,           -- nome da tabela original
    reci_record_id INT NOT NULL,                -- chave primária do registo
    reci_action ENUM('delete','update') NOT NULL,
    reci_data TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reci_data_antiga JSON DEFAULT NULL,         -- estado antes da operação
    reci_data_nova JSON DEFAULT NULL,           -- estado depois da operação (para update)
    reci_fk_user INT NULL,                      -- quem efetuou a ação
    FOREIGN KEY (reci_fk_user) REFERENCES tb_users(user_id)
);


