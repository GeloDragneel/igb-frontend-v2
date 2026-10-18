// HR → Attendance: my punch clock (time in · break in · break out · time out) + attendance list with manual entry
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { exportCsv } from "../../utils/exportRows";
import BiometricUpload from "./BiometricUpload";
import { cutoffPeriod } from "./Payroll";
import { Badge, DataTable, EmployeeSelect, Field, PageHead, api, fmtDate, fmtTime, mins, todayPH, useForm } from "./HRShared";

const PUNCHES = [["time_in", "Time in"], ["break_in", "Break in"], ["break_out", "Break out"], ["time_out", "Time out"]];
const firstOfMonth = () => `${todayPH().slice(0, 8)}01`;
const addMonth = (ym, n) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };

export default function Attendance() {
  const notify = useToast();
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayPH());
  const [empId, setEmpId] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(null); // row or {} for new
  const [upload, setUpload] = useState(false);
  // cut-off filter (HR Settings → Payroll cut-offs): "" = custom From / To
  const [cutoffs, setCutoffs] = useState([]);
  const [cutId, setCutId] = useState("");
  const [month, setMonth] = useState(todayPH().slice(0, 7));
  const applyCut = (id, m) => {
    setCutId(id);
    setMonth(m);
    const p = cutoffPeriod(cutoffs.find((c) => String(c.id) === String(id)), m);
    if (p) { setFrom(p.period_from); setTo(p.period_to); }
  };
  useEffect(() => {
    api.get("/hr/payroll-cutoffs").then((list) => {
      const active = list.filter((c) => c.is_active);
      setCutoffs(active);
      // start on the cut-off that has today (this month or next)
      const today = todayPH();
      for (const m of [today.slice(0, 7), addMonth(today.slice(0, 7), 1)]) {
        const c = active.find((x) => { const p = cutoffPeriod(x, m); return p && p.period_from <= today && today <= p.period_to; });
        if (c) {
          const p = cutoffPeriod(c, m);
          setCutId(String(c.id)); setMonth(m); setFrom(p.period_from); setTo(p.period_to);
          return;
        }
      }
    }).catch(() => { });
  }, []);

  const load = useCallback(() => {
    setRows(null);
    setError("");
    api.get(`/hr/attendance?from=${from}&to=${to}${empId ? `&employee_id=${empId}` : ""}`)
      .then(setRows).catch((e) => { setError(e.message || "Couldn't load attendance."); setRows([]); });
  }, [from, to, empId]);
  useEffect(() => { load(); }, [load]);

  const recompute = () => api.post("/hr/attendance/recompute", { from, to }).then((r) => { notify(r.message); load(); })
    .catch((e) => notify(e.message || "Couldn't recompute.", "error"));

  const totals = useMemo(() => (rows || []).reduce((t, r) => ({
    worked: t.worked + r.worked_minutes, late: t.late + r.late_minutes, under: t.under + r.undertime_minutes,
    nd: t.nd + r.night_diff_minutes, ot: t.ot + r.approved_ot_minutes,
  }), { worked: 0, late: 0, under: 0, nd: 0, ot: 0 }), [rows]);

  const csv = () => exportCsv(`Attendance-${from}-to-${to}`, [
    { label: "Date", value: (r) => r.work_date }, { label: "Employee", value: (r) => name(r) }, { label: "Shift", value: (r) => r.shift?.name },
    { label: "Time in", value: (r) => fmtTime(r.time_in) }, { label: "Break in", value: (r) => fmtTime(r.break_in) },
    { label: "Break out", value: (r) => fmtTime(r.break_out) }, { label: "Time out", value: (r) => fmtTime(r.time_out) },
    { label: "Worked (min)", value: (r) => r.worked_minutes }, { label: "Late (min)", value: (r) => r.late_minutes },
    { label: "Undertime (min)", value: (r) => r.undertime_minutes }, { label: "Night diff (min)", value: (r) => r.night_diff_minutes },
    { label: "OT (min)", value: (r) => r.approved_ot_minutes }, { label: "Day", value: (r) => r.day_type }, { label: "Status", value: (r) => r.status },
  ], rows || []);

  return (
    <div className="hr">
      <PageHead title="Attendance" sub="Philippine time · late, undertime and night differential are computed from the shift" />

      <section className="card hr-section">
        <header className="hr-section-head">
          <div className="hr-actions">
            <Field label="Cut-off">
              <select className="input" value={cutId} onChange={(e) => (e.target.value ? applyCut(e.target.value, month) : setCutId(""))}>
                {cutoffs.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                <option value="">Custom dates</option>
              </select>
            </Field>
            {cutId && (
              <Field label="Month" >
                <input type="month" className="input" value={month} onChange={(e) => e.target.value && applyCut(cutId, e.target.value)} />
              </Field>
            )}
            <Field label="From"><input type="date" className="input" value={from} onChange={(e) => { setCutId(""); setFrom(e.target.value); }} /></Field>
            <Field label="To"><input type="date" className="input" value={to} min={from} onChange={(e) => { setCutId(""); setTo(e.target.value); }} /></Field>
            <div className="hr-field hr-emp-pick"><span className="field-label">Employee</span><EmployeeSelect value={empId} onChange={setEmpId} allowAll /></div>
          </div>
          <div className="hr-actions">
            <button type="button" className="btn btn-sm" onClick={recompute} title="After changing a shift, holiday or night-diff setting">Recompute</button>
            <button type="button" className="btn btn-sm" onClick={csv} disabled={!rows?.length}>CSV</button>
            <button type="button" className="btn btn-sm" onClick={() => setUpload(true)}>Upload biometric</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setEdit({ employee_id: empId })}>Manual entry</button>
          </div>
        </header>
        {error && <div className="alert-error" role="alert">{error}</div>}
        <DataTable loading={!rows} rows={rows || []} onRow={(r) => setEdit(r)} cols={[
          { key: "work_date", label: "Date", render: (r) => fmtDate(r.work_date) },
          { key: "employee", label: "Employee", render: name },
          { key: "shift", label: "Shift", render: (r) => r.shift?.name || "—" },
          ...PUNCHES.map(([k, l]) => ({ key: k, label: l, render: (r) => fmtTime(r[k]) })),
          { key: "worked_minutes", label: "Worked", cls: "n", render: (r) => mins(r.worked_minutes) },
          { key: "late_minutes", label: "Late", cls: "n", render: (r) => mins(r.late_minutes) },
          { key: "undertime_minutes", label: "Undertime", cls: "n", render: (r) => mins(r.undertime_minutes + r.overbreak_minutes) },
          { key: "night_diff_minutes", label: "Night diff", cls: "n", render: (r) => mins(r.night_diff_minutes) },
          { key: "approved_ot_minutes", label: "OT", cls: "n", render: (r) => mins(r.approved_ot_minutes) },
          { key: "day_type", label: "Day", render: (r) => r.day_type.replace("_", " ") },
          { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> },
        ]} />
        {rows?.length > 0 && (
          <div className="hr-pad hr-kv">
            <div><span>Worked</span><b>{mins(totals.worked)}</b></div>
            <div><span>Late</span><b>{mins(totals.late)}</b></div>
            <div><span>Undertime</span><b>{mins(totals.under)}</b></div>
            <div><span>Night diff</span><b>{mins(totals.nd)}</b></div>
            <div><span>Approved OT</span><b>{mins(totals.ot)}</b></div>
          </div>
        )}
      </section>

      {upload && <BiometricUpload notify={notify} onClose={() => setUpload(false)} onDone={(m, sum) => { notify(m); setUpload(false); if (sum?.from) { setCutId(""); setFrom(sum.from); setTo(sum.to); } else load(); }} />}
      {edit && <EntryModal row={edit} onClose={() => setEdit(null)} onDone={(m) => { notify(m); setEdit(null); load(); }} onFail={(e) => notify(e.message || "Couldn't save.", "error")} />}
    </div>
  );
}

const name = (r) => (r.employee ? `${r.employee.last_name}, ${r.employee.first_name}` : "—");

/* manual entry / correction — type the times only; the date comes from the work date (+1 day after midnight) */
const STATUSES = [["", "Auto (from the times)"], ["on_leave", "On leave"], ["absent", "Absent"]];

// "HH:MM" of a saved punch, Philippine time ("2026-10-07 08:00:00" or an ISO string with a zone)
const hhmm = (v) => {
  if (!v) return "";
  const str = String(v);
  if (!/(Z|[+-]\d\d:?\d\d)$/.test(str)) return str.replace("T", " ").slice(11, 16);
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" });
};
const addDay = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** times in punch order → full datetimes; a time earlier than the one before it is the next day */
function buildPunches(workDate, f) {
  const out = {};
  let offset = 0;
  let prev = null;
  PUNCHES.forEach(([k]) => {
    if (!f[k]) { out[k] = null; return; }
    const m = toMin(f[k]);
    if (prev !== null && m < prev) offset += 1;
    prev = m;
    out[k] = { date: addDay(workDate, offset), time: f[k], nextDay: offset > 0 };
  });
  return out;
}

function EntryModal({ row, onClose, onDone, onFail }) {
  const [f, set] = useForm({
    employee_id: row.employee_id ? String(row.employee_id) : "", work_date: row.work_date ? String(row.work_date).slice(0, 10) : todayPH(),
    time_in: hhmm(row.time_in), break_in: hhmm(row.break_in), break_out: hhmm(row.break_out), time_out: hhmm(row.time_out),
    status: row.status === "on_leave" ? "on_leave" : "", remarks: row.remarks || "",
  });
  const [saving, setSaving] = useState(false);
  const locked = !!row.payroll_run_id;
  const editing = !!row.id;
  const p = buildPunches(f.work_date, f);

  // what is wrong with the entry (Save stays off until it is fixed)
  const problem = (() => {
    if (!f.employee_id) return "Select the employee.";
    if (!f.work_date) return "Set the work date.";
    if (f.time_out && !f.time_in) return "Time out needs a time in.";
    if (!!f.break_in !== !!f.break_out) return "Fill both break in and break out, or leave both empty.";
    if (f.break_in && !f.time_in) return "Break needs a time in.";
    const days = PUNCHES.map(([k]) => p[k]).filter(Boolean);
    if (days.length && days[days.length - 1].date > addDay(f.work_date, 1)) return "The times go past the next day. Check AM / PM.";
    return "";
  })();

  const save = () => {
    const body = { employee_id: Number(f.employee_id), work_date: f.work_date, remarks: f.remarks || null };
    PUNCHES.forEach(([k]) => { body[k] = p[k] ? `${p[k].date} ${p[k].time}:00` : null; });
    if (f.status) body.status = f.status;
    setSaving(true);
    api.post("/hr/attendance", body).then((r) => onDone(r.message)).catch(onFail).finally(() => setSaving(false));
  };

  return (
    <Modal title={editing ? `Attendance · ${name(row)} · ${fmtDate(row.work_date)}` : "Manual attendance entry"} onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={onClose}>Close</button>{!locked && <button className="btn btn-primary" onClick={save} disabled={!!problem || saving}>{saving ? "Saving…" : "Save"}</button>}</>}>
      {locked && <p className="hr-note is-warn">This day is already in an approved payroll and can no longer be changed.</p>}
      <div className="hr-entry">
        <div className="hr-entry-row is-top">
          {editing
            ? <Field label="Employee"><input className="input" value={name(row)} disabled /></Field>
            : <div className="hr-field"><span className="field-label">Employee</span><EmployeeSelect value={f.employee_id} onChange={(v) => set("employee_id", v)} /></div>}
          <Field label="Work date" hint="The date the shift starts"><input type="date" className="input" value={f.work_date} onChange={set("work_date")} disabled={editing} /></Field>
        </div>

        <fieldset className="hr-entry-times">
          <legend>Time</legend>
          {PUNCHES.map(([k, l]) => (
            <Field key={k} label={l} hint={p[k] ? `${fmtDate(p[k].date)}${p[k].nextDay ? " · next day" : ""}` : undefined}>
              <input type="time" className="input" value={f[k]} onChange={set(k)} disabled={locked} />
            </Field>
          ))}
        </fieldset>

        <div className="hr-entry-row is-bottom">
          <Field label="Status" hint="Only when there is no time in / out">
            <select className="input" value={f.status} onChange={set("status")} disabled={locked}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Remarks"><input className="input" value={f.remarks} onChange={set("remarks")} disabled={locked} placeholder="e.g. Forgot to time out, biometric down" /></Field>
        </div>
      </div>
      {!locked && problem && <p className="hr-note is-warn">{problem}</p>}
      {editing && (
        <div className="hr-kv">
          <div><span>Schedule</span><b>{fmtTime(row.sched_time_in)} – {fmtTime(row.sched_time_out)}</b></div>
          <div><span>Worked</span><b>{mins(row.worked_minutes)}</b></div>
          <div><span>Late / undertime</span><b>{mins(row.late_minutes)} / {mins(row.undertime_minutes)}</b></div>
          <div><span>Overbreak</span><b>{mins(row.overbreak_minutes)}</b></div>
          <div><span>Night diff</span><b>{mins(row.night_diff_minutes)}</b></div>
          <div><span>Status</span><b><Badge status={row.status} /></b></div>
        </div>
      )}
    </Modal>
  );
}