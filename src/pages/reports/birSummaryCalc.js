// Reports → BIR Return Summary: defaults, system amounts and every total (Summary of Returns + Audit)
// A typed value always wins; an empty cell shows the system amount (when the system has one).

export const QUARTERS = ["1", "2", "3", "4"];
export const Q_LABEL = { 1: "1st QTR", 2: "2nd QTR", 3: "3rd QTR", 4: "4th QTR" };
export const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
export const MONTH_NAME = { "01": "January", "02": "February", "03": "March", "04": "April", "05": "May", "06": "June", "07": "July", "08": "August", "09": "September", "10": "October", "11": "November", "12": "December" };
export const NON_QTR_MONTHS = ["01", "02", "04", "05", "07", "08", "10", "11"];   // 0619-E / 2550M / 0605 months

export const num = (v) => {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
export const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const sum = (a) => a.reduce((n, v) => n + num(v), 0);

const row = (label) => ({ label, afs: "", itr: "" });

export const defaultSummary = () => ({
  v: {},
  sales: ["Sales", "Cash Sales", "Cash Sales - Vatable (Regular)", "Cash Sales - Vatable (Gov't)"].map(row),
  cos: ["Merchandise, Beg.", "Purchases", "Depreciation Expense", "Salaries", "Fuel, Oil and Lubricants Expense", "Freight - Vatable"].map(row),
  opex: ["Miscellaneous Expense", "Professional Services", "Light and power", "Taxes and Licenses", "Maintenance & Repairs Expense", "Other expenses"].map(row),
  eq: {},                       // quarter → [{base, rate}] once edited (else the system lines)
});

export const defaultAudit = () => ({
  v: {},
  disallowed: null,             // null → made from the Summary operating expenses (Per AITR)
  ewt: [
    { group: "", label: "Professional Fees", base: "", rate: "0.10" },
    { group: "Purchase of Goods", label: "Vatable Purchases per FS", base: "", rate: "0.01" },
    { group: "Purchase of Goods", label: "Discrepancy on purchases", base: "", rate: "0.01" },
    { group: "Purchase of Goods", label: "Miscellaneous Expenses", base: "", rate: "0.01" },
    { group: "Purchase of Services", label: "Other Cost", base: "", rate: "0.02" },
    { group: "Purchase of Services", label: "Light and water", base: "", rate: "0.02" },
  ],
});

/** merge what was saved over the defaults (keeps old saves working when fields are added) */
export const loadSummary = (s) => ({ ...defaultSummary(), ...(s || {}), v: { ...(s?.v || {}) }, eq: { ...(s?.eq || {}) } });
export const loadAudit = (a) => ({ ...defaultAudit(), ...(a || {}), v: { ...(a?.v || {}) } });

/* ---------------- the system amount behind a cell key ---------------- */
export function systemValue(sys, key) {
  if (!sys) return null;
  const p = key.split(".");
  const f = sys.filed || {};
  const sl = (q) => sys.slsp?.[q] || {};
  switch (p[0]) {
    case "slsp": return sl(p[1])[p[2]] ?? null;
    case "q2550": {
      const s = sl(p[1]);
      if (p[2] === "regular") return s.vatable != null ? r2(num(s.vatable) - num(s.gov)) : null;
      if (p[2] === "gov") return s.gov ?? null;
      if (p[2] === "vat_purch") return s.vat_purch ?? null;
      if (p[2] === "exempt_purch") return s.exempt_purch ?? null;
      if (p[2] === "tax") return f["2550Q"]?.[p[1]] ?? null;
      return null;
    }
    case "q1701":
      if (p[2] === "tax") return f["1701Q"]?.[p[1]] ?? null;
      return sys.q1701?.[p[1]]?.[p[2]] ?? null;
    case "m2550":
      if (p[2] === "w2307") return sys.s2307?.[p[1]] ?? null;
      if (p[2] === "due") return f["2550M"]?.[p[1]] ?? null;
      return null;
    case "e0619": return f["0619E"]?.[p[1]] ?? sys.ewt_month?.[p[1]] ?? null;
    case "c1601": return p[2] === "due" ? f["1601C"]?.[p[1]] ?? null : null;
    case "wh2307": return sys.it_2307 || null;
    default: return null;
  }
}

/** the value of a cell: typed → that · else system → that · else the given fallback */
export const pick = (store, sys, key, fallback = 0) => {
  const t = store.v[key];
  if (t !== undefined && t !== null && t !== "") return num(t);
  const s = sys ? systemValue(sys, key) : null;
  return s !== null && s !== undefined ? num(s) : num(fallback);
};

/* ---------------- everything computed ---------------- */
export function compute(S, A, sys) {
  const P = (k, fb = 0) => pick(S, sys, k, fb);
  const c = {};

  /* ===== annual (AFS / ITR) ===== */
  const col = (rows, k) => sum(rows.map((r) => r[k]));
  c.salesAfs = col(S.sales, "afs");
  c.salesItr = col(S.sales, "itr");
  c.goodsAfs = col(S.cos, "afs");
  c.goodsItr = col(S.cos, "itr");
  c.endAfs = P("end.afs");
  c.endItr = P("end.itr");
  c.cogmAfs = c.goodsAfs - c.endAfs;
  c.cogmItr = c.goodsItr - c.endItr;
  c.cosOtherAfs = P("cos_other.afs");
  c.cosOtherItr = P("cos_other.itr");
  c.cosAfs = c.cogmAfs + c.cosOtherAfs;
  c.cosItr = c.cogmItr + c.cosOtherItr;
  c.grossAfs = c.salesAfs - c.cosAfs;
  c.grossItr = c.salesItr - c.cosItr;
  c.gpAfs = c.salesAfs ? c.grossAfs / c.salesAfs : 0;
  c.gpItr = c.salesItr ? c.grossItr / c.salesItr : 0;
  c.opexAfs = col(S.opex, "afs");
  c.opexItr = col(S.opex, "itr");
  c.nibtAfs = c.grossAfs - c.opexAfs;
  c.nibtItr = c.grossItr - c.opexItr;
  c.itRate = P("it.rate", 0.2);
  c.itLess = P("it.less");
  c.taxAfs = Math.max(0, c.nibtAfs - c.itLess) * c.itRate;
  c.taxItr = Math.max(0, c.nibtItr - c.itLess) * c.itRate;
  c.niatAfs = c.nibtAfs - c.taxAfs;
  c.niatItr = c.nibtItr - c.taxItr;

  /* ===== 1701-Q / 1702-Q ===== */
  c.q1701 = {};
  ["sales", "purchases", "itemized", "tax"].forEach((k) => {
    c.q1701[k] = {};
    QUARTERS.slice(0, 3).forEach((q) => { c.q1701[k][q] = P(`q1701.${q}.${k}`); });
    c.q1701[k].total = sum(QUARTERS.slice(0, 3).map((q) => c.q1701[k][q]));
  });
  c.qPaidAfs = QUARTERS.slice(0, 3).map((q) => P(`paid.${q}.afs`, c.q1701.tax[q]));
  c.qPaidItr = QUARTERS.slice(0, 3).map((q) => P(`paid.${q}.itr`, c.q1701.tax[q]));
  c.qPaidAfsTotal = sum(c.qPaidAfs);
  c.qPaidItrTotal = sum(c.qPaidItr);
  c.whAfs = P("wh2307.afs");
  c.whItr = P("wh2307.itr");
  c.payableAfs = c.taxAfs - c.qPaidAfsTotal - c.whAfs;
  c.payableItr = c.taxItr - c.qPaidItrTotal - c.whItr;

  /* ===== 2550-Q ===== */
  c.q2550 = {};
  QUARTERS.forEach((q) => {
    const regular = P(`q2550.${q}.regular`), gov = P(`q2550.${q}.gov`);
    const vp = P(`q2550.${q}.vat_purch`), ep = P(`q2550.${q}.exempt_purch`);
    c.q2550[q] = { regular, gov, sales: regular + gov, vat_purch: vp, exempt_purch: ep, purch: vp + ep, tax: P(`q2550.${q}.tax`) };
  });
  c.q2550.total = ["regular", "gov", "sales", "vat_purch", "exempt_purch", "purch", "tax"].reduce((o, k) => ({ ...o, [k]: sum(QUARTERS.map((q) => c.q2550[q][k])) }), {});
  c.q2550Vat = c.q2550.total.sales * 0.12;

  /* ===== 0605 / 2550M ===== */
  c.m2550 = {};
  NON_QTR_MONTHS.forEach((m) => { c.m2550[m] = { w2307: P(`m2550.${m}.w2307`), due: P(`m2550.${m}.due`) }; });
  c.m2550.total = { w2307: sum(NON_QTR_MONTHS.map((m) => c.m2550[m].w2307)), due: sum(NON_QTR_MONTHS.map((m) => c.m2550[m].due)) };

  /* ===== SLSP ===== */
  c.slsp = {};
  QUARTERS.forEach((q) => {
    const v = P(`slsp.${q}.vatable`), e = P(`slsp.${q}.exempt`), vp = P(`slsp.${q}.vat_purch`), ep = P(`slsp.${q}.exempt_purch`);
    c.slsp[q] = { vatable: v, exempt: e, sales: v + e, vat_purch: vp, exempt_purch: ep, purch: vp + ep };
  });
  c.slsp.total = ["vatable", "exempt", "sales", "vat_purch", "exempt_purch", "purch"].reduce((o, k) => ({ ...o, [k]: sum(QUARTERS.map((q) => c.slsp[q][k])) }), {});
  c.diffSales = c.q2550.total.sales - c.slsp.total.sales;
  c.diffPurch = c.q2550.total.purch - c.slsp.total.purch;

  /* ===== 1601-EQ ===== */
  c.eq = {};
  QUARTERS.forEach((q) => {
    const lines = S.eq?.[q] || (sys?.eq1601?.[q] || []).map((l) => ({ base: String(l.base), rate: String(l.rate), sys: true }));
    const out = lines.map((l) => ({ ...l, tax: num(l.base) * num(l.rate) }));
    c.eq[q] = { lines: out, base: sum(out.map((l) => l.base)), tax: sum(out.map((l) => l.tax)), edited: !!S.eq?.[q] };
  });
  c.eq.total = { base: sum(QUARTERS.map((q) => c.eq[q].base)), tax: sum(QUARTERS.map((q) => c.eq[q].tax)) };

  /* ===== 0619-E ===== */
  c.e0619 = {};
  NON_QTR_MONTHS.forEach((m) => { c.e0619[m] = P(`e0619.${m}.due`); });
  c.e0619.total = sum(NON_QTR_MONTHS.map((m) => c.e0619[m]));

  /* ===== 1601-C ===== */
  c.c1601 = {};
  MONTHS.forEach((m) => { c.c1601[m] = { comp: P(`c1601.${m}.comp`), due: P(`c1601.${m}.due`) }; });
  c.c1601.total = { comp: sum(MONTHS.map((m) => c.c1601[m].comp)), due: sum(MONTHS.map((m) => c.c1601[m].due)) };

  /* ================= AUDIT ================= */
  const def = {};                 // the automatic value of each audit cell (shown when the cell is empty)
  const AP = (k, fb = 0) => {
    def[k] = num(fb);
    const t = A.v[k];
    return t !== undefined && t !== null && t !== "" ? num(t) : num(fb);
  };
  const a = { def };
  a.sur = AP("sur", 0.25);
  a.int = AP("int", 0.12);
  a.years = AP("years", 1);
  const inc = (def, comp) => {
    const base = Math.max(0, def);
    const s = base * a.sur, i = base * a.int * a.years;
    return { s, i, comp, total: s + i + comp };
  };

  // A. sales
  a.income = AP("income", c.nibtItr);
  a.salesAited = AP("sales_aited");
  a.salesSls = AP("sales_sls", c.slsp.total.sales);
  a.salesAitr = AP("sales_aitr", c.salesItr);
  a.undSales = a.salesSls - a.salesAitr;
  a.gp = AP("gp", r2(c.gpItr * 10000) / 10000);
  a.undSalesInc = a.undSales * a.gp;
  // B. purchases
  a.purchAited = AP("purch_aited");
  a.purchSlp = AP("purch_slp", c.slsp.total.purch);
  a.purchAitr = AP("purch_aitr", c.cogmItr);
  a.undPurch = a.purchSlp - a.purchAitr;
  a.cosRatio = AP("cos_ratio", c.salesItr ? r2((c.cosItr / c.salesItr) * 10000) / 10000 : 0);
  a.undPurchGross = a.cosRatio ? a.undPurch / a.cosRatio : 0;
  a.undPurchInc = a.undPurchGross * a.gp;
  // salaries
  a.sal1604 = AP("sal_1604c");
  a.salFs = AP("sal_fs");
  a.undSal = a.sal1604 - a.salFs;
  // C. purchases not substantiated
  a.purchOn = AP("purch_on", 1) ? 1 : 0;
  a.purchVat = AP("purch_vat", c.q2550.total.purch);
  a.purchDis = a.purchOn ? a.purchVat : 0;
  // D. expenses not substantiated
  const disRows = A.disallowed || S.opex.filter((r) => num(r.itr) || num(r.afs)).map((r) => ({ label: r.label, aitr: String(num(r.itr) || num(r.afs)), subst: "" }));
  a.disRows = disRows.map((r) => ({ ...r, unsub: num(r.aitr) - num(r.subst) }));
  a.disTotal = sum(a.disRows.map((r) => r.unsub));
  a.taxable = a.income + a.undSalesInc + a.undPurchInc + a.undSal + a.purchDis + a.disTotal;
  a.itRate = AP("it_rate", c.itRate);
  a.itDue = a.taxable * a.itRate;
  a.cr2307 = AP("cr_2307", c.whItr || c.whAfs);
  a.crQ = AP("cr_q", c.q1701.tax.total);
  a.crAnnual = AP("cr_annual");
  a.itCredits = a.cr2307 + a.crQ + a.crAnnual;
  a.itDef = a.itDue - a.itCredits;
  a.itInc = inc(a.itDef, AP("it_comp"));
  a.itTotal = a.itDef + a.itInc.total;

  // VAT
  a.vatSales = AP("vat_sales", a.salesAitr);
  a.vatUndSales = a.undSales;
  a.vatUndPurch = a.undPurchGross;
  a.vatBase = a.vatSales + a.vatUndSales + a.vatUndPurch;
  a.vatRate = AP("vat_rate", 0.12);
  a.output = a.vatBase * a.vatRate;
  a.input = AP("input", sys?.input_vat || 0);
  a.vatDue = a.output - a.input;
  a.vatPay = AP("vat_pay", c.q2550.total.tax + c.m2550.total.due);
  a.vat2307 = AP("vat_2307", c.m2550.total.w2307 || Object.values(sys?.s2307 || {}).reduce((n, v) => n + num(v), 0));
  a.vatCredits = a.vatPay + a.vat2307;
  a.vatDef = a.vatDue - a.vatCredits;
  a.vatInc = inc(a.vatDef, AP("vat_comp"));
  a.vatTotal = a.vatDef + a.vatInc.total;

  // EWT
  a.ewtRows = (A.ewt || []).map((r) => ({ ...r, due: num(r.base) * num(r.rate) }));
  a.ewtDue = sum(a.ewtRows.map((r) => r.due));
  a.ewtPaid = AP("ewt_paid", c.eq.total.tax);
  a.ewtDef = a.ewtDue - a.ewtPaid;
  a.ewtInc = inc(a.ewtDef, AP("ewt_comp"));
  a.ewtTotal = a.ewtDef + a.ewtInc.total;

  // compensation
  a.compGross = AP("comp_gross", c.c1601.total.comp);
  a.compTax = AP("comp_tax");
  a.compPaid = AP("comp_paid", c.c1601.total.due);
  a.compDef = a.compTax - a.compPaid;
  a.compInc = inc(a.compDef, AP("comp_comp"));
  a.compTotal = a.compDef + a.compInc.total;

  a.grand = a.itTotal + a.vatTotal + a.ewtTotal + a.compTotal;
  c.a = a;
  return c;
}
