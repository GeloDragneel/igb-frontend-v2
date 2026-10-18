// Settings for the Importation and Exportation pages (shared TradeList / TradeDetail)
const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

// Countries: ISO codes, names from the browser (Intl)
const CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
let regionNames = null;
try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch { /* old browser */ }
export const countryName = (v) => {
  if (!v) return "";
  if (/^[A-Z]{2}$/.test(v) && regionNames) return regionNames.of(v) || v;
  return v; // old data may already hold a name
};
export const COUNTRY_OPTS = [
  { value: "", label: "— None —" },
  ...CODES.map((c) => ({ value: c, label: countryName(c), hint: c })).sort((a, b) => a.label.localeCompare(b.label)),
];

export const IMPORTATION = {
  key: "importation",
  api: "/importation",
  route: "/task/importation",
  detailRoute: "/task/importation/importation-detail",
  title: "Importation",
  noLabel: "Importation No",
  party: "Seller",
  dateLabel: "Release Date",
  entryLabel: "Import Entry No",
  countryLabel: "Origin Country",
  payLabel: "VAT Payment Date",
  defaultCurrency: "PHP",
  // old grid: TOTAL LANDED COST · CHARGES BEFORE RELEASE FROM CUSTOM · DUTIABLE VALUE · AMOUNT OF VAT · TAXABLE IMPORTS · EXEMPT IMPORTS
  cols: [
    { key: "total_landed_cost", label: "Total Landed Cost", input: true },
    { key: "charges_from_custom", label: "Charges Before Release" },
    { key: "dutiable_value", label: "Dutiable Value", input: true },
    { key: "amount_of_vat", label: "Amount of VAT" },
    { key: "taxable_imports", label: "Taxable Imports" },
    { key: "exempt_imports", label: "Exempt Imports", input: true },
  ],
  // old CalculateNumber()
  calc: (l) => {
    const landed = r4(l.total_landed_cost), dutiable = r4(l.dutiable_value), exempt = r4(l.exempt_imports);
    const taxable = r4(landed - exempt);
    return {
      total_landed_cost: landed, charges_from_custom: r4(landed - dutiable), dutiable_value: dutiable,
      amount_of_vat: r4(taxable * 0.12), taxable_imports: taxable, exempt_imports: exempt,
    };
  },
  // Cr Accounts (VAT + taxable) · Dr Input VAT · Dr line account (taxable imports)
  journal: (head, lines, accName, vatAcc) => {
    const vat = r4(lines.reduce((n, l) => n + l.amount_of_vat, 0));
    const taxable = r4(lines.reduce((n, l) => n + l.taxable_imports, 0));
    const rows = [{ code: head, name: accName(head), dr: 0, cr: r4(vat + taxable) }];
    if (vat) rows.push({ code: vatAcc?.account_code || "—", name: vatAcc?.account_name || "Input VAT", dr: vat, cr: 0 });
    lines.forEach((l) => rows.push({ code: l.account_code, name: accName(l.account_code), dr: l.taxable_imports, cr: 0 }));
    return rows;
  },
  totalLabel: "Total Landed Cost",
  totalKey: "total_landed_cost",
};

export const EXPORTATION = {
  key: "exportation",
  api: "/exportation",
  route: "/task/exportation",
  detailRoute: "/task/exportation/exportation-detail",
  title: "Exportation",
  noLabel: "Exportation No",
  party: "Buyer",
  dateLabel: "Export Date",
  entryLabel: "Export Entry No",
  countryLabel: "Destination Country",
  payLabel: "Payment Date",
  defaultCurrency: "USD",
  cols: [
    { key: "quantity", label: "Qty", input: true },
    { key: "fob_amount", label: "FOB Amount", input: true },
    { key: "peso_amount", label: "Amount (PHP)" },
  ],
  calc: (l, exRate) => {
    const fob = r4(l.fob_amount);
    return { quantity: r4(l.quantity), fob_amount: fob, peso_amount: r4(fob * (Number(exRate) || 1)) };
  },
  // Dr receivable / cash (PHP total) · Cr sales account per line (zero-rated)
  journal: (head, lines, accName) => {
    const total = r4(lines.reduce((n, l) => n + l.peso_amount, 0));
    return [
      { code: head, name: accName(head), dr: total, cr: 0 },
      ...lines.map((l) => ({ code: l.account_code, name: accName(l.account_code), dr: 0, cr: l.peso_amount })),
    ];
  },
  totalLabel: "Amount (PHP)",
  totalKey: "peso_amount",
};
