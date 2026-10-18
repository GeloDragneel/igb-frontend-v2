// Billing → Collection (old pages/Billing/Collection)
// Payments still on hand, by payment type → pick some → SUBMIT them to a bank account (they move to Deposit)
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./BillingDashboard.css";

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const pad = (n) => String(n).padStart(2, "0");
const d = new Date();
const TODAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function Collection() {
    const notify = useToast();
    const [lk, setLk] = useState(null);
    const [type, setType] = useState(1);
    const [colType, setColType] = useState("");
    const [bankId, setBankId] = useState("");
    const [accountId, setAccountId] = useState("");
    const [date, setDate] = useState(TODAY);
    const [query, setQuery] = useState("");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [picked, setPicked] = useState(() => new Set());
    const [coEdit, setCoEdit] = useState({});
    const [note, setNote] = useState(null);
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [filters, setFilters] = useState({});        // { columnKey: Set(values) } – Excel-style column filters
    const [openFilter, setOpenFilter] = useState(null); // { key, el }

    useEffect(() => {
        apiFetch("/billing/collection/lookups").then(setLk).catch((e) => setError(e.message || "Couldn't load the lists."));
    }, []);

    const efps = lk ? type === Number(lk.efps_type_id) : false;

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setData(await apiFetch(`/billing/collection?payment_type_id=${type}${colType ? `&col_type_id=${colType}` : ""}`));
        } catch (e) {
            setError(e.message || "Couldn't load the collections.");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [type, colType]);

    useEffect(() => { load(); setPicked(new Set()); setCoEdit({}); }, [load]);
    useEffect(() => { setFilters({}); setOpenFilter(null); }, [type]);

    // the filterable columns (same order as the table)
    const columns = useMemo(() => [
        { key: "trade", label: "Trade name", get: (r) => r.trade_name || "—" },
        { key: "period", label: "Service period", get: (r) => r.service_period || "—" },
        { key: "col", label: "Collection type", get: (r) => r.col_type || "—" },
        {
            key: "fourth", label: efps ? "Return status" : type === 1 ? "Payment date" : "Details",
            get: (r) => (efps ? r.return_status : type === 1 ? r.payment_date : r.details) || "—"
        },
        { key: "ar", label: "AR #", get: (r) => r.receipt_no || "—", cls: "c" },
        { key: "amount", label: "Amount", get: (r) => n2(r.amount), cls: "n" },
        { key: "co", label: "C/O", get: (r) => n2(r.co_amount), cls: "n" },
        { key: "net", label: "Net amount", get: (r) => n2(r.total_amount), cls: "n" },
    ], [efps, type]);

    // rows after the search box (used to build each column's value list)
    const searched = useMemo(() => {
        const q = query.trim().toLowerCase();
        const all = data?.rows || [];
        if (!q) return all;
        return all.filter((r) => [r.trade_name, r.branch_code, r.client_name, r.service_period, r.col_type, r.receipt_no, r.details, r.remarks]
            .join(" ").toLowerCase().includes(q));
    }, [data, query]);

    const rows = useMemo(() => searched.filter((r) =>
        columns.every((c) => !filters[c.key] || filters[c.key].has(c.get(r)))), [searched, columns, filters]);

    // values a column can be filtered by: rows that pass every OTHER column filter
    const valuesFor = (col) => {
        const set = new Set();
        searched.forEach((r) => {
            if (columns.every((c) => c.key === col.key || !filters[c.key] || filters[c.key].has(c.get(r)))) set.add(col.get(r));
        });
        return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    };
    const applyFilter = (key, set) => {
        setFilters((f) => { const n = { ...f }; if (set) n[key] = set; else delete n[key]; return n; });
        setPicked(new Set());
    };
    const activeFilters = Object.keys(filters).length;

    const bank = lk?.banks?.find((b) => String(b.id) === String(bankId));
    const selectedRows = rows.filter((r) => picked.has(r.id));
    const selectedTotal = selectedRows.reduce((t, r) => t + num(r.total_amount), 0);
    const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));

    const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)));

    const saveCo = async (r) => {
        const v = coEdit[r.id];
        if (v === undefined || num(v) === num(r.co_amount)) return setCoEdit((x) => { const n = { ...x }; delete n[r.id]; return n; });
        try {
            const res = await apiFetch(`/billing/collection/${r.id}`, { method: "PUT", body: JSON.stringify({ co_amount: num(v) }) });
            notify(res.message);
            setCoEdit((x) => { const n = { ...x }; delete n[r.id]; return n; });
            load();
        } catch (e) {
            notify(e.message, "error");
        }
    };

    const trySubmit = () => {
        if (!bankId) return notify("Bank Name is required", "error");
        if (!accountId) return notify("Bank Account is required", "error");
        if (!picked.size) return notify("Please select the payments to submit", "error");
        setConfirm(true);
    };

    const submit = async () => {
        setConfirm(false);
        setBusy(true);
        try {
            const res = await apiFetch("/billing/collection/submit", {
                method: "POST",
                body: JSON.stringify({ payment_type_id: type, bank_name_id: Number(bankId), bank_account_id: Number(accountId), date, ids: [...picked] }),
            });
            notify(res.message);
            setPicked(new Set());
            load();
        } catch (e) {
            notify(e.message, "error");
        } finally {
            setBusy(false);
        }
    };

    const fourth = (r) => (efps ? r.return_status || "—" : type === 1 ? r.payment_date || "—" : r.details || "—");

    return (
        <div className="bsv">
            <section className="card bsv-tabbar" role="tablist" aria-label="Payment type">
                {(lk?.payment_types || []).map((t) => (
                    <button key={t.id} role="tab" aria-selected={type === t.id} className={type === t.id ? "is-on" : ""} onClick={() => setType(t.id)}>
                        {t.name}
                    </button>
                ))}
            </section>

            <section className="card bsv-bar">
                <label className="bsv-field bsv-sm">
                    <span className="field-label">Collection type</span>
                    <select className="input" value={colType} onChange={(e) => setColType(e.target.value)}>
                        <option value="">All</option>
                        {(lk?.col_types || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </label>
                <label className="bsv-field bsv-md">
                    <span className="field-label">Bank name</span>
                    <select className="input" value={bankId} disabled={efps} onChange={(e) => { setBankId(e.target.value); setAccountId(""); }}>
                        <option value="">— Select bank name —</option>
                        {(lk?.banks || []).map((b) => <option key={b.id} value={b.id}>{b.abb ? `(${b.abb}) ` : ""}{b.name}</option>)}
                    </select>
                </label>
                <label className="bsv-field bsv-sm">
                    <span className="field-label">Bank account</span>
                    <select className="input" value={accountId} disabled={efps || !bank} onChange={(e) => setAccountId(e.target.value)}>
                        <option value="">— Select bank account —</option>
                        {(bank?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.number}{a.name ? ` · ${a.name}` : ""}</option>)}
                    </select>
                </label>
                <label className="bsv-field bsv-sm">
                    <span className="field-label">Date</span>
                    <input className="input" type="date" value={date} disabled={efps} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="bsv-field bsv-grow">
                    <span className="field-label">Search</span>
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Trade name, period, AR #, note..." />
                </label>
                <div className="bsv-actions">
                    <button className="btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
                </div>
                {lk && !lk.banks?.length && <p className="bsv-info">No bank names found — run the bank migration and copy SQL.</p>}
            </section>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

            <section className="card bsv-body">
                <div className="bsv-scroll">
                    <table className="bsv-table">
                        <thead>
                            <tr>
                                <th className="c">{!efps && <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Select all" />}</th>
                                {columns.map((c) => <th key={c.key} className={c.cls}>{c.label}</th>)}
                                <th className="c">Note</th>
                            </tr>
                            <tr className="bsv-filter-row">
                                <th className="c">
                                    {activeFilters > 0 && <button className="bsv-filter-reset" onClick={() => setFilters({})} title="Clear all column filters">✕</button>}
                                </th>
                                {columns.map((c) => (
                                    <th key={c.key}>
                                        <button type="button" className={`bsv-filter-btn${filters[c.key] ? " is-on" : ""}`}
                                            onClick={(e) => setOpenFilter(openFilter?.key === c.key ? null : { key: c.key, el: e.currentTarget })}
                                            aria-haspopup="dialog" aria-expanded={openFilter?.key === c.key} aria-label={`Filter ${c.label}`}>
                                            <span>{filters[c.key] ? `${filters[c.key].size} selected` : "All"}</span><span aria-hidden="true">▾</span>
                                        </button>
                                    </th>
                                ))}
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <tr><td colSpan={10} className="bsv-empty">Loading…</td></tr>}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={10} className="bsv-empty">
                                    {(data?.rows || []).length ? "Nothing matches the search / filters." : <><b>No records found</b>No payments on hand for this payment type.</>}
                                </td></tr>
                            )}
                            {!loading && rows.map((r) => (
                                <tr key={r.id} className={`bsv-row${picked.has(r.id) ? " is-picked" : ""}`} onClick={() => !efps && toggle(r.id)}>
                                    <td className="c" onClick={(e) => e.stopPropagation()}>
                                        {!efps && <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select payment ${r.id}`} />}
                                    </td>
                                    <td>
                                        <div className="bsv-who"><b>{r.trade_name || "—"}</b><small>{[r.branch_code, r.client_name].filter(Boolean).join(" · ")}</small></div>
                                    </td>
                                    <td>{r.service_period || "—"}</td>
                                    <td>{r.col_type || "—"}</td>
                                    <td className="bsv-name" title={fourth(r)}>{fourth(r)}</td>
                                    <td className="c mono">{r.receipt_no || "—"}</td>
                                    <td className="n">{n2(r.amount)}</td>
                                    <td className="n" onClick={(e) => e.stopPropagation()}>
                                        {efps ? n2(r.co_amount) : (
                                            <input className="input ta-right bsv-co" inputMode="decimal" aria-label="C/O amount"
                                                value={coEdit[r.id] ?? (r.co_amount ? String(r.co_amount) : "")} placeholder="0.00"
                                                onChange={(e) => setCoEdit((x) => ({ ...x, [r.id]: cleanNum(e.target.value) }))}
                                                onBlur={() => saveCo(r)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
                                        )}
                                    </td>
                                    <td className="n strong">{n2(coEdit[r.id] !== undefined ? num(r.amount) - num(coEdit[r.id]) : r.total_amount)}</td>
                                    <td className="c" onClick={(e) => e.stopPropagation()}>
                                        <button className={`btn btn-sm${r.remarks ? " bsv-has-note" : ""}`} onClick={() => setNote(r)} disabled={efps} title={r.remarks || "Add a note"}>
                                            {r.remarks ? "Note ✓" : "Note"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <footer className="bsv-foot">
                <dl className="bsv-foot-totals">
                    <div><dt>Cash on hand</dt><dd>{n2(data?.totals?.cash)}</dd></div>
                    <div><dt>Cheque on hand</dt><dd>{n2(data?.totals?.cheque)}</dd></div>
                    <div><dt>Cash / cheque on hand</dt><dd className="strong">{n2(data?.totals?.cash_cheque)}</dd></div>
                </dl>
                <div className="bsv-foot-actions">
                    <span>Selected <b>{picked.size}</b> · <b className="bsv-sel">₱{n2(selectedTotal)}</b></span>
                    <button className="btn btn-primary" onClick={trySubmit} disabled={efps || busy || !picked.size}>{busy ? "Submitting…" : "Submit"}</button>
                </div>
            </footer>

            {confirm && (
                <ConfirmDialog title="Submit collection?"
                    message={`${picked.size} payment(s), ₱${n2(selectedTotal)}, go to ${bank?.abb || bank?.name || "the bank"} account ${bank?.accounts?.find((a) => String(a.id) === String(accountId))?.number || ""} dated ${date}. They move to Deposit.`}
                    confirmLabel="Submit" onCancel={() => setConfirm(false)} onConfirm={submit} />
            )}
            {openFilter && (() => {
                const col = columns.find((c) => c.key === openFilter.key);
                return col && (
                    <FilterPanel anchor={openFilter.el} values={valuesFor(col)} selected={filters[col.key]}
                        onClose={() => setOpenFilter(null)}
                        onApply={(set) => { applyFilter(col.key, set); setOpenFilter(null); }} />
                );
            })()}
            {note && <NoteModal payment={note} onClose={() => setNote(null)} onSaved={(m) => { setNote(null); notify(m); load(); }} />}
        </div>
    );
}

function NoteModal({ payment, onClose, onSaved }) {
    const [text, setText] = useState(payment.remarks || "");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        setError("");
        try {
            const res = await apiFetch(`/billing/collection/${payment.id}`, { method: "PUT", body: JSON.stringify({ remarks: text.trim() || null }) });
            onSaved(res.message);
        } catch (e) {
            setError(e.message || "Couldn't save the note.");
            setSaving(false);
        }
    };

    return (
        <Modal title={`Note · ${payment.trade_name || ""} ${payment.receipt_no ? `· #${payment.receipt_no}` : ""}`} onClose={() => !saving && onClose()} size="md"
            footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            <Field label="Note"><textarea className="input" rows={5} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus /></Field>
        </Modal>
    );
}

// Excel-style column filter: searchable checklist of the column's values
function FilterPanel({ anchor, values, selected, onClose, onApply }) {
    const [term, setTerm] = useState("");
    const [checked, setChecked] = useState(() => new Set(selected ? [...selected].filter((v) => values.includes(v)) : values));
    const [pos, setPos] = useState(null);
    const panel = useRef(null);

    useLayoutEffect(() => {
        const place = () => {
            const r = anchor.getBoundingClientRect();
            const w = 260, h = panel.current?.offsetHeight || 320;
            let left = Math.min(r.left, window.innerWidth - w - 8);
            let top = r.bottom + 4;
            if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
            setPos({ left: Math.max(8, left), top, width: w });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
    }, [anchor]);

    useEffect(() => {
        const down = (e) => { if (!panel.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
        const key = (e) => e.key === "Escape" && onClose();
        document.addEventListener("mousedown", down);
        document.addEventListener("keydown", key);
        return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
    }, [anchor, onClose]);

    const shown = values.filter((v) => v.toLowerCase().includes(term.trim().toLowerCase()));
    const flip = (v) => setChecked((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
    const setShown = (on) => setChecked((s) => { const n = new Set(s); shown.forEach((v) => (on ? n.add(v) : n.delete(v))); return n; });
    const apply = () => onApply(checked.size === values.length ? null : new Set(checked));

    return createPortal(
        <div className="bsv-filter-panel" ref={panel} role="dialog" aria-label="Column filter" style={pos || { visibility: "hidden" }}>
            <input className="input" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search..." />
            <div className="bsv-filter-links">
                <button type="button" onClick={() => setShown(true)}>Select all</button>
                <button type="button" onClick={() => setShown(false)}>Clear</button>
            </div>
            <div className="bsv-filter-list">
                {shown.length === 0 && <p className="bsv-filter-none">No values</p>}
                {shown.map((v) => (
                    <label key={v}><input type="checkbox" checked={checked.has(v)} onChange={() => flip(v)} /> <span>{v}</span></label>
                ))}
            </div>
            <div className="bsv-filter-foot">
                <button type="button" className="btn btn-sm" onClick={() => onApply(null)}>Clear filter</button>
                <button type="button" className="btn btn-sm btn-primary" onClick={apply} disabled={checked.size === 0}>Apply</button>
            </div>
        </div>,
        document.body,
    );
}