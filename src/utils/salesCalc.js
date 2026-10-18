import { round2, VAT_RATE, atcRate } from "./format";
import { REVENUE_ACCOUNTS, ATC_VT, ATC_IT } from "./accounts";

/*
  Invoice model (version 2) – prices are VAT-inclusive, like a printed sales invoice.
  line: { product, description, account, unit, qty, price, discount }
  sale: { ..., version: 2, lines, atcVT, atcVTMonth, atcIT, atcITMonth, discountType, discountAmt }

  Older records (version 1: items[], price VAT-exclusive, withVat, atc) still work.
*/

const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const rate = (list, code) => (list.find((a) => a.code === code) || { rate: 0 }).rate;

export function lineCalc(line) {
    const gross = r4((Number(line.qty) || 0) * (Number(line.price) || 0));
    const disc = r4(Number(line.discount) || 0);
    const amount = r4(gross - disc);
    const vatType = (REVENUE_ACCOUNTS.find((a) => a.code === line.account) || {}).vat || "vatable";

    const out = { total: gross, discount: disc, outputVat: 0, netOfVat: 0, vatExempt: 0, nonVat: 0, zeroRated: 0 };
    if (vatType === "vatable") {
        out.outputVat = r4((amount / (1 + VAT_RATE)) * VAT_RATE);
        out.netOfVat = r4(amount - out.outputVat);
    } else if (vatType === "exempt") out.vatExempt = amount;
    else if (vatType === "zero") out.zeroRated = amount;
    else out.nonVat = amount;
    return out;
}

// Full breakdown for the invoice page
export function invoiceCalc(sale) {
    const lines = sale.lines || [];
    const sum = (k) => r4(lines.reduce((n, l) => n + lineCalc(l)[k], 0));
    const outputVat = sum("outputVat");
    const netOfVat = sum("netOfVat");
    const vatExempt = sum("vatExempt");
    const nonVat = sum("nonVat");
    const zeroRated = sum("zeroRated");

    const subTotal = r4(netOfVat + vatExempt + nonVat + zeroRated); // net of VAT
    const wtaxVT = r4(subTotal * rate(ATC_VT, sale.atcVT));
    const wtaxIT = r4(subTotal * rate(ATC_IT, sale.atcIT));
    const discountAmt = r4(Number(sale.discountAmt) || 0);

    // Amount due = sales + output VAT − withholding − invoice discount
    const total = r4(subTotal + outputVat - wtaxVT - wtaxIT - discountAmt);

    return { outputVat, netOfVat, vatExempt, nonVat, zeroRated, subTotal, wtaxVT, wtaxIT, discountAmt, total };
}

// Same shape the list pages use: { subtotal, vat, wtax, total }
export function saleSummary(sale) {
    if (sale.version === 2) {
        const c = invoiceCalc(sale);
        return { subtotal: round2(c.subTotal), vat: round2(c.outputVat), wtax: round2(c.wtaxVT + c.wtaxIT), total: round2(c.total) };
    }
    const items = sale.items || [];
    const subtotal = round2(items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0));
    const vat = sale.withVat ? round2(subtotal * VAT_RATE) : 0;
    const wtax = round2(subtotal * atcRate(sale.atc));
    return { subtotal, vat, wtax, total: round2(subtotal + vat - wtax) };
}

// Stock lines ({ product, qty }) for either version
export const saleStockLines = (sale) =>
    (sale.version === 2 ? sale.lines : sale.items || []).filter((l) => l.product);

// Convert an old record to version 2 so it opens in the invoice page
export function toV2(sale) {
    if (sale.version === 2) return structuredClone(sale);
    const vatable = !!sale.withVat;
    return {
        ...structuredClone(sale),
        version: 2,
        declaredMonth: sale.declaredMonth || sale.date.slice(0, 7),
        docType: sale.docType || "Cash Sales Invoice",
        debitAccount: sale.debitAccount || "12102",
        currency: "PHP",
        exchangeRate: 1,
        branchCode: "0000",
        remarks: sale.notes || "",
        lines: (sale.items || []).map((i) => ({
            product: i.product,
            description: "",
            account: vatable ? "42100" : "42400",
            unit: "",
            qty: i.qty,
            price: vatable ? r4(i.price * (1 + VAT_RATE)) : i.price,
            discount: 0,
        })),
        atcVT: "",
        atcVTMonth: "",
        atcIT: sale.atc || "",
        atcITMonth: sale.atc ? sale.date.slice(0, 7) : "",
        discountType: "",
        discountAmt: 0,
    };
}

export const num4 = (n) =>
    (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });