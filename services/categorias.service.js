// services/categorias.service.js
"use strict";

const DbService = require("moleculer-db");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const { DataTypes } = require("sequelize");
const {
  Categoria,
  Tipo,
  Material,
  Movimentacao,
  Reciclagem
} = require("../models/index");
module.exports = {
  name: "categorias",
  mixins: [DbService],
  adapter: new SequelizeAdapter(sequelize),
  model: Categoria, // ⬅️ importante para o DbService

	actions: {
		// GET /api/categorias
		find: {
			rest: "GET /categorias",
			cache: false,
			async handler(ctx) {
				return this.adapter.find();

			}
		},

		// GET /api/categorias/:id
		get: {
			rest: "GET /categorias/:id",
			params: {
				id: { type: "number", convert: true }
			},
			async handler(ctx) {
				const rec = await this.adapter.findById(ctx.params.id);
				if (!rec) throw new Error("Categoria não encontrada.");
				return rec;
			}
		},

		// POST /api/categorias
		criar: {
			rest: "POST /categorias",
			params: {
				cat_nome: { type: "string", min: 1 }
			},
			async handler(ctx) {
				const { cat_nome } = ctx.params;
				// evita duplicados
				if (await this.adapter.findOne({ where: { cat_nome } }))
					throw new Error("Categoria já existe.");

				// insere com o método do DbService
				const nova = await this.adapter.insert({ cat_nome });

				// regista na reciclagem
				await Reciclagem.create({
					reci_table: "tb_categorias",
					reci_record_id: nova.cat_id,
					reci_action: "create",
					reci_data_nova: nova,
					reci_fk_user: ctx.meta.user?.id || null
				});

				return nova;
			}
		},

		update: {
			rest: "PUT /categorias/:id",
			params: {
				id: { type: "number", convert: true },
				cat_nome: { type: "string", min: 1 }
			},
			async handler(ctx) {
				const { id, cat_nome } = ctx.params;

				// 1) Busca o registo
				const rec = await this.adapter.findById(id);
				if (!rec) throw new Error("Categoria não encontrada.");

				const oldData = rec;  // já é JS puro por causa do raw:true

				// 2) Executa UPDATE via Sequelize Model
				const [affected] = await this.adapter.model.update(
					{ cat_nome },
					{ where: { cat_id: id } }
				);
				if (affected === 0) throw new Error("Falha ao atualizar categoria.");


				// 4) Retorna confirmação
				const updated = await this.adapter.model.findOne({
					where: { cat_id: id },
					raw: true
				});

				return {
					success: true,
					message: "Categoria atualizada com sucesso",
					data: updated
				};
			}
		},

	  remove: { // ⬅️ o nome precisa ser "remove" (bate com o log)
      rest: "DELETE /categorias/:id",
      params: { id: { type: "number", convert: true } },
      async handler(ctx) {
        const { id } = ctx.params;

        return await sequelize.transaction(async (tx) => {
          // 1) Carrega a categoria
          const categoriaInst = await Categoria.findByPk(id, { transaction: tx });
          if (!categoriaInst) throw new Error("Categoria não encontrada.");
          const oldCategoria = categoriaInst.toJSON();

          // 2) Carrega todos os tipos da categoria
          const tipos = await Tipo.findAll({
            where: { tipo_fk_categoria: id },
            raw: true,
            transaction: tx
          });

          let totalMateriaisRemovidos = 0;

          // 3) Para cada tipo, tratar materiais + reciclar tipo
          for (const t of tipos) {
            // 3.1) Buscar materiais do tipo
            const materiais = await Material.findAll({
              where: { mat_fk_tipo: t.tipo_id },
              raw: true,
              transaction: tx
            });

            // 3.2) Para cada material: reciclagem + movimentação
            for (const mat of materiais) {
              await Reciclagem.create({
                reci_table:       "tb_materiais",
                reci_record_id:   mat.mat_id,
                reci_action:      "delete",
                reci_data_antiga: mat,
                reci_data_nova:   null,
                reci_fk_user:     ctx.meta.user?.id || ctx.meta.user?.user_id || null
              }, { transaction: tx });

              await Movimentacao.create({
                mov_fk_material:   mat.mat_id,
                mov_material_nome: mat.mat_nome,
                mov_tipo_nome:     t.tipo_nome,
                mov_tipo:          "saida",
                mov_quantidade:    mat.mat_quantidade_estoque,
                mov_preco:         mat.mat_preco,
                mov_descricao:     `Material ${mat.mat_nome} removido ao apagar categoria ${oldCategoria.cat_nome} (tipo ${t.tipo_nome})`,
                mov_fk_requisicao: null
              }, { transaction: tx });
            }

            // 3.3) Apagar materiais do tipo
            if (materiais.length) {
              await Material.destroy({ where: { mat_fk_tipo: t.tipo_id }, transaction: tx });
              totalMateriaisRemovidos += materiais.length;
            }

            // 3.4) Reciclagem do tipo
            await Reciclagem.create({
              reci_table:       "tb_tipos",
              reci_record_id:   t.tipo_id,
              reci_action:      "delete",
              reci_data_antiga: t,
              reci_data_nova:   null,
              reci_fk_user:     ctx.meta.user?.id || ctx.meta.user?.user_id || null
            }, { transaction: tx });
          }

          // 4) Apagar tipos da categoria
          if (tipos.length) {
            await Tipo.destroy({ where: { tipo_fk_categoria: id }, transaction: tx });
          }

          // 5) Reciclagem da categoria
          await Reciclagem.create({
            reci_table:       "tb_categorias",
            reci_record_id:   id,
            reci_action:      "delete",
            reci_data_antiga: oldCategoria,
            reci_data_nova:   null,
            reci_fk_user:     ctx.meta.user?.id || ctx.meta.user?.user_id || null
          }, { transaction: tx });

          // 6) Remover a categoria
          await categoriaInst.destroy({ transaction: tx });

          // 7) Limpa cache do serviço (DbService)
          await this.clearCache();

          return {
            success: true,
            message: "Categoria, seus tipos e materiais enviados para reciclagem e removidos com sucesso.",
            removidos: { materiais: totalMateriaisRemovidos, tipos: tipos.length, categorias: 1 }
          };
        });
      }
    }
  }
};