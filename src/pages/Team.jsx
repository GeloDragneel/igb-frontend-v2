import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import SearchSelect from "../components/SearchSelect";
import { useToast } from "../components/Toast";
import { useAuth, apiFetch } from "../context/AuthContext";

const EMPTY = {
    id: 0,
    employee_id: "",
    fullname: "",
    username: "",
    password: "",
    is_active: true,
    is_web: true,
    is_scan_suite: true,
    rights: [],
};

const PAGE_SIZES = [10, 25, 50];

const initials = (m) =>
    (m.fullname || m.username || "?")
        .split(/[\s,._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();

// page numbers with "…" gaps: 1 … 4 5 6 … 12
const pageList = (page, pages) => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const out = [1];
    const from = Math.max(2, page - 1);
    const to = Math.min(pages - 1, page + 1);
    if (from > 2) out.push("…");
    for (let p = from; p <= to; p++) out.push(p);
    if (to < pages - 1) out.push("…");
    out.push(pages);
    return out;
};

/* =========================================================
   Module tree with parent / child checkboxes
   ========================================================= */
function ModuleTree({ modules, rights, onChange }) {
    const [open, setOpen] = useState({});
    const [q, setQ] = useState("");
    const has = (id) => rights.includes(id);

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return modules;
        return modules
            .map((m) => ({
                ...m,
                children: m.name.toLowerCase().includes(s)
                    ? m.children
                    : m.children.filter((c) => c.name.toLowerCase().includes(s)),
            }))
            .filter((m) => m.name.toLowerCase().includes(s) || m.children.length);
    }, [modules, q]);

    const setMany = (ids, on) => {
        const set = new Set(rights);
        ids.forEach((id) => (on ? set.add(id) : set.delete(id)));
        onChange([...set]);
    };

    const toggleParent = (m, on) => setMany([m.id, ...m.children.map((c) => c.id)], on);

    // ticking a child also ticks its parent; unticking the last child unticks the parent
    const toggleChild = (m, c, on) => {
        const set = new Set(rights);
        on ? set.add(c.id) : set.delete(c.id);
        const anyChild = m.children.some((x) => set.has(x.id));
        anyChild ? set.add(m.id) : set.delete(m.id);
        onChange([...set]);
    };

    const allIds = modules.flatMap((m) => [m.id, ...m.children.map((c) => c.id)]);
    const expanded = (m) => open[m.id] ?? !!q;

    return (
        <div className="tm-tree">
            <div className="tm-tree-tools">
                <input
                    className="input tm-tree-search"
                    placeholder="Search modules"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label="Search modules"
                />
                <button type="button" className="btn btn-sm" onClick={() => setOpen(Object.fromEntries(modules.map((m) => [m.id, true])))}>
                    Expand all
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setOpen(Object.fromEntries(modules.map((m) => [m.id, false])))}>
                    Collapse all
                </button>
                <button type="button" className="btn btn-sm" onClick={() => onChange(allIds)}>
                    Check all
                </button>
                <button type="button" className="btn btn-sm" onClick={() => onChange([])}>
                    Uncheck all
                </button>
            </div>

            {!modules.length && <p className="muted">No modules yet. Run the m_menu_data copy script.</p>}
            {modules.length > 0 && !shown.length && <p className="muted">No module matches “{q}”.</p>}

            <ul className="tm-list">
                {shown.map((m) => {
                    const total = m.children.length;
                    const on = m.children.filter((c) => has(c.id)).length;
                    const checked = total ? on === total : has(m.id);
                    const partial = total > 0 && on > 0 && on < total;
                    return (
                        <li key={m.id} className="tm-node">
                            <div className="tm-row">
                                <button
                                    type="button"
                                    className={`tm-caret ${expanded(m) ? "is-open" : ""}`}
                                    disabled={!total}
                                    onClick={() => setOpen((s) => ({ ...s, [m.id]: !expanded(m) }))}
                                    aria-label={expanded(m) ? `Collapse ${m.name}` : `Expand ${m.name}`}
                                >
                                    ▸
                                </button>
                                <label className="tm-label">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        ref={(el) => el && (el.indeterminate = partial)}
                                        onChange={(e) => toggleParent(m, e.target.checked)}
                                    />
                                    <span className="tm-name">{m.name}</span>
                                    {total > 0 && <span className="tm-count">{on}/{total}</span>}
                                </label>
                            </div>
                            {total > 0 && expanded(m) && (
                                <ul className="tm-sub">
                                    {m.children.map((c) => (
                                        <li key={c.id}>
                                            <label className="tm-label">
                                                <input type="checkbox" checked={has(c.id)} onChange={(e) => toggleChild(m, c, e.target.checked)} />
                                                <span>{c.name}</span>
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
    );
}

/* =========================================================
   Team (access rights)
   ========================================================= */
export default function Team() {
    const { user } = useAuth();
    const notify = useToast();

    const [data, setData] = useState(null);       // { members, employees, modules }
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [form, setForm] = useState(null);       // the member being added / edited
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");
    const [toDelete, setToDelete] = useState(null);

    const load = async () => {
        setError("");
        try {
            setData(await apiFetch("/team"));
        } catch (e) {
            setError(e.message || "Couldn't load the team.");
            setData({ members: [], employees: [], modules: [] });
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [user?.id, user?.caid]);

    // back to page 1 when the search or page size changes
    useEffect(() => { setPage(1); }, [q, pageSize]);

    const members = (data?.members || []).filter(
        (m) => !q.trim() || `${m.username} ${m.fullname || ""}`.toLowerCase().includes(q.trim().toLowerCase())
    );

    // pagination
    const pages = Math.max(1, Math.ceil(members.length / pageSize));
    const current = Math.min(page, pages);                      // stays valid after a delete
    const start = (current - 1) * pageSize;
    const pageRows = members.slice(start, start + pageSize);
    const showingFrom = members.length ? start + 1 : 0;
    const showingTo = Math.min(start + pageSize, members.length);

    const totalModules = data?.modules?.reduce((a, m) => a + 1 + m.children.length, 0) || 0;
    const empOpts = [
        { value: "", label: "Select employee" },
        ...(data?.employees || []).map((e) => ({ value: String(e.id), label: e.name })),
    ];
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));

    const openForm = (m) => {
        setFormError("");
        setForm(
            m
                ? { ...EMPTY, ...m, employee_id: m.employee_id ? String(m.employee_id) : "", password: "" }
                : { ...EMPTY }
        );
    };

    const save = async () => {
        if (!form.username.trim()) return setFormError("Enter a username.");
        if (!form.id && form.password.length < 4) return setFormError("Enter a password (at least 4 characters).");
        if (form.id && form.password && form.password.length < 4) return setFormError("The new password needs at least 4 characters.");
        setSaving(true);
        setFormError("");
        try {
            const body = {
                employee_id: form.employee_id ? Number(form.employee_id) : null,
                fullname: form.fullname,
                username: form.username.trim(),
                password: form.password || null,
                is_active: form.is_active,
                is_web: form.is_web,
                is_scan_suite: form.is_scan_suite,
                rights: form.rights,
            };
            await apiFetch(form.id ? `/team/${form.id}` : "/team", {
                method: form.id ? "PUT" : "POST",
                body: JSON.stringify(body),
            });
            notify(form.id ? "Team member updated." : "Team member added.");
            setForm(null);
            load();
        } catch (e) {
            setFormError(e.message || "Couldn't save.");
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        const m = toDelete;
        setToDelete(null);
        try {
            await apiFetch(`/team/${m.id}`, { method: "DELETE" });
            notify(`${m.username} deleted.`);
            load();
        } catch (e) {
            notify(e.message || "Couldn't delete.", "error");
        }
    };

    return (
        <section className="tm-page">
            {/* ---------- page header ---------- */}
            <header className="tm-hero">
                <div>
                    <h1 className="tm-title">Team</h1>
                    <p className="tm-sub">People who can sign in, and the modules each one can open.</p>
                </div>
                <button className="btn btn-primary tm-add" onClick={() => openForm(null)} disabled={!data}>
                    <span aria-hidden="true">＋</span> Add member
                </button>
            </header>

            {/* ---------- list ---------- */}
            <div className="card tm-card">
                <div className="tm-toolbar">
                    <div className="tm-search-wrap">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m20 20-3.5-3.5" />
                        </svg>
                        <input
                            className="input"
                            type="search"
                            placeholder="Search username or name"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            aria-label="Search team"
                        />
                    </div>
                    <span className="tm-total">
                        {data ? `${members.length} of ${data.members.length} member${data.members.length === 1 ? "" : "s"}` : "Loading…"}
                    </span>
                    <button className="btn tm-refresh" onClick={load} aria-label="Refresh" title="Refresh">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                            <path d="M21 3v5h-5" />
                        </svg>
                    </button>
                </div>

                {error && <div className="alert-error tm-alert" role="alert">{error}</div>}

                <div className="tm-scroll">
                    <table className="tm-table">
                        <thead>
                            <tr>
                                <th>Member</th>
                                <th>Status</th>
                                <th>Access</th>
                                <th>Modules</th>
                                <th className="tm-th-actions"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {!data &&
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i}>
                                        <td>
                                            <div className="tm-member">
                                                <span className="sk tm-avatar" />
                                                <span className="sk sk-cell" style={{ width: 140 }} />
                                            </div>
                                        </td>
                                        <td><span className="sk sk-cell" style={{ width: 60 }} /></td>
                                        <td><span className="sk sk-cell" style={{ width: 110 }} /></td>
                                        <td><span className="sk sk-cell" style={{ width: 120 }} /></td>
                                        <td />
                                    </tr>
                                ))}

                            {data && !members.length && (
                                <tr>
                                    <td colSpan={5}>
                                        <div className="tm-empty">
                                            <p className="tm-empty-title">
                                                {data.members.length ? "No one matches your search" : "No team members yet"}
                                            </p>
                                            {!data.members.length && (
                                                <button className="btn btn-primary" onClick={() => openForm(null)}>＋ Add the first member</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {pageRows.map((m) => {
                                const pct = totalModules ? Math.min(100, Math.round((m.rights.length / totalModules) * 100)) : 0;
                                return (
                                    <tr key={m.id}>
                                        <td>
                                            <div className="tm-member">
                                                <span className="tm-avatar" aria-hidden="true">{initials(m)}</span>
                                                <div className="tm-who">
                                                    <span className="tm-name-main">{m.fullname || <span className="muted">No name</span>}</span>
                                                    <span className="tm-user mono">{m.username}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`tm-status ${m.is_active ? "is-on" : ""}`}>
                                                <span className="tm-dot" aria-hidden="true" />
                                                {m.is_active ? "Active" : "Inactive"}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="tm-pills">
                                                {m.is_web && <span className="tm-pill">Web</span>}
                                                {m.is_scan_suite && <span className="tm-pill">Scan Suite</span>}
                                                {!m.is_web && !m.is_scan_suite && <span className="muted">—</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="tm-mods" title={`${m.rights.length} of ${totalModules} modules`}>
                                                <div className="tm-bar"><span style={{ width: `${pct}%` }} /></div>
                                                <span className="tm-mods-n">
                                                    {m.rights.length}<span className="muted"> / {totalModules}</span>
                                                </span>
                                            </div>
                                        </td>
                                        <td className="tm-td-actions">
                                            <button className="tm-icon" onClick={() => openForm(m)} aria-label={`Edit ${m.username}`} title="Edit">
                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M12 20h9" />
                                                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                                </svg>
                                            </button>
                                            <button className="tm-icon tm-icon-danger" onClick={() => setToDelete(m)} aria-label={`Delete ${m.username}`} title="Delete">
                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M3 6h18" />
                                                    <path d="M8 6V4h8v2" />
                                                    <path d="M19 6l-1 14H6L5 6" />
                                                </svg>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ---------- pagination ---------- */}
                {data && members.length > 0 && (
                    <nav className="tm-pager" aria-label="Team pages"
                        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 16px", borderTop: "1px solid var(--border, #e5e7eb)" }}>
                        <span className="muted" style={{ fontSize: 13 }}>
                            Showing {showingFrom}–{showingTo} of {members.length}
                        </span>

                        <label className="muted" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                            Rows
                            <select className="input" style={{ width: 72, padding: "4px 8px" }} value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page">
                                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>

                        <div style={{ display: "flex", gap: 4, marginLeft: "auto", alignItems: "center" }}>
                            <button className="btn btn-sm" onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page">‹ Prev</button>
                            {pageList(current, pages).map((p, i) =>
                                p === "…" ? (
                                    <span key={`gap${i}`} className="muted" style={{ padding: "0 4px" }}>…</span>
                                ) : (
                                    <button
                                        key={p}
                                        className={`btn btn-sm${p === current ? " btn-primary" : ""}`}
                                        onClick={() => setPage(p)}
                                        aria-label={`Page ${p}`}
                                        aria-current={p === current ? "page" : undefined}
                                        style={{ minWidth: 34 }}
                                    >
                                        {p}
                                    </button>
                                )
                            )}
                            <button className="btn btn-sm" onClick={() => setPage(current + 1)} disabled={current === pages} aria-label="Next page">Next ›</button>
                        </div>
                    </nav>
                )}
            </div>

            {/* ---------- add / edit ---------- */}
            {form && (
                <Modal
                    title={form.id ? `Edit ${form.username}` : "Add team member"}
                    onClose={() => setForm(null)}
                    footer={
                        <div className="tm-foot">
                            <button className="btn" onClick={() => setForm(null)}>Close</button>
                            <button className="btn btn-primary" onClick={save} disabled={saving}>
                                {saving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    }
                >
                    <div className="tm-form">
                        <fieldset className="tm-fs">
                            <legend>Information</legend>
                            <div className="field">
                                <span className="field-label">Employee</span>
                                <SearchSelect
                                    value={form.employee_id}
                                    options={empOpts}
                                    aria-label="Employee"
                                    onChange={(v) =>
                                        set({
                                            employee_id: v,
                                            fullname: data.employees.find((e) => String(e.id) === v)?.name || form.fullname,
                                        })
                                    }
                                />
                            </div>
                            <label className="field">
                                <span className="field-label">Username</span>
                                <input
                                    className="input"
                                    value={form.username}
                                    autoComplete="off"
                                    onChange={(e) => set({ username: e.target.value })}
                                />
                            </label>
                            <label className="field">
                                <span className="field-label">Password</span>
                                <input
                                    className="input"
                                    type="password"
                                    autoComplete="new-password"
                                    value={form.password}
                                    placeholder={form.id ? "Leave empty to keep the current password" : ""}
                                    onChange={(e) => set({ password: e.target.value })}
                                />
                            </label>
                            <div className="tm-switches">
                                {[["is_active", "Active"], ["is_web", "Web Access"], ["is_scan_suite", "Scan Suite"]].map(([k, l]) => (
                                    <label key={k} className="tm-switch">
                                        <input type="checkbox" checked={!!form[k]} onChange={(e) => set({ [k]: e.target.checked })} />
                                        <span>{l}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <fieldset className="tm-fs">
                            <legend>
                                Module List <span className="muted">({form.rights.length} selected)</span>
                            </legend>
                            <ModuleTree modules={data.modules} rights={form.rights} onChange={(rights) => set({ rights })} />
                        </fieldset>

                        {formError && <div className="alert-error" role="alert">{formError}</div>}
                    </div>
                </Modal>
            )}

            {/* ---------- delete ---------- */}
            {toDelete && (
                <ConfirmDialog
                    title="Delete this team member?"
                    message={`${toDelete.username} won't be able to sign in anymore. You can't undo this.`}
                    confirmLabel="Delete"
                    onCancel={() => setToDelete(null)}
                    onConfirm={remove}
                />
            )}
        </section>
    );
}