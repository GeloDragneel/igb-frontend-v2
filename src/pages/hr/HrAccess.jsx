// HR access: who is HR (create payroll, approve OT / leave) and who is HR supervisor (approve payroll) + the supervisor override
import { useCallback, useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { Field, api, fmtDateTime } from "./HRShared";

const ROLE = { hr: "HR", supervisor: "HR supervisor" };

/** my HR rights: { is_hr, is_supervisor, is_ceo, open, supervisors: [{ employee_id, name }] } (null while loading) */
export function useHrAccess() {
    const [access, setAccess] = useState(null);
    const load = useCallback(() => {
        api.get("/hr/my-access").then(setAccess)
            .catch((e) => setAccess({ is_hr: false, is_supervisor: false, supervisors: [], error: e.message || "GET /hr/my-access failed" }));
    }, []);
    useEffect(() => { load(); }, [load]);
    return [access, load];
}

/** why the user is view only (shown under the "View only" note) */
export function accessReason(a) {
    if (!a) return "";
    if (a.error) return `Couldn't check your HR access: ${a.error}. Check that the route GET /hr/my-access is in routes/api.php.`;
    const l = a.login || {};
    const who = `Your login${l.username ? ` (${l.username}, ${l.model || "user"} #${l.id})` : ""}`;
    if (l.in_list?.length) return `${who} is in the HR list but marked inactive.`;
    return `${who} is not in the HR list.${l.old_entries ? ` ${l.old_entries} old entr(ies) in HR access were added by employee and don't match a login: remove them and add the login again.` : ""} The IT Officer adds it in HR Settings → HR access → Add.`;
}

/** supervisor username + password (m_user_staff) to approve on behalf of a supervisor */
export function SupervisorOverride({ title, message, supervisors = [], onSubmit, onClose }) {
    const [f, setF] = useState({ username: "", password: "" });
    const [busy, setBusy] = useState(false);
    const submit = () => {
        setBusy(true);
        Promise.resolve(onSubmit(f)).finally(() => setBusy(false));
    };
    return (
        <Modal title={title || "Supervisor override"} onClose={onClose}
            footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy || !f.username || !f.password}>{busy ? "Checking…" : "Approve"}</button></>}>
            {message && <p className="hr-note">{message}</p>}
            <p className="hr-note is-warn">
                A supervisor must log in here to approve{supervisors.length ? ` (${supervisors.map((s) => s.name).join(", ")})` : ""}.
            </p>
            <form className="hr-form" onSubmit={(e) => { e.preventDefault(); if (f.username && f.password) submit(); }}>
                <Field label="Supervisor username"><input className="input" autoComplete="off" value={f.username} onChange={(e) => setF((p) => ({ ...p, username: e.target.value }))} /></Field>
                <Field label="Password"><input type="password" className="input" autoComplete="new-password" value={f.password} onChange={(e) => setF((p) => ({ ...p, password: e.target.value }))} /></Field>
                <button type="submit" hidden aria-hidden="true" />
            </form>
        </Modal>
    );
}

/** HR Settings → HR access: two lists (HR · HR supervisors), add many employees at once */
const ROLE_INFO = {
    hr: ["HR", "Create and compute payroll, skip deductions, approve OT and leave"],
    supervisor: ["HR supervisors", "Everything HR can do, and approve payroll (directly or by override)"],
};
const initials = (name = "") => name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function HrAccessSettings({ notify }) {
    const [access] = useHrAccess();
    const canAssign = !!access?.is_it; // only the IT Officer assigns HR / HR supervisor
    const [rows, setRows] = useState(null);
    const [adding, setAdding] = useState(null); // "hr" | "supervisor"

    const load = useCallback(() => { api.get("/hr/access").then(setRows).catch((e) => { notify(e.message || "Couldn't load.", "error"); setRows([]); }); }, [notify]);
    useEffect(() => { load(); }, [load]);
    const remove = (r) => {
        if (!window.confirm(`Remove ${r.name} from ${ROLE[r.role]}?`)) return;
        api.del(`/hr/access/${r.id}`).then((x) => { notify(x.message); load(); }).catch((e) => notify(e.message || "Couldn't remove.", "error"));
    };

    return (
        <>
            {rows && !rows.length && <p className="card hr-note is-warn">Nobody is assigned yet, so everyone can do everything in HR until the first HR or HR supervisor is added.</p>}
            {access && !canAssign && <p className="card hr-note">View only: only the IT Officer can assign HR or HR supervisors.{access.error ? ` (${accessReason(access)})` : ""}</p>}
            <div className="hr-access">
                {["supervisor", "hr"].map((role) => {
                    const list = (rows || []).filter((r) => r.role === role);
                    return (
                        <section key={role} className="card hr-access-card">
                            <header>
                                <div>
                                    <h5>{ROLE_INFO[role][0]} <span className="hr-ptab-n">{list.length}</span></h5>
                                    <span className="hr-muted">{ROLE_INFO[role][1]}</span>
                                </div>
                                {canAssign && <button type="button" className="btn btn-sm btn-primary" onClick={() => setAdding(role)}>Add</button>}
                            </header>
                            {!rows && <p className="hr-blank">Loading…</p>}
                            {rows && !list.length && <p className="hr-blank">Nobody yet.</p>}
                            <ul className="hr-people">
                                {list.map((r) => (
                                    <li key={r.id}>
                                        <span className={`hr-avatar is-${role}`}>{initials(r.name)}</span>
                                        <div className="hr-people-main">
                                            <b>{r.name}</b>
                                            <span className="hr-sub">{r.user_staff_id ? "" : "Not linked to a login — remove and add again · "}{r.username ? `@${r.username} · ` : ""}Added by {r.added_by || "—"}{r.added_at ? ` · ${fmtDateTime(r.added_at)}` : ""}</span>
                                        </div>
                                        {canAssign && <button type="button" className="hr-x" title="Remove" aria-label={`Remove ${r.name}`} onClick={() => remove(r)}>✕</button>}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </div>
            {adding && (
                <AddPeople role={adding} taken={(rows || []).filter((r) => r.role === adding).map((r) => r.user_staff_id)} onClose={() => setAdding(null)}
                    onDone={(m) => { notify(m); setAdding(null); load(); }} onFail={(e) => notify(e.message || "Couldn't save.", "error")} />
            )}
        </>
    );
}

/* pick many logins (m_user_staff) with checkboxes */
function AddPeople({ role, taken, onClose, onDone, onFail }) {
    const [list, setList] = useState(null);
    const [q, setQ] = useState("");
    const [picked, setPicked] = useState([]);
    useEffect(() => { api.get("/hr/logins").then(setList).catch((e) => { onFail(e); setList([]); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const free = (list || []).filter((u) => !taken.includes(u.id));
    const term = q.trim().toLowerCase();
    const shown = free.filter((u) => !term || [u.name, u.username, u.user_type].some((v) => String(v || "").toLowerCase().includes(term)));
    const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    const save = () => api.post("/hr/access", { user_staff_ids: picked, role }).then((r) => onDone(r.message)).catch(onFail);
    return (
        <Modal title={`Add ${ROLE_INFO[role][0]}`} onClose={onClose}
            footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!picked.length}>Add {picked.length || ""} {picked.length === 1 ? "login" : "logins"}</button></>}>
            <div className="hr-pick">
                <input className="input" type="search" placeholder="Search name, username or user type…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
                <ul className="hr-pick-list">
                    {!list && <li className="hr-blank">Loading…</li>}
                    {shown.map((u) => (
                        <li key={u.id}>
                            <label className={picked.includes(u.id) ? "is-on" : ""}>
                                <input type="checkbox" checked={picked.includes(u.id)} onChange={() => toggle(u.id)} />
                                <span className={`hr-avatar is-${role}`}>{initials(u.name)}</span>
                                <span>{u.name}<small className="hr-sub">@{u.username}{u.user_type ? ` · ${u.user_type}` : ""}</small></span>
                            </label>
                        </li>
                    ))}
                    {list && !shown.length && <li className="hr-blank">No login found.</li>}
                </ul>
                <span className="hr-hint">{picked.length} selected · {free.length} login(s) not yet {ROLE[role]}</span>
            </div>
        </Modal>
    );
}