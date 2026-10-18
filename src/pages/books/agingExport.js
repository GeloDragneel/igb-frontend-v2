// Excel + PDF for Receivables / Payables aging (uses exceljs, jspdf, jspdf-autotable)
const FONT = "Arial Narrow";
const NUM = '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)';
export const money = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) < 0.005) return "-";
  const s = Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
};
const save = (blob, name) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};
const heads = (c) => [c?.trade_name || c?.name, c?.address, c?.tin ? `T.I.N. ${c.tin}` : null].filter(Boolean);

/** groups = [{ party_id, party_name, rows: [...], totals: {...} }] */
export async function agingExcel({ title, subtitle, partyLabel, company, buckets, groups, totals, fileName }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title.slice(0, 31), {
    views: [{ showGridLines: false, state: "frozen", ySplit: 7 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const f = (o = {}) => ({ name: FONT, size: 11, ...o });
  const cols = [`${partyLabel} / Invoice #`, "Date", "Days", ...buckets.map((b) => b.label), "Amount Due"];
  ws.columns = cols.map((_, i) => ({ width: i === 0 ? 42 : i < 3 ? 12 : 16 }));
  let r = 1;
  heads(company).forEach((t, i) => { const c = ws.getCell(r++, 1); c.value = t; c.font = f({ bold: i === 0, size: i === 0 ? 13 : 11 }); });
  [[title, true], [subtitle, false]].forEach(([t, b]) => { const c = ws.getCell(r++, 1); c.value = t; c.font = f({ bold: b }); });
  r = 7;
  const hr = ws.getRow(r++);
  cols.forEach((t, i) => {
    const c = hr.getCell(i + 1);
    c.value = t; c.font = f({ bold: true });
    c.alignment = { horizontal: i < 1 ? "left" : i < 3 ? "center" : "right" };
    c.border = { bottom: { style: "thin" } };
  });
  const numCols = buckets.map((_, i) => 4 + i).concat([4 + buckets.length]);
  const L = (n) => String.fromCharCode(64 + n);
  const subRows = [];
  for (const g of groups) {
    const gr = ws.getRow(r++);
    gr.getCell(1).value = `${g.party_id ? g.party_id + " · " : ""}${g.party_name}`;
    gr.getCell(1).font = f({ bold: true });
    const first = r;
    for (const x of g.rows) {
      const row = ws.getRow(r++);
      row.getCell(1).value = x.document_no; row.getCell(1).alignment = { indent: 2 }; row.getCell(1).font = f();
      row.getCell(2).value = x.date; row.getCell(2).alignment = { horizontal: "center" }; row.getCell(2).font = f();
      row.getCell(3).value = x.days; row.getCell(3).alignment = { horizontal: "center" }; row.getCell(3).font = f();
      buckets.forEach((b, i) => { const c = row.getCell(4 + i); c.value = Number(x[b.key]) || 0; c.numFmt = NUM; c.font = f(); });
      const ad = row.getCell(4 + buckets.length);
      ad.value = { formula: `SUM(${L(4)}${r - 1}:${L(3 + buckets.length)}${r - 1})`, result: Number(x.amount_due) || 0 };
      ad.numFmt = NUM; ad.font = f();
    }
    const sr = ws.getRow(r++);
    sr.getCell(1).value = `Total ${g.party_name}`; sr.getCell(1).font = f({ bold: true }); sr.getCell(1).alignment = { indent: 1 };
    numCols.forEach((ci) => {
      const c = sr.getCell(ci);
      const key = ci === 4 + buckets.length ? "amount_due" : buckets[ci - 4].key;
      c.value = { formula: `SUM(${L(ci)}${first}:${L(ci)}${r - 2})`, result: Number(g.totals[key]) || 0 };
      c.numFmt = NUM; c.font = f({ bold: true }); c.border = { top: { style: "thin" } };
    });
    subRows.push(r - 1);
    r++;
  }
  const tr = ws.getRow(r);
  tr.getCell(1).value = "GRAND TOTAL"; tr.getCell(1).font = f({ bold: true });
  numCols.forEach((ci) => {
    const c = tr.getCell(ci);
    const key = ci === 4 + buckets.length ? "amount_due" : buckets[ci - 4].key;
    c.value = subRows.length ? { formula: subRows.map((x) => `${L(ci)}${x}`).join("+"), result: Number(totals[key]) || 0 } : 0;
    c.numFmt = NUM; c.font = f({ bold: true }); c.border = { top: { style: "thin" }, bottom: { style: "double" } };
  });
  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileName}.xlsx`);
}

export async function agingPdf({ title, subtitle, partyLabel, company, buckets, groups, totals, fileName }) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  let y = 40;
  heads(company).forEach((t, i) => { doc.setFont("helvetica", i === 0 ? "bold" : "normal"); doc.setFontSize(i === 0 ? 12 : 9.5); doc.text(String(t), W / 2, y, { align: "center" }); y += 13; });
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(title, W / 2, y + 6, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(subtitle, W / 2, y + 20, { align: "center" });

  const body = [];
  const kinds = [];
  for (const g of groups) {
    body.push([{ content: `${g.party_id ? g.party_id + " · " : ""}${g.party_name}`, colSpan: 4 + buckets.length }]); kinds.push("party");
    for (const x of g.rows) { body.push([`   ${x.document_no}`, x.date || "", String(x.days), ...buckets.map((b) => money(x[b.key])), money(x.amount_due)]); kinds.push("row"); }
    body.push([`Total ${g.party_name}`, "", "", ...buckets.map((b) => money(g.totals[b.key])), money(g.totals.amount_due)]); kinds.push("sub");
  }
  body.push(["GRAND TOTAL", "", "", ...buckets.map((b) => money(totals[b.key])), money(totals.amount_due)]); kinds.push("grand");

  autoTable(doc, {
    startY: y + 34,
    head: [[`${partyLabel} / Invoice #`, "Date", "Days", ...buckets.map((b) => b.label), "Amount Due"]],
    body,
    theme: "plain",
    margin: { left: 36, right: 36 },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 3, textColor: 20 },
    headStyles: { fontStyle: "bold", lineWidth: { bottom: 0.8 }, lineColor: 20 },
    columnStyles: Object.fromEntries([[1, { halign: "center", cellWidth: 62 }], [2, { halign: "center", cellWidth: 36 }],
      ...buckets.map((_, i) => [3 + i, { halign: "right", cellWidth: 70 }]), [3 + buckets.length, { halign: "right", cellWidth: 80 }]]),
    didParseCell: (h) => {
      if (h.section === "head" && h.column.index >= 3) h.cell.styles.halign = "right";
      if (h.section !== "body") return;
      const k = kinds[h.row.index];
      if (k !== "row") h.cell.styles.fontStyle = "bold";
      if (k === "party") h.cell.styles.fillColor = [243, 244, 246];
    },
    didDrawCell: (h) => {
      if (h.section !== "body" || h.column.index < 3) return;
      const k = kinds[h.row.index];
      if (k !== "sub" && k !== "grand") return;
      const { x, y: cy, width, height } = h.cell;
      doc.setLineWidth(0.5); doc.line(x + 4, cy, x + width, cy);
      if (k === "grand") { doc.line(x + 4, cy + height, x + width, cy + height); doc.line(x + 4, cy + height + 2, x + width, cy + height + 2); }
    },
  });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFontSize(8); doc.text(`Page ${p} of ${pages}`, W - 36, doc.internal.pageSize.getHeight() - 20, { align: "right" }); }
  doc.save(`${fileName}.pdf`);
}
