"use strict";

const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const PDFDocument = require("pdfkit");

const { Recibo, VendaItem, Material } = require("../models/index");

module.exports = {
  name: "recibos",
  // o adapter pode ficar, mas não vamos usar adapter.model aqui
  adapter: new SequelizeAdapter(sequelize),

  actions: {
    /** POST /vendas/:id/recibo → garante que existe recibo para a venda e devolve dados básicos */
    gerar: {
      rest: "POST /vendas/:id/recibo",
      auth: true,
      params: { id: { type: "number", convert: true, positive: true } },
      async handler(ctx) {
        const venId = Number(ctx.params.id);

        // procura já existente
        let rec = await Recibo.findOne({ where: { rec_fk_venda: venId } });
        if (!rec) {
          // lê a venda diretamente via SQL
          const venda = await sequelize.query(
            `SELECT ven_id, ven_codigo, ven_total, ven_fk_user, ven_cliente_nome, ven_subtotal, ven_desconto, ven_data
             FROM tb_vendas WHERE ven_id = ?`,
            { replacements: [venId], type: sequelize.QueryTypes.SELECT }
          ).then(rows => rows[0]);

          if (!venda) throw new Error("Venda não encontrada.");
          if (venda.ven_total == null) throw new Error("Venda sem total calculado.");

          rec = await Recibo.create({
            rec_fk_user: venda.ven_fk_user,
            rec_tipo: "Venda de Material",
            rec_total: Number(venda.ven_total || 0),
            rec_ref: venda.ven_codigo,
            rec_fk_venda: venda.ven_id,
            rec_cliente_nome: venda.ven_cliente_nome,
            data: new Date()
          });
        }

        return {
          message: "Recibo pronto.",
          recibo: {
            rec_id: rec.rec_id,
            rec_ref: rec.rec_ref,
            rec_total: rec.rec_total
          }
        };
      }
    },

    /** GET /recibos/:id/pdf → devolve o PDF binário do recibo (PDFKit) */
    pdf: {
      rest: "GET /recibos/:id/pdf",
      auth: true,
      params: { id: { type: "number", convert: true, positive: true } },
      async handler(ctx) {
        const recId = Number(ctx.params.id);
        const rec = await Recibo.findByPk(recId, { raw: true });
        if (!rec) throw new Error("Recibo não encontrado.");

        // itens da venda
        const itens = await VendaItem.findAll({
          where: { vni_fk_venda: rec.rec_fk_venda },
          raw: true
        });

        // nomes dos materiais
        const nomeById = {};
        if (itens.length) {
          const ids = [...new Set(itens.map(i => i.vni_fk_material))].filter(Boolean);
          if (ids.length) {
            const mats = await Material.findAll({ where: { mat_id: ids }, raw: true });
            mats.forEach(m => { nomeById[m.mat_id] = m.mat_nome; });
          }
        }

        // PDF
        const doc = new PDFDocument({ margin: 36 });
        const chunks = [];
        doc.on("data", d => chunks.push(d));
        const done = new Promise(res => doc.on("end", res));

        doc.fontSize(14).text("EPSTP - Recibo", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Recibo: ${rec.rec_id}  |  Referência: ${rec.rec_ref}`);
        doc.text(`Cliente: ${rec.rec_cliente_nome || "-"}`);
        doc.text(`Tipo: ${rec.rec_tipo}`);
        doc.text(`Data: ${new Date(rec.data).toLocaleString()}`);
        doc.moveDown();

        doc.fontSize(11).text("Itens", { underline: true });
        doc.moveDown(0.3);
        if (itens.length === 0) {
          doc.text("- Sem itens (recibo sem lista) -");
        } else {
          doc.fontSize(10);
          itens.forEach((it) => {
            const nome = nomeById[it.vni_fk_material] || `ID ${it.vni_fk_material}`;
            const pu = Number(it.vni_preco_unit || 0).toFixed(2);
            const tot = Number(it.vni_total || 0).toFixed(2);
            doc.text(`${nome}  x${it.vni_qtd}  @ ${pu}  =  ${tot} €`);
          });
        }

        doc.moveDown();
        doc.fontSize(12).text(`Total: ${Number(rec.rec_total).toFixed(2)} €`, { align: "right" });

        doc.end();
        await done;

        const buffer = Buffer.concat(chunks);
        ctx.meta.$responseType = "application/pdf";
        ctx.meta.$responseHeaders = {
          "Content-Disposition": `inline; filename="recibo-${rec.rec_id}.pdf"`
        };
        return buffer;
      }
    },

    /**
     * POST /vendas/:id/recibo/pdf → devolve um HTML imprimível
     * (o front abre num iframe e chama window.print())
     */
    receiptPdf: {
      rest: "POST /vendas/:id/recibo/pdf",
      auth: true,
      params: { id: { type: "number", convert: true, positive: true } },
      async handler(ctx) {
        const venId = Number(ctx.params.id);

        // Lê cabeçalho da venda
        const venda = await sequelize.query(
          `SELECT ven_id, ven_codigo, ven_total, ven_fk_user, ven_cliente_nome, ven_subtotal, ven_desconto, ven_data
           FROM tb_vendas WHERE ven_id = ?`,
          { replacements: [venId], type: sequelize.QueryTypes.SELECT }
        ).then(rows => rows[0]);

        if (!venda) throw new Error("Venda não encontrada.");

        // Itens
        const itens = await VendaItem.findAll({ where: { vni_fk_venda: venId }, raw: true });

        // nomes dos produtos
        const nomeById = {};
        if (itens.length) {
          const ids = [...new Set(itens.map(i => i.vni_fk_material))].filter(Boolean);
          if (ids.length) {
            const mats = await Material.findAll({ where: { mat_id: ids }, raw: true });
            mats.forEach(m => { nomeById[m.mat_id] = m.mat_nome; });
          }
        }

        const rows = itens.map(it => {
          const nome = nomeById[it.vni_fk_material] || `ID ${it.vni_fk_material}`;
          const total = Number(it.vni_total || 0).toFixed(2);
          const pu = Number(it.vni_preco_unit || 0).toFixed(2);
          return `
<tr>
  <td style="padding:6px 8px;border-bottom:1px solid #eee">${nome}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${pu}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${it.vni_qtd}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right"><strong>${total}</strong></td>
</tr>`;
        }).join("");

        const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Recibo ${venda.ven_codigo}</title>
  <style>
    body { font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:#111; }
    .wrap { max-width: 640px; margin: 24px auto; }
    .hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .muted { color:#666; font-size:12px; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
  </style>
</head>
<body onload="window.print()">
  <div class="wrap">
    <div class="hdr">
      <div>
        <h2 style="margin:0">Recibo — ${venda.ven_codigo}</h2>
        <div class="muted">Cliente: ${venda.ven_cliente_nome || "-"}</div>
        <div class="muted">Data: ${new Date(venda.ven_data).toLocaleString()}</div>
      </div>
      <div style="text-align:right">
        <div class="muted">Subtotal: € ${Number(venda.ven_subtotal).toFixed(2)}</div>
        <div class="muted">Desconto: € ${Number(venda.ven_desconto).toFixed(2)}</div>
        <div style="font-weight:700">Total: € ${Number(venda.ven_total).toFixed(2)}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd">Produto</th>
          <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #ddd">Preço</th>
          <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #ddd">Qtd</th>
          <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #ddd">Total</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4" style="padding:8px">Sem itens.</td></tr>`}</tbody>
    </table>
    <p class="muted" style="margin-top:16px">Obrigado pela preferência.</p>
  </div>
</body>
</html>`;

        ctx.meta.$responseType = "text/html; charset=utf-8";
        return html;
      }
    }
  }
};
