// Client → Masterlist popups: the Settings screens (same sections, same st- / ba- / tm- classes) for any client
import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Modal from "../../components/Modal";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./ClientCoa.css";

const SECTIONS = [
    ["profile", "Profile"],
    ["contact", "Contact"],
    ["address", "Address"],
    ["ownership", "Business Ownership"],
    ["classification", "Classification & Compliance"],
    ["engagement", "Engagement"],
    ["ids", "Valid IDs"],
    ["accounts", "Business Accounts"],
];
const INSTITUTIONS = ["BIR", "SSS", "PHILHEALTH", "PAG-IBIG", "DTI", "SEC", "MAYOR'S PERMIT", "OTHERS"];
const TIN_RE = /^\d{3}-\d{3}-\d{3}$/;
const fmtTin = (v) => String(v || "").replace(/\D/g, "").slice(0, 9).replace(/(\d{3})(?=\d)/g, "$1-");
const isBir = (inst) => String(inst || "").toUpperCase() === "BIR";
const fmtIdFor = (inst, v) => (isBir(inst) ? fmtTin(v) : v);
const CLIENT_FIELDS = [
    "last_name", "first_name", "middle_name", "suffix", "gender", "birthdate", "civ_stat_id", "status_id",
    "phone_num", "tell_num", "email_address", "street", "province_id", "city_id", "brgy_id",
    "business_ownership_type_id", "business_ownership_type_detail_id", "classification_id", "industries_id",
    "date_of_engagement", "date_of_disengagement", "date_started", "date_registered",
];
export const EMPTY_ACCOUNT = {
    id: 0, trade_name: "", nob_id: "", branch_type: "BRANCH", branch_code: "0000", tax_registration: "", rdo: "",
    status_id: "", street: "", province_id: "", city_id: "", brgy_id: "", phone_num: "", tell_num: "", email_address: "", is_active: true,
};

const str = (v) => (v === null || v === undefined ? "" : String(v));
const day = (v) => (v ? String(v).slice(0, 10) : "");
const opts = (list, blank = "—") => [{ value: "", label: blank }, ...(list || []).map((o) => ({ value: String(o.id), label: o.label }))];
export const isMain = (a) => String(a?.branch_type || "").toUpperCase() === "MAIN";
export const isActive = (a) => Number(a?.is_active ?? 1) === 1;

const toForm = (c) => ({
    client_num: str(c?.client_num),
    ...Object.fromEntries(CLIENT_FIELDS.map((k) => [k, str(c?.[k])])),
    birthdate: day(c?.birthdate),
    date_of_engagement: day(c?.date_of_engagement),
    date_of_disengagement: day(c?.date_of_disengagement),
    date_started: day(c?.date_started),
    date_registered: day(c?.date_registered),
    compliance_ids: str(c?.compliance_ids).split(",").map((x) => x.trim()).filter(Boolean),
    is_top_withholding_agent: Number(c?.is_top_withholding_agent || 0) === 1,
});

// keep only simple formatting tags from stored HTML (same as Settings)
const ALLOWED = new Set(["P", "UL", "OL", "LI", "BR", "B", "STRONG", "I", "EM", "U"]);
function cleanHtml(html) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    const walk = (node) => {
        [...node.childNodes].forEach((n) => {
            if (n.nodeType === 1) {
                if (!ALLOWED.has(n.tagName)) { walk(n); n.replaceWith(...n.childNodes); }
                else { [...n.attributes].forEach((a) => n.removeAttribute(a.name)); walk(n); }
            } else if (n.nodeType !== 3) {
                n.remove();
            }
        });
    };
    walk(doc.body);
    doc.body.querySelectorAll("p").forEach((p) => { if (!p.textContent.trim()) p.remove(); });
    return doc.body.innerHTML;
}
const hasHtml = (s) => /<[a-z][\s\S]*>/i.test(String(s || ""));
function toSections(html) {
    const clean = cleanHtml(html);
    if (!clean) return [];
    const doc = new DOMParser().parseFromString(clean, "text/html");
    const out = [];
    let cur = null;
    [...doc.body.children].forEach((el) => {
        const text = el.textContent.replace(/\s+/g, " ").trim();
        if (!text) return;
        if (el.tagName === "P") { cur = { title: text.replace(/:$/, ""), items: [] }; out.push(cur); }
        else if (el.tagName === "UL" || el.tagName === "OL") {
            const items = [...el.querySelectorAll("li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
            if (!cur) { cur = { title: "", items: [] }; out.push(cur); }
            cur.items.push(...items);
        } else out.push({ title: "", items: [text] });
    });
    return out.map((s) => (s.items.length ? s : { title: "", items: [s.title] }));
}

/* ---------- Province → City → Barangay (uses the Settings endpoints) ---------- */
const cityCache = {};
const brgyCache = {};
function AddressPicker({ provinces, value, onChange, idPrefix }) {
    const [cities, setCities] = useState(cityCache[value.province_id] || []);
    const [brgys, setBrgys] = useState(brgyCache[value.city_id] || []);

    useEffect(() => {
        if (!value.province_id) { setCities([]); return; }
        if (cityCache[value.province_id]) { setCities(cityCache[value.province_id]); return; }
        apiFetch(`/settings/cities?province_id=${value.province_id}`)
            .then((r) => { cityCache[value.province_id] = r; setCities(r); }).catch(() => setCities([]));
    }, [value.province_id]);

    useEffect(() => {
        if (!value.city_id) { setBrgys([]); return; }
        if (brgyCache[value.city_id]) { setBrgys(brgyCache[value.city_id]); return; }
        apiFetch(`/settings/barangays?city_id=${value.city_id}`)
            .then((r) => { brgyCache[value.city_id] = r; setBrgys(r); }).catch(() => setBrgys([]));
    }, [value.city_id]);

    const zip = cities.find((c) => String(c.id) === String(value.city_id))?.zip_code || "";
    return (
        <div className="st-grid">
            <div className="field">
                <span className="field-label">Province</span>
                <SearchSelect value={str(value.province_id)} options={opts(provinces, "Select province")} aria-label="Province"
                    onChange={(v) => onChange({ province_id: v, city_id: "", brgy_id: "" })} />
            </div>
            <div className="field">
                <span className="field-label">City / Municipality</span>
                <SearchSelect value={str(value.city_id)} options={opts(cities, value.province_id ? "Select city" : "Choose a province first")}
                    aria-label="City" disabled={!value.province_id} onChange={(v) => onChange({ city_id: v, brgy_id: "" })} />
            </div>
            <div className="field">
                <span className="field-label">Barangay</span>
                <SearchSelect value={str(value.brgy_id)} options={opts(brgys, value.city_id ? "Select barangay" : "Choose a city first")}
                    aria-label="Barangay" disabled={!value.city_id} onChange={(v) => onChange({ brgy_id: v })} />
            </div>
            <label className="field">
                <span className="field-label">ZIP code</span>
                <input id={`${idPrefix}-zip`} className="input" value={zip} readOnly tabIndex={-1} placeholder="From the city" />
            </label>
        </div>
    );
}

/* =========================================================
   Client popup = the Settings page for one client
   clientNum null → new client
   ========================================================= */
export function ClientPopup({ clientNum, L, hasRdo, onClose, onChanged }) {
    const notify = useToast();
    const [num, setNum] = useState(clientNum);
    const [data, setData] = useState(clientNum ? null : { client: null, accounts: [], valid_ids: [] });
    const [error, setError] = useState("");
    const [section, setSection] = useState("profile");
    const [form, setForm] = useState(clientNum ? null : toForm({}));
    const [saved, setSaved] = useState(clientNum ? null : JSON.stringify(toForm({})));
    const [saving, setSaving] = useState(false);
    const [askSave, setAskSave] = useState(false);
    const [askClose, setAskClose] = useState(false);
    const [openDetail, setOpenDetail] = useState(null);

    const [acct, setAcct] = useState(null);
    const [delAcct, setDelAcct] = useState(null);
    const [accQ, setAccQ] = useState("");
    const [accFilter, setAccFilter] = useState("all");

    const [newId, setNewId] = useState({ institution: "BIR", id_num: "" });
    const [idBusy, setIdBusy] = useState(false);
    const [delId, setDelId] = useState(null);
    const [editId, setEditId] = useState(null);
    const [editBusy, setEditBusy] = useState(false);
    const panelRef = useRef(null);

    const load = async (n = num) => {
        setError("");
        try {
            const r = await apiFetch(`/clients/${encodeURIComponent(n)}`);
            setData(r);
            const f = toForm(r.client);
            setForm(f);
            setSaved(JSON.stringify(f));
        } catch (e) {
            setError(e.message || "Couldn't load the client.");
        }
    };
    useEffect(() => { if (clientNum) load(clientNum); }, [clientNum]); // eslint-disable-line react-hooks/exhaustive-deps

    const isNew = !num;
    const dirty = !!form && (saved !== JSON.stringify(form) || (isNew && (data?.accounts || []).length > 0));
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));
    const go = (key) => { setSection(key); panelRef.current?.scrollTo?.({ top: 0 }); };
    const close = () => (dirty ? setAskClose(true) : onClose());

    const clientName = useMemo(() => {
        if (!form) return "";
        return [form.last_name && `${form.last_name},`, form.first_name, form.middle_name, form.suffix].filter(Boolean).join(" ");
    }, [form]);
    const mainAccount = data?.accounts?.find(isMain) || data?.accounts?.[0];
    const bot = (L.bot || []).find((b) => String(b.id) === form?.business_ownership_type_id);

    const accCounts = useMemo(() => {
        const list = data?.accounts || [];
        return {
            all: list.length, main: list.filter(isMain).length, branch: list.filter((a) => !isMain(a)).length,
            active: list.filter(isActive).length, inactive: list.filter((a) => !isActive(a)).length,
        };
    }, [data?.accounts]);

    const shownAccounts = useMemo(() => {
        const q = accQ.trim().toLowerCase();
        return (data?.accounts || [])
            .filter((a) => accFilter === "all" || (accFilter === "main" && isMain(a)) || (accFilter === "branch" && !isMain(a)) || (accFilter === "inactive" && !isActive(a)))
            .filter((a) => !q || [a.trade_name, a.branch_code, a.nature_label, a.tax_registration, a.rdo, a.email_address].some((v) => String(v || "").toLowerCase().includes(q)))
            .sort((a, b) => (Number(isMain(b)) - Number(isMain(a))) || String(a.branch_code).localeCompare(String(b.branch_code), undefined, { numeric: true }));
    }, [data?.accounts, accQ, accFilter]);

    /* ---------- save client ---------- */
    // required: last name, client status, cellphone, business ownership type, at least 1 business account
    const missing = () => {
        if (!form.last_name.trim()) return ["profile", "Last name is required."];
        if (!form.status_id) return ["profile", "Client status is required."];
        if (!form.phone_num.trim()) return ["contact", "Cellphone number is required."];
        if (!form.province_id) return ["address", "Province is required."];
        if (!form.city_id) return ["address", "City / municipality is required."];
        if (!form.brgy_id) return ["address", "Barangay is required."];
        if (!String(form.street || "").trim()) return ["address", "Street name / district is required."];
        if (!form.business_ownership_type_id) return ["ownership", "Business ownership type is required."];
        if (!form.classification_id) return ["classification", "Classification is required."];
        if (!form.compliance_ids.length) return ["classification", "Select at least one compliance."];
        if (!(data?.accounts || []).length) return ["accounts", "Add at least one business account."];
        if (isNew && !(data?.valid_ids || []).length) return ["ids", "Add at least one valid ID."];
        return null;
    };
    const askToSave = () => {
        const m = missing();
        if (m) { go(m[0]); notify(m[1], "error"); return; }
        setAskSave(true);
    };

    const saveClient = async () => {
        setAskSave(false);
        const m = missing();
        if (m) { go(m[0]); notify(m[1], "error"); return; }
        setSaving(true);
        try {
            const body = { ...form };
            Object.keys(body).forEach((k) => { if (body[k] === "") body[k] = null; });
            body.compliance_ids = form.compliance_ids.map(Number);
            body.is_top_withholding_agent = !!form.is_top_withholding_agent;
            delete body.client_num;                       // the server assigns / keeps the client #
            if (isNew) body.accounts = data.accounts.map(({ id, _draft, status_label, nature_label, ...a }) => a);   // saved together with the new client
            if (isNew) body.valid_ids = data.valid_ids.map((v) => ({ institution: v.institution, id_num: v.id_num }));  // required on a new client
            const r = await apiFetch(isNew ? "/clients" : `/clients/${encodeURIComponent(num)}`, { method: isNew ? "POST" : "PUT", body: JSON.stringify(body) });
            const f = toForm(r.client);
            setForm(f);
            setSaved(JSON.stringify(f));
            setData((d) => ({ ...d, client: r.client, ...(r.accounts ? { accounts: r.accounts } : {}), ...(r.valid_ids ? { valid_ids: r.valid_ids } : {}) }));
            if (isNew) setNum(r.client.client_num);
            notify(r.message || "Client saved.");
            onChanged?.();
        } catch (e) {
            notify(e.message || "Couldn't save the client.", "error");
        } finally {
            setSaving(false);
        }
    };

    /* ---------- valid IDs ---------- */
    const addId = async () => {
        if (!newId.id_num.trim()) { notify("Enter the ID number.", "error"); return; }
        if (isBir(newId.institution) && !TIN_RE.test(newId.id_num)) { notify("Enter the TIN as 000-000-000 (9 digits).", "error"); return; }
        if (isNew) {   // new client: kept here, saved together with the client
            setData((d) => ({ ...d, valid_ids: [...d.valid_ids, { id: `draft-${Date.now()}`, _draft: true, institution: newId.institution.toUpperCase(), id_num: newId.id_num.trim() }] }));
            setNewId((s) => ({ ...s, id_num: "" }));
            return;
        }
        setIdBusy(true);
        try {
            const r = await apiFetch(`/clients/${encodeURIComponent(num)}/valid-ids`, { method: "POST", body: JSON.stringify(newId) });
            setData((d) => ({ ...d, valid_ids: r.valid_ids }));
            setNewId((s) => ({ ...s, id_num: "" }));
            notify("ID added.");
        } catch (e) { notify(e.message || "Couldn't add the ID.", "error"); } finally { setIdBusy(false); }
    };
    const removeId = async () => {
        const v = delId;
        setDelId(null);
        if (v._draft) { setData((d) => ({ ...d, valid_ids: d.valid_ids.filter((x) => x.id !== v.id) })); return; }
        try {
            const r = await apiFetch(`/client-valid-ids/${v.id}`, { method: "DELETE" });
            setData((d) => ({ ...d, valid_ids: r.valid_ids }));
            notify("ID removed.");
        } catch (e) { notify(e.message || "Couldn't remove the ID.", "error"); }
    };
    const saveEditId = async () => {
        if (!editId.id_num.trim()) { notify("Enter the ID number.", "error"); return; }
        if (isBir(editId.institution) && !TIN_RE.test(editId.id_num)) { notify("Enter the TIN as 000-000-000 (9 digits).", "error"); return; }
        if (String(editId.id).startsWith("draft-")) {
            setData((d) => ({ ...d, valid_ids: d.valid_ids.map((x) => (x.id === editId.id ? { ...x, institution: editId.institution.toUpperCase(), id_num: editId.id_num.trim() } : x)) }));
            setEditId(null);
            return;
        }
        setEditBusy(true);
        try {
            const r = await apiFetch(`/client-valid-ids/${editId.id}`, { method: "PUT", body: JSON.stringify({ institution: editId.institution, id_num: editId.id_num }) });
            setData((d) => ({ ...d, valid_ids: r.valid_ids }));
            setEditId(null);
            notify("ID updated.");
        } catch (e) { notify(e.message || "Couldn't update the ID.", "error"); } finally { setEditBusy(false); }
    };

    const title = isNew ? "Add client" : (mainAccount?.trade_name || clientName || "Client");

    return (
        <Modal title={title} onClose={close} size="xlg"
            footer={
                <div className="tm-foot cml-pop-foot">
                    {dirty && <span className="st-dirty">Unsaved changes</span>}
                    <button className="btn" onClick={close}>Close</button>
                    <button className="btn" onClick={() => setForm(JSON.parse(saved))} disabled={!dirty || saving}>Discard</button>
                    <button className="btn btn-primary" onClick={askToSave} disabled={!dirty || saving}>
                        {saving ? "Saving…" : isNew ? "Add client" : "Save changes"}
                    </button>
                </div>
            }>
            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={() => load()}>Try again</button></div>}
            {!form && !error && (
                <div className="st-loading">{Array.from({ length: 6 }).map((_, i) => <span key={i} className="sk sk-cell" style={{ width: `${90 - i * 10}%` }} />)}</div>
            )}

            {form && (
                <div className="cml-pop">
                    <div className="st-id cml-pop-id">
                        <span className="st-avatar" aria-hidden="true">{(form.last_name || "?")[0]}{(form.first_name || "")[0] || ""}</span>
                        <div>
                            <p className="st-sub">{clientName || "New client"} · <span className="mono">{num || "Client # is assigned on save"}</span></p>
                        </div>
                    </div>

                    <div className="st-layout">
                        <nav className="card st-nav" aria-label="Client sections">
                            {SECTIONS.map(([k, l]) => {
                                const locked = false;   // Valid IDs can be added before the first save (required)
                                return (
                                    <button key={k} type="button" className={`st-nav-item ${section === k ? "is-active" : ""}`} disabled={locked}
                                        title={locked ? "Save the client first" : undefined}
                                        aria-current={section === k ? "page" : undefined} onClick={() => go(k)}>
                                        <span>{l}</span>
                                        {k === "accounts" && <span className="st-badge">{data.accounts.length}</span>}
                                        {k === "ids" && <span className={`st-badge${isNew && !data.valid_ids.length ? " is-required" : ""}`}>{data.valid_ids.length}</span>}
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="card st-panel" ref={panelRef}>
                            {section === "profile" && (
                                <>
                                    <h2 className="st-h">Profile</h2>
                                    <div className="st-grid">
                                        <label className="field">
                                            <span className="field-label">Last name <b className="st-req">*</b></span>
                                            <input className="input" value={form.last_name} onChange={(e) => set({ last_name: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span className="field-label">First name</span>
                                            <input className="input" value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span className="field-label">Middle name</span>
                                            <input className="input" value={form.middle_name} onChange={(e) => set({ middle_name: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span className="field-label">Suffix</span>
                                            <input className="input" value={form.suffix} placeholder="Jr., Sr., III…" onChange={(e) => set({ suffix: e.target.value })} />
                                        </label>
                                        <div className="field">
                                            <span className="field-label">Gender</span>
                                            <div className="st-seg" role="radiogroup" aria-label="Gender">
                                                {["MALE", "FEMALE"].map((g) => (
                                                    <button key={g} type="button" role="radio" aria-checked={form.gender === g}
                                                        className={`st-seg-btn ${form.gender === g ? "is-active" : ""}`} onClick={() => set({ gender: g })}>
                                                        {g === "MALE" ? "Male" : "Female"}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <label className="field">
                                            <span className="field-label">Date of birth</span>
                                            <input type="date" className="input" value={form.birthdate} onChange={(e) => set({ birthdate: e.target.value })} />
                                        </label>
                                        <div className="field">
                                            <span className="field-label">Civil status</span>
                                            <SearchSelect value={form.civ_stat_id} options={opts(L.civil)} onChange={(v) => set({ civ_stat_id: v })} aria-label="Civil status" />
                                        </div>
                                        <div className="field">
                                            <span className="field-label">Client status <b className="st-req">*</b></span>
                                            <SearchSelect value={form.status_id} options={opts(L.status)} onChange={(v) => set({ status_id: v })} aria-label="Client status" />
                                        </div>
                                    </div>
                                    <p className="st-note"><b className="st-req">*</b> Required</p>
                                </>
                            )}

                            {section === "contact" && (
                                <>
                                    <h2 className="st-h">Contact</h2>
                                    <div className="st-grid">
                                        <label className="field">
                                            <span className="field-label">Cellphone number <b className="st-req">*</b></span>
                                            <input className="input" inputMode="tel" value={form.phone_num} onChange={(e) => set({ phone_num: e.target.value })} />
                                        </label>
                                        <label className="field">
                                            <span className="field-label">Telephone number</span>
                                            <input className="input" inputMode="tel" value={form.tell_num} onChange={(e) => set({ tell_num: e.target.value })} />
                                        </label>
                                        <label className="field st-span2">
                                            <span className="field-label">Email address</span>
                                            <input className="input" type="email" value={form.email_address} onChange={(e) => set({ email_address: e.target.value })} />
                                        </label>
                                    </div>
                                </>
                            )}

                            {section === "address" && (
                                <>
                                    <h2 className="st-h">Client address <b className="st-req">*</b></h2>
                                    <p className="st-note st-note-top">Province, city / municipality, barangay and street are required.</p>
                                    <AddressPicker idPrefix="client" provinces={L.provinces}
                                        value={{ province_id: form.province_id, city_id: form.city_id, brgy_id: form.brgy_id }} onChange={(p) => set(p)} />
                                    <label className="field st-mt">
                                        <span className="field-label">Street name / district <b className="st-req">*</b></span>
                                        <textarea className="input st-textarea" rows={3} value={form.street} onChange={(e) => set({ street: e.target.value })} />
                                    </label>
                                </>
                            )}

                            {section === "ownership" && (
                                <>
                                    <h2 className="st-h">Business ownership type <b className="st-req">*</b></h2>
                                    <div className="st-choices">
                                        {(L.bot || []).map((b) => {
                                            const on = form.business_ownership_type_id === String(b.id);
                                            return (
                                                <div key={b.id} className={`st-choice ${on ? "is-on" : ""}`}>
                                                    <label className="st-choice-main">
                                                        <input type="radio" name="bot" checked={on}
                                                            onChange={() => set({ business_ownership_type_id: String(b.id), business_ownership_type_detail_id: "" })} />
                                                        <span>{b.label}</span>
                                                    </label>
                                                    {on && b.details.length > 0 && (
                                                        <div className="st-choice-sub">
                                                            {b.details.map((d) => (
                                                                <label key={d.id} className="st-chip-radio">
                                                                    <input type="radio" name="bot-detail" checked={form.business_ownership_type_detail_id === String(d.id)}
                                                                        onChange={() => set({ business_ownership_type_detail_id: String(d.id) })} />
                                                                    <span>{d.label}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {!(L.bot || []).length && <p className="muted">No ownership types found.</p>}
                                    </div>
                                    {bot && (
                                        <p className="st-note">
                                            Selected: <b>{bot.label}</b>
                                            {form.business_ownership_type_detail_id && ` · ${bot.details.find((d) => String(d.id) === form.business_ownership_type_detail_id)?.label || ""}`}
                                        </p>
                                    )}

                                    <h2 className="st-h st-mt">Withholding</h2>
                                    <label className={`st-twa ${form.is_top_withholding_agent ? "is-on" : ""}`}>
                                        <span className="st-twa-text">
                                            <b>Top Withholding Agent (TWA)</b>
                                            <small>Classified by the BIR as a top withholding agent – withholds 1% on goods / 2% on services from its suppliers.</small>
                                        </span>
                                        <span className="st-switch">
                                            <input type="checkbox" role="switch" checked={!!form.is_top_withholding_agent}
                                                onChange={(e) => set({ is_top_withholding_agent: e.target.checked })} aria-label="Top Withholding Agent" />
                                            <i aria-hidden="true" />
                                        </span>
                                        <span className={`st-twa-state ${form.is_top_withholding_agent ? "is-yes" : ""}`}>{form.is_top_withholding_agent ? "Yes" : "No"}</span>
                                    </label>
                                </>
                            )}

                            {section === "classification" && (
                                <>
                                    <h2 className="st-h">Classification <b className="st-req">*</b></h2>
                                    <div className="st-classes" role="radiogroup" aria-label="Classification">
                                        {(L.classification || []).map((c) => {
                                            const on = form.classification_id === String(c.id);
                                            const sections = hasHtml(c.label)
                                                ? toSections(c.label)
                                                : [{ title: "", items: [c.label] }, ...(c.description && c.description !== c.label ? toSections(c.description) : [])];
                                            const MAX = 3;
                                            const expanded = openDetail === c.id;
                                            const shown = expanded ? sections : sections.slice(0, MAX);
                                            const hidden = sections.length - MAX;
                                            return (
                                                <label key={c.id} className={`st-class ${on ? "is-on" : ""} ${expanded ? "is-open" : ""}`}>
                                                    <input type="radio" name="classification" className="st-class-radio" checked={on}
                                                        onChange={() => set({ classification_id: String(c.id) })} />
                                                    <span className="st-class-check" aria-hidden="true">
                                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
                                                    </span>
                                                    <dl className="st-facts">
                                                        {shown.map((s, i) => (
                                                            <div key={i} className="st-fact">
                                                                <dt>{s.title ? s.title : "Note"}</dt>
                                                                <dd>{s.items.map((it, j) => <span key={j} className="st-fact-v" title={it}>{it}</span>)}</dd>
                                                            </div>
                                                        ))}
                                                    </dl>
                                                    {hidden > 0 && (
                                                        <button type="button" className="st-class-more" aria-expanded={expanded}
                                                            onClick={(e) => { e.preventDefault(); setOpenDetail(expanded ? null : c.id); }}>
                                                            {expanded ? "Show less" : `+ ${hidden} more`}
                                                        </button>
                                                    )}
                                                </label>
                                            );
                                        })}
                                        {!(L.classification || []).length && <p className="muted">No classifications found.</p>}
                                    </div>

                                    <h2 className="st-h st-mt">Compliance <b className="st-req">*</b> <span className={`st-h-note ${form.compliance_ids.length ? "muted" : "st-req"}`}>({form.compliance_ids.length ? `${form.compliance_ids.length} selected` : "pick at least one"})</span></h2>
                                    <div className="st-checks">
                                        {(L.compliance || []).map((c) => {
                                            const on = form.compliance_ids.includes(String(c.id));
                                            return (
                                                <label key={c.id} className={`st-check ${on ? "is-on" : ""}`}>
                                                    <input type="checkbox" checked={on}
                                                        onChange={(e) => set({
                                                            compliance_ids: e.target.checked ? [...form.compliance_ids, String(c.id)] : form.compliance_ids.filter((x) => x !== String(c.id)),
                                                        })} />
                                                    <span>{c.label}</span>
                                                </label>
                                            );
                                        })}
                                        {!(L.compliance || []).length && <p className="muted">No compliance items found.</p>}
                                    </div>
                                </>
                            )}

                            {section === "engagement" && (
                                <>
                                    <h2 className="st-h">Engagement</h2>
                                    <div className="st-grid">
                                        <div className="field st-span2">
                                            <span className="field-label">Industry</span>
                                            <SearchSelect value={form.industries_id} options={opts(L.industries)} onChange={(v) => set({ industries_id: v })} aria-label="Industry" />
                                        </div>
                                        {[["date_of_engagement", "Date of engagement"], ["date_of_disengagement", "Date of disengagement"], ["date_started", "Date started"], ["date_registered", "Date registered"]].map(([k, l]) => (
                                            <label key={k} className="field">
                                                <span className="field-label">{l}</span>
                                                <input type="date" className="input" value={form[k]} onChange={(e) => set({ [k]: e.target.value })} />
                                            </label>
                                        ))}
                                    </div>
                                </>
                            )}

                            {section === "ids" && (
                                <>
                                    <h2 className="st-h">Valid IDs{isNew && <> <b className="st-req">*</b></>}</h2>
                                    {isNew && <p className="st-note st-note-top">At least one valid ID is required to add the client. They're saved together with the client.</p>}
                                    <p className="st-note st-note-top">
                                        The <b>BIR</b> ID is the client's TIN. BIR Return, E-Sub Report and the Report Generator read it from here.
                                    </p>
                                    <div className="st-id-add">
                                        <div className="field">
                                            <span className="field-label">Institution</span>
                                            <SearchSelect value={newId.institution} options={INSTITUTIONS.map((x) => ({ value: x, label: x }))}
                                                onChange={(v) => setNewId((s) => ({ institution: v, id_num: fmtIdFor(v, s.id_num) }))} aria-label="Institution" />
                                        </div>
                                        <label className="field st-grow">
                                            <span className="field-label">ID number</span>
                                            <input className="input mono" value={newId.id_num}
                                                inputMode={isBir(newId.institution) ? "numeric" : "text"} maxLength={isBir(newId.institution) ? 11 : 60}
                                                placeholder={isBir(newId.institution) ? "000-000-000" : ""}
                                                onChange={(e) => setNewId((s) => ({ ...s, id_num: fmtIdFor(s.institution, e.target.value) }))}
                                                onKeyDown={(e) => { if (e.key === "Enter") addId(); }} />
                                        </label>
                                        <button className="btn btn-primary st-id-btn" onClick={addId} disabled={idBusy}>{idBusy ? "Adding…" : "Add ID"}</button>
                                    </div>
                                    <ul className="st-ids">
                                        {data.valid_ids.map((v) => {
                                            const editing = editId?.id === v.id;
                                            const instOpts = INSTITUTIONS.includes(v.institution) ? INSTITUTIONS : [v.institution, ...INSTITUTIONS];
                                            return (
                                                <li key={v.id} className={`st-idrow ${editing ? "is-editing" : ""}`}>
                                                    {editing ? (
                                                        <>
                                                            <div className="st-id-inst-edit">
                                                                <SearchSelect value={editId.institution} options={instOpts.map((x) => ({ value: x, label: x }))}
                                                                    onChange={(val) => setEditId((s) => ({ ...s, institution: val, id_num: fmtIdFor(val, s.id_num) }))} aria-label="Institution" />
                                                            </div>
                                                            <input className="input mono st-idnum-edit" value={editId.id_num} autoFocus
                                                                inputMode={isBir(editId.institution) ? "numeric" : "text"} maxLength={isBir(editId.institution) ? 11 : 60}
                                                                placeholder={isBir(editId.institution) ? "000-000-000" : ""}
                                                                onChange={(e) => setEditId((s) => ({ ...s, id_num: fmtIdFor(s.institution, e.target.value) }))}
                                                                onKeyDown={(e) => { if (e.key === "Enter") saveEditId(); if (e.key === "Escape") setEditId(null); }}
                                                                aria-label="ID number" />
                                                            <div className="st-id-actions">
                                                                <button className="btn btn-sm" onClick={() => setEditId(null)} disabled={editBusy}>Cancel</button>
                                                                <button className="btn btn-sm btn-primary" onClick={saveEditId} disabled={editBusy}>{editBusy ? "Saving…" : "Save"}</button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className={`st-inst ${v.institution === "BIR" ? "is-bir" : ""}`}>{v.institution}</span>
                                                            <span className="mono st-idnum">{v.id_num}</span>
                                                            <div className="st-id-actions">
                                                                <button className="tm-icon" onClick={() => setEditId({ id: v.id, institution: v.institution, id_num: fmtIdFor(v.institution, v.id_num) })}
                                                                    aria-label={`Edit ${v.institution} ID`} title="Edit" disabled={!!editId}>
                                                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                                                                </button>
                                                                <button className="tm-icon tm-icon-danger" onClick={() => setDelId(v)} aria-label={`Remove ${v.institution} ID`} title="Remove" disabled={!!editId}>
                                                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </li>
                                            );
                                        })}
                                        {!data.valid_ids.length && <li className={`st-empty${isNew ? " is-required" : ""}`}>No IDs yet. Add the BIR TIN first{isNew ? " – required" : ""}.</li>}
                                    </ul>
                                </>
                            )}

                            {section === "accounts" && (
                                <>
                                    <div className="st-h-row">
                                        <div>
                                            <h2 className="st-h st-h-tight">Business accounts <b className="st-req">*</b></h2>
                                            <p className="st-h-sub">{isNew
                                                ? "Add at least one. They're saved together with the client."
                                                : "Each branch has its own trade name, branch code and tax details. A client needs at least one."}</p>
                                        </div>
                                        <button className="btn btn-primary" onClick={() => setAcct({ ...EMPTY_ACCOUNT })}>＋ Add account</button>
                                    </div>
                                    <div className="ba-stats">
                                        <div className="ba-stat"><span className="ba-stat-n">{accCounts.all}</span><span className="ba-stat-l">Accounts</span></div>
                                        <div className="ba-stat"><span className="ba-stat-n ba-ok">{accCounts.active}</span><span className="ba-stat-l">Active</span></div>
                                        <div className="ba-stat"><span className="ba-stat-n ba-off">{accCounts.inactive}</span><span className="ba-stat-l">Inactive</span></div>
                                        <div className="ba-stat ba-stat-main"><span className="ba-stat-l">Main branch</span><span className="ba-stat-main-name">{mainAccount?.trade_name || "—"}</span></div>
                                    </div>
                                    <div className="ba-toolbar">
                                        <div className="ba-search">
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                                            <input className="input" type="search" placeholder="Search trade name, code, nature…" value={accQ} onChange={(e) => setAccQ(e.target.value)} aria-label="Search business accounts" />
                                        </div>
                                        <div className="ba-tabs" role="tablist" aria-label="Filter accounts">
                                            {[["all", "All", accCounts.all], ["main", "Main", accCounts.main], ["branch", "Branches", accCounts.branch], ["inactive", "Inactive", accCounts.inactive]].map(([k, l, n]) => (
                                                <button key={k} type="button" role="tab" aria-selected={accFilter === k} className={`ba-tab ${accFilter === k ? "is-active" : ""}`} onClick={() => setAccFilter(k)}>
                                                    {l}<span className="ba-tab-n">{n}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="ba-list" role="list">
                                        {shownAccounts.map((a) => (
                                            <AccountRow key={a.id} a={a} hasRdo={hasRdo} onEdit={() => setAcct(a)} onDelete={() => setDelAcct(a)} />
                                        ))}
                                        {!shownAccounts.length && (
                                            <div className="ba-empty">
                                                {data.accounts.length ? (
                                                    <><p className="ba-empty-title">No account matches your search</p><button className="btn btn-sm" onClick={() => { setAccQ(""); setAccFilter("all"); }}>Clear filters</button></>
                                                ) : (
                                                    <><p className="ba-empty-title">No business accounts yet</p><p className="muted">Add the main branch first, then each branch.</p>
                                                        <button className="btn btn-primary" onClick={() => setAcct({ ...EMPTY_ACCOUNT })}>＋ Add account</button></>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {askSave && (
                <ConfirmDialog title={isNew ? "Add this client?" : "Save changes?"}
                    message="The client's profile, address, ownership, classification, compliance and engagement details will be saved."
                    confirmLabel={isNew ? "Add" : "Save"} onCancel={() => setAskSave(false)} onConfirm={saveClient} />
            )}
            {askClose && (
                <ConfirmDialog title="Discard unsaved changes?" message="Your changes to this client haven't been saved." confirmLabel="Discard"
                    onCancel={() => setAskClose(false)} onConfirm={() => { setAskClose(false); onClose(); }} />
            )}
            {acct && (
                <AccountPopup account={acct} clientNum={num} L={L} hasRdo={hasRdo} onClose={() => setAcct(null)}
                    others={(data.accounts || []).filter((a) => a.id !== acct.id)}
                    onDraft={isNew ? (a) => {                                   // new client: keep the account here until the client is saved
                        const labels = {
                            status_label: (L.status || []).find((x) => String(x.id) === String(a.status_id))?.label || "",
                            nature_label: (L.nature || []).find((x) => String(x.id) === String(a.nob_id))?.label || "",
                        };
                        setData((d) => ({
                            ...d,
                            accounts: acct.id ? d.accounts.map((x) => (x.id === acct.id ? { ...a, ...labels, id: acct.id, _draft: true } : x))
                                : [...d.accounts, { ...a, ...labels, id: `draft-${Date.now()}`, _draft: true }],
                        }));
                        setAcct(null);
                    } : undefined}
                    onSaved={(accounts, m) => { setData((d) => ({ ...d, accounts })); setAcct(null); notify(m); onChanged?.(); }} />
            )}
            {delAcct && delAcct._draft && (
                <ConfirmDialog title="Remove this business account?" message={`${delAcct.trade_name || "This account"} hasn't been saved yet.`} confirmLabel="Remove"
                    onCancel={() => setDelAcct(null)}
                    onConfirm={() => { setData((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== delAcct.id) })); setDelAcct(null); }} />
            )}
            {delAcct && !delAcct._draft && (
                <DeleteAccountPopup account={delAcct} onClose={() => setDelAcct(null)}
                    onDeleted={(accounts, m) => { setData((d) => ({ ...d, accounts })); setDelAcct(null); notify(m); onChanged?.(); }} />
            )}
            {delId && (
                <ConfirmDialog title="Remove this ID?" message={`${delId.institution} ${delId.id_num} will be removed from this client.`}
                    confirmLabel="Remove" onCancel={() => setDelId(null)} onConfirm={removeId} />
            )}
        </Modal>
    );
}

/* ---------- one business account row (Settings ba-row) ---------- */
export function AccountRow({ a, hasRdo, onEdit, onDelete, showClient = false }) {
    const main = isMain(a);
    const active = isActive(a);
    const contact = [a.phone_num, a.tell_num, a.email_address].filter(Boolean).join(" · ");
    return (
        <div role="listitem" className={`ba-row ${main ? "is-main" : ""} ${active ? "" : "is-off"}`} onClick={onEdit}
            onKeyDown={(e) => { if (e.key === "Enter") onEdit(); }} tabIndex={0} aria-label={`Edit ${a.trade_name}`}>
            <div className="ba-code" aria-hidden="true"><span className="ba-code-lbl">CODE</span><span className="ba-code-n mono">{a.branch_code || "—"}</span></div>
            <div className="ba-main">
                <div className="ba-name-row">
                    <span className="ba-name">{a.trade_name || "Untitled account"}</span>
                    {main && <span className="ba-main-tag">MAIN</span>}
                </div>
                <div className="ba-sub">
                    {showClient && <><span className="cml-client">{a.client_name || "—"} <span className="mono">· {a.client_num}</span></span><span className="ba-sep">•</span></>}
                    <span>{a.nature_label || "No nature of business"}</span>
                    {contact && <><span className="ba-sep">•</span><span className="ba-contact">{contact}</span></>}
                </div>
            </div>
            <dl className="ba-facts">
                <div><dt>Type</dt><dd><span className={`ba-type ${main ? "is-main" : ""}`}>{a.branch_type || "—"}</span></dd></div>
                <div><dt>Tax reg.</dt><dd>{a.tax_registration || "—"}</dd></div>
                <div><dt>Login</dt><dd className="mono">{a.login?.username || "—"}</dd></div>
                {hasRdo && <div><dt>RDO</dt><dd className="mono">{a.rdo || "—"}</dd></div>}
                <div><dt>Status</dt><dd><span className={`tm-status ${active ? "is-on" : ""}`}><span className="tm-dot" aria-hidden="true" />{a.status_label || (active ? "Active" : "Inactive")}</span></dd></div>
            </dl>
            <div className="ba-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <button className="tm-icon" onClick={onEdit} aria-label={`Edit ${a.trade_name}`} title="Edit">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                {onDelete && (
                    <button className="tm-icon tm-icon-danger" onClick={onDelete} aria-label={`Delete ${a.trade_name}`} title="Delete">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                    </button>
                )}
            </div>
        </div>
    );
}

/* ---------- business account popup (Settings account popup) ---------- */
export function AccountPopup({ account, clientNum, L, hasRdo, onClose, onSaved, onDraft, others = [] }) {
    const [acct, setAcctState] = useState(() => (account?.id
        ? { ...EMPTY_ACCOUNT, ...Object.fromEntries(Object.keys(EMPTY_ACCOUNT).map((k) => [k, k === "is_active" ? isActive(account) : str(account[k])])), id: account.id }
        : { ...EMPTY_ACCOUNT }));
    // m_user_client is 1 : 1 with the account
    const savedLogin = account?.login?.id ? account.login : null;
    const [login, setLoginState] = useState(() => ({
        username: account?.login?.username || "",
        password: savedLogin ? "" : account?.login?.password || "",   // a draft keeps its password until the client is saved
        is_active: account?.login?.is_active ?? true,
        is_web: account?.login?.is_web ?? true,
        is_pos: !!account?.login?.is_pos,
        is_mobile: !!account?.login?.is_mobile,
    }));
    const setLogin = (patch) => setLoginState((l) => ({ ...l, ...patch }));
    const [pw2, setPw2] = useState("");          // retype password
    const [showPw, setShowPw] = useState(false);
    const [tab, setTab] = useState("info");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const setA = (patch) => setAcctState((a) => ({ ...a, ...patch }));

    // new account only: default Charts of Account of the nature of business (m_nature_coa_template)
    const isNewAcct = !acct.id || !!account?._draft;            // a draft of a new client is still new
    const [coa, setCoa] = useState(() => (Array.isArray(account?.coa) ? account.coa : null)); // null = whole default chart
    const [coaTpl, setCoaTpl] = useState({ loading: false, rows: [], source: "", error: "", have: [] });
    const [coaNob, setCoaNob] = useState(() => (Array.isArray(account?.coa) ? str(account?.nob_id) : null));
    const [coaTouched, setCoaTouched] = useState(false);       // edit: only sent when the Charts of account tab was changed
    useEffect(() => {
        let alive = true;
        setCoaTpl((t) => ({ ...t, loading: true, error: "" }));
        const qs = new URLSearchParams();
        if (acct.nob_id) qs.set("nob_id", acct.nob_id);
        if (!isNewAcct && acct.id) qs.set("ca_id", acct.id);     // edit: what this account's chart already has
        apiFetch(`/client-coa-template${qs.toString() ? `?${qs}` : ""}`)
            .then((r) => {
                if (!alive) return;
                const rows = r.rows || [];
                const have = (r.have || []).map(String);
                setCoaTpl({ loading: false, rows, source: r.source || "", error: "", have });
                if (isNewAcct) {
                    // another nature picked → its whole default chart again
                    if (coaNob !== null && coaNob !== str(acct.nob_id)) setCoa(null);
                } else {
                    // edit: ticked = the accounts already in its chart (they're updated from the nature's chart on save)
                    const codes = new Set(rows.map((x) => x.code));
                    setCoa(have.filter((c) => codes.has(c)));
                    setCoaTouched(coaNob !== null && coaNob !== str(acct.nob_id));   // nature changed → apply on save
                }
                setCoaNob(str(acct.nob_id));
            })
            .catch((e) => alive && setCoaTpl({ loading: false, rows: [], source: "", error: e.message || "Couldn't load the default chart of accounts.", have: [] }));
        return () => { alive = false; };
    }, [isNewAcct, acct.nob_id, acct.id]); // eslint-disable-line react-hooks/exhaustive-deps

    /** login part of the body, or an error message */
    const loginBody = () => {
        const username = login.username.trim();
        if (!username) return savedLogin ? { error: "Username is required (the login can't be removed, only set inactive)." } : { value: null };
        if (/\s/.test(username)) return { error: "Username can't have spaces." };
        if (username.length < 3) return { error: "Username needs at least 3 characters." };
        if (!savedLogin && login.password.length < 6) return { error: "Enter a password (at least 6 characters) for the login." };
        if (savedLogin && login.password && login.password.length < 6) return { error: "Password needs at least 6 characters." };
        if (login.password && login.password !== pw2) return { error: "The passwords don't match. Retype the same password." };
        const value = { username, is_active: !!login.is_active, is_web: !!login.is_web, is_pos: !!login.is_pos, is_mobile: !!login.is_mobile };
        if (login.password) value.password = login.password;
        return { value };
    };

    const save = async () => {
        if (!acct.trade_name.trim()) { setTab("info"); setError("Enter the trade name."); return; }
        if (!acct.branch_type) { setTab("info"); setError("Choose the branch type."); return; }
        if (!acct.branch_code.trim()) { setTab("info"); setError("Enter the branch code."); return; }
        const lg = loginBody();
        if (lg.error) { setTab("login"); setError(lg.error); return; }
        // Charts of account belong to the login (m_charts_of_account.added_by = m_user_client.id): no login → nothing can be saved
        const wantsCoa = isNewAcct ? (coa === null || coa.length > 0) && coaTpl.rows.length > 0 : coaTouched && Array.isArray(coa) && coa.length > 0;
        if (wantsCoa && !lg.value && !savedLogin && (!isNewAcct || coaTouched)) {
            setTab("login");
            setError("This account has no login, so its Charts of account can't be saved. Enter a username and password here, then click " + (acct.id ? "Update" : "Add") + ".");
            return;
        }
        if (lg.value && others.some((o) => (o.login?.username || "").toLowerCase() === lg.value.username.toLowerCase())) {
            setTab("login"); setError("Another business account of this client already uses that username."); return;
        }
        if (onDraft) {                                   // new client: nothing is saved yet
            if (others.some((o) => String(o.branch_code).trim() === acct.branch_code.trim())) { setTab("info"); setError("That branch code is already used by this client."); return; }
            const body = { ...acct };
            delete body.id;
            body.branch_code = acct.branch_code.trim();
            body.is_active = !!acct.is_active;
            body.login = lg.value;
            if (isNewAcct && coa !== null) body.coa = coa;
            onDraft(body);
            return;
        }
        setSaving(true);
        setError("");
        try {
            const body = { ...acct };
            delete body.id;
            Object.keys(body).forEach((k) => { if (body[k] === "") body[k] = null; });
            body.branch_code = acct.branch_code.trim();
            body.is_active = !!acct.is_active;
            body.login = lg.value;
            if (isNewAcct && coa !== null) body.coa = coa;
            if (!isNewAcct && coaTouched && Array.isArray(coa)) body.coa = coa;   // insert the new ticks · update the ones it has
            const r = await apiFetch(acct.id ? `/client-accounts/${acct.id}` : `/clients/${encodeURIComponent(clientNum)}/accounts`, {
                method: acct.id ? "PUT" : "POST", body: JSON.stringify(body),
            });
            onSaved(r.accounts, r.message || (acct.id ? "Business account updated." : "Business account added."));
        } catch (e) {
            setError(e.message || "Couldn't save the business account.");
            setSaving(false);
        }
    };

    return (
        <Modal title={acct.id ? `Edit ${acct.trade_name || "business account"}` : "Add business account"} onClose={onClose} size="lg"
            footer={
                <div className="tm-foot">
                    <button className="btn" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : onDraft ? (acct.id ? "Update" : "Add") : acct.id ? "Update" : "Register"}</button>
                </div>
            }>
            {account?.client_name && <p className="st-note st-note-top">Client: <b>{account.client_name}</b> · <span className="mono">{account.client_num}</span></p>}
            <div className="st-tabs" role="tablist">
                {[["info", "Information"], ["address", "Address & contact"], ["login", "Login"], ["coa", "Charts of account"]].map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} className={`st-tab ${tab === k ? "is-active" : ""}`} onClick={() => setTab(k)}>{l}</button>
                ))}
            </div>

            {tab === "info" && (
                <div className="st-grid">
                    <label className="field st-span2">
                        <span className="field-label">Trade name <b className="st-req">*</b></span>
                        <input className="input" value={acct.trade_name} onChange={(e) => setA({ trade_name: e.target.value })} />
                    </label>
                    <div className="field st-span2">
                        <span className="field-label">Nature of business</span>
                        <SearchSelect value={acct.nob_id} options={opts(L.nature)} onChange={(v) => setA({ nob_id: v })} aria-label="Nature of business" />
                    </div>
                    <div className="field">
                        <span className="field-label">Branch type <b className="st-req">*</b></span>
                        <SearchSelect value={acct.branch_type}
                            options={L.branch_types?.length ? L.branch_types.map((b) => ({ value: b.label, label: b.label })) : [{ value: "MAIN", label: "MAIN" }, { value: "BRANCH", label: "BRANCH" }]}
                            onChange={(v) => setA({ branch_type: v })} aria-label="Branch type" />
                    </div>
                    <label className="field">
                        <span className="field-label">Branch code <b className="st-req">*</b></span>
                        <input className="input mono" value={acct.branch_code} onChange={(e) => setA({ branch_code: e.target.value })} />
                    </label>
                    <div className="field">
                        <span className="field-label">Tax registration</span>
                        <SearchSelect value={acct.tax_registration}
                            options={[{ value: "", label: "—" }, ...(L.tax_reg || []).map((t) => ({ value: t.label, label: t.label }))]}
                            onChange={(v) => setA({ tax_registration: v })} aria-label="Tax registration" />
                    </div>
                    {hasRdo && (
                        <label className="field">
                            <span className="field-label">RDO</span>
                            <input className="input mono" value={acct.rdo} placeholder="000" onChange={(e) => setA({ rdo: e.target.value })} />
                        </label>
                    )}
                    <div className="field">
                        <span className="field-label">Account status</span>
                        <SearchSelect value={acct.status_id} options={opts(L.status)} onChange={(v) => setA({ status_id: v })} aria-label="Account status" />
                    </div>
                    <label className="st-switch-row">
                        <input type="checkbox" checked={!!acct.is_active} onChange={(e) => setA({ is_active: e.target.checked })} />
                        <span>Active</span>
                    </label>
                </div>
            )}

            {tab === "address" && (
                <>
                    <label className="field">
                        <span className="field-label">Street name / district</span>
                        <input className="input" value={acct.street} onChange={(e) => setA({ street: e.target.value })} />
                    </label>
                    <div className="st-mt">
                        <AddressPicker idPrefix="acct" provinces={L.provinces}
                            value={{ province_id: acct.province_id, city_id: acct.city_id, brgy_id: acct.brgy_id }} onChange={(p) => setA(p)} />
                    </div>
                    <div className="st-grid st-mt">
                        <label className="field">
                            <span className="field-label">Cellphone number</span>
                            <input className="input" inputMode="tel" value={acct.phone_num} onChange={(e) => setA({ phone_num: e.target.value })} />
                        </label>
                        <label className="field">
                            <span className="field-label">Telephone number</span>
                            <input className="input" inputMode="tel" value={acct.tell_num} onChange={(e) => setA({ tell_num: e.target.value })} />
                        </label>
                        <label className="field st-span2">
                            <span className="field-label">Email address</span>
                            <input className="input" type="email" value={acct.email_address} onChange={(e) => setA({ email_address: e.target.value })} />
                        </label>
                    </div>
                </>
            )}

            {tab === "login" && (
                <div className="cml-login-form">
                    <p className="st-note">One login per business account (m_user_client). The username can't be used by any other login.</p>
                    <div className="st-grid">
                        <label className="field">
                            <span className="field-label">Username</span>
                            <input className="input mono" value={login.username} autoComplete="off" onChange={(e) => setLogin({ username: e.target.value })} />
                        </label>
                        <div className="field">
                            <span className="field-label">{savedLogin ? "New password (leave blank to keep)" : "Password"}</span>
                            <PwInput value={login.password} show={showPw} onToggle={() => setShowPw((v) => !v)} onChange={(v) => setLogin({ password: v })} label="Password" />
                        </div>
                        <div className="field">
                            <span className="field-label">Retype password</span>
                            <PwInput value={pw2} show={showPw} onToggle={() => setShowPw((v) => !v)} onChange={setPw2} label="Retype password"
                                bad={!!pw2 && pw2 !== login.password} disabled={!login.password} />
                            {login.password && pw2 && (
                                <span className={`cml-pw-match ${pw2 === login.password ? "is-ok" : "is-bad"}`}>
                                    {pw2 === login.password ? "✓ Passwords match" : "Passwords don't match"}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="cml-login-flags">
                        {[["is_active", "Active"], ["is_web", "Web"], ["is_pos", "POS"], ["is_mobile", "Mobile"]].map(([k, l]) => (
                            <label key={k} className="st-switch-row">
                                <input type="checkbox" checked={!!login[k]} onChange={(e) => setLogin({ [k]: e.target.checked })} />
                                <span>{l}</span>
                            </label>
                        ))}
                    </div>
                    {!savedLogin && !login.username && <p className="st-note">Leave the username blank to save the account without a login.</p>}
                </div>
            )}

            {tab === "coa" && (
                <CoaPicker tpl={coaTpl} selected={coa} onChange={(v) => { setCoa(v); setCoaTouched(true); }} hasLogin={!!login.username.trim()}
                    isEdit={!isNewAcct} noNature={!acct.nob_id} onPickNature={() => setTab("info")}
                    natureLabel={(L.nature || []).find((n) => String(n.id) === String(acct.nob_id))?.label || ""} />
            )}

            {error && <div className="alert-error st-mt" role="alert">{error}</div>}
        </Modal>
    );
}

/* ---------- password box with show / hide ---------- */
export function PwInput({ value, onChange, show, onToggle, label, bad = false, disabled = false }) {
    return (
        <div className={`cml-pw${bad ? " is-bad" : ""}${disabled ? " is-disabled" : ""}`}>
            <input className="input" type={show ? "text" : "password"} value={value} autoComplete="new-password" spellCheck={false}
                disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.value)} />
            <button type="button" className="cml-pw-eye" onClick={onToggle} tabIndex={-1} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide" : "Show"}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
                    {show && <path d="M3 3l18 18" />}
                </svg>
            </button>
        </div>
    );
}

/* ---------- new business account: default Charts of Account of its nature of business ---------- */
const COA_TYPE_TONE = { Asset: "blue", Liability: "orange", Equity: "purple", Revenue: "green", "Cost of Sales": "red", Expense: "red", "Other Income": "green", "Other Expense": "red" };

export function CoaPicker({ tpl, selected, onChange, hasLogin, natureLabel, isEdit = false, noNature = false, onPickNature }) {
    const have = useMemo(() => new Set(tpl.have || []), [tpl.have]);
    const rows = tpl.rows;
    const [open, setOpen] = useState(() => new Set(["10000", "20000", "30000", "40000", "50000", "60000", "70000", "80000"]));
    const [q, setQ] = useState("");

    const { kids, byCode } = useMemo(() => {
        const k = {};
        const b = {};
        rows.forEach((r) => { b[r.code] = r; (k[r.parent || "__root"] ||= []).push(r); });
        return { kids: k, byCode: b };
    }, [rows]);
    const all = useMemo(() => rows.map((r) => r.code), [rows]);
    const sel = useMemo(() => new Set(selected === null ? all : selected), [selected, all]);

    const below = (code) => {
        const out = [];
        const walk = (c) => (kids[c] || []).forEach((r) => { out.push(r.code); walk(r.code); });
        walk(code);
        return out;
    };
    const toggle = (code) => {
        const next = new Set(sel);
        if (next.has(code)) {
            [code, ...below(code)].forEach((c) => next.delete(c));      // unticking a header removes its accounts
        } else {
            [code, ...below(code)].forEach((c) => next.add(c));
            for (let p = byCode[code]?.parent; p; p = byCode[p]?.parent) next.add(p);   // keep the parents
        }
        onChange(next.size === all.length && !isEdit ? null : all.filter((c) => next.has(c)));
    };

    const term = q.trim().toLowerCase();
    const match = (r) => !term || r.code.includes(term) || r.name.toLowerCase().includes(term);
    const visible = (r) => match(r) || below(r.code).some((c) => match(byCode[c]));

    const lines = [];
    const walk = (key, level) => (kids[key] || []).forEach((r) => {
        if (!visible(r)) return;
        const hasKids = !!kids[r.code]?.length;
        const isOpen = term ? true : open.has(r.code);
        lines.push({ r, level, hasKids, isOpen });
        if (hasKids && isOpen) walk(r.code, level + 1);
    });
    walk("__root", 0);

    if (tpl.loading) return <div className="coa-pick-empty">Loading the default chart of accounts…</div>;
    if (tpl.error) return <div className="alert-error" role="alert">{tpl.error}</div>;
    if (!rows.length) return <div className="coa-pick-empty">No default chart of accounts yet. Run <b>nature_of_business_coa.sql</b> on the database.</div>;

    return (
        <div className="coa-pick">
            {noNature ? (
                <div className="coa-pick-warn">
                    No nature of business picked, so the <b>general</b> chart is shown.{" "}
                    <button type="button" className="coa-pick-link" onClick={onPickNature}>Pick the nature of business</button> to see its chart.
                </div>
            ) : (
                <div className={`coa-pick-src ${tpl.source === "nature" ? "is-nature" : "is-general"}`}>
                    {tpl.source === "nature"
                        ? <>Chart of <b>{natureLabel || "this nature of business"}</b></>
                        : <>No chart set up for <b>{natureLabel || "this nature"}</b> yet – the <b>general</b> chart is used (Master File → Nature of Business → Charts of account)</>}
                </div>
            )}
            <p className="st-note">
                {isEdit
                    ? <>Ticked accounts are saved to this account's Charts of Account when you click <b>Update</b>: new ones are <b>added</b>, ones it already has (<span className="coa-pick-have">in chart</span>) are <b>updated</b> from this chart. Unticking doesn't delete anything.</>
                    : <>Ticked accounts are added to this account's Charts of Account when it is saved. You can still edit them later in Setup → Charts of Account.</>}
            </p>
            {!hasLogin && <div className="coa-pick-warn">The chart belongs to the login. Add a username on the <b>Login</b> tab, or no accounts will be created.</div>}

            <div className="coa-pick-bar">
                <input className="input" placeholder="Search code or account…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search accounts" />
                <span className="coa-pick-count"><b>{sel.size}</b> of {all.length} selected</span>
                <button type="button" className="btn btn-sm" onClick={() => onChange(isEdit ? all : null)}>Select all</button>
                <button type="button" className="btn btn-sm" onClick={() => onChange([])}>Clear</button>
            </div>

            <div className="coa-pick-list" role="tree">
                {lines.map(({ r, level, hasKids, isOpen }) => (
                    <div key={r.code} role="treeitem" aria-expanded={hasKids ? isOpen : undefined}
                        className={`coa-pick-row${hasKids ? " is-head" : ""}${sel.has(r.code) ? "" : " is-off"}`} style={{ paddingLeft: 8 + level * 20 }}>
                        {hasKids ? (
                            <button type="button" className="coa-pick-caret" aria-label={isOpen ? "Collapse" : "Expand"}
                                onClick={() => setOpen((s) => { const n = new Set(s); n.has(r.code) ? n.delete(r.code) : n.add(r.code); return n; })}>
                                {isOpen ? "▾" : "▸"}
                            </button>
                        ) : <span className="coa-pick-caret" />}
                        <label className="coa-pick-label">
                            <input type="checkbox" checked={sel.has(r.code)} onChange={() => toggle(r.code)} />
                            <span className="mono coa-pick-code">{r.code}</span>
                            <span className="coa-pick-name">{r.name}</span>
                            {isEdit && have.has(r.code) && <span className="coa-pick-have">in chart</span>}
                        </label>
                        <span className={`badge badge-${COA_TYPE_TONE[r.type] || "gray"} coa-pick-type`}>{r.type}</span>
                    </div>
                ))}
                {!lines.length && <div className="coa-pick-empty">Nothing matches the search.</div>}
            </div>
        </div>
    );
}

/* ---------- delete a business account (type the branch code) ---------- */
export function DeleteAccountPopup({ account, onClose, onDeleted }) {
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const del = async () => {
        setBusy(true);
        setError("");
        try {
            const r = await apiFetch(`/client-accounts/${account.id}`, { method: "DELETE", body: JSON.stringify({ confirm: typed }) });
            onDeleted(r.accounts, r.message || "Business account deleted.");
        } catch (e) {
            setError(e.message || "Couldn't delete.");
            setBusy(false);
        }
    };

    return (
        <Modal title="Delete business account?" onClose={onClose}
            footer={
                <div className="tm-foot">
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn st-btn-danger" onClick={del} disabled={busy || typed.trim() !== String(account.branch_code).trim()}>
                        {busy ? "Deleting…" : "Delete account"}
                    </button>
                </div>
            }>
            <p><b>{account.trade_name}</b> ({account.branch_type} · <span className="mono">{account.branch_code}</span>) will be removed. You can't undo this.</p>
            <label className="field st-mt">
                <span className="field-label">Type the branch code <span className="mono">{account.branch_code}</span> to confirm</span>
                <input className="input mono" value={typed} autoFocus onChange={(e) => setTyped(e.target.value)} />
            </label>
            {error && <div className="alert-error st-mt" role="alert">{error}</div>}
        </Modal>
    );
}

/* ---------- Assigned clients: pick the DA and Auditor of one account (old modal_AssignedClients) ---------- */
// staff = { da: [{id, name}], auditors: [{id, name}] } from /client-accounts/assignees
export function AssignedClientPopup({ account, staff, onClose, onSaved }) {
    const [daId, setDaId] = useState(account.da_id || null);
    const [auId, setAuId] = useState(account.auditor_id || null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const changed = (daId || null) !== (account.da_id || null) || (auId || null) !== (account.auditor_id || null);

    const save = async () => {
        setBusy(true);
        setError("");
        try {
            const r = await apiFetch(`/client-accounts/${account.id}/assigned`, {
                method: "PUT", body: JSON.stringify({ da_id: daId, auditor_id: auId }),
            });
            onSaved(r.message || "Saved.");
        } catch (e) {
            setError(e.message || "Couldn't save.");
            setBusy(false);
        }
    };

    return (
        <Modal title="Assigned DA / Auditor" onClose={onClose} size="lg"
            footer={
                <div className="tm-foot">
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={save} disabled={busy || !changed}>{busy ? "Saving…" : "Save"}</button>
                </div>
            }>
            <p className="asg-who">
                <b>{[account.client_num, account.client_name].filter(Boolean).join(" - ")}</b>
                <small>{[account.branch_type, account.branch_code, account.trade_name].filter(Boolean).join(" - ")}</small>
            </p>
            <div className="asg-grid">
                <StaffPick title="Data analyst (DA)" list={staff?.da} value={daId} onChange={setDaId} current={account.da_name} />
                <StaffPick title="Auditor" list={staff?.auditors} value={auId} onChange={setAuId} current={account.auditor_name} />
            </div>
            {error && <div className="alert-error st-mt" role="alert">{error}</div>}
        </Modal>
    );
}

// searchable radio list; clicking the selected one again clears it (same as the old page)
function StaffPick({ title, list, value, onChange, current }) {
    const [q, setQ] = useState("");
    const all = list || [];
    const shown = useMemo(() => {
        const t = q.trim().toLowerCase();
        return t ? all.filter((e) => String(e.name).toLowerCase().includes(t)) : all;
    }, [all, q]);
    const picked = all.find((e) => Number(e.id) === Number(value));

    return (
        <div className="asg-col">
            <div className="asg-head">
                <span className="field-label">{title}</span>
                <span className="asg-picked">{picked ? picked.name : value ? current || `#${value}` : "None"}</span>
            </div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label={`Search ${title}`} />
            <div className="asg-list" role="radiogroup" aria-label={title}>
                {!list && <div className="asg-empty">Loading…</div>}
                {list && shown.length === 0 && <div className="asg-empty">{q ? "Nothing matches the search." : "No employees."}</div>}
                {shown.map((e) => {
                    const on = Number(e.id) === Number(value);
                    return (
                        <button key={e.id} type="button" role="radio" aria-checked={on} className={`asg-item${on ? " is-on" : ""}`}
                            onClick={() => onChange(on ? null : Number(e.id))}>
                            <span className="asg-radio" aria-hidden="true" />{e.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}