"use strict";

const fs = require("fs");
const path = require("path");
const SequelizeAdapter = require("moleculer-db-adapter-sequelize");
const sequelize = require("../config/db");
const PDFDocument = require("pdfkit");

const { Recibo, VendaItem, Material } = require("../models/index");

// 🔧 AJUSTA ESTE CAMINHO PARA O TEU PROJETO
// Podes colocar a imagem, por exemplo, em /app/assets/logo-epstp.jpg
// Aqui deixo um fallback para o caminho que me enviaste.
const LOGO_PATH =
  process.env.RECIBO_LOGO_PATH ||
  path.resolve(__dirname, "../assets/logo-epstp.jpg");

// cache em memória para não reler o ficheiro em cada request
let _logoBuffer = null;
let _logoBase64 = null;
function ensureLogoLoaded() {
  if (_logoBuffer && _logoBase64) return;
  try {
    _logoBuffer = fs.readFileSync(LOGO_PATH);
    const mime =
      LOGO_PATH.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    _logoBase64 = `data:${mime};base64,${_logoBuffer.toString("base64")}`;
  } catch (err) {
    // se a imagem não existir, segue sem logótipo
    _logoBuffer = null;
    _logoBase64 = null;
  }
}

module.exports = {
  name: "recibos",
  adapter: new SequelizeAdapter(sequelize),

  actions: {
    /** POST /vendas/:id/recibo → garante que existe recibo para a venda e devolve dados básicos */
    gerar: {
      rest: "POST /vendas/:id/recibo",
      auth: true,
      params: { id: { type: "number", convert: true, positive: true } },
      async handler(ctx) {
        const venId = Number(ctx.params.id);

        let rec = await Recibo.findOne({ where: { rec_fk_venda: venId } });
        if (!rec) {
          const venda = await sequelize
            .query(
              `SELECT ven_id, ven_codigo, ven_total, ven_fk_user, ven_cliente_nome, ven_subtotal, ven_desconto, ven_data
               FROM tb_vendas WHERE ven_id = ?`,
              { replacements: [venId], type: sequelize.QueryTypes.SELECT }
            )
            .then((rows) => rows[0]);

          if (!venda) throw new Error("Venda não encontrada.");
          if (venda.ven_total == null)
            throw new Error("Venda sem total calculado.");

          rec = await Recibo.create({
            rec_fk_user: venda.ven_fk_user,
            rec_tipo: "Venda de Material",
            rec_total: Number(venda.ven_total || 0),
            rec_ref: venda.ven_codigo,
            rec_fk_venda: venda.ven_id,
            rec_cliente_nome: venda.ven_cliente_nome,
            data: new Date(),
          });
        }

        return {
          message: "Recibo pronto.",
          recibo: {
            rec_id: rec.rec_id,
            rec_ref: rec.rec_ref,
            rec_total: rec.rec_total,
          },
        };
      },
    },

    /** GET /recibos/:id/pdf → devolve o PDF com layout melhorado e logótipo */
    pdf: {
      rest: "GET /recibos/:id/pdf",
      auth: true,
      params: { id: { type: "number", convert: true, positive: true } },
      async handler(ctx) {
        ensureLogoLoaded();

        const recId = Number(ctx.params.id);
        const rec = await Recibo.findByPk(recId, { raw: true });
        if (!rec) throw new Error("Recibo não encontrado.");

        const itens = await VendaItem.findAll({
          where: { vni_fk_venda: rec.rec_fk_venda },
          raw: true,
        });

        const nomeById = {};
        if (itens.length) {
          const ids = [...new Set(itens.map((i) => i.vni_fk_material))].filter(
            Boolean
          );
          if (ids.length) {
            const mats = await Material.findAll({
              where: { mat_id: ids },
              raw: true,
            });
            mats.forEach((m) => {
              nomeById[m.mat_id] = m.mat_nome;
            });
          }
        }

        // === PDF ===
        const doc = new PDFDocument({
          margin: 36,
          info: {
            Title: `Recibo ${rec.rec_ref || rec.rec_id}`,
            Author: "EPSTP",
            Subject: "Recibo de venda",
          },
        });

        const chunks = [];
        doc.on("data", (d) => chunks.push(d));
        const done = new Promise((res) => doc.on("end", res));

        // Cabeçalho com logo
        if (_logoBuffer) {
          const LOGO_W = 120; // largura alvo
          doc.image(_logoBuffer, (doc.page.width - LOGO_W) / 2, 36, {
            fit: [LOGO_W, 60],
            align: "center",
          });
          doc.moveDown(3.5);
        } else {
          doc.moveDown(0.5);
        }

        // Título
        doc
          .fontSize(16)
          .font("Helvetica-Bold")
          .text("Escola Portuguesa de São Tomé e Príncipe - CELP", {
            align: "center",
            lineGap: 2,
          });
        doc.moveDown(0.4);
        doc
          .fontSize(12)
          .font("Helvetica")
          .fillColor("#555")
          .text("Recibo", { align: "center" })
          .fillColor("#000");

        doc.moveDown(1);

        // Meta
        const metaLeft = [
          `Recibo: ${rec.rec_id}`,
          `Referência: ${rec.rec_ref || "-"}`,
          `Cliente: ${rec.rec_cliente_nome || "-"}`,
        ].join("\n");
        const metaRight = [
          `Tipo: ${rec.rec_tipo || "-"}`,
          `Data: ${new Date(rec.data).toLocaleString()}`,
        ].join("\n");

        const startY = doc.y;
        doc
          .fontSize(10)
          .text(metaLeft, { width: doc.page.width / 2 - 48, continued: false });
        doc.y = startY;
        doc.text(metaRight, doc.page.width / 2, startY, {
          width: doc.page.width / 2 - 48,
          align: "right",
        });

        doc.moveDown(0.7);
        // linha separadora
        const x0 = 36;
        const x1 = doc.page.width - 36;
        doc
          .moveTo(x0, doc.y)
          .lineTo(x1, doc.y)
          .dash(2, { space: 2 })
          .strokeColor("#999")
          .stroke()
          .undash()
          .strokeColor("#000");
        doc.moveDown(0.7);

        // Tabela de itens
        const money = (n) => Number(n || 0).toFixed(2);
        const col = {
          nome: x0,
          qtd: x0 + 300,
          pu: x0 + 360,
          tot: x0 + 440,
        };

        doc.font("Helvetica-Bold").fontSize(10);
        doc.text("Produto:", col.nome, doc.y, { width: 279 });
        doc.text("Qtd", col.qtd, doc.y, { width: 40, align: "right" });
        doc.text("Preço", col.pu, doc.y, { width: 60, align: "right" });
        doc.text("Total", col.tot, doc.y, { width: 80, align: "right" });
        doc.moveDown(0.3);
        doc
          .moveTo(x0, doc.y)
          .lineTo(x1, doc.y)
          .strokeColor("#222")
          .stroke()
          .strokeColor("#000");
        doc.moveDown(0.4);

        doc.font("Helvetica").fontSize(10);
        if (!itens.length) {
          doc.fillColor("#666").text("Sem itens.", x0).fillColor("#000");
        } else {
          itens.forEach((it) => {
            const nome = nomeById[it.vni_fk_material] || `ID ${it.vni_fk_material}`;
            const pu = money(it.vni_preco_unit);
            const tot = money(it.vni_total);

            const y = doc.y;
            doc.text(nome, col.nome, y, { width: 280 });
            doc.text(String(it.vni_qtd), col.qtd, y, {
              width: 40,
              align: "right",
            });
            doc.text(pu, col.pu, y, { width: 60, align: "right" });
            doc.text(tot, col.tot, y, { width: 80, align: "right" });
            doc.moveDown(0.2);
          });
        }

        doc.moveDown(0.6);
        doc
          .moveTo(x0, doc.y)
          .lineTo(x1, doc.y)
          .dash(2, { space: 2 })
          .strokeColor("#999")
          .stroke()
          .undash()
          .strokeColor("#000");
        doc.moveDown(0.6);

        // Totais
        doc.font("Helvetica").fontSize(10);
        const labelWidth = 80;
        const valueWidth = 80;
        const rightColX = x1 - valueWidth;

        const addRow = (label, value, bold = false) => {
          const y = doc.y;
          doc.font(bold ? "Helvetica-Bold" : "Helvetica");
          doc.text(label, rightColX - labelWidth, y, {
            width: labelWidth,
            align: "right",
          });
          doc.text(value, rightColX, y, { width: valueWidth, align: "right" });
          doc.moveDown(0.2);
        };

        // Se tiveres estes campos na venda, podes buscá-los como no HTML (abaixo).
        // Aqui só temos o total do recibo:
        addRow("TOTAL", `€ ${money(rec.rec_total)}`, true);

        doc.moveDown(1);
        doc.fontSize(9).fillColor("#666").text("Obrigado pela preferência.", {
          align: "center",
        });

        doc.end();
        await done;

        const buffer = Buffer.concat(chunks);
        ctx.meta.$responseType = "application/pdf";
        ctx.meta.$responseHeaders = {
          "Content-Disposition": `inline; filename="recibo-${rec.rec_id}.pdf"`,
        };
        return buffer;
      },
    },

    /**
     * POST /vendas/:id/recibo/pdf → devolve um HTML imprimível com logótipo e layout térmico (58/80mm)
     */
    receiptPdf: {
      rest: "POST /vendas/:id/recibo/pdf",
      auth: true,
      params: { id: { type: "number", convert: true, positive: true } },
      async handler(ctx) {
        ensureLogoLoaded();

        const venId = Number(ctx.params.id);
        const venda = await sequelize
          .query(
            `SELECT ven_id, ven_codigo, ven_total, ven_fk_user, ven_cliente_nome,
                    ven_subtotal, ven_desconto, ven_data
             FROM tb_vendas WHERE ven_id = ?`,
            { replacements: [venId], type: sequelize.QueryTypes.SELECT }
          )
          .then((rows) => rows[0]);

        if (!venda) throw new Error("Venda não encontrada.");

        const itens = await VendaItem.findAll({
          where: { vni_fk_venda: venId },
          raw: true,
        });

        const nomeById = {};
        if (itens.length) {
          const ids = [...new Set(itens.map((i) => i.vni_fk_material))].filter(
            Boolean
          );
          if (ids.length) {
            const mats = await Material.findAll({
              where: { mat_id: ids },
              raw: true,
            });
            mats.forEach((m) => {
              nomeById[m.mat_id] = m.mat_nome;
            });
          }
        }

        const esc = (s) =>
          String(s ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        const money = (n) => Number(n || 0).toFixed(2);

        const rows = itens.length
          ? itens
              .map((it) => {
                const nome =
                  nomeById[it.vni_fk_material] || `ID ${it.vni_fk_material}`;
                const pu = money(it.vni_preco_unit);
                const tot = money(it.vni_total);
                return `
<tr>
  <td class="nm">${esc(nome)}</td>
  <td class="q">${it.vni_qtd}</td>
  <td class="pu">${pu}</td>
  <td class="t">${tot}</td>
</tr>`;
              })
              .join("")
          : `<tr><td colspan="4" class="empty">Sem itens.</td></tr>`;

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
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
      color: #000; background: #fff;
    }
    .wrap { padding: 2mm 2mm; }
    .center { text-align: center; }
    .muted { color: #000; opacity: .85; }
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
    .logo { display:flex; align-items:center; justify-content:center; gap:4px; flex-direction:column; }
    .logo img { max-width: 56mm; height: auto; }
  </style>
</head>
<body onload="window.print()">
  <div class="wrap">
    <div class="logo">
      ${
        _logoBase64
          ? `<img src="${_logoBase64}" alt="EPSTP logo" />`
          : ""
      }
      <div class="center h1">Escola Portuguesa de São Tomé e Príncipe - CELP</div>
      <div class="center h2 muted">Recibo — ${esc(venda.ven_codigo)}</div>
    </div>

    <div class="small" style="margin-top:2mm">Cliente: ${esc(
      venda.ven_cliente_nome || "-"
    )}</div>
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
      <div class="row"><div class="lbl">Subtotal</div><div class="val">€ ${money(
        venda.ven_subtotal
      )}</div></div>
      <div class="row"><div class="lbl">Desconto</div><div class="val">€ ${money(
        venda.ven_desconto
      )}</div></div>
      <div class="row grand"><div class="lbl">TOTAL</div><div class="val">€ ${money(
        venda.ven_total
      )}</div></div>
    </section>

    <hr/>

    <div class="footer muted">Obrigado pela preferência.</div>
  </div>

  <script>
    window.onafterprint = () => setTimeout(() => window.close && window.close(), 300);
  </script>
</body>
</html>`;

        ctx.meta.$responseType = "text/html; charset=utf-8";
        return html;
      },
    },
  },
};
