// Billing → Service List (old pages/Billing/Service_List: m_service_list + m_service_fee)
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal, { Field } from "../../components/Modal";
import Badge from "../../components/Badge";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./BillingDashboard.css";

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

// field → label (same order as the old modal)
const LOOKUPS = [
    ["item_tax_type_id", "Tax type"],
    ["item_tax_desc_id", "Tax type desc"],
    ["ser_type_id", "Service type *"],
    ["rep_type_id", "Reporting type"],
    ["submission_id", "Frequency"],
    ["institution_id", "Institution"],
    ["trans_type_id", "Transaction type"],
];
const EMPTY = { id: null, name: "", service_fee: "", is_active: true, ...Object.fromEntries(LOOKUPS.map(([k]) => [k, ""])) };

export default function ServiceList() {
    const notify = useToast();
    const [rows, setRows] = useState([]);
    const [lk, setLk] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [active, setActive] = useState("all");
    const [form, setForm] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try { setRows(await apiFetch("/billing/service-list")); }
        catch (e) { setError(e.message || "Couldn't load services."); setRows([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        load();
        apiFetch("/billing/service-list/lookups").then(setLk).catch(() => setLk({}));
    }, [load]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((r) =>
            (active === "all" || (active === "yes" ? r.is_active : !r.is_active)) &&
            (!q || [r.id, r.name, r.ser_type_name, r.rep_type_name, r.institution_name, r.item_tax_type_name].join(" ").toLowerCase().includes(q)));
    }, [rows, query, active]);

    const edit = (r) => setForm({
        id: r.id, name: r.name || "", service_fee: r.service_fee ? String(r.service_fee) : "", is_active: !!r.is_active,
        ...Object.fromEntries(LOOKUPS.map(([k]) => [k, r[k] ? String(r[k]) : ""])),
    });

    return (
        <div className="bsv">
            <section className="card bsv-bar">
                <label className="bsv-field bsv-grow">
                    <span className="field-label">Search</span>
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID, service, type, institution..." />
                </label>
                <label className="bsv-field bsv-sm">
                    <span className="field-label">Active</span>
                    <select className="input" value={active} onChange={(e) => setActive(e.target.value)}>
                        <option value="all">All</option>
                        <option value="yes">Active</option>
                        <option value="no">Inactive</option>
                    </select>
                </label>
                <div className="bsv-actions">
                    <button className="btn" onClick={load} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
                    <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })} disabled={!lk}>+ Add service</button>
                </div>
            </section>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

            <section className="card bsv-body">
                <div className="bsv-scroll">
                    <table className="bsv-table">
                        <thead>
                            <tr>
                                <th>ID</th><th>Service</th><th>Tax type</th><th>Tax type desc</th><th>Service type</th>
                                <th>Reporting type</th><th>Institution</th><th className="n">Service fee</th><th className="c">Active</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <tr><td colSpan={9} className="bsv-empty">Loading…</td></tr>}
                            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="bsv-empty">{rows.length ? "Nothing matches the search." : "No services yet. Click + Add service."}</td></tr>}
                            {!loading && filtered.map((r) => (
                                <tr key={r.id} className={`bsv-row${r.is_active ? "" : " is-off"}`} onClick={() => edit(r)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && edit(r)}>
                                    <td className="mono">{r.id}</td>
                                    <td className="bsv-name strong" title={r.name}>{r.name}</td>
                                    <td>{r.item_tax_type_name || "N/A"}</td>
                                    <td>{r.item_tax_desc_name || "N/A"}</td>
                                    <td>{r.ser_type_name || "N/A"}</td>
                                    <td>{r.rep_type_name || "N/A"}</td>
                                    <td>{r.institution_name || "N/A"}</td>
                                    <td className="n">{n2(r.service_fee)}</td>
                                    <td className="c"><Badge tone={r.is_active ? "green" : "gray"}>{r.is_active ? "YES" : "NO"}</Badge></td>
                                </tr>
                            ))}
                        </tbody>
                        {!loading && filtered.length > 0 && (
                            <tfoot><tr><td colSpan={9}>{filtered.length} of {rows.length} service{rows.length === 1 ? "" : "s"}</td></tr></tfoot>
                        )}
                    </table>
                </div>
            </section>

            {form && lk && <ServiceListModal initial={form} lk={lk} onClose={() => setForm(null)} onSaved={(m) => { setForm(null); notify(m); load(); }} />}
        </div>
    );
}

function ServiceListModal({ initial, lk, onClose, onSaved }) {
    const [f, setF] = useState(initial);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

    const save = async () => {
        setError("");
        if (!f.name.trim()) return setError("Service is required");
        if (!f.ser_type_id) return setError("Service Type is required");
        setSaving(true);
        try {
            const body = {
                name: f.name.trim(), service_fee: Number(f.service_fee) || 0, is_active: f.is_active,
                ...Object.fromEntries(LOOKUPS.map(([k]) => [k, f[k] ? Number(f[k]) : null])),
            };
            const res = await apiFetch(f.id ? `/billing/service-list/${f.id}` : "/billing/service-list", { method: f.id ? "PUT" : "POST", body: JSON.stringify(body) });
            onSaved(res.message);
        } catch (e) {
            setError(e.message || "Couldn't save.");
            setSaving(false);
        }
    };

    return (
        <Modal title={f.id ? "Update service list" : "Add service list"} onClose={() => !saving && onClose()} size="md"
            footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="bsv-form">
                <div className="bsv-span"><Field label="Service *"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field></div>
                {LOOKUPS.map(([k, label]) => (
                    <Field key={k} label={label}>
                        <select className="input" value={f[k]} onChange={(e) => set(k, e.target.value)}>
                            <option value="">—</option>
                            {(lk[k] || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    </Field>
                ))}
                <Field label="Service fee"><input className="input ta-right" inputMode="decimal" value={f.service_fee} onChange={(e) => set("service_fee", cleanNum(e.target.value))} placeholder="0.00" /></Field>
                <label className="bsv-check bsv-span"><input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
            </div>
        </Modal>
    );
}