import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Modal, { Field } from "../../components/Modal";
import SearchSelect from "../../components/SearchSelect";
import Icon from "../../components/Icons";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { useLookups } from "../../context/LookupsContext";
import TableSkeleton from "../../components/TableSkeleton";
const TABLE_HEIGHT = "calc(100vh - 330px)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-05-05 11:28:00" -> "May 05 2026 11:28AM"
const fmtDateTime = (v) => {
    if (!v) return "—";
    const [d, t = "00:00"] = String(v).split(" ");
    const [y, m, day] = d.split("-").map(Number);
    let [h, min] = t.split(":").map(Number);
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${MONTHS[m - 1]} ${String(day).padStart(2, "0")} ${y} ${h}:${String(min).padStart(2, "0")}${ap}`;
};

// 123456789 -> 123-456-789 (same as old TIN input)
const fmtTin = (v) => String(v || "").replace(/\D/g, "").slice(0, 9).replace(/(\d{3})(?=\d)/g, "$1-");
const NA = (v) => (v === null || v === undefined || v === "" ? "N/A" : v);

// Email / Viber / Messenger / WeChat / WhatsApp / Telegram (m_social_list) – placeholder + color per app
const SOCIAL_HINT = {
    email: ["name@company.com", "#2563eb"],
    viber: ["09XX XXX XXXX", "#7360f2"],
    messenger: ["facebook.com/username or name", "#0084ff"],
    wechat: ["WeChat ID", "#07c160"],
    whatsapp: ["+63 9XX XXX XXXX", "#25d366"],
    telegram: ["@username or +63 9XX…", "#229ed9"],
};
const hintOf = (name) => SOCIAL_HINT[String(name || "").toLowerCase()] || ["", "#64748b"];

/* =========================================================
   Setup → Customers / Vendors  (userType = "Customer" | "Vendor")
   ========================================================= */
export default function Contacts({ userType }) {
    const { user } = useAuth();
    const { refresh: refreshLookups } = useLookups();
    const notify = useToast();
    const type = userType.toLowerCase(); // customer | vendor

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [form, setForm] = useState(null); // null | {} (new) | row (edit)
    const [opts, setOpts] = useState({ branch_types: [], tax_types: [], clients: [], can_sync: false, social_list: [] });

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setRows(await apiFetch(`/contacts/${type}`));
        } catch (e) {
            setError(e.message || `Couldn't load ${type}s.`);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [type]);

    useEffect(() => { load(); }, [load, user?.id, user?.caid]);

    useEffect(() => {
        apiFetch("/contacts-lookups").then(setOpts).catch(() => { });
    }, [user?.id, user?.caid]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) =>
            [r.name, r.tin, r.branch_code, r.branch_type, r.tax_type, r.address, r.city_country].join(" ").toLowerCase().includes(q)
        );
    }, [rows, query]);

    const setDefault = async (r) => {
        if (r.is_default) return;
        try {
            const res = await apiFetch(`/contacts/${type}/${r.id}/default`, { method: "POST" });
            notify(res.message);
            load();
            refreshLookups?.();
        } catch (e) {
            notify(e.message || "Couldn't update.", "error");
        }
    };

    const columns = [
        {
            key: "name",
            label: `${userType} Name`,
            render: (r) => (
                <span className="contact-name">
                    <Trunc text={NA(r.name)} className="strong" max={260} />
                    {r.link_caid > 0 && (
                        <span className="contact-link" title="Linked" aria-label="Linked">
                            <Icon name="link" size={14} />
                        </span>
                    )}
                </span>
            ),
        },
        { key: "tin", label: "TIN", render: (r) => <span className="mono">{NA(r.tin)}</span> },
        { key: "branch_code", label: "Branch Code", render: (r) => NA(r.branch_code) },
        { key: "branch_type", label: "Branch Type", render: (r) => NA(r.branch_type) },
        { key: "tax_type", label: "Tax Registration", render: (r) => NA(r.tax_type) },
        { key: "address", label: "Street and Barangay", render: (r) => <Trunc text={NA(r.address)} max={200} /> },
        { key: "city_country", label: "City/Municipality/Province/Country", render: (r) => <Trunc text={NA(r.city_country)} max={220} /> },
        {
            key: "is_default",
            label: "Default",
            align: "center",
            value: (r) => (r.is_default ? 1 : 0),
            render: (r) => (
                <label className="switch" onClick={(e) => e.stopPropagation()} title={r.is_default ? "Default" : "Set as default"}>
                    <input type="checkbox" checked={!!r.is_default} onChange={() => setDefault(r)} aria-label={`Default ${type}`} />
                    <span className="switch-track" />
                </label>
            ),
        },
        { key: "created_at", label: "Date Time Entry", render: (r) => fmtDateTime(r.created_at) },
    ];

    const actions = [
        { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
        { label: "New", icon: "plus", variant: "primary", onClick: () => setForm({}) },
    ];

    return (
        <>
            <SearchCard
                query={query}
                setQuery={setQuery}
                placeholder={`Search ${type} name, TIN or address...`}
                actions={actions}
                sticky
            />

            {error && (
                <div className="alert-error" role="alert">
                    {error} <button className="btn btn-sm" onClick={load}>Try again</button>
                </div>
            )}
            {loading ? (
                <TableSkeleton columns={columns} bodyHeight={TABLE_HEIGHT} pillKeys={["is_default"]} label={`Loading ${type}s`} />
            ) : (
                <div className="sales-table">
                    <DataTable
                        bodyHeight={TABLE_HEIGHT}
                        columns={columns}
                        rows={filtered}
                        rowKey="id"
                        exportName={`${type}s`}
                        showToolbar={false}
                        emptyText={`No ${type}s yet.`}
                        onRowClick={(r) => setForm(r)}
                        rowActions={(r) => [
                            { label: "Edit", onClick: () => setForm(r) },
                            ...(!r.is_default ? [{ label: "Set as default", onClick: () => setDefault(r) }] : []),
                        ]}
                    />
                </div>
            )}

            {form && (
                <ContactForm
                    userType={userType}
                    record={form.id ? form : null}
                    opts={opts}
                    onClose={() => setForm(null)}
                    onSave={async (body) => {
                        const res = form.id
                            ? await apiFetch(`/contacts/${type}/${form.id}`, { method: "PUT", body: JSON.stringify(body) })
                            : await apiFetch(`/contacts/${type}`, { method: "POST", body: JSON.stringify(body) });
                        notify(res.message);
                        setForm(null);
                        load();
                        refreshLookups?.(); // invoice dropdowns pick up the change
                    }}
                />
            )}
        </>
    );
}

/* =========================================================
   New / Edit popup (also used by Sales → New Customer)
   ========================================================= */
export function ContactForm({ userType, record, opts: optsProp, defaultName = "", onClose, onSave }) {
    // dropdowns: passed in (Setup page) or loaded here (invoice page)
    const [opts, setOpts] = useState(optsProp || { branch_types: [], tax_types: [], clients: [], can_sync: false, social_list: [] });
    useEffect(() => {
        if (optsProp) {
            setOpts(optsProp);
            return;
        }
        apiFetch("/contacts-lookups").then(setOpts).catch(() => { });
    }, [optsProp]);

    const [f, setF] = useState(() => ({
        link_caid: record?.link_caid ? String(record.link_caid) : "",
        name: record?.name || defaultName || "",
        tin: record?.tin || "",
        branch_code: record?.branch_code || "",
        branch_type_id: record?.branch_type_id ? String(record.branch_type_id) : "",
        tax_type_id: record?.tax_type_id ? String(record.tax_type_id) : "",
        address: record?.address || "",
        city_country: record?.city_country || "",
    }));
    // contact channels, per app: { [social_list_id]: ["value", …] }
    const [socials, setSocials] = useState(() => {
        const m = {};
        (record?.socials || []).forEach((x) => { (m[x.social_list_id] ||= []).push(x.value || ""); });
        return m;
    });
    const socialList = opts.social_list || [];
    const valuesOf = (id) => (socials[id]?.length ? socials[id] : [""]);       // every app shows one box
    const setValue = (id, i, v) => setSocials((m) => { const a = [...valuesOf(id)]; a[i] = v; return { ...m, [id]: a }; });
    const addValue = (id) => setSocials((m) => ({ ...m, [id]: [...valuesOf(id), ""] }));
    const delValue = (id, i) => setSocials((m) => { const a = valuesOf(id).filter((_, j) => j !== i); return { ...m, [id]: a.length ? a : [""] }; });
    const filled = Object.values(socials).flat().filter((v) => String(v).trim()).length;
    const [errors, setErrors] = useState({});
    const [saveError, setSaveError] = useState("");
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

    // Sync Client: fill the form from the selected branch (old doGetSyncClient)
    const pickClient = async (caid) => {
        set("link_caid", caid);
        if (!caid) return;
        try {
            const c = await apiFetch(`/contacts-sync/${caid}`);
            setF((x) => ({
                ...x,
                link_caid: caid,
                name: c.name || "",
                tin: fmtTin(c.tin),
                branch_code: c.branch_code || "",
                branch_type_id: c.branch_type_id ? String(c.branch_type_id) : "",
                tax_type_id: c.tax_type_id ? String(c.tax_type_id) : "",
                address: c.address || "",
                city_country: c.city_country || "",
            }));
        } catch (e) {
            setSaveError(e.message || "Couldn't load the client.");
        }
    };

    const submit = async () => {
        const e = {};
        if (!f.name.trim()) e.name = `${userType} Name is required.`;
        else if (/[^a-zA-Z0-9\s.,\-&']/.test(f.name)) e.name = `${userType} Name contains invalid special characters.`;
        if (!f.branch_code.trim()) e.branch_code = "Branch Code is required.";
        if (!f.branch_type_id) e.branch_type_id = "Branch Type is required.";
        const mailId = socialList.find((x) => String(x.name).toLowerCase() === "email")?.id;
        const badMail = mailId && valuesOf(mailId).find((v) => v.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()));
        if (badMail) e.socials = `Not a valid email: ${badMail}`;
        setErrors(e);
        if (Object.keys(e).length) return;

        setSaving(true);
        setSaveError("");
        try {
            await onSave({
                link_caid: f.link_caid ? Number(f.link_caid) : 0,
                name: f.name.trim(),
                tin: f.tin || null,
                branch_code: f.branch_code.trim(),
                branch_type_id: Number(f.branch_type_id),
                tax_type_id: f.tax_type_id ? Number(f.tax_type_id) : null,
                address: f.address.trim() || null,
                city_country: f.city_country.trim() || null,
                ...(socialList.length ? {
                    socials: socialList.flatMap((x) => valuesOf(x.id).map((v) => v.trim()).filter(Boolean)
                        .map((v) => ({ social_list_id: Number(x.id), value: v }))),
                } : {}),
            });
        } catch (err) {
            setSaveError(err.message || "Couldn't save.");
            setSaving(false);
        }
    };

    return (
        <Modal
            title={record ? `Edit ${userType}` : `New ${userType}`}
            onClose={onClose}
            size={socialList.length ? "lg" : "sm"}
            footer={
                <>
                    <button className="btn" onClick={onClose} disabled={saving}>Close</button>
                    <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                </>
            }
        >
            {saveError && <div className="alert-error" role="alert">{saveError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: socialList.length ? "repeat(auto-fit, minmax(300px, 1fr))" : "1fr", gap: 22, alignItems: "start" }}>
                <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                    {opts.can_sync && (
                        <div className="field">
                            <span className="field-label">Sync Client</span>
                            <SearchSelect
                                value={f.link_caid}
                                onChange={pickClient}
                                options={[
                                    { value: "", label: "— None —" },
                                    ...opts.clients.map((c) => ({
                                        value: String(c.id),
                                        label: `${c.client_name} - ${c.branch_code} : ${c.trade_name}`,
                                    })),
                                ]}
                                searchPlaceholder="Search client..."
                                aria-label="Sync Client"
                            />
                        </div>
                    )}

                    <Field label={`${userType} Name`} error={errors.name}>
                        <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus />
                    </Field>
                    <Field label="TIN">
                        <input className="input mono" value={f.tin} onChange={(e) => set("tin", fmtTin(e.target.value))} placeholder="000-000-000" inputMode="numeric" />
                    </Field>
                    <Field label="Branch Code" error={errors.branch_code}>
                        <input className="input" maxLength={10} value={f.branch_code} onChange={(e) => set("branch_code", e.target.value)} />
                    </Field>
                    <div className="field">
                        <span className="field-label">Branch Type</span>
                        <SearchSelect
                            value={f.branch_type_id}
                            onChange={(v) => set("branch_type_id", v)}
                            options={[{ value: "", label: "— Select —" }, ...opts.branch_types.map((b) => ({ value: String(b.id), label: b.name }))]}
                            aria-label="Branch Type"
                        />
                        {errors.branch_type_id && <div className="field-error">{errors.branch_type_id}</div>}
                    </div>
                    <div className="field">
                        <span className="field-label">Tax Registration</span>
                        <SearchSelect
                            value={f.tax_type_id}
                            onChange={(v) => set("tax_type_id", v)}
                            options={[{ value: "", label: "— None —" }, ...opts.tax_types.map((t) => ({ value: String(t.id), label: t.name }))]}
                            aria-label="Tax Registration"
                        />
                    </div>
                    <Field label="Street and Barangay">
                        <input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} />
                    </Field>
                    <Field label="City/Municipality/Province/Country">
                        <input className="input" value={f.city_country} onChange={(e) => set("city_country", e.target.value)} />
                    </Field>

                </div>

                {/* ---------- right: contact channels (one row per app) ---------- */}
                {socialList.length > 0 && (
                    <section style={{ border: "1px solid var(--border, #e2e8f0)", borderRadius: 14, padding: 14, background: "var(--surface-2, #f8fafc)" }}>
                        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                            <span style={{ fontWeight: 700 }}>Contact channels</span>
                            <span className="muted small">{filled ? `${filled} saved` : "used by Send via"}</span>
                        </header>
                        <div style={{ display: "grid", gap: 10 }}>
                            {socialList.map((x) => {
                                const [ph, color] = hintOf(x.name);
                                const isMail = String(x.name).toLowerCase() === "email";
                                const vals = valuesOf(x.id);
                                return (
                                    <div key={x.id} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 10, alignItems: "start", padding: 10, borderRadius: 12, background: "var(--surface, #fff)", border: "1px solid var(--border, #e2e8f0)" }}>
                                        <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, background: color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800 }}>
                                            {isMail
                                                ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                                                : String(x.name).slice(0, 1)}
                                        </span>
                                        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <span style={{ fontWeight: 600, fontSize: 13 }}>{x.name}</span>
                                                <button type="button" onClick={() => addValue(x.id)}
                                                    style={{ border: 0, background: "none", color, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}>
                                                    + Add another
                                                </button>
                                            </div>
                                            {vals.map((v, i) => (
                                                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                    <input className="input" value={v} placeholder={ph} maxLength={255} type={isMail ? "email" : "text"}
                                                        onChange={(e) => setValue(x.id, i, e.target.value)} aria-label={`${x.name} ${i + 1}`}
                                                        style={{ flex: 1, minWidth: 0, height: 36, borderColor: v.trim() ? color : undefined }} />
                                                    {(vals.length > 1 || v) && (
                                                        <button type="button" className="icon-btn ghost" onClick={() => delValue(x.id, i)} aria-label={`Remove ${x.name}`} title="Remove">✕</button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {errors.socials && <div className="field-error" style={{ marginTop: 8 }}>{errors.socials}</div>}
                    </section>
                )}
            </div>
        </Modal>
    );
}

/* ---------- Text cut with "…"; tooltip only when it's actually cut ---------- */
function Trunc({ text, className = "", max }) {
    const ref = useRef(null);
    const [cut, setCut] = useState(false);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const check = () => setCut(el.scrollWidth > el.clientWidth);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [text]);

    return (
        <span ref={ref} className={`cell-trunc ${className}`} style={max ? { maxWidth: max } : undefined} title={cut ? text : undefined}>
            {text}
        </span>
    );
}