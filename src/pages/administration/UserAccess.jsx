// Administration → User Access
// Staff logins (m_user_staff) as cards · click a card → popup with the Staff pages that login can open
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
    const [tab, setTab] = useState("pages");           // popup: "pages" | "clients"

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
        if (!sel) return;
        let alive = true;
        apiFetch(`/admin/user-access/${sel.id}`)
            .then((d) => { if (!alive) return; setDetail(d); setPaths(d.saved ? d.paths : ALL_PATHS); })
            .catch((e) => { if (alive) { notify(e.message, "error"); setSel(null); } });
        return () => { alive = false; };
    }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return users.filter((u) =>
            (status === "all" || (status === "active" ? u.is_active : !u.is_active)) &&
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
        all: users.length,
    }), [users]);

    return (
        <div className="uac">
            {/* ---------- toolbar ---------- */}
            <section className="card uac-bar">
                <input className="input" placeholder="Search name, username, designation" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search staff" />
                <div className="ua-seg" role="tablist">
                    {[["active", "Active"], ["inactive", "Inactive"], ["all", "All"]].map(([v, l]) => (
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
                {!loading && !shown.length && <p className="ua-empty">No staff login matches.</p>}
                {!loading && shown.map((u) => (
                    <button key={u.id} type="button" className={`card uac-card${u.is_active ? "" : " is-off"}`} onClick={() => setSel(u)}>
                        <span className={`uac-pages ${u.saved ? "" : "is-all"}`} title={u.saved ? "Pages this login can open" : "Not set up yet: sees every Staff page"}>
                            {u.saved ? `${u.pages}/${ALL_PATHS.length} pages` : "All pages"}
                        </span>
                        <Photo u={u} />
                        <b className="uac-name" title={u.name}>{u.name}</b>
                        <small className="uac-user">@{u.username}</small>
                        <span className="uac-role">{u.designation || u.user_type || "—"}</span>
                        {!u.is_active && <span className="uac-off">Inactive</span>}
                        <span className="uac-cta">Manage access →</span>
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
                                <small>@{sel.username}{sel.designation ? ` · ${sel.designation}` : ""}{detail?.user?.user_access ? ` · ${detail.user.user_access}` : ""}</small>
                            </span>
                        </span>
                    }
                    onClose={close}
                    size="xlg"
                    footer={
                        <div className="ua-foot uac-mfoot">
                            <span className="muted">{tab === "pages" && detail ? `${paths.length} of ${ALL_PATHS.length} pages` : ""}</span>
                            <div className="ua-tools">
                                <button className="btn" onClick={close} disabled={busy}>Close</button>
                                {tab === "pages" && (
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
                    </div>
                    {tab === "clients" && <ClientLogins staffId={sel.id} />}
                    {tab === "pages" && !detail && <p className="ua-empty">Loading…</p>}
                    {tab === "pages" && detail && (
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
function ClientLogins({ staffId }) {
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
            const res = await apiFetch(`/admin/user-access/${staffId}/clients/${r.caid}/login`, { method: "POST" });
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
        apiFetch(`/admin/user-access/${staffId}/clients`)
            .then((d) => alive && setData(d))
            .catch((e) => alive && setError(e.message || "Couldn't load the client accounts."));
        return () => { alive = false; };
    }, [staffId]);

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