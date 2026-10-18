import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";

const TYPES = [["purchase", "Purchases"], ["sales", "Sales"], ["expense", "Expenses"]];
const BLANK = "(Blanks)";

// kind: text = checklist, money = min/max, date / month = from/to; line = one value per account line
const COLS = [
    { key: "trans_id", label: "Transaction ID", kind: "text", sticky: true },
    { key: "date", label: "Date", kind: "date" },
    { key: "vendor", label: "Vendor/Customer", kind: "text", wide: true },
    { key: "tin", label: "TIN", kind: "text" },
    { key: "branch_code", label: "Branch Code", kind: "text" },
    { key: "tax_type", label: "Tax Type", kind: "text" },
    { key: "address", label: "Street and Barangay", kind: "text", wide: true },
    { key: "city", label: "City/Municipality/Province/Country", kind: "text", wide: true },
    { key: "document", label: "Document", kind: "text" },
    { key: "remarks", label: "Remarks", kind: "text", wide: true },
    { key: "client_branch", label: "Client Branch", kind: "text" },
    { key: "declared_month", label: "Declared Month", kind: "month" },
    { key: "tax_for", label: "Tax Declared For", kind: "text" },
    { key: "account", label: "Account Title", kind: "text", wide: true },
    { key: "currency", label: "Currency", kind: "text" },
    { key: "amount", label: "Amount", kind: "money", total: true },
    { key: "ex_rate", label: "Exchange Rate", kind: "money" },
    { key: "php", label: "PHP Amount", kind: "money", total: true },
    { key: "exempt", label: "VAT Exempt", kind: "money", total: true },
    { key: "zero", label: "Zero Rated", kind: "money", total: true },
    { key: "nonvat", label: "Non VAT", kind: "money", total: true },
    { key: "net", label: "Net of VAT", kind: "money", total: true },
    { key: "vat", label: "Input VAT", kind: "money", total: true },
    { key: "atc_vt", label: "ATC (VT/PT)", kind: "text" },
    { key: "vt2307", label: "BIR2307 (VT/PT)", kind: "money", total: true },
    { key: "vt_month", label: "2307 (VT/PT) Declared Month", kind: "month" },
    { key: "vt_remarks", label: "BIR2307 (VT/PT) Remarks", kind: "text" },
    { key: "atc_it", label: "ATC (IT)", kind: "text" },
    { key: "it2307", label: "BIR2307 (IT)", kind: "money", total: true },
    { key: "it_month", label: "2307 (IT) Declared Month", kind: "month" },
    { key: "it_remarks", label: "BIR2307 (IT) Remarks", kind: "text" },
    { key: "status", label: "Status", kind: "text" },
    { key: "entry_by", label: "Entry By", kind: "text" },
    { key: "entry_at", label: "DateTime Entry", kind: "date" },
];
const COL = Object.fromEntries(COLS.map((c) => [c.key, c]));

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d) => (d ? `${d.slice(8, 10)}-${MON[+d.slice(5, 7) - 1]}-${d.slice(2, 4)}` : "");

// a column's value(s) in a row, as strings (for checklists)
const textValues = (row, col) => [String(row[col.key] ?? "") || BLANK];
// one row per account line; transaction details repeat on every line
const MONEY = ["amount", "php", "exempt", "zero", "nonvat", "net", "vat"];
const flatten = (docs) =>
    docs.flatMap((d) => {
        const lines = d.lines?.length ? d.lines : [{}];
        return lines.map((l, i) => ({
            ...d,
            key: `${d.key}#${i}`,
            first: i === 0,                                   // counts 2307 once per transaction
            account: l.code ? (l.account ? `${l.code} - ${l.account}` : l.code) : "",
            tax_for: l.tax_for || "",
            ...Object.fromEntries(MONEY.map((k) => [k, Number(l[k]) || 0])),
            lines: undefined,
        }));
    });
// does a row pass one filter?
function passes(row, key, f) {
    const col = COL[key];
    if (f.type === "list") return textValues(row, col).some((v) => f.values.includes(v));
    if (f.type === "range") {
        const n = Number(row[key]) || 0;
        return (f.min === "" || n >= Number(f.min)) && (f.max === "" || n <= Number(f.max));
    }
    if (f.type === "dates") {
        const len = col.kind === "month" ? 7 : 10;
        const v = String(row[key] || "").slice(0, len);
        if (!v) return !f.from && !f.to;
        return (!f.from || v >= f.from) && (!f.to || v <= f.to);
    }
    return true;
}

const describe = (key, f) => {
    if (f.type === "list") return f.values.length === 1 ? f.values[0] : `${f.values.length} selected`;
    if (f.type === "range") return [f.min !== "" && `≥ ${n2(f.min)}`, f.max !== "" && `≤ ${n2(f.max)}`].filter(Boolean).join(" and ");
    return [f.from && `from ${f.from}`, f.to && `to ${f.to}`].filter(Boolean).join(" ");
};

/* =========================================================
   Header filter popup (fixed position so the table can scroll)
   ========================================================= */
function FilterPopup({ col, rect, rows, current, onApply, onClear, onClose }) {
    const ref = useRef(null);
    const [q, setQ] = useState("");

    // checklist values with counts, from rows that pass the OTHER filters
    const options = useMemo(() => {
        if (col.kind !== "text") return [];
        const counts = new Map();
        rows.forEach((r) => new Set(textValues(r, col)).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
        return [...counts.entries()].sort((a, b) =>
            a[0] === BLANK ? 1 : b[0] === BLANK ? -1 : a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" }));
    }, [rows, col]);

    const [checked, setChecked] = useState(() =>
        new Set(current?.type === "list" ? current.values : options.map(([v]) => v)));
    const [min, setMin] = useState(current?.min ?? "");
    const [max, setMax] = useState(current?.max ?? "");
    const [from, setFrom] = useState(current?.from ?? "");
    const [to, setTo] = useState(current?.to ?? "");

    const shown = options.filter(([v]) => !q || v.toLowerCase().includes(q.toLowerCase()));
    const allShownOn = shown.length > 0 && shown.every(([v]) => checked.has(v));

    useEffect(() => {
        const away = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        const esc = (e) => { if (e.key === "Escape") onClose(); };
        setTimeout(() => document.addEventListener("mousedown", away), 0);
        document.addEventListener("keydown", esc);
        return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
    }, [onClose]);

    const apply = () => {
        if (col.kind === "text") {
            // searching narrows the pick to what's visible and ticked
            const values = q ? shown.map(([v]) => v).filter((v) => checked.has(v)) : [...checked];
            if (!q && values.length === options.length) return onClear();
            onApply({ type: "list", values });
        } else if (col.kind === "money") {
            if (min === "" && max === "") return onClear();
            onApply({ type: "range", min, max });
        } else {
            if (!from && !to) return onClear();
            onApply({ type: "dates", from, to });
        }
    };

    const width = col.kind === "text" ? 290 : 250;
    const style = {
        top: Math.min(rect.bottom + 4, window.innerHeight - 380),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
    };

    return (
        <div className="tx-pop" style={style} ref={ref} role="dialog" aria-label={`Filter ${col.label}`}>
            <div className="tx-pop-title">{col.label}</div>

            {col.kind === "text" && (
                <>
                    <input className="input tx-pop-search" placeholder="Search…" value={q} autoFocus
                        onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} />
                    <label className="tx-pop-item tx-pop-all">
                        <input type="checkbox" checked={allShownOn}
                            onChange={(e) => setChecked((s) => {
                                const n = new Set(s);
                                shown.forEach(([v]) => (e.target.checked ? n.add(v) : n.delete(v)));
                                return n;
                            })} />
                        <span>(Select all{q ? " shown" : ""})</span>
                    </label>
                    <div className="tx-pop-list">
                        {shown.slice(0, 500).map(([v, n]) => (
                            <label key={v} className="tx-pop-item" title={v}>
                                <input type="checkbox" checked={checked.has(v)}
                                    onChange={(e) => setChecked((s) => { const x = new Set(s); e.target.checked ? x.add(v) : x.delete(v); return x; })} />
                                <span className={v === BLANK ? "muted" : ""}>{v}</span>
                                <em>{n}</em>
                            </label>
                        ))}
                        {shown.length > 500 && <p className="tx-pop-more">Showing 500 of {shown.length}. Search to narrow.</p>}
                        {!shown.length && <p className="tx-pop-more">No matches.</p>}
                    </div>
                </>
            )}

            {col.kind === "money" && (
                <div className="tx-pop-range">
                    <label><span>Minimum</span><input className="input" inputMode="decimal" value={min} autoFocus
                        onChange={(e) => setMin(e.target.value.replace(/[^\d.-]/g, ""))} onKeyDown={(e) => e.key === "Enter" && apply()} /></label>
                    <label><span>Maximum</span><input className="input" inputMode="decimal" value={max}
                        onChange={(e) => setMax(e.target.value.replace(/[^\d.-]/g, ""))} onKeyDown={(e) => e.key === "Enter" && apply()} /></label>
                </div>
            )}

            {(col.kind === "date" || col.kind === "month") && (
                <div className="tx-pop-range">
                    <label><span>From</span><input className="input" type={col.kind === "month" ? "month" : "date"} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                    <label><span>To</span><input className="input" type={col.kind === "month" ? "month" : "date"} value={to} onChange={(e) => setTo(e.target.value)} /></label>
                </div>
            )}

            <div className="tx-pop-actions">
                <button className="btn btn-sm" onClick={onClear} disabled={!current}>Clear</button>
                <span />
                <button className="btn btn-sm" onClick={onClose}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={apply}
                    disabled={col.kind === "text" && !(q ? shown.some(([v]) => checked.has(v)) : checked.size)}>OK</button>
            </div>
        </div>
    );
}

/* =========================================================
   Other → Transactions
   ========================================================= */
export default function Transactions() {
    const { user } = useAuth();
    const notify = useToast();
    const { from: pFrom, to: pTo } = usePeriod();

    const [type, setType] = useState("purchase");
    const [from, setFrom] = useState(pFrom.slice(0, 7));
    const [to, setTo] = useState(pTo.slice(0, 7));
    const [branch, setBranch] = useState("current");
    const [rows, setRows] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [filters, setFilters] = useState({});        // { key: filter }
    const [open, setOpen] = useState(null);             // { key, rect }
    const [sort, setSort] = useState({ key: "date", dir: 1 });
    const [quick, setQuick] = useState("");
    const [printing, setPrinting] = useState(false);
    const [used, setUsed] = useState(null);             // type / months / branch behind the rows

    useEffect(() => { setFrom(pFrom.slice(0, 7)); setTo(pTo.slice(0, 7)); }, [pFrom, pTo]);

    const load = useCallback(async (t = type) => {
        if (!from || !to) return setError("Choose both months.");
        setLoading(true);
        setError("");
        setOpen(null);
        try {
            const r = await apiFetch(`/reports/transactions?${new URLSearchParams({ type: t, from, to, branch })}`);
            setRows(flatten(r.rows));
            setUsed({ type: t, from, to, branch });
            setBranches(r.branches || []);
            setFilters({});
        } catch (e) {
            setError(e.message || "Couldn't load the transactions.");
        } finally {
            setLoading(false);
        }
    }, [type, from, to, branch]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [user?.id, user?.caid]);

    const pickType = (t) => { setType(t); load(t); };

    /* ---------- filtering + sorting ---------- */
    const quickOk = (r) => {
        if (!quick.trim()) return true;
        const q = quick.toLowerCase();
        return COLS.some((c) => textValues(r, c).some((v) => v.toLowerCase().includes(q)));
    };
    const filtered = useMemo(() => {
        const list = rows.filter((r) => quickOk(r) && Object.entries(filters).every(([k, f]) => passes(r, k, f)));
        const c = COL[sort.key];
        const val = (r) => (c.kind === "money" ? Number(r[c.key]) || 0 : textValues(r, c).join(", ").toLowerCase());
        return [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, filters, sort, quick]);

    // rows for a column's checklist = rows passing every OTHER filter
    const rowsExcept = (key) => rows.filter((r) => quickOk(r) && Object.entries(filters).every(([k, f]) => k === key || passes(r, k, f)));

    const totals = useMemo(() => Object.fromEntries(
        COLS.filter((c) => c.total).map((c) => [
            c.key,
            filtered.reduce((a, r) => a + ((c.key === "vt2307" || c.key === "it2307") && !r.first ? 0 : Number(r[c.key]) || 0), 0),
        ])
    ), [filtered]);

    const setFilter = (key, f) => { setFilters((s) => { const n = { ...s }; if (f) n[key] = f; else delete n[key]; return n; }); setOpen(null); };
    const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }));

    /* ---------- Print (old: table rows + totals → merge.php + Transactions.xlsx) ---------- */
    const print = async () => {
        if (!used) return;
        setPrinting(true);
        try {
            const money = COLS.map((c, i) => (c.kind === "money" ? i : -1)).filter((i) => i >= 0);
            const lines = filtered.map((r) => COLS.map((c) => {
                if (c.kind === "money") return Math.round((Number(r[c.key]) || 0) * 100) / 100;
                if (c.key === "date") return fmtDate(r.date);
                return String(r[c.key] ?? "");
            }));
            const total = COLS.map((c, i) => (i === 0 ? "TOTAL" : c.total ? Math.round(totals[c.key] * 100) / 100 : ""));
            const { token } = await apiFetch("/print/transactions", {
                method: "POST",
                body: JSON.stringify({ ...used, head: COLS.map((c) => c.label), money, rows: lines, total }),
            });
            const blob = await apiBlob(`/print/transactions/${token}`);
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement("a"), { href: url, download: `Transactions-${user?.username || user?.id || ""}.xlsx` });
            document.body.append(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            notify(e.message || "Couldn't print the transactions.", "error");
        } finally {
            setPrinting(false);
        }
    };

    /* ---------- cells ---------- */
    const cell = (r, c) => {
        if (c.kind === "money") return n2(r[c.key]);
        if (c.key === "date") return fmtDate(r.date);
        const v = r[c.key] ?? "";
        return c.wide ? <span className="tx-clip" title={v}>{v}</span> : v;
    };

    const branchOpts = [
        { value: "current", label: "This branch" },
        { value: "all", label: "All branches" },
        ...branches.map((b) => ({ value: String(b.id), label: b.label })),
    ];
    const activeCount = Object.keys(filters).length;

    return (
        <section className="card jr-card tx-card">
            <header className="jr-head">
                <div className="jr-title">Transactions</div>
                <div>Date : {from} – {to}</div>
            </header>

            <div className="jr-filters no-print">
                <div className="field">
                    <span className="field-label">Transaction type</span>
                    <div className="b7-types" role="tablist" aria-label="Transaction type">
                        {TYPES.map(([v, l]) => (
                            <button key={v} type="button" role="tab" aria-selected={type === v}
                                className={`b7-type ${type === v ? "is-active" : ""}`} onClick={() => pickType(v)} disabled={loading}>{l}</button>
                        ))}
                    </div>
                </div>
                <label className="field"><span className="field-label">From</span>
                    <input type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label className="field"><span className="field-label">To</span>
                    <input type="month" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
                {branches.length > 1 && (
                    <div className="field jr-branch">
                        <span className="field-label">Branch</span>
                        <SearchSelect value={branch} onChange={setBranch} options={branchOpts} aria-label="Branch" />
                    </div>
                )}
                <div className="jr-btns">
                    <button className="btn btn-primary" onClick={() => load()} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
                    <button className="btn" onClick={print} disabled={loading || printing || !filtered.length}>{printing ? "Printing…" : "Print"}</button>
                </div>
            </div>

            <div className="tx-bar no-print">
                <input className="input tx-quick" type="search" placeholder="Quick search in all columns" value={quick}
                    onChange={(e) => setQuick(e.target.value)} aria-label="Quick search" />
                <span className="tx-count">
                    {filtered.length} of {rows.length} line{rows.length === 1 ? "" : "s"} ·{" "}
                    {new Set(filtered.map((r) => r.trans_id)).size} transaction{new Set(filtered.map((r) => r.trans_id)).size === 1 ? "" : "s"}
                </span>
                {activeCount > 0 && (
                    <div className="tx-chips">
                        {Object.entries(filters).map(([k, f]) => (
                            <span key={k} className="tx-chip">
                                <button type="button" className="tx-chip-label" onClick={(e) => setOpen({ key: k, rect: e.currentTarget.getBoundingClientRect() })}>
                                    <b>{COL[k].label}:</b> {describe(k, f)}
                                </button>
                                <button type="button" className="tx-chip-x" onClick={() => setFilter(k, null)} aria-label={`Remove ${COL[k].label} filter`}>×</button>
                            </span>
                        ))}
                        <button type="button" className="btn btn-sm" onClick={() => setFilters({})}>Clear all</button>
                    </div>
                )}
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={() => load()}>Try again</button></div>}

            <div className="tx-scroll">
                <table className="table tx-table">
                    <thead>
                        <tr>
                            {COLS.map((c) => {
                                const on = !!filters[c.key];
                                return (
                                    <th key={c.key} className={`${c.sticky ? "tx-sticky" : ""} ${c.kind === "money" ? "ta-right" : ""} ${c.wide ? "tx-wide" : ""}`}>
                                        <div className="tx-th">
                                            <button type="button" className="tx-sort" onClick={() => toggleSort(c.key)} title="Sort">
                                                {c.label}
                                                {sort.key === c.key && <span className="tx-arrow">{sort.dir > 0 ? "▲" : "▼"}</span>}
                                            </button>
                                            <button type="button" className={`tx-funnel ${on ? "is-on" : ""}`} aria-label={`Filter ${c.label}`}
                                                aria-pressed={on}
                                                onClick={(e) => setOpen(open?.key === c.key ? null : { key: c.key, rect: e.currentTarget.getBoundingClientRect() })}>
                                                <svg viewBox="0 0 24 24" width="13" height="13" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && Array.from({ length: 8 }).map((_, i) => (
                            <tr key={i}>{COLS.map((c) => <td key={c.key} className={c.sticky ? "tx-sticky" : ""}><span className="sk sk-cell" /></td>)}</tr>
                        ))}
                        {!loading && !filtered.length && (
                            <tr><td colSpan={COLS.length} className="empty">{rows.length ? "No transactions match the filters." : "No transactions for this period."}</td></tr>
                        )}
                        {!loading && filtered.map((r) => (
                            <tr key={r.key}>
                                {COLS.map((c) => (
                                    <td key={c.key} className={`${c.sticky ? "tx-sticky" : ""} ${c.kind === "money" ? "ta-right mono" : ""} ${c.wide ? "tx-wide" : ""}`}>
                                        {cell(r, c)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                    {!loading && filtered.length > 0 && (
                        <tfoot>
                            <tr>
                                {COLS.map((c, i) => (
                                    <td key={c.key} className={`${c.sticky ? "tx-sticky" : ""} ${c.total ? "ta-right mono strong" : "muted"}`}>
                                        {i === 0 ? <b>TOTAL</b> : c.total ? n2(totals[c.key]) : "–"}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {open && (
                <FilterPopup
                    key={open.key}
                    col={COL[open.key]}
                    rect={open.rect}
                    rows={rowsExcept(open.key)}
                    current={filters[open.key]}
                    onApply={(f) => setFilter(open.key, f)}
                    onClear={() => setFilter(open.key, null)}
                    onClose={() => setOpen(null)}
                />
            )}
        </section>
    );
}