// Billing → Generate Billing (old pages/Billing/Generate_Billing + ajax/generate_billing.php)
// Recurring PF services (t_recurring_service) → one SOA per account for the service period + its services + sales invoices
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal, { Field } from "../../components/Modal";
import Badge from "../../components/Badge";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./BillingDashboard.css";
import "./ManualBill.css";

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const THIS_MONTH = TODAY.slice(0, 7);
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const monthLabel = (ym) => (ym ? new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase() : "");

export default function GenerateBilling() {
    const notify = useToast();
    const [repTypes, setRepTypes] = useState([]);
    const [repType, setRepType] = useState("");
    const [period, setPeriod] = useState(THIS_MONTH);
    const [query, setQuery] = useState("");
    const [show, setShow] = useState("all");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [open, setOpen] = useState(false);
    const [result, setResult] = useState(null);
    const [manual, setManual] = useState(false);

    useEffect(() => {
        apiFetch("/billing/generate/lookups")
            .then((d) => { setRepTypes(d.reporting_types || []); if (d.reporting_types?.[0]) setRepType(String(d.reporting_types[0].id)); })
            .catch((e) => setError(e.message || "Couldn't load the reporting types."));
    }, []);

    const load = useCallback(async () => {
        if (!repType) return;
        setLoading(true);
        setError("");
        try {
            setData(await apiFetch(`/billing/generate/preview?rep_type_id=${repType}&service_period=${period}`));
        } catch (e) {
            setError(e.message || "Couldn't load the accounts.");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [repType, period]);

    useEffect(() => { load(); }, [load]);

    const accounts = data?.accounts || [];
    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return accounts.filter((a) =>
            (show === "all" || (show === "billed" ? a.trans_number : !a.trans_number)) &&
            (!q || [a.client_num, a.client_name, a.trade_name, a.branch_code, a.trans_number, ...(a.service_names || [])].join(" ").toLowerCase().includes(q)));
    }, [accounts, query, show]);
    const toBill = accounts.filter((a) => !a.trans_number).length;

    return (
        <div className="bsv">
            <section className="card bsv-bar">
                <label className="bsv-field bsv-grow">
                    <span className="field-label">Search</span>
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client, trade name, branch, service, SOA no..." />
                </label>
                <label className="bsv-field bsv-sm">
                    <span className="field-label">Reporting type</span>
                    <select className="input" value={repType} onChange={(e) => setRepType(e.target.value)}>
                        {repTypes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                </label>
                <label className="bsv-field bsv-sm">
                    <span className="field-label">Service period</span>
                    <input className="input" type="month" value={period} max={THIS_MONTH} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
                </label>
                <label className="bsv-field bsv-sm">
                    <span className="field-label">Show</span>
                    <select className="input" value={show} onChange={(e) => setShow(e.target.value)}>
                        <option value="all">All</option>
                        <option value="new">Not yet billed</option>
                        <option value="billed">Already billed</option>
                    </select>
                </label>
                <div className="bsv-actions">
                    <button className="btn" onClick={load} disabled={loading || !repType}>{loading ? "Loading…" : "Refresh"}</button>
                    <button className="btn" onClick={() => setManual(true)}>Manual bill</button>
                    <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={!repType || !accounts.length}>Generate</button>
                </div>
            </section>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

            <section className="card bsv-body">
                <div className="bsv-scroll">
                    <table className="bsv-table">
                        <thead>
                            <tr>
                                <th>ID</th><th>Client</th><th>Trade name</th><th>Recurring services</th>
                                <th className="n">Total</th><th className="n">Net</th><th>{monthLabel(period)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <tr><td colSpan={7} className="bsv-empty">Loading…</td></tr>}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={7} className="bsv-empty">
                                    {accounts.length ? "Nothing matches the search." : <><b>No accounts to bill</b>No active client account has a recurring PF service with an amount for this reporting type.</>}
                                </td></tr>
                            )}
                            {!loading && rows.map((a) => (
                                <tr key={a.ca_id} className="bsv-row">
                                    <td className="mono">{a.client_num || a.ca_id}</td>
                                    <td className="bsv-name strong" title={a.client_name}>{a.client_name || "—"}</td>
                                    <td className="bsv-name" title={a.trade_name}>{a.trade_name || "—"}{a.branch_code ? ` | ${a.branch_code}` : ""}</td>
                                    <td className="bsv-name" title={(a.service_names || []).join(", ")}>
                                        <span className="bsv-tag">{a.services}</span> {(a.service_names || []).join(", ")}
                                    </td>
                                    <td className="n">{n2(a.total)}</td>
                                    <td className="n strong">{n2(a.net)}</td>
                                    <td>{a.trans_number ? <Badge tone="green">{a.trans_number}</Badge> : <Badge tone="gray">To bill</Badge>}</td>
                                </tr>
                            ))}
                        </tbody>
                        {!loading && accounts.length > 0 && (
                            <tfoot>
                                <tr>
                                    <td colSpan={4}>{accounts.length} account(s) · {toBill} not yet billed for {monthLabel(period)}</td>
                                    <td className="n">{n2(data.total)}</td><td className="n">{n2(data.net)}</td><td />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </section>

            {open && (
                <GenerateModal repTypes={repTypes} repType={repType} period={period} toBill={toBill}
                    onClose={() => setOpen(false)}
                    onDone={(res, p, r) => { setOpen(false); setResult(res); notify(res.message); setPeriod(p); setRepType(r); load(); }} />
            )}
            {result && <ResultModal result={result} onClose={() => setResult(null)} />}
            {manual && (
                <ManualBillModal onClose={() => setManual(false)}
                    onSaved={(res) => {
                        setManual(false);
                        notify(`${res.message} · ${res.trans_number}`);
                        if (res.no_customer) notify("No sales invoice was created — this account isn't linked to a customer in the firm's books.", "error");
                        load();
                    }} />
            )}
        </div>
    );
}

function GenerateModal({ repTypes, repType, period, toBill, onClose, onDone }) {
    const [f, setF] = useState({ date_start: TODAY, service_period: period, rep_type_id: repType });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [sure, setSure] = useState(false);
    const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setSure(false); };

    const run = async () => {
        setError("");
        if (!f.date_start || !f.service_period || !f.rep_type_id) return setError("Please provide all required data!");
        if (f.service_period > THIS_MONTH) return setError("Service period cannot be in the future.");
        if (!sure) return setSure(true);
        setBusy(true);
        try {
            const res = await apiFetch("/billing/generate", { method: "POST", body: JSON.stringify({ ...f, rep_type_id: Number(f.rep_type_id) }) });
            onDone(res, f.service_period, f.rep_type_id);
        } catch (e) {
            setError(e.message || "Couldn't generate the billing.");
            setBusy(false);
            setSure(false);
        }
    };

    return (
        <Modal title="Generate billing" onClose={() => !busy && onClose()} size="md"
            footer={<>
                <button className="btn" onClick={onClose} disabled={busy}>Close</button>
                <button className={`btn ${sure ? "btn-danger" : "btn-primary"}`} onClick={run} disabled={busy}>
                    {busy ? "Generating… don't close this page" : sure ? "Yes, generate" : "Generate"}
                </button>
            </>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="bsv-form">
                <Field label="Date *"><input className="input" type="date" value={f.date_start} onChange={(e) => set("date_start", e.target.value)} disabled={busy} /></Field>
                <Field label="Service period *"><input className="input" type="month" value={f.service_period} max={THIS_MONTH} onChange={(e) => set("service_period", e.target.value)} disabled={busy} /></Field>
                <div className="bsv-span">
                    <Field label="Reporting type *">
                        <select className="input" value={f.rep_type_id} onChange={(e) => set("rep_type_id", e.target.value)} disabled={busy}>
                            {repTypes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </Field>
                </div>
                {sure && (
                    <p className="bsv-span bsv-note" role="status">
                        This creates the {monthLabel(f.service_period)} SOA for every active account with recurring PF services
                        {f.service_period === period && f.rep_type_id === repType ? ` (${toBill} not yet billed)` : ""}, adds the services and creates their sales invoices.
                        Accounts already billed for that month only get the services they're missing. Continue?
                    </p>
                )}
            </div>
        </Modal>
    );
}

function ResultModal({ result, onClose }) {
    return (
        <Modal title={`Billing generated · ${result.period}`} onClose={onClose} size="md"
            footer={<button className="btn btn-primary" onClick={onClose}>OK</button>}>
            <dl className="bsv-sum">
                <dt>New SOAs</dt><dd>{result.soa_created}</dd>
                <dt>Services added</dt><dd>{result.services_added}</dd>
                <dt>Sales invoices created</dt><dd>{result.invoices_created}</dd>
                <dt>Accounts already billed (SOA reused)</dt><dd>{result.skipped_transactions?.length || 0}</dd>
            </dl>
            {result.no_customer?.length > 0 && (
                <p className="bsv-note">
                    No sales invoice for {result.no_customer.length} account(s) — they aren't linked to a customer in the firm's books
                    (account ID{result.no_customer.length === 1 ? "" : "s"}: {result.no_customer.join(", ")}).
                </p>
            )}
        </Modal>
    );
}

const blankLine = () => ({ key: Math.random().toString(36).slice(2), ser_list_id: "", ser_fee_id: null, prep_target_date: plusDays(5), service_fee: "", qty: "1" });

// old "GENERATE MANUAL BILLING": one account, picked services → SOA (R / EO / PF) + services + sales invoices
export function ManualBillModal({ onClose, onSaved, initialCaId = "" }) {
    const [lk, setLk] = useState(null);
    const [services, setServices] = useState([]);
    const [f, setF] = useState({ ca_id: initialCaId ? String(initialCaId) : "", trans_type_id: "", service_period: "", lines: [blankLine()] });
    const [account, setAccount] = useState(null);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
    const setLine = (key, patch) => setF((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

    useEffect(() => {
        apiFetch("/billing/manual/lookups").then(setLk).catch((e) => setError(e.message || "Couldn't load the lists."));
        apiFetch("/billing/lookups").then((d) => setServices(d.services || [])).catch(() => { });
    }, []);

    useEffect(() => {
        setAccount(null);
        if (f.ca_id) apiFetch(`/billing/accounts/${f.ca_id}`).then(setAccount).catch(() => { });
    }, [f.ca_id]);

    // two lines in the list: Client name / Branch code - Trade name
    const branchTrade = (a) => [a.branch_code, (a.trade_name || "").trim()].filter(Boolean).join(" - ") || "—";
    const accountOpts = useMemo(() => [{ value: "", label: "— Select trade name —" }, ...(lk?.accounts || [])
        .map((a) => ({ value: String(a.id), label: (a.client_name || "").trim() || "—", hint: branchTrade(a) }))
        .sort((x, y) => `${x.label} ${x.hint}`.localeCompare(`${y.label} ${y.hint}`))], [lk]);
    const picked = (lk?.accounts || []).find((a) => String(a.id) === String(f.ca_id));
    const serviceOpts = useMemo(() => [{ value: "", label: "— Select service —" }, ...services.map((s) => ({
        value: String(s.id), label: `${s.name}${Number(s.fee) ? ` · ${n2(s.fee)}` : ""}`,
    }))], [services]);

    const pickService = (key, v) => {
        const s = services.find((x) => String(x.id) === v);
        setLine(key, { ser_list_id: v, ser_fee_id: s?.fee_id || null, ...(s && Number(s.fee) ? { service_fee: String(Number(s.fee)) } : {}) });
    };

    // EO transaction (type 2) → only EO-YYYY periods; any other type → every period except EO
    const isEoPeriod = (p) => /^EO-/i.test(p);
    const periodOpts = [{ value: "", label: "— Select —" }, ...(lk?.service_periods || [])
        .filter((p) => (Number(f.trans_type_id) === 2 ? isEoPeriod(p) : !isEoPeriod(p)))
        .map((p) => ({ value: p, label: p }))];
    const pickType = (v) => setF((x) => ({
        ...x, trans_type_id: v,
        service_period: x.service_period && isEoPeriod(x.service_period) === (Number(v) === 2) ? x.service_period : "",
    }));

    const grand = f.lines.reduce((t, l) => t + num(l.service_fee) * num(l.qty), 0);

    const save = async () => {
        setError("");
        if (!f.ca_id) return setError("Trade Name is required");
        if (!f.trans_type_id) return setError("Transaction type is required");
        if (!f.service_period) return setError("Service Period is required");
        if (!f.lines.length) return setError("Service list is required");
        if (f.lines.some((l) => !l.ser_list_id)) return setError("Please select a service on every row");
        if (f.lines.some((l) => !l.prep_target_date)) return setError("Due date is required on every row");
        if (f.lines.some((l) => !(num(l.service_fee) > 0) || !(num(l.qty) > 0))) return setError("Unit price and qty are required on every row");
        if (!(grand > 0)) return setError("Total is required");
        setSaving(true);
        try {
            const res = await apiFetch("/billing/manual", {
                method: "POST",
                body: JSON.stringify({
                    ca_id: Number(f.ca_id), trans_type_id: Number(f.trans_type_id), service_period: f.service_period, eo_version: lk?.eo_version,
                    lines: f.lines.map((l) => ({ ser_list_id: Number(l.ser_list_id), ser_fee_id: l.ser_fee_id || null, prep_target_date: l.prep_target_date, service_fee: num(l.service_fee), qty: num(l.qty) })),
                }),
            });
            onSaved(res, f.ca_id);
        } catch (e) {
            setError(e.message || "Couldn't save.");
            setSaving(false);
        }
    };

    return (
        <Modal title="Generate manual billing" onClose={() => !saving && onClose()} size="lg"
            footer={<>
                <span className="bsv-left muted small">Enter = next row · a new row is added at the end</span>
                <button className="btn" onClick={onClose} disabled={saving}>Close</button>
                <button className="btn btn-primary" onClick={save} disabled={saving || !lk}>{saving ? "Processing…" : "Generate"}</button>
            </>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            {!lk && !error && <p className="bsv-empty">Loading…</p>}
            {lk && (
                <>
                    {/* EO version is not shown – it's still sent on save (lk.eo_version) */}
                    <div className="bsv-mb-head mb-head3">
                        <div className="field bsv-mb-account">
                            <span className="field-label">Trade name *</span>
                            <SearchSelect value={f.ca_id} onChange={(v) => set("ca_id", v)} options={accountOpts} searchPlaceholder="Search trade name, branch or client..." aria-label="Trade name" />
                        </div>
                        <Field label="Transaction type *">
                            <select className="input" value={f.trans_type_id} onChange={(e) => pickType(e.target.value)}>
                                <option value="">— Select —</option>
                                {lk.trans_types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </Field>
                        <div className="field bsv-mb-account">
                            <span className="field-label">Service period *</span>
                            <SearchSelect value={f.service_period} onChange={(v) => set("service_period", v)} options={periodOpts}
                                searchPlaceholder="Search period..." aria-label="Service period" />
                        </div>
                    </div>

                    {account && (
                        <p className="bsv-info">
                            {picked && <span><b>{branchTrade(picked)}</b></span>}
                            <span>TIN <b>{account.tin || "—"}</b></span>
                            <span>{account.branch_type || "—"}</span>
                            <span>{[account.street, account.barangay, account.city, account.province].filter(Boolean).join(", ") || "No address"}</span>
                        </p>
                    )}

                    {/* Excel-like grid: gridlines, cells you type straight into · Enter = next row (adds one at the end) */}
                    <div className="mb-sheet">
                        <table className="mb-grid">
                            <colgroup><col className="w-n" /><col /><col className="w-d" /><col className="w-p" /><col className="w-q" /><col className="w-t" /><col className="w-x" /></colgroup>
                            <thead>
                                <tr><th className="c">#</th><th>Service <i>*</i></th><th>Due date <i>*</i></th><th className="n">Unit price <i>*</i></th><th className="n">Qty <i>*</i></th><th className="n">Total</th><th /></tr>
                            </thead>
                            <tbody>
                                {f.lines.length === 0 && <tr><td colSpan={7} className="mb-empty">No services yet – click <b>+ Add row</b>.</td></tr>}
                                {f.lines.map((l, i) => {
                                    const total = num(l.service_fee) * num(l.qty);
                                    const nextOrAdd = (e) => {
                                        if (e.key !== "Enter") return;
                                        e.preventDefault();
                                        const col = e.currentTarget.dataset.col;
                                        const next = e.currentTarget.closest("tbody").querySelectorAll(`[data-col="${col}"]`)[i + 1];
                                        if (next) next.focus();
                                        else { set("lines", [...f.lines, blankLine()]); setTimeout(() => e.target.closest("tbody")?.querySelectorAll(`[data-col="${col}"]`)[i + 1]?.focus(), 30); }
                                    };
                                    return (
                                        <tr key={l.key} className={!l.ser_list_id ? "is-blank" : ""}>
                                            <td className="c mb-rn">{i + 1}</td>
                                            <td className="mb-svc">
                                                <SearchSelect variant="cell" value={l.ser_list_id} onChange={(v) => pickService(l.key, v)} options={serviceOpts}
                                                    placeholder="Select service…" searchPlaceholder="Search service..." aria-label={`Service row ${i + 1}`} />
                                            </td>
                                            <td><input className="mb-cell" type="date" data-col="date" value={l.prep_target_date} onKeyDown={nextOrAdd}
                                                onChange={(e) => setLine(l.key, { prep_target_date: e.target.value })} aria-label={`Due date row ${i + 1}`} /></td>
                                            <td><input className="mb-cell n" inputMode="decimal" data-col="price" value={l.service_fee} placeholder="0.00" onKeyDown={nextOrAdd}
                                                onFocus={(e) => e.target.select()} onChange={(e) => setLine(l.key, { service_fee: cleanNum(e.target.value) })} aria-label={`Unit price row ${i + 1}`} /></td>
                                            <td><input className="mb-cell n" inputMode="decimal" data-col="qty" value={l.qty} onKeyDown={nextOrAdd}
                                                onFocus={(e) => e.target.select()} onChange={(e) => setLine(l.key, { qty: cleanNum(e.target.value) })} aria-label={`Qty row ${i + 1}`} /></td>
                                            <td className="n mb-total">{total ? n2(total) : "-"}</td>
                                            <td className="c"><button type="button" className="mb-del" onClick={() => set("lines", f.lines.filter((x) => x.key !== l.key))} aria-label={`Remove row ${i + 1}`} title="Remove row">✕</button></td>
                                        </tr>
                                    );
                                })}
                                <tr className="mb-addrow">
                                    <td className="c">+</td>
                                    <td colSpan={6}><button type="button" onClick={() => set("lines", [...f.lines, blankLine()])}>Add row</button></td>
                                </tr>
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td />
                                    <td>{f.lines.length} service{f.lines.length === 1 ? "" : "s"}</td>
                                    <td /><td />
                                    <td className="n">Total ₱</td>
                                    <td className="n mb-grand">{n2(grand)}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </>
            )}
        </Modal>
    );
}