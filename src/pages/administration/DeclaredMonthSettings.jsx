// Administration → Declared Month (old pages/Administration/Declared_Month_Settings.php)
// Client accounts × Jan … Dec of a year. Checked = locked: Sales / Purchases / Expenses can't save into that month.
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./DeclaredMonthSettings.css";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => THIS_YEAR + 1 - i); // next year … 6 years back
const ym = (year, i) => `${year}-${String(i + 1).padStart(2, "0")}`;
/* 1 … 4 5 [6] 7 8 … 20 */
const pageNums = (page, pages) => {
    const out = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - page) <= 2) out.push(i);
        else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
};

export default function DeclaredMonthSettings() {
    const notify = useToast();
    const [year, setYear] = useState(THIS_YEAR);
    const [rows, setRows] = useState([]);       // [{ caid, …, months: Set }]
    const [query, setQuery] = useState("");
    const [per, setPer] = useState(15);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState({});   // "caid|ym" => true while saving
    const [bulk, setBulk] = useState(null);     // { caids, months, locked, label } waiting for Yes

    const load = useCallback(async (y) => {
        setLoading(true);
        try {
            const res = await apiFetch(`/admin/declared-months?year=${y}`);
            setRows((res.rows || []).map((r) => ({ ...r, months: new Set(r.months) })));
        } catch (e) {
            notify(e.message || "Couldn't load the client accounts.", "error");
        } finally {
            setLoading(false);
        }
    }, [notify]);
    useEffect(() => { load(year); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps -- reload only when the year changes
    useEffect(() => { setPage(0); }, [query, per, year]);

    const list = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? rows.filter((r) => [r.client_num, r.client_name, r.trade_name, r.tin, r.status, r.branch_code, r.branch_type]
            .join(" ").toLowerCase().includes(q)) : rows;
    }, [rows, query]);
    const pages = Math.max(1, Math.ceil(list.length / per));
    const shown = list.slice(page * per, page * per + per);
    const months = MON.map((_, i) => ym(year, i));

    // apply on screen first, send, undo if it fails
    const apply = (caids, mons, locked) => {
        const ids = new Set(caids);
        setRows((rs) => rs.map((r) => {
            if (!ids.has(r.caid)) return r;
            const next = new Set(r.months);
            mons.forEach((m) => (locked ? next.add(m) : next.delete(m)));
            return { ...r, months: next };
        }));
    };
    const save = async (caids, mons, locked) => {
        const keys = caids.flatMap((c) => mons.map((m) => `${c}|${m}`));
        setSaving((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, true])) }));
        apply(caids, mons, locked);
        try {
            await apiFetch("/admin/declared-months", { method: "POST", body: JSON.stringify({ caids, months: mons, locked }) });
            notify(locked ? "Declared Month successfully lock" : "Declared Month successfully removed", "success");
        } catch (e) {
            apply(caids, mons, !locked);
            notify(e.message || "Error while processing data", "error");
        } finally {
            setSaving((s) => { const n = { ...s }; keys.forEach((k) => delete n[k]); return n; });
        }
    };

    const toggleCell = (r, m) => save([r.caid], [m], !r.months.has(m));
    const rowAll = (r) => months.every((m) => r.months.has(m));
    const colAll = (m) => list.length > 0 && list.every((r) => r.months.has(m));
    const askRow = (r) => {
        const locked = !rowAll(r);
        setBulk({ caids: [r.caid], months, locked, label: `${locked ? "Lock" : "Unlock"} all months of ${year} for ${r.trade_name || r.client_name}?` });
    };
    const askCol = (m, i) => {
        const locked = !colAll(m);
        setBulk({
            caids: list.map((r) => r.caid), months: [m], locked,
            label: `${locked ? "Lock" : "Unlock"} ${MON[i]} ${year} for ${list.length} client account(s)${query ? " (search result)" : ""}?`,
        });
    };
    const closeBulk = useCallback(() => setBulk(null), []);
    const doBulk = () => { const b = bulk; setBulk(null); save(b.caids, b.months, b.locked); };

    const lockedCount = (m) => list.reduce((n, r) => n + (r.months.has(m) ? 1 : 0), 0);

    return (
        <div className="dm">
            <section className="card dm-bar">
                <div className="dm-year" role="group" aria-label="Year">
                    <button type="button" className="dm-pg" onClick={() => setYear(year - 1)} aria-label="Previous year">‹</button>
                    <select className="input" value={year} onChange={(e) => setYear(+e.target.value)} aria-label="Year">
                        {(YEARS.includes(year) ? YEARS : [year, ...YEARS]).map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <button type="button" className="dm-pg" onClick={() => setYear(year + 1)} aria-label="Next year">›</button>
                </div>
                <input className="input dm-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search client no, name, TIN, branch…" aria-label="Search" />
                <span className="dm-legend"><i className="is-on" /> locked</span>
                <button type="button" className="btn" onClick={() => load(year)} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
            </section>

            <section className="card dm-body">
                <div className="dm-scroll">
                    <table className="dm-table dm-grid">
                        <thead>
                            <tr>
                                <th className="dm-c-client">Client Name</th>
                                {MON.map((label, i) => {
                                    const m = months[i];
                                    return (
                                        <th key={m} className="dm-c-month">
                                            <label className="dm-colhead" title={`Lock / unlock ${label} ${year} for every account in the list`}>
                                                <span>{label} {year}</span>
                                                <input type="checkbox" checked={colAll(m)} onChange={() => askCol(m, i)} disabled={!list.length}
                                                    aria-label={`All accounts ${label} ${year}`} />
                                                <small>{lockedCount(m)}/{list.length}</small>
                                            </label>
                                        </th>
                                    );
                                })}
                                <th className="dm-c-month">All</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((r) => (
                                <tr key={r.caid}>
                                    <td className="dm-c-client">
                                        <div className="dm-who">
                                            <b title={r.client_name}>{r.client_name || "—"}</b>
                                            <small>{[r.client_num, r.trade_name, r.branch_code && `Branch ${r.branch_code}`].filter(Boolean).join(" · ")}</small>
                                        </div>
                                    </td>
                                    {months.map((m, i) => {
                                        const on = r.months.has(m);
                                        const busy = saving[`${r.caid}|${m}`];
                                        return (
                                            <td key={m} className={`dm-c-month${on ? " is-on" : ""}`}>
                                                <input type="checkbox" checked={on} disabled={!!busy} onChange={() => toggleCell(r, m)}
                                                    aria-label={`${r.trade_name || r.client_name} ${MON[i]} ${year}`} />
                                            </td>
                                        );
                                    })}
                                    <td className="dm-c-month">
                                        <input type="checkbox" checked={rowAll(r)} onChange={() => askRow(r)} aria-label={`All months of ${year} for ${r.trade_name || r.client_name}`} />
                                    </td>
                                </tr>
                            ))}
                            {!shown.length && (
                                <tr><td colSpan={14} className="dm-empty">{loading ? "Loading…" : query ? "Nothing matches your search." : "No client accounts."}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <footer className="dm-pager">
                    <span className="dm-muted">{list.length ? `${page * per + 1}–${Math.min(list.length, page * per + per)} of ${list.length}` : "0"} record(s)</span>
                    <nav className="dm-pager-nav" aria-label="Pagination">
                        <label className="dm-pager-per">
                            Rows
                            <select className="input" value={per} onChange={(e) => setPer(+e.target.value)} aria-label="Rows per page">
                                {[15, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <button type="button" className="dm-pg" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page">‹</button>
                        {pageNums(page + 1, pages).map((n, i) => (n === "…"
                            ? <span key={`g${i}`} className="dm-pg-gap">…</span>
                            : <button type="button" key={n} className={`dm-pg${n === page + 1 ? " is-on" : ""}`} onClick={() => setPage(n - 1)}
                                aria-current={n === page + 1 ? "page" : undefined}>{n}</button>))}
                        <button type="button" className="dm-pg" onClick={() => setPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">›</button>
                    </nav>
                </footer>
            </section>

            {bulk && (
                <Modal title={bulk.locked ? "Lock declared month" : "Unlock declared month"} onClose={closeBulk}
                    footer={(
                        <div className="dm-foot">
                            <button type="button" className="btn" onClick={closeBulk}>No</button>
                            <button type="button" className={`btn ${bulk.locked ? "btn-primary" : "dm-danger"}`} onClick={doBulk}>Yes</button>
                        </div>
                    )}>
                    <p className="dm-confirm">{bulk.label}</p>
                </Modal>
            )}
        </div>
    );
}