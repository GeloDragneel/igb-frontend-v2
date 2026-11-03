// Financial Statement as a real workbook: cells, formulas, recalculation and .xlsx download.
// Same cell addresses on screen and in the downloaded file (SFP!C14 on screen = SFP!C14 in Excel).
//   totals         =SUM(C10:C13) / =C12-C18
//   statement line =NFS!C25        (linked to its note total)
//   net income     =SI!C30         (SCE and SCF read it from the Income Statement)
//   note totals    =SUM(C20:C24)
// Needs:  npm i exceljs

const FONT = "Arial Narrow";
const NUM_FMT = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)';

export const SHEETS = [
    ["sfp", "SFP", "Financial Position"],
    ["si", "SI", "Income"],
    ["sce", "SCE", "Changes in Equity"],
    ["scf", "SCF", "Cash Flows"],
    ["nfs", "NFS", "Notes"],
];
const NAME = Object.fromEntries(SHEETS.map(([k, n]) => [k, n]));
const KEY = Object.fromEntries(SHEETS.map(([k, n]) => [n, k]));

export const colLetter = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const colNumber = (l) => l.toUpperCase().split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const addr = (c, r) => `${colLetter(c)}${r}`;
export const parseAddr = (a) => { const m = /^([A-Z]+)(\d+)$/i.exec(a); return m ? { c: colNumber(m[1]), r: Number(m[2]) } : null; };

const round0 = (v) => Math.round(Number(v) || 0);
const headerLines = (company) =>
    [company?.trade_name || company?.name, company?.trade_name && company?.name && company.trade_name !== company.name ? `( ${company.name} )` : null,
    company?.address, company?.tin ? `T.I.N. ${company.tin}` : null].filter(Boolean);

// "A S S E T S" → "ASSETS"
const cleanLabel = (s = "") => { const t = String(s); return /^(\S ){2,}\S/.test(t) ? t.split(/\s{2,}/).map((w) => w.replace(/ /g, "")).join(" ") : t; };

/* =========================================================
   BUILD: data from /reports/financial-statement → sheets of cells
   cell = { v, f?, num?, s? }   v = value or text, f = formula without "="
   ========================================================= */
export function buildWorkbook(data) {
    const years = data.years;
    const vc = years.map((_, i) => 3 + i);                         // value columns C, D …
    const heads = headerLines(data.company);
    const sheets = {};
    const links = { lines: {}, notes: {} };                          // where each line / note row landed (for PDF)

    const newSheet = (key) => {
        const sh = { key, name: NAME[key], cells: {}, rows: 0, cols: 2 + years.length, rowKind: {} };
        sheets[key] = sh;
        return sh;
    };
    const put = (sh, c, r, cell) => { sh.cells[addr(c, r)] = cell; sh.rows = Math.max(sh.rows, r); };
    const top = (sh, title, period) => {
        let r = 1;
        heads.forEach((t, i) => put(sh, 1, r++, { v: t, s: { bold: i === 0 } }));
        r++;
        put(sh, 1, r++, { v: title, s: { bold: true } });
        put(sh, 1, r++, { v: period || "" });
        put(sh, 1, r++, { v: "(in Philippine Pesos)", s: { italic: true } });
        return r + 1;
    };

    /* ---------- NFS first, so statements can point at the note totals ---------- */
    const nfs = newSheet("nfs");
    let r = top(nfs, "NOTES TO FINANCIAL STATEMENTS", data.period_text?.for_years);
    const co = data.company || {};
    const noteTitleRow = { 1: r };
    put(nfs, 1, r++, { v: "NOTE 1 | GENERAL INFORMATION", s: { bold: true } });
    put(nfs, 1, r++, { v: `${co.trade_name || co.name || "The Company"}${co.address ? ` is located at ${co.address}` : ""}${co.tin ? ` with T.I.N. ${co.tin}` : ""}.`, s: { wrap: true } });
    r++;
    noteTitleRow[2] = r;
    put(nfs, 1, r++, { v: "NOTE 2 | BASIS OF PREPARATION", s: { bold: true } });
    put(nfs, 1, r++, { v: "The financial statements have been prepared in accordance with the Philippine Financial Reporting Standard for Small Entities (PFRS for SEs), on a going concern basis, and are presented in Philippine Pesos.", s: { wrap: true } });
    r++;
    const noteTotal = {};                                            // note no → { row, total }
    for (const n of data.notes || []) {
        noteTitleRow[n.no] = r;
        put(nfs, 1, r++, { v: `NOTE ${n.no} | ${n.title}`, s: { bold: true } });
        years.forEach((y, i) => put(nfs, vc[i], r, { v: String(y), s: { bold: true, center: true, bottom: "thin" } }));
        nfs.rowKind[r] = "colhead";
        r++;
        const first = r;
        links.notes[n.no] = { rows: {} };
        for (const a of n.rows) {
            put(nfs, 1, r, { v: `${a.code}  ${a.label}`, s: { indent: 1 } });
            years.forEach((y, i) => put(nfs, vc[i], r, { v: round0(a.values[y]), num: true }));
            links.notes[n.no].rows[a.code] = r;
            r++;
        }
        put(nfs, 1, r, { v: "Total", s: { bold: true } });
        years.forEach((y, i) => {
            const L = colLetter(vc[i]);
            put(nfs, vc[i], r, n.rows.length
                ? { f: `SUM(${L}${first}:${L}${r - 1})`, v: round0(n.total[y]), num: true, s: { bold: true, top: "thin", bottom: "double" } }
                : { v: 0, num: true, s: { bold: true, top: "thin", bottom: "double" } });
        });
        nfs.rowKind[r] = "grand";
        noteTotal[n.no] = { row: r, total: n.total };
        links.notes[n.no].total = r;
        r += 2;
    }

    /* ---------- the four statements ---------- */
    const lineRow = {};                                              // "si:niat" → row
    for (const st of data.statements) {
        const sh = newSheet(st.key);
        let row = top(sh, st.title, st.period);
        put(sh, 2, row, { v: "Notes", s: { bold: true, center: true, bottom: "thin" } });
        years.forEach((y, i) => put(sh, vc[i], row, { v: String(y), s: { bold: true, center: true, bottom: "thin" } }));
        sh.rowKind[row] = "colhead";
        row++;

        const at = {};
        links.lines[st.key] = {};
        for (const l of st.lines) {
            at[l.id] = row;
            lineRow[`${st.key}:${l.id}`] = row;
            links.lines[st.key][l.id] = row;
            sh.rowKind[row] = l.kind;
            const strong = ["head", "sub", "total", "grand"].includes(l.kind) && !(l.kind === "total" && l.indent);
            if (l.kind !== "blank") put(sh, 1, row, { v: cleanLabel(l.label), s: { bold: strong, indent: l.indent || 0, head: l.kind === "head" } });
            if (l.note) put(sh, 2, row, { v: l.note, s: { center: true } });

            if (l.values) {
                const nt = l.note && noteTotal[l.note];
                const sameAsNote = nt && years.every((y) => Math.abs(round0(l.values[y]) - round0(nt.total[y])) < 1);
                const fromSI = (st.key === "sce" || st.key === "scf") && l.id === "ni" && lineRow["si:niat"];
                years.forEach((y, i) => {
                    const L = colLetter(vc[i]);
                    const val = round0(l.values[y]);
                    const s = { bold: l.kind === "grand" || (l.kind === "total" && !l.indent), top: ["total", "grand"].includes(l.kind) ? "thin" : null, bottom: l.kind === "grand" ? "double" : null };
                    let f = null;
                    if (l.of) {
                        const refs = l.of.map(([id, sign]) => [at[id], sign]).filter(([rr]) => rr);
                        const contiguous = refs.length > 1 && refs.every(([rr, sg], k) => sg > 0 && (k === 0 || rr === refs[k - 1][0] + 1));
                        f = !refs.length ? "0"
                            : contiguous ? `SUM(${L}${refs[0][0]}:${L}${refs[refs.length - 1][0]})`
                                : refs.map(([rr, sg], k) => `${sg < 0 ? "-" : k ? "+" : ""}${L}${rr}`).join("");
                    } else if (sameAsNote) {
                        f = `NFS!${L}${nt.row}`;
                    } else if (fromSI) {
                        f = `SI!${L}${lineRow["si:niat"]}`;
                    }
                    put(sh, vc[i], row, f ? { f, v: val, num: true, s } : { v: val, num: true, s });
                });
            }
            row++;
        }
        row++;
        put(sh, 1, row, { v: "See accompanying Notes to Financial Statements", s: { italic: true, small: true } });
    }

    return { years, vc, sheets, links, noteRow: noteTitleRow, company: data.company, period_text: data.period_text };
}

/* =========================================================
   CALC: evaluates every formula (cross-sheet refs, SUM, + - * / and parentheses)
   ========================================================= */
const REF_RE = /(?:'?([A-Za-z][A-Za-z0-9 ]*)'?!)?\$?([A-Z]{1,3})\$?(\d+)/g;

export function calculate(wb) {
    const out = {};                                                   // "SFP!C14" → number | string
    const busy = new Set();

    const valueOf = (sheetKey, a) => {
        const id = `${NAME[sheetKey]}!${a}`;
        if (id in out) return out[id];
        const cell = wb.sheets[sheetKey]?.cells[a];
        if (!cell) return (out[id] = 0);
        if (!cell.f) return (out[id] = cell.v ?? "");
        if (busy.has(id)) return "#CIRCULAR";
        busy.add(id);
        const v = evalFormula(cell.f, sheetKey);
        busy.delete(id);
        return (out[id] = v);
    };

    const num = (v) => (typeof v === "number" ? v : Number(String(v).replace(/,/g, "")) || 0);

    const evalFormula = (f, sheetKey) => {
        try {
            let ex = String(f).trim().replace(/^=/, "");
            // ranges → (a+b+c)
            ex = ex.replace(/(?:'?([A-Za-z][A-Za-z0-9 ]*)'?!)?\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)/g, (_, sh, c1, r1, c2, r2) => {
                const k = sh ? KEY[sh.toUpperCase()] : sheetKey;
                if (!k) throw new Error("#REF!");
                const parts = [];
                for (let c = Math.min(colNumber(c1), colNumber(c2)); c <= Math.max(colNumber(c1), colNumber(c2)); c++)
                    for (let rr = Math.min(+r1, +r2); rr <= Math.max(+r1, +r2); rr++) {
                        const v = valueOf(k, addr(c, rr));
                        if (typeof v === "string" && v.startsWith("#")) throw new Error(v);
                        parts.push(num(v));
                    }
                return `(${parts.join("+") || 0})`;
            });
            // SUM(a, b) → (a + b)
            ex = ex.replace(/SUM\(/gi, "(").replace(/,/g, "+");
            // single refs → (value)
            ex = ex.replace(REF_RE, (_, sh, c, rr) => {
                const k = sh ? KEY[sh.toUpperCase()] : sheetKey;
                if (!k) throw new Error("#REF!");
                const v = valueOf(k, `${c}${rr}`);
                if (typeof v === "string" && v.startsWith("#")) throw new Error(v);
                return `(${num(v)})`;
            });
            if (!/^[\d.+\-*/()\seE]*$/.test(ex)) return "#NAME?";
            // eslint-disable-next-line no-new-func
            const v = Function(`"use strict";return (${ex || 0});`)();
            return Number.isFinite(v) ? Math.round(v * 100) / 100 : "#DIV/0!";
        } catch (e) {
            return String(e.message || "#ERROR").startsWith("#") ? e.message : "#ERROR";
        }
    };

    for (const [k, sh] of Object.entries(wb.sheets)) for (const a of Object.keys(sh.cells)) valueOf(k, a);
    return out;
}

/* refs inside a formula on the same sheet (to outline them like Excel does) */
export function refsOf(f, sheetKey) {
    const set = new Set();
    if (!f) return set;
    String(f).replace(/(?:'?([A-Za-z][A-Za-z0-9 ]*)'?!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/g, (_, sh, c1, r1, c2, r2) => {
        if (sh && KEY[sh.toUpperCase()] !== sheetKey) return "";
        if (!c2) { set.add(`${c1}${r1}`); return ""; }
        for (let c = colNumber(c1); c <= colNumber(c2); c++) for (let rr = +r1; rr <= +r2; rr++) set.add(addr(c, rr));
        return "";
    });
    return set;
}

/* computed values back into the API shape (so the PDF prints what's on screen) */
export function toData(wb, calc, data) {
    const v = (k, a) => calc[`${NAME[k]}!${a}`];
    return {
        ...data,
        statements: data.statements.map((st) => ({
            ...st,
            lines: st.lines.map((l) => {
                const row = wb.links.lines[st.key]?.[l.id];
                if (!row) return l;
                const label = wb.sheets[st.key].cells[addr(1, row)]?.v;
                return {
                    ...l,
                    label: l.kind === "blank" ? l.label : (label ?? l.label),
                    values: l.values ? Object.fromEntries(wb.years.map((y, i) => [y, Number(v(st.key, addr(wb.vc[i], row))) || 0])) : l.values,
                };
            }),
        })),
        notes: (data.notes || []).map((n) => {
            const ln = wb.links.notes[n.no];
            if (!ln) return n;
            return {
                ...n,
                rows: n.rows.map((a) => ({ ...a, values: Object.fromEntries(wb.years.map((y, i) => [y, Number(v("nfs", addr(wb.vc[i], ln.rows[a.code]))) || 0])) })),
                total: Object.fromEntries(wb.years.map((y, i) => [y, Number(v("nfs", addr(wb.vc[i], ln.total))) || 0])),
            };
        }),
    };
}

/* =========================================================
   DOWNLOAD .xlsx — same cells, real formulas (Excel recalculates them)
   ========================================================= */
export async function downloadWorkbook(wb, calc) {
    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    book.creator = "IGB";
    book.created = new Date();
    book.calcProperties.fullCalcOnLoad = true;
    const font = (o = {}) => ({ name: FONT, size: o.small ? 10 : 12, bold: !!o.bold, italic: !!o.italic });
    const heads = headerLines(wb.company);
    const y1 = wb.years[0];

    /* cover */
    const cover = book.addWorksheet("COVER PAGE", { views: [{ showGridLines: false }] });
    cover.getColumn(1).width = 90;
    let r = 12;
    heads.forEach((t, i) => { const c = cover.getCell(r++, 1); c.value = t; c.font = font({ bold: i === 0 }); if (i === 0) c.font.size = 16; c.alignment = { horizontal: "center" }; });
    r += 4;
    [["FINANCIAL STATEMENTS", true], [`December 31, ${y1}`, false]].forEach(([t, b]) => { const c = cover.getCell(r++, 1); c.value = t; c.font = { ...font({ bold: b }), size: b ? 16 : 12 }; c.alignment = { horizontal: "center" }; });
    r += 12;
    const pc = cover.getCell(r, 1); pc.value = "PHILIPPINE CURRENCY"; pc.font = font({ bold: true }); pc.alignment = { horizontal: "center" };

    for (const [key] of SHEETS) {
        const sh = wb.sheets[key];
        if (!sh) continue;
        const ws = book.addWorksheet(sh.name, {
            views: [{ showGridLines: false }],
            pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.7, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
        });
        ws.getColumn(1).width = key === "nfs" ? 64 : 58;
        ws.getColumn(2).width = key === "nfs" ? 4 : 8;
        wb.vc.forEach((c) => (ws.getColumn(c).width = 18));

        for (const [a, cell] of Object.entries(sh.cells)) {
            const p = parseAddr(a);
            const x = ws.getCell(p.r, p.c);
            const s = cell.s || {};
            if (cell.f) {
                const res = calc[`${sh.name}!${a}`];
                x.value = { formula: cell.f, result: typeof res === "number" ? res : 0 };
            } else {
                x.value = cell.v === "" ? null : cell.v;
            }
            x.font = font(s);
            if (cell.num) x.numFmt = NUM_FMT;
            const al = {};
            if (s.indent) al.indent = s.indent * 2;
            if (s.center) al.horizontal = "center";
            if (s.wrap) { al.wrapText = true; al.vertical = "top"; }
            if (Object.keys(al).length) x.alignment = al;
            const b = {};
            if (s.top) b.top = { style: s.top };
            if (s.bottom) b.bottom = { style: s.bottom };
            if (Object.keys(b).length) x.border = b;
            if (s.wrap) {
                ws.mergeCells(p.r, 1, p.r, sh.cols);
                ws.getRow(p.r).height = String(cell.v).length > 120 ? 48 : 32;
            }
        }
    }

    const buf = await book.xlsx.writeBuffer();
    const name = `FS-${y1}_${String(wb.company?.trade_name || wb.company?.name || "Company").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}.xlsx`;
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
}