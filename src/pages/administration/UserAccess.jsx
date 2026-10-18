// Administration → User Access
// Staff logins (m_user_staff) only · tick which pages of the sidebar's Staff section each login can open
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import { NAV } from "../../components/routesMeta";
import "./UserAccess.css";

// the Staff section of the sidebar: single links become a one-item group
const STAFF = (NAV.find((s) => s.section === "Staff")?.entries || []).map((e) =>
    e.group ? { key: e.group, label: e.group, items: e.items } : { key: e.to, label: e.label, items: [{ to: e.to, label: e.label }] }
);
const ALL_PATHS = STAFF.flatMap((g) => g.items.map((i) => i.to));

export default function UserAccess() {
    const notify = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("active");
    const [selId, setSelId] = useState(null);
    const [detail, setDetail] = useState(null);        // { user, paths, saved }
    const [paths, setPaths] = useState([]);
    const [busy, setBusy] = useState(false);

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
        if (!selId) return;
        let alive = true;
        apiFetch(`/admin/user-access/${selId}`)
            .then((d) => { if (!alive) return; setDetail(d); setPaths(d.saved ? d.paths : ALL_PATHS); })
            .catch((e) => alive && notify(e.message, "error"));
        return () => { alive = false; };
    }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const save = async () => {
        setBusy(true);
        try {
            const r = await apiFetch(`/admin/user-access/${selId}`, { method: "PUT", body: JSON.stringify({ paths }) });
            notify(r.message || "User access saved.");
            setDetail((d) => ({ ...d, paths: r.paths, saved: true }));
            setUsers((list) => list.map((u) => (u.id === selId ? { ...u, pages: r.paths.length, saved: true } : u)));
        } catch (e) {
            notify(e.message || "Couldn't save.", "error");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="ua">
            {/* ---------- staff logins ---------- */}
            <section className="card ua-users">
                <div className="ua-users-bar">
                    <input className="input" placeholder="Search name, username, designation" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search staff" />
                    <div className="ua-seg" role="tablist">
                        {[["active", "Active"], ["inactive", "Inactive"], ["all", "All"]].map(([v, l]) => (
                            <button key={v} role="tab" aria-selected={status === v} className={status === v ? "is-on" : ""} onClick={() => setStatus(v)}>{l}</button>
                        ))}
                    </div>
                </div>
                {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={loadUsers}>Try again</button></div>}
                <ul className="ua-list">
                    {loading && <li className="ua-empty">Loading…</li>}
                    {!loading && !shown.length && <li className="ua-empty">No staff login matches.</li>}
                    {!loading && shown.map((u) => (
                        <li key={u.id}>
                            <button className={`ua-user ${selId === u.id ? "is-on" : ""}`} onClick={() => setSelId(u.id)}>
                                <span className="ua-avatar">{(u.name || u.username).split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                                <span className="ua-user-main">
                                    <b>{u.name}</b>
                                    <small>@{u.username}{u.designation ? ` · ${u.designation}` : u.user_type ? ` · ${u.user_type}` : ""}</small>
                                </span>
                                <span className={`ua-pill ${u.saved ? "" : "is-all"}`} title={u.saved ? "Pages this login can open" : "Not set up yet: sees every Staff page"}>
                                    {u.saved ? `${u.pages}/${ALL_PATHS.length}` : "All"}
                                </span>
                                {!u.is_active && <span className="ua-off">Inactive</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            </section>

            {/* ---------- pages ---------- */}
            <section className="card ua-access">
                {!selId && (
                    <div className="ua-pick">
                        <b>Select a staff login</b>
                        <span>Pick a login on the left to choose which Staff pages it can open.</span>
                    </div>
                )}
                {selId && !detail && <p className="ua-empty">Loading…</p>}
                {detail && (
                    <>
                        <header className="ua-head">
                            <div>
                                <h3>{detail.user.name}</h3>
                                <p className="muted small">
                                    @{detail.user.username}
                                    {detail.user.designation && ` · ${detail.user.designation}`}
                                    {detail.user.user_access && ` · ${detail.user.user_access}`}
                                </p>
                            </div>
                            <div className="ua-tools">
                                <button className="btn btn-sm" onClick={() => setPaths(ALL_PATHS)}>Check all</button>
                                <button className="btn btn-sm" onClick={() => setPaths([])}>Uncheck all</button>
                            </div>
                        </header>
                        {!detail.saved && <p className="ua-note">Not set up yet, so this login sees every Staff page. Save to apply the ticks below.</p>}

                        <div className="ua-grid">
                            {STAFF.map((g) => {
                                const on = g.items.filter((i) => has(i.to)).length;
                                const all = on === g.items.length;
                                const single = g.items.length === 1 && g.items[0].to === g.key;
                                return (
                                    <fieldset key={g.key} className="ua-group">
                                        <legend>
                                            <label className="ua-check">
                                                <input type="checkbox" checked={all} ref={(el) => el && (el.indeterminate = on > 0 && !all)}
                                                    onChange={(e) => setMany(g.items.map((i) => i.to), e.target.checked)} />
                                                <b>{g.label}</b>
                                                {!single && <span className="ua-count">{on}/{g.items.length}</span>}
                                            </label>
                                        </legend>
                                        {!single && (
                                            <ul>
                                                {g.items.map((i) => (
                                                    <li key={i.to}>
                                                        <label className="ua-check">
                                                            <input type="checkbox" checked={has(i.to)} onChange={(e) => setMany([i.to], e.target.checked)} />
                                                            <span>{i.label}</span>
                                                        </label>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </fieldset>
                                );
                            })}
                        </div>

                        <footer className="ua-foot">
                            <span className="muted">{paths.length} of {ALL_PATHS.length} pages</span>
                            <div className="ua-tools">
                                <button className="btn" onClick={() => setPaths(original)} disabled={!dirty || busy}>Reset</button>
                                <button className="btn btn-primary" onClick={save} disabled={busy || (detail.saved && !dirty)}>{busy ? "Saving…" : "Save access"}</button>
                            </div>
                        </footer>
                    </>
                )}
            </section>
        </div>
    );
}