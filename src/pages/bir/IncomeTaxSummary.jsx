import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Modal from "../../components/Modal";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => `${((Number(v) || 0) * 100).toFixed(2)}%`;
const monLabel = (ym) => MON[+ym.slice(5) - 1];
const rangeText = (a, b) => (a && b ? `${MON[+a.slice(5) - 1]} - ${MON[+b.slice(5) - 1]} ${b.slice(0, 4)}` : "");

let seq = 0;
const newUid = () => `r${++seq}`;

/* ---------- editable money box (keeps focus while typing) ---------- */
function MoneyInput({ value, onChange, allowNegative = true, adj = false, label }) {
    const [draft, setDraft] = useState(null);
    return (
        <input
            className={`xl-input num its-in ${adj ? "its-adj" : ""}`}
            inputMode="decimal"
            aria-label={label}
            value={draft ?? n2(value)}
            onFocus={(e) => { setDraft(value ? String(value) : ""); requestAnimationFrame(() => e.target.select()); }}
            onChange={(e) => {
                let t = e.target.value.replace(allowNegative ? /[^\d.-]/g : /[^\d.]/g, "");
                t = t.replace(/(?!^)-/g, "").replace(/(\..*)\./g, "$1");
                setDraft(t);
                onChange(Number(t) || 0);
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
    );
}

/* ---------- helpers ---------- */
const zeroValues = (months = []) => Object.fromEntries(months.map((m) => [m, 0]));
const manualRow = (type, months) => ({
    uid: newUid(), type, manual: true, code: "", label: "", values: zeroValues(months), refs: {}, total: 0, adjustment: 0, nonvat: 0,
});

const fromApi = (r) => ({
    sales: r.sales.map((x) => ({ ...x, uid: newUid() })),
    purchases: [manualRow("COGS", r.months), ...r.purchases.map((x) => ({ ...x, uid: newUid() }))],
    expenses: [manualRow("EXP", r.months), ...r.expenses.map((x) => ({ ...x, uid: newUid() }))],
    beg: { total: r.beginning, adjustment: 0 },
    end: { total: 0, adjustment: 0 },
    other: { total: 0, adjustment: 0 },
    taxPrev: { total: 0, adjustment: 0 },
    cwPrev: { total: 0, adjustment: 0 },
    cw2307: { total: r.ewt2307, adjustment: 0 },
});

// saved adjustments get fresh row ids
const withNewUids = (st) => ({
    ...st,
    sales: (st.sales || []).map((x) => ({ ...x, uid: newUid() })),
    purchases: (st.purchases || []).map((x) => ({ ...x, uid: newUid() })),
    expenses: (st.expenses || []).map((x) => ({ ...x, uid: newUid() })),
});

/**
 * a saved adjustment → { months, st } or null
 * accepts: { months, st } · the same as a JSON string · an older save that is the statement itself ({ sales, purchases, … })
 */
const parseSaved = (raw, fallbackMonths) => {
    let d = raw;
    if (typeof d === "string") {
        try { d = JSON.parse(d); } catch { return null; }
    }
    if (!d || typeof d !== "object") return null;
    const st = d.st && typeof d.st === "object" ? d.st : (Array.isArray(d.sales) ? d : null);
    if (!st) return null;
    const row = (r) => ({
        ...r, values: r?.values || {}, refs: r?.refs || {},
        total: Number(r?.total) || 0, adjustment: Number(r?.adjustment) || 0, nonvat: Number(r?.nonvat) || 0,
    });
    const field = (f) => ({ total: Number(f?.total) || 0, adjustment: Number(f?.adjustment) || 0 });
    const rows = [...(st.sales || []), ...(st.purchases || []), ...(st.expenses || [])];
    const months = Array.isArray(d.months) && d.months.length
        ? d.months
        : [...new Set(rows.flatMap((r) => Object.keys(r?.values || {})))].sort();
    return {
        months: months.length ? months : fallbackMonths,
        st: {
            sales: (st.sales || []).map(row), purchases: (st.purchases || []).map(row), expenses: (st.expenses || []).map(row),
            beg: field(st.beg), end: field(st.end), other: field(st.other),
            taxPrev: field(st.taxPrev), cwPrev: field(st.cwPrev), cw2307: field(st.cw2307),
        },
    };
};

const sumRows = (rows = [], months = []) => {
    const values = zeroValues(months);
    let total = 0, adjustment = 0;
    rows.forEach((r) => {
        months.forEach((m) => { values[m] += Number(r.values?.[m]) || 0; });
        total += Number(r.total) || 0;
        adjustment += Number(r.adjustment) || 0;
    });
    return { values, total, adjustment };
};

/* ---------- all the totals (same rules as the old page) ---------- */
function calc(st, months, brackets, corporate) {
    const S = sumRows(st.sales, months);
    const P = sumRows(st.purchases, months);
    const E = sumRows(st.expenses, months);
    const per = (f) => Object.fromEntries(months.map((m) => [m, f(m)]));

    const cogas = { values: P.values, subtotal: P.total + st.beg.total, adjustment: P.adjustment + st.beg.adjustment };
    cogas.total = cogas.subtotal + cogas.adjustment;

    const gross = per((m) => S.values[m] - P.values[m]);
    const subCOGS = P.total + st.beg.total - st.end.total;
    const adjCOGS = P.adjustment + st.beg.adjustment - st.end.adjustment;
    const subGross = S.total - subCOGS;
    const adjGross = S.adjustment - adjCOGS;
    const subSubj = subGross - E.total;
    const adjSubj = adjGross - E.adjustment;
    const subTaxable = subSubj + st.other.total;
    const adjTaxable = adjSubj + st.other.adjustment;
    const taxable = subTaxable + adjTaxable;

    let amount = 0, bracket = null, rate = 0, excess = 0;
    if (corporate) {
        rate = 0.2;
        excess = taxable;
        amount = taxable * 0.2;
    } else {
        // top bracket = no upper limit: max empty / 0 / not above min counts as "and above"
        const open = (b) => b.max === null || b.max === "" || !(Number(b.max) > Number(b.min));
        const list = [...(brackets || [])].map((b) => ({ ...b, min: Number(b.min) || 0, max: open(b) ? null : Number(b.max), base: Number(b.base) || 0, rate: Number(b.rate) || 0 }))
            .sort((x, y) => x.min - y.min);
        bracket = list.find((b) => taxable >= b.min && (b.max === null || taxable < b.max))
            // above every limit → the highest bracket ("8,000,000 and above")
            || (list.length && taxable >= list[list.length - 1].min ? list[list.length - 1] : null);
        if (bracket) {
            rate = bracket.rate;
            excess = taxable - bracket.min;
            amount = excess * bracket.rate + bracket.base;
        }
    }

    const credits =
        st.taxPrev.total + st.taxPrev.adjustment +
        st.cwPrev.total + st.cwPrev.adjustment +
        st.cw2307.total + st.cw2307.adjustment;

    const salesAll = S.total + S.adjustment;
    const grossAll = subGross + adjGross;

    return {
        S, P, E, cogas,
        totalCOGS: { values: P.values, subtotal: subCOGS, adjustment: adjCOGS, total: subCOGS + adjCOGS },
        gross: { values: gross, subtotal: subGross, adjustment: adjGross, total: grossAll },
        gpr: {
            values: per((m) => (S.values[m] ? gross[m] / S.values[m] : 0)),
            subtotal: S.total ? subGross / S.total : 0,
            adjustment: null,
            total: salesAll ? grossAll / salesAll : 0,
        },
        subject: { values: per((m) => gross[m] - E.values[m]), subtotal: subSubj, adjustment: adjSubj, total: subSubj + adjSubj },
        taxable: { values: per((m) => gross[m] - E.values[m]), subtotal: subTaxable, adjustment: adjTaxable, total: taxable },
        tax: { amount, bracket, rate, excess, corporate },
        payable: amount - credits,
    };
}

/* =========================================================
   BIR & Tax → Income Tax Summary
   ========================================================= */
/**
 * BIR & Tax → Income Tax Summary.
 * <IncomeTaxSummary embedded userIds="12,15" from="2026-01" to="2026-10" />
 *   = the same statement for one client (Reports → Income Summary popup):
 *     no From / To / Branch, scoped to those logins. Ends at Income Tax Payable (excess), like the page.
 */
export default function IncomeTaxSummary({ embedded = false, userIds = "", from: fixedFrom = "", to: fixedTo = "" }) {
    const { user } = useAuth();
    const notify = useToast();
    const { from: pFrom, to: pTo } = usePeriod();
    const scope = embedded ? { user_ids: userIds } : {};

    const [from, setFrom] = useState(embedded ? fixedFrom : pFrom.slice(0, 7));
    const [to, setTo] = useState(embedded ? fixedTo : pTo.slice(0, 7));
    const [branch, setBranch] = useState("all");

    const [info, setInfo] = useState(null);     // company, branches, brackets, corporate
    const [months, setMonths] = useState([]);
    const [st, setSt] = useState(null);         // the editable statement
    const [used, setUsed] = useState(null);     // filters behind what's shown
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [docs, setDocs] = useState(null);         // documents popup
    const [nonVat, setNonVat] = useState(null);     // non-VAT popup
    const [move, setMove] = useState(null);         // confirm move
    const [saveAsk, setSaveAsk] = useState(null);   // existing version → ask
    const [picker, setPicker] = useState(null);     // several saved versions
    const [busy, setBusy] = useState(false);
    const [printing, setPrinting] = useState(false);

    useEffect(() => {
        if (embedded) return;
        setFrom(pFrom.slice(0, 7));
        setTo(pTo.slice(0, 7));
    }, [pFrom, pTo, embedded]);

    const load = useCallback(async () => {
        if (!from || !to) return setError("Choose both months.");
        setLoading(true);
        setError("");
        try {
            const r = await apiFetch(`/reports/income-tax-summary?${new URLSearchParams({ from, to, branch, ...scope })}`);
            setInfo({ company: r.company, branches: r.branches, brackets: r.brackets, corporate: r.corporate });
            setMonths(r.months);
            setSt(fromApi(r));
            setUsed({ from, to, branch });
        } catch (e) {
            setError(e.message || "Couldn't load the income tax summary.");
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to, branch, embedded, userIds]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [user?.id, user?.caid, embedded ? userIds : ""]);

    const c = useMemo(
        () => (st && info ? calc(st, months, info.brackets, info.corporate) : null),
        [st, info, months]
    );

    /* ---------- edits ---------- */
    const patchRow = (sec, uid, patch) =>
        setSt((s) => ({ ...s, [sec]: s[sec].map((r) => (r.uid === uid ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r)) }));

    const setManualValue = (sec, uid, m, v) =>
        patchRow(sec, uid, (r) => {
            const values = { ...r.values, [m]: v };
            return { values, total: Object.values(values).reduce((a, x) => a + (Number(x) || 0), 0) };
        });

    const patchField = (key, patch) => setSt((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

    const doMove = () => {
        const { from: f, uid } = move;
        const t = f === "expenses" ? "purchases" : "expenses";
        setSt((s) => {
            const row = s[f].find((r) => r.uid === uid);
            return row ? { ...s, [f]: s[f].filter((r) => r.uid !== uid), [t]: [...s[t], row] } : s;
        });
        setMove(null);
    };

    /* ---------- popups ---------- */
    const openDocs = async (type, refs, title) => {
        if (!refs) return;
        setDocs({ title, rows: null });
        try {
            const rows = await apiFetch(`/reports/income-tax-summary/docs?${new URLSearchParams({ type, refs, branch: used.branch, ...scope })}`);
            setDocs({ title, rows });
        } catch (e) {
            setDocs({ title, rows: [], error: e.message || "Couldn't load the documents." });
        }
    };

    const openNonVat = async (row) => {
        setNonVat({ row, list: null, checked: {} });
        try {
            const list = await apiFetch(`/reports/income-tax-summary/nonvat?${new URLSearchParams({
                account_code: row.code, from: used.from, to: used.to, branch: used.branch, ...scope,
            })}`);
            setNonVat({ row, list, checked: {} });
        } catch (e) {
            setNonVat({ row, list: [], checked: {}, error: e.message || "Couldn't load the Non-VAT list." });
        }
    };

    const nonVatTotal = nonVat?.list ? nonVat.list.filter((x) => nonVat.checked[x.id]).reduce((a, x) => a + x.amount, 0) : 0;

    const submitNonVat = () => {
        if (!nonVatTotal) return notify("Tick at least one item to undeclare.", "error");
        patchRow("expenses", nonVat.row.uid, (r) => ({ adjustment: (Number(r.adjustment) || 0) - nonVatTotal }));
        notify(`Adjustment applied: ${n2(-nonVatTotal)}`);
        setNonVat(null);
    };

    /* ---------- save / load adjustments ---------- */
    const save = async (mode) => {
        setSaveAsk(null);
        setBusy(true);
        try {
            const r = await apiFetch("/reports/income-tax-summary/adjustments", {
                method: "POST",
                body: JSON.stringify({ from: used.from, to: used.to, mode, data: { months, st }, ...scope }),
            });
            notify(`Adjustment saved for ${rangeText(used.from, used.to)} (Version ${r.version}).`);
        } catch (e) {
            notify(e.message || "Couldn't save the adjustment.", "error");
        } finally {
            setBusy(false);
        }
    };

    const askSave = async () => {
        if (!st) return notify("Load the report first.", "error");
        setBusy(true);
        try {
            const list = await apiFetch(`/reports/income-tax-summary/adjustments?${new URLSearchParams({ from: used.from, to: used.to, ...scope })}`);
            const mine = list.find((x) => x.mine);
            if (mine) setSaveAsk(mine);
            else await save("new_version");
        } catch (e) {
            notify(e.message || "Couldn't check saved adjustments.", "error");
        } finally {
            setBusy(false);
        }
    };

    const apply = (item) => {
        const saved = parseSaved(item?.data, months);
        if (!saved) {
            notify(`Version ${item?.version ?? ""} can't be opened: the saved data is empty or not in the expected format.`, "error");
            return;
        }
        setMonths(saved.months);
        setSt(withNewUids(saved.st));
        setPicker(null);
        notify(`Loaded Version ${item.version} by ${item.employee}.`);
    };

    const loadSaved = async () => {
        setBusy(true);
        try {
            const list = await apiFetch(`/reports/income-tax-summary/adjustments?${new URLSearchParams({ from, to, ...scope })}`);
            if (!list.length) notify("Nothing saved for this period yet.", "error");
            else if (list.length === 1) {
                if (!info) await load();
                setUsed((u) => ({ ...(u || {}), from, to, branch }));
                apply(list[0]);
            } else setPicker(list);
        } catch (e) {
            notify(e.message || "Couldn't load saved adjustments.", "error");
        } finally {
            setBusy(false);
        }
    };

    /* ---------- Print (old: table rows → tbl2_income_statement_report → merge.php + IncomeStatement.xlsx) ---------- */
    const printRows = () => {
        const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
        const blank = months.map(() => "");
        const out = [];
        const add = (k, c) => out.push({ k, c });
        const line = (k, label, values, sub, adj, total, isPct) => {
            const f = (v) => (isPct ? `${((Number(v) || 0) * 100).toFixed(2)}%` : r2(v));
            add(k, [label, ...(values ? months.map((m) => f(values[m])) : blank), f(sub), adj == null ? "" : f(adj), f(total)]);
        };
        const rowLine = (r) => line("row", r.label || "(manual)", r.values, r.total, r.adjustment, r.total + r.adjustment);
        const fieldLine = (label, f) => line("row", label, null, f.total, f.adjustment, f.total + f.adjustment);
        const calcLine = (k, label, x, isPct) => line(k, label, x.values, x.subtotal, x.adjustment, x.total, isPct);
        const totalOnly = (k, label, value) => add(k, [label, ...blank, "", "", value === "" ? "" : r2(value)]);
        const keep = (r) => !r.manual || r.label || r.total || r.adjustment;

        add("head", ["SALES", ...months.map(monLabel), "Sub Total", "Adjustment", "Total"]);
        st.sales.filter(keep).forEach(rowLine);
        line("sum", "TOTAL SALES", c.S.values, c.S.total, c.S.adjustment, c.S.total + c.S.adjustment);
        add("sec", ["COST OF SALES"]);
        fieldLine("Merchandise Inventory, Beginning", st.beg);
        st.purchases.filter(keep).forEach(rowLine);
        calcLine("row", "Total cost of goods available for sale", c.cogas);
        fieldLine("Merchandise Inventory, Ending", st.end);
        calcLine("bold", "TOTAL COST OF GOODS SOLD", c.totalCOGS);
        calcLine("bold", "GROSS AMOUNT", c.gross);
        calcLine("row", "Gross Profit Rate", c.gpr, true);
        add("sec", ["1601-C"]);
        st.expenses.filter(keep).forEach(rowLine);
        line("sum", "TOTAL EXPENSES", c.E.values, c.E.total, c.E.adjustment, c.E.total + c.E.adjustment);
        calcLine("row", "INCOME SUBJECT TO INCOME TAX", c.subject);
        fieldLine("Add: Other Income", st.other);
        calcLine("row", "Total Taxable Income:", c.taxable);
        totalOnly("line", `Less : ${c.tax.corporate ? "—" : n2(c.tax.bracket?.min ?? 0)}`, "");
        totalOnly("line", `Excess ${c.tax.corporate ? "20% (corporate)" : pct(c.tax.rate)}`, c.tax.excess);
        totalOnly("line", "Income Tax Expense", c.tax.amount);
        fieldLine("Less: Tax Payments for the previous qtr", st.taxPrev);
        fieldLine("Creditable Withholding Tax-previous qtr", st.cwPrev);
        fieldLine("Creditable Withholding Tax-2307 for this qtr", st.cw2307);
        totalOnly("grand", "Income Tax Payable (excess)", c.payable);
        return out;
    };

    const printXlsx = async () => {
        if (!st || !c || !used) return;
        setPrinting(true);
        try {
            const { token } = await apiFetch("/print/income-tax-summary", {
                method: "POST",
                body: JSON.stringify({
                    from: used.from, to: used.to, branch: used.branch, range: rangeText(used.from, used.to), rows: printRows(),
                    ...(embedded ? { company: info?.company || null } : {}),   // popup: the header is the client's, not mine
                }),
            });
            const blob = await apiBlob(`/print/income-tax-summary/${token}`);
            const name = `IncomeStatement-${user?.username || user?.id || ""}.xlsx`;
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement("a"), { href: url, download: name });
            document.body.append(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            notify(e.message || "Couldn't print the income tax summary.", "error");
        } finally {
            setPrinting(false);
        }
    };

    /* ---------- table pieces (plain functions, not components) ---------- */
    const cols = months.length + 4;
    const dash = () => months.map((m) => <td key={m} className="ta-center muted">—</td>);
    const empty = () => months.map((m) => <td key={m} />);

    const drillRow = (sec, r) => {
        if (r.manual) {
            return (
                <tr key={r.uid} className="its-manual">
                    <td className="its-label">
                        <input className="xl-input its-in its-name" placeholder="+ Add item" value={r.label}
                            onChange={(e) => patchRow(sec, r.uid, { label: e.target.value })} aria-label="Item name" />
                    </td>
                    {months.map((m) => (
                        <td key={m}><MoneyInput value={r.values[m]} allowNegative={false} label={`${monLabel(m)} amount`} onChange={(v) => setManualValue(sec, r.uid, m, v)} /></td>
                    ))}
                    <td className="ta-right mono">{n2(r.total)}</td>
                    <td><MoneyInput value={r.adjustment} adj label="Adjustment" onChange={(v) => patchRow(sec, r.uid, { adjustment: v })} /></td>
                    <td className="ta-right mono strong">{n2(r.total + r.adjustment)}</td>
                </tr>
            );
        }
        const isNonVat = sec === "expenses" && r.nonvat > 0;
        return (
            <tr key={r.uid} className={isNonVat ? "its-nonvat" : ""}>
                <td className="its-label">
                    {isNonVat ? (
                        <button type="button" className="its-name-btn" onClick={() => openNonVat(r)} title="Choose Non-VAT items to undeclare">
                            <i>{r.label}</i>
                        </button>
                    ) : <i>{r.label}</i>}
                    {isNonVat && <span className="its-chip its-chip-red">NV {n2(r.nonvat)}</span>}
                    {sec !== "sales" && (
                        <button type="button" className="its-chip no-print" onClick={() => setMove({ from: sec, uid: r.uid, label: r.label })}>
                            {sec === "expenses" ? "↑ Move" : "↓ Move"}
                        </button>
                    )}
                </td>
                {months.map((m) => (
                    <td key={m} className="ta-right mono">
                        {r.values[m] && r.refs?.[m] ? (
                            <button type="button" className="vs-link" onClick={() => openDocs(r.type, r.refs[m], `${r.label} · ${monLabel(m)}`)}>{n2(r.values[m])}</button>
                        ) : n2(r.values[m])}
                    </td>
                ))}
                <td className="ta-right mono">{n2(r.total)}</td>
                <td><MoneyInput value={r.adjustment} adj label="Adjustment" onChange={(v) => patchRow(sec, r.uid, { adjustment: v })} /></td>
                <td className="ta-right mono strong">{n2(r.total + r.adjustment)}</td>
            </tr>
        );
    };

    const fieldRow = (key, label, { adjustable = true, allowNegative = false } = {}) => (
        <tr key={key}>
            <td className="its-label"><i>{label}</i></td>
            {dash()}
            <td><MoneyInput value={st[key].total} allowNegative={allowNegative} label={label} onChange={(v) => patchField(key, { total: v })} /></td>
            <td>
                {adjustable
                    ? <MoneyInput value={st[key].adjustment} adj label={`${label} adjustment`} onChange={(v) => patchField(key, { adjustment: v })} />
                    : <span className="its-ro mono">{n2(st[key].adjustment)}</span>}
            </td>
            <td className="ta-right mono strong">{n2(st[key].total + st[key].adjustment)}</td>
        </tr>
    );

    const calcRow = (key, label, x, { bold = false, percent = false } = {}) => {
        const f = percent ? pct : n2;
        return (
            <tr key={key} className={bold ? "its-bold" : ""}>
                <td className={bold ? "its-label its-center" : "its-label"}>{bold ? <b><i>{label}</i></b> : <i>{label}</i>}</td>
                {months.map((m) => <td key={m} className="ta-right mono">{f(x.values[m])}</td>)}
                <td className="ta-right mono">{f(x.subtotal)}</td>
                <td className="ta-right mono">{x.adjustment == null ? "" : f(x.adjustment)}</td>
                <td className="ta-right mono strong">{f(x.total)}</td>
            </tr>
        );
    };

    const sumRow = (key, label, x, bold = true) =>
        calcRow(key, label, { values: x.values, subtotal: x.total, adjustment: x.adjustment, total: x.total + x.adjustment }, { bold });

    const section = (label) => <tr key={`sec-${label}`} className="its-sec"><td colSpan={cols}><i>{label}</i></td></tr>;
    const gap = (k) => <tr key={k} className="its-gap"><td colSpan={cols} /></tr>;

    const lineRow = (key, left, right, value, bold = false) => (
        <tr key={key} className={bold ? "its-bold" : ""}>
            <td className={bold ? "its-label its-center" : "its-label"}>
                <div className="its-split">{left}{right !== undefined && <span className="mono">{right}</span>}</div>
            </td>
            {empty()}
            <td /><td />
            <td className={`ta-right mono ${bold ? "strong" : ""} ${bold && value < 0 ? "vs-neg" : ""}`}>{value === null ? "" : n2(value)}</td>
        </tr>
    );

    const branchOpts = [
        { value: "all", label: "All branches" },
        ...(info?.branches || []).map((b) => ({ value: String(b.id), label: b.label })),
    ];

    return (
        <section className={embedded ? "jr-card its-embedded" : "card jr-card"}>
            <header className="jr-head">
                <h2>{info?.company?.name || " "}</h2>
                {info?.company?.tin && <div className="mono">TIN : {info.company.tin}</div>}
                <div>Date : {used ? rangeText(used.from, used.to) : ""}</div>
                {info?.corporate && <div className="muted">Corporation · 20% income tax</div>}
            </header>

            <div className="jr-filters no-print">
                {!embedded && <label className="field"><span className="field-label">From</span>
                    <input type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>}
                {!embedded && <label className="field"><span className="field-label">To</span>
                    <input type="month" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>}
                {!embedded && info?.branches?.length > 1 && (
                    <div className="field jr-branch">
                        <span className="field-label">Branch</span>
                        <SearchSelect value={branch} onChange={setBranch} options={branchOpts} aria-label="Branch" />
                    </div>
                )}
                <div className="jr-btns">
                    {!embedded && <button className="btn btn-primary" onClick={load} disabled={loading}>{loading ? "Searching…" : "Search"}</button>}
                    <button className="btn" onClick={printXlsx} disabled={!st || loading || printing}>{printing ? "Printing…" : "Print"}</button>
                    <button className="btn" onClick={askSave} disabled={!st || loading || busy}>Save Adj.</button>
                    <button className="btn btn-primary-soft" onClick={loadSaved} disabled={loading || busy}>Adjusted</button>
                </div>
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

            <div className="xl-wrap its-xl">
                <div className="xl-scroll its-xl-scroll">
                    <table className="xl its-table its-xl-table">
                        <colgroup>
                            <col className="its-col-label" />
                            {months.map((m) => <col key={m} className="its-col-num" />)}
                            <col className="its-col-num" /><col className="its-col-num" /><col className="its-col-num" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="its-label"><i>SALES</i></th>
                                {months.map((m) => <th key={m} className="ta-right">{monLabel(m)}</th>)}
                                <th className="ta-right">Sub Total</th>
                                <th className="ta-right">Adjustment</th>
                                <th className="ta-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && Array.from({ length: 10 }).map((_, i) => (
                                <tr key={i}>{Array.from({ length: Math.max(cols, 6) }).map((__, j) => <td key={j}><span className="sk sk-cell" /></td>)}</tr>
                            ))}

                            {!loading && st && c && (
                                <>
                                    {st.sales.map((r) => drillRow("sales", r))}
                                    {sumRow("sales-total", "TOTAL SALES", c.S)}

                                    {section("COST OF SALES")}
                                    {fieldRow("beg", "Merchandise Inventory, Beginning")}
                                    {st.purchases.map((r) => drillRow("purchases", r))}
                                    {calcRow("cogas", "Total cost of goods available for sale", c.cogas)}
                                    {fieldRow("end", "Merchandise Inventory, Ending", { adjustable: false })}
                                    {calcRow("cogs", "TOTAL COST OF GOODS SOLD", c.totalCOGS, { bold: true })}
                                    {gap("g1")}
                                    {calcRow("gross", "GROSS AMOUNT", c.gross, { bold: true })}
                                    {calcRow("gpr", "Gross Profit Rate", c.gpr, { percent: true })}

                                    {section("1601-C")}
                                    {st.expenses.map((r) => drillRow("expenses", r))}
                                    {sumRow("exp-total", "TOTAL EXPENSES", c.E)}
                                    {calcRow("subject", "INCOME SUBJECT TO INCOME TAX", c.subject)}
                                    {fieldRow("other", "Add: Other Income", { adjustable: false, allowNegative: true })}
                                    {calcRow("taxable", "Total Taxable Income:", c.taxable)}

                                    {lineRow("less", <i>Less :</i>, c.tax.corporate ? "—" : n2(c.tax.bracket?.min ?? 0), null)}
                                    {lineRow("excess", <i>Excess</i>, c.tax.corporate ? "20% (corporate)" : pct(c.tax.rate), c.tax.excess)}
                                    {lineRow("tax", <i>Income Tax Expense</i>, undefined, c.tax.amount)}
                                    {fieldRow("taxPrev", "Less: Tax Payments for the previous qtr", { adjustable: false })}
                                    {fieldRow("cwPrev", "Creditable Withholding Tax-previous qtr")}
                                    {fieldRow("cw2307", "Creditable Withholding Tax-2307 for this qtr")}
                                    {lineRow("payable", <b><i>Income Tax Payable (excess)</i></b>, undefined, c.payable, true)}
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ---------- documents behind an amount ---------- */}
            {docs && (
                <Modal title={docs.title} onClose={() => setDocs(null)} size="xlg">
                    {docs.error && <div className="alert-error" role="alert">{docs.error}</div>}
                    <div className="its-scroll">
                        <table className="table">
                            <thead>
                                <tr><th /><th>Customer / Vendor</th><th>Invoice No</th><th>Document No</th><th>Date</th><th>Declared Month</th><th className="ta-right">Total</th><th>Module</th></tr>
                            </thead>
                            <tbody>
                                {!docs.rows && Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i}>{Array.from({ length: 8 }).map((__, j) => <td key={j}><span className="sk sk-cell" /></td>)}</tr>
                                ))}
                                {docs.rows?.length === 0 && !docs.error && <tr><td colSpan={8} className="empty">No documents.</td></tr>}
                                {docs.rows?.map((d, i) => (
                                    <tr key={i}>
                                        <td>{d.sales_id && <button className="btn btn-sm" onClick={() => window.open(`/task/sales/${d.ref}`, "_blank")}>View</button>}</td>
                                        <td>{d.name}</td><td>{d.ref}</td><td>{d.doc}</td><td>{d.date}</td><td>{d.month}</td>
                                        <td className="ta-right mono">{n2(d.total)}</td><td>{d.module}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Modal>
            )}

            {/* ---------- Non-VAT list ---------- */}
            {nonVat && (
                <Modal
                    title={`Non-VAT – ${nonVat.row.label}`}
                    onClose={() => setNonVat(null)}
                    size="xlg"
                    footer={
                        <div className="its-footer">
                            <span>Selected: <strong className="mono">{n2(nonVatTotal)}</strong></span>
                            <div>
                                <button className="btn" onClick={() => setNonVat(null)}>Close</button>
                                <button className="btn btn-primary" onClick={submitNonVat} disabled={!nonVatTotal}>Submit</button>
                            </div>
                        </div>
                    }
                >
                    {nonVat.error && <div className="alert-error" role="alert">{nonVat.error}</div>}
                    <p className="muted">Ticked items are taken out of this expense as a negative adjustment.</p>
                    <div className="its-scroll">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="its-chk">
                                        <input type="checkbox" aria-label="Select all"
                                            checked={!!nonVat.list?.length && nonVat.list.every((x) => nonVat.checked[x.id])}
                                            onChange={(e) => setNonVat((s) => ({ ...s, checked: Object.fromEntries(s.list.map((x) => [x.id, e.target.checked])) }))} />
                                    </th>
                                    <th>Vendor Name</th><th>Document No</th><th>Date</th><th>Declared Month</th><th className="ta-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!nonVat.list && Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j}><span className="sk sk-cell" /></td>)}</tr>
                                ))}
                                {nonVat.list?.length === 0 && !nonVat.error && <tr><td colSpan={6} className="empty">No Non-VAT items.</td></tr>}
                                {nonVat.list?.map((x) => (
                                    <tr key={x.id}>
                                        <td className="its-chk">
                                            <input type="checkbox" aria-label={`Select ${x.doc}`} checked={!!nonVat.checked[x.id]}
                                                onChange={(e) => setNonVat((s) => ({ ...s, checked: { ...s.checked, [x.id]: e.target.checked } }))} />
                                        </td>
                                        <td>{x.vendor}</td><td>{x.doc}</td><td>{x.date}</td><td>{x.month}</td>
                                        <td className="ta-right mono">{n2(x.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Modal>
            )}

            {/* ---------- move a row ---------- */}
            {move && (
                <ConfirmDialog
                    title={move.from === "expenses" ? "Move to Cost of Sales?" : "Move to Expenses?"}
                    message={`"${move.label}" will be moved and every total below it recalculated.`}
                    confirmLabel="Move"
                    onCancel={() => setMove(null)}
                    onConfirm={doMove}
                />
            )}

            {/* ---------- you already saved this period ---------- */}
            {saveAsk && (
                <Modal
                    title="Adjustment already exists"
                    onClose={() => setSaveAsk(null)}
                    footer={
                        <div className="its-footer-end">
                            <button className="btn" onClick={() => setSaveAsk(null)}>Cancel</button>
                            <button className="btn" onClick={() => save("continue")}>Overwrite Version {saveAsk.version}</button>
                            <button className="btn btn-primary" onClick={() => save("new_version")}>Create new version</button>
                        </div>
                    }
                >
                    <p>
                        You already saved an adjustment (Version {saveAsk.version}) for {rangeText(used.from, used.to)} on {saveAsk.date_updated !== "—" ? saveAsk.date_updated : saveAsk.date_added}.
                        Create a new version, or overwrite that one?
                    </p>
                </Modal>
            )}

            {/* ---------- pick a saved version ---------- */}
            {picker && (
                <Modal title={`Saved adjustments · ${rangeText(from, to)}`} onClose={() => setPicker(null)}>
                    <div className="its-scroll">
                        <table className="table">
                            <thead><tr><th>Employee</th><th>Date Added</th><th>Date Updated</th><th>Version</th><th /></tr></thead>
                            <tbody>
                                {picker.map((x) => (
                                    <tr key={x.id}>
                                        <td>{x.employee}{x.mine && <span className="muted"> (you)</span>}</td>
                                        <td>{x.date_added}</td><td>{x.date_updated}</td><td>{x.version}</td>
                                        <td><button className="btn btn-sm btn-primary" onClick={() => apply(x)}>Open</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Modal>
            )}
        </section>
    );
}