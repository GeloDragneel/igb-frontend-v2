// Excel + PDF export for Financial Report → Financial Statement
// Needs:  npm i exceljs jspdf jspdf-autotable
// Both libraries are loaded only when a download is clicked.

const FONT = "Arial Narrow";
const NUM_FMT = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)';   // same as the sample AFS

/** accounting display used by the UI and the PDF: 1,234 · (1,234) · - */
export const acct = (v) => {
  const n = Math.round(Number(v) || 0);
  if (n === 0) return "-";
  const s = Math.abs(n).toLocaleString("en-PH");
  return n < 0 ? `(${s})` : s;
};

const headerLines = (company) =>
  [company?.trade_name || company?.name, company?.trade_name && company?.name && company.trade_name !== company.name ? `( ${company.name} )` : null,
  company?.address, company?.tin ? `T.I.N. ${company.tin}` : null].filter(Boolean);

const fileBase = (company, year) =>
  `FS-${year}_${String(company?.trade_name || company?.name || "Company").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;

const save = (blob, name) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};

/* =========================================================
   EXCEL
   ========================================================= */
export async function downloadExcel(data) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "BizDesk";
  wb.created = new Date();
  const years = data.years;
  const y1 = years[0];
  const heads = headerLines(data.company);
  const font = (o = {}) => ({ name: FONT, size: 12, ...o });

  /* ---- cover ---- */
  const cover = wb.addWorksheet("COVER PAGE", { views: [{ showGridLines: false }] });
  cover.getColumn(1).width = 90;
  let r = 12;
  heads.forEach((t, i) => { const c = cover.getCell(r++, 1); c.value = t; c.font = font({ bold: i === 0, size: i === 0 ? 16 : 12 }); c.alignment = { horizontal: "center" }; });
  r += 4;
  [["FINANCIAL STATEMENTS", true, 16], [`December 31, ${y1}`, false, 12]].forEach(([t, b, s]) => {
    const c = cover.getCell(r++, 1); c.value = t; c.font = font({ bold: b, size: s }); c.alignment = { horizontal: "center" };
  });
  r += 12;
  const pc = cover.getCell(r, 1); pc.value = "PHILIPPINE CURRENCY"; pc.font = font({ bold: true }); pc.alignment = { horizontal: "center" };

  /* ---- one sheet per statement ---- */
  const valueCols = years.map((_, i) => 3 + i);          // C, D
  const colLetter = (n) => String.fromCharCode(64 + n);
  const sheetNames = { sfp: "SFP", si: "SI", sce: "SCE", scf: "SCF" };

  for (const st of data.statements) {
    const ws = wb.addWorksheet(sheetNames[st.key] || st.key.toUpperCase(), {
      views: [{ showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.7, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    });
    ws.getColumn(1).width = 58;
    ws.getColumn(2).width = 8;
    valueCols.forEach((c) => (ws.getColumn(c).width = 18));

    let row = 1;
    heads.forEach((t, i) => { const c = ws.getCell(row++, 1); c.value = t; c.font = font({ bold: i === 0 }); });
    row++;
    [[st.title, true], [st.period, false], ["(in Philippine Pesos)", false]].forEach(([t, b]) => { const c = ws.getCell(row++, 1); c.value = t; c.font = font({ bold: b }); });
    row++;
    const hdr = ws.getRow(row++);
    hdr.getCell(2).value = "Notes";
    years.forEach((y, i) => { hdr.getCell(valueCols[i]).value = String(y); });
    [2, ...valueCols].forEach((c) => {
      const cell = hdr.getCell(c);
      cell.font = font({ bold: true });
      cell.alignment = { horizontal: "center" };
      cell.border = { bottom: { style: "thin" } };
    });

    const at = {};                                       // line id → excel row
    for (const l of st.lines) {
      const xr = ws.getRow(row);
      at[l.id] = row;
      if (l.kind !== "blank") {
        const lab = xr.getCell(1);
        lab.value = l.label;
        lab.alignment = { indent: (l.indent || 0) * 2 };
        lab.font = font({ bold: ["head", "sub", "total", "grand"].includes(l.kind) && !(l.kind === "total" && l.indent) });
        if (l.note) { const n = xr.getCell(2); n.value = l.note; n.font = font(); n.alignment = { horizontal: "center" }; }
      }
      if (l.values) {
        years.forEach((y, i) => {
          const c = xr.getCell(valueCols[i]);
          const col = colLetter(valueCols[i]);
          const val = Math.round(Number(l.values[y]) || 0);
          if (l.of && l.of.length) {
            const f = l.of.map(([id, sign], k) => `${sign < 0 ? "-" : k ? "+" : ""}${col}${at[id]}`).join("");
            c.value = { formula: f, result: val };
          } else if (l.of) {
            c.value = { formula: "0", result: 0 };
          } else {
            c.value = val;
          }
          c.numFmt = NUM_FMT;
          c.font = font({ bold: l.kind === "grand" || (l.kind === "total" && !l.indent) });
          if (l.kind === "total") c.border = { top: { style: "thin" } };
          if (l.kind === "grand") c.border = { top: { style: "thin" }, bottom: { style: "double" } };
        });
      }
      row++;
    }
    row++;
    const foot = ws.getCell(row, 1);
    foot.value = "See accompanying Notes to Financial Statements";
    foot.font = font({ italic: true, size: 10 });
  }

  /* ---- notes ---- */
  const ns = wb.addWorksheet("NFS", { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ns.getColumn(1).width = 64;
  valueCols.forEach((c) => (ns.getColumn(c).width = 18));
  ns.getColumn(2).width = 4;
  let nr = 1;
  heads.forEach((t, i) => { const c = ns.getCell(nr++, 1); c.value = t; c.font = font({ bold: i === 0 }); });
  nr++;
  [["NOTES TO FINANCIAL STATEMENTS", true], [data.period_text?.for_years || "", false], ["(in Philippine Pesos)", false]].forEach(([t, b]) => {
    const c = ns.getCell(nr++, 1); c.value = t; c.font = font({ bold: b });
  });
  nr++;
  const text = (t, o = {}) => { const c = ns.getCell(nr++, 1); c.value = t; c.font = font(o); c.alignment = { wrapText: true, vertical: "top" }; ns.mergeCells(nr - 1, 1, nr - 1, valueCols[valueCols.length - 1]); return c; };
  text(`NOTE 1 | GENERAL INFORMATION`, { bold: true });
  text(`${data.company?.trade_name || data.company?.name || "The Company"}${data.company?.address ? ` is located at ${data.company.address}` : ""}${data.company?.tin ? ` with T.I.N. ${data.company.tin}` : ""}.`);
  ns.getRow(nr - 1).height = 32;
  nr++;
  text(`NOTE 2 | BASIS OF PREPARATION`, { bold: true });
  text("The financial statements have been prepared in accordance with the Philippine Financial Reporting Standard for Small Entities (PFRS for SEs), on a going concern basis, and are presented in Philippine Pesos.");
  ns.getRow(nr - 1).height = 48;
  nr++;

  for (const n of data.notes) {
    const t = ns.getCell(nr++, 1);
    t.value = `NOTE ${n.no} | ${n.title}`;
    t.font = font({ bold: true });
    const h = ns.getRow(nr++);
    years.forEach((y, i) => { const c = h.getCell(valueCols[i]); c.value = String(y); c.font = font({ bold: true }); c.alignment = { horizontal: "center" }; c.border = { bottom: { style: "thin" } }; });
    const first = nr;
    for (const a of n.rows) {
      const xr = ns.getRow(nr++);
      xr.getCell(1).value = `${a.code}  ${a.label}`;
      xr.getCell(1).font = font();
      xr.getCell(1).alignment = { indent: 2 };
      years.forEach((y, i) => { const c = xr.getCell(valueCols[i]); c.value = Math.round(Number(a.values[y]) || 0); c.numFmt = NUM_FMT; c.font = font(); });
    }
    const tr = ns.getRow(nr++);
    tr.getCell(1).value = "Total";
    tr.getCell(1).font = font({ bold: true });
    years.forEach((y, i) => {
      const col = colLetter(valueCols[i]);
      const c = tr.getCell(valueCols[i]);
      c.value = n.rows.length ? { formula: `SUM(${col}${first}:${col}${nr - 2})`, result: Math.round(Number(n.total[y]) || 0) } : 0;
      c.numFmt = NUM_FMT;
      c.font = font({ bold: true });
      c.border = { top: { style: "thin" }, bottom: { style: "double" } };
    });
    nr++;
  }

  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase(data.company, y1)}.xlsx`);
}

/* =========================================================
   PDF
   ========================================================= */
export async function downloadPdf(data) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const years = data.years;
  const heads = headerLines(data.company);
  const center = (t, y, size = 11, bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.text(String(t), W / 2, y, { align: "center" }); };

  /* ---- cover ---- */
  let y = 260;
  heads.forEach((t, i) => { center(t, y, i === 0 ? 16 : 11, i === 0); y += i === 0 ? 22 : 16; });
  y += 60;
  center("FINANCIAL STATEMENTS", y, 16, true);
  center(`December 31, ${years[0]}`, y + 20, 12);
  center("PHILIPPINE CURRENCY", H - 120, 11, true);

  const pageHeader = (title, period) => {
    let yy = 56;
    heads.forEach((t, i) => { doc.setFont("helvetica", i === 0 ? "bold" : "normal"); doc.setFontSize(i === 0 ? 11 : 9.5); doc.text(String(t), 48, yy); yy += 13; });
    yy += 10;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(title, 48, yy); yy += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.text(period, 48, yy); yy += 12;
    doc.text("(in Philippine Pesos)", 48, yy);
    return yy + 14;
  };

  const numStyle = { halign: "right", cellWidth: 92 };
  const columnStyles = { 0: { cellWidth: "auto" }, 1: { halign: "center", cellWidth: 40 }, ...Object.fromEntries(years.map((_, i) => [2 + i, numStyle])) };

  /* ---- statements ---- */
  for (const st of data.statements) {
    doc.addPage();
    const startY = pageHeader(st.title, st.period);
    const body = st.lines.map((l) => [
      { content: l.kind === "blank" ? "" : l.label, styles: { cellPadding: { left: 4 + (l.indent || 0) * 14, top: 2.5, bottom: 2.5, right: 4 } } },
      l.note ?? "",
      ...years.map((yy) => (l.values ? acct(l.values[yy]) : "")),
    ]);
    autoTable(doc, {
      startY,
      head: [["", "Notes", ...years.map(String)]],
      body,
      theme: "plain",
      margin: { left: 48, right: 48 },
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.5, textColor: 20 },
      headStyles: { fontStyle: "bold", halign: "center", lineWidth: { bottom: 0.8 }, lineColor: 20 },
      columnStyles,
      didParseCell: (h) => {
        if (h.section !== "body") return;
        const l = st.lines[h.row.index];
        if (["head", "sub"].includes(l.kind) || l.kind === "grand" || (l.kind === "total" && !l.indent)) h.cell.styles.fontStyle = "bold";
      },
      didDrawCell: (h) => {
        if (h.section !== "body" || h.column.index < 2) return;
        const l = st.lines[h.row.index];
        if (!["total", "grand"].includes(l.kind)) return;
        const { x, y: cy, width, height } = h.cell;
        doc.setLineWidth(0.6);
        doc.line(x + 6, cy, x + width, cy);
        if (l.kind === "grand") { doc.line(x + 6, cy + height, x + width, cy + height); doc.line(x + 6, cy + height + 2, x + width, cy + height + 2); }
      },
    });
    doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
    doc.text("See accompanying Notes to Financial Statements", 48, doc.lastAutoTable.finalY + 22);
  }

  /* ---- notes ---- */
  doc.addPage();
  let ny = pageHeader("NOTES TO FINANCIAL STATEMENTS", data.period_text?.for_years || "");
  const para = (title, textBody) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(title, 48, ny); ny += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(textBody, W - 96);
    doc.text(lines, 48, ny); ny += lines.length * 12 + 10;
  };
  para("NOTE 1 | GENERAL INFORMATION", `${data.company?.trade_name || data.company?.name || "The Company"}${data.company?.address ? ` is located at ${data.company.address}` : ""}${data.company?.tin ? ` with T.I.N. ${data.company.tin}` : ""}.`);
  para("NOTE 2 | BASIS OF PREPARATION", "The financial statements have been prepared in accordance with the Philippine Financial Reporting Standard for Small Entities (PFRS for SEs), on a going concern basis, and are presented in Philippine Pesos.");

  for (const n of data.notes) {
    if (ny > H - 140) { doc.addPage(); ny = 60; }
    autoTable(doc, {
      startY: ny,
      head: [[`NOTE ${n.no} | ${n.title}`, ...years.map(String)]],
      body: [...n.rows.map((a) => [`${a.code}  ${a.label}`, ...years.map((yy) => acct(a.values[yy]))]), ["Total", ...years.map((yy) => acct(n.total[yy]))]],
      theme: "plain",
      margin: { left: 48, right: 48 },
      styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.5, textColor: 20 },
      headStyles: { fontStyle: "bold", lineWidth: { bottom: 0.8 }, lineColor: 20 },
      columnStyles: { 0: { cellPadding: { left: 14, top: 2.5, bottom: 2.5, right: 4 } }, ...Object.fromEntries(years.map((_, i) => [1 + i, numStyle])) },
      didParseCell: (h) => {
        if (h.section === "head" && h.column.index > 0) h.cell.styles.halign = "right";
        if (h.section === "body" && h.row.index === n.rows.length) h.cell.styles.fontStyle = "bold";
      },
      didDrawCell: (h) => {
        if (h.section !== "body" || h.column.index < 1 || h.row.index !== n.rows.length) return;
        const { x, y: cy, width, height } = h.cell;
        doc.setLineWidth(0.6);
        doc.line(x + 6, cy, x + width, cy);
        doc.line(x + 6, cy + height, x + width, cy + height);
        doc.line(x + 6, cy + height + 2, x + width, cy + height + 2);
      },
    });
    ny = doc.lastAutoTable.finalY + 20;
  }

  /* page numbers (cover has none) */
  const pages = doc.getNumberOfPages();
  for (let p = 2; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text(String(p - 1), W / 2, H - 28, { align: "center" });
  }

  doc.save(`${fileBase(data.company, years[0])}.pdf`);
}
