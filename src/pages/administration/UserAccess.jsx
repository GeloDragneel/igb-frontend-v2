// Administration → User Access
// Every employee (m_employee) as a card with their staff login (m_user_staff) – or "No login yet"
// click a card → popup: Login (create / edit m_user_staff) · Page access · Client logins
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import { NAV } from "../../components/routesMeta";
import "./UserAccess.css";
import "./UserAccessCards.css";

// the Staff section of the sidebar: single links become a one-item group
const STAFF = (NAV.find((s) => s.section === "Staff")?.entries || []).map((e) =>
    e.group ? { key: e.group, label: e.group, items: e.items } : { key: e.to, label: e.label, items: [{ to: e.to, label: e.label }] }
);
const ALL_PATHS = STAFF.flatMap((g) => g.items.map((i) => i.to));

const initials = (u) => (u.name || u.username || "?").split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
// same person → same colour
const TONES = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#4f46e5", "#ca8a04"];
const toneOf = (s) => TONES[[...String(s)].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];

function Photo({ u, size = 72 }) {
    const [broken, setBroken] = useState(false);
    return u.photo && !broken ? (
        <img className="uac-photo" src={u.photo} alt="" width={size} height={size} onError={() => setBroken(true)} />
    ) : (
        <span className="uac-photo uac-initials" style={{ width: size, height: size, background: toneOf(u.username || u.name), fontSize: size * 0.36 }}>{initials(u)}</span>
    );
}

export default function UserAccess() {
    const notify = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("active");
    const [sel, setSel] = useState(null);              // the card that is open
    const [detail, setDetail] = useState(null);        // { user, paths, saved }
    const [paths, setPaths] = useState([]);
    const [busy, setBusy] = useState(false);
    const [openGroups, setOpenGroups] = useState(() => STAFF.map((g) => g.key));   // tree: every group open
    const [tab, setTab] = useState("pages");           // popup: "login" | "pages" | "clients"

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setUsers(await apiFetch("/admin/user-access"));
        } catch (e) {
            setError(e.message || "Couldn't load the staff logins.");
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { loadUsers(); }, [loadUsers]);

    useEffect(() => {
        setDetail(null);
        if (!sel?.id) return;                             // no login yet → nothing to load for Page access
        let alive = true;
        apiFetch(`/admin/user-access/${sel.id}`)
            .then((d) => { if (!alive) return; setDetail(d); setPaths(d.saved ? d.paths : ALL_PATHS); })
            .catch((e) => { if (alive) { notify(e.message, "error"); setSel(null); } });
        return () => { alive = false; };
    }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return users.filter((u) =>
            (status === "all" || (status === "nologin" ? !u.has_login : status === "active" ? u.is_active : !u.is_active)) &&
            (!s || [u.name, u.username, u.designation, u.user_type].some((v) => (v || "").toLowerCase().includes(s))));
    }, [users, q, status]);

    const has = (p) => paths.includes(p);
    const setMany = (list, on) => setPaths((cur) => {
        const set = new Set(cur);
        list.forEach((p) => (on ? set.add(p) : set.delete(p)));
        return ALL_PATHS.filter((p) => set.has(p));
    });

    const original = detail ? (detail.saved ? detail.paths : ALL_PATHS) : [];
    const dirty = detail && (original.length !== paths.length || original.some((p) => !paths.includes(p)));

    const close = () => { if (!busy) { setSel(null); setDetail(null); setTab("pages"); } };

    const save = async () => {
        setBusy(true);
        try {
            const r = await apiFetch(`/admin/user-access/${sel.id}`, { method: "PUT", body: JSON.stringify({ paths }) });
            notify(r.message || "User access saved.");
            setDetail((d) => ({ ...d, paths: r.paths, saved: true }));
            setUsers((list) => list.map((u) => (u.id === sel.id ? { ...u, pages: r.paths.length, saved: true } : u)));
        } catch (e) {
            notify(e.message || "Couldn't save.", "error");
        } finally {
            setBusy(false);
        }
    };

    const counts = useMemo(() => ({
        active: users.filter((u) => u.is_active).length,
        inactive: users.filter((u) => !u.is_active).length,
        nologin: users.filter((u) => !u.has_login).length,
        all: users.length,
    }), [users]);

    const openCard = (u) => { setSel(u); setTab(u.has_login ? "pages" : "login"); };
    // Login tab created / changed the m_user_staff row → update the card and the popup
    const loginChanged = (login) => {
        const patch = login
            ? { id: login.id, has_login: true, username: login.username, is_active: login.is_active }
            : {};
        setUsers((list) => list.map((u) => (u.key === sel.key ? { ...u, ...patch } : u)));
        setSel((cur) => (cur ? { ...cur, ...patch } : cur));
    };

    return (
        <div className="uac">
            {/* ---------- toolbar ---------- */}
            <section className="card uac-bar">
                <input className="input" placeholder="Search name, username, designation" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search staff" />
                <div className="ua-seg" role="tablist">
                    {[["active", "Active"], ["inactive", "Inactive"], ["nologin", "No login"], ["all", "All"]].map(([v, l]) => (
                        <button key={v} role="tab" aria-selected={status === v} className={status === v ? "is-on" : ""} onClick={() => setStatus(v)}>
                            {l} <span className="uac-n">{counts[v]}</span>
                        </button>
                    ))}
                </div>
            </section>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={loadUsers}>Try again</button></div>}

            {/* ---------- staff cards ---------- */}
            <div className="uac-grid">
                {loading && Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="card uac-card is-sk" aria-hidden="true">
                        <span className="sk" style={{ width: 72, height: 72, borderRadius: "50%" }} />
                        <span className="sk sk-cell" style={{ width: "70%" }} />
                        <span className="sk sk-cell" style={{ width: "45%" }} />
                    </div>
                ))}
                {!loading && !shown.length && <p className="ua-empty">No employee matches.</p>}
                {!loading && shown.map((u) => (
                    <button key={u.key} type="button" className={`card uac-card${u.is_active ? "" : " is-off"}${u.has_login ? "" : " is-nologin"}`} onClick={() => openCard(u)}>
                        {u.has_login ? (
                            <span className={`uac-pages ${u.saved ? "" : "is-all"}`} title={u.saved ? "Pages this login can open" : "Not set up yet: sees every Staff page"}>
                                {u.saved ? `${u.pages}/${ALL_PATHS.length} pages` : "All pages"}
                            </span>
                        ) : <span className="uac-pages is-none" title="No staff login (m_user_staff) yet">No login</span>}
                        <Photo u={u} />
                        <b className="uac-name" title={u.name}>{u.name}</b>
                        <small className={`uac-user${u.has_login ? "" : " is-empty"}`}>{u.has_login ? `@${u.username}` : "No login yet"}</small>
                        <span className="uac-role">{u.designation || u.user_type || "—"}</span>
                        {!u.is_active && <span className="uac-off">Inactive</span>}
                        <span className="uac-cta">{u.has_login ? "Manage access →" : "Create login →"}</span>
                    </button>
                ))}
            </div>

            {/* ---------- popup: menus of one login ---------- */}
            {sel && (
                <Modal
                    title={
                        <span className="uac-mhead">
                            <Photo u={sel} size={40} />
                            <span>
                                <b>{sel.name}</b>
                                <small>{sel.has_login ? `@${sel.username}` : "No login yet"}{sel.designation ? ` · ${sel.designation}` : ""}{detail?.user?.user_access ? ` · ${detail.user.user_access}` : ""}</small>
                            </span>
                        </span>
                    }
                    onClose={close}
                    size="xlg"
                    footer={
                        <div className="ua-foot uac-mfoot">
                            <span className="muted">{tab === "pages" && sel.id && detail ? `${paths.length} of ${ALL_PATHS.length} pages` : ""}</span>
                            <div className="ua-tools">
                                <button className="btn" onClick={close} disabled={busy}>Close</button>
                                {tab === "pages" && sel.id && (
                                    <>
                                        <button className="btn" onClick={() => setPaths(original)} disabled={!dirty || busy}>Reset</button>
                                        <button className="btn btn-primary" onClick={save} disabled={!detail || busy || (detail.saved && !dirty)}>{busy ? "Saving…" : "Save access"}</button>
                                    </>
                                )}
                            </div>
                        </div>
                    }
                >
                    <div className="uac-tabs" role="tablist">
                        <button role="tab" aria-selected={tab === "pages"} className={tab === "pages" ? "is-on" : ""} onClick={() => setTab("pages")}>Page access</button>
                        <button role="tab" aria-selected={tab === "clients"} className={tab === "clients" ? "is-on" : ""} onClick={() => setTab("clients")}>Client logins</button>
                        <button role="tab" aria-selected={tab === "login"} className={tab === "login" ? "is-on" : ""} onClick={() => setTab("login")}>
                            Login {!sel.has_login && <span className="uac-tabdot" aria-label="no login yet" />}
                        </button>
                    </div>
                    {tab === "login" && (sel.employee_id
                        ? <StaffLogin empId={sel.employee_id} onChange={loginChanged} />
                        : <p className="ua-note">This login is not linked to an employee (m_user_staff.comid → m_employee.com_id), so it can't be managed here.</p>)}
                    {tab === "clients" && <ClientLogins staffId={sel.id} empId={sel.employee_id} />}
                    {tab === "pages" && !sel.id && (
                        <div className="uac-nologin">
                            <p className="ua-note">{sel.name} has no staff login yet. Create it in the <b>Login</b> tab first, then set the pages here.</p>
                            <button className="btn btn-primary" onClick={() => setTab("login")}>Go to Login</button>
                        </div>
                    )}
                    {tab === "pages" && sel.id && !detail && <p className="ua-empty">Loading…</p>}
                    {tab === "pages" && sel.id && detail && (
                        <>
                            <div className="uac-mtools">
                                {!detail.saved
                                    ? <p className="ua-note">Not set up yet, so this login sees every Staff page. Save to apply the ticks below.</p>
                                    : <span />}
                                <div className="ua-tools">
                                    <button className="btn btn-sm" onClick={() => setPaths(ALL_PATHS)}>Check all</button>
                                    <button className="btn btn-sm" onClick={() => setPaths([])}>Uncheck all</button>
                                </div>
                            </div>

                            {/* tree: Staff → groups → pages */}
                            <div className="uat" role="tree" aria-label="Staff pages">
                                <div className="uat-root">
                                    <label className="ua-check">
                                        <input type="checkbox" checked={paths.length === ALL_PATHS.length}
                                            ref={(el) => el && (el.indeterminate = paths.length > 0 && paths.length < ALL_PATHS.length)}
                                            onChange={(e) => setPaths(e.target.checked ? ALL_PATHS : [])} />
                                        <b>Staff</b>
                                        <span className="ua-count">{paths.length}/{ALL_PATHS.length}</span>
                                    </label>
                                    <span className="uat-links">
                                        <button type="button" onClick={() => setOpenGroups(STAFF.map((g) => g.key))}>Expand all</button>
                                        <button type="button" onClick={() => setOpenGroups([])}>Collapse all</button>
                                    </span>
                                </div>
                                <ul className="uat-list">
                                    {STAFF.map((g) => {
                                        const on = g.items.filter((i) => has(i.to)).length;
                                        const all = on === g.items.length;
                                        const single = g.items.length === 1 && g.items[0].to === g.key;
                                        const open = openGroups.includes(g.key);
                                        return (
                                            <li key={g.key} className={`uat-node${single ? " is-leaf" : ""}`} role="treeitem" aria-expanded={single ? undefined : open}>
                                                <div className="uat-row">
                                                    {single ? <span className="uat-caret is-blank" /> : (
                                                        <button type="button" className={`uat-caret${open ? " is-open" : ""}`} aria-label={open ? `Collapse ${g.label}` : `Expand ${g.label}`}
                                                            onClick={() => setOpenGroups((cur) => (open ? cur.filter((k) => k !== g.key) : [...cur, g.key]))}>
                                                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                                        </button>
                                                    )}
                                                    <label className="ua-check">
                                                        <input type="checkbox" checked={all} ref={(el) => el && (el.indeterminate = on > 0 && !all)}
                                                            onChange={(e) => setMany(g.items.map((i) => i.to), e.target.checked)} />
                                                        <b>{g.label}</b>
                                                        {!single && <span className="ua-count">{on}/{g.items.length}</span>}
                                                    </label>
                                                </div>
                                                {!single && open && (
                                                    <ul className="uat-children" role="group">
                                                        {g.items.map((i) => (
                                                            <li key={i.to} className="uat-leaf" role="treeitem">
                                                                <label className="ua-check">
                                                                    <input type="checkbox" checked={has(i.to)} onChange={(e) => setMany([i.to], e.target.checked)} />
                                                                    <span>{i.label}</span>
                                                                </label>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </>
                    )}
                </Modal>
            )}
        </div>
    );
}

/* ---------- popup tab: every client account + this employee's login there (m_user_client_staff) ---------- */
function ClientLogins({ staffId, empId }) {
    // employee endpoints work with or without a staff login; old ones for logins with no employee
    const base = empId ? `/admin/user-access/emp/${empId}` : `/admin/user-access/${staffId}`;
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [show, setShow] = useState("all");              // all | login | none | assigned
    const [busyId, setBusyId] = useState(0);
    const [made, setMade] = useState(null);               // { trade, username, password } just generated
    const notify = useToast();

    const generate = async (r) => {
        setBusyId(r.caid);
        try {
            const res = await apiFetch(`${base}/clients/${r.caid}/login`, { method: "POST" });
            setData((d) => ({
                ...d,
                rows: d.rows.map((x) => (x.caid === r.caid ? { ...x, login: res.login } : x)),
                counts: { ...d.counts, login: (d.counts?.login || 0) + 1 },
            }));
            setMade({ trade: `${r.trade_name}${r.branch_code ? ` - ${r.branch_code}` : ""}`, username: res.login.username, password: res.password });
        } catch (e) {
            notify(e.message || "Couldn't generate the login.", "error");
        } finally {
            setBusyId(0);
        }
    };
    const copy = (t) => navigator.clipboard?.writeText(t).then(() => notify("Copied."));

    useEffect(() => {
        let alive = true;
        setData(null);
        apiFetch(`${base}/clients`)
            .then((d) => alive && setData(d))
            .catch((e) => alive && setError(e.message || "Couldn't load the client accounts."));
        return () => { alive = false; };
    }, [base]);

    const rows = useMemo(() => {
        const s = q.trim().toLowerCase();
        return (data?.rows || []).filter((r) =>
            (show === "all" || (show === "login" ? r.login : show === "none" ? !r.login : r.role)) &&
            (!s || [r.trade_name, r.client_name, r.client_num, r.branch_code, r.login?.username].some((v) => String(v || "").toLowerCase().includes(s))));
    }, [data, q, show]);

    if (error) return <div className="alert-error" role="alert">{error}</div>;
    if (!data) return <p className="ua-empty">Loading…</p>;
    const c = data.counts || {};

    return (
        <div className="ucl">
            {!data.employee_id && <p className="ua-note">This staff login is not linked to an employee (m_user_staff.comid → m_employee.com_id), so it can't have client logins.</p>}
            <div className="ucl-bar">
                <input className="input" placeholder="Search client, branch, username" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search client accounts" />
                <div className="ua-seg" role="tablist">
                    {[["all", "All", c.all], ["login", "Has login", c.login], ["none", "No login", (c.all || 0) - (c.login || 0)], ["assigned", "Assigned", c.assigned]].map(([v, l, n]) => (
                        <button key={v} role="tab" aria-selected={show === v} className={show === v ? "is-on" : ""} onClick={() => setShow(v)}>
                            {l} <span className="uac-n">{n ?? 0}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div className="ucl-scroll">
                <table className="table ucl-table">
                    <thead>
                        <tr><th>Client account</th><th>Login (user client staff)</th><th className="ucl-act">Login</th></tr>
                    </thead>
                    <tbody>
                        {!rows.length && <tr><td colSpan={3} className="ua-empty">No client account matches.</td></tr>}
                        {rows.map((r) => (
                            <tr key={r.caid} className={r.login ? "has-login" : ""}>
                                <td>
                                    <b>{r.trade_name || "—"}{r.branch_code ? ` - ${r.branch_code}` : ""}</b>
                                    <small>{r.client_num}{r.client_name ? ` · ${r.client_name}` : ""}{!r.active ? " · inactive account" : ""}</small>
                                </td>
                                <td>
                                    {r.login ? (
                                        <span className="ucl-login">
                                            <i className={`ucl-dot${r.login.active ? " is-on" : ""}`} />
                                            <span className="mono">{r.login.username}</span>
                                            {!r.login.active && <span className="ucl-chip is-off">Inactive</span>}
                                        </span>
                                    ) : <span className="ucl-none">No login</span>}
                                </td>
                                <td className="ucl-act">
                                    {r.login
                                        ? <span className="ucl-done">✓ Generated</span>
                                        : <button className="btn btn-sm btn-primary" onClick={() => generate(r)} disabled={!!busyId || !data.employee_id}>
                                            {busyId === r.caid ? "Generating…" : "Generate"}
                                        </button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>{rows.length} of {data.rows.length} client account(s)</p>

            {made && createPortal(
                <div className="ucl-made" role="dialog" aria-label="Login generated">
                    <div className="ucl-made-box">
                        <h4>Login generated</h4>
                        <p className="muted small">{made.trade} · give these to the employee. The password is shown only now.</p>
                        <div className="ucl-cred"><span>Username</span><b className="mono">{made.username}</b><button className="btn btn-sm" onClick={() => copy(made.username)}>Copy</button></div>
                        <div className="ucl-cred"><span>Password</span><b className="mono">{made.password}</b><button className="btn btn-sm" onClick={() => copy(made.password)}>Copy</button></div>
                        <div className="ucl-made-foot">
                            <button className="btn" onClick={() => copy(`Username: ${made.username}\nPassword: ${made.password}`)}>Copy both</button>
                            <button className="btn btn-primary" onClick={() => setMade(null)}>Done</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

/* ---------- the username + password, shown once ---------- */
function Credentials({ title, note, username, password, onDone }) {
    const notify = useToast();
    const copy = (t) => navigator.clipboard?.writeText(t).then(() => notify("Copied."));
    return createPortal(
        <div className="ucl-made" role="dialog" aria-label={title}>
            <div className="ucl-made-box">
                <h4>{title}</h4>
                <p className="muted small">{note} The password is shown only now.</p>
                <div className="ucl-cred"><span>Username</span><b className="mono">{username}</b><button className="btn btn-sm" onClick={() => copy(username)}>Copy</button></div>
                <div className="ucl-cred"><span>Password</span><b className="mono">{password}</b><button className="btn btn-sm" onClick={() => copy(password)}>Copy</button></div>
                <div className="ucl-made-foot">
                    <button className="btn" onClick={() => copy(`Username: ${username}\nPassword: ${password}`)}>Copy both</button>
                    <button className="btn btn-primary" onClick={onDone}>Done</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

/* ---------- popup tab: the employee's staff login (m_user_staff) – create it, or change username / type / active / password ---------- */
function StaffLogin({ empId, onChange }) {
    const notify = useToast();
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [f, setF] = useState({ username: "", user_type_id: "", is_active: true, password: "" });
    const [busy, setBusy] = useState("");
    const [made, setMade] = useState(null);                // { title, username, password }
    const [pw, setPw] = useState("");                      // new password (blank = generate)

    const fill = (d) => {
        setData(d);
        setF(d.login
            ? { username: d.login.username, user_type_id: d.login.user_type_id ?? "", is_active: d.login.is_active, password: "" }
            : { username: d.suggest || "", user_type_id: d.employee.designation_id ?? "", is_active: true, password: "" });
    };
    useEffect(() => {
        let alive = true;
        setData(null); setError("");
        apiFetch(`/admin/user-access/emp/${empId}/login`)
            .then((d) => alive && fill(d))
            .catch((e) => alive && setError(e.message || "Couldn't load the login."));
        return () => { alive = false; };
    }, [empId]);

    const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
    const body = () => ({ username: f.username.trim(), user_type_id: f.user_type_id ? Number(f.user_type_id) : null });

    const create = async () => {
        setBusy("create");
        try {
            const r = await apiFetch(`/admin/user-access/emp/${empId}/login`, { method: "POST", body: JSON.stringify({ ...body(), password: f.password || null }) });
            fill(r);
            onChange?.(r.login);
            notify(r.message || "Login created.");
            setMade({ title: "Login created", username: r.login.username, password: r.password });
        } catch (e) { notify(e.message || "Couldn't create the login.", "error"); }
        finally { setBusy(""); }
    };
    const save = async () => {
        setBusy("save");
        try {
            const r = await apiFetch(`/admin/user-access/emp/${empId}/login`, { method: "PUT", body: JSON.stringify({ ...body(), is_active: f.is_active }) });
            fill(r);
            onChange?.(r.login);
            notify(r.message || "Login saved.");
        } catch (e) { notify(e.message || "Couldn't save the login.", "error"); }
        finally { setBusy(""); }
    };
    const resetPw = async () => {
        setBusy("pw");
        try {
            const r = await apiFetch(`/admin/user-access/emp/${empId}/login/password`, { method: "POST", body: JSON.stringify({ password: pw || null }) });
            setPw("");
            setMade({ title: "Password changed", username: r.username, password: r.password });
        } catch (e) { notify(e.message || "Couldn't change the password.", "error"); }
        finally { setBusy(""); }
    };

    if (error) return <div className="alert-error" role="alert">{error}</div>;
    if (!data) return <p className="ua-empty">Loading…</p>;
    const l = data.login;
    const dirty = l && (f.username.trim() !== l.username || String(f.user_type_id ?? "") !== String(l.user_type_id ?? "") || f.is_active !== l.is_active);
    const noCom = !data.employee.com_id;

    const typeName = (id) => data.types.find((t) => String(t.id) === String(id))?.name || "";
    const state = l ? (l.is_active ? "on" : "off") : "none";

    return (
        <div className={`usl${l ? "" : " is-new"}`}>
            {/* ---------- account ---------- */}
            <section className="usl-card">
                <header className="usl-head">
                    <span className={`usl-ico is-${state}`} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </span>
                    <div className="usl-title">
                        <b>{l ? `@${l.username}` : "Create staff login"}</b>
                        <small>
                            {l
                                ? <>{typeName(l.user_type_id) || "No user type"}{l.created_at ? ` · since ${String(l.created_at).slice(0, 10)}` : ""}</>
                                : "So this employee can sign in to the Staff side."}
                        </small>
                    </div>
                    <span className={`usl-pill is-${state}`}>{l ? (l.is_active ? "Active" : "Inactive") : "No login yet"}</span>
                </header>

                {noCom && !l && <p className="ua-note usl-warn">This employee has no com_id in m_employee, so a login can't be linked to them. Fill in the com_id first.</p>}

                <div className="usl-body">
                    <label className="usl-field">
                        <span>Username</span>
                        <div className="usl-input">
                            <i>@</i>
                            <input className="input" value={f.username} onChange={set("username")} maxLength={50} autoComplete="off" spellCheck={false} />
                        </div>
                    </label>
                    <label className="usl-field">
                        <span>User type</span>
                        <select className="input" value={f.user_type_id ?? ""} onChange={set("user_type_id")}>
                            <option value="">—</option>
                            {data.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </label>
                    {!l && (
                        <label className="usl-field usl-span">
                            <span>Password</span>
                            <input className="input" type="text" value={f.password} onChange={set("password")} autoComplete="new-password" placeholder="Leave blank to generate one" />
                        </label>
                    )}
                    {l && (
                        <div className="usl-field usl-span">
                            <span>Sign in</span>
                            <label className={`usl-toggle${f.is_active ? " is-on" : ""}`}>
                                <input type="checkbox" checked={f.is_active} onChange={set("is_active")} />
                                <i aria-hidden="true" />
                                <span>{f.is_active ? "Allowed – this login can sign in" : "Blocked – this login can't sign in"}</span>
                            </label>
                        </div>
                    )}
                </div>

                <footer className="usl-foot">
                    {!l
                        ? <button className="btn btn-primary" onClick={create} disabled={!!busy || noCom || f.username.trim().length < 3}>{busy === "create" ? "Creating…" : "Create login"}</button>
                        : <>
                            {dirty && <span className="usl-dirty">Unsaved changes</span>}
                            <button className="btn" onClick={() => fill(data)} disabled={!dirty || !!busy}>Reset</button>
                            <button className="btn btn-primary" onClick={save} disabled={!dirty || !!busy || f.username.trim().length < 3}>{busy === "save" ? "Saving…" : "Save changes"}</button>
                        </>}
                </footer>
            </section>

            {/* ---------- password ---------- */}
            {l && (
                <section className="usl-card">
                    <header className="usl-head">
                        <span className="usl-ico is-key" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7zm1 3h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                        <div className="usl-title">
                            <b>Password</b>
                            <small>Set a new one for @{l.username}</small>
                        </div>
                    </header>
                    <div className="usl-body usl-one">
                        <label className="usl-field">
                            <span>New password</span>
                            <input className="input" type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Leave blank to generate one" autoComplete="new-password" />
                        </label>
                        {pw && pw.length < 6 && <small className="usl-hint">At least 6 characters.</small>}
                    </div>
                    <footer className="usl-foot">
                        <button className="btn btn-primary" onClick={resetPw} disabled={!!busy || (pw && pw.length < 6)}>{busy === "pw" ? "Changing…" : pw ? "Set password" : "Generate password"}</button>
                    </footer>
                </section>
            )}

            {made && <Credentials title={made.title} note={`${data.employee.name} · give these to the employee.`} username={made.username} password={made.password} onDone={() => setMade(null)} />}
        </div>
    );
}