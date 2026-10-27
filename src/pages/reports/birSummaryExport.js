// Reports → BIR Return Summary → Excel (2 sheets like the template: SUMMARY + AUDIT)
// Needs exceljs (already used by Financial Statement). Loaded only when Excel is clicked.
import { QUARTERS, Q_LABEL, MONTHS, MONTH_NAME, NON_QTR_MONTHS, num } from "./birSummaryCalc";

const MONEY = '#,##0.00;(#,##0.00);"-"';
const PCT = "0.00%";

export async function exportBirSummary({ client, year, S, c }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "IGB";
  wb.created = new Date();
  const name = client?.trade_name || client?.name || "Client";
  const a = c.a;

  const sheet = (title, widths) => {
    const ws = wb.addWorksheet(title, { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    return ws;
  };
  const put = (ws, r, cells, o = {}) => {
    cells.forEach((v, i) => {
      if (v === undefined || v === null || v === "") return;
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      if (typeof v === "number") cell.numFmt = (o.pct === true || (Array.isArray(o.pct) && o.pct.includes(i))) ? PCT : MONEY;
      if (o.bold) cell.font = { bold: true };
      if (o.fill && i > 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
    });
    if (o.top) cells.forEach((_, i) => { if (i > 0) ws.getCell(r, i + 1).border = { top: { style: "thin" } }; });
  };
  const title = (ws, r, text, span) => {
    ws.mergeCells(r, 1, r, span);
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = { bold: true, size: r === 1 ? 14 : 12 };
    cell.alignment = { horizontal: "center" };
  };
  const head = (ws, r, cells) => put(ws, r, cells, { bold: true, fill: "FFEFF3F8" });

  /* ======================= SUMMARY ======================= */
  const ws = sheet("SUMMARY", [44, 18, 18, 18, 18, 18, 18, 18]);
  title(ws, 1, name.toUpperCase(), 8);
  title(ws, 2, `SUMMARY OF RETURNS ${year}`, 8);
  let r = 4;
  head(ws, r++, ["ANNUAL", "BASED ON AFS", "BASED ON ITR"]);
  const lines = (rows) => rows.forEach((x) => put(ws, r++, [x.label, num(x.afs) || null, num(x.itr) || null]));
  lines(S.sales);
  put(ws, r++, ["Total Sales", c.salesAfs, c.salesItr], { bold: true, top: true });
  r++;
  lines(S.cos);
  put(ws, r++, ["Total goods available for sale", c.goodsAfs, c.goodsItr], { bold: true, top: true });
  put(ws, r++, ["Less: Merchandise, Ending", c.endAfs, c.endItr]);
  put(ws, r++, ["Total Cost of merchandise", c.cogmAfs, c.cogmItr], { bold: true });
  put(ws, r++, ["Cost of sales-Other Items", c.cosOtherAfs, c.cosOtherItr]);
  put(ws, r++, ["Total cost of sales", c.cosAfs, c.cosItr], { bold: true, top: true });
  r++;
  put(ws, r++, ["Gross Income", c.grossAfs, c.grossItr], { bold: true });
  put(ws, r++, ["", c.gpAfs, c.gpItr], { pct: true });
  put(ws, r++, ["OPERATING EXPENSES"], { bold: true });
  lines(S.opex);
  put(ws, r++, ["TOTAL EXPENSES", c.opexAfs, c.opexItr], { bold: true, top: true });
  put(ws, r++, ["NET INCOME BEFORE TAX", c.nibtAfs, c.nibtItr], { bold: true });
  put(ws, r++, ["LESS: INCOME TAX"], { bold: true });
  if (c.itLess) put(ws, r++, ["Less: exempt / deduction", c.itLess, c.itLess]);
  put(ws, r++, [c.itRate, (c.nibtAfs - c.itLess) * c.itRate, (c.nibtItr - c.itLess) * c.itRate], { pct: [0] });
  put(ws, r++, ["TOTAL INCOME TAX", c.taxAfs, c.taxItr], { bold: true, top: true });
  put(ws, r++, ["NET INCOME AFTER TAX", c.niatAfs, c.niatItr], { bold: true });
  r++;
  put(ws, r++, ["TAXABLE INCOME"], { bold: true });
  ["1ST", "2ND", "3RD"].forEach((t, i) => put(ws, r++, [`1701-Q / 1702-Q ${t}`, c.qPaidAfs[i], c.qPaidItr[i]]));
  put(ws, r++, ["TOTAL PAYABLE", c.qPaidAfsTotal, c.qPaidItrTotal], { bold: true, top: true });
  put(ws, r++, ["LESS: WITHHOLDING"], { bold: true });
  put(ws, r++, [`2307 1ST-4TH QTR ${year}`, c.whAfs, c.whItr]);
  put(ws, r++, ["TOTAL ANNUAL PAYABLE", c.payableAfs, c.payableItr], { bold: true, top: true });
  r += 2;

  head(ws, r++, ["BASED RETURN - 1701-Q / 1702-Q", "", "SALES", "PURCHASES", "ITEMIZED DEDUCTION", "TAX PAID"]);
  QUARTERS.slice(0, 3).forEach((q) => put(ws, r++, [Q_LABEL[q], "", c.q1701.sales[q], c.q1701.purchases[q], c.q1701.itemized[q], c.q1701.tax[q]]));
  put(ws, r++, ["TOTAL", "", c.q1701.sales.total, c.q1701.purchases.total, c.q1701.itemized.total, c.q1701.tax.total], { bold: true, top: true });
  r += 2;

  head(ws, r++, ["BASED RETURN - 2550-Q", "Regular Sales", "SALES TO GOV'T", "Total Sales", "Purchases - Vatable", "Exempt - Purchases", "Total Purchases", "TAX PAID"]);
  QUARTERS.forEach((q) => { const x = c.q2550[q]; put(ws, r++, [Q_LABEL[q], x.regular, x.gov, x.sales, x.vat_purch, x.exempt_purch, x.purch, x.tax]); });
  { const t = c.q2550.total; put(ws, r++, ["TOTAL", t.regular, t.gov, t.sales, t.vat_purch, t.exempt_purch, t.purch, t.tax], { bold: true, top: true }); }
  put(ws, r++, ["12% of total sales", "", "", c.q2550Vat]);
  r++;

  head(ws, r++, ["BASED RETURN - 0605-VT/2550M", "2307", "AMOUNT DUE"]);
  NON_QTR_MONTHS.forEach((m) => put(ws, r++, [MONTH_NAME[m], c.m2550[m].w2307, c.m2550[m].due]));
  put(ws, r++, ["TOTAL", c.m2550.total.w2307, c.m2550.total.due], { bold: true, top: true });
  r++;

  head(ws, r++, ["BASED SLSP", "Vatable", "Exempt - Sales", "Total Sales", "Purchases - Vatable", "Exempt - Purchases", "Total Purchases"]);
  QUARTERS.forEach((q) => { const x = c.slsp[q]; put(ws, r++, [Q_LABEL[q], x.vatable, x.exempt, x.sales, x.vat_purch, x.exempt_purch, x.purch]); });
  { const t = c.slsp.total; put(ws, r++, ["TOTAL", t.vatable, t.exempt, t.sales, t.vat_purch, t.exempt_purch, t.purch], { bold: true, top: true }); }
  put(ws, r++, ["Difference (2550-Q − SLSP)", "", "", c.diffSales, "", "", c.diffPurch]);
  r++;

  head(ws, r++, ["BASED 1601-EQ", "BASIC TAX", "TAX RATE", "Withholding Expanded"]);
  QUARTERS.forEach((q) => c.eq[q].lines.forEach((l, i) => put(ws, r++, [i === 0 ? Q_LABEL[q] : "", num(l.base), num(l.rate), l.tax], { pct: [2] })));
  put(ws, r++, ["TOTAL", c.eq.total.base, "", c.eq.total.tax], { bold: true, top: true });
  r++;

  head(ws, r++, ["BASED RETURN - 0619-E", "", "AMOUNT DUE"]);
  NON_QTR_MONTHS.forEach((m) => put(ws, r++, [MONTH_NAME[m], "", c.e0619[m]]));
  put(ws, r++, ["TOTAL", "", c.e0619.total], { bold: true, top: true });
  r++;

  head(ws, r++, ["BASED RETURN - 1601-C", "", "TOTAL COMPENSATION", "AMOUNT DUE"]);
  MONTHS.forEach((m) => put(ws, r++, [MONTH_NAME[m], "", c.c1601[m].comp, c.c1601[m].due]));
  put(ws, r++, ["TOTAL", "", c.c1601.total.comp, c.c1601.total.due], { bold: true, top: true });

  /* ======================= AUDIT ======================= */
  const au = sheet("AUDIT", [6, 58, 18, 18, 18]);
  let k = 1;
  const L = (label, mid, right, o = {}) => { put(au, k, ["", label, mid ?? "", "", right ?? ""], o); k++; };
  const sec = (t) => { title(au, k, t, 5); k += 2; };
  const inc = (x) => {
    L("Add: Legal Increments", null, null, { bold: true });
    L(`Surcharges @ ${Math.round(a.sur * 100)}%`, x.s);
    L(`Interest @ ${Math.round(a.int * 100)}% per annum${a.years !== 1 ? ` × ${a.years} yr` : ""}`, x.i);
    L("Compromise Penalty", x.comp);
    L("", null, x.total, { top: true });
  };

  sec("INCOME TAX");
  L("Income/(Loss) per Return", null, a.income, { bold: true });
  L("Add/(Less): Adjustments per Audit Investigation:", null, null, { bold: true });
  L("A. Discrepancy on Sales per AITR vs Submitted SLS vs AITED", null, null, { bold: true });
  L("     Sales per SLP AITED", a.salesAited); L("     Sales per submitted SLS", a.salesSls); L("     Sales per AITR", a.salesAitr);
  L("     Undeclared Sales", a.undSales); L("     Multiply by GP Ratio", a.gp, null, { pct: [2] }); L("     Undeclared Income", null, a.undSalesInc);
  L("B. Discrepancy on Purchases per AITR vs Submitted SLP vs AITED", null, null, { bold: true });
  L("     Purchases per SLP AITED", a.purchAited); L("     Purchases per submitted SLP", a.purchSlp); L("     Purchases per AITR", a.purchAitr);
  L("     Undeclared Purchases", a.undPurch); L("     Divided by COS Ratio", a.cosRatio, null, { pct: [2] });
  L("     Gross-up Undeclared Purchases", a.undPurchGross); L("     Multiply by GP Ratio", a.gp, null, { pct: [2] }); L("     Undeclared Income", null, a.undPurchInc);
  L("Undeclared Salaries and wages tantamount", null, null, { bold: true });
  L("     Salaries and Wages - Per Alphalist of Employees (1604-C)", a.sal1604); L("     Salaries and Wages - Per FS", a.salFs, a.undSal);
  L("C. Disallowance of Purchases for failure to substantiate with invoices", null, null, { bold: true });
  L("     Purchases per Vat return", a.purchVat, a.purchDis);
  L("D. Disallowance of Expenses for failure to substantiate with invoices", null, null, { bold: true });
  put(au, k++, ["", "", "Per AITR", "Substantiated", "UnSubstantiated"], { bold: true });
  a.disRows.forEach((x) => put(au, k++, ["", `     ${x.label}`, num(x.aitr), num(x.subst), x.unsub]));
  L("     Total", null, a.disTotal, { top: true });
  L("Taxable Income per Audit Investigation", null, a.taxable, { bold: true, top: true });
  L(`Total Basic Income Tax Due (${Math.round(a.itRate * 100)}%)`, null, a.itDue, { bold: true });
  L("Less: Tax Payments/Tax Credits:", null, null, { bold: true });
  L("     BIR Form No. 2307", a.cr2307); L("     Quarterly Income Payments", a.crQ); L("     Annual Income Payments", a.crAnnual, a.itCredits);
  L("Basic Income Tax Deficiency", null, a.itDef, { bold: true });
  inc(a.itInc);
  L("Total Income Tax still due and payable", null, a.itTotal, { bold: true, fill: "FFFFF3C4" });
  k++;

  sec("VALUE-ADDED TAX");
  L("Vatable Sales per Returns", null, a.vatSales, { bold: true });
  L("Add/(Less): Adjustments per Audit Investigation:", null, null, { bold: true });
  L("     Undeclared Sales per reconciliation of Sales per RELIEF data vs SUMMARY LIST OF SALES", null, a.vatUndSales);
  L("     Undeclared Purchases per reconciliation of Purchases per RELIEF data vs SUMMARY LIST OF Purchases", null, a.vatUndPurch);
  L("Total VATable Sales/Receipts per Audit Investigation", null, a.vatBase, { bold: true, top: true });
  L("Multiply by: Value-Added Tax (VAT) rate", null, a.vatRate, { pct: [4] });
  L("Output Tax", null, a.output, { bold: true });
  L("Less: Allowable Input Tax - Input Tax per Returns", a.input, a.input);
  L("Basic Value-Added Tax (VAT) Due", null, a.vatDue, { bold: true });
  L("Less: Tax Payments/Tax Credits:", null, null, { bold: true });
  L("     VAT Payments", a.vatPay); L("     BIR Form No. 2307 5%", a.vat2307, a.vatCredits);
  L("Basic Value-Added Tax (VAT) Deficiency", null, a.vatDef, { bold: true });
  inc(a.vatInc);
  L("Total Value-Added Tax (VAT) still due and payable", null, a.vatTotal, { bold: true, fill: "FFFFF3C4" });
  k++;

  sec("EXPANDED WITHHOLDING TAX");
  put(au, k++, ["", "", "Tax Base", "Tax Rate", "Tax Due"], { bold: true });
  let grp = null;
  a.ewtRows.forEach((x) => {
    if ((x.group || "") !== grp) { grp = x.group || ""; if (grp) L(grp, null, null, { bold: true }); }
    put(au, k++, ["", `     ${x.label}`, num(x.base), num(x.rate), x.due], { pct: [3] });
  });
  L("Expanded Withholding Tax Due", null, a.ewtDue, { bold: true, top: true });
  L("Less: Withholding Tax Paid", null, a.ewtPaid);
  L("Basic Expanded Withholding Tax Deficiency", null, a.ewtDef, { bold: true });
  inc(a.ewtInc);
  L("Total Expanded Withholding Tax still due and Payable", null, a.ewtTotal, { bold: true, fill: "FFFFF3C4" });
  k++;

  sec("WITHHOLDING TAX ON COMPENSATION");
  L("Gross Taxable Compensation Income (1601-C)", a.compGross);
  L("Tax to be Withheld and remitted", null, a.compTax);
  L("Less: Withholding Tax on Compensation payments", null, a.compPaid);
  L("Withholding Tax on Compensation still due", null, a.compDef, { bold: true });
  inc(a.compInc);
  L("Total Compensation Tax still due and Payable", null, a.compTotal, { bold: true, fill: "FFFFF3C4" });
  k++;

  sec("SUMMARY OF TAX DEFICIENCIES");
  L("Income Tax", null, a.itTotal); L("Value-Added Tax", null, a.vatTotal); L("Expanded Withholding Tax", null, a.ewtTotal); L("Withholding Tax on Compensation", null, a.compTotal);
  L("TOTAL DEFICIENCY TAX STILL DUE AND PAYABLE", null, a.grand, { bold: true, top: true, fill: "FFFFE08A" });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `BIR_RETURN_SUMMARY-${name.replace(/[^A-Za-z0-9.]+/g, "_").replace(/^_|_$/g, "")}-${year}.xlsx`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
}
