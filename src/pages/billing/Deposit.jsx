// Billing → Deposit (old pages/Billing/Deposit)
// Payments submitted to a bank account on the Collection page → pick some → DEPOSIT them with a deposit date
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal, { Field } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiFetch, apiBlob } from "../../context/AuthContext";
import "./BillingDashboard.css";

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, "0");
const d = new Date();
const TODAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function Deposit() {
    const notify = useToast();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [picked, setPicked] = useState(() => new Set());
    const [open, setOpen] = useState(false);
    const [printR1, setPrintR1] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await apiFetch("/billing/deposit");
            setData(res);
            setPicked((s) => new Set([...s].filter((id) => res.rows.some((r) => r.id === id))));
        } catch (e) {
            setError(e.message || "Couldn't load the deposit list.");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        const all = data?.rows || [];
        if (!q) return all;
        return all.filter((r) => [r.id, r.trade_name, r.branch_code, r.client_name, r.service_period, r.remarks, r.payment_details, r.bank_account]
            .join(" ").toLowerCase().includes(q));
    }, [data, query]);

    const selected = (data?.rows || []).filter((r) => picked.has(r.id));
    const selectedTotal = selected.reduce((t, r) => t + (Number(r.total_amount) || 0), 0);
    const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
    const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleAll = () => setPicked((s) => {
        const n = new Set(s);
        rows.forEach((r) => (allPicked ? n.delete(r.id) : n.add(r.id)));
        return n;
    });

    return (
        <div className="bsv">
            <section className="card bsv-bar">
                <label className="bsv-field bsv-grow">
                    <span className="field-label">Search</span>
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID, trade name, branch, period, note, bank account..." />
                </label>
                <div className="bsv-actions">
                    <button className="btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
                    <button className="btn" onClick={() => setPrintR1(true)}>Print R1</button>
                    <button className="btn btn-primary" onClick={() => (picked.size ? setOpen(true) : notify("Please select row to deposit", "error"))}>Deposit</button>
                </div>
            </section>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

            <section className="card bsv-body">
                <div className="bsv-scroll">
                    <table className="bsv-table">
                        <thead>
                            <tr>
                                <th className="c"><input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Select all" /></th>
                                <th>ID</th><th>Trade name</th><th>Branch</th><th>Service period</th><th>Note</th><th>Payment details</th><th>Bank account</th>
                                <th className="n">Amount</th><th className="n">C/O</th><th className="n">Net amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <tr><td colSpan={11} className="bsv-empty">Loading…</td></tr>}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={11} className="bsv-empty">
                                    {(data?.rows || []).length ? "Nothing matches the search." : <><b>Nothing to deposit</b>Payments submitted on the Collection page show up here.</>}
                                </td></tr>
                            )}
                            {!loading && rows.map((r) => (
                                <tr key={r.id} className={`bsv-row${picked.has(r.id) ? " is-picked" : ""}`} onClick={() => toggle(r.id)}>
                                    <td className="c" onClick={(e) => e.stopPropagation()}>
                                        <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select payment ${r.id}`} />
                                    </td>
                                    <td className="mono">{r.id}</td>
                                    <td className="bsv-name strong" title={r.trade_name}>{r.trade_name || "—"}</td>
                                    <td>{r.branch_code || "—"}</td>
                                    <td>{r.service_period || "—"}</td>
                                    <td className="bsv-name" title={r.remarks || ""}>{r.remarks || "N/A"}</td>
                                    <td className="bsv-name" title={r.payment_details}>{r.payment_details || "—"}</td>
                                    <td className="mono">{r.bank_account || "—"}</td>
                                    <td className="n">{n2(r.amount)}</td>
                                    <td className="n">{n2(r.co_amount)}</td>
                                    <td className="n strong">{n2(r.total_amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <footer className="bsv-foot">
                <dl className="bsv-foot-totals">
                    <div><dt>Waiting for deposit</dt><dd>{(data?.rows || []).length} · ₱{n2(data?.total)}</dd></div>
                </dl>
                <div className="bsv-foot-actions">
                    <span>Selected <b>{picked.size}</b> · <b className="bsv-sel">₱{n2(selectedTotal)}</b></span>
                    <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={!picked.size}>Deposit</button>
                </div>
            </footer>

            {printR1 && <PrintR1Modal onClose={() => setPrintR1(false)} />}

            {open && (
                <DepositModal ids={[...picked]} total={selectedTotal} onClose={() => setOpen(false)}
                    onDone={(m) => { setOpen(false); notify(m); setPicked(new Set()); load(); }} />
            )}
        </div>
    );
}

function DepositModal({ ids, total, onClose, onDone }) {
    const [date, setDate] = useState(TODAY);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const save = async () => {
        if (!date) return setError("Deposit date is required");
        setSaving(true);
        setError("");
        try {
            const res = await apiFetch("/billing/deposit", { method: "POST", body: JSON.stringify({ date, ids }) });
            onDone(res.message);
        } catch (e) {
            setError(e.message || "Couldn't save the deposit.");
            setSaving(false);
        }
    };

    return (
        <Modal title="Deposit date" onClose={() => !saving && onClose()} size="md"
            footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            <Field label="Date *"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <p className="bsv-note">{ids.length} payment(s) · ₱{n2(total)} will be marked deposited on this date.</p>
        </Modal>
    );
}
/* ---------- Print R1 (old merge.php → PrintR1.odt): deposited payments of a deposit date ---------- */
function PrintR1Modal({ onClose }) {
    const [date, setDate] = useState(TODAY);
    const [url, setUrl] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!date) return undefined;
        let alive = true;
        let objectUrl = "";
        setLoading(true);
        setError("");
        setUrl("");
        apiBlob(`/billing/deposit/r1?date=${encodeURIComponent(date)}`)
            .then((blob) => { if (!alive) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
            .catch((e) => alive && setError(e.message || "Couldn't create the R1."))
            .finally(() => alive && setLoading(false));
        return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [date]);

    return (
        <Modal title="Print Preview · R1" onClose={onClose} size="lg"
            footer={<>
                {url && <a className="btn" href={url} download={`R1-${date}.pdf`}>Download</a>}
                <button className="btn btn-dark" onClick={onClose}>Close</button>
            </>}>
            <Field label="Deposit date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            {error && <div className="alert-error" role="alert">{error}</div>}
            {loading && <div className="bd-pdf-wait">Preparing R1…</div>}
            {url && <iframe className="bd-pdf" src={url} title="R1" />}
        </Modal>
    );
}