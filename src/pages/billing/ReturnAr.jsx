// Billing → Return AR (old pages/Billing/Return_AR)
// Account → service period (SOA) → its returns & other charges: add / edit, VAT/WH/discount options, tick + Print AR
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import SearchSelect from "../../components/SearchSelect";
import Badge from "../../components/Badge";
import { useToast } from "../../components/Toast";
import { apiFetch, apiBlob } from "../../context/AuthContext";
import { ServiceModal, OptionsModal } from "./BillingDashboard";
import "./BillingDashboard.css";

const PF_TYPES = [4, 5, 6, 7];   // PF & other charges live on the SOA dashboard; this page shows the rest (returns & others)
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export default function ReturnAr() {
    const notify = useToast();
    const [lk, setLk] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [caid, setCaid] = useState("");
    const [account, setAccount] = useState(null);
    const [transNumber, setTransNumber] = useState("");
    const [soa, setSoa] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [ticked, setTicked] = useState([]);
    const [serviceForm, setServiceForm] = useState(null);
    const [optionsFor, setOptionsFor] = useState(null);
    const [printIds, setPrintIds] = useState(null);

    useEffect(() => {
        apiFetch("/billing/lookups").then(setLk).catch((e) => setError(e.message || "Couldn't load the lists."));
        apiFetch("/billing/return-ar/accounts").then(setAccounts).catch(() => { });
    }, []);

    useEffect(() => {
        setAccount(null); setTransNumber(""); setSoa(null); setTicked([]);
        if (caid) apiFetch(`/billing/accounts/${caid}`).then(setAccount).catch((e) => notify(e.message, "error"));
    }, [caid]); // eslint-disable-line react-hooks/exhaustive-deps

    const load = useCallback(async () => {
        if (!transNumber) return;
        setLoading(true);
        setError("");
        try {
            setSoa(await apiFetch(`/billing/soa/${encodeURIComponent(transNumber)}`));
        } catch (e) {
            setError(e.message || "Couldn't load the SOA.");
            setSoa(null);
        } finally {
            setLoading(false);
        }
    }, [transNumber]);

    useEffect(() => { setTicked([]); load(); }, [load]);

    // Client name / Branch code - Trade name
    const accountOpts = useMemo(() => [{ value: "", label: "— Select trade name —" }, ...accounts.map((a) => ({
        value: String(a.id), label: (a.client_name || "").trim() || "—",
        hint: [a.branch_code, (a.trade_name || "").trim()].filter(Boolean).join(" - ") || "—",
    }))], [accounts]);
    const periodOpts = useMemo(() => [{ value: "", label: "— Select service period —" }, ...(account?.periods || []).map((p) => ({
        value: p.trans_number, label: p.service_period || p.trans_number, hint: p.trans_number,
    }))], [account]);

    const t = soa?.transaction;
    const rows = (soa?.services || []).filter((s) => !PF_TYPES.includes(Number(s.ser_type_id)));
    const total = rows.reduce((sum, s) => sum + (Number(s.total_service_fee) || 0), 0);
    const tickedTotal = rows.filter((s) => ticked.includes(s.id)).reduce((sum, s) => sum + (Number(s.total_service_fee) || 0), 0);
    const allTicked = rows.length > 0 && rows.every((s) => ticked.includes(s.id));
    const toggle = (id) => setTicked((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));

    // old btn_Print_AR: needs the SOA + at least one ticked service
    const printAr = () => {
        if (!t) return notify("Please select transaction", "error");
        const ids = rows.filter((s) => ticked.includes(s.id)).map((s) => s.id);
        if (!ids.length) return notify("Please select service", "error");
        setPrintIds(ids);
    };

    const addRow = () => setServiceForm({
        id: null, trans_number: transNumber, ser_list_id: "", ser_fee_id: null, prep_target_date: today(),
        service_fee: "", qty: "1", less: "", surcharge: "", orig_fee: null,
    });
    const editRow = (s) => setServiceForm({
        id: s.id, trans_number: s.trans_number, ser_list_id: String(s.ser_list_id || ""), ser_fee_id: s.ser_fee_id,
        prep_target_date: s.prep_target_date || today(), service_fee: String(s.service_fee), qty: String(s.qty),
        less: s.less ? String(s.less) : "", surcharge: s.surcharge ? String(s.surcharge) : "", orig_fee: s.service_fee,
    });

    return (
        <div className="bd">
            {/* ---------- account + period ---------- */}
            <section className="card bd-filters bd-rar-filters">
                <div className="bd-filter bd-filter-wide">
                    <span className="field-label">Trade name</span>
                    <SearchSelect value={caid} onChange={setCaid} options={accountOpts} searchPlaceholder="Search client, branch or trade name..." aria-label="Trade name" />
                </div>
                <div className="bd-filter">
                    <span className="field-label">Service period</span>
                    <SearchSelect value={transNumber} onChange={setTransNumber} options={periodOpts} disabled={!account}
                        searchPlaceholder="Search period..." aria-label="Service period" />
                </div>
                <div className="bd-filter-actions">
                    <button className="btn" onClick={load} disabled={!transNumber || loading}>{loading ? "Loading…" : "Refresh"}</button>
                </div>
                {account && (
                    <p className="bd-info">
                        <span><b>{accountOpts.find((o) => o.value === String(caid))?.hint}</b></span>
                        <span>TIN <b>{account.tin || "—"}</b></span>
                        <span>{account.branch_type || "—"}</span>
                        <span>{[account.street, account.barangay, account.city, account.province].filter(Boolean).join(", ") || "No address"}</span>
                    </p>
                )}
            </section>

            {/* ---------- SOA strip ---------- */}
            <section className="card bd-soa">
                <div className="bd-soa-id">
                    <span className="muted small">SOA #</span>
                    <b className="mono">{t?.trans_number || "—"}</b>
                    <span className="muted small">{t?.service_period || (caid ? "Select a service period" : "Select a trade name")}</span>
                    {t?.is_paid && <Badge tone="green">SOA closed</Badge>}
                </div>
                <div className="bd-totals">
                    <div className="bd-total">
                        <h4>EO #</h4>
                        <dl><dt>Engagement order</dt><dd className="mono">{t?.eo_num || "—"}</dd></dl>
                    </div>
                    <div className="bd-total">
                        <h4>Returns & others</h4>
                        <dl><dt>Items</dt><dd>{rows.length}</dd><dt>Total amount</dt><dd>{n2(total)}</dd></dl>
                    </div>
                    <div className="bd-total">
                        <h4>Selected for AR</h4>
                        <dl><dt>Items</dt><dd>{ticked.length}</dd><dt>Amount</dt><dd>{n2(tickedTotal)}</dd></dl>
                    </div>
                </div>
            </section>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

            {/* ---------- returns & others ---------- */}
            <section className="card bd-body">
                <div className="bd-tabs" role="tablist">
                    <button role="tab" aria-selected="true" className="is-on">
                        Returns & others {t && !loading && <span className="bd-count">{rows.length}</span>}
                    </button>
                    <button className="btn btn-primary bd-add" onClick={addRow} disabled={!t || !lk} title={t ? "" : "Pick a trade name and a service period first"}>
                        + Add returns and others
                    </button>
                </div>

                <div className="bd-scroll">
                    {!t && !loading && (
                        <div className="bd-pick">
                            <b>{caid ? "Select a service period" : "Select a trade name"}</b>
                            <span>Pick a trade name and its service period above to see its returns and other charges.</span>
                        </div>
                    )}
                    {loading && <p className="bd-empty">Loading…</p>}
                    {t && !loading && (
                        <table className="bd-table">
                            <thead>
                                <tr>
                                    <th className="c"><input type="checkbox" aria-label="Select all" checked={allTicked} disabled={!rows.length}
                                        onChange={(e) => setTicked(e.target.checked ? rows.map((s) => s.id) : [])} /></th>
                                    <th>Service</th><th className="n">Due date</th><th className="n">Unit price</th><th className="n">Qty</th>
                                    <th className="n">Less</th><th className="n">Surcharge (%)</th><th className="n">Total</th><th />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 && <tr><td colSpan={9} className="bd-empty">No returns or other charges yet. Click + Add returns and others.</td></tr>}
                                {rows.map((s) => (
                                    <tr key={s.id} className="bd-row" onClick={() => editRow(s)}>
                                        <td className="c" onClick={(e) => e.stopPropagation()}>
                                            <input type="checkbox" aria-label={`Select ${s.service}`} checked={ticked.includes(s.id)} onChange={() => toggle(s.id)} />
                                        </td>
                                        <td className="bd-svc" title={s.service}>{s.service}</td>
                                        <td className="n">{s.prep_target_date || "—"}</td>
                                        <td className="n">{n2(s.service_fee)}</td>
                                        <td className="n">{Number(s.qty) || 0}</td>
                                        <td className="n">{n2(s.less)}</td>
                                        <td className="n">{n2(s.surcharge)}</td>
                                        <td className="n strong">{n2(s.total_service_fee)}</td>
                                        <td className="c" onClick={(e) => e.stopPropagation()}>
                                            <button className="btn btn-sm" onClick={() => setOptionsFor(s)} title="VAT, withholding, discount, note">⋯</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {rows.length > 0 && (
                                <tfoot>
                                    <tr><td /><td colSpan={6}>Total · {rows.length} item{rows.length === 1 ? "" : "s"}</td><td className="n">{n2(total)}</td><td /></tr>
                                </tfoot>
                            )}
                        </table>
                    )}
                </div>
            </section>

            {/* ---------- footer ---------- */}
            <footer className="bd-foot">
                <div className="bd-foot-group">
                    <span className="muted">Total amount</span> <b className="mono">₱{n2(total)}</b>
                </div>
                <div className="bd-foot-group">
                    <button className="btn btn-info" onClick={printAr} disabled={!t || loading}>Print AR</button>
                    <button className="btn" onClick={load} disabled={!transNumber || loading}>Refresh</button>
                </div>
            </footer>

            {serviceForm && lk && (
                <ServiceModal initial={serviceForm} lk={lk} transNumber={serviceForm.trans_number} freePrice
                    onClose={() => setServiceForm(null)} onSaved={(m) => { setServiceForm(null); notify(m); load(); }} />
            )}
            {printIds && <PrintArModal transNumber={t?.trans_number || transNumber} ids={printIds} onClose={() => setPrintIds(null)} />}
            {optionsFor && (
                <OptionsModal service={optionsFor} onClose={() => setOptionsFor(null)} onSaved={(m) => { setOptionsFor(null); notify(m); load(); }} />
            )}
        </div>
    );
}

/* ---------- Print AR preview (old merge.php → PrintAR.odt) ---------- */
function PrintArModal({ transNumber, ids, onClose }) {
    const [url, setUrl] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let alive = true;
        let objectUrl = "";
        apiBlob(`/billing/return-ar/${encodeURIComponent(transNumber)}/print?ids=${ids.join(",")}`)
            .then((blob) => { if (!alive) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
            .catch((e) => alive && setError(e.message || "Couldn't create the AR."));
        return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [transNumber, ids]);

    return (
        <Modal title="Print Preview · AR" onClose={onClose} size="lg"
            footer={<>
                {url && <a className="btn" href={url} download={`AR-${transNumber}.pdf`}>Download</a>}
                <button className="btn btn-dark" onClick={onClose}>Close</button>
            </>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            {!url && !error && <div className="bd-pdf-wait">Preparing AR…</div>}
            {url && <iframe className="bd-pdf" src={url} title="AR" />}
        </Modal>
    );
}