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
 // dentro de module.exports.actions em services/recibos.service.js
receiptPdf: {
  rest: "POST /vendas/:id/recibo/pdf",
  auth: true,
  params: { id: { type: "number", convert: true, positive: true } },
  async handler(ctx) {
    const venId = Number(ctx.params.id);

    // Lê cabeçalho da venda
    const venda = await sequelize.query(
      `SELECT ven_id, ven_codigo, ven_total, ven_fk_user, ven_cliente_nome,
              ven_subtotal, ven_desconto, ven_data
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

    // helpers
    const esc = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const money = (n) => Number(n || 0).toFixed(2);

    // linhas dos itens
    const rows = itens.length
      ? itens.map(it => {
          const nome = nomeById[it.vni_fk_material] || `ID ${it.vni_fk_material}`;
          const pu = money(it.vni_preco_unit);
          const tot = money(it.vni_total);
          return `
<tr>
  <td class="nm">${esc(nome)}</td>
  <td class="q">${it.vni_qtd}</td>
  <td class="pu">${pu}</td>
  <td class="t">${tot}</td>
</tr>`;
        }).join("")
      : `<tr><td colspan="4" class="empty">Sem itens.</td></tr>`;

    // largura do papel (58 ou 80 mm)
    const PAPER_MM = 80;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Recibo ${esc(venda.ven_codigo)}</title>
  <style>
    @page { size: ${PAPER_MM}mm auto; margin: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body {
      width: ${PAPER_MM}mm;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      color: #000; background: #fff;
    }
    .wrap { padding: 2mm 2mm; }
    .center { text-align: center; }
    .muted { color: #000; opacity: .9; }
    .h1 { font-weight: 700; font-size: 12.5px; }
    .h2 { font-size: 11px; margin-top: 1mm; }
    .small { font-size: 10px; }
    hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
    .row { display: flex; justify-content: space-between; align-items: baseline; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td { padding: 1mm 0; font-size: 11px; vertical-align: top; }
    td.nm { width: calc(100% - 44mm); padding-right: 1mm; word-wrap: break-word; overflow-wrap: anywhere; }
    td.q  { width: 10mm; text-align: right; }
    td.pu { width: 14mm; text-align: right; }
    td.t  { width: 20mm; text-align: right; font-weight: 700; }
    .empty { text-align: center; padding: 4mm 0; font-size: 10px; }
    .totals .row { margin: 1mm 0; }
    .totals .lbl { font-size: 11px; }
    .totals .val { font-size: 11px; }
    .totals .grand .lbl, .totals .grand .val { font-weight: 700; font-size: 12px; }
    .footer { margin-top: 3mm; text-align: center; font-size: 10px; }
  </style>
</head>
<body onload="window.print()">
  <div class="wrap">
    <div class="center h1">EPSTP</div>
    <div class="center h2 muted">Recibo — ${esc(venda.ven_codigo)}</div>

    <div class="small" style="margin-top:2mm">Cliente: ${esc(venda.ven_cliente_nome || "-")}</div>
    <div class="small">Data: ${new Date(venda.ven_data).toLocaleString()}</div>

    <hr/>

    <table aria-label="Itens">
      <thead>
        <tr>
          <td class="small muted">Produto</td>
          <td class="small muted q">Qtd</td>
          <td class="small muted pu">Preço</td>
          <td class="small muted t">Total</td>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <hr/>

    <section class="totals" aria-label="Totais">
      <div class="row"><div class="lbl">Subtotal</div><div class="val">€ ${money(venda.ven_subtotal)}</div></div>
      <div class="row"><div class="lbl">Desconto</div><div class="val">€ ${money(venda.ven_desconto)}</div></div>
      <div class="row grand"><div class="lbl">TOTAL</div><div class="val">€ ${money(venda.ven_total)}</div></div>
    </section>

    <hr/>

    <div class="footer muted">Obrigado pela preferência.</div>
  </div>

  <script>
    // Fecha a janela (quando aberta em popup) após imprimir
    window.onafterprint = () => setTimeout(() => window.close && window.close(), 300);
  </script>
</body>
</html>`;

    ctx.meta.$responseType = "text/html; charset=utf-8";
    return html;
  }
}

  }
};
