// Billing → Recurring Service (t_recurring_service): services billed to an account every period, per EO version
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import SearchSelect from "../../components/SearchSelect";
import Badge from "../../components/Badge";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./BillingDashboard.css";

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const DISC = { SC: ["Senior Citizen", 0.2], SP: ["Solo Parent", 0.1], PWD: ["Person w/ Disability", 0.2], Others: ["Others", 0] };
const discOf = (r) => (Number(r.d_less_sc) ? "SC" : Number(r.d_less_sp) ? "SP" : Number(r.d_less_pwd) ? "PWD" : Number(r.d_less_others) ? "Others" : "");

export default function RecurringService() {
    const notify = useToast();
    const [accounts, setAccounts] = useState([]);
    const [services, setServices] = useState([]);
    const [caid, setCaid] = useState("");
    const [account, setAccount] = useState(null);
    const [version, setVersion] = useState("");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState(null);
    const [confirmCopy, setConfirmCopy] = useState(false);

    useEffect(() => {
        apiFetch("/billing/account-list").then(setAccounts).catch(() => { });
        apiFetch("/billing/lookups").then((d) => setServices(d.services || [])).catch(() => { });
    }, []);

    useEffect(() => {
        setAccount(null); setVersion(""); setData(null);
        if (caid) apiFetch(`/billing/accounts/${caid}`).then(setAccount).catch(() => { });
    }, [caid]);

    const load = useCallback(async (v = version) => {
        setLoading(true);
        setError("");
        try {
            const d = await apiFetch(caid ? `/billing/recurring?ca_id=${caid}${v ? `&eo_version=${v}` : ""}` : "/billing/recurring");
            setData(d);
            setVersion(d.eo_version ? String(d.eo_version) : "");
        } catch (e) {
            setError(e.message || "Couldn't load the recurring services.");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [caid, version]);

    useEffect(() => { load(""); }, [caid]); // eslint-disable-line react-hooks/exhaustive-deps

    const accountOpts = useMemo(() => [{ value: "", label: "— All accounts —" }, ...accounts.map((a) => ({
        value: String(a.id), label: `${a.client_name || "—"} — ${a.trade_name || "—"}${a.branch_code ? ` | ${a.branch_code}` : ""}`,
    }))], [accounts]);
    const versions = data?.versions?.length ? data.versions : data ? [data.eo_version] : [];
    const rows = data?.rows || [];
    const all = !caid;
    const cols = all ? 10 : 9;

    const toggle = async (r) => {
        try {
            const res = await apiFetch(`/billing/recurring/${r.id}/toggle`, { method: "POST" });
            notify(res.message);
            load();
        } catch (e) { notify(e.message, "error"); }
    };

    const copyVersion = async () => {
        setConfirmCopy(false);
        try {
            const res = await apiFetch("/billing/recurring/copy", { method: "POST", body: JSON.stringify({ ca_id: Number(caid), from_version: Number(version) }) });
            notify(res.message);
            load(String(res.eo_version));
        } catch (e) { notify(e.message, "error"); }
    };

    const blank = () => ({ id: null, ser_list_id: "", ser_fee_id: null, qty: "1", service_fee: "", less: "", surcharge: "", d_vat: false, d_witholding: false, discount: "", pct: "", is_active: true });
    const edit = (r) => setForm({
        id: r.id, ca_id: r.ca_id, eo_version: r.eo_version, ser_list_id: String(r.ser_list_id || ""), ser_fee_id: r.ser_fee_id, qty: String(r.qty), service_fee: String(r.service_fee),
        less: r.less ? String(r.less) : "", surcharge: r.surcharge ? String(r.surcharge) : "", d_vat: !!Number(r.d_vat), d_witholding: !!Number(r.d_witholding),
        discount: discOf(r), pct: r.less_other_percentage ? String(r.less_other_percentage) : "", is_active: !!r.is_active,
    });

    return (
        <div className="bsv">
            <section className="card bsv-bar">
                <div className="bsv-field bsv-grow">
                    <span className="field-label">Account (client — trade name | branch)</span>
                    <SearchSelect value={caid} onChange={setCaid} options={accountOpts} searchPlaceholder="Search client, trade name or branch..." aria-label="Account" />
                </div>
                <label className="bsv-field bsv-sm">
                    <span className="field-label">EO version</span>
                    <select className="input" value={version} disabled={all || !data} onChange={(e) => { setVersion(e.target.value); load(e.target.value); }}>
                        {all ? <option value="">Latest</option> : versions.map((v) => <option key={v} value={v}>Version {v}</option>)}
                    </select>
                </label>
                <div className="bsv-actions">
                    <button className="btn" onClick={() => setConfirmCopy(true)} disabled={all || !rows.some((r) => r.is_active)} title="Copy the active services into a new EO version">New EO version</button>
                    <button className="btn" onClick={() => load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
                    <button className="btn btn-primary" onClick={() => setForm(blank())} disabled={all || !data} title={all ? "Select an account first" : undefined}>+ Add service</button>
                </div>
                {account && (
                    <p className="bsv-info">
                        <span>TIN <b>{account.tin || "—"}</b></span>
                        <span>{account.branch_type || "—"}</span>
                        <span>{[account.street, account.barangay, account.city, account.province].filter(Boolean).join(", ") || "No address"}</span>
                    </p>
                )}
            </section>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={() => load()}>Try again</button></div>}

            <section className="card bsv-body">
                <div className="bsv-scroll">
                    <table className="bsv-table">
                        <thead>
                            <tr>
                                {all && <th>Account</th>}
                                <th>Service</th><th className="n">Qty</th><th className="n">Unit price</th><th className="n">Less</th><th className="n">Surcharge (%)</th>
                                <th>Options</th><th className="n">Total</th><th className="c">Active</th><th />
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <tr><td colSpan={cols} className="bsv-empty">Loading…</td></tr>}
                            {!loading && data && rows.length === 0 && <tr><td colSpan={cols} className="bsv-empty">{all ? "No recurring services with an amount." : "No recurring services on this EO version. Click + Add service."}</td></tr>}
                            {!loading && rows.map((r) => {
                                const d = discOf(r);
                                return (
                                    <tr key={r.id} className={`bsv-row${r.is_active ? "" : " is-off"}`} onClick={() => edit(r)}>
                                        {all && (
                                            <td>
                                                <div className="bsv-who">
                                                    <b>{r.client_name || "—"}</b>
                                                    <small>{r.trade_name || "—"}{r.branch_code ? ` | ${r.branch_code}` : ""} · v{r.eo_version}</small>
                                                </div>
                                            </td>
                                        )}
                                        <td className="bsv-name strong" title={r.service}>{r.service}</td>
                                        <td className="n">{r.qty}</td>
                                        <td className="n">{n2(r.service_fee)}</td>
                                        <td className="n">{r.less ? n2(r.less) : ""}</td>
                                        <td className="n">{r.surcharge ? n2(r.surcharge) : ""}</td>
                                        <td>
                                            <span className="bsv-tags">
                                                {!!Number(r.d_vat) && <span className="bsv-tag">VAT {n2(r.vat)}</span>}
                                                {!!Number(r.d_witholding) && <span className="bsv-tag">WH ({n2(r.wh)})</span>}
                                                {d && <span className="bsv-tag">{DISC[d][0]}{d === "Others" ? ` ${r.less_other_percentage}%` : ""} ({n2(r.discount)})</span>}
                                            </span>
                                        </td>
                                        <td className="n strong">{n2(r.net)}</td>
                                        <td className="c"><Badge tone={r.is_active ? "green" : "gray"}>{r.is_active ? "YES" : "NO"}</Badge></td>
                                        <td className="c" onClick={(e) => e.stopPropagation()}>
                                            <button className="btn btn-sm" onClick={() => toggle(r)}>{r.is_active ? "Turn off" : "Turn on"}</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {!loading && rows.length > 0 && (
                            <tfoot><tr><td colSpan={all ? 7 : 6}>Per period · {rows.filter((r) => r.is_active).length} active service(s)</td><td className="n">{n2(data.total)}</td><td /><td /></tr></tfoot>
                        )}
                    </table>
                </div>
            </section>

            {form && (
                <RecurringModal initial={form} services={services} caid={form.ca_id || caid} version={form.eo_version || version}
                    onClose={() => setForm(null)} onSaved={(m) => { setForm(null); notify(m); load(); }} />
            )}
            {confirmCopy && (
                <ConfirmDialog title="Create a new EO version?" message={`The active services of version ${version} are copied into a new version.`}
                    confirmLabel="Create" onCancel={() => setConfirmCopy(false)} onConfirm={copyVersion} />
            )}
        </div>
    );
}

function RecurringModal({ initial, services, caid, version, onClose, onSaved }) {
    const [f, setF] = useState(initial);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
    const opts = [{ value: "", label: "— Select service —" }, ...services.map((s) => ({ value: String(s.id), label: `${s.name}${Number(s.fee) ? ` · ${n2(s.fee)}` : ""}` }))];

    const gross = num(f.service_fee) * num(f.qty);
    const total = gross - num(f.less) + gross * (num(f.surcharge) / 100);
    const vat = f.d_vat ? total * 0.12 : 0;
    const wh = f.d_witholding ? total * 0.05 : 0;
    const rate = f.discount === "Others" ? num(f.pct) / 100 : f.discount ? DISC[f.discount][1] : 0;
    const disc = (total + vat - wh) * rate;
    const net = total + vat - wh - disc;

    const pickService = (v) => {
        const s = services.find((x) => String(x.id) === v);
        setF((x) => ({ ...x, ser_list_id: v, ser_fee_id: s?.fee_id || null, service_fee: s && Number(s.fee) ? String(Number(s.fee)) : x.service_fee }));
    };

    const save = async () => {
        setError("");
        if (!f.ser_list_id) return setError("Please select service");
        if (!(num(f.service_fee) > 0)) return setError("Please input unit price");
        if (!(num(f.qty) >= 1)) return setError("Qty must be at least 1");
        setSaving(true);
        try {
            const body = {
                ca_id: Number(caid), eo_version: Number(version), ser_list_id: Number(f.ser_list_id), ser_fee_id: f.ser_fee_id || null,
                qty: Math.round(num(f.qty)), service_fee: num(f.service_fee), less: num(f.less), surcharge: num(f.surcharge),
                d_vat: f.d_vat, d_witholding: f.d_witholding, discount: f.discount || null,
                less_other_percentage: f.discount === "Others" ? num(f.pct) : 0, is_active: f.is_active,
            };
            const res = await apiFetch(f.id ? `/billing/recurring/${f.id}` : "/billing/recurring", { method: f.id ? "PUT" : "POST", body: JSON.stringify(body) });
            onSaved(res.message);
        } catch (e) {
            setError(e.message || "Couldn't save.");
            setSaving(false);
        }
    };

    return (
        <Modal title={`${f.id ? "Edit" : "Add"} recurring service · EO version ${version}`} onClose={() => !saving && onClose()} size="md"
            footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="bsv-form">
                <div className="field bsv-span"><span className="field-label">Service *</span>
                    <SearchSelect value={f.ser_list_id} onChange={pickService} options={opts} searchPlaceholder="Search service..." aria-label="Service" /></div>
                <Field label="Unit price *"><input className="input ta-right" inputMode="decimal" value={f.service_fee} onChange={(e) => set("service_fee", cleanNum(e.target.value))} /></Field>
                <Field label="Qty"><input className="input ta-right" inputMode="numeric" value={f.qty} onChange={(e) => set("qty", e.target.value.replace(/\D/g, ""))} /></Field>
                <Field label="Less"><input className="input ta-right" inputMode="decimal" value={f.less} onChange={(e) => set("less", cleanNum(e.target.value))} placeholder="0.00" /></Field>
                <Field label="Surcharge (%)"><input className="input ta-right" inputMode="decimal" value={f.surcharge} onChange={(e) => set("surcharge", cleanNum(e.target.value))} placeholder="0" /></Field>

                <fieldset className="bsv-opts bsv-span">
                    <legend>Options</legend>
                    <label className="bsv-check"><input type="checkbox" checked={f.d_vat} onChange={(e) => set("d_vat", e.target.checked)} /> Value added tax (12%)</label>
                    <label className="bsv-check"><input type="checkbox" checked={f.d_witholding} onChange={(e) => set("d_witholding", e.target.checked)} /> Withholding (5%)</label>
                    {Object.entries(DISC).map(([k, [label, r]]) => (
                        <label key={k} className="bsv-check">
                            <input type="radio" name="rs-disc" checked={f.discount === k} onChange={() => set("discount", k)} onClick={() => f.discount === k && set("discount", "")} />
                            Less: {label}{r ? ` (${r * 100}%)` : ""}
                            {k === "Others" && <input className="input bsv-pct" inputMode="decimal" disabled={f.discount !== "Others"} value={f.pct} onChange={(e) => set("pct", cleanNum(e.target.value))} placeholder="%" aria-label="Discount %" />}
                        </label>
                    ))}
                </fieldset>

                <dl className="bsv-sum bsv-span">
                    <dt>Service total</dt><dd>{n2(total)}</dd>
                    {f.d_vat && <><dt>VAT</dt><dd>{n2(vat)}</dd></>}
                    {f.d_witholding && <><dt>Withholding</dt><dd>({n2(wh)})</dd></>}
                    {f.discount && <><dt>Discount</dt><dd>({n2(disc)})</dd></>}
                    <dt className="strong">Billed per period</dt><dd className="bsv-net">{n2(net)}</dd>
                </dl>
                <label className="bsv-check bsv-span"><input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
            </div>
        </Modal>
    );
}