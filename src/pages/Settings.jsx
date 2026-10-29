import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SocialLinks from "../components/SocialLinks";
import PricingPlans from "../components/PricingPlans";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import SearchSelect from "../components/SearchSelect";
import { useToast } from "../components/Toast";
import { useAuth, apiFetch } from "../context/AuthContext";
import { CoaPicker, PwInput } from "./client/ClientPopups";
import "./client/ClientCoa.css";

const SECTIONS = [
    ["profile", "Profile"],
    ["contact", "Contact"],
    ["address", "Address"],
    ["ownership", "Business Ownership"],
    ["classification", "Classification & Compliance"],
    ["engagement", "Engagement"],
    ["ids", "Valid IDs"],
    ["accounts", "Business Accounts"],
    ["signin", "Sign-in (Google / Facebook)"],
];
// new client from Google / Facebook sign-up: walk through these, then Save changes
const WELCOME_STEPS = SECTIONS.filter(([k]) => k !== "signin");
const INSTITUTIONS = ["BIR", "SSS", "PHILHEALTH", "PAG-IBIG", "DTI", "SEC", "MAYOR'S PERMIT", "OTHERS"];
// BIR TIN: digits only, shown as 000-000-000
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
const EMPTY_ACCOUNT = {
    id: 0, trade_name: "", nob_id: "", branch_type: "BRANCH", branch_code: "0000", tax_registration: "", rdo: "",
    status_id: "", street: "", province_id: "", city_id: "", brgy_id: "", phone_num: "", tell_num: "", email_address: "", is_active: true,
};

const str = (v) => (v === null || v === undefined ? "" : String(v));
const day = (v) => (v ? String(v).slice(0, 10) : "");
const opts = (list, blank = "—") => [{ value: "", label: blank }, ...(list || []).map((o) => ({ value: String(o.id), label: o.label }))];
const isMain = (a) => String(a?.branch_type || "").toUpperCase() === "MAIN";
const isActive = (a) => Number(a?.is_active ?? 1) === 1;

// client row → form
const toForm = (c) => ({
    ...Object.fromEntries(CLIENT_FIELDS.map((k) => [k, str(c?.[k])])),
    birthdate: day(c?.birthdate),
    date_of_engagement: day(c?.date_of_engagement),
    date_of_disengagement: day(c?.date_of_disengagement),
    date_started: day(c?.date_started),
    date_registered: day(c?.date_registered),
    compliance_ids: str(c?.compliance_ids).split(",").map((x) => x.trim()).filter(Boolean),
    is_top_withholding_agent: Number(c?.is_top_withholding_agent || 0) === 1,
});
const EMPTY_LOGIN = { username: "", password: "", is_active: true, is_web: true, is_pos: false, is_mobile: false };

// keep only simple formatting tags from stored HTML
const ALLOWED = new Set(["P", "UL", "OL", "LI", "BR", "B", "STRONG", "I", "EM", "U"]);
function cleanHtml(html) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    const walk = (node) => {
        [...node.childNodes].forEach((n) => {
            if (n.nodeType === 1) {
                if (!ALLOWED.has(n.tagName)) {
                    walk(n);
                    n.replaceWith(...n.childNodes);
                } else {
                    [...n.attributes].forEach((a) => n.removeAttribute(a.name));
                    walk(n);
                }
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
/* =========================================================
   Province → City → Barangay (each list loads from the one before)
   ========================================================= */
// "<p>Annual Revenue</p><ul><li>Below ₱300,000</li></ul>…" → [{ title: "Annual Revenue", items: ["Below ₱300,000"] }, …]
function toSections(html) {
    const clean = cleanHtml(html);
    if (!clean) return [];
    const doc = new DOMParser().parseFromString(clean, "text/html");
    const out = [];
    let cur = null;
    [...doc.body.children].forEach((el) => {
        const text = el.textContent.replace(/\s+/g, " ").trim();
        if (!text) return;
        if (el.tagName === "P") {
            const t = text.replace(/:$/, "");
            cur = { title: t, items: [] };
            out.push(cur);
        } else if (el.tagName === "UL" || el.tagName === "OL") {
            const items = [...el.querySelectorAll("li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
            if (!cur) { cur = { title: "", items: [] }; out.push(cur); }
            cur.items.push(...items);
        } else {
            out.push({ title: "", items: [text] });
        }
    });
    // a heading with no list under it is just a note
    return out.map((s) => (s.items.length ? s : { title: "", items: [s.title] }));
}
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
const cityCache = {};
const brgyCache = {};

function AddressPicker({ provinces, value, onChange, idPrefix }) {
    const [cities, setCities] = useState(cityCache[value.province_id] || []);
    const [brgys, setBrgys] = useState(brgyCache[value.city_id] || []);

    useEffect(() => {
        if (!value.province_id) { setCities([]); return; }
        if (cityCache[value.province_id]) { setCities(cityCache[value.province_id]); return; }
        apiFetch(`/settings/cities?province_id=${value.province_id}`)
            .then((r) => { cityCache[value.province_id] = r; setCities(r); })
            .catch(() => setCities([]));
    }, [value.province_id]);

    useEffect(() => {
        if (!value.city_id) { setBrgys([]); return; }
        if (brgyCache[value.city_id]) { setBrgys(brgyCache[value.city_id]); return; }
        apiFetch(`/settings/barangays?city_id=${value.city_id}`)
            .then((r) => { brgyCache[value.city_id] = r; setBrgys(r); })
            .catch(() => setBrgys([]));
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
                    aria-label="City" disabled={!value.province_id}
                    onChange={(v) => onChange({ city_id: v, brgy_id: "" })} />
            </div>
            <div className="field">
                <span className="field-label">Barangay</span>
                <SearchSelect value={str(value.brgy_id)} options={opts(brgys, value.city_id ? "Select barangay" : "Choose a city first")}
                    aria-label="Barangay" disabled={!value.city_id}
                    onChange={(v) => onChange({ brgy_id: v })} />
            </div>
            <label className="field">
                <span className="field-label">ZIP code</span>
                <input id={`${idPrefix}-zip`} className="input" value={zip} readOnly tabIndex={-1} placeholder="From the city" />
            </label>
        </div>
    );
}

/* =========================================================
   Settings
   ========================================================= */
export default function Settings() {
    const { user } = useAuth();
    const notify = useToast();

    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [section, setSection] = useState("profile");
    // ?welcome=1 (just signed up): guided fill-up of every section
    const location = useLocation();
    const navigate = useNavigate();
    const [welcome, setWelcome] = useState(() => {
        try { return new URLSearchParams(location.search).get("welcome") === "1" || sessionStorage.getItem("igb-welcome") === "1"; } catch { return false; }
    });
    useEffect(() => {
        const q = new URLSearchParams(location.search);
        const sec = q.get("section");
        if (sec && (SECTIONS.some(([k]) => k === sec) || sec === "billing")) setSection(sec);   // from the welcome popup: open that part
        if (q.get("welcome") !== "1") return;
        setWelcome(true);
        try { sessionStorage.setItem("igb-welcome", "1"); } catch { /* blocked */ }
        navigate("/settings", { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);
    const endWelcome = () => { setWelcome(false); try { sessionStorage.removeItem("igb-welcome"); } catch { /* blocked */ } };
    const [form, setForm] = useState(null);
    const [saved, setSaved] = useState(null);
    const [saving, setSaving] = useState(false);
    const [askSave, setAskSave] = useState(false);
    const [openDetail, setOpenDetail] = useState(null);   // classification id showing details

    const [acct, setAcct] = useState(null);               // business account form
    const [acctTab, setAcctTab] = useState("info");
    const [acctSaving, setAcctSaving] = useState(false);
    const [acctError, setAcctError] = useState("");
    const [delAcct, setDelAcct] = useState(null);         // { account, typed, busy, error }
    const [accQ, setAccQ] = useState("");
    // business account popup: Login + Charts of account tabs
    const [login, setLoginState] = useState(EMPTY_LOGIN);
    const setLogin = (patch) => setLoginState((l) => ({ ...l, ...patch }));
    const [savedLogin, setSavedLogin] = useState(null);      // the account's login when the popup opened
    const [pw2, setPw2] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [coaTpl, setCoaTpl] = useState({ loading: false, rows: [], source: "", error: "", have: [] });
    const [coa, setCoa] = useState(null);                    // new: null = whole chart · edit: the ticked codes
    const [coaTouched, setCoaTouched] = useState(false);
    const [accFilter, setAccFilter] = useState("all");   // all | main | branch | inactive

    const [newId, setNewId] = useState({ institution: "BIR", id_num: "" });
    const [idBusy, setIdBusy] = useState(false);
    const [delId, setDelId] = useState(null);

    const panelRef = useRef(null);
    const [editId, setEditId] = useState(null);       // { id, institution, id_num }
    const [editBusy, setEditBusy] = useState(false);
    const load = async () => {
        setError("");
        try {
            const r = await apiFetch("/settings");
            setData(r);
            const f = toForm(r.client);
            setForm(f);
            setSaved(JSON.stringify(f));
        } catch (e) {
            setError(e.message || "Couldn't load the settings.");
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [user?.id, user?.caid]);

    const dirty = !!form && saved !== JSON.stringify(form);
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));
    const L = data?.lookups || {};
    // client that signed up with Google / Facebook (saved status FEDERATED): status is set by IGB, so it's hidden
    const statusName = (id) => {
        const o = (L.status || []).find((x) => String(x.id ?? x.value) === String(id));
        return String(o?.status_name ?? o?.name ?? o?.label ?? o?.description ?? "");
    };
    const savedStatusId = useMemo(() => { try { return saved ? JSON.parse(saved).status_id : null; } catch { return null; } }, [saved]);
    const federated = /federated/i.test(statusName(savedStatusId));
    // Google / Facebook clients also get "Billing & plans" (before Sign-in)
    const navSections = federated
        ? [...SECTIONS.filter(([k]) => k !== "signin"), ["billing", "Billing & plans"], ["signin", "Sign-in (Google / Facebook)"]]
        : SECTIONS;

    // warn before leaving the page with unsaved changes
    useEffect(() => {
        const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
        window.addEventListener("beforeunload", h);
        return () => window.removeEventListener("beforeunload", h);
    }, [dirty]);

    // setup guide: which parts are already filled up (refreshed after every save)
    const [ob, setOb] = useState(null);
    const idsCount = data?.valid_ids?.length ?? 0;
    const accCount = data?.accounts?.length ?? 0;
    useEffect(() => {
        if (!welcome) return;
        apiFetch("/onboarding").then(setOb).catch(() => setOb(null));
    }, [welcome, saved, idsCount, accCount]);

    const go = (key) => {
        setSection(key);
        panelRef.current?.scrollTo?.({ top: 0 });
    };

    /* ---------- derived ---------- */
    const clientName = useMemo(() => {
        if (!form) return "";
        return [form.last_name && `${form.last_name},`, form.first_name, form.middle_name, form.suffix].filter(Boolean).join(" ");
    }, [form]);

    const mainAccount = data?.accounts?.find(isMain) || data?.accounts?.[0];
    const bot = (L.bot || []).find((b) => String(b.id) === form?.business_ownership_type_id);

    const accCounts = useMemo(() => {
        const list = data?.accounts || [];
        return {
            all: list.length,
            main: list.filter(isMain).length,
            branch: list.filter((a) => !isMain(a)).length,
            active: list.filter(isActive).length,
            inactive: list.filter((a) => !isActive(a)).length,
        };
    }, [data?.accounts]);

    const shownAccounts = useMemo(() => {
        const q = accQ.trim().toLowerCase();
        return (data?.accounts || [])
            .filter((a) =>
                accFilter === "all" ||
                (accFilter === "main" && isMain(a)) ||
                (accFilter === "branch" && !isMain(a)) ||
                (accFilter === "inactive" && !isActive(a)))
            .filter((a) => !q || [a.trade_name, a.branch_code, a.nature_label, a.tax_registration, a.rdo, a.email_address]
                .some((v) => String(v || "").toLowerCase().includes(q)))
            .sort((a, b) => (Number(isMain(b)) - Number(isMain(a))) ||
                String(a.branch_code).localeCompare(String(b.branch_code), undefined, { numeric: true }));
    }, [data?.accounts, accQ, accFilter]);

    /* ---------- save client ---------- */
    const saveClient = async () => {
        setAskSave(false);
        if (!form.last_name.trim()) { go("profile"); notify("Last name is required.", "error"); return; }
        setSaving(true);
        try {
            const body = { ...form };
            Object.keys(body).forEach((k) => { if (body[k] === "") body[k] = null; });
            body.compliance_ids = form.compliance_ids.map(Number);
            body.is_top_withholding_agent = !!form.is_top_withholding_agent;
            const r = await apiFetch("/settings/client", { method: "PUT", body: JSON.stringify(body) });
            // Top Withholding Agent (m_client.is_top_withholding_agent)
            const t = await apiFetch("/settings/twa", { method: "PUT", body: JSON.stringify({ is_top_withholding_agent: !!form.is_top_withholding_agent }) });
            r.client = { ...r.client, is_top_withholding_agent: t.is_top_withholding_agent ? 1 : 0 };
            const f = toForm(r.client);
            setForm(f);
            setSaved(JSON.stringify(f));
            setData((d) => ({ ...d, client: r.client }));
            notify("Settings saved.");
        } catch (e) {
            notify(e.message || "Couldn't save the settings.", "error");
        } finally {
            setSaving(false);
        }
    };

    /* ---------- business accounts ---------- */
    const openAccount = (a) => {
        setAcctError("");
        setAcctTab("info");
        setLoginState(EMPTY_LOGIN);
        setSavedLogin(null);
        setPw2("");
        setShowPw(false);
        setCoa(null);
        setCoaTouched(false);
        setCoaTpl({ loading: true, rows: [], source: "", error: "", have: [] });
        setAcct(a
            ? {
                ...EMPTY_ACCOUNT,
                ...Object.fromEntries(Object.keys(EMPTY_ACCOUNT).map((k) => [k, k === "is_active" ? isActive(a) : str(a[k])])),
                id: a.id,
            }
            : { ...EMPTY_ACCOUNT });
    };
    const setA = (patch) => setAcct((a) => ({ ...a, ...patch }));

    // the account's login + the chart of its nature of business (reloads when the nature changes)
    const acctId = acct?.id || 0;
    const acctNob = acct?.nob_id || "";
    const acctOpen = !!acct;
    const prevNob = useRef(null);
    useEffect(() => {
        if (!acctOpen) { prevNob.current = null; return undefined; }
        let alive = true;
        setCoaTpl((t) => ({ ...t, loading: true, error: "" }));
        const qs = new URLSearchParams();
        if (acctNob) qs.set("nob_id", acctNob);
        if (acctId) qs.set("ca_id", acctId);
        apiFetch(`/settings/account-extras${qs.toString() ? `?${qs}` : ""}`)
            .then((r) => {
                if (!alive) return;
                const rows = r.rows || [];
                const have = (r.have || []).map(String);
                setCoaTpl({ loading: false, rows, source: r.source || "", error: "", have });
                if (r.login && prevNob.current === null) {
                    setSavedLogin(r.login);
                    setLoginState({ ...EMPTY_LOGIN, ...r.login, password: "" });
                }
                if (acctId) {
                    const codes = new Set(rows.map((x) => x.code));
                    setCoa(have.filter((c) => codes.has(c)));
                    setCoaTouched(prevNob.current !== null && prevNob.current !== acctNob);   // nature changed → apply on save
                } else if (prevNob.current !== null && prevNob.current !== acctNob) {
                    setCoa(null);                                                           // new account: the whole chart again
                }
                prevNob.current = acctNob;
            })
            .catch((e) => alive && setCoaTpl({ loading: false, rows: [], source: "", error: e.message || "Couldn't load the chart of accounts.", have: [] }));
        return () => { alive = false; };
    }, [acctOpen, acctId, acctNob]);

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

    const saveAccount = async () => {
        if (!acct.trade_name.trim()) { setAcctTab("info"); setAcctError("Enter the trade name."); return; }
        if (!acct.branch_type) { setAcctTab("info"); setAcctError("Choose the branch type."); return; }
        if (!acct.branch_code.trim()) { setAcctTab("info"); setAcctError("Enter the branch code."); return; }
        const lg = loginBody();
        if (lg.error) { setAcctTab("login"); setAcctError(lg.error); return; }
        // Charts of account: new account = the whole chart unless changed · edit = only when the tab was changed
        const allCodes = coaTpl.rows.map((r) => r.code);
        const coaCodes = !acct.id ? (coa === null ? allCodes : coa) : (coaTouched && Array.isArray(coa) ? coa : null);
        const wantsCoa = Array.isArray(coaCodes) && coaCodes.length > 0 && (!!acct.id || coaTouched);
        if (wantsCoa && !lg.value && !savedLogin) {
            setAcctTab("login");
            setAcctError(`This account has no login, so its Charts of account can't be saved. Enter a username and password here, then click ${acct.id ? "Update" : "Register"}.`);
            return;
        }
        setAcctSaving(true);
        setAcctError("");
        try {
            const body = { ...acct };
            delete body.id;
            Object.keys(body).forEach((k) => { if (body[k] === "") body[k] = null; });
            body.branch_code = acct.branch_code.trim();
            body.is_active = !!acct.is_active;
            const r = await apiFetch(acct.id ? `/settings/accounts/${acct.id}` : "/settings/accounts", {
                method: acct.id ? "PUT" : "POST",
                body: JSON.stringify(body),
            });
            setData((d) => ({ ...d, accounts: r.accounts }));
            // the saved account → its login + Charts of account (m_user_client · m_charts_of_account)
            const savedId = acct.id || (r.accounts || []).find((x) => String(x.branch_code).trim() === acct.branch_code.trim())?.id;
            let extra = "";
            if (savedId && (lg.value || coaCodes !== null)) {
                const x = await apiFetch(`/settings/accounts/${savedId}/extras`, {
                    method: "POST",
                    body: JSON.stringify({ login: lg.value, ...(lg.value || savedLogin ? { coa: coaCodes } : {}) }),
                });
                if (x.coa) extra = ` · ${x.message}`;
            }
            notify(`${acct.id ? "Business account updated." : "Business account added."}${extra}`);
            setAcct(null);
        } catch (e) {
            setAcctError(e.message || "Couldn't save the business account.");
        } finally {
            setAcctSaving(false);
        }
    };

    const deleteAccount = async () => {
        setDelAcct((d) => ({ ...d, busy: true, error: "" }));
        try {
            const r = await apiFetch(`/settings/accounts/${delAcct.account.id}`, {
                method: "DELETE",
                body: JSON.stringify({ confirm: delAcct.typed }),
            });
            setData((d) => ({ ...d, accounts: r.accounts }));
            notify("Business account deleted.");
            setDelAcct(null);
        } catch (e) {
            setDelAcct((d) => ({ ...d, busy: false, error: e.message || "Couldn't delete." }));
        }
    };

    /* ---------- valid IDs ---------- */
    const addId = async () => {
        if (!newId.id_num.trim()) { notify("Enter the ID number.", "error"); return; }
        if (isBir(newId.institution) && !TIN_RE.test(newId.id_num)) { notify("Enter the TIN as 000-000-000 (9 digits).", "error"); return; }
        setIdBusy(true);
        try {
            const r = await apiFetch("/settings/valid-ids", { method: "POST", body: JSON.stringify(newId) });
            setData((d) => ({ ...d, valid_ids: r.valid_ids }));
            setNewId((s) => ({ ...s, id_num: "" }));
            notify("ID added.");
        } catch (e) {
            notify(e.message || "Couldn't add the ID.", "error");
        } finally {
            setIdBusy(false);
        }
    };

    const removeId = async () => {
        const v = delId;
        setDelId(null);
        try {
            const r = await apiFetch(`/settings/valid-ids/${v.id}`, { method: "DELETE" });
            setData((d) => ({ ...d, valid_ids: r.valid_ids }));
            notify("ID removed.");
        } catch (e) {
            notify(e.message || "Couldn't remove the ID.", "error");
        }
    };

    const saveEditId = async () => {
        if (!editId.id_num.trim()) { notify("Enter the ID number.", "error"); return; }
        if (isBir(editId.institution) && !TIN_RE.test(editId.id_num)) { notify("Enter the TIN as 000-000-000 (9 digits).", "error"); return; }
        setEditBusy(true);
        try {
            const r = await apiFetch(`/settings/valid-ids/${editId.id}`, {
                method: "PUT",
                body: JSON.stringify({ institution: editId.institution, id_num: editId.id_num }),
            });
            setData((d) => ({ ...d, valid_ids: r.valid_ids }));
            setEditId(null);
            notify("ID updated.");
        } catch (e) {
            notify(e.message || "Couldn't update the ID.", "error");
        } finally {
            setEditBusy(false);
        }
    };

    /* ---------- loading / error ---------- */
    if (!data || !form) {
        return (
            <section className="st-page">
                {error ? (
                    <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>
                ) : (
                    <div className="card st-loading">
                        {Array.from({ length: 6 }).map((_, i) => <span key={i} className="sk sk-cell" style={{ width: `${90 - i * 10}%` }} />)}
                    </div>
                )}
            </section>
        );
    }

    return (
        <section className="st-page">
            {/* ---------- header ---------- */}
            <header className="st-hero">
                <div className="st-id">
                    <span className="st-avatar" aria-hidden="true">{(form.last_name || "?")[0]}{(form.first_name || "")[0] || ""}</span>
                    <div>
                        <h1 className="st-title">{mainAccount?.trade_name || "Client Settings"}</h1>
                        <p className="st-sub">{clientName || "—"} · <span className="mono">{data.client.client_num}</span></p>
                    </div>
                </div>
                <div className="st-save">
                    {dirty && <span className="st-dirty">Unsaved changes</span>}
                    <button className="btn" onClick={() => setForm(JSON.parse(saved))} disabled={!dirty || saving}>Discard</button>
                    <button className="btn btn-primary" onClick={() => setAskSave(true)} disabled={!dirty || saving}>
                        {saving ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </header>

            {welcome && (() => {
                const i = Math.max(0, WELCOME_STEPS.findIndex(([k]) => k === section));
                const doneOf = (k) => ob?.steps?.find((x) => x.key === k)?.done;
                const total = WELCOME_STEPS.length;
                const doneCount = WELCOME_STEPS.filter(([k]) => doneOf(k)).length;
                const days = ob?.trial?.trial && !ob.trial.expired ? ob.trial.days_left : null;
                return (
                    <section className="sw" role="status" aria-label="Setup guide">
                        <div className="sw-top">
                            <span className="sw-icon" aria-hidden="true">🚀</span>
                            <div className="sw-text">
                                <h3>Welcome! Let's set up your business</h3>
                                <p>Fill up each part below, then press <b>Save changes</b>. You can come back anytime.</p>
                            </div>
                            {days !== null && (
                                <span className="sw-trial"><b>{days}</b><small>day{days === 1 ? "" : "s"} left<br />free trial</small></span>
                            )}
                            <button type="button" className="sw-x" onClick={endWelcome} aria-label="Hide the guide" title="Hide the guide">×</button>
                        </div>

                        <div className="sw-progress">
                            <div className="sw-bar"><span style={{ width: `${Math.round((doneCount / total) * 100)}%` }} /></div>
                            <span>{doneCount} of {total} done</span>
                        </div>

                        <ol className="sw-steps">
                            {WELCOME_STEPS.map(([k, l], n) => {
                                const done = doneOf(k);
                                return (
                                    <li key={k} className={`${k === section ? "is-on" : ""}${done ? " is-done" : ""}`}>
                                        <button type="button" onClick={() => go(k)} aria-current={k === section ? "step" : undefined}>
                                            <em>{done ? "✓" : n + 1}</em><span>{l}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>

                        <div className="sw-nav">
                            <span className="sw-where">Step <b>{i + 1}</b> of {total} · <b>{WELCOME_STEPS[i][1]}</b></span>
                            <button type="button" className="btn btn-sm" onClick={() => go(WELCOME_STEPS[Math.max(0, i - 1)][0])} disabled={i === 0}>‹ Back</button>
                            {i < total - 1
                                ? <button type="button" className="btn btn-sm btn-primary" onClick={() => go(WELCOME_STEPS[i + 1][0])}>Next: {WELCOME_STEPS[i + 1][1]} ›</button>
                                : <button type="button" className="btn btn-sm btn-primary" onClick={() => { if (dirty) setAskSave(true); endWelcome(); }}>Finish{dirty ? " & save" : ""}</button>}
                        </div>
                    </section>
                );
            })()}

            <div className="st-layout">
                {/* ---------- left nav ---------- */}
                <nav className="card st-nav" aria-label="Settings sections">
                    {navSections.map(([k, l]) => (
                        <button key={k} type="button" className={`st-nav-item ${section === k ? "is-active" : ""}`}
                            aria-current={section === k ? "page" : undefined} onClick={() => go(k)}>
                            <span>{l}</span>
                            {k === "accounts" && <span className="st-badge">{data.accounts.length}</span>}
                            {k === "ids" && <span className="st-badge">{data.valid_ids.length}</span>}
                        </button>
                    ))}
                </nav>

                {/* ---------- right panel ---------- */}
                <div className="card st-panel" ref={panelRef}>
                    {/* PROFILE */}
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
                                {federated ? (
                                    /* Google / Facebook sign-up: no Client status → Date of birth | Civil status, then Gender */
                                    <>
                                        <label className="field">
                                            <span className="field-label">Date of birth</span>
                                            <input type="date" className="input" value={form.birthdate} onChange={(e) => set({ birthdate: e.target.value })} />
                                        </label>
                                        <div className="field">
                                            <span className="field-label">Civil status</span>
                                            <SearchSelect value={form.civ_stat_id} options={opts(L.civil)} onChange={(v) => set({ civ_stat_id: v })} aria-label="Civil status" />
                                        </div>
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
                                    </>
                                ) : (
                                    <>
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
                                    </>
                                )}
                                {!federated && (
                                    <div className="field">
                                        <span className="field-label">Client status</span>
                                        <SearchSelect value={form.status_id} options={opts(L.status)} onChange={(v) => set({ status_id: v })} aria-label="Client status" />
                                    </div>
                                )}
                            </div>
                            <p className="st-note"><b className="st-req">*</b> Required</p>
                        </>
                    )}

                    {/* CONTACT */}
                    {section === "contact" && (
                        <>
                            <h2 className="st-h">Contact</h2>
                            <div className="st-grid">
                                <label className="field">
                                    <span className="field-label">Cellphone number</span>
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

                    {/* ADDRESS */}
                    {section === "address" && (
                        <>
                            <h2 className="st-h">Client address</h2>
                            <AddressPicker idPrefix="client" provinces={L.provinces}
                                value={{ province_id: form.province_id, city_id: form.city_id, brgy_id: form.brgy_id }}
                                onChange={(p) => set(p)} />
                            <label className="field st-mt">
                                <span className="field-label">Street name / district</span>
                                <textarea className="input st-textarea" rows={3} value={form.street} onChange={(e) => set({ street: e.target.value })} />
                            </label>
                        </>
                    )}

                    {/* BUSINESS OWNERSHIP */}
                    {section === "ownership" && (
                        <>
                            <h2 className="st-h">Business ownership type</h2>
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

                    {/* CLASSIFICATION & COMPLIANCE */}
                    {section === "classification" && (
                        <>
                            <h2 className="st-h">Classification</h2>
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
                                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="m5 12 5 5L20 7" />
                                                </svg>
                                            </span>

                                            <dl className="st-facts">
                                                {shown.map((s, i) => (
                                                    <div key={i} className="st-fact">
                                                        <dt>{s.title ? s.title : "Note"}</dt>
                                                        <dd>
                                                            {s.items.map((it, j) => (
                                                                <span key={j} className="st-fact-v" title={it}>{it}</span>
                                                            ))}
                                                        </dd>
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

                            <h2 className="st-h st-mt">
                                Compliance <span className="muted st-h-note">({form.compliance_ids.length} selected)</span>
                            </h2>
                            <div className="st-checks">
                                {(L.compliance || []).map((c) => {
                                    const on = form.compliance_ids.includes(String(c.id));
                                    return (
                                        <label key={c.id} className={`st-check ${on ? "is-on" : ""}`}>
                                            <input type="checkbox" checked={on}
                                                onChange={(e) => set({
                                                    compliance_ids: e.target.checked
                                                        ? [...form.compliance_ids, String(c.id)]
                                                        : form.compliance_ids.filter((x) => x !== String(c.id)),
                                                })} />
                                            <span>{c.label}</span>
                                        </label>
                                    );
                                })}
                                {!(L.compliance || []).length && <p className="muted">No compliance items found.</p>}
                            </div>
                        </>
                    )}

                    {/* ENGAGEMENT */}
                    {section === "engagement" && (
                        <>
                            <h2 className="st-h">Engagement</h2>
                            <div className="st-grid">
                                <div className="field st-span2">
                                    <span className="field-label">Industry</span>
                                    <SearchSelect value={form.industries_id} options={opts(L.industries)} onChange={(v) => set({ industries_id: v })} aria-label="Industry" />
                                </div>
                                <label className="field">
                                    <span className="field-label">Date of engagement</span>
                                    <input type="date" className="input" value={form.date_of_engagement} onChange={(e) => set({ date_of_engagement: e.target.value })} />
                                </label>
                                <label className="field">
                                    <span className="field-label">Date of disengagement</span>
                                    <input type="date" className="input" value={form.date_of_disengagement} onChange={(e) => set({ date_of_disengagement: e.target.value })} />
                                </label>
                                <label className="field">
                                    <span className="field-label">Date started</span>
                                    <input type="date" className="input" value={form.date_started} onChange={(e) => set({ date_started: e.target.value })} />
                                </label>
                                <label className="field">
                                    <span className="field-label">Date registered</span>
                                    <input type="date" className="input" value={form.date_registered} onChange={(e) => set({ date_registered: e.target.value })} />
                                </label>
                            </div>
                        </>
                    )}

                    {/* BILLING & PLANS (Google / Facebook clients) */}
                    {section === "billing" && federated && (
                        <>
                            <h2 className="st-h">Billing &amp; plans</h2>
                            <p className="st-note st-note-top">Pick the plan that fits your business. You can change plans anytime.</p>
                            <PricingPlans />
                        </>
                    )}

                    {/* SIGN-IN: Google / Facebook */}
                    {section === "signin" && (
                        <>
                            <h2 className="st-h">Sign-in with Google / Facebook</h2>
                            <p className="st-note st-note-top">Link your Google or Facebook account to sign in without typing your username and password.</p>
                            <div style={{ maxWidth: 520 }}><SocialLinks compact /></div>
                        </>
                    )}

                    {/* VALID IDS */}
                    {section === "ids" && (
                        <>
                            <h2 className="st-h">Valid IDs</h2>
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
                                        inputMode={isBir(newId.institution) ? "numeric" : "text"}
                                        maxLength={isBir(newId.institution) ? 11 : 60}
                                        placeholder={isBir(newId.institution) ? "000-000-000" : ""}
                                        onChange={(e) => setNewId((s) => ({ ...s, id_num: fmtIdFor(s.institution, e.target.value) }))}
                                        onKeyDown={(e) => { if (e.key === "Enter") addId(); }} />
                                </label>
                                <button className="btn btn-primary st-id-btn" onClick={addId} disabled={idBusy}>{idBusy ? "Adding…" : "Add ID"}</button>
                            </div>
                            <ul className="st-ids">
                                {data.valid_ids.map((v) => {
                                    const editing = editId?.id === v.id;
                                    const instOpts = INSTITUTIONS.includes(v.institution)
                                        ? INSTITUTIONS
                                        : [v.institution, ...INSTITUTIONS];
                                    return (
                                        <li key={v.id} className={`st-idrow ${editing ? "is-editing" : ""}`}>
                                            {editing ? (
                                                <>
                                                    <div className="st-id-inst-edit">
                                                        <SearchSelect value={editId.institution}
                                                            options={instOpts.map((x) => ({ value: x, label: x }))}
                                                            onChange={(val) => setEditId((s) => ({ ...s, institution: val, id_num: fmtIdFor(val, s.id_num) }))}
                                                            aria-label="Institution" />
                                                    </div>
                                                    <input className="input mono st-idnum-edit" value={editId.id_num} autoFocus
                                                        inputMode={isBir(editId.institution) ? "numeric" : "text"}
                                                        maxLength={isBir(editId.institution) ? 11 : 60}
                                                        placeholder={isBir(editId.institution) ? "000-000-000" : ""}
                                                        onChange={(e) => setEditId((s) => ({ ...s, id_num: fmtIdFor(s.institution, e.target.value) }))}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") saveEditId();
                                                            if (e.key === "Escape") setEditId(null);
                                                        }}
                                                        aria-label="ID number" />
                                                    <div className="st-id-actions">
                                                        <button className="btn btn-sm" onClick={() => setEditId(null)} disabled={editBusy}>Cancel</button>
                                                        <button className="btn btn-sm btn-primary" onClick={saveEditId} disabled={editBusy}>
                                                            {editBusy ? "Saving…" : "Save"}
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <span className={`st-inst ${v.institution === "BIR" ? "is-bir" : ""}`}>{v.institution}</span>
                                                    <span className="mono st-idnum">{v.id_num}</span>
                                                    <div className="st-id-actions">
                                                        <button className="tm-icon" onClick={() => setEditId({ id: v.id, institution: v.institution, id_num: fmtIdFor(v.institution, v.id_num) })}
                                                            aria-label={`Edit ${v.institution} ID`} title="Edit" disabled={!!editId}>
                                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                                <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                                            </svg>
                                                        </button>
                                                        <button className="tm-icon tm-icon-danger" onClick={() => setDelId(v)}
                                                            aria-label={`Remove ${v.institution} ID`} title="Remove" disabled={!!editId}>
                                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                                <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </li>
                                    );
                                })}
                                {!data.valid_ids.length && <li className="st-empty">No IDs yet. Add the BIR TIN first.</li>}
                            </ul>
                        </>
                    )}

                    {/* BUSINESS ACCOUNTS */}
                    {section === "accounts" && (
                        <>
                            <div className="st-h-row">
                                <div>
                                    <h2 className="st-h st-h-tight">Business accounts</h2>
                                    <p className="st-h-sub">Each branch has its own trade name, branch code and tax details.</p>
                                </div>
                                <button className="btn btn-primary" onClick={() => openAccount(null)}>＋ Add account</button>
                            </div>

                            <div className="ba-stats">
                                <div className="ba-stat"><span className="ba-stat-n">{accCounts.all}</span><span className="ba-stat-l">Accounts</span></div>
                                <div className="ba-stat"><span className="ba-stat-n ba-ok">{accCounts.active}</span><span className="ba-stat-l">Active</span></div>
                                <div className="ba-stat"><span className="ba-stat-n ba-off">{accCounts.inactive}</span><span className="ba-stat-l">Inactive</span></div>
                                <div className="ba-stat ba-stat-main">
                                    <span className="ba-stat-l">Main branch</span>
                                    <span className="ba-stat-main-name">{mainAccount?.trade_name || "—"}</span>
                                </div>
                            </div>

                            <div className="ba-toolbar">
                                <div className="ba-search">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                                    </svg>
                                    <input className="input" type="search" placeholder="Search trade name, code, nature…" value={accQ}
                                        onChange={(e) => setAccQ(e.target.value)} aria-label="Search business accounts" />
                                </div>
                                <div className="ba-tabs" role="tablist" aria-label="Filter accounts">
                                    {[["all", "All", accCounts.all], ["main", "Main", accCounts.main], ["branch", "Branches", accCounts.branch], ["inactive", "Inactive", accCounts.inactive]].map(([k, l, n]) => (
                                        <button key={k} type="button" role="tab" aria-selected={accFilter === k}
                                            className={`ba-tab ${accFilter === k ? "is-active" : ""}`} onClick={() => setAccFilter(k)}>
                                            {l}<span className="ba-tab-n">{n}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="ba-list" role="list">
                                {shownAccounts.map((a) => {
                                    const main = isMain(a);
                                    const active = isActive(a);
                                    const contact = [a.phone_num, a.tell_num, a.email_address].filter(Boolean).join(" · ");
                                    return (
                                        <div key={a.id} role="listitem"
                                            className={`ba-row ${main ? "is-main" : ""} ${active ? "" : "is-off"}`}
                                            onClick={() => openAccount(a)}
                                            onKeyDown={(e) => { if (e.key === "Enter") openAccount(a); }}
                                            tabIndex={0} aria-label={`Edit ${a.trade_name}`}>
                                            <div className="ba-code" aria-hidden="true">
                                                <span className="ba-code-lbl">CODE</span>
                                                <span className="ba-code-n mono">{a.branch_code || "—"}</span>
                                            </div>

                                            <div className="ba-main">
                                                <div className="ba-name-row">
                                                    <span className="ba-name">{a.trade_name || "Untitled account"}</span>
                                                    {main && <span className="ba-main-tag">MAIN</span>}
                                                </div>
                                                <div className="ba-sub">
                                                    <span>{a.nature_label || "No nature of business"}</span>
                                                    {contact && <><span className="ba-sep">•</span><span className="ba-contact">{contact}</span></>}
                                                </div>
                                            </div>

                                            <dl className="ba-facts">
                                                <div><dt>Type</dt><dd><span className={`ba-type ${main ? "is-main" : ""}`}>{a.branch_type || "—"}</span></dd></div>
                                                <div><dt>Tax reg.</dt><dd>{a.tax_registration || "—"}</dd></div>
                                                {data.has_rdo && <div><dt>RDO</dt><dd className="mono">{a.rdo || "—"}</dd></div>}
                                                <div>
                                                    <dt>Status</dt>
                                                    <dd>
                                                        <span className={`tm-status ${active ? "is-on" : ""}`}>
                                                            <span className="tm-dot" aria-hidden="true" />{a.status_label || (active ? "Active" : "Inactive")}
                                                        </span>
                                                    </dd>
                                                </div>
                                            </dl>

                                            <div className="ba-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                                <button className="tm-icon" onClick={() => openAccount(a)} aria-label={`Edit ${a.trade_name}`} title="Edit">
                                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                                    </svg>
                                                </button>
                                                <button className="tm-icon tm-icon-danger" onClick={() => setDelAcct({ account: a, typed: "", busy: false, error: "" })}
                                                    aria-label={`Delete ${a.trade_name}`} title="Delete">
                                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {!shownAccounts.length && (
                                    <div className="ba-empty">
                                        {data.accounts.length ? (
                                            <>
                                                <p className="ba-empty-title">No account matches your search</p>
                                                <button className="btn btn-sm" onClick={() => { setAccQ(""); setAccFilter("all"); }}>Clear filters</button>
                                            </>
                                        ) : (
                                            <>
                                                <p className="ba-empty-title">No business accounts yet</p>
                                                <p className="muted">Add the main branch first, then each branch.</p>
                                                <button className="btn btn-primary" onClick={() => openAccount(null)}>＋ Add account</button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ---------- confirm save ---------- */}
            {askSave && (
                <ConfirmDialog
                    title="Save changes?"
                    message="The client's profile, address, ownership, classification, compliance and engagement details will be updated."
                    confirmLabel="Save"
                    onCancel={() => setAskSave(false)}
                    onConfirm={saveClient}
                />
            )}

            {/* ---------- business account popup ---------- */}
            {acct && (
                <Modal
                    title={acct.id ? `Edit ${acct.trade_name || "business account"}` : "Add business account"}
                    onClose={() => setAcct(null)}
                    size="lg"
                    footer={
                        <div className="tm-foot">
                            <button className="btn" onClick={() => setAcct(null)}>Close</button>
                            <button className="btn btn-primary" onClick={saveAccount} disabled={acctSaving}>
                                {acctSaving ? "Saving…" : acct.id ? "Update" : "Register"}
                            </button>
                        </div>
                    }
                >
                    <div className="st-tabs" role="tablist">
                        {[["info", "Information"], ["address", "Address & contact"], ["login", "Login"], ["coa", "Charts of account"]].map(([k, l]) => (
                            <button key={k} type="button" role="tab" aria-selected={acctTab === k}
                                className={`st-tab ${acctTab === k ? "is-active" : ""}`} onClick={() => setAcctTab(k)}>{l}</button>
                        ))}
                    </div>

                    {acctTab === "info" && (
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
                                    options={L.branch_types?.length
                                        ? L.branch_types.map((b) => ({ value: b.label, label: b.label }))
                                        : [{ value: "MAIN", label: "MAIN" }, { value: "BRANCH", label: "BRANCH" }]}
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
                            {data.has_rdo && (
                                <label className="field">
                                    <span className="field-label">RDO</span>
                                    <input className="input mono" value={acct.rdo} placeholder="000" onChange={(e) => setA({ rdo: e.target.value })} />
                                </label>
                            )}
                            {!federated && (
                                <div className="field">
                                    <span className="field-label">Account status</span>
                                    <SearchSelect value={acct.status_id} options={opts(L.status)} onChange={(v) => setA({ status_id: v })} aria-label="Account status" />
                                </div>
                            )}
                            <label className="st-switch-row">
                                <input type="checkbox" checked={!!acct.is_active} onChange={(e) => setA({ is_active: e.target.checked })} />
                                <span>Active</span>
                            </label>
                        </div>
                    )}

                    {acctTab === "address" && (
                        <>
                            <label className="field">
                                <span className="field-label">Street name / district</span>
                                <input className="input" value={acct.street} onChange={(e) => setA({ street: e.target.value })} />
                            </label>
                            <div className="st-mt">
                                <AddressPicker idPrefix="acct" provinces={L.provinces}
                                    value={{ province_id: acct.province_id, city_id: acct.city_id, brgy_id: acct.brgy_id }}
                                    onChange={(p) => setA(p)} />
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

                    {acctTab === "login" && (
                        <div className="cml-login-form">
                            <p className="st-note">One login per business account. The username can't be used by any other login.</p>
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
                            <div className="cml-login-flags st-mt">
                                {[["is_active", "Active"], ["is_web", "Web"], ["is_pos", "POS"], ["is_mobile", "Mobile"]].map(([k, l]) => (
                                    <label key={k} className="st-switch-row">
                                        <input type="checkbox" checked={!!login[k]} onChange={(e) => setLogin({ [k]: e.target.checked })} />
                                        <span>{l}</span>
                                    </label>
                                ))}
                            </div>
                            {!savedLogin && !login.username && <p className="st-note">Leave the username blank to save the account without a login (then no Charts of account).</p>}
                        </div>
                    )}

                    {acctTab === "coa" && (
                        <CoaPicker tpl={coaTpl} selected={coa} onChange={(v) => { setCoa(v); setCoaTouched(true); }}
                            hasLogin={!!login.username.trim() || !!savedLogin} isEdit={!!acct.id} noNature={!acct.nob_id}
                            onPickNature={() => setAcctTab("info")}
                            natureLabel={(L.nature || []).find((n) => String(n.id) === String(acct.nob_id))?.label || ""} />
                    )}

                    {acctError && <div className="alert-error st-mt" role="alert">{acctError}</div>}
                </Modal>
            )}

            {/* ---------- delete business account (type the branch code) ---------- */}
            {delAcct && (
                <Modal
                    title="Delete business account?"
                    onClose={() => setDelAcct(null)}
                    footer={
                        <div className="tm-foot">
                            <button className="btn" onClick={() => setDelAcct(null)}>Cancel</button>
                            <button className="btn st-btn-danger" onClick={deleteAccount}
                                disabled={delAcct.busy || delAcct.typed.trim() !== String(delAcct.account.branch_code).trim()}>
                                {delAcct.busy ? "Deleting…" : "Delete account"}
                            </button>
                        </div>
                    }
                >
                    <p>
                        <b>{delAcct.account.trade_name}</b> ({delAcct.account.branch_type} · <span className="mono">{delAcct.account.branch_code}</span>) will be removed. You can't undo this.
                    </p>
                    <label className="field st-mt">
                        <span className="field-label">Type the branch code <span className="mono">{delAcct.account.branch_code}</span> to confirm</span>
                        <input className="input mono" value={delAcct.typed} autoFocus onChange={(e) => setDelAcct((d) => ({ ...d, typed: e.target.value }))} />
                    </label>
                    {delAcct.error && <div className="alert-error st-mt" role="alert">{delAcct.error}</div>}
                </Modal>
            )}

            {/* ---------- remove a valid ID ---------- */}
            {delId && (
                <ConfirmDialog
                    title="Remove this ID?"
                    message={`${delId.institution} ${delId.id_num} will be removed from this client.`}
                    confirmLabel="Remove"
                    onCancel={() => setDelId(null)}
                    onConfirm={removeId}
                />
            )}
        </section>
    );
}