// Staff → Task Management → Prepare JO
//   A job order: date · no time (whole day) or a time range · assigned by / assigned to
//   location = a client account, or others (Phone call, Office, BIR …)
//   activities from the Activity List, each with remarks and a done tick · remarks · status
//   PENDING → IN_PROGRESS (first activity ticked / Start) → COMPLETED   ·   CANCELLED
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import SearchSelect from "../../components/SearchSelect";
import Icon from "../../components/Icons";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";
import "./TaskManagement.css";

const TABLE_HEIGHT = "calc(100vh - 420px)";
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = ymd(new Date());
const MONTH_FROM = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const MONTH_TO = ymd(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateText = (s) => { if (!s) return "—"; const [y, m, d] = s.split("-").map(Number); return `${MONTHS[m - 1]} ${pad(d)}, ${y}`; };
const clock = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };
const timeText = (r) => (r.no_time ? "No time" : `${clock(r.time_from)} – ${clock(r.time_to)}`);

const SCOPES = [["mine", "Assigned to me"], ["by_me", "Assigned by me"], ["all", "All"]];
const STATUS = [["", "All"], ["PENDING", "Pending"], ["IN_PROGRESS", "In progress"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"]];
const STATUS_LABEL = { PENDING: "Pending", IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled" };
const toneOf = (s) => ({ PENDING: "orange", IN_PROGRESS: "blue", COMPLETED: "green", CANCELLED: "gray" }[s] || "gray");
const QUICK_PLACES = ["Phone call", "Online meeting", "Office", "BIR", "City Hall", "Bank"];

export default function PrepareJO() {
    const { user } = useAuth();
    const [lookups, setLookups] = useState(null);
    const [data, setData] = useState({ rows: [], counts: {} });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [scope, setScope] = useState("mine");
    const [status, setStatus] = useState("");
    const [from, setFrom] = useState(MONTH_FROM);
    const [to, setTo] = useState(MONTH_TO);
    const [open, setOpen] = useState(null);           // null · "new" · JO row

    // employees, client accounts, activities for the JO popup
    const loadLookups = useCallback(async () => {
        try {
            const l = await apiFetch("/job-orders/lookups");
            setLookups(l);
            return l;
        } catch (e) {
            setError(e.message || "Couldn't load the employees, clients and activities.");
            return null;
        }
    }, []);
    useEffect(() => { loadLookups(); }, [loadLookups, user?.id]);

    // New JO is always clickable: loads the lists first if they are not there yet
    const newJo = async () => {
        if (lookups || await loadLookups()) setOpen("new");
    };

    const load = useCallback(async () => {
        if (!from || !to) return;
        setLoading(true);
        setError("");
        try {
            setData(await apiFetch(`/job-orders?${new URLSearchParams({ from, to, scope })}`));
        } catch (e) {
            setError(e.message || "Couldn't load the job orders.");
        } finally {
            setLoading(false);
        }
    }, [from, to, scope]);
    useEffect(() => { load(); }, [load, user?.id]);

    const counts = data.counts || {};
    const total = Object.values(counts).reduce((n, v) => n + Number(v || 0), 0);
    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (data.rows || [])
            .filter((r) => !status || r.status === status)
            .filter((r) => !q || [r.jo_no, r.location, r.assigned_by_name, r.assigned_to_name, r.remarks, ...(r.activities || []).map((a) => a.activity)]
                .join(" ").toLowerCase().includes(q));
    }, [data.rows, status, query]);

    const columns = [
        { key: "jo_no", label: "JO #", render: (r) => <span className="mono strong">{r.jo_no}</span> },
        { key: "jo_date", label: "Date", render: (r) => dateText(r.jo_date) },
        { key: "time", label: "Time", render: (r) => <span className={r.no_time ? "muted" : ""}>{timeText(r)}</span> },
        {
            key: "location", label: "Location", render: (r) => (
                <span className="tm-loc">
                    <span className={`tm-loc-tag is-${r.location_type}`}>{r.location_type === "client" ? "Client" : "Others"}</span>
                    <span className="tm-trunc" title={r.location}>{r.location || "—"}</span>
                </span>
            ),
        },
        {
            key: "activities", label: "Activities", render: (r) => (
                <span className="tm-acts" title={(r.activities || []).map((a) => `${a.is_done ? "✓" : "•"} ${a.activity}`).join("\n")}>
                    <span className="tm-trunc">{(r.activities || []).map((a) => a.activity).join(", ") || "—"}</span>
                    <span className={`tm-prog${r.activities_total && r.activities_done === r.activities_total ? " is-done" : ""}`}>{r.activities_done}/{r.activities_total}</span>
                </span>
            ),
        },
        { key: "assigned_by_name", label: "Assigned by" },
        { key: "assigned_to_name", label: "Assigned to", render: (r) => <span className="strong">{r.assigned_to_name || "—"}</span> },
        { key: "status", label: "Status", render: (r) => <Badge tone={toneOf(r.status)}>{STATUS_LABEL[r.status] || r.status}</Badge> },
        { key: "remarks", label: "Remarks", render: (r) => <span className="muted small tm-trunc" title={r.remarks || ""}>{r.remarks || ""}</span> },
    ];

    return (
        <>
            <SearchCard query={query} setQuery={setQuery} placeholder="Search JO #, client, activity, employee or remarks..."
                actions={[
                    { label: "New JO", icon: "plus", onClick: newJo },
                    { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
                ]} sticky />

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

            <div className="card tm-filters">
                <div className="tm-seg" role="tablist" aria-label="Whose job orders">
                    {SCOPES.map(([k, l]) => (
                        <button key={k} type="button" role="tab" aria-selected={scope === k} className={scope === k ? "is-on" : ""} onClick={() => setScope(k)}>{l}</button>
                    ))}
                </div>
                <label className="field tm-date"><span className="field-label">From</span>
                    <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                <label className="field tm-date"><span className="field-label">To</span>
                    <input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
            </div>

            <div role="tablist" aria-label="Status" className="tm-status">
                {STATUS.map(([k, l]) => (
                    <button key={k || "all"} type="button" role="tab" aria-selected={status === k}
                        className={`btn btn-sm${status === k ? " btn-primary" : ""}`} onClick={() => setStatus(k)}>
                        {l} <span style={{ opacity: 0.75, marginLeft: 4 }}>{k ? Number(counts[k] || 0) : total}</span>
                    </button>
                ))}
            </div>

            <div className="sales-table">
                <DataTable
                    bodyHeight={TABLE_HEIGHT}
                    columns={columns}
                    rows={loading ? [] : rows}
                    rowKey="id"
                    exportName="job-orders"
                    showToolbar={false}
                    emptyText={loading ? "Loading…" : "No job orders."}
                    onRowClick={(r) => setOpen(r)}
                    rowActions={(r) => [{ label: r.can_edit ? "Open / Edit" : "Open", onClick: () => setOpen(r) }]}
                />
            </div>

            {open && lookups && (
                <JoModal jo={open === "new" ? null : open} lookups={lookups}
                    onClose={() => setOpen(null)} onSaved={() => { load(); }} />
            )}
        </>
    );
}

/* =========================================================
   new / edit one JO  (same layout as the invoice pages: label rows on top, Excel grid for the activities)
   ========================================================= */
const blankActivity = () => ({ key: Math.random().toString(36).slice(2), id: null, activity_id: "", activity: "", other: false, remarks: "", is_done: false, done_at: null });

// label above the field (every column the same width, rows line up)
function F({ label, required = false, span = false, children, as = "label" }) {
    const Tag = as;
    return (
        <Tag className={`field tm-f${span ? " tm-f-span" : ""}`}>
            <span className="field-label">{label}{required && <span className="required-mark"> *</span>}</span>
            {children}
        </Tag>
    );
}

function JoModal({ jo, lookups, onClose, onSaved }) {
    const notify = useToast();
    const isNew = !jo;
    const readOnly = !isNew && !jo.can_edit;
    const closed = !isNew && (jo.status === "COMPLETED" || jo.status === "CANCELLED");
    const locked = readOnly || (closed && !lookups.supervisor);

    const [f, setF] = useState(() => ({
        jo_date: jo?.jo_date || TODAY,
        no_time: jo ? jo.no_time : true,
        time_from: jo?.time_from || "08:00",
        time_to: jo?.time_to || "17:00",
        assigned_by: String(jo?.assigned_by || lookups.me || ""),
        assigned_to: String(jo?.assigned_to || ""),
        location_type: jo?.location_type || "client",
        caid: String(jo?.caid || ""),
        location_other: jo?.location_other || "",
        remarks: jo?.remarks || "",
    }));
    const [acts, setActs] = useState(() => (jo?.activities?.length
        ? jo.activities.map((a) => ({ key: `a${a.id}`, id: a.id, activity_id: a.activity_id ? String(a.activity_id) : "", activity: a.activity, other: !a.activity_id, remarks: a.remarks || "", is_done: a.is_done, done_at: a.done_at }))
        : [blankActivity(), blankActivity(), blankActivity()]));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
    const setAct = (key, patch) => setActs((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));

    const employeeOpts = useMemo(() => [...(lookups.employees || [])]
        .sort((a, b) => (a.designation || "~").localeCompare(b.designation || "~") || a.name.localeCompare(b.name))
        .map((e) => ({ value: String(e.id), label: e.name, group: e.designation || "No designation" })), [lookups]);
    const clientOpts = useMemo(() => (lookups.clients || []).map((c) => ({
        value: String(c.id), label: c.trade_name, hint: [c.branch_code, c.client_num].filter(Boolean).join(" · "),
    })), [lookups]);
    const activityOpts = useMemo(() => (lookups.activities || []).map((a) => ({ value: String(a.id), label: a.name, hint: a.description || "" })), [lookups]);
    const actName = (id) => (lookups.activities || []).find((a) => String(a.id) === String(id))?.name || "";

    const filled = acts.filter((a) => a.activity.trim());
    const doneCount = filled.filter((a) => a.is_done).length;

    const save = async () => {
        setErr("");
        if (!f.assigned_to) return setErr("Choose who the JO is assigned to.");
        if (f.location_type === "client" && !f.caid) return setErr("Choose the client account.");
        if (f.location_type === "other" && !f.location_other.trim()) return setErr("Enter where it is, e.g. Phone call.");
        if (!f.no_time && (!f.time_from || !f.time_to || f.time_to <= f.time_from)) return setErr("Enter a start and an end time (end after start), or tick No time.");
        if (!filled.length) return setErr("Add at least one activity.");

        setBusy(true);
        try {
            const body = {
                ...f,
                assigned_by: Number(f.assigned_by),
                assigned_to: Number(f.assigned_to),
                caid: f.location_type === "client" ? Number(f.caid) : null,
                location_other: f.location_type === "other" ? f.location_other.trim() : null,
                time_from: f.no_time ? null : f.time_from,
                time_to: f.no_time ? null : f.time_to,
                activities: filled.map((a) => ({
                    id: a.id, activity_id: a.other ? null : Number(a.activity_id) || null,
                    activity: a.activity.trim(), remarks: a.remarks || null, is_done: a.is_done,
                })),
            };
            const r = await apiFetch(isNew ? "/job-orders" : `/job-orders/${jo.id}`, { method: isNew ? "POST" : "PUT", body: JSON.stringify(body) });
            notify(isNew ? `${r.jo_no} saved.` : "Saved.");
            onSaved();
            onClose();
        } catch (e) {
            setErr(e.message || "Couldn't save the JO.");
        } finally {
            setBusy(false);
        }
    };

    const changeStatus = async (s) => {
        setBusy(true);
        setErr("");
        try {
            await apiFetch(`/job-orders/${jo.id}/status`, { method: "POST", body: JSON.stringify({ status: s }) });
            notify(`${jo.jo_no} · ${STATUS_LABEL[s]}`);
            onSaved();
            onClose();
        } catch (e) {
            setErr(e.message || "Couldn't change the status.");
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        setBusy(true);
        try {
            const r = await apiFetch(`/job-orders/${jo.id}`, { method: "DELETE" });
            notify(r.message || "Deleted.");
            onSaved();
            onClose();
        } catch (e) {
            setErr(e.message || "Couldn't delete the JO.");
            setConfirmDelete(false);
        } finally {
            setBusy(false);
        }
    };

    const st = jo?.status;
    const can = !isNew && jo.can_edit;

    return (
        <>
            <Modal title={isNew ? "New Job Order" : `Job Order · ${jo.jo_no}`} onClose={onClose} size="xlg"
                footer={<>
                    {can && st !== "COMPLETED" && (
                        <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => setConfirmDelete(true)} disabled={busy}>DELETE</button>
                    )}
                    <button className="btn" onClick={onClose} disabled={busy}>Close</button>
                    {can && (st === "PENDING" || st === "IN_PROGRESS") && <button className="btn btn-warning" onClick={() => changeStatus("CANCELLED")} disabled={busy}>CANCEL JO</button>}
                    {can && st === "PENDING" && <button className="btn btn-info" onClick={() => changeStatus("IN_PROGRESS")} disabled={busy}>START</button>}
                    {can && (st === "PENDING" || st === "IN_PROGRESS") && <button className="btn btn-info" onClick={() => changeStatus("COMPLETED")} disabled={busy}>COMPLETED</button>}
                    {can && closed && <button className="btn btn-info" onClick={() => changeStatus("PENDING")} disabled={busy}>REOPEN</button>}
                    {!locked && <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "SAVING…" : "SAVE"}</button>}
                </>}>

                {!isNew && closed && <div className="inv-banner" style={{ marginBottom: 12 }}>This JO is <strong>{STATUS_LABEL[st].toLowerCase()}</strong>{locked ? " and can't be edited." : "."}</div>}
                {readOnly && !closed && <div className="inv-banner" style={{ marginBottom: 12 }}>You can view this JO. Only the one who made it, the assigned employees or a supervisor can change it.</div>}
                {err && <div className="alert-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

                <fieldset className="inv-fields" disabled={locked || busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                    <div className="tm-grid">
                        {/* row 1: JO · when · status */}
                        <F label="JO No"><input className="input" readOnly value={jo?.jo_no || "(assigned when saved)"} /></F>
                        <F label="Date" required>
                            <input type="date" className="input" value={f.jo_date} onChange={(e) => set("jo_date", e.target.value)} />
                        </F>
                        <F as="div" label={
                            <span className="tm-label-row">
                                Time
                                <label className="tm-check">
                                    <input type="checkbox" checked={f.no_time} onChange={(e) => set("no_time", e.target.checked)} /> No time
                                </label>
                            </span>
                        }>
                            {f.no_time ? (
                                <input className="input" readOnly value="No time (whole day)" aria-label="Time" />
                            ) : (
                                <div className="tm-time">
                                    <input type="time" className="input" value={f.time_from} onChange={(e) => set("time_from", e.target.value)} aria-label="Time from" />
                                    <span className="muted">–</span>
                                    <input type="time" className="input" value={f.time_to} min={f.time_from} onChange={(e) => set("time_to", e.target.value)} aria-label="Time to" />
                                </div>
                            )}
                        </F>
                        <F label="Status" as="div">
                            <div className="tm-status-cell">
                                <Badge tone={toneOf(st || "PENDING")}>{STATUS_LABEL[st || "PENDING"]}</Badge>
                                <span className="muted small">
                                    {st === "COMPLETED" && jo.completed_at
                                        ? `${jo.completed_at.slice(0, 16)}${jo.completed_by_name ? ` · ${jo.completed_by_name}` : ""}`
                                        : `${doneCount}/${filled.length} activities done`}
                                </span>
                            </div>
                        </F>

                        {/* row 2: who · where */}
                        <F label="Assigned By" required as="div">
                            <SearchSelect value={f.assigned_by} onChange={(v) => set("assigned_by", v)} options={employeeOpts}
                                placeholder="Select employee" searchPlaceholder="Search employee..." aria-label="Assigned by" disabled={locked || busy} />
                        </F>
                        <F label="Assigned To" required as="div">
                            <SearchSelect value={f.assigned_to} onChange={(v) => set("assigned_to", v)} options={employeeOpts}
                                placeholder="Select employee" searchPlaceholder="Search employee..." aria-label="Assigned to" disabled={locked || busy} />
                        </F>
                        <F label="Location" required as="div">
                            <div className="tm-seg tm-seg-full" role="tablist" aria-label="Location">
                                <button type="button" role="tab" aria-selected={f.location_type === "client"} className={f.location_type === "client" ? "is-on" : ""} onClick={() => set("location_type", "client")}>Client account</button>
                                <button type="button" role="tab" aria-selected={f.location_type === "other"} className={f.location_type === "other" ? "is-on" : ""} onClick={() => set("location_type", "other")}>Others</button>
                            </div>
                        </F>
                        {f.location_type === "client" ? (
                            <F label="Client Account" required as="div">
                                <SearchSelect value={f.caid} onChange={(v) => set("caid", v)} options={clientOpts} placeholder="Select client account"
                                    searchPlaceholder="Search trade name, branch code or client #..." aria-label="Client account" disabled={locked || busy} />
                            </F>
                        ) : (
                            <F label="Others" required>
                                <input className="input" value={f.location_other} onChange={(e) => set("location_other", e.target.value)} maxLength={150} placeholder="e.g. Phone call" list="tm-places" />
                                <datalist id="tm-places">{QUICK_PLACES.map((p) => <option key={p} value={p} />)}</datalist>
                            </F>
                        )}

                        {/* row 3: remarks */}
                        <F label="Remarks" span>
                            <input className="input" value={f.remarks} onChange={(e) => set("remarks", e.target.value)} maxLength={5000} placeholder="Notes for this JO" />
                        </F>
                    </div>

                    <div className="inv-lines">
                        <ActivityGrid acts={acts} setActs={setActs} setAct={setAct} activityOpts={activityOpts} actName={actName}
                            canTick={!isNew} disabled={locked || busy} />
                    </div>
                </fieldset>
            </Modal>

            {confirmDelete && (
                <ConfirmDialog
                    title={`Delete ${jo.jo_no}?`}
                    message="The job order and its activities will be removed."
                    confirmLabel="Delete"
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={remove}
                />
            )}
        </>
    );
}

/* ---------- activities: Excel grid (same as the invoice lines) ---------- */
const COLS = ["activity", "remarks"];

function ActivityGrid({ acts, setActs, setAct, activityOpts, actName, canTick, disabled }) {
    const wrap = useRef(null);
    const focusCell = (r, c) => setTimeout(() => {
        const el = wrap.current?.querySelector(`[data-r="${r}"][data-c="${c}"]`);
        if (el) { el.focus(); el.select?.(); }
    }, 0);
    const addRow = () => setActs((l) => [...l, blankActivity()]);
    const removeRow = (r) => setActs((l) => (l.length > 1 ? l.filter((_, i) => i !== r) : [blankActivity()]));

    const onKeyDown = (e, r, c) => {
        const el = e.target;
        const isBtn = el.tagName === "BUTTON";
        const pos = COLS.indexOf(c);
        const atStart = isBtn || (el.selectionStart === 0 && el.selectionEnd === 0);
        const atEnd = isBtn || el.selectionEnd === el.value?.length;
        if (e.key === "Enter" || e.key === "ArrowDown") {
            if (isBtn && e.key === "Enter") return;            // Enter opens the dropdown
            e.preventDefault();
            if (r < acts.length - 1) focusCell(r + 1, c);
            else if (acts[r]?.activity.trim()) { addRow(); focusCell(r + 1, COLS[0]); }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (r > 0) focusCell(r - 1, c);
        } else if (e.key === "ArrowLeft" && atStart && pos > 0) {
            e.preventDefault();
            focusCell(r, COLS[pos - 1]);
        } else if (e.key === "ArrowRight" && atEnd && pos < COLS.length - 1) {
            e.preventDefault();
            focusCell(r, COLS[pos + 1]);
        } else if (e.key === "Delete" && e.ctrlKey) {
            e.preventDefault();
            removeRow(r);
            focusCell(Math.max(0, r - 1), c);
        }
    };
    const cell = (r, c) => ({ "data-r": r, "data-c": c, onKeyDown: (e) => onKeyDown(e, r, c) });
    const filled = acts.filter((a) => a.activity.trim());

    return (
        <div className="xl-wrap" ref={wrap}>
            <div className="xl-scroll">
                <table className="xl">
                    <colgroup>
                        <col style={{ width: "4%" }} />
                        <col style={{ width: "6%" }} />
                        <col style={{ width: "38%" }} />
                        <col style={{ width: "36%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "4%" }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="xl-rownum">#</th>
                            <th className="ta-center" title="Done">Done</th>
                            <th>Activity<span className="required-mark"> *</span></th>
                            <th>Remarks</th>
                            <th>Done on</th>
                            <th aria-label="Remove" />
                        </tr>
                    </thead>
                    <tbody>
                        {acts.map((a, r) => (
                            <tr key={a.key} className={a.is_done ? "tm-xl-done" : ""}>
                                <td className="xl-rownum">{r + 1}</td>
                                <td className="ta-center">
                                    <input type="checkbox" checked={a.is_done} disabled={!canTick || disabled || !a.activity.trim()}
                                        title={canTick ? "Done" : "Tick after saving the JO"}
                                        onChange={(e) => setAct(a.key, { is_done: e.target.checked, done_at: e.target.checked ? a.done_at : null })}
                                        aria-label={`Activity ${r + 1} done`} />
                                </td>
                                <td title={a.activity}>
                                    {a.other ? (
                                        <div className="tm-xl-other">
                                            <input className="xl-input" value={a.activity} maxLength={150} placeholder="Type the activity"
                                                onChange={(e) => setAct(a.key, { activity: e.target.value })} aria-label={`Activity ${r + 1}`} disabled={disabled} {...cell(r, "activity")} />
                                            {!disabled && (
                                                <button type="button" tabIndex={-1} className="tm-xl-back" title="Pick from the Activity List"
                                                    onClick={() => setAct(a.key, { other: false, activity: "", activity_id: "" })}>List</button>
                                            )}
                                        </div>
                                    ) : (
                                        <SearchSelect variant="cell" value={a.activity_id} options={activityOpts}
                                            onChange={(v) => setAct(a.key, { other: false, activity_id: v, activity: actName(v) })}
                                            onAddNew={(typed) => setAct(a.key, { other: true, activity_id: "", activity: (typed || "").toUpperCase() })}
                                            addNewLabel="Other activity (type it)"
                                            placeholder="Select activity" searchPlaceholder="Search activity..."
                                            aria-label={`Activity ${r + 1}`} disabled={disabled} {...cell(r, "activity")} />
                                    )}
                                </td>
                                <td>
                                    <input className="xl-input" value={a.remarks} maxLength={2000} onChange={(e) => setAct(a.key, { remarks: e.target.value })}
                                        aria-label={`Remarks row ${r + 1}`} disabled={disabled} {...cell(r, "remarks")} />
                                </td>
                                <td className="xl-ro">{a.is_done ? (a.done_at ? String(a.done_at).slice(0, 16) : "on save") : ""}</td>
                                <td className="xl-del">
                                    {!disabled && (
                                        <button type="button" tabIndex={-1} onClick={() => removeRow(r)} aria-label={`Remove row ${r + 1}`}>
                                            <Icon name="x" size={15} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td className="xl-rownum">
                                {!disabled && (
                                    <button type="button" className="icon-btn ghost" onClick={addRow} aria-label="Add row" title="Add row">
                                        <Icon name="plus" size={15} />
                                    </button>
                                )}
                            </td>
                            <td className="ta-center">{filled.filter((a) => a.is_done).length}/{filled.length}</td>
                            <td>{filled.length} activit{filled.length === 1 ? "y" : "ies"}</td>
                            <td />
                            <td />
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div className="xl-hint">
                <kbd>Enter</kbd> / <kbd>↓</kbd> next row (adds a row at the end) · <kbd>←</kbd> <kbd>→</kbd> move between cells ·
                <kbd>Ctrl</kbd>+<kbd>Delete</kbd> removes the row · not in the list? type it and pick <b>Other activity</b>
            </div>
        </div>
    );
}