// HR → Overtime & Leave: file a request, approve / reject / cancel
import { useCallback, useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { Badge, DataTable, EmployeeSelect, Field, PageHead, Tabs, api, fmtDate, fmtTime, mins, todayPH, useForm } from "./HRShared";

const STATUSES = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["cancelled", "Cancelled"], ["", "All"]];
const who = (e) => (e ? `${e.last_name}, ${e.first_name}` : "—");

export function ManageOvertime() {
  return <Requests only="overtime" />;
}

export function ManageLeave() {
  return <Requests only="leave" />;
}

export default function Requests({ only = null }) {
  const notify = useToast();
  const [tab, setTab] = useState(only || "overtime");
  const [status, setStatus] = useState("pending");
  const [empId, setEmpId] = useState("");
  const [rows, setRows] = useState(null);
  const [filing, setFiling] = useState(false);
  const [deciding, setDeciding] = useState(null); // { row, action }

  const load = useCallback(() => {
    setRows(null);
    const q = new URLSearchParams({ ...(status && { status }), ...(empId && { employee_id: empId }) });
    api.get(`/hr/${tab === "overtime" ? "overtime" : "leaves"}?${q}`).then(setRows).catch(() => setRows([]));
  }, [tab, status, empId]);
  useEffect(() => { load(); }, [load]);

  const done = (msg) => { notify(msg); setFiling(false); setDeciding(null); load(); };
  const fail = (e) => notify(e.message || "Couldn't save.", "error");

  const actions = (r) => (
    <span className="hr-row-actions">
      {r.status === "pending" && <button type="button" className="btn btn-sm btn-primary" onClick={() => setDeciding({ row: r, action: "approve" })}>Approve</button>}
      {r.status === "pending" && <button type="button" className="btn btn-sm" onClick={() => setDeciding({ row: r, action: "reject" })}>Reject</button>}
      {["pending", "approved"].includes(r.status) && !r.payroll_run_id && <button type="button" className="btn btn-sm" onClick={() => setDeciding({ row: r, action: "cancel" })}>Cancel</button>}
    </span>
  );

  return (
    <div className="hr">
      <PageHead
        title={only === "leave" ? "Manage Leave" : only === "overtime" ? "Manage Overtime" : "Overtime & Leave"}
        sub={tab === "leave" ? "Leave requests with approval · checked against the employee's leave credit" : "Overtime requests with approval · paid in payroll once approved"} />
      {!only && <Tabs value={tab} onChange={setTab} tabs={[["overtime", "Overtime"], ["leave", "Leave"]]} />}
      <section className="card hr-section">
        <header className="hr-section-head">
          <div className="hr-actions">
            <Field label="Status">
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
              </select>
            </Field>
            <div className="hr-field hr-emp-pick"><span className="field-label">Employee</span><EmployeeSelect value={empId} onChange={setEmpId} allowAll /></div>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setFiling(true)}>{tab === "overtime" ? "File overtime" : "File leave"}</button>
        </header>

        {tab === "overtime" ? (
          <DataTable loading={!rows} rows={rows || []} cols={[
            { key: "work_date", label: "Date", render: (r) => fmtDate(r.work_date) },
            { key: "employee", label: "Employee", render: (r) => who(r.employee) },
            { key: "time", label: "Time", render: (r) => `${fmtTime(r.time_start)} – ${fmtTime(r.time_end)}` },
            { key: "minutes", label: "Hours", cls: "n", render: (r) => mins(r.minutes) },
            { key: "pay_rate_code", label: "Rate", render: (r) => r.pay_rate_code || "REG_OT" },
            { key: "reason", label: "Reason", cls: "wrap" },
            { key: "status", label: "Status", render: (r) => <><Badge status={r.status} />{r.approver && <span className="hr-sub">{who(r.approver)}</span>}</> },
            { key: "act", label: "", cls: "n", render: actions },
          ]} />
        ) : (
          <DataTable loading={!rows} rows={rows || []} cols={[
            { key: "date_from", label: "Dates", render: (r) => (r.date_from === r.date_to ? fmtDate(r.date_from) : `${fmtDate(r.date_from)} – ${fmtDate(r.date_to)}`) },
            { key: "employee", label: "Employee", render: (r) => who(r.employee) },
            { key: "type", label: "Leave", render: (r) => <><b>{r.leave_type?.code}</b><span className="hr-sub">{r.leave_type?.name}</span></> },
            { key: "days", label: "Days", cls: "n", render: (r) => `${Number(r.days)}${r.is_half_day ? ` (${r.half_day_part || "half"})` : ""}` },
            { key: "reason", label: "Reason", cls: "wrap" },
            { key: "status", label: "Status", render: (r) => <><Badge status={r.status} />{r.approver && <span className="hr-sub">{who(r.approver)}</span>}</> },
            { key: "act", label: "", cls: "n", render: actions },
          ]} />
        )}
      </section>

      {filing && tab === "overtime" && <OvertimeForm onClose={() => setFiling(false)} onDone={done} onFail={fail} />}
      {filing && tab === "leave" && <LeaveForm onClose={() => setFiling(false)} onDone={done} onFail={fail} />}
      {deciding && <Decide kind={tab} {...deciding} onClose={() => setDeciding(null)} onDone={done} onFail={fail} />}
    </div>
  );
}

function OvertimeForm({ onClose, onDone, onFail }) {
  const [rates, setRates] = useState([]);
  useEffect(() => { api.get("/hr/lookups").then((r) => setRates(r.pay_rates.filter((x) => x.is_active && x.code.includes("OT")))).catch(() => { }); }, []);
  const [f, set] = useForm({ employee_id: "", work_date: todayPH(), start: "17:00", end: "19:00", pay_rate_code: "REG_OT", reason: "" });
  const save = () => {
    const end = f.end <= f.start ? new Date(new Date(`${f.work_date}T00:00:00`).getTime() + 86400000).toLocaleDateString("en-CA") : f.work_date;
    api.post("/hr/overtime", {
      employee_id: f.employee_id ? Number(f.employee_id) : null, work_date: f.work_date,
      time_start: `${f.work_date} ${f.start}:00`, time_end: `${end} ${f.end}:00`, pay_rate_code: f.pay_rate_code, reason: f.reason,
    }).then((r) => onDone(r.message)).catch(onFail);
  };
  return (
    <Modal title="File overtime" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!f.reason}>File</button></>}>
      <div className="hr-form">
        <div className="hr-field is-wide"><span className="field-label">Employee (empty = me)</span><EmployeeSelect value={f.employee_id} onChange={(v) => set("employee_id", v)} /></div>
        <Field label="Date"><input type="date" className="input" value={f.work_date} onChange={set("work_date")} /></Field>
        <Field label="Rate">
          <select className="input" value={f.pay_rate_code} onChange={set("pay_rate_code")}>
            {rates.map((r) => <option key={r.code} value={r.code}>{r.code} · {r.description}</option>)}
          </select>
        </Field>
        <Field label="Start"><input type="time" className="input" value={f.start} onChange={set("start")} /></Field>
        <Field label="End" hint={f.end <= f.start ? "Ends the next day" : ""}><input type="time" className="input" value={f.end} onChange={set("end")} /></Field>
        <Field label="Reason" wide><input className="input" value={f.reason} onChange={set("reason")} /></Field>
      </div>
    </Modal>
  );
}

function LeaveForm({ onClose, onDone, onFail }) {
  const [types, setTypes] = useState([]);
  useEffect(() => { api.get("/hr/lookups").then((r) => setTypes(r.leave_types.filter((t) => t.is_active))).catch(() => { }); }, []);
  const [f, set] = useForm({ employee_id: "", leave_type_id: "", date_from: todayPH(), date_to: todayPH(), is_half_day: false, half_day_part: "AM", reason: "" });
  const save = () => api.post("/hr/leaves", {
    ...f, employee_id: f.employee_id ? Number(f.employee_id) : null, leave_type_id: Number(f.leave_type_id),
    date_to: f.is_half_day ? f.date_from : f.date_to, half_day_part: f.is_half_day ? f.half_day_part : null,
  }).then((r) => onDone(r.message)).catch(onFail);
  return (
    <Modal title="File leave" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!f.leave_type_id || !f.reason}>File</button></>}>
      <p className="hr-note">Days are counted on the employee's work days only (rest days and holidays are skipped).</p>
      <div className="hr-form">
        <div className="hr-field is-wide"><span className="field-label">Employee (empty = me)</span><EmployeeSelect value={f.employee_id} onChange={(v) => set("employee_id", v)} /></div>
        <Field label="Leave type" wide>
          <select className="input" value={f.leave_type_id} onChange={set("leave_type_id")}>
            <option value="">Select…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}{t.is_paid ? "" : " (unpaid)"}</option>)}
          </select>
        </Field>
        <Field label="From"><input type="date" className="input" value={f.date_from} onChange={set("date_from")} /></Field>
        {!f.is_half_day && <Field label="To"><input type="date" className="input" value={f.date_to} min={f.date_from} onChange={set("date_to")} /></Field>}
        <label className="hr-check"><input type="checkbox" checked={f.is_half_day} onChange={set("is_half_day")} /> Half day</label>
        {f.is_half_day && (
          <Field label="Half">
            <select className="input" value={f.half_day_part} onChange={set("half_day_part")}><option value="AM">AM</option><option value="PM">PM</option></select>
          </Field>
        )}
        <Field label="Reason" wide><input className="input" value={f.reason} onChange={set("reason")} /></Field>
      </div>
    </Modal>
  );
}

function Decide({ kind, row, action, onClose, onDone, onFail }) {
  const [remarks, setRemarks] = useState("");
  const [minutes, setMinutes] = useState(row.minutes || "");
  const url = `/hr/${kind === "overtime" ? "overtime" : "leaves"}/${row.id}/${action}`;
  const go = () => api.put(url, { remarks, ...(kind === "overtime" && action === "approve" && { minutes: Number(minutes) }) })
    .then((r) => onDone(r.message)).catch(onFail);
  const label = { approve: "Approve", reject: "Reject", cancel: "Cancel request" }[action];
  return (
    <Modal title={`${label} · ${who(row.employee)}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Back</button><button className="btn btn-primary" onClick={go}>{label}</button></>}>
      <div className="hr-form">
        {kind === "overtime" && action === "approve" && (
          <Field label="Approved minutes" hint={`Filed: ${mins(row.minutes)}`}><input type="number" min="1" className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
        )}
        <Field label="Remarks" wide><input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
