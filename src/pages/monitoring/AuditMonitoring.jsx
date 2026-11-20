// Monitoring → Audit Monitoring
//   Aging per client (Pending · Audited · Reverted × 1-30 / 31-60 / 61-90 / 90+ days), filtered by year.
//   Click any number → the Sales / Purchases / Expenses behind it → click one → its details in a popup frame.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Modal from "../../components/Modal";
import { apiFetch, useAuth } from "../../context/AuthContext";
import "./AuditMonitoring.css";
import "./AuditMonitoringTabs.css";
import "../../components/WorkReminder.css";

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 2019 }, (_, i) => THIS_YEAR - i);   // this year … 2020
const AGES = [["d30", "1–30 days"], ["d60", "31–60 days"], ["d90", "61–90 days"], ["d90p", "90+ days"]];
const AGE_SETS = [["pending", "Pending"], ["audited", "Audited"], ["reverted", "Reverted"]];
const ST_TONE = { Pending: "is-pend", Confirmed: "is-pend", Audited: "is-ok", Reverted: "is-bad" };
const TYPE_LABEL = { sales: "Sales", purchases: "Purchases", expenses: "Expenses" };
const fmtN = (n) => Number(n || 0).toLocaleString();
const fmtAmt = (n) => Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AuditMonitoring() {
    const [lk, setLk] = useState(null);             // { auditors, can_pick_auditor }
    const [year, setYear] = useState(String(THIS_YEAR));   // "" = all years
    const [auditorId, setAuditorId] = useState("0");

    useEffect(() => { apiFetch("/monitoring/audit/lookups").then(setLk).catch(() => setLk({})); }, []);

    const shiftYear = (n) => setYear((y) => String(Math.min(THIS_YEAR, Math.max(2020, Number(y || THIS_YEAR) + n))));

    return (
        <div className="aum">
            <section className="card aum-bar">
                <div className="aum-title">
                    <h4>Audit Monitoring</h4>
                    <span>{year ? `Year ${year}` : "All years"}</span>
                </div>
                <label className="aum-field">
                    <span className="field-label">Year</span>
                    <div className="aum-month">
                        <button type="button" className="btn aum-mbtn" onClick={() => shiftYear(-1)} disabled={year === "2020"} aria-label="Previous year">‹</button>
                        <select className="input" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
                            <option value="">All years</option>
                            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <button type="button" className="btn aum-mbtn" onClick={() => shiftYear(1)} disabled={!year || year === String(THIS_YEAR)} aria-label="Next year">›</button>
                    </div>
                </label>
                {lk?.can_pick_auditor && (
                    <label className="aum-field">
                        <span className="field-label">Auditor</span>
                        <select className="input" value={auditorId} onChange={(e) => setAuditorId(e.target.value)}>
                            <option value="0">-- All List --</option>
                            {(lk.auditors || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </label>
                )}
            </section>

            <AuditAging year={year} auditorId={lk?.can_pick_auditor ? auditorId : "0"} />
        </div>
    );
}

/* aging per client — every number opens the invoices behind it
   Auditor → own assigned clients · IT / CEO / Supervisor / Audit Supervisor → all (or the Auditor picked above)
   Pending = days since entered · Audited / Reverted = days since it was audited / reverted */
function AuditAging({ year, auditorId }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [tab, setTab] = useState("pending");
    const [list, setList] = useState(null);         // { kind, bucket, caid, title }

    useEffect(() => {
        let alive = true;
        setData(null);
        setError("");
        apiFetch(`/monitoring/audit/aging?${new URLSearchParams({ year, auditor_id: auditorId || 0 })}`)
            .then((r) => alive && setData(r))
            .catch((e) => alive && setError(e.status === 403 ? "Only auditors and supervisors can see the audit monitoring." : e.message || "Couldn't load the aging."));
        return () => { alive = false; };
    }, [year, auditorId]);

    if (error) return <section className="card aum-aging"><div className="alert-error" role="alert">{error}</div></section>;
    if (!data) return <section className="card aum-aging"><span className="sk" style={{ display: "block", height: 260 }} /></section>;

    const cur = data[tab];
    const tabLabel = AGE_SETS.find(([k]) => k === tab)[1];
    const scopeText = data.scope === "mine" ? `Your ${fmtN(data.clients)} assigned clients`
        : data.scope === "auditor" ? `${fmtN(data.clients)} clients of the selected auditor` : "All clients";
    const ageNote = tab === "pending" ? "days since it was entered" : tab === "audited" ? "days since it was audited" : "days since it was reverted";
    const ageLabel = (b) => AGES.find(([k]) => k === b)?.[1];
    const open = (bucket, c) => setList({
        kind: tab, bucket: bucket || "", caid: c?.caid || 0,
        title: [tabLabel, bucket ? ageLabel(bucket) : "", c ? c.trade_name : "All clients"].filter(Boolean).join(" · "),
    });
    const Num = ({ n, bucket, c, cls = "" }) => (n
        ? <button type="button" className={`aum-numbtn ${cls}`} onClick={() => open(bucket, c)} title="See the invoices">{fmtN(n)}</button>
        : <span className="muted">–</span>);

    return (
        <section className="card aum-aging">
            <div className="aum-aging-head">
                <h4>Aging <small>· {scopeText}{year ? ` · ${year}` : ""}</small></h4>
                <span className="muted small">Age = {ageNote} · click a number to see the invoices</span>
            </div>
            <div className="wr-tabs" role="tablist">
                {AGE_SETS.map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
                        {l} <span className="wr-n">{fmtN(data[k].totals.total)}</span>
                    </button>
                ))}
            </div>
            <div className="wr-ages">
                {AGES.map(([k, l], i) => (
                    <button key={k} type="button" className={`wr-age is-${i} aum-agebtn`} onClick={() => cur.totals[k] && open(k)} disabled={!cur.totals[k]}>
                        <span>{l}</span><b>{fmtN(cur.totals[k])}</b>
                    </button>
                ))}
            </div>
            <div className="wr-scroll aum-aging-scroll">
                <table className="table wr-table">
                    <thead>
                        <tr><th>Client account</th>{AGES.map(([k, l]) => <th key={k} className="num">{l}</th>)}<th className="num">Total</th></tr>
                    </thead>
                    <tbody>
                        {!cur.clients.length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>Nothing here.</td></tr>}
                        {cur.clients.map((c) => (
                            <tr key={c.caid}>
                                <td><b>{c.trade_name || "—"}</b>{c.branch_code ? <small className="muted"> · {c.branch_code}</small> : null}</td>
                                {AGES.map(([k], i) => <td key={k} className="num"><Num n={c[k]} bucket={k} c={c} cls={`wr-hot is-${i}`} /></td>)}
                                <td className="num"><Num n={c.total} c={c} cls="strong" /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {list && <AgingList q={list} year={year} auditorId={auditorId} onClose={() => setList(null)} />}
        </section>
    );
}

/* the Sales / Purchases / Expenses behind a number · click one → its details in a popup frame */
function AgingList({ q, year, auditorId, onClose }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [type, setType] = useState("");
    const [opening, setOpening] = useState("");
    const [frame, setFrame] = useState(null);
    const { user, selectBranch } = useAuth();

    useEffect(() => {
        let alive = true;
        const p = new URLSearchParams({ kind: q.kind, bucket: q.bucket, caid: q.caid, year, auditor_id: auditorId || 0 });
        apiFetch(`/monitoring/audit/aging/list?${p}`)
            .then((r) => alive && setData(r))
            .catch((e) => alive && setError(e.message || "Couldn't load the invoices."));
        return () => { alive = false; };
    }, [q, year, auditorId]);

    const rows = data?.rows || [];
    const count = (t) => rows.filter((r) => !t || r.type === t).length;
    const shown = type ? rows.filter((r) => r.type === type) : rows;
    const dateLabel = q.kind === "pending" ? "Entered" : q.kind === "audited" ? "Audited" : "Reverted";

    const openInvoice = async (v) => {
        if (opening) return;
        setOpening(v.invoice_no);
        try {
            if (v.caid && Number(user?.caid) !== Number(v.caid)) await selectBranch(v.caid);
            setFrame(v);
        } catch (e) {
            setError(e.message || "Couldn't open the invoice.");
        } finally {
            setOpening("");
        }
    };

    return (
        <Modal title={q.title} onClose={onClose} size="xlg" footer={<button className="btn" onClick={onClose}>Close</button>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            {!data && !error && <div className="aum-detail-empty">Loading…</div>}
            {data && (
                <>
                    <div className="wr-tabs" role="tablist">
                        {[["", "All"], ["sales", "Sales"], ["purchases", "Purchases"], ["expenses", "Expenses"]].map(([k, l]) => (
                            <button key={k || "all"} role="tab" aria-selected={type === k} className={type === k ? "is-on" : ""} onClick={() => setType(k)}>
                                {l} <span className="wr-n">{fmtN(count(k))}</span>
                            </button>
                        ))}
                    </div>
                    <div className="wr-scroll" style={{ maxHeight: "60vh" }}>
                        <table className="table wr-table aum-list">
                            <thead>
                                <tr>
                                    <th className="num">#</th>{!q.caid && <th>Branch Code - Trade Name</th>}<th>Type</th><th>Document No</th><th>Declared Month</th>
                                    <th>{dateLabel}</th><th className="num">Days</th><th className="num">Amount</th><th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!shown.length && <tr><td colSpan={q.caid ? 8 : 9} className="muted" style={{ textAlign: "center", padding: 20 }}>Nothing here.</td></tr>}
                                {shown.map((v, i) => (
                                    <tr key={`${v.invoice_no}-${i}`} className="add-click" tabIndex={0} title={`Open ${v.invoice_no}`}
                                        onClick={() => openInvoice(v)} onKeyDown={(e) => e.key === "Enter" && openInvoice(v)}>
                                        <td className="num muted">{i + 1}</td>
                                        {!q.caid && <td className="aum-list-name" title={v.trade_name}>{v.trade_name}</td>}
                                        <td>{TYPE_LABEL[v.type]}</td>
                                        <td>{opening === v.invoice_no ? "Opening…" : (v.document_no || v.invoice_no)}</td>
                                        <td>{v.declared_month || "—"}</td>
                                        <td>{v.since || "—"}</td>
                                        <td className="num">{fmtN(v.days)}</td>
                                        <td className="num">{fmtAmt(v.amount)}</td>
                                        <td><span className={`add-chip ${ST_TONE[v.status] || ""}`}>{v.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {data.more && <p className="muted small" style={{ marginTop: 8 }}>Showing the oldest 2,000. Pick one client or a shorter age to see the rest.</p>}
                </>
            )}
            {frame && <InvoiceFrame inv={frame} onClose={() => setFrame(null)} />}
        </Modal>
    );
}

/* the invoice details page inside a popup frame */
function InvoiceFrame({ inv, onClose }) {
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    const src = `/view/${inv.type}/${encodeURIComponent(inv.invoice_no)}`;
    // portal to <body> so the frame is not squeezed inside the day popup
    return createPortal(
        <div className="add-frame-bg" onClick={onClose}>
            <div className="add-frame" role="dialog" aria-label={`Invoice ${inv.invoice_no}`} onClick={(e) => e.stopPropagation()}>
                <div className="add-frame-head">
                    <span><b>{inv.document_no || inv.invoice_no}</b><small>{inv.trade_name} · {inv.declared_month} · {inv.status}</small></span>
                    <button type="button" className="btn" onClick={onClose}>Close</button>
                </div>
                {!loaded && <div className="aum-detail-empty">Loading…</div>}
                <iframe title={`Invoice ${inv.invoice_no}`} src={src} onLoad={() => setLoaded(true)} style={loaded ? undefined : { visibility: "hidden" }} />
            </div>
        </div>,
        document.body
    );
}