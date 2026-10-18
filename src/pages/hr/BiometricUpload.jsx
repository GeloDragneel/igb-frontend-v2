// HR → Attendance → Upload biometric: device TXT → preview every employee-day → submit
// TXT columns: No · TMNo · EnNo · Name GMNo · Mode · DateTime (EnNo → employee from the Biometric IDs list)
import { useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import { DataTable, EmployeeSelect, Field, Pager, Stat, api, fmtDate, fmtTime, mins, n0, usePaged } from "./HRShared";

const ACTIONS = {
    new: ["New", "active"],
    update: ["Update (already exists)", "pending"],
    locked: ["In approved payroll", "inactive"],
};

/** device TXT → [{ en_no, name, mode, at: "Y-m-d H:i:s" }] */
function parseTxt(text) {
    const rows = [];
    text.split(/\r?\n/).forEach((line) => {
        const c = line.split("\t");
        if (c.length < 6 || !/^\d+$/.test(c[2]?.trim() || "")) return; // header / empty line
        const at = c[5].trim().replace(/\//g, "-");
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(at)) return;
        rows.push({ en_no: c[2].trim(), name: c[3].trim().replace(/\s+\d+$/, ""), mode: c[4].trim(), at: at.length === 16 ? `${at}:00` : at });
    });
    return rows;
}

function ActionBadge({ action }) {
    const [label, cls] = ACTIONS[action] || [action, "none"];
    return <span className={`hr-badge is-${cls}`}>{label}</span>;
}

export default function BiometricUpload({ notify, onClose, onDone }) {
    const [tab, setTab] = useState("upload");
    const [file, setFile] = useState(null);
    const [rows, setRows] = useState(null);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [over, setOver] = useState(false);
    const [emp, setEmp] = useState("");
    const [action, setAction] = useState("");

    const runPreview = (list) => {
        setBusy("Checking…");
        setError("");
        api.post("/hr/biometric/preview", { rows: list })
            .then(setPreview)
            .catch((e) => setError(e.message || "Couldn't read the file."))
            .finally(() => setBusy(""));
    };

    const pickFile = (f) => {
        setFile(f || null);
        setRows(null);
        setPreview(null);
        setError("");
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
            const list = parseTxt(String(reader.result || ""));
            if (!list.length) { setError("No punches found. Upload the TXT from the biometric device (No · TMNo · EnNo · Name · Mode · DateTime)."); return; }
            setRows(list);
            runPreview(list);
        };
        reader.onerror = () => setError("Couldn't read the file.");
        reader.readAsText(f);
    };

    const submit = () => {
        setBusy("Saving…");
        api.post("/hr/biometric/import", { rows })
            .then((r) => onDone(r.message, preview.summary))
            .catch((e) => { notify(e.message || "Couldn't save.", "error"); setBusy(""); });
    };

    const days = useMemo(() => (preview?.days || [])
        .filter((d) => !emp || String(d.employee_id) === emp)
        .filter((d) => !action || d.action === action), [preview, emp, action]);
    const employees = useMemo(() => {
        const m = new Map();
        (preview?.days || []).forEach((d) => m.set(d.employee_id, d.employee));
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [preview]);
    const paged = usePaged(days, `${emp}|${action}|${file?.name || ""}`);
    const s = preview?.summary;
    const toSave = s ? s.new + s.update : 0;

    return (
        <Modal title="Upload biometric" onClose={onClose} size={tab === "ids" || preview ? "xl" : undefined}
            footer={(
                <>
                    <button className="btn" onClick={onClose}>Close</button>
                    {tab === "upload" && preview && <button className="btn btn-primary" onClick={submit} disabled={!!busy || !toSave}>{busy === "Saving…" ? busy : `Submit ${n0(toSave)} day(s)`}</button>}
                </>
            )}>
            <div className="hr-ptabs" role="tablist">
                {[["upload", "Upload TXT"], ["ids", "Biometric IDs"]].map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} className={`hr-ptab${tab === k ? " is-active" : ""}`} onClick={() => setTab(k)}>{l}</button>
                ))}
            </div>

            {tab === "ids" && <BiometricIds notify={notify} onChanged={() => rows && runPreview(rows)} />}

            {tab === "upload" && (
                <section className="hr-pop-sec">
                    <label className={`hr-drop${over ? " is-over" : ""}${file ? " has-file" : ""}`}
                        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                        onDrop={(e) => { e.preventDefault(); setOver(false); pickFile(e.dataTransfer.files?.[0]); }}>
                        <input type="file" className="hr-file-input" accept=".txt,.TXT,text/plain" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
                        <span className="hr-drop-icon" aria-hidden="true">⤒</span>
                        <b>{file ? file.name : "Choose the biometric TXT file"}</b>
                        <span className="hr-muted">{file ? `${n0(rows?.length || 0)} punch line(s) read` : "or drag it here · No · TMNo · EnNo · Name · Mode · DateTime"}</span>
                        <span className="btn btn-sm">{file ? "Choose another file" : "Choose file"}</span>
                    </label>
                    {!preview && <span className="hr-hint">Uploading the same file again is safe: days that already exist are updated.</span>}
                    {busy && <p className="hr-note">{busy}</p>}
                    {error && <div className="alert-error" role="alert">{error}</div>}

                    {s && (
                        <>
                            <div className="hr-stats">
                                <Stat label="Punches" value={n0(s.punches)} sub={`${n0(s.lines)} line(s)${s.bad_lines ? ` · ${s.bad_lines} unreadable` : ""}`} />
                                <Stat label="Dates" value={`${fmtDate(s.from)} – ${fmtDate(s.to)}`} />
                                <Stat label="Employee-days" value={n0(s.days)} sub={`${n0(s.employees)} employee(s)`} />
                                <Stat label="New / update" value={`${n0(s.new)} / ${n0(s.update)}`} tone="is-green" />
                                <Stat label="In approved payroll" value={n0(s.locked)} tone="is-orange" sub="not changed" />
                            </div>

                            {preview.unmapped.length > 0 && (
                                <Unmapped list={preview.unmapped} notify={notify} onSaved={() => runPreview(rows)} />
                            )}

                            <p className="hr-note">
                                The device Mode is not used. For each day: first punch = time in, last punch = time out, the punches between = break in / break out.
                                Punches within 3 minutes count once. Late, undertime and status come from each employee's shift.
                            </p>

                            <div className="hr-section-head">
                                <div className="hr-actions">
                                    <Field label="Employee">
                                        <select className="input" value={emp} onChange={(e) => setEmp(e.target.value)}>
                                            <option value="">All employees</option>
                                            {employees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Action">
                                        <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
                                            <option value="">All</option>
                                            {Object.entries(ACTIONS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                                        </select>
                                    </Field>
                                </div>
                            </div>

                            <DataTable rows={paged.pageRows} rowKey="key" empty="No day to show." cols={[
                                { key: "work_date", label: "Date", render: (d) => fmtDate(d.work_date) },
                                { key: "employee", label: "Employee", render: (d) => <><b>{d.employee}</b><span className="hr-sub">{d.shift || "No shift"}</span></> },
                                { key: "punches", label: "Punches", cls: "wrap", render: (d) => <>{d.punches.join(" · ")}{d.ignored > 0 && <span className="hr-sub">{d.ignored} extra / double tap ignored</span>}</> },
                                { key: "time_in", label: "Time in", render: (d) => fmtTime(d.time_in) },
                                { key: "break_in", label: "Break in", render: (d) => fmtTime(d.break_in) },
                                { key: "break_out", label: "Break out", render: (d) => fmtTime(d.break_out) },
                                { key: "time_out", label: "Time out", render: (d) => fmtTime(d.time_out) },
                                { key: "worked_minutes", label: "Worked", cls: "n", render: (d) => mins(d.worked_minutes) },
                                { key: "late_minutes", label: "Late", cls: "n", render: (d) => mins(d.late_minutes) },
                                { key: "undertime_minutes", label: "Undertime", cls: "n", render: (d) => mins(d.undertime_minutes) },
                                { key: "status", label: "Status", render: (d) => <span className={`hr-badge is-${d.status}`}>{String(d.status || "").replace(/_/g, " ")}</span> },
                                { key: "action", label: "On submit", render: (d) => <ActionBadge action={d.action} /> },
                            ]} />
                            <Pager {...paged} label="day(s)" />
                        </>
                    )}
                </section>
            )}
        </Modal>
    );
}

/* EnNo in the file with no employee yet → pick the employee here */
function Unmapped({ list, notify, onSaved }) {
    const [pick, setPick] = useState({});
    const save = (u) => api.post("/hr/biometric/map", { en_no: u.en_no, employee_id: Number(pick[u.en_no]), device_name: u.name })
        .then((r) => { notify(r.message); onSaved(); })
        .catch((e) => notify(e.message || "Couldn't save.", "error"));
    return (
        <section className="hr-pop-sec">
            <p className="hr-note is-warn">{list.length} EnNo in this file have no employee yet, so their punches are not included. Pick the employee and save, or leave them out.</p>
            <DataTable rows={list} rowKey="en_no" cols={[
                { key: "en_no", label: "EnNo", render: (u) => <b>{u.en_no}</b> },
                { key: "name", label: "Name on device" },
                { key: "punches", label: "Punches", cls: "n" },
                { key: "dates", label: "Dates", render: (u) => `${fmtDate(u.from)} – ${fmtDate(u.to)}` },
                { key: "employee", label: "Employee", cls: "wrap", render: (u) => <EmployeeSelect value={pick[u.en_no] || ""} onChange={(v) => setPick((p) => ({ ...p, [u.en_no]: v }))} /> },
                { key: "act", label: "", cls: "n", render: (u) => <button type="button" className="btn btn-sm btn-primary" disabled={!pick[u.en_no]} onClick={() => save(u)}>Save</button> },
            ]} />
        </section>
    );
}

/* the EnNo → employee list */
function BiometricIds({ notify, onChanged }) {
    const [rows, setRows] = useState(null);
    const [f, setF] = useState({ en_no: "", employee_id: "" });
    const load = () => api.get("/hr/biometric/map").then(setRows).catch((e) => { notify(e.message || "Couldn't load.", "error"); setRows([]); });
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const done = (r) => { notify(r.message); load(); onChanged(); };
    const fail = (e) => notify(e.message || "Couldn't save.", "error");
    const save = () => api.post("/hr/biometric/map", { en_no: f.en_no.trim(), employee_id: Number(f.employee_id) })
        .then((r) => { setF({ en_no: "", employee_id: "" }); done(r); }).catch(fail);

    return (
        <section className="hr-pop-sec">
            <header>
                <div><h5>Biometric IDs</h5><span className="hr-muted">EnNo on the device → employee in the system</span></div>
            </header>
            <div className="hr-form">
                <Field label="EnNo"><input className="input" value={f.en_no} onChange={(e) => setF((p) => ({ ...p, en_no: e.target.value }))} placeholder="e.g. 5031" /></Field>
                <div className="hr-field is-wide"><span className="field-label">Employee</span><EmployeeSelect value={f.employee_id} onChange={(v) => setF((p) => ({ ...p, employee_id: v }))} /></div>
            </div>
            <div className="hr-form-actions">
                <button type="button" className="btn btn-primary" onClick={save} disabled={!f.en_no.trim() || !f.employee_id}>Save EnNo</button>
            </div>
            <DataTable loading={!rows} rows={rows || []} empty="No EnNo yet." cols={[
                { key: "en_no", label: "EnNo", render: (m) => <b>{m.en_no}</b> },
                { key: "employee", label: "Employee" },
                { key: "device_name", label: "Name on device", render: (m) => m.device_name || "—" },
                {
                    key: "act", label: "", cls: "n", render: (m) => (
                        <span className="hr-row-actions">
                            <button type="button" className="btn btn-sm" onClick={() => setF({ en_no: m.en_no, employee_id: String(m.employee_id) })}>Change</button>
                            <button type="button" className="btn btn-sm" onClick={() => api.del(`/hr/biometric/map/${m.id}`).then(done).catch(fail)}>Remove</button>
                        </span>
                    )
                },
            ]} />
        </section>
    );
}