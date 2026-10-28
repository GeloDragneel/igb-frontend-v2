/* =========================================================
   eBIRForms definitions — field order = save-file order
   ========================================================= */
export const p = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
export const f = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, "0");
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const hhmmss = () => { const d = new Date(); return pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); };
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const T_ = (v) => v === "true";

/* ---------- field builders ---------- */
const S = (title) => ({ t: "section", title });
const T = (k, label = "", o = {}) => ({ t: "text", k, label, ...o });
const N = (k, label = "", o = {}) => ({ t: "num", k, label, ...o });
const R = (k, label = "", o = {}) => ({ t: "num", k, label, ro: true, ...o });
const O = (g, k, label, glabel) => ({ t: "opt", g, k, label, glabel });
const C = (k, label) => ({ t: "check", k, label });
const H = (k, v = "") => ({ t: "const", k, v });
const DT = (label, parts) => ({ t: "date", label, parts });
const MY = (label, parts) => ({ t: "month", label, parts });
const SEL = (k, label, opts) => ({ t: "select", k, label, opts });
const EBIR = [H("ebirOnlineConfirmUsername"), H("ebirOnlineUsername"), H("ebirOnlineSecret")];
const FOOT = "\t\t\t\nAll Rights Reserved BIR 2012.";
const FOOT0 = FOOT + "0";

/* ---------- composite date/month fields ---------- */
// parts: [[key, 'y'|'m'|'mn'|'d']] or [[key, 'mdy']]
export function partsToIso(parts, v, kind = "date") {
    if (parts.length === 1 && parts[0][1] === "mdy") {
        const s = (v[parts[0][0]] || "").split("/");
        return s.length === 3 ? `${s[2]}-${pad(s[0])}-${pad(s[1])}` : "";
    }
    const get = (t) => { const e = parts.find(([, x]) => x === t || (t === "m" && x === "mn")); return e ? v[e[0]] || "" : ""; };
    const y = get("y"), m = get("m");
    if (!y || !m) return "";
    if (kind === "month") return `${y}-${pad(m)}`;
    const d = get("d");
    return d ? `${y}-${pad(m)}-${pad(d)}` : "";
}
export function isoToParts(parts, iso) {
    const [y = "", m = "", d = ""] = (iso || "").split("-");
    const out = {};
    parts.forEach(([k, t]) => {
        out[k] = !iso ? "" : t === "y" ? y : t === "m" ? m : t === "mn" ? String(Number(m)) : t === "d" ? d : t === "mdy" ? `${Number(m)}/${d}/${y}` : "";
    });
    return out;
}

/* ---------- quarter helpers ---------- */
const qOf = (v, keys) => keys.findIndex((k) => T_(v[k])) + 1;            // 0 = none
const qPatch = (keys, q) => Object.fromEntries(keys.map((k, i) => [k, i + 1 === q ? "true" : "false"]));
const qMonths = (y, q) => { const s = (q - 1) * 3 + 1; return { from: `${y}-${pad(s)}`, to: `${y}-${pad(s + 2)}`, s }; };
const qDates = (y, q) => { const s = (q - 1) * 3 + 1; return { from: `${y}-${pad(s)}-01`, to: `${y}-${pad(s + 2)}-${pad(new Date(y, s + 2, 0).getDate())}` }; };
const curQ = () => Math.ceil((new Date().getMonth() + 1) / 3);

/* ---------- TIN helpers ---------- */
const tinOf = (v, [a, b, c, br]) => `${v[a] || ""}${v[b] || ""}${v[c] || ""}${v[br] || "000"}`;
const tinErr = (v, [a, b, c]) => (/^\d{9}$/.test(`${v[a] || ""}${v[b] || ""}${v[c] || ""}`) ? null : "Enter the 9-digit TIN (numbers only).");
const pm = (tin, rdo, fn, addr, zip, tel, email, lob, extra = {}) => ({
    tin1: [tin[0], ...(extra.tin1 || [])], tin2: [tin[1], ...(extra.tin2 || [])], tin3: [tin[2], ...(extra.tin3 || [])], tin4: [tin[3], ...(extra.tin4 || [])],
    rdo: [rdo], fn: [fn, ...(extra.fn || [])], regAddr: [addr], zip: [zip], telNo: [tel], email: [email], lob: [lob],
});
const pay = (pre, n, label, withAgency = true) => [
    ...(withAgency ? [T(`${pre}txtAgency${n}`, `${n} ${label} – drawee bank / agency`)] : []),
    T(`${pre}txtNumber${n}`, withAgency ? "Number" : `${n} ${label} – number`), T(`${pre}txtDate${n}`, "Date (MM/DD/YYYY)"), T(`${pre}txtAmount${n}`, "Amount"),
];

/* =========================================================
   0605 – Payment Form
   ========================================================= */
const A = "frm0605:";
const A_DUE = [[`${A}txtDueDateMonth`, "m"], [`${A}txtDueDateDay`, "d"], [`${A}txtDueDateYear`, "y"]];
const A_YE = [[`${A}itemYearEndMonth`, "m"], [`${A}txtYearEnded`, "y"]];
const A_RP = [[`${A}txtReturnPeriodMonth`, "m"], [`${A}txtReturnPeriodDay`, "d"], [`${A}txtReturnPeriodYear`, "y"]];
const A_TIN = [`${A}txtTIN1`, `${A}txtTIN2`, `${A}txtTIN3`, `${A}txtBranchCode`];

const F0605 = {
    id: "0605", file: "0605", title: "0605 – Payment Form", footer: FOOT,
    fields: [
        S("Part I – Background information"),
        O("forthe", `${A}itemFiscalStartMonth:_1`, "Calendar", "1 For the"), O("forthe", `${A}itemFiscalStartMonth:_2`, "Fiscal"),
        O("qtr", "itemQuarter_1", "1st", "2 Quarter"), O("qtr", "itemQuarter_2", "2nd"), O("qtr", "itemQuarter_3", "3rd"), O("qtr", "itemQuarter_4", "4th"),
        DT("4 Due date", A_DUE),
        T(`${A}txtNoOfSheets`, "5 No. of sheets attached"),
        T("0605txtATCCode", "6 ATC"),
        MY("3 Year ended", A_YE),
        DT("7 Return period", A_RP),
        T("txtTaxTypeCode", "8 Tax type code"),
        T(A_TIN[0], "9 TIN"), T(A_TIN[1]), T(A_TIN[2]), T(A_TIN[3], "Branch code"), T(`${A}txtRDOCode`, "10 RDO code"),
        O("cls", `${A}txtClassification:_1`, "Individual", "11 Taxpayer classification"), O("cls", `${A}txtClassification:_2`, "Non-individual"),
        T(`${A}txtLineBus`, "12 Line of business", { enc: true, wide: true }),
        T(`${A}txtTaxPayerName`, "13 Taxpayer name", { enc: true, wide: true }),
        T(`${A}txtTelNum`, "14 Telephone number"),
        T(`${A}txtAddress`, "15 Registered address", { enc: true, wide: true }),
        T(`${A}txtZipCode`, "16 ZIP code"),
        S("Manner and type of payment"),
        O("top", `${A}itemModeOfPayment:_1`, "Installment", "18 Type of payment"),
        T(`${A}txtNumOfInstallment`, "No. of installments (1–20)"),
        O("top", `${A}itemModeOfPayment:_2`, "Partial"), O("top", `${A}itemModeOfPayment:_3`, "Full"),
        O("vp", `${A}itemMannerOfPayment:_1`, "Self-assessment", "17 Manner of payment – voluntary"),
        O("vp", `${A}itemMannerOfPayment:_2`, "Penalties"), O("vp", `${A}itemMannerOfPayment:_3`, "Tax deposit / advance payment"),
        O("vp", `${A}itemMannerOfPayment:_4`, "Income tax second installment"), O("vp", `${A}itemMannerOfPayment:_5`, "Others"),
        T(`${A}txtOthersName`, "Others (specify)"),
        O("pada", `${A}itemMannerOfPaymentB:_1`, "Preliminary / final assessment", "17 Manner of payment – per audit / delinquent"),
        O("pada", `${A}itemMannerOfPaymentB:_2`, "Accounts receivable / delinquent account"),
        S("Part II – Computation of tax"),
        N(`${A}txtTax19`, "19 Basic tax / deposit / advance payment"),
        N(`${A}txtTax20A`, "20A Surcharge"), N(`${A}txtTax20B`, "20B Interest"), N(`${A}txtTax20C`, "20C Compromise"),
        R(`${A}txtTax20D`, "20D Total penalties"), R(`${A}txtTax21`, "21 Total amount payable"),
        O("office", `${A}itemApprovedYN:_1`, "Approved", "For BIR use – installment"), O("office", `${A}itemApprovedYN:_2`, "Not approved"),
        ...range(1, 142).map((i) => H(`AtcCode${i}`, "false")),
        ...range(1, 37).map((i) => H(`TaxTypeCode${i}`, "false")),
        H("txtFinalFlag", "0"), H("txtEnroll", "N"), ...EBIR,
        T("txtEmail", "Email address", { wide: true }),
        H("driveSelectTPExport", "0"),
    ],
    prof: pm(A_TIN, `${A}txtRDOCode`, `${A}txtTaxPayerName`, `${A}txtAddress`, `${A}txtZipCode`, `${A}txtTelNum`, "txtEmail", `${A}txtLineBus`),
    defaults: (now) => ({ [`${A}txtNoOfSheets`]: "0", ...isoToParts(A_YE, ym(now)) }),
    compute: (v) => {
        const d = p(v[`${A}txtTax20A`]) + p(v[`${A}txtTax20B`]) + p(v[`${A}txtTax20C`]);
        return { [`${A}txtTax20D`]: f(d), [`${A}txtTax21`]: f(p(v[`${A}txtTax19`]) + d) };
    },
    validate: (v) => {
        if (![1, 2].some((i) => T_(v[`${A}itemFiscalStartMonth:_${i}`]))) return "Choose an option for item 1.";
        if (!partsToIso(A_DUE, v)) return "Enter the due date (item 4).";
        if (!v["0605txtATCCode"]) return "Enter a valid ATC (item 6).";
        if (!partsToIso(A_RP, v)) return "Enter the return period (item 7).";
        if (![1, 2].some((i) => T_(v[`${A}txtClassification:_${i}`]))) return "Choose the taxpayer classification (item 11).";
        if (![1, 2, 3, 4, 5].some((i) => T_(v[`${A}itemMannerOfPayment:_${i}`])) && ![1, 2].some((i) => T_(v[`${A}itemMannerOfPaymentB:_${i}`]))) return "Choose the manner of payment (item 17).";
        if (![1, 2, 3].some((i) => T_(v[`${A}itemModeOfPayment:_${i}`]))) return "Choose the type of payment (item 18).";
        if (T_(v[`${A}itemModeOfPayment:_1`])) { const n = Number(v[`${A}txtNumOfInstallment`]); if (!(n >= 1 && n <= 20)) return "Enter the number of installments, from 1 to 20."; }
        if (p(v[`${A}txtTax19`]) <= 0) return "Enter an amount greater than 0 for item 19.";
        return tinErr(v, A_TIN);
    },
    filename: (v) => `${tinOf(v, A_TIN)}-0605-${v[A_RP[0][0]]}${v[A_RP[1][0]]}${v[A_RP[2][0]]}${hhmmss()}.xml`,
    autofill: async (v, af) => {
        const m = partsToIso(A_YE, v, "month");
        if (!m) return null;
        const r = await af("vat_payable", { from: m, to: m });
        return { [`${A}txtTax19`]: f(r.value) };
    },
};

/* =========================================================
   0619E – Monthly remittance (expanded)
   ========================================================= */
const E = "frm0619E:";
const E_MY = [[`${E}txtMonth`, "m"], [`${E}txtYear`, "y"]];
const E_DUE = [[`${E}txtDueMonth`, "m"], [`${E}txtDueDay`, "d"], [`${E}txtDueYear`, "y"]];
const E_TIN = [`${E}txtTIN1`, `${E}txtTIN2`, `${E}txtTIN3`, `${E}txtBranchCode`];
const dueAfter = (m) => { if (!m) return ""; let [y, mm] = m.split("-").map(Number); mm += 1; if (mm > 12) { mm = 1; y += 1; } return `${y}-${pad(mm)}-10`; };

const F0619E = {
    id: "0619E", file: "0619E", title: "0619E – Monthly Remittance (Expanded)", footer: FOOT0,
    fields: [
        S("Part I – Background information"),
        MY("1 For the month", E_MY),
        DT("2 Due date", E_DUE),
        O("amend", `${E}optAmend:Y`, "Yes", "3 Amended form?"), O("amend", `${E}optAmend:N`, "No"),
        O("wh", `${E}optWithheld:Y`, "Yes", "4 Any taxes withheld?"), O("wh", `${E}optWithheld:N`, "No"),
        T(`${E}txtAtc`, "5 ATC"), T(`${E}txtTaxTypeCode`, "6 Tax type code"),
        T(E_TIN[0], "7 TIN"), T(E_TIN[1]), T(E_TIN[2]), T(E_TIN[3], "Branch code"), T(`${E}txtRDOCode`, "8 RDO code"),
        T(`${E}txtTaxpayerName`, "9 Withholding agent's name", { enc: true, wide: true }),
        H(`${E}txtLineBus`, ""),
        T(`${E}txtAddress`, "10 Registered address", { enc: true, wide: true }),
        T(`${E}txtZipCode`, "10A ZIP code"), T(`${E}txtTelNum`, "11 Contact number"),
        O("cat", `${E}optCategory:P`, "Private", "12 Category of withholding agent"), O("cat", `${E}optCategory:G`, "Government"),
        T("txtEmail", "13 Email address", { wide: true }),
        S("Part II – Tax remittance"),
        N(`${E}txtTax14`, "14 Amount of remittance"),
        N(`${E}txtTax15`, "15 Less: amount remitted from previously filed form"),
        R(`${E}txtTax16`, "16 Net amount of remittance"),
        N(`${E}txtTax17A`, "17A Surcharge"), N(`${E}txtTax17B`, "17B Interest"), N(`${E}txtTax17C`, "17C Compromise"),
        R(`${E}txtTax17D`, "17D Total penalties"), R(`${E}txtTax18`, "18 Total amount of remittance"),
        S("Part III – Details of payment"),
        T("txtTaxAgentNo", "Tax agent accreditation no."), T("txtDateIssue", "Date of issue"), T("txtDateExpiry", "Date of expiry"),
        ...pay("", 19, "Cash / bank debit memo"), ...pay("", 20, "Check"), ...pay("", 21, "Tax debit memo"),
        T("txtParticular22", "22 Others (specify)"), T("txtAgency22", "Agency"), T("txtNumber22", "Number"), T("txtDate22", "Date"), T("txtAmount22", "Amount"),
        H("txtFinalFlag", "1"), H("txtEnroll", "Y"), ...EBIR, H("driveSelectTPExport", ""),
    ],
    prof: pm(E_TIN, `${E}txtRDOCode`, `${E}txtTaxpayerName`, `${E}txtAddress`, `${E}txtZipCode`, `${E}txtTelNum`, "txtEmail", null),
    defaults: (now) => {
        const prev = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        return { ...isoToParts(E_MY, prev), ...isoToParts(E_DUE, dueAfter(prev)), [`${E}optAmend:N`]: "true", [`${E}txtAtc`]: "WME10", [`${E}txtTaxTypeCode`]: "WE" };
    },
    onChange: (patch, v) => (E_MY.some(([k]) => k in patch) ? isoToParts(E_DUE, dueAfter(partsToIso(E_MY, v, "month"))) : {}),
    compute: (v) => {
        const t16 = p(v[`${E}txtTax14`]) - p(v[`${E}txtTax15`]);
        const t17 = p(v[`${E}txtTax17A`]) + p(v[`${E}txtTax17B`]) + p(v[`${E}txtTax17C`]);
        return { [`${E}txtTax16`]: f(t16), [`${E}txtTax17D`]: f(t17), [`${E}txtTax18`]: f(t16 + t17) };
    },
    validate: (v) => {
        if (!T_(v[`${E}optWithheld:Y`]) && !T_(v[`${E}optWithheld:N`])) return "Choose an option for item 4.";
        if (!T_(v[`${E}optCategory:P`]) && !T_(v[`${E}optCategory:G`])) return "Choose an option for item 12.";
        if (T_(v[`${E}optWithheld:Y`]) && p(v[`${E}txtTax14`]) <= 0) return "Fill up Part II – Tax Remittance when item 4 is Yes.";
        return tinErr(v, E_TIN);
    },
    filename: (v) => `${tinOf(v, E_TIN)}-0619E-${v[E_MY[0][0]]}${v[E_MY[1][0]]}.xml`,
    autofill: async (v, af) => {
        const m = partsToIso(E_MY, v, "month");
        if (!m) return null;
        const r = await af("bir2307", { from: m, to: m });
        return { [`${E}txtTax14`]: f(r.value) };
    },
};

/* =========================================================
   1601C – Compensation
   ========================================================= */
const W = "frm1601c:";
const W_MY = [[`${W}txtMonth`, "m"], [`${W}txtYear`, "y"]];
const W_TIN = [`${W}txtTIN1`, `${W}txtTIN2`, `${W}txtTIN3`, `${W}txtBranchCode`];

const F1601C = {
    id: "1601C", file: "1601Cv2018", title: "1601C – Monthly Remittance on Compensation", footer: FOOT0,
    fields: [
        S("Part I – Background information"),
        MY("1 For the month", W_MY),
        O("amend", `${W}AmendedRtn_1`, "Yes", "2 Amended return?"), O("amend", `${W}AmendedRtn_2`, "No"),
        O("wh", `${W}TaxWithheld_1`, "Yes", "3 Any taxes withheld?"), O("wh", `${W}TaxWithheld_2`, "No"),
        T(`${W}txtSheets`, "4 No. of sheets attached"), T(`${W}txtATC`, "5 ATC"),
        T(W_TIN[0], "6 TIN"), T(W_TIN[1]), T(W_TIN[2]), T(W_TIN[3], "Branch code"), T(`${W}txtRDOCode`, "7 RDO code"),
        T(`${W}txtTaxpayerName`, "8 Withholding agent's name", { enc: true, wide: true }),
        T(`${W}txtAddress`, "9 Registered address", { enc: true, wide: true }),
        T(`${W}txtZipCode`, "9A ZIP code"), T(`${W}txtTelNum`, "10 Contact number"),
        O("cat", `${W}CatAgent_P`, "Private", "11 Category of withholding agent"), O("cat", `${W}CatAgent_G`, "Government"),
        T("txtEmail", "12 Email address", { wide: true }),
        O("treaty", `${W}SpecialTax_1`, "Yes", "13 Special rates / tax treaty?"), O("treaty", `${W}SpecialTax_2`, "No"),
        T(`${W}selTreaty`, "13A If yes, specify"),
        S("Part II – Computation of tax"),
        N(`${W}txtTax14`, "14 Total amount of compensation"),
        N(`${W}txtTax15`, "15 Statutory minimum wage (MWEs)"),
        N(`${W}txtTax16`, "16 Holiday / overtime / night differential / hazard pay (MWEs)"),
        N(`${W}txtTax17`, "17 13th month pay and other benefits"),
        N(`${W}txtTax18`, "18 De minimis benefits"),
        N(`${W}txtTax19`, "19 SSS, GSIS, PHIC, HDMF and union dues"),
        T(`${W}txt20Other`, "20 Other non-taxable compensation (specify)"), N(`${W}txtTax20`, "20 Amount"),
        R(`${W}txtTax21`, "21 Total non-taxable compensation"),
        R(`${W}txtTax22`, "22 Total taxable compensation"),
        N(`${W}txtTax23`, "23 Less: taxable compensation not subject to withholding"),
        R(`${W}txtTax24`, "24 Net taxable compensation"),
        N(`${W}txtTax25`, "25 Total taxes withheld"),
        N(`${W}txtTax26`, "26 Add / (less): adjustment from previous months"),
        R(`${W}txtTax27`, "27 Taxes withheld for remittance"),
        N(`${W}txtTax28`, "28 Less: tax remitted in return previously filed"),
        T(`${W}txt29Other`, "29 Other remittances made (specify)"), N(`${W}txtTax29`, "29 Amount"),
        R(`${W}txtTax30`, "30 Total tax remittances made"),
        R(`${W}txtTax31`, "31 Tax still due / (over-remittance)"),
        N(`${W}txtTax32`, "32 Surcharge"), N(`${W}txtTax33`, "33 Interest"), N(`${W}txtTax34`, "34 Compromise"),
        R(`${W}txtTax35`, "35 Total penalties"), R(`${W}txtTax36`, "36 Total amount still due / (over-remittance)"),
        S("Part III – Details of payment"),
        T("txtTaxAgentNo", "Tax agent accreditation no."), T("txtDateIssue", "Date of issue"), T("txtDateExpiry", "Date of expiry"),
        ...pay(W, 37, "Cash / bank debit memo"), ...pay(W, 38, "Check"), ...pay(W, 39, "Tax debit memo", false),
        T(`${W}txtParticular40`, "40 Others (specify)"), T(`${W}txtAgency40`, "Agency"), T(`${W}txtNumber40`, "Number"), T(`${W}txtDate40`, "Date"), T(`${W}txtAmount40`, "Amount"),
        S("Page 2 – Schedule 1: adjustment of taxes withheld"),
        T(`${W}txtPg2TIN1`, "TIN"), T(`${W}txtPg2TIN2`), T(`${W}txtPg2TIN3`), T(`${W}txtPg2BranchCode`, "Branch code"),
        T(`${W}txtPg2TaxpayerName`, "Withholding agent's name", { wide: true }),
        ...[0, 1, 2].flatMap((i) => [
            C(`chkScheduleDelete${i}`, `Row ${i + 1}: delete`),
            T(`${W}sched1:txtMonthYear${i}`, `Row ${i + 1}: previous month (MM/YYYY)`),
            T(`${W}sched1:txtDatePaid${i}`, "Date paid"), T(`${W}sched1:txtBankCode${i}`, "Bank code"),
            T(`${W}sched1:txtNumber${i}`, "Bank validation / ROR / TDM no."), N(`${W}sched1:txtTaxPaid${i}`, "Tax paid"),
        ]),
        ...[0, 1, 2].flatMap((i) => [N(`${W}sched1:txtShouldTaxDue${i}`, `Row ${i + 1}: should-be tax due`), R(`${W}sched1:txtAdjustments${i}`, `Row ${i + 1}: adjustment`)]),
        R(`${W}sched1:txtTotal1`, "Total adjustment (to item 26)"),
        H(`${W}txtCurrentPage`, "1"), H(`${W}txtMaxPage`, "2"),
        T(`${W}txtLineBus`, "Line of business", { enc: true, wide: true }),
    ],
    prof: pm(W_TIN, `${W}txtRDOCode`, `${W}txtTaxpayerName`, `${W}txtAddress`, `${W}txtZipCode`, `${W}txtTelNum`, "txtEmail", `${W}txtLineBus`,
        { tin1: [`${W}txtPg2TIN1`], tin2: [`${W}txtPg2TIN2`], tin3: [`${W}txtPg2TIN3`], tin4: [`${W}txtPg2BranchCode`], fn: [`${W}txtPg2TaxpayerName`] }),
    defaults: (now) => ({ ...isoToParts(W_MY, ym(now)), [`${W}AmendedRtn_2`]: "true", [`${W}txtSheets`]: "0", [`${W}txtATC`]: "WW010" }),
    compute: (v) => {
        const g = (n) => p(v[`${W}txtTax${n}`]);
        const adj = [0, 1, 2].map((i) => p(v[`${W}sched1:txtShouldTaxDue${i}`]) - p(v[`${W}sched1:txtTaxPaid${i}`]));
        const t26 = adj[0] + adj[1] + adj[2];                    // Schedule I total → item 26
        const t21 = g(15) + g(16) + g(17) + g(18) + g(19) + g(20), t22 = g(14) - t21, t24 = t22 - g(23);
        const t27 = g(25) + t26, t30 = g(28) + g(29), t31 = t27 - t30, t35 = g(32) + g(33) + g(34);
        return {
            [`${W}txtTax21`]: f(t21), [`${W}txtTax22`]: f(t22), [`${W}txtTax24`]: f(t24), [`${W}txtTax26`]: f(t26),
            [`${W}txtTax27`]: f(t27), [`${W}txtTax30`]: f(t30), [`${W}txtTax31`]: f(t31),
            [`${W}txtTax35`]: f(t35), [`${W}txtTax36`]: f(t31 + t35),
            ...Object.fromEntries(adj.map((a, i) => [`${W}sched1:txtAdjustments${i}`, f(a)])),
            [`${W}sched1:txtTotal1`]: f(t26),
        };
    },
    validate: (v) => {
        if (!T_(v[`${W}TaxWithheld_1`]) && !T_(v[`${W}TaxWithheld_2`])) return "Choose an option for item 3.";
        if (!T_(v[`${W}CatAgent_P`]) && !T_(v[`${W}CatAgent_G`])) return "Choose an option for item 11.";
        if (T_(v[`${W}TaxWithheld_1`]) && p(v[`${W}txtTax14`]) <= 0) return "Item 14 must be greater than 0.";
        if (T_(v[`${W}TaxWithheld_1`]) && p(v[`${W}txtTax25`]) <= 0) return "Item 25 must be greater than 0.";
        return tinErr(v, W_TIN);
    },
    filename: (v) => `${tinOf(v, W_TIN)}-1601Cv2018-${v[W_MY[0][0]]}${v[W_MY[1][0]]}.xml`,
    autofill: async (v, af) => {
        const m = partsToIso(W_MY, v, "month");
        if (!m) return null;
        const r = await af("1601c", { from: m, to: m });
        return { [`${W}txtTax14`]: f(r.total_comp) };
    },
};

/* =========================================================
   1601EQ – Quarterly expanded withholding
   ========================================================= */
const Q = "frm1601EQ:";
const Q_QTR = [1, 2, 3, 4].map((i) => `${Q}optQuarter:${i}`);
const Q_TIN = [`${Q}txtTIN1`, `${Q}txtTIN2`, `${Q}txtTIN3`, `${Q}txtBranchCode`];
const rateOf = (r) => { const n = p(r); return n > 1 ? n / 100 : n; };   // 1 → 1%, 0.01 → 1%

const F1601EQ = {
    id: "1601EQ", file: "1601EQ", title: "1601EQ – Quarterly Remittance (Expanded)", footer: FOOT,
    fields: [
        S("Part I – Background information"),
        T(`${Q}txtYear`, "1 For the year"),
        O("qtr", Q_QTR[0], "1st", "2 Quarter"), O("qtr", Q_QTR[1], "2nd"), O("qtr", Q_QTR[2], "3rd"), O("qtr", Q_QTR[3], "4th"),
        O("amend", `${Q}optAmend:Y`, "Yes", "3 Amended return?"), O("amend", `${Q}optAmend:N`, "No"),
        O("wh", `${Q}optWithheld:Y`, "Yes", "4 Any taxes withheld?"), O("wh", `${Q}optWithheld:N`, "No"),
        T(`${Q}txtNoSheets`, "5 No. of sheets attached"),
        T(Q_TIN[0], "6 TIN"), T(Q_TIN[1]), T(Q_TIN[2]), T(Q_TIN[3], "Branch code"), T(`${Q}txtRDOCode`, "7 RDO code"),
        T(`${Q}txtTaxpayerName`, "8 Withholding agent's name", { enc: true, wide: true }),
        T(`${Q}txtLineBus`, "Line of business", { enc: true, wide: true }),
        T(`${Q}txtAddress`, "9 Registered address", { enc: true, wide: true }),
        T(`${Q}txtZipCode`, "9A ZIP code"), T(`${Q}txtTelNum`, "10 Contact number"),
        O("cat", `${Q}optCategory:P`, "Private", "11 Category of withholding agent"), O("cat", `${Q}optCategory:G`, "Government"),
        T("txtEmail", "12 Email address", { wide: true }),
        S("Part II – Computation of tax"),
        ...range(1, 6).flatMap((i) => [
            T(`${Q}txtAtcCd${i}`, `${12 + i} ATC`), N(`${Q}txtTaxBase${i}`, "Tax base", { blank: "" }),
            T(`${Q}txtTaxRate${i}`, "Tax rate"), R(`${Q}txtTaxbeWithHeld${i}`, "Tax withheld"),
        ]),
        H(`${Q}txtTotalOtherTax`, ""),
        R(`${Q}txtTax19`, "19 Total taxes withheld for the quarter"),
        N(`${Q}txtTax20`, "20 Less: remittance – 1st month of the quarter"),
        N(`${Q}txtTax21`, "21 Remittance – 2nd month of the quarter"),
        N(`${Q}txtTax22`, "22 Remitted in return previously filed"),
        N(`${Q}txtTax23`, "23 Over-remittance from previous quarter"),
        R(`${Q}txtTax24`, "24 Total remittances made"),
        R(`${Q}txtTax25`, "25 Tax still due / (over-remittance)"),
        N(`${Q}txtTax26`, "26 Surcharge"), N(`${Q}txtTax27`, "27 Interest"), N(`${Q}txtTax28`, "28 Compromise"),
        R(`${Q}txtTax29`, "29 Total penalties"), R(`${Q}txtTax30`, "30 Total amount still due / (over-remittance)"),
        C(`${Q}ifRefund`, "To be refunded"), C(`${Q}ifIssueCert`, "To be issued a tax credit certificate"), C(`${Q}ifCarriedOver`, "To be carried over to next quarter"),
        S("Part III – Details of payment"),
        T("txtTaxAgentNo", "Tax agent accreditation no."), T("txtDateIssue", "Date of issue"), T("txtDateExpiry", "Date of expiry"),
        ...pay(Q, 33, "Cash / bank debit memo"), ...pay(Q, 34, "Check"), ...pay(Q, 35, "Tax debit memo"),
        T(`${Q}txtParticular36`, "36 Others (specify)"), T(`${Q}txtAgency36`, "Agency"), T(`${Q}txtNumber36`, "Number"), T(`${Q}txtDate36`, "Date"), T(`${Q}txtAmount36`, "Amount"),
        H("hPartIITableSize", ""), H("txtFinalFlag", "0"), H("txtEnroll", "N"), ...EBIR, H("driveSelectTPExport", ""),
    ],
    prof: pm(Q_TIN, `${Q}txtRDOCode`, `${Q}txtTaxpayerName`, `${Q}txtAddress`, `${Q}txtZipCode`, `${Q}txtTelNum`, "txtEmail", `${Q}txtLineBus`),
    defaults: (now) => ({ [`${Q}txtYear`]: String(now.getFullYear()), ...qPatch(Q_QTR, curQ()), [`${Q}optAmend:N`]: "true", [`${Q}txtNoSheets`]: "0" }),
    compute: (v) => {
        const wh = range(1, 6).map((i) => p(v[`${Q}txtTaxBase${i}`]) * rateOf(v[`${Q}txtTaxRate${i}`]));
        const g = (n) => p(v[`${Q}txtTax${n}`]);
        const t19 = wh.reduce((a, b) => a + b, 0), t24 = g(20) + g(21) + g(22) + g(23), t25 = t19 - t24, t29 = g(26) + g(27) + g(28);
        return {
            ...Object.fromEntries(wh.map((x, i) => [`${Q}txtTaxbeWithHeld${i + 1}`, f(x)])),
            [`${Q}txtTax19`]: f(t19), [`${Q}txtTax24`]: f(t24), [`${Q}txtTax25`]: f(t25), [`${Q}txtTax29`]: f(t29), [`${Q}txtTax30`]: f(t25 + t29),
        };
    },
    validate: (v) => {
        if (!qOf(v, Q_QTR)) return "Choose the quarter (item 2).";
        if (!T_(v[`${Q}optWithheld:Y`]) && !T_(v[`${Q}optWithheld:N`])) return "Choose an option for item 4.";
        if (!T_(v[`${Q}optCategory:P`]) && !T_(v[`${Q}optCategory:G`])) return "Choose an option for item 11.";
        return tinErr(v, Q_TIN);
    },
    filename: (v) => `${tinOf(v, Q_TIN)}-1601EQ-${v[`${Q}txtYear`]}Q${qOf(v, Q_QTR)}.xml`,
    autofill: async (v, af) => {
        const y = Number(v[`${Q}txtYear`]), q = qOf(v, Q_QTR);
        if (!y || !q) return null;
        const { from, to, s } = qMonths(y, q);
        const m1 = `${pad(s)}${y}`, m2 = `${pad(s + 1)}${y}`;
        const [atc, rem] = await Promise.all([af("sum_atc", { from, to }), af("remit0619e", { months: `${m1},${m2}` })]);
        const out = {};
        range(1, 6).forEach((i) => {
            const r = atc.rows?.[i - 1];
            out[`${Q}txtAtcCd${i}`] = r ? r.atc : "";
            out[`${Q}txtTaxBase${i}`] = r ? f(r.base) : "";
            out[`${Q}txtTaxRate${i}`] = r ? String(r.rate) : "";
        });
        out[`${Q}txtTax20`] = rem.values?.[m1] ? f(p(rem.values[m1])) : "0.00";
        out[`${Q}txtTax21`] = rem.values?.[m2] ? f(p(rem.values[m2])) : "0.00";
        return out;
    },
};

/* =========================================================
   2550M – Monthly VAT
   ========================================================= */
const M = "frm2550m:";
const M_MY = [[`${M}RtnYear`, "m"], [`${M}txtYear`, "y"]];
const M_TIN = [`${M}txtTIN1`, `${M}txtTIN2`, `${M}txtTIN3`, `${M}txtBranchCode`];
const M_MODAL = [
    "txtmodalTotalAmt", "txtmodalTotalInputTax", "txtmodalTotalAmountSched3", "txtmodalTotalInputTaxSched3", "txtmodalTotalBalanceSched3A",
    "txtmodalTotalBalanceSched3B", "txtmodalTotalInputTax20ASched3", "txtinputtaxSched4", "txtTaxableSaleSched4", "txtInputTaxnotDirectSched4",
    "txtTotalInputTaxnotDirectSched4", "txtTotalSaleSched4", "txtTotalInputSaletoGovernmentSched4", "txtlessStdTaxSched4", "txtTotal20BSched4",
    "txtinputtaxSched5", "txtTotSaleSched5", "txtAmountInputnotDirectSched5", "txtProductnotDirectSched5", "txtSumTotalSaleSched5",
    "txtTotal20CSched5", "txtmodalTotal23A", "txtmodalTotalSched6AppliedCurrent", "txtmodalTotal23B", "txtmodalTotalSched7AppliedCurrent",
    "txtmodalTotal23C", "txtmodalTotalSched8AppliedCurrent",
].map((k) => H(k, k === "txtlessStdTaxSched4" ? "5.00" : "0.00"));

const F2550M = {
    id: "2550M", file: "2550M", title: "2550M – Monthly VAT Declaration", footer: FOOT,
    fields: [
        S("Part I – Background information"),
        MY("1 For the month", M_MY),
        O("amend", `${M}OptAmendedYN1`, "Yes", "2 Amended return?"), O("amend", `${M}OptAmendedYN2`, "No"),
        T(`${M}txtSheets`, "3 No. of sheets attached"),
        T(M_TIN[0], "4 TIN"), T(M_TIN[1]), T(M_TIN[2]), T(M_TIN[3], "Branch code"), T(`${M}txtRDOCode`, "5 RDO code"),
        T(`${M}txtLineBus`, "6 Line of business", { enc: true, wide: true }),
        T(`${M}txtTaxPayerName`, "7 Taxpayer name", { enc: true, wide: true }),
        T(`${M}txtTelephoneNum`, "8 Telephone number"),
        T(`${M}txtAddress`, "9 Registered address", { enc: true, wide: true }),
        T(`${M}txtZipCode`, "10 ZIP code"),
        O("special", `${M}OptSpecialTax1`, "Yes", "11 Tax relief under special law / treaty?"), O("special", `${M}OptSpecialTax2`, "No"),
        T(`${M}lstSpecialTax`, "11A If yes, specify"),
        S("Part II – Computation of tax"),
        N(`${M}txtTax12A`, "12A Vatable sales – private"), R(`${M}txtTax12B`, "12B Output tax"),
        N(`${M}txtTax13A`, "13A Sales to government"), R(`${M}txtTax13B`, "13B Output tax"),
        N(`${M}txtTax14`, "14 Zero-rated sales"), N(`${M}txtTax15`, "15 Exempt sales"),
        R(`${M}txtTax16A`, "16A Total sales"), R(`${M}txtTax16B`, "16B Total output tax due"),
        N(`${M}txtTax17A`, "17A Input tax carried over"), N(`${M}txtTax17B`, "17B Input tax deferred on capital goods"),
        N(`${M}txtTax17C`, "17C Transitional input tax"), N(`${M}txtTax17D`, "17D Presumptive input tax"),
        N(`${M}txtTax17E`, "17E Others"), R(`${M}txtTax17F`, "17F Total"),
        N(`${M}txtTax18A`, "18A Capital goods ≤ ₱1M"), R(`${M}txtTax18B`, "18B Input tax"),
        N(`${M}txtTax18C`, "18C Capital goods > ₱1M"), R(`${M}txtTax18D`, "18D Input tax"),
        N(`${M}txtTax18E`, "18E Domestic purchases of goods"), R(`${M}txtTax18F`, "18F Input tax"),
        N(`${M}txtTax18G`, "18G Importation of goods"), R(`${M}txtTax18H`, "18H Input tax"),
        N(`${M}txtTax18I`, "18I Domestic purchase of services"), R(`${M}txtTax18J`, "18J Input tax"),
        N(`${M}txtTax18K`, "18K Services by non-residents"), R(`${M}txtTax18L`, "18L Input tax"),
        N(`${M}txtTax18M`, "18M Purchases not qualified for input tax"),
        N(`${M}txtTax18N`, "18N Others"), R(`${M}txtTax18O`, "18O Input tax"),
        R(`${M}txtTax18P`, "18P Total current purchases"),
        R(`${M}txtTax19`, "19 Total available input tax"),
        N(`${M}txtTax20A`, "20A Input tax on capital goods > ₱1M deferred"), N(`${M}txtTax20B`, "20B Input tax on sales to government"),
        N(`${M}txtTax20C`, "20C Input tax allocable to exempt sales"), N(`${M}txtTax20D`, "20D VAT refund / TCC claimed"),
        N(`${M}txtTax20E`, "20E Others"), R(`${M}txtTax20F`, "20F Total deductions"),
        R(`${M}txtTax21`, "21 Total allowable input tax"), R(`${M}txtTax22`, "22 Net VAT payable"),
        N(`${M}txtTax23A`, "23A Monthly VAT payments – previous months"), N(`${M}txtTax23B`, "23B Creditable VAT withheld – gov't"),
        N(`${M}txtTax23C`, "23C Creditable VAT withheld"), N(`${M}txtTax23D`, "23D Advance payment (sugar / flour)"),
        N(`${M}txtTax23E`, "23E VAT withheld on sales to gov't"), N(`${M}txtTax23F`, "23F VAT paid in return previously filed"),
        R(`${M}txtTax23G`, "23G Total tax credits / payments"),
        R(`${M}txtTax24`, "24 Tax still payable / (overpayment)"),
        N(`${M}txtTax25A`, "25A Surcharge"), N(`${M}txtTax25B`, "25B Interest"), N(`${M}txtTax25C`, "25C Compromise"),
        R(`${M}txtTax25D`, "25D Total penalties"), R(`${M}txtTax26`, "26 Total amount payable / (overpayment)"),
        H("frm2550M:txtmodaltxtTotal12A", "0.00"), H("frm2550M:txtmodaltxtTotal12B", "0.00"),
        ...range(1, 36).map((i) => H(`AtcCode${i}`, "false")),
        ...M_MODAL,
        H("txtFinalFlag", "0"), H("txtEnroll", "N"), ...EBIR,
        T("txtEmail", "Email address", { wide: true }),
        H("driveSelectTPExport", "0"),
    ],
    prof: pm(M_TIN, `${M}txtRDOCode`, `${M}txtTaxPayerName`, `${M}txtAddress`, `${M}txtZipCode`, `${M}txtTelephoneNum`, "txtEmail", `${M}txtLineBus`),
    defaults: (now) => ({ ...isoToParts(M_MY, ym(now)), [`${M}OptAmendedYN2`]: "true", [`${M}txtSheets`]: "0", [`${M}OptSpecialTax2`]: "true" }),
    compute: (v) => {
        const g = (k) => p(v[`${M}txtTax${k}`]);
        const vat = (k) => g(k) * 0.12;
        const t16A = g("12A") + g("13A") + g("14") + g("15"), t16B = vat("12A") + vat("13A");
        const t17F = g("17A") + g("17B") + g("17C") + g("17D") + g("17E");
        const t18P = g("18A") + g("18C") + g("18E") + g("18G") + g("18I") + g("18K") + g("18M") + g("18N");
        const t19 = t17F + vat("18A") + vat("18C") + vat("18E") + vat("18G") + vat("18I") + vat("18K") + vat("18N");
        const t20F = g("20A") + g("20B") + g("20C") + g("20D") + g("20E");
        const t21 = t19 - t20F, t22 = t16B - t21;
        const t23G = g("23A") + g("23B") + g("23C") + g("23D") + g("23E") + g("23F");
        const t24 = t22 - t23G, t25D = g("25A") + g("25B") + g("25C");
        const k = (x) => `${M}txtTax${x}`;
        return {
            [k("12B")]: f(vat("12A")), [k("13B")]: f(vat("13A")), [k("16A")]: f(t16A), [k("16B")]: f(t16B), [k("17F")]: f(t17F),
            [k("18B")]: f(vat("18A")), [k("18D")]: f(vat("18C")), [k("18F")]: f(vat("18E")), [k("18H")]: f(vat("18G")),
            [k("18J")]: f(vat("18I")), [k("18L")]: f(vat("18K")), [k("18O")]: f(vat("18N")), [k("18P")]: f(t18P),
            [k("19")]: f(t19), [k("20F")]: f(t20F), [k("21")]: f(t21), [k("22")]: f(t22), [k("23G")]: f(t23G),
            [k("24")]: f(t24), [k("25D")]: f(t25D), [k("26")]: f(t24 + t25D),
        };
    },
    validate: (v) => tinErr(v, M_TIN),
    filename: (v) => `${tinOf(v, M_TIN)}-2550M-${v[M_MY[0][0]]}${v[M_MY[1][0]]}.xml`,
    autofill: async (v, af) => {
        const m = partsToIso(M_MY, v, "month");
        if (!m) return null;
        const r = await af("2550m", { from: m, to: m });
        return {
            [`${M}txtTax12A`]: f(r.net_of_vat), [`${M}txtTax14`]: f(r.zero_rated), [`${M}txtTax15`]: f(r.vat_exempt),
            [`${M}txtTax18E`]: f(r.purchases_net_of_vat), [`${M}txtTax18G`]: f(r.importation_net_of_vat),
            [`${M}txtTax18M`]: f(r.purchases_exempt_zero), [`${M}txtTax23C`]: f(r.vat_withheld),
        };
    },
};

/* =========================================================
   2550Q (v2024) – Quarterly VAT
   ========================================================= */
const V = "frm2550qv2024:";
const V_MY = [[`${V}selectedMonthNo2`, "mn"], [`${V}txtYearNo2`, "y"]];
const V_QTR = [1, 2, 3, 4].map((i) => `${V}OptQuarter${i}`);
const V_RF = [[`${V}RtnPeriodFromNo4`, "mdy"]];
const V_RT = [[`${V}RtnPeriodToNo4`, "mdy"]];
const V_TIN = [`${V}txtTIN1`, `${V}txtTIN2`, `${V}txtTIN3`, `${V}branchCode`];
const s3sum = (v, key) => (v.__sched3 || []).reduce((a, r) => a + p(r[key]), 0);

// old AutoFillDateFromAndTo: quarter + period from the "year ended" month
function periodFromYearEnd(y, m) {
    const q = Math.ceil(m / 3);
    let fsM = m + 1, fsY = y - 1;
    if (fsM > 12) { fsM = 1; fsY = y; }
    let qsM = fsM + (q - 1) * 3, qsY = fsY;
    while (qsM > 12) { qsM -= 12; qsY += 1; }
    let qeM = qsM + 2, qeY = qsY;
    while (qeM > 12) { qeM -= 12; qeY += 1; }
    return {
        q,
        from: `${qsY}-${pad(qsM)}-01`,
        to: `${qeY}-${pad(qeM)}-${pad(new Date(qeY, qeM, 0).getDate())}`,
    };
}

const F2550Q = {
    id: "2550Qv2024", file: "2550Qv2024", title: "2550Q (v2024) – Quarterly VAT Return", footer: FOOT,
    fields: [
        S("Part I – Background information"),
        O("forthe", `${V}calendarNo1`, "Calendar", "1 For the"), O("forthe", `${V}fiscalNo1`, "Fiscal"),
        MY("2 Year ended", V_MY),
        O("qtr", V_QTR[0], "1st", "3 Quarter"), O("qtr", V_QTR[1], "2nd"), O("qtr", V_QTR[2], "3rd"), O("qtr", V_QTR[3], "4th"),
        DT("4 Return period from", V_RF), DT("4 Return period to", V_RT),
        O("amend", `${V}amendedReturnYesNo5`, "Yes", "5 Amended return?"), O("amend", `${V}amendedReturnNo5`, "No"),
        O("short", `${V}OptShortPrd1`, "Yes", "6 Short period return?"), O("short", `${V}OptShortPrd2`, "No"),
        T(V_TIN[0], "7 TIN"), T(V_TIN[1]), T(V_TIN[2]), T(V_TIN[3], "Branch code"), T(`${V}txtRDOCode`, "8 RDO code"),
        T(`${V}taxpayerName`, "9 Taxpayer name", { enc: true, wide: true }),
        T(`${V}taxpayerAddress`, "10 Registered address", { enc: true, wide: true }),
        T(`${V}taxpayerZip`, "10A ZIP code"), T(`${V}taxpayerContactNumber`, "11 Contact number"),
        T(`${V}taxpayerEmailAddress`, "12 Email address", { wide: true }),
        O("cls", `${V}taxPayerClassification1`, "Micro", "13 Taxpayer classification"), O("cls", `${V}taxPayerClassification2`, "Small"),
        O("cls", `${V}taxPayerClassification3`, "Medium"), O("cls", `${V}taxPayerClassification4`, "Large"),
        O("treaty", `${V}internationalTreatyYn`, "Yes", "14 Tax relief under special law / treaty?"), O("treaty", `${V}specialRateYn`, "No"),
        T(`${V}specifyInternationalTreaty`, "14A If yes, specify"),
        S("Part II – Total tax payable"),
        R(`${V}excessInputTax`, "15 Net VAT payable (item 61)"),
        N(`${V}creditableVat`, "16 Creditable VAT withheld (Sch. 3)"),
        N(`${V}advVatPayment`, "17 Advance VAT payments (Sch. 4)"),
        N(`${V}vatPaidReturn`, "18 VAT paid in return previously filed"),
        T(`${V}addSpecifyNo19`, "19 Other credits (specify)"), N(`${V}otherCreditsNo19`, "19 Amount"),
        R(`${V}totalTaxCredits`, "20 Total tax credits / payments"),
        R(`${V}excessCredits`, "21 Tax still payable / (excess credits)"),
        N(`${V}surcharge`, "22 Surcharge"), N(`${V}interest`, "23 Interest"), N(`${V}compromise`, "24 Compromise"),
        R(`${V}penalties`, "25 Total penalties"), R(`${V}totalPayable`, "26 Total amount payable / (overpayment)"),
        S("Page 2"),
        T(`${V}txtPg2TIN1`, "TIN"), T(`${V}txtPg2TIN2`), T(`${V}txtPg2TIN3`), T(`${V}txtPg2BranchCode`, "Branch code"),
        T(`${V}Pg2TaxPayer`, "Taxpayer name", { wide: true }),
        S("Part IV – Details of VAT computation"),
        N(`${V}vatableSales`, "31A Vatable sales"), R(`${V}outputVatSales`, "31B Output tax"),
        N(`${V}zeroRatedSales`, "32 Zero-rated sales"), N(`${V}exemptSales`, "33 Exempt sales"),
        R(`${V}totalSales`, "34A Total sales"), R(`${V}outputTaxDue`, "34B Total output tax due"),
        N(`${V}lessOutputVat`, "35 Less: output VAT on uncollected receivables"),
        N(`${V}addOutputVat`, "36 Add: output VAT on recovered receivables"),
        R(`${V}totalAdjOutput`, "37 Total adjusted output tax due"),
        N(`${V}inputTaxCarried`, "38 Input tax carried over"), N(`${V}inputTaxDeferred`, "39 Input tax deferred on capital goods > ₱1M"),
        N(`${V}transitionalInputTax`, "40 Transitional input tax"), N(`${V}presumptiveInputTax`, "41 Presumptive input tax"),
        T(`${V}addSpecifyNo42`, "42 Others (specify)"), N(`${V}otherSpecify42`, "42 Amount"),
        R(`${V}total43`, "43 Total"),
        N(`${V}domesticPurchase`, "44A Domestic purchases"), R(`${V}domesticInputTax`, "44B Input tax"),
        N(`${V}servicesPurchase`, "45A Services by non-residents"), R(`${V}serviceInputTax`, "45B Input tax"),
        N(`${V}importPurchase`, "46A Importations"), R(`${V}importInputTax`, "46B Input tax"),
        T(`${V}addSpecifyNo47`, "47 Others (specify)"), N(`${V}otherSpecify47`, "47A Amount"), R("otherSpecify47B", "47B Input tax"),
        N(`${V}domesticPurchaseNoTax`, "48 Domestic purchases with no input tax"), N(`${V}vatExemptImports`, "49 VAT-exempt importations"),
        R(`${V}totalCurPurchase`, "50A Total current purchases"), R(`${V}totalCurInputTax`, "50B Total current input tax"),
        R(`${V}totalAvailInputTax`, "51 Total available input tax"),
        N(`${V}importCapitalInputTax`, "52 Input tax on capital goods > ₱1M deferred"), N(`${V}inputTaxAttr`, "53 Input tax attributable to exempt sales"),
        N(`${V}vatRefund`, "54 VAT refund / TCC claimed"), N(`${V}inputVatUnpaid`, "55 Input VAT on unpaid payables"),
        T(`${V}addSpecifyNo56`, "56 Others (specify)"), N(`${V}otherSpecify56`, "56 Amount"),
        R(`${V}totalDeductions`, "57 Total deductions"), N(`${V}addInputVat`, "58 Add: input VAT on settled payables"),
        R(`${V}adjDeductions`, "59 Adjusted deductions"), R(`${V}totalAllowInputTax`, "60 Total allowable input tax"),
        R(`${V}netVatPayable`, "61 Net VAT payable / (excess input tax)"),
        S("Schedule 1 – Input tax on capital goods > ₱1M"),
        ...[10, 11].flatMap((i) => [
            T(`txtDatePurchase${i}`, "Date purchased"), T(`txtSourceCode${i}`, "Source code"), T(`txtDescription${i}`, "Description"),
            N(`txtAmountPurchase${i}`, "Amount of purchase"), N(`txtInputTax${i}`, "Input tax"), N(`txtEstimatedLife${i}`, "Estimated life (months)"),
            N(`txtRecognizedLife${i}`, "Recognized life"), N(`txtAllowedInputTax${i}`, "Allowable input tax"), N(`txtBalanceInputTax${i}`, "Balance of input tax"),
        ]),
        N("sched1TotalBalPrev", "Total balance from previous"), N("sched1TotalBalNext", "Total balance to next"),
        S("Schedule 2 – Input tax attributable to exempt sales"),
        N(`${V}sched2InputTaxDirect`, "Input tax directly attributable"), N(`${V}sched2VatExemptSale`, "VAT-exempt sales"),
        N(`${V}sched2AmountInputTax`, "Input tax not directly attributable"), R(`${V}sched2TotalSales`, "Total sales"),
        N(`${V}sched2TotalRatable`, "Ratable portion"), N(`${V}sched2TotalAttr`, "Total input tax attributable"),
        S("Schedule 3 – Creditable VAT withheld"),
        { t: "sched3" },
        H("sched3TotalIncome", (v) => f(s3sum(v, "income"))), H("sched3TotalTax", (v) => f(s3sum(v, "tax"))),
        S("Schedule 4 – Advance VAT payment"),
        ...[0, 1].flatMap((i) => [
            T(`txtDate4${i}`, "Period from"), T(`txtDate4To${i}`, "Period to"), T(`txtNameOfMiller4${i}`, "Name of miller"),
            T(`txtNameOfTaxpayer4${i}`, "Name of taxpayer"), T(`txtOfficialReceiptNumber4${i}`, "Official receipt no."), N(`txtAmountPaid4${i}`, "Amount paid"),
        ]),
        N("sched4AmountPaid", "Total advance payment"),
        H(`${V}txtCurrentPage`, "2"), H(`${V}txtMaxPage`, "2"),
        H("resultOtherCreditsNo19", "0.00"), H("resultOtherCreditsNo42", "0.00"), H("resultOtherCreditsNo47", "0.00"), H("resultOtherCreditsNo56", "0.00"),
        H("txtTotalAmountOfBalanceofInputTaxFromPrevious", "0.00"), H("txtTotalAmountOfBalanceofInputTaxToBeCarried", "0.00"),
        H("txtTotalAmountofIncomePayment", (v) => f(s3sum(v, "income"))), H("txtTotalAmoungOfTaxWithHeld", (v) => f(s3sum(v, "tax"))),
        H("txtAmountPaidSched4", "0.00"), H("txtFinalFlag", "0"), H("txtEnroll", "N"), ...EBIR,
        H("txtEmail", (v) => v[`${V}taxpayerEmailAddress`] || ""),
        H("driveSelectTPExport", "0"),
        H("dateFiled", () => { const d = new Date(); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`; }),
    ],
    prof: pm(V_TIN, `${V}txtRDOCode`, `${V}taxpayerName`, `${V}taxpayerAddress`, `${V}taxpayerZip`, `${V}taxpayerContactNumber`, `${V}taxpayerEmailAddress`, null,
        { tin1: [`${V}txtPg2TIN1`], tin2: [`${V}txtPg2TIN2`], tin3: [`${V}txtPg2TIN3`], tin4: [`${V}txtPg2BranchCode`], fn: [`${V}Pg2TaxPayer`] }),
    defaults: (now) => {
        const y = now.getFullYear(), per = periodFromYearEnd(y, 12);
        return {
            [`${V}calendarNo1`]: "true", ...isoToParts(V_MY, `${y}-12`), ...qPatch(V_QTR, per.q),
            ...isoToParts(V_RF, per.from), ...isoToParts(V_RT, per.to),
            [`${V}amendedReturnNo5`]: "true", [`${V}OptShortPrd2`]: "true", [`${V}specialRateYn`]: "true",
        };
    },
    onChange: (patch, v) => {
        if (V_MY.some(([k]) => k in patch)) {
            const y = Number(v[V_MY[1][0]]), m = Number(v[V_MY[0][0]]);
            if (!y || !m) return {};
            const per = periodFromYearEnd(y, m);
            return { ...qPatch(V_QTR, per.q), ...isoToParts(V_RF, per.from), ...isoToParts(V_RT, per.to) };
        }
        if (V_QTR.some((k) => k in patch)) {
            const y = Number(v[V_MY[1][0]]) || new Date().getFullYear(), q = qOf(v, V_QTR);
            if (!q) return {};
            const d = qDates(y, q);
            return { ...isoToParts(V_RF, d.from), ...isoToParts(V_RT, d.to) };
        }
        if (`${V}calendarNo1` in patch && T_(patch[`${V}calendarNo1`])) {
            return isoToParts(V_MY, `${new Date().getFullYear()}-12`);
        }
        return {};
    },
    compute: (v) => {
        const g = (k) => p(v[`${V}${k}`]);
        const t20 = g("creditableVat") + g("advVatPayment") + g("vatPaidReturn") + g("otherCreditsNo19");
        const t25 = g("surcharge") + g("interest") + g("compromise");
        const t31B = g("vatableSales") * 0.12;
        const t34A = g("vatableSales") + g("zeroRatedSales") + g("exemptSales");
        const t37 = t31B - g("lessOutputVat") + g("addOutputVat");
        const t43 = g("inputTaxCarried") + g("inputTaxDeferred") + g("transitionalInputTax") + g("presumptiveInputTax") + g("otherSpecify42");
        const t44B = g("domesticPurchase") * 0.12, t45B = g("servicesPurchase") * 0.12, t46B = g("importPurchase") * 0.12, t47B = g("otherSpecify47") * 0.12;
        const t50A = g("domesticPurchase") + g("servicesPurchase") + g("importPurchase") + g("otherSpecify47") + g("domesticPurchaseNoTax") + g("vatExemptImports");
        const t50B = t44B + t45B + t46B + t47B;
        const t51 = t43 + t50B;
        const t57 = g("importCapitalInputTax") + g("inputTaxAttr") + g("vatRefund") + g("inputVatUnpaid") + g("otherSpecify56");
        const t59 = t57 + g("addInputVat");
        const t60 = t51 - t59;
        const t61 = t37 - t60;
        const t21 = t61 - t20;
        const k = (x) => `${V}${x}`;
        return {
            [k("excessInputTax")]: f(t61), [k("totalTaxCredits")]: f(t20), [k("excessCredits")]: f(t21),
            [k("penalties")]: f(t25), [k("totalPayable")]: f(t21 + t25),
            [k("outputVatSales")]: f(t31B), [k("totalSales")]: f(t34A), [k("outputTaxDue")]: f(t31B), [k("totalAdjOutput")]: f(t37),
            [k("total43")]: f(t43), [k("domesticInputTax")]: f(t44B), [k("serviceInputTax")]: f(t45B), [k("importInputTax")]: f(t46B),
            otherSpecify47B: f(t47B), [k("totalCurPurchase")]: f(t50A), [k("totalCurInputTax")]: f(t50B), [k("totalAvailInputTax")]: f(t51),
            [k("totalDeductions")]: f(t57), [k("adjDeductions")]: f(t59), [k("totalAllowInputTax")]: f(t60), [k("netVatPayable")]: f(t61),
            [k("sched2TotalSales")]: f(t34A),
        };
    },
    validate: (v) => {
        if (!qOf(v, V_QTR)) return "Choose the quarter (item 3).";
        if (![1, 2, 3, 4].some((i) => T_(v[`${V}taxPayerClassification${i}`]))) return "Choose the taxpayer classification (item 13).";
        return tinErr(v, V_TIN);
    },
    filename: (v) => `${tinOf(v, V_TIN)}-2550Qv2024-${v[V_MY[0][0]]}${v[V_MY[1][0]]}Q${qOf(v, V_QTR)}.xml`,
    autofill: async (v, af) => {
        const y = Number(v[V_MY[1][0]]) || new Date().getFullYear(), q = qOf(v, V_QTR);
        if (!q) return null;
        const { from, to } = qMonths(y, q);
        const r = await af("2550q", { from, to });
        const d = qDates(y, q);
        return {
            [`${V}vatableSales`]: f(r.net_of_vat), [`${V}zeroRatedSales`]: f(r.zero_rated), [`${V}exemptSales`]: f(r.vat_exempt),
            [`${V}domesticPurchase`]: f(r.purchases_net_of_vat), [`${V}importPurchase`]: f(r.importation_net_of_vat),
            [`${V}domesticPurchaseNoTax`]: f(r.purchases_exempt_zero),
            [`${V}advVatPayment`]: f(r.advance_vat), [`${V}creditableVat`]: f(r.vat_withheld),
            ...isoToParts(V_RF, d.from), ...isoToParts(V_RT, d.to),
            __sched3: (r.schedule3 || []).map((s) => ({ from: s.from, to: s.to, name: s.name, income: f(s.income), tax: f(s.tax) })),
        };
    },
};

/* =========================================================
   2551Q (v2018) – Quarterly percentage tax
   ========================================================= */
const P = "frm2551Qv2018:";
const P_MY = [[`${P}rtnMonth`, "mn"], [`${P}txtYear`, "y"]];
const P_QTR = [1, 2, 3, 4].map((i) => `${P}qtr_${i}`);
const P_TIN = [`${P}txtTIN1`, `${P}txtTIN2`, `${P}txtTIN3`, `${P}txtBranchCode`];

const F2551Q = {
    id: "2551Qv2018", file: "2551Qv2018", title: "2551Q (v2018) – Quarterly Percentage Tax", footer: FOOT,
    fields: [
        S("Part I – Background information"),
        O("forthe", `${P}forThe_1`, "Calendar", "1 For the"), O("forthe", `${P}forThe_2`, "Fiscal"),
        MY("2 Year ended", P_MY),
        O("qtr", P_QTR[0], "1st", "3 Quarter"), O("qtr", P_QTR[1], "2nd"), O("qtr", P_QTR[2], "3rd"), O("qtr", P_QTR[3], "4th"),
        O("amend", `${P}amendedRtn_1`, "Yes", "4 Amended return?"), O("amend", `${P}amendedRtn_2`, "No"),
        T(`${P}txtSheets`, "5 No. of sheets attached"),
        T(P_TIN[0], "6 TIN"), T(P_TIN[1]), T(P_TIN[2]), T(P_TIN[3], "Branch code"), T(`${P}txtRDOCode`, "7 RDO code"),
        T(`${P}registeredName`, "8 Taxpayer name", { enc: true, wide: true }),
        T(`${P}registeredAddress`, "9 Registered address", { enc: true, wide: true }),
        T(`${P}zipCode`, "9A ZIP code"), T(`${P}telNo`, "10 Contact number"),
        T("txtEmail", "11 Email address", { wide: true }),
        O("treaty", `${P}taxTreaty_1`, "Yes", "12 Tax relief under special law / treaty?"), O("treaty", `${P}taxTreaty_2`, "No"),
        T(`${P}txtTaxReliefSpecify`, "12A If yes, specify"),
        O("rate", `${P}taxRate1`, "Graduated income tax rates", "13 Income tax rate (individuals)"), O("rate", `${P}taxRate2`, "8% income tax rate"),
        S("Part II – Total tax payable"),
        R(`${P}txt14`, "14 Total tax due (Sch. 1)"),
        N(`${P}txt15`, "15 Creditable percentage tax withheld (2307)"),
        N(`${P}txt16`, "16 Tax paid in return previously filed"),
        T(`${P}txt17Specify`, "17 Other tax credits (specify)"), N(`${P}txt17`, "17 Amount"),
        R(`${P}txt18`, "18 Total tax credits / payments"), R(`${P}txt19`, "19 Tax still payable / (overpayment)"),
        N(`${P}txt20`, "20 Surcharge"), N(`${P}txt21`, "21 Interest"), N(`${P}txt22`, "22 Compromise"),
        R(`${P}txt23`, "23 Total penalties"), R(`${P}txt24`, "24 Total amount payable / (overpayment)"),
        C(`${P}overPayment1`, "To be refunded"), C(`${P}overPayment2`, "To be issued a tax credit certificate"),
        S("Part III – Details of payment"),
        T("txtTaxAgentNo", "Tax agent accreditation no."), T("txtDateIssue", "Date of issue"), T("txtDateExpiry", "Date of expiry"),
        ...pay(P, 25, "Cash / bank debit memo"), ...pay(P, 26, "Check"), ...pay(P, 27, "Tax debit memo"),
        T(`${P}txtParticular28`, "28 Others (specify)"), T(`${P}txtAgency28`, "Agency"), T(`${P}txtNumber28`, "Number"), T(`${P}txtDate28`, "Date"), T(`${P}txtAmount28`, "Amount"),
        S("Page 2 – Schedule 1: computation of tax"),
        T(`${P}txtPg2TIN1`, "TIN"), T(`${P}txtPg2TIN2`), T(`${P}txtPg2TIN3`), T(`${P}txtPg2BranchCode`, "Branch code"),
        T(`${P}txtPg2TaxpayerName`, "Taxpayer name", { wide: true }),
        ...range(1, 6).flatMap((i) => [
            SEL(`drpATC${i}`, `ATC ${i}`, "atc2551q"), N(`txtATCAmt${i}`, "Taxable amount"),
            T(`txtATCRate${i}`, "Tax rate (%)"), R(`txtATCDue${i}`, "Tax due"),
        ]),
        R("txtTotalSched1", "Total tax due"),
        H(`${P}txtCurrentPage`, "2"), H(`${P}txtMaxPage`, "2"),
        H("txtFinalFlag", "0"), H("txtEnroll", "N"), ...EBIR, H("driveSelectTPExport", "0"),
    ],
    prof: pm(P_TIN, `${P}txtRDOCode`, `${P}registeredName`, `${P}registeredAddress`, `${P}zipCode`, `${P}telNo`, "txtEmail", null,
        { tin1: [`${P}txtPg2TIN1`], tin2: [`${P}txtPg2TIN2`], tin3: [`${P}txtPg2TIN3`], tin4: [`${P}txtPg2BranchCode`], fn: [`${P}txtPg2TaxpayerName`] }),
    defaults: (now, lookups) => ({
        [`${P}forThe_1`]: "true", ...isoToParts(P_MY, `${now.getFullYear()}-12`), ...qPatch(P_QTR, 4),
        [`${P}amendedRtn_2`]: "true", [`${P}taxTreaty_2`]: "true", [`${P}taxRate1`]: "true",
        ...Object.fromEntries(range(1, 6).map((i) => [`drpATC${i}`, "0"])),
        drpATC1: lookups?.atc2551q?.[0] ? String(lookups.atc2551q[0].id) : "0",
    }),
    onChange: (patch, v) => {
        if (P_MY.some(([k]) => k in patch)) {
            const m = Number(v[P_MY[0][0]]);
            return m ? qPatch(P_QTR, Math.ceil(m / 3)) : {};
        }
        return {};
    },
    compute: (v) => {
        const dues = range(1, 6).map((i) => p(v[`txtATCAmt${i}`]) * p(v[`txtATCRate${i}`]) / 100);
        const total = dues.reduce((a, b) => a + b, 0);
        const g = (n) => p(v[`${P}txt${n}`]);
        const t18 = g(15) + g(16) + g(17), t19 = total - t18, t23 = g(20) + g(21) + g(22);
        return {
            ...Object.fromEntries(dues.map((d, i) => [`txtATCDue${i + 1}`, f(d)])),
            txtTotalSched1: f(total), [`${P}txt14`]: f(total), [`${P}txt18`]: f(t18), [`${P}txt19`]: f(t19),
            [`${P}txt23`]: f(t23), [`${P}txt24`]: f(t19 + t23),
        };
    },
    validate: (v) => (qOf(v, P_QTR) ? tinErr(v, P_TIN) : "Choose the quarter (item 3)."),
    filename: (v) => `${tinOf(v, P_TIN)}-2551Qv2018-${v[P_MY[0][0]]}${v[P_MY[1][0]]}Q${qOf(v, P_QTR)}.xml`,
    autofill: async (v, af) => {
        const y = Number(v[P_MY[1][0]]) || new Date().getFullYear(), q = qOf(v, P_QTR);
        if (!q) return null;
        const { from, to } = qMonths(y, q);
        const r = await af("2551q", { from, to, ...(v.drpATC1 && v.drpATC1 !== "0" ? { atc_id: v.drpATC1 } : {}) });
        return { txtATCAmt1: f(r.amount), txtATCRate1: (r.rate * 100).toFixed(2) };
    },
};

/* =========================================================
   NEW FORMS (FEMS design that follows the BIR form)
   1701Q · 1701 · 1702Q · 1702RT · 1702EX · 1604C · 1604E · 2200M
   Saved in the same save folder as the other returns, but these are FEMS files:
   the eBIRForms app does not open them (it has its own version of these forms).
   ========================================================= */
const FOOT_X = "\nFEMS";

// graduated income tax for individuals: TRAIN 2018–2022, 2023 onwards
export function gradTax(income, year) {
    const t = Number(year) >= 2023
        ? [[8000000, 2202500, 0.35], [2000000, 402500, 0.30], [800000, 102500, 0.25], [400000, 22500, 0.20], [250000, 0, 0.15]]
        : [[8000000, 2410000, 0.35], [2000000, 490000, 0.32], [800000, 130000, 0.30], [400000, 30000, 0.25], [250000, 0, 0.20]];
    for (const [min, base, rate] of t) if (income > min) return base + (income - min) * rate;
    return 0;
}
const sumOf = (v, keys) => keys.reduce((a, k) => a + p(v[k]), 0);
const tinK = (X) => [`${X}txtTIN1`, `${X}txtTIN2`, `${X}txtTIN3`, `${X}txtBranchCode`];

const addM = (ymStr, n) => { const [y, m] = ymStr.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return ym(d); };

// background: TIN · RDO · name · address · ZIP · contact · email · line of business · sheets · amended
const bgFields = (X) => [
    S("Part I – Background information"),
    O("amend", `${X}optAmend:Y`, "Yes", "Amended return?"), O("amend", `${X}optAmend:N`, "No"),
    T(`${X}txtSheets`, "No. of sheets attached"),
    T(`${X}txtTIN1`, "TIN"), T(`${X}txtTIN2`), T(`${X}txtTIN3`), T(`${X}txtBranchCode`, "Branch code"), T(`${X}txtRDOCode`, "RDO code"),
    T(`${X}txtTaxpayerName`, "Taxpayer name", { enc: true, wide: true }),
    T(`${X}txtAddress`, "Registered address", { enc: true, wide: true }),
    T(`${X}txtZipCode`, "ZIP code"), T(`${X}txtTelNum`, "Contact number"),
    T(`${X}txtEmail`, "Email address", { wide: true }),
    T(`${X}txtLineBus`, "Line of business", { enc: true, wide: true }),
];
const bgProf = (X) => pm(tinK(X), `${X}txtRDOCode`, `${X}txtTaxpayerName`, `${X}txtAddress`, `${X}txtZipCode`, `${X}txtTelNum`, `${X}txtEmail`, `${X}txtLineBus`);
const bgDefaults = (X) => ({ [`${X}optAmend:N`]: "true", [`${X}txtSheets`]: "0" });
// Part II totals + penalties + Part III payment (same item names on every new income tax form)
const partII = (X) => [
    S("Part II – Total tax payable"),
    R(`${X}taxDue`, "Tax due"), R(`${X}credits`, "Less: tax credits / payments"), R(`${X}payable`, "Tax payable / (overpayment)"),
    N(`${X}surcharge`, "Surcharge"), N(`${X}interest`, "Interest"), N(`${X}compromise`, "Compromise"),
    R(`${X}penalties`, "Total penalties"), R(`${X}total`, "Total amount payable / (overpayment)"),
];
const payPart = (X) => [
    S("Part III – Details of payment"),
    T("txtTaxAgentNo", "Tax agent accreditation no."), T("txtDateIssue", "Date of issue"), T("txtDateExpiry", "Date of expiry"),
    ...pay(X, "P1", "Cash / bank debit memo"), ...pay(X, "P2", "Check"), ...pay(X, "P3", "Tax debit memo"),
    T(`${X}txtParticularP4`, "Others (specify)"), T(`${X}txtAgencyP4`, "Agency"), T(`${X}txtNumberP4`, "Number"), T(`${X}txtDateP4`, "Date"), T(`${X}txtAmountP4`, "Amount"),
];
const overPay = (X) => [C(`${X}chkRefund`, "To be refunded"), C(`${X}chkTcc`, "To be issued a tax credit certificate"), C(`${X}chkCarry`, "To be carried over as tax credit")];
const totalsOf = (X, v, due, credits) => {
    const pen = sumOf(v, [`${X}surcharge`, `${X}interest`, `${X}compromise`]);
    return {
        [`${X}taxDue`]: f(due), [`${X}credits`]: f(credits), [`${X}payable`]: f(due - credits),
        [`${X}penalties`]: f(pen), [`${X}total`]: f(due - credits + pen),
    };
};
// individual ATC from taxpayer type + tax rate
const atcIndiv = (type, eight) => (type === "PR" ? (eight ? "II017" : "II014") : type === "ES" || type === "TR" ? "II011" : eight ? "II015" : "II012");
// corporate fiscal quarter: year ended mm/yyyy + quarter → { from, to (this quarter), start (first month of the year) }
const corpQuarter = (y, m, q) => {
    const end = `${y}-${pad(m)}`;
    const start = addM(end, -11);
    const from = addM(start, (q - 1) * 3);
    return { start, from, to: addM(from, 2), end };
};

/* ---------- 1701Q – Quarterly income tax (individuals) ---------- */
const IQ = "frm1701q:";
const IQ_QTR = [1, 2, 3].map((i) => `${IQ}optQuarter:${i}`);
const F1701Q = {
    id: "1701Q", file: "1701Q", title: "1701Q – Quarterly Income Tax Return (Individuals, Estates & Trusts)", footer: FOOT_X, custom: true,
    fields: [
        T(`${IQ}txtYear`, "1 For the year"),
        O("qtr", IQ_QTR[0], "1st", "2 Quarter"), O("qtr", IQ_QTR[1], "2nd"), O("qtr", IQ_QTR[2], "3rd"),
        ...bgFields(IQ),
        O("type", `${IQ}optType:SP`, "Single proprietor", "Taxpayer type"), O("type", `${IQ}optType:PR`, "Professional"),
        O("type", `${IQ}optType:ES`, "Estate"), O("type", `${IQ}optType:TR`, "Trust"),
        T(`${IQ}txtATC`, "ATC"), T(`${IQ}txtBirthDate`, "Date of birth"), T(`${IQ}txtCitizenship`, "Citizenship"), T(`${IQ}txtForeignTin`, "Foreign tax no."),
        O("rate", `${IQ}optRate:G`, "Graduated rates", "Tax rate"), O("rate", `${IQ}optRate:E`, "8% income tax rate"),
        O("ded", `${IQ}optDeduct:I`, "Itemized deductions", "Method of deduction"), O("ded", `${IQ}optDeduct:O`, "Optional standard deduction (40%)"),
        S("Schedule I – graduated rates"),
        N(`${IQ}s1Sales`), N(`${IQ}s1Cost`), R(`${IQ}s1Gross`), N(`${IQ}s1Itemized`), R(`${IQ}s1Osd`), R(`${IQ}s1Net`),
        N(`${IQ}s1Prev`), N(`${IQ}s1NonOp`), N(`${IQ}s1Partner`), R(`${IQ}s1Taxable`), R(`${IQ}s1Due`),
        S("Schedule II – 8% rate"),
        N(`${IQ}s2Sales`), N(`${IQ}s2NonOp`), R(`${IQ}s2Total`), N(`${IQ}s2Prev`), R(`${IQ}s2Cum`), N(`${IQ}s2Less`), R(`${IQ}s2Taxable`), R(`${IQ}s2Due`),
        S("Schedule III – tax credits / payments"),
        N(`${IQ}s3Prior`), N(`${IQ}s3PrevPay`), N(`${IQ}s3PrevCwt`), N(`${IQ}s3Cwt`), N(`${IQ}s3Filed`), N(`${IQ}s3Foreign`), N(`${IQ}s3Other`), T(`${IQ}s3OtherSpecify`), R(`${IQ}s3Total`),
        ...partII(IQ), ...payPart(IQ),
    ],
    prof: bgProf(IQ),
    defaults: (now) => {
        const q = Math.min(3, Math.max(1, curQ() - 1 || 1));
        return {
            ...bgDefaults(IQ), [`${IQ}txtYear`]: String(now.getFullYear()), ...qPatch(IQ_QTR, q),
            [`${IQ}optType:SP`]: "true", [`${IQ}optRate:G`]: "true", [`${IQ}optDeduct:I`]: "true",
            [`${IQ}txtATC`]: "II012", [`${IQ}s2Less`]: "250,000.00", [`${IQ}txtCitizenship`]: "FILIPINO",
        };
    },
    onChange: (patch, v) => {
        if (Object.keys(patch).some((k) => k.startsWith(`${IQ}optType:`) || k.startsWith(`${IQ}optRate:`))) {
            const type = ["SP", "PR", "ES", "TR"].find((t) => T_(v[`${IQ}optType:${t}`])) || "SP";
            return { [`${IQ}txtATC`]: atcIndiv(type, T_(v[`${IQ}optRate:E`])) };
        }
        return {};
    },
    compute: (v) => {
        const g = (k) => p(v[`${IQ}${k}`]);
        const osdOn = T_(v[`${IQ}optDeduct:O`]);
        const gross = g("s1Sales") - g("s1Cost");
        const osd = osdOn ? g("s1Sales") * 0.4 : 0;                       // individuals: 40% of gross sales / receipts
        const net = osdOn ? g("s1Sales") - osd : gross - g("s1Itemized");
        const taxable = net + g("s1Prev") + g("s1NonOp") + g("s1Partner");
        const dueG = gradTax(Math.max(0, taxable), v[`${IQ}txtYear`]);
        const s2Total = g("s2Sales") + g("s2NonOp"), s2Cum = s2Total + g("s2Prev"), s2Taxable = Math.max(0, s2Cum - g("s2Less")), due8 = s2Taxable * 0.08;
        const credits = sumOf(v, ["s3Prior", "s3PrevPay", "s3PrevCwt", "s3Cwt", "s3Filed", "s3Foreign", "s3Other"].map((k) => `${IQ}${k}`));
        const k = (x) => `${IQ}${x}`;
        return {
            [k("s1Gross")]: f(gross), [k("s1Osd")]: f(osd), [k("s1Net")]: f(net), [k("s1Taxable")]: f(taxable), [k("s1Due")]: f(dueG),
            [k("s2Total")]: f(s2Total), [k("s2Cum")]: f(s2Cum), [k("s2Taxable")]: f(s2Taxable), [k("s2Due")]: f(due8),
            [k("s3Total")]: f(credits),
            ...totalsOf(IQ, v, T_(v[k("optRate:E")]) ? due8 : dueG, credits),
        };
    },
    validate: (v) => {
        if (!/^\d{4}$/.test(v[`${IQ}txtYear`] || "")) return "Enter the year (item 1).";
        if (!qOf(v, IQ_QTR)) return "Choose the quarter (item 2).";
        if (!T_(v[`${IQ}optRate:G`]) && !T_(v[`${IQ}optRate:E`])) return "Choose the tax rate.";
        return tinErr(v, tinK(IQ));
    },
    filename: (v) => `${tinOf(v, tinK(IQ))}-1701Q-${v[`${IQ}txtYear`]}Q${qOf(v, IQ_QTR)}.xml`,
    autofill: async (v, af) => {
        const y = Number(v[`${IQ}txtYear`]), q = qOf(v, IQ_QTR);
        if (!y || !q) return null;
        const { from, to } = qMonths(y, q);
        const [cur, prev] = await Promise.all([
            af("income", { from, to }),
            q > 1 ? af("income", { from: `${y}-01`, to: `${y}-${pad((q - 1) * 3)}` }) : Promise.resolve(null),
        ]);
        const osdOn = T_(v[`${IQ}optDeduct:O`]);
        const prevNet = prev ? (osdOn ? prev.sales * 0.6 : prev.sales - prev.cost - prev.expenses) : 0;
        return {
            [`${IQ}s1Sales`]: f(cur.sales), [`${IQ}s1Cost`]: f(cur.cost), [`${IQ}s1Itemized`]: f(cur.expenses), [`${IQ}s1Prev`]: f(prevNet),
            [`${IQ}s2Sales`]: f(cur.sales), [`${IQ}s2Prev`]: f(prev ? prev.sales : 0),
            [`${IQ}s3Cwt`]: f(cur.cwt), [`${IQ}s3PrevCwt`]: f(prev ? prev.cwt : 0),
        };
    },
};

/* ---------- 1701 – Annual income tax (individuals) ---------- */
const IA = "frm1701:";
const F1701 = {
    id: "1701", file: "1701", title: "1701 – Annual Income Tax Return (Individuals, Estates & Trusts)", footer: FOOT_X, custom: true,
    fields: [
        T(`${IA}txtYear`, "1 For the year"),
        O("short", `${IA}optShort:Y`, "Yes", "Short period return?"), O("short", `${IA}optShort:N`, "No"),
        ...bgFields(IA),
        O("type", `${IA}optType:SP`, "Single proprietor", "Taxpayer type"), O("type", `${IA}optType:PR`, "Professional"),
        O("type", `${IA}optType:ES`, "Estate"), O("type", `${IA}optType:TR`, "Trust"), O("type", `${IA}optType:CE`, "Compensation earner"),
        T(`${IA}txtATC`, "ATC"), T(`${IA}txtBirthDate`, "Date of birth"), T(`${IA}txtCitizenship`, "Citizenship"), T(`${IA}txtForeignTin`, "Foreign tax no."),
        O("rate", `${IA}optRate:G`, "Graduated rates", "Tax rate"), O("rate", `${IA}optRate:E`, "8% income tax rate"),
        O("ded", `${IA}optDeduct:I`, "Itemized deductions", "Method of deduction"), O("ded", `${IA}optDeduct:O`, "Optional standard deduction (40%)"),
        S("Compensation income"),
        N(`${IA}compGross`), N(`${IA}compNonTax`), R(`${IA}compTaxable`), N(`${IA}compWithheld`),
        S("Graduated rates"),
        N(`${IA}aSales`), N(`${IA}aCost`), R(`${IA}aGross`), N(`${IA}aNonOp`), R(`${IA}aTotalGross`), N(`${IA}aItemized`), R(`${IA}aOsd`),
        R(`${IA}aNet`), N(`${IA}aPartner`), R(`${IA}aTaxable`), R(`${IA}aDue`),
        S("8% rate"),
        N(`${IA}bSales`), N(`${IA}bNonOp`), R(`${IA}bTotal`), N(`${IA}bLess`), R(`${IA}bTaxable`), R(`${IA}bDue`), R(`${IA}bCompDue`), R(`${IA}bTotalDue`),
        S("Tax credits / payments"),
        N(`${IA}cPrior`), N(`${IA}cQuarterly`), N(`${IA}cCwtQ13`), N(`${IA}cCwtQ4`), R(`${IA}cComp`), N(`${IA}cFiled`), N(`${IA}cForeign`), N(`${IA}cOther`), T(`${IA}cOtherSpecify`), R(`${IA}cTotal`),
        ...partII(IA), ...overPay(IA), ...payPart(IA),
    ],
    prof: bgProf(IA),
    defaults: (now) => ({
        ...bgDefaults(IA), [`${IA}txtYear`]: String(now.getFullYear() - (now.getMonth() < 4 ? 1 : 0)), [`${IA}optShort:N`]: "true",
        [`${IA}optType:SP`]: "true", [`${IA}optRate:G`]: "true", [`${IA}optDeduct:I`]: "true", [`${IA}txtATC`]: "II012",
        [`${IA}bLess`]: "250,000.00", [`${IA}txtCitizenship`]: "FILIPINO",
    }),
    onChange: (patch, v) => {
        if (Object.keys(patch).some((k) => k.startsWith(`${IA}optType:`) || k.startsWith(`${IA}optRate:`))) {
            const type = ["SP", "PR", "ES", "TR", "CE"].find((t) => T_(v[`${IA}optType:${t}`])) || "SP";
            return { [`${IA}txtATC`]: type === "CE" ? "II011" : atcIndiv(type, T_(v[`${IA}optRate:E`])) };
        }
        return {};
    },
    compute: (v) => {
        const g = (k) => p(v[`${IA}${k}`]);
        const yr = v[`${IA}txtYear`];
        const comp = Math.max(0, g("compGross") - g("compNonTax"));
        const osdOn = T_(v[`${IA}optDeduct:O`]);
        const aGross = g("aSales") - g("aCost"), aTotalGross = aGross + g("aNonOp");
        const aOsd = osdOn ? (g("aSales") + g("aNonOp")) * 0.4 : 0;
        const aNet = osdOn ? g("aSales") + g("aNonOp") - aOsd : aTotalGross - g("aItemized");
        const aTaxable = aNet + g("aPartner") + comp;
        const aDue = gradTax(Math.max(0, aTaxable), yr);
        const bTotal = g("bSales") + g("bNonOp"), bTaxable = Math.max(0, bTotal - g("bLess")), bDue = bTaxable * 0.08;
        const bCompDue = gradTax(comp, yr), bTotalDue = bDue + bCompDue;
        const cComp = g("compWithheld");
        const credits = sumOf(v, ["cPrior", "cQuarterly", "cCwtQ13", "cCwtQ4", "cFiled", "cForeign", "cOther"].map((k) => `${IA}${k}`)) + cComp;
        const k = (x) => `${IA}${x}`;
        return {
            [k("compTaxable")]: f(comp), [k("aGross")]: f(aGross), [k("aTotalGross")]: f(aTotalGross), [k("aOsd")]: f(aOsd), [k("aNet")]: f(aNet),
            [k("aTaxable")]: f(aTaxable), [k("aDue")]: f(aDue), [k("bTotal")]: f(bTotal), [k("bTaxable")]: f(bTaxable), [k("bDue")]: f(bDue),
            [k("bCompDue")]: f(bCompDue), [k("bTotalDue")]: f(bTotalDue), [k("cComp")]: f(cComp), [k("cTotal")]: f(credits),
            ...totalsOf(IA, v, T_(v[k("optRate:E")]) ? bTotalDue : aDue, credits),
        };
    },
    validate: (v) => {
        if (!/^\d{4}$/.test(v[`${IA}txtYear`] || "")) return "Enter the year (item 1).";
        if (!T_(v[`${IA}optRate:G`]) && !T_(v[`${IA}optRate:E`])) return "Choose the tax rate.";
        return tinErr(v, tinK(IA));
    },
    filename: (v) => `${tinOf(v, tinK(IA))}-1701-FY12${v[`${IA}txtYear`]}.xml`,
    autofill: async (v, af) => {
        const y = Number(v[`${IA}txtYear`]);
        if (!y) return null;
        const [q13, q4] = await Promise.all([af("income", { from: `${y}-01`, to: `${y}-09` }), af("income", { from: `${y}-10`, to: `${y}-12` })]);
        const sales = q13.sales + q4.sales;
        return {
            [`${IA}aSales`]: f(sales), [`${IA}aCost`]: f(q13.cost + q4.cost), [`${IA}aItemized`]: f(q13.expenses + q4.expenses),
            [`${IA}bSales`]: f(sales), [`${IA}cCwtQ13`]: f(q13.cwt), [`${IA}cCwtQ4`]: f(q4.cwt),
        };
    },
};

/* ---------- 1702Q – Quarterly income tax (corporations) ---------- */
const CQ = "frm1702q:";
const CQ_YE = [[`${CQ}txtYearEndMonth`, "m"], [`${CQ}txtYearEndYear`, "y"]];
const CQ_QTR = [1, 2, 3].map((i) => `${CQ}optQuarter:${i}`);
const corpRate = (X, v) => (T_(v[`${X}optRate:S`]) ? 0.2 : T_(v[`${X}optRate:P`]) ? p(v[`${X}txtSpecialRate`]) / 100 : 0.25);
const F1702Q = {
    id: "1702Q", file: "1702Q", title: "1702Q – Quarterly Income Tax Return (Corporations & Partnerships)", footer: FOOT_X, custom: true,
    fields: [
        O("forthe", `${CQ}optFor:C`, "Calendar", "1 For the"), O("forthe", `${CQ}optFor:F`, "Fiscal"),
        MY("2 Year ended", CQ_YE),
        O("qtr", CQ_QTR[0], "1st", "3 Quarter"), O("qtr", CQ_QTR[1], "2nd"), O("qtr", CQ_QTR[2], "3rd"),
        ...bgFields(CQ),
        T(`${CQ}txtATC`, "ATC"),
        O("rate", `${CQ}optRate:R`, "Regular rate (25%)", "Income tax rate"), O("rate", `${CQ}optRate:S`, "20% (net taxable income ≤ ₱5M and total assets ≤ ₱100M)"),
        O("rate", `${CQ}optRate:P`, "Special / preferential rate"), T(`${CQ}txtSpecialRate`, "Special rate (%)"),
        O("ded", `${CQ}optDeduct:I`, "Itemized deductions", "Method of deduction"), O("ded", `${CQ}optDeduct:O`, "Optional standard deduction (40% of gross income)"),
        C(`${CQ}chkMcit`, "Subject to MCIT (4th year of operations onwards)"), T(`${CQ}txtMcitRate`, "MCIT rate (%)"),
        S("Schedule – computation of tax"),
        N(`${CQ}sSales`), N(`${CQ}sCost`), R(`${CQ}sGrossOp`), N(`${CQ}sOther`), R(`${CQ}sTotalGross`), N(`${CQ}sItemized`), R(`${CQ}sOsd`),
        R(`${CQ}sTaxableQ`), N(`${CQ}sPrev`), R(`${CQ}sTaxableTD`), R(`${CQ}sRatePct`), R(`${CQ}sRegular`),
        N(`${CQ}sPrevGross`), R(`${CQ}sMcitBase`), R(`${CQ}sMcit`), R(`${CQ}sDue`),
        S("Tax credits / payments"),
        N(`${CQ}cPrior`), N(`${CQ}cPrevPay`), N(`${CQ}cPrevMcit`), N(`${CQ}cPrevCwt`), N(`${CQ}cCwt`), N(`${CQ}cFiled`), N(`${CQ}cForeign`), N(`${CQ}cOther`), T(`${CQ}cOtherSpecify`), R(`${CQ}cTotal`),
        ...partII(CQ), ...payPart(CQ),
    ],
    prof: bgProf(CQ),
    defaults: (now) => ({
        ...bgDefaults(CQ), [`${CQ}optFor:C`]: "true", ...isoToParts(CQ_YE, `${now.getFullYear()}-12`), ...qPatch(CQ_QTR, Math.min(3, Math.max(1, curQ() - 1 || 1))),
        [`${CQ}optRate:R`]: "true", [`${CQ}optDeduct:I`]: "true", [`${CQ}txtMcitRate`]: "2", [`${CQ}txtATC`]: "IC010",
    }),
    onChange: (patch, v) => (`${CQ}optFor:C` in patch && T_(patch[`${CQ}optFor:C`])
        ? isoToParts(CQ_YE, `${Number(v[CQ_YE[1][0]]) || new Date().getFullYear()}-12`) : {}),
    compute: (v) => {
        const g = (k) => p(v[`${CQ}${k}`]);
        const grossOp = g("sSales") - g("sCost"), totalGross = grossOp + g("sOther");
        const osd = T_(v[`${CQ}optDeduct:O`]) ? totalGross * 0.4 : 0;     // corporations: 40% of gross income
        const taxableQ = totalGross - (T_(v[`${CQ}optDeduct:O`]) ? osd : g("sItemized"));
        const taxableTD = taxableQ + g("sPrev");
        const rate = corpRate(CQ, v), regular = Math.max(0, taxableTD) * rate;
        const mcitBase = totalGross + g("sPrevGross");
        const mcit = T_(v[`${CQ}chkMcit`]) ? Math.max(0, mcitBase) * p(v[`${CQ}txtMcitRate`]) / 100 : 0;
        const due = Math.max(regular, mcit);
        const credits = sumOf(v, ["cPrior", "cPrevPay", "cPrevMcit", "cPrevCwt", "cCwt", "cFiled", "cForeign", "cOther"].map((k) => `${CQ}${k}`));
        const k = (x) => `${CQ}${x}`;
        return {
            [k("sGrossOp")]: f(grossOp), [k("sTotalGross")]: f(totalGross), [k("sOsd")]: f(osd), [k("sTaxableQ")]: f(taxableQ),
            [k("sTaxableTD")]: f(taxableTD), [k("sRatePct")]: `${(rate * 100).toFixed(2)}%`, [k("sRegular")]: f(regular),
            [k("sMcitBase")]: f(mcitBase), [k("sMcit")]: f(mcit), [k("sDue")]: f(due), [k("cTotal")]: f(credits),
            ...totalsOf(CQ, v, due, credits),
        };
    },
    validate: (v) => {
        if (!partsToIso(CQ_YE, v, "month")) return "Enter the year ended (item 2).";
        if (!qOf(v, CQ_QTR)) return "Choose the quarter (item 3).";
        return tinErr(v, tinK(CQ));
    },
    filename: (v) => `${tinOf(v, tinK(CQ))}-1702Q-${pad(v[CQ_YE[0][0]])}${v[CQ_YE[1][0]]}Q${qOf(v, CQ_QTR)}.xml`,
    autofill: async (v, af) => {
        const y = Number(v[CQ_YE[1][0]]), m = Number(v[CQ_YE[0][0]]), q = qOf(v, CQ_QTR);
        if (!y || !m || !q) return null;
        const { start, from, to } = corpQuarter(y, m, q);
        const [cur, prev] = await Promise.all([
            af("income", { from, to }),
            q > 1 ? af("income", { from: start, to: addM(from, -1) }) : Promise.resolve(null),
        ]);
        const osdOn = T_(v[`${CQ}optDeduct:O`]);
        const pGross = prev ? prev.sales - prev.cost : 0;
        return {
            [`${CQ}sSales`]: f(cur.sales), [`${CQ}sCost`]: f(cur.cost), [`${CQ}sItemized`]: f(cur.expenses),
            [`${CQ}sPrev`]: f(prev ? (osdOn ? pGross * 0.6 : pGross - prev.expenses) : 0), [`${CQ}sPrevGross`]: f(pGross),
            [`${CQ}cCwt`]: f(cur.cwt), [`${CQ}cPrevCwt`]: f(prev ? prev.cwt : 0),
        };
    },
};

/* ---------- 1702RT – Annual income tax (corporations, regular rate) ---------- */
const CR = "frm1702rt:";
const CR_YE = [[`${CR}txtYearEndMonth`, "m"], [`${CR}txtYearEndYear`, "y"]];
const F1702RT = {
    id: "1702RT", file: "1702RT", title: "1702-RT – Annual Income Tax Return (Corporations, Regular Rate)", footer: FOOT_X, custom: true,
    fields: [
        O("forthe", `${CR}optFor:C`, "Calendar", "1 For the"), O("forthe", `${CR}optFor:F`, "Fiscal"),
        MY("2 Year ended", CR_YE),
        O("short", `${CR}optShort:Y`, "Yes", "Short period return?"), O("short", `${CR}optShort:N`, "No"),
        ...bgFields(CR),
        T(`${CR}txtATC`, "ATC"),
        O("rate", `${CR}optRate:R`, "Regular rate (25%)", "Income tax rate"), O("rate", `${CR}optRate:S`, "20% (net taxable income ≤ ₱5M and total assets ≤ ₱100M)"),
        O("rate", `${CR}optRate:P`, "Special / preferential rate"), T(`${CR}txtSpecialRate`, "Special rate (%)"),
        O("ded", `${CR}optDeduct:I`, "Itemized deductions", "Method of deduction"), O("ded", `${CR}optDeduct:O`, "Optional standard deduction (40% of gross income)"),
        C(`${CR}chkMcit`, "Subject to MCIT (4th year of operations onwards)"), T(`${CR}txtMcitRate`, "MCIT rate (%)"),
        S("Schedule – computation of tax"),
        N(`${CR}sSales`), N(`${CR}sReturns`), R(`${CR}sNetSales`), N(`${CR}sCost`), R(`${CR}sGrossOp`), N(`${CR}sOther`), R(`${CR}sTotalGross`),
        N(`${CR}sItemized`), R(`${CR}sOsd`), R(`${CR}sTaxable`), R(`${CR}sRatePct`), R(`${CR}sRegular`), R(`${CR}sMcit`), R(`${CR}sDue`),
        S("Tax credits / payments"),
        N(`${CR}cPrior`), N(`${CR}cQuarterly`), N(`${CR}cMcitPrev`), N(`${CR}cCwtQ13`), N(`${CR}cCwtQ4`), N(`${CR}cFiled`), N(`${CR}cForeign`), N(`${CR}cSpecial`), N(`${CR}cOther`), T(`${CR}cOtherSpecify`), R(`${CR}cTotal`),
        ...partII(CR), ...overPay(CR), ...payPart(CR),
    ],
    prof: bgProf(CR),
    defaults: (now) => ({
        ...bgDefaults(CR), [`${CR}optFor:C`]: "true", ...isoToParts(CR_YE, `${now.getFullYear() - (now.getMonth() < 4 ? 1 : 0)}-12`),
        [`${CR}optShort:N`]: "true", [`${CR}optRate:R`]: "true", [`${CR}optDeduct:I`]: "true", [`${CR}txtMcitRate`]: "2", [`${CR}txtATC`]: "IC055",
    }),
    onChange: (patch, v) => (`${CR}optFor:C` in patch && T_(patch[`${CR}optFor:C`])
        ? isoToParts(CR_YE, `${Number(v[CR_YE[1][0]]) || new Date().getFullYear()}-12`) : {}),
    compute: (v) => {
        const g = (k) => p(v[`${CR}${k}`]);
        const netSales = g("sSales") - g("sReturns"), grossOp = netSales - g("sCost"), totalGross = grossOp + g("sOther");
        const osdOn = T_(v[`${CR}optDeduct:O`]);
        const osd = osdOn ? totalGross * 0.4 : 0;
        const taxable = totalGross - (osdOn ? osd : g("sItemized"));
        const rate = corpRate(CR, v), regular = Math.max(0, taxable) * rate;
        const mcit = T_(v[`${CR}chkMcit`]) ? Math.max(0, totalGross) * p(v[`${CR}txtMcitRate`]) / 100 : 0;
        const due = Math.max(regular, mcit);
        const credits = sumOf(v, ["cPrior", "cQuarterly", "cMcitPrev", "cCwtQ13", "cCwtQ4", "cFiled", "cForeign", "cSpecial", "cOther"].map((k) => `${CR}${k}`));
        const k = (x) => `${CR}${x}`;
        return {
            [k("sNetSales")]: f(netSales), [k("sGrossOp")]: f(grossOp), [k("sTotalGross")]: f(totalGross), [k("sOsd")]: f(osd),
            [k("sTaxable")]: f(taxable), [k("sRatePct")]: `${(rate * 100).toFixed(2)}%`, [k("sRegular")]: f(regular), [k("sMcit")]: f(mcit),
            [k("sDue")]: f(due), [k("cTotal")]: f(credits), ...totalsOf(CR, v, due, credits),
        };
    },
    validate: (v) => (partsToIso(CR_YE, v, "month") ? tinErr(v, tinK(CR)) : "Enter the year ended (item 2)."),
    filename: (v) => `${tinOf(v, tinK(CR))}-1702RT-FY${pad(v[CR_YE[0][0]])}${v[CR_YE[1][0]]}.xml`,
    autofill: async (v, af) => {
        const y = Number(v[CR_YE[1][0]]), m = Number(v[CR_YE[0][0]]);
        if (!y || !m) return null;
        const end = `${y}-${pad(m)}`, start = addM(end, -11);
        const [q13, q4] = await Promise.all([af("income", { from: start, to: addM(start, 8) }), af("income", { from: addM(start, 9), to: end })]);
        return {
            [`${CR}sSales`]: f(q13.sales + q4.sales), [`${CR}sCost`]: f(q13.cost + q4.cost), [`${CR}sItemized`]: f(q13.expenses + q4.expenses),
            [`${CR}cCwtQ13`]: f(q13.cwt), [`${CR}cCwtQ4`]: f(q4.cwt),
        };
    },
};

/* ---------- 1702EX – Annual income tax (exempt corporations) ---------- */
const CX = "frm1702ex:";
const CX_YE = [[`${CX}txtYearEndMonth`, "m"], [`${CX}txtYearEndYear`, "y"]];
const F1702EX = {
    id: "1702EX", file: "1702EX", title: "1702-EX – Annual Income Tax Return (Exempt Corporations)", footer: FOOT_X, custom: true, info: true,
    fields: [
        O("forthe", `${CX}optFor:C`, "Calendar", "1 For the"), O("forthe", `${CX}optFor:F`, "Fiscal"),
        MY("2 Year ended", CX_YE),
        O("short", `${CX}optShort:Y`, "Yes", "Short period return?"), O("short", `${CX}optShort:N`, "No"),
        ...bgFields(CX),
        T(`${CX}txtATC`, "ATC"),
        T(`${CX}txtLegalBasis`, "Legal basis of tax exemption", { enc: true, wide: true }),
        T(`${CX}txtAgency`, "Investment promotion agency / government agency", { enc: true }), T(`${CX}txtRegNo`, "Registration / accreditation no."),
        T(`${CX}txtEffFrom`, "Effectivity date from"), T(`${CX}txtEffTo`, "Effectivity date to"),
        S("Schedule – exempt income"),
        N(`${CX}sSales`), N(`${CX}sCost`), R(`${CX}sGross`), N(`${CX}sOther`), R(`${CX}sTotalGross`), N(`${CX}sDeductions`), R(`${CX}sNet`),
        ...partII(CX), ...payPart(CX),
    ],
    prof: bgProf(CX),
    defaults: (now) => ({
        ...bgDefaults(CX), [`${CX}optFor:C`]: "true", ...isoToParts(CX_YE, `${now.getFullYear() - (now.getMonth() < 4 ? 1 : 0)}-12`),
        [`${CX}optShort:N`]: "true", [`${CX}txtATC`]: "IC021",
    }),
    compute: (v) => {
        const g = (k) => p(v[`${CX}${k}`]);
        const gross = g("sSales") - g("sCost"), totalGross = gross + g("sOther"), net = totalGross - g("sDeductions");
        return {
            [`${CX}sGross`]: f(gross), [`${CX}sTotalGross`]: f(totalGross), [`${CX}sNet`]: f(net),
            ...totalsOf(CX, v, 0, 0),                     // exempt: no income tax due, only penalties when filed late
        };
    },
    validate: (v) => {
        if (!partsToIso(CX_YE, v, "month")) return "Enter the year ended (item 2).";
        if (!(v[`${CX}txtLegalBasis`] || "").trim()) return "Enter the legal basis of the tax exemption.";
        return tinErr(v, tinK(CX));
    },
    filename: (v) => `${tinOf(v, tinK(CX))}-1702EX-FY${pad(v[CX_YE[0][0]])}${v[CX_YE[1][0]]}.xml`,
    autofill: async (v, af) => {
        const y = Number(v[CX_YE[1][0]]), m = Number(v[CX_YE[0][0]]);
        if (!y || !m) return null;
        const end = `${y}-${pad(m)}`;
        const r = await af("income", { from: addM(end, -11), to: end });
        return { [`${CX}sSales`]: f(r.sales), [`${CX}sCost`]: f(r.cost), [`${CX}sDeductions`]: f(r.expenses) };
    },
};

/* ---------- 1604C / 1604E – Annual information returns (12 monthly remittances) ---------- */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const infoFields = (X, cols) => [
    T(`${X}txtYear`, "1 For the year"),
    ...bgFields(X),
    O("cat", `${X}optCategory:P`, "Private", "Category of withholding agent"), O("cat", `${X}optCategory:G`, "Government"),
    O("top", `${X}optTop:Y`, "Yes", "Top withholding agent?"), O("top", `${X}optTop:N`, "No"),
    S("Part II – Summary of remittances per month"),
    ...range(1, 12).flatMap((m) => [
        T(`${X}r${m}Date`, `${MONTHS[m - 1]} – date of remittance`), T(`${X}r${m}Bank`, "Drawee bank / bank code / agency"), T(`${X}r${m}Ror`, "TRA / eROR / eAR no."),
        ...cols.map((c) => (c === "Total" ? R(`${X}r${m}${c}`) : N(`${X}r${m}${c}`))),
    ]),
    ...cols.map((c) => R(`${X}tot${c}`)),
];
const infoCompute = (X, cols) => (v) => {
    const out = {};
    const add = cols.filter((c) => c !== "Total");
    range(1, 12).forEach((m) => { out[`${X}r${m}Total`] = f(sumOf(v, add.map((c) => `${X}r${m}${c}`))); });
    cols.forEach((c) => {
        out[`${X}tot${c}`] = f(range(1, 12).reduce((a, m) => a + (c === "Total" ? p(out[`${X}r${m}Total`]) : p(v[`${X}r${m}${c}`])), 0));
    });
    return out;
};
const infoDefaults = (X) => (now) => ({
    ...bgDefaults(X), [`${X}txtYear`]: String(now.getFullYear() - (now.getMonth() < 2 ? 1 : 0)), [`${X}optCategory:P`]: "true", [`${X}optTop:N`]: "true",
});
const infoValidate = (X) => (v) => {
    if (!/^\d{4}$/.test(v[`${X}txtYear`] || "")) return "Enter the year (item 1).";
    if (!T_(v[`${X}optCategory:P`]) && !T_(v[`${X}optCategory:G`])) return "Choose the category of withholding agent.";
    return tinErr(v, tinK(X));
};

const PC = "frm1604c:";
const PC_COLS = ["Tax", "Adj", "Pen", "Total"];
const F1604C = {
    id: "1604C", file: "1604C", title: "1604-C – Annual Information Return of Income Taxes Withheld on Compensation", footer: FOOT_X, custom: true, info: true,
    fields: [
        ...infoFields(PC, PC_COLS),
        S("Year-end adjustment"),
        O("ref", `${PC}optRefund:Y`, "Yes", "Refund released to employees (over-withholding)?"), O("ref", `${PC}optRefund:N`, "No"),
        T(`${PC}txtRefundDate`, "Date of refund"), N(`${PC}txtOverRemit`, "Total amount of over-remittance"), T(`${PC}txtFirstCredit`, "Month of first crediting of over-remittance"),
    ],
    prof: bgProf(PC),
    defaults: (now) => ({ ...infoDefaults(PC)(now), [`${PC}optRefund:N`]: "true" }),
    compute: infoCompute(PC, PC_COLS),
    validate: infoValidate(PC),
    filename: (v) => `${tinOf(v, tinK(PC))}-1604C-FY12${v[`${PC}txtYear`]}.xml`,
    // from the saved 1601-C returns of that year: taxes withheld for remittance (27) + adjustment (26) + penalties (35)
    autofill: async (v, af) => {
        const y = Number(v[`${PC}txtYear`]);
        if (!y) return null;
        const r = await af("saved_months", { form: "1601Cv2018", year: String(y), keys: "frm1601c:txtTax25,frm1601c:txtTax26,frm1601c:txtTax35" });
        const out = {};
        range(1, 12).forEach((m) => {
            const row = r.values?.[pad(m)];
            if (!row) return;
            out[`${PC}r${m}Tax`] = f(p(row["frm1601c:txtTax25"]));
            out[`${PC}r${m}Adj`] = f(p(row["frm1601c:txtTax26"]));
            out[`${PC}r${m}Pen`] = f(p(row["frm1601c:txtTax35"]));
        });
        return out;
    },
};

const PE = "frm1604e:";
const PE_COLS = ["Tax", "Pen", "Total"];
const F1604E = {
    id: "1604E", file: "1604E", title: "1604-E – Annual Information Return of Creditable Income Taxes Withheld (Expanded)", footer: FOOT_X, custom: true, info: true,
    fields: infoFields(PE, PE_COLS),
    prof: bgProf(PE),
    defaults: infoDefaults(PE),
    compute: infoCompute(PE, PE_COLS),
    validate: infoValidate(PE),
    filename: (v) => `${tinOf(v, tinK(PE))}-1604E-FY12${v[`${PE}txtYear`]}.xml`,
    // taxes withheld per month from the books (2307 on purchases / expenses)
    autofill: async (v, af) => {
        const y = Number(v[`${PE}txtYear`]);
        if (!y) return null;
        const r = await af("ewt_months", { from: `${y}-01`, to: `${y}-12` });
        return Object.fromEntries(range(1, 12).map((m) => [`${PE}r${m}Tax`, f(r.values?.[`${y}-${pad(m)}`] || 0)]));
    },
};

/* ---------- 2200M – Excise tax return for mineral products (monthly) ---------- */
const XM = "frm2200m:";
const XM_MY = [[`${XM}txtMonth`, "m"], [`${XM}txtYear`, "y"]];
const F2200M = {
    id: "2200M", file: "2200M", title: "2200-M – Excise Tax Return for Mineral Products", footer: FOOT_X, custom: true,
    fields: [
        MY("1 For the month", XM_MY),
        ...bgFields(XM),
        T(`${XM}txtATC`, "ATC"),
        O("kind", `${XM}optKind:P`, "Producer / processor", "Taxpayer is"), O("kind", `${XM}optKind:I`, "Importer"), O("kind", `${XM}optKind:O`, "Others"),
        S("Part II – Computation of tax"),
        ...range(1, 5).flatMap((i) => [
            T(`${XM}r${i}Desc`, `Mineral product ${i}`, { enc: true }), T(`${XM}r${i}Unit`, "Unit"), N(`${XM}r${i}Qty`, "Quantity / volume", { blank: "" }),
            N(`${XM}r${i}Value`, "Actual market value / gross output"), T(`${XM}r${i}Rate`, "Tax rate (%)"), R(`${XM}r${i}Due`, "Excise tax due"),
        ]),
        R(`${XM}totValue`), R(`${XM}totDue`),
        N(`${XM}cFiled`, "Less: tax paid in return previously filed"), N(`${XM}cOther`, "Other tax credits / payments"), T(`${XM}cOtherSpecify`), R(`${XM}cTotal`),
        ...partII(XM), ...payPart(XM),
    ],
    prof: bgProf(XM),
    defaults: (now) => ({
        ...bgDefaults(XM), ...isoToParts(XM_MY, ym(new Date(now.getFullYear(), now.getMonth() - 1, 1))),
        [`${XM}optKind:P`]: "true", [`${XM}r1Rate`]: "4", [`${XM}txtATC`]: "XM080",
    }),
    compute: (v) => {
        const out = {};
        let value = 0, due = 0;
        range(1, 5).forEach((i) => {
            const d = p(v[`${XM}r${i}Value`]) * p(v[`${XM}r${i}Rate`]) / 100;
            out[`${XM}r${i}Due`] = f(d);
            value += p(v[`${XM}r${i}Value`]); due += d;
        });
        const credits = sumOf(v, [`${XM}cFiled`, `${XM}cOther`]);
        return { ...out, [`${XM}totValue`]: f(value), [`${XM}totDue`]: f(due), [`${XM}cTotal`]: f(credits), ...totalsOf(XM, v, due, credits) };
    },
    validate: (v) => (partsToIso(XM_MY, v, "month") ? tinErr(v, tinK(XM)) : "Enter the month (item 1)."),
    filename: (v) => `${tinOf(v, tinK(XM))}-2200M-${pad(v[XM_MY[0][0]])}${v[XM_MY[1][0]]}.xml`,
};

/* =========================================================
   registry + shared helpers
   ========================================================= */
export const FORMS = [F0605, F0619E, F1601C, F1601EQ, F1604C, F1604E, F1701Q, F1701, F1702Q, F1702RT, F1702EX, F2200M, F2550M, F2550Q, F2551Q];

/** compliance code of a form (what Client → Classification & Compliance uses): 2550Qv2024 → 2550Q */
export const complianceCode = (form) => String(form.id).replace(/v\d{4}$/i, "").toUpperCase();
export const formById = (id) => FORMS.find((x) => x.id === id);

const keysOf = (fl) => (fl.parts ? fl.parts.map(([k]) => k) : fl.k ? [fl.k] : []);

export function blank(form) {
    const v = { __sched3: [] };
    form.fields.forEach((fl) => {
        if (fl.t === "const" || fl.t === "section" || fl.t === "sched3") return;
        keysOf(fl).forEach((k) => { v[k] = fl.t === "opt" || fl.t === "check" ? "false" : ""; });
    });
    return v;
}

export function fromProfile(form, profile) {
    const out = {};
    Object.entries(form.prof || {}).forEach(([pk, keys]) => {
        let val = profile?.[pk] ?? "";
        if (pk === "lob") { try { val = decodeURIComponent(val); } catch { /* keep */ } }
        keys.filter(Boolean).forEach((k) => { out[k] = val; });
    });
    return out;
}

export function fromFile(form, data) {
    const v = blank(form);
    form.fields.forEach((fl) => {
        keysOf(fl).forEach((k) => { if (fl.t !== "const" && data[k] !== undefined) v[k] = data[k]; });
    });
    if (form.fields.some((fl) => fl.t === "sched3")) {
        const rows = [];
        for (let i = 0; data[`txtNameWithHoldingAgent${30 + i}`] !== undefined; i++) {
            rows.push({
                from: data[`txtDateCovered${30 + i}`] || "", to: data[`txtDateCovered3To${i}`] || "",
                name: data[`txtNameWithHoldingAgent${30 + i}`] || "",
                income: data[`txtIncomePayment${30 + i}`] || "0.00", tax: data[`txtTotalTaxWithHeld${30 + i}`] || "0.00",
            });
        }
        v.__sched3 = rows;
    }
    return v;
}

export function buildXml(form, v) {
    let xml = "<" + "?xml version='1.0'?>\t\n";
    const add = (k, val) => { xml += `\t\t\t<div>${k}=${val ?? ""}${k}=</div>\t\n`; };
    form.fields.forEach((fl) => {
        switch (fl.t) {
            case "section": break;
            case "text": add(fl.k, fl.enc ? encodeURIComponent(v[fl.k] ?? "") : v[fl.k] ?? ""); break;
            case "select": add(fl.k, v[fl.k] || "0"); break;
            case "num": add(fl.k, v[fl.k] === "" || v[fl.k] == null ? (fl.blank ?? "0.00") : v[fl.k]); break;
            case "opt": case "check": add(fl.k, v[fl.k] === "true" ? "true" : "false"); break;
            case "const": add(fl.k, typeof fl.v === "function" ? fl.v(v) : fl.v); break;
            case "date": case "month": fl.parts.forEach(([k]) => add(k, v[k] ?? "")); break;
            case "sched3":
                (v.__sched3 || []).forEach((r, i) => {
                    add(`txtDateCovered${30 + i}`, r.from || "");
                    add(`txtDateCovered3To${i}`, r.to || "");
                    add(`txtNameWithHoldingAgent${30 + i}`, r.name || "");
                    add(`txtIncomePayment${30 + i}`, r.income || "0.00");
                    add(`txtTotalTaxWithHeld${30 + i}`, r.tax || "0.00");
                });
                break;
            default: break;
        }
    });
    return xml + form.footer;
}