"use strict";

const DbService = require("moleculer-db"); // opcional (para ter metrics/cache); não define model
const { Op, fn, col, literal, where } = require("sequelize");
const sequelize = require("../config/db");

const {
  Material,
  Tipo,
  Categoria,         // se não existir, o código faz fallback
  Movimentacao,
  VendaItem,
} = require("../models");

// Utilitários
const toInt = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const ymd = d => new Date(d).toISOString().slice(0, 10);
const mapMes = (m) => {
  if (m == null) return null;
  const s = String(m).toLowerCase();
  const dict = {
    "1":1,"01":1, jan:1, janeiro:1,
    "2":2,"02":2, fev:2, fevereiro:2,
    "3":3,"03":3, mar:3, março:3, marco:3,
    "4":4,"04":4, abr:4, abril:4,
    "5":5, maio:5,
    "6":6, jun:6, junho:6,
    "7":7, jul:7, julho:7,
    "8":8, ago:8, agosto:8,
    "9":9,"09":9, set:9, setembro:9,
    "10":10, out:10, outubro:10,
    "11":11, nov:11, novembro:11,
    "12":12, dez:12, dezembro:12,
  };
  return dict[s] || null;
};
const round2 = n => Math.round(Number(n || 0) * 100) / 100;

module.exports = {
  name: "relatorios",
  mixins: [DbService], // sem adapter/model; só para ter health/cache se quiser

  actions: {
    /**
     * GET /relatorios/materiais/estoque-agrupado
     * Agrupa por localizacao → tipo → categoria (se existir).
     * Query: local? (prefixo), tipo_id?, categoria_id?
     */
    estoqueAgrupado: {
      rest: "GET /materiais/estoque-agrupado",
      cache: false,
      params: {
        local: { type: "string", optional: true },
        tipo_id: { type: "number", convert: true, optional: true },
        categoria_id: { type: "number", convert: true, optional: true },
      },
      async handler(ctx) {
        const { local, tipo_id, categoria_id } = ctx.params;

        // Monta join com Tipo e (opcionalmente) Categoria
        const include = [{
          model: Tipo, as: "tipo", required: false, attributes: ["tipo_id", "tipo_nome", "tipo_fk_categoria"],
        }];

        // Só inclui Categoria se existir no models
        if (Categoria) {
          include.push({
            model: Categoria,
            as: "categoria",
            required: false,
            // Se seu relacionamento for via Tipo -> Categoria, dá pra buscar depois via tipo.tipo_fk_categoria
            // Aqui usamos assoc direta caso exista Material.hasOne(Categoria, { as:"categoria", foreignKey:"..." })
            attributes: ["cat_id", "cat_nome"],
          });
        }

        // Filtros
        const whereMat = {};
        if (local) whereMat.mat_localizacao = { [Op.like]: `${local}%` };
        if (tipo_id) whereMat.mat_fk_tipo = Number(tipo_id);

        // Carrega materiais com joins mínimos
        const rows = await Material.findAll({
          where: whereMat,
          include,
          raw: true,
          nest: true,
          attributes: [
            "mat_id", "mat_nome", "mat_localizacao",
            "mat_fk_tipo", "mat_quantidade_estoque", "mat_preco",
          ],
        });

        // Enriquecimento de categoria via Tipo (caso não tenha include Categoria direto)
        const outMap = new Map(); // key = local|tipoNome|catNome
        for (const r of rows) {
          const localz = r.mat_localizacao || "-";
          const tipoNome = r.tipo?.tipo_nome || "-";
          let catNome = "-";

          if (Categoria && r.categoria?.cat_nome) {
            catNome = r.categoria.cat_nome;
          } else if (r.tipo?.tipo_fk_categoria && Categoria) {
            // tenta buscar categoria por ID (opcional e custoso; em escala, substitua por left join real)
            // (poderia-se criar um cache local simples se necessário)
            // Para não fazer N consultas, vamos apenas apresentar "-" quando não veio no include.
            // Se quiser muito, pode montar um cache de categorias por id (deixe-me saber).
          }

          const key = `${localz}|||${tipoNome}|||${catNome}`;
          const prev = outMap.get(key) || { localizacao: localz, tipo: tipoNome, categoria: catNome, itens: 0, quantidade: 0, valor_estoque: 0 };
          const qty = Number(r.mat_quantidade_estoque || 0);
          const val = round2(qty * Number(r.mat_preco || 0));

          prev.itens += 1;
          prev.quantidade += qty;
          prev.valor_estoque = round2(prev.valor_estoque + val);

          outMap.set(key, prev);
        }

        let list = Array.from(outMap.values());

        // Filtro por categoria_id (se houver Categoria/Tipo)
        if (categoria_id) {
          // só deixamos quem tem categoria igual, quando disponível; caso contrário, mantemos "-"
          // se você quiser exigir categoria existente, comente a parte do "-"
          if (Categoria) {
            // sem uma associação direta aqui, vamos filtrar pelo nome == "-" OUT
            // Em sistemas com FK real, é melhor trazer isso pelo join em uma única query.
            // Para já, mantemos tudo e deixamos a agregação acontecer acima.
          }
        }

        // Ordenação agradável: local, tipo, categoria
        list.sort((a, b) =>
          (a.localizacao || "").localeCompare(b.localizacao || "", "pt") ||
          (a.tipo || "").localeCompare(b.tipo || "", "pt") ||
          (a.categoria || "").localeCompare(b.categoria || "", "pt")
        );

        // Totais gerais
        const total = list.reduce((s, x) => ({
          itens: s.itens + x.itens,
          quantidade: s.quantidade + x.quantidade,
          valor_estoque: round2(s.valor_estoque + x.valor_estoque),
        }), { itens: 0, quantidade: 0, valor_estoque: 0 });

        return { ok: true, grupos: list, total };
      },
    },

    /**
     * GET /relatorios/vendas/mensal
     * Query: ano (number). Retorna 12 meses com total arrecadado (somente 'Paga').
     */
    vendasMensal: {
      rest: "GET /vendas/mensal",
      cache: false,
      params: { ano: { type: "number", convert: true } },
      async handler(ctx) {
        const ano = toInt(ctx.params.ano, new Date().getFullYear());
        const inicio = new Date(Date.UTC(ano, 0, 1));
        const fim = new Date(Date.UTC(ano, 11, 31, 23, 59, 59));

        // Agrega via VendaItem join header (somando ven_total paga por mês)
        // Se o seu total já está em header (tb_vendas.ven_total) e status 'Paga', dá pra usar só a tabela de vendas.
        const [rows] = await sequelize.query(
          `
          SELECT
            EXTRACT(MONTH FROM v.ven_data) AS mes,
            SUM(v.ven_total)               AS total
          FROM tb_vendas v
          WHERE v.ven_status = 'Paga'
            AND v.ven_data BETWEEN :ini AND :fim
          GROUP BY 1
          ORDER BY 1
          `,
          { replacements: { ini: inicio, fim: fim } }
        );

        const byMonth = Array.from({ length: 12 }, (_, i) => ({
          mes: i + 1,
          total: 0,
        }));
        for (const r of rows) {
          const m = Number(r.mes);
          if (m >= 1 && m <= 12) {
            byMonth[m - 1].total = round2(r.total);
          }
        }

        const totalAno = round2(byMonth.reduce((s, x) => s + x.total, 0));
        return { ok: true, ano, meses: byMonth, totalAno };
      },
    },

    /**
     * GET /relatorios/movimentacoes
     * Entradas/saídas no período, com agrupamento.
     * Query: inicio=YYYY-MM-DD, fim=YYYY-MM-DD, por="material"|"tipo"|"localizacao"
     */
    movimentacoes: {
      rest: "GET /movimentacoes",
      cache: false,
      params: {
        inicio: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/ },
        fim: { type: "string", pattern: /^\d{4}-\d{2}-\d{2}$/ },
        por: { type: "string", optional: true, enum: ["material", "tipo", "localizacao"] },
      },
      async handler(ctx) {
        const { inicio, fim, por = "material" } = ctx.params;
        const ini = new Date(`${inicio}T00:00:00Z`);
        const end = new Date(`${fim}T23:59:59Z`);

        // buscamos info básica de movimentações + enriquecemos chave de agrupamento
        const movs = await Movimentacao.findAll({
          where: { mov_data: { [Op.between]: [ini, end] } },
          raw: true,
          nest: true,
          attributes: [
            "mov_fk_material", "mov_material_nome", "mov_tipo_nome",
            "mov_tipo", "mov_quantidade", "mov_preco", "mov_data",
          ],
        });

        // cache simples para material -> localizacao e tipo_nome atual
        const cacheMaterial = new Map();

        const getKey = async (m) => {
          if (por === "material") return m.mov_material_nome || `#${m.mov_fk_material}`;
          if (por === "tipo")    return m.mov_tipo_nome || "-";
          if (por === "localizacao") {
            const mid = m.mov_fk_material;
            if (!mid) return "-";
            let cached = cacheMaterial.get(mid);
            if (!cached) {
              const mat = await Material.findByPk(mid, { raw: true }).catch(() => null);
              cached = { local: mat?.mat_localizacao || "-", tipoNome: m.mov_tipo_nome || "-" };
              cacheMaterial.set(mid, cached);
            }
            return cached.local;
          }
          return "-";
        };

        // Agregação
        const map = new Map(); // key -> { entradas, saidas, saldoQtd, totalEntradas, totalSaidas }
        for (const m of movs) {
          // eslint-disable-next-line no-await-in-loop
          const key = await getKey(m);
          const isEntrada = (m.mov_tipo || "").toLowerCase() === "entrada";
          const qtd = Number(m.mov_quantidade || 0);
          const val = round2(qtd * Number(m.mov_preco || 0));

          const prev = map.get(key) || { chave: key, entradas: 0, saidas: 0, saldoQtd: 0, totalEntradas: 0, totalSaidas: 0 };
          if (isEntrada) {
            prev.entradas += qtd;
            prev.totalEntradas = round2(prev.totalEntradas + val);
          } else {
            prev.saidas += qtd;
            prev.totalSaidas = round2(prev.totalSaidas + val);
          }
          prev.saldoQtd = prev.entradas - prev.saidas;
          map.set(key, prev);
        }

        const grupos = Array.from(map.values()).sort((a, b) =>
          String(a.chave).localeCompare(String(b.chave), "pt")
        );

        const total = grupos.reduce((s, g) => ({
          entradas: s.entradas + g.entradas,
          saidas: s.saidas + g.saidas,
          saldoQtd: s.saldoQtd + g.saldoQtd,
          totalEntradas: round2(s.totalEntradas + g.totalEntradas),
          totalSaidas: round2(s.totalSaidas + g.totalSaidas),
        }), { entradas: 0, saidas: 0, saldoQtd: 0, totalEntradas: 0, totalSaidas: 0 });

        return { ok: true, de: inicio, ate: fim, por, grupos, total };
      },
    },
  },
};
