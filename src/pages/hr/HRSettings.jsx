// HR → Settings: shifts (one default), night differential, pay rates, holidays, leave types, contributions, tax table
import { useCallback, useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { Badge, DataTable, Field, PageHead, Tabs, api, fmtDate, n2, pct, todayPH, useForm } from "./HRShared";
import { PayrollCutoffs } from "./Payroll";
import Brackets from "./Brackets";

const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]];
const t12 = (t) => {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export default function HRSettings() {
  const notify = useToast();
  const [tab, setTab] = useState("shifts");
  const [lk, setLk] = useState(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { type, row }

  const load = useCallback(() => {
    api.get("/hr/lookups").then(setLk).catch((e) => setError(e.message || "Couldn't load the settings."));
  }, []);
  useEffect(() => { load(); }, [load]);

  const done = (msg) => { notify(msg); setModal(null); load(); };
  const fail = (e) => notify(e.message || "Couldn't save.", "error");

  return (
    <div className="hr">
      <PageHead title="HR Settings" sub="Shifts, night differential, pay rates, holidays, leave types, contributions, payroll cut-offs · Philippine time" />
      <Tabs value={tab} onChange={setTab} tabs={[["shifts", "Shifts"], ["pay", "Night diff & pay rates"], ["holidays", "Holidays"], ["leave", "Leave types"], ["contrib", "Contributions & tax"], ["sss", "SSS brackets"], ["phic", "PhilHealth brackets"], ["cutoffs", "Payroll cut-offs"]]} />
      {error && <div className="alert-error" role="alert">{error}</div>}

      {tab === "shifts" && (
        <section className="card hr-section">
          <header className="hr-section-head">
            <div><h5>Shifts</h5><span className="hr-muted">The default shift is used for employees without one. You can still change each employee's shift.</span></div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ type: "shift" })}>New shift</button>
          </header>
          <DataTable loading={!lk} rows={lk?.shifts || []} cols={[
            { key: "name", label: "Shift", render: (r) => <><b>{r.name}</b> <span className="hr-sub">{r.code}</span></> },
            { key: "time_in", label: "Time in", render: (r) => t12(r.time_in) },
            { key: "break_in", label: "Break in", render: (r) => t12(r.break_in) },
            { key: "break_out", label: "Break out", render: (r) => t12(r.break_out) },
            { key: "time_out", label: "Time out", render: (r) => `${t12(r.time_out)}${r.is_overnight ? " (+1 day)" : ""}` },
            { key: "grace_minutes", label: "Grace", cls: "n", render: (r) => `${r.grace_minutes} min` },
            { key: "paid_hours", label: "Paid hrs", cls: "n" },
            { key: "work_days", label: "Work days", render: (r) => String(r.work_days).split(",").map((d) => DAYS[d - 1]?.[1]).join(" ") },
            { key: "status", label: "", render: (r) => <>{r.is_default && <Badge status="default" />} {!r.is_active && <Badge status="cancelled" />}</> },
            {
              key: "act", label: "", cls: "n", render: (r) => (
                <span className="hr-row-actions">
                  {!r.is_default && <button type="button" className="btn btn-sm" onClick={() => api.put(`/hr/shifts/${r.id}/default`).then((x) => done(x.message)).catch(fail)}>Set default</button>}
                  <button type="button" className="btn btn-sm" onClick={() => setModal({ type: "shift", row: r })}>Edit</button>
                </span>
              )
            },
          ]} />
        </section>
      )}

      {tab === "pay" && (
        <div className="hr-grid">
          <section className="card hr-section">
            <header className="hr-section-head">
              <div><h5>Night differential</h5><span className="hr-muted">A new setting applies from its date; old ones stay as history.</span></div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ type: "nd" })}>New setting</button>
            </header>
            <DataTable loading={!lk} rows={lk?.night_diff || []} cols={[
              { key: "effective_from", label: "From", render: (r) => fmtDate(r.effective_from) },
              { key: "start_time", label: "Window", render: (r) => `${t12(r.start_time)} – ${t12(r.end_time)}` },
              { key: "rate", label: "Rate", cls: "n", render: (r) => `+${pct(r.rate)}` },
            ]} />
          </section>
          <section className="card hr-section">
            <header className="hr-section-head"><div><h5>Pay rates</h5><span className="hr-muted">Multipliers of the hourly / daily rate (DOLE)</span></div></header>
            <DataTable loading={!lk} rows={lk?.pay_rates || []} cols={[
              { key: "code", label: "Code" },
              { key: "description", label: "Description", cls: "wrap" },
              { key: "multiplier", label: "Rate", cls: "n", render: (r) => pct(r.multiplier, 0) },
              { key: "act", label: "", cls: "n", render: (r) => <button type="button" className="btn btn-sm" onClick={() => setModal({ type: "rate", row: r })}>Edit</button> },
            ]} />
          </section>
        </div>
      )}

      {tab === "holidays" && <Holidays notify={notify} />}

      {tab === "leave" && (
        <section className="card hr-section">
          <header className="hr-section-head">
            <div><h5>Leave types</h5><span className="hr-muted">Default days are given to every employee when you generate the year's leave credits.</span></div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ type: "leave" })}>New leave type</button>
          </header>
          <DataTable loading={!lk} rows={lk?.leave_types || []} cols={[
            { key: "code", label: "Code" },
            { key: "name", label: "Name", cls: "wrap" },
            { key: "is_paid", label: "Paid", cls: "c", render: (r) => (r.is_paid ? "Yes" : "No") },
            { key: "default_days", label: "Days / year", cls: "n" },
            { key: "is_convertible", label: "Convertible", cls: "c", render: (r) => (r.is_convertible ? "Yes" : "No") },
            { key: "is_active", label: "", render: (r) => (!r.is_active ? <Badge status="cancelled" /> : null) },
            { key: "act", label: "", cls: "n", render: (r) => <button type="button" className="btn btn-sm" onClick={() => setModal({ type: "leave", row: r })}>Edit</button> },
          ]} />
        </section>
      )}

      {tab === "contrib" && <Contributions lk={lk} onNew={() => setModal({ type: "contrib" })} />}

      {tab === "sss" && <Brackets key="sss" type="sss" notify={notify} />}
      {tab === "phic" && <Brackets key="phic" type="phic" notify={notify} />}

      {tab === "cutoffs" && <PayrollCutoffs notify={notify} />}

      {modal?.type === "shift" && <ShiftModal row={modal.row} onClose={() => setModal(null)} onDone={done} onFail={fail} />}
      {modal?.type === "nd" && <NightDiffModal onClose={() => setModal(null)} onDone={done} onFail={fail} />}
      {modal?.type === "rate" && <PayRateModal row={modal.row} onClose={() => setModal(null)} onDone={done} onFail={fail} />}
      {modal?.type === "leave" && <LeaveTypeModal row={modal.row} onClose={() => setModal(null)} onDone={done} onFail={fail} />}
      {modal?.type === "contrib" && <ContributionModal onClose={() => setModal(null)} onDone={done} onFail={fail} />}
    </div>
  );
}

/* ---------------- shift ---------------- */
function ShiftModal({ row, onClose, onDone, onFail }) {
  const cut = (t) => (t ? String(t).slice(0, 5) : "");
  const [f, set] = useForm({
    code: row?.code || "", name: row?.name || "", time_in: cut(row?.time_in) || "08:00", break_in: cut(row?.break_in) || "12:00",
    break_out: cut(row?.break_out) || "13:00", time_out: cut(row?.time_out) || "17:00", grace_minutes: row?.grace_minutes ?? 0,
    paid_hours: row?.paid_hours ?? 8, is_default: !!row?.is_default, is_active: row ? !!row.is_active : true,
    work_days: row ? String(row.work_days).split(",").map(Number) : [1, 2, 3, 4, 5],
  });
  const [busy, setBusy] = useState(false);
  const toggleDay = (d) => set("work_days", f.work_days.includes(d) ? f.work_days.filter((x) => x !== d) : [...f.work_days, d].sort());
  const save = () => {
    setBusy(true);
    const body = { ...f, break_in: f.break_in || null, break_out: f.break_out || null, is_overnight: f.time_out <= f.time_in };
    (row ? api.put(`/hr/shifts/${row.id}`, body) : api.post("/hr/shifts", body)).then((r) => onDone(r.message)).catch(onFail).finally(() => setBusy(false));
  };
  return (
    <Modal title={row ? `Edit shift · ${row.name}` : "New shift"} onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy || !f.name}>{busy ? "Saving…" : "Save"}</button></>}>
      <div className="hr-form">
        <Field label="Code"><input className="input" value={f.code} onChange={set("code")} placeholder="DAY" /></Field>
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} placeholder="Day shift" /></Field>
        <Field label="Time in"><input type="time" className="input" value={f.time_in} onChange={set("time_in")} /></Field>
        <Field label="Break in"><input type="time" className="input" value={f.break_in} onChange={set("break_in")} /></Field>
        <Field label="Break out"><input type="time" className="input" value={f.break_out} onChange={set("break_out")} /></Field>
        <Field label="Time out" hint={f.time_out && f.time_out <= f.time_in ? "Ends the next day (overnight)" : ""}><input type="time" className="input" value={f.time_out} onChange={set("time_out")} /></Field>
        <Field label="Grace (minutes)"><input type="number" min="0" className="input" value={f.grace_minutes} onChange={set("grace_minutes")} /></Field>
        <Field label="Paid hours per day"><input type="number" min="1" step="0.5" className="input" value={f.paid_hours} onChange={set("paid_hours")} /></Field>
        <Field label="Work days" wide>
          <div className="hr-days">
            {DAYS.map(([d, l]) => <label key={d}><input type="checkbox" checked={f.work_days.includes(d)} onChange={() => toggleDay(d)} /> {l}</label>)}
          </div>
        </Field>
        <label className="hr-check"><input type="checkbox" checked={f.is_default} onChange={set("is_default")} /> Default shift</label>
        <label className="hr-check"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active</label>
      </div>
    </Modal>
  );
}

function NightDiffModal({ onClose, onDone, onFail }) {
  const [f, set] = useForm({ start_time: "22:00", end_time: "06:00", rate: 0.1, effective_from: todayPH() });
  return (
    <Modal title="Night differential" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => api.post("/hr/night-diff", f).then((r) => onDone(r.message)).catch(onFail)}>Save</button></>}>
      <div className="hr-form">
        <Field label="Starts"><input type="time" className="input" value={f.start_time} onChange={set("start_time")} /></Field>
        <Field label="Ends"><input type="time" className="input" value={f.end_time} onChange={set("end_time")} /></Field>
        <Field label="Rate" hint="0.10 = +10% of the hourly rate"><input type="number" step="0.01" min="0" className="input" value={f.rate} onChange={set("rate")} /></Field>
        <Field label="Effective from"><input type="date" className="input" value={f.effective_from} onChange={set("effective_from")} /></Field>
      </div>
    </Modal>
  );
}

function PayRateModal({ row, onClose, onDone, onFail }) {
  const [f, set] = useForm({ description: row.description, multiplier: row.multiplier, is_active: !!row.is_active });
  return (
    <Modal title={`Pay rate · ${row.code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => api.put(`/hr/pay-rates/${row.id}`, f).then((r) => onDone(r.message)).catch(onFail)}>Save</button></>}>
      <div className="hr-form">
        <Field label="Description" wide><input className="input" value={f.description} onChange={set("description")} /></Field>
        <Field label="Multiplier" hint="1.25 = 125%"><input type="number" step="0.01" min="0" className="input" value={f.multiplier} onChange={set("multiplier")} /></Field>
        <label className="hr-check"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active</label>
      </div>
    </Modal>
  );
}

function LeaveTypeModal({ row, onClose, onDone, onFail }) {
  const [f, set] = useForm({
    code: row?.code || "", name: row?.name || "", is_paid: row ? !!row.is_paid : true, default_days: row?.default_days ?? 0,
    is_convertible: !!row?.is_convertible, requires_attachment: !!row?.requires_attachment, is_active: row ? !!row.is_active : true,
  });
  const save = () => (row ? api.put(`/hr/leave-types/${row.id}`, f) : api.post("/hr/leave-types", f)).then((r) => onDone(r.message)).catch(onFail);
  return (
    <Modal title={row ? `Edit leave type · ${row.code}` : "New leave type"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!f.code || !f.name}>Save</button></>}>
      <div className="hr-form">
        <Field label="Code"><input className="input" value={f.code} onChange={set("code")} maxLength={10} /></Field>
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Days per year"><input type="number" min="0" step="0.5" className="input" value={f.default_days} onChange={set("default_days")} /></Field>
        <label className="hr-check"><input type="checkbox" checked={f.is_paid} onChange={set("is_paid")} /> Paid</label>
        <label className="hr-check"><input type="checkbox" checked={f.is_convertible} onChange={set("is_convertible")} /> Convertible to cash</label>
        <label className="hr-check"><input type="checkbox" checked={f.requires_attachment} onChange={set("requires_attachment")} /> Needs attachment</label>
        <label className="hr-check"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active</label>
      </div>
    </Modal>
  );
}

/* ---------------- holidays ---------------- */
function Holidays({ notify }) {
  const [year, setYear] = useState(Number(todayPH().slice(0, 4)));
  const [rows, setRows] = useState(null);
  const [f, set, setF] = useForm({ holiday_date: "", name: "", holiday_type: "regular" });
  const load = useCallback(() => { setRows(null); api.get(`/hr/holidays?year=${year}`).then(setRows).catch(() => setRows([])); }, [year]);
  useEffect(() => { load(); }, [load]);
  const add = () => api.post("/hr/holidays", f).then((r) => { notify(r.message); setF({ holiday_date: "", name: "", holiday_type: "regular" }); load(); })
    .catch((e) => notify(e.message || "Couldn't save.", "error"));
  return (
    <section className="card hr-section">
      <header className="hr-section-head">
        <div><h5>Holidays</h5><span className="hr-muted">Add each year's proclamation. Regular = 200% when worked, special = 130%.</span></div>
        <Field label="Year"><input type="number" className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field>
      </header>
      <div className="hr-pad hr-form">
        <Field label="Date"><input type="date" className="input" value={f.holiday_date} onChange={set("holiday_date")} /></Field>
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} placeholder="e.g. Independence Day" /></Field>
        <Field label="Type">
          <select className="input" value={f.holiday_type} onChange={set("holiday_type")}>
            <option value="regular">Regular holiday</option>
            <option value="special">Special non-working</option>
            <option value="special_working">Special working</option>
          </select>
        </Field>
        <div className="hr-actions"><button type="button" className="btn btn-primary" onClick={add} disabled={!f.holiday_date || !f.name}>Add holiday</button></div>
      </div>
      <DataTable loading={!rows} rows={rows || []} cols={[
        { key: "holiday_date", label: "Date", render: (r) => fmtDate(r.holiday_date) },
        { key: "name", label: "Holiday", cls: "wrap" },
        { key: "holiday_type", label: "Type", render: (r) => r.holiday_type.replace("_", " ") },
        { key: "act", label: "", cls: "n", render: (r) => <button type="button" className="btn btn-sm" onClick={() => api.del(`/hr/holidays/${r.id}`).then(load)}>Remove</button> },
      ]} />
    </section>
  );
}

/* ---------------- contributions + tax ---------------- */
function Contributions({ lk, onNew }) {
  const [monthly, setMonthly] = useState(25000);
  const [preview, setPreview] = useState(null);
  const [freq, setFreq] = useState("semi_monthly");
  const [tax, setTax] = useState([]);
  useEffect(() => {
    const id = setTimeout(() => api.get(`/hr/contribution-preview?monthly=${Number(monthly) || 0}`).then(setPreview).catch(() => setPreview(null)), 300);
    return () => clearTimeout(id);
  }, [monthly]);
  useEffect(() => { api.get(`/hr/withholding-tax?frequency=${freq}`).then(setTax).catch(() => setTax([])); }, [freq]);

  return (
    <>
      <section className="card hr-section">
        <header className="hr-section-head">
          <div><h5>SSS · PhilHealth · Pag-IBIG</h5><span className="hr-muted">A new rate applies from its date; old rates stay as history.</span></div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>New rate</button>
        </header>
        <DataTable loading={!lk} rows={lk?.contributions || []} cols={[
          { key: "type", label: "Type" },
          { key: "effective_from", label: "From", render: (r) => fmtDate(r.effective_from) },
          { key: "ee_rate", label: "Employee", cls: "n", render: (r) => pct(r.ee_rate) },
          { key: "er_rate", label: "Employer", cls: "n", render: (r) => pct(r.er_rate) },
          { key: "salary_floor", label: "Floor", cls: "n", money: true },
          { key: "salary_ceiling", label: "Ceiling", cls: "n", render: (r) => (r.salary_ceiling ? n2(r.salary_ceiling) : "—") },
          { key: "remarks", label: "Remarks", cls: "wrap" },
        ]} />
      </section>

      <div className="hr-grid">
        <section className="card hr-section">
          <header className="hr-section-head">
            <div><h5>Calculator</h5><span className="hr-muted">Monthly contributions for a salary</span></div>
            <Field label="Monthly salary"><input type="number" className="input" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
          </header>
          <DataTable rows={preview ? ["SSS", "PHILHEALTH", "PAGIBIG"].map((k) => ({ id: k, type: k, ...preview[k] })) : []} cols={[
            { key: "type", label: "Type" },
            { key: "base", label: "Salary base", cls: "n", money: true },
            { key: "ee", label: "Employee", cls: "n", money: true },
            { key: "er", label: "Employer", cls: "n", money: true },
            { key: "ec", label: "EC", cls: "n", money: true },
          ]} totals={["ee", "er", "ec"]} />
        </section>
        <section className="card hr-section">
          <header className="hr-section-head">
            <div><h5>Withholding tax (BIR)</h5><span className="hr-muted">Tax = base + rate × (taxable − over)</span></div>
            <Field label="Frequency">
              <select className="input" value={freq} onChange={(e) => setFreq(e.target.value)}>
                <option value="semi_monthly">Semi-monthly</option>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </Field>
          </header>
          <DataTable rows={tax} cols={[
            { key: "compensation_from", label: "Over", cls: "n", money: true },
            { key: "compensation_to", label: "Up to", cls: "n", render: (r) => (r.compensation_to ? n2(r.compensation_to) : "and above") },
            { key: "base_tax", label: "Base tax", cls: "n", money: true },
            { key: "rate_over", label: "Rate", cls: "n", render: (r) => pct(r.rate_over, 0) },
          ]} />
        </section>
      </div>
    </>
  );
}

function ContributionModal({ onClose, onDone, onFail }) {
  const [f, set] = useForm({
    type: "SSS", effective_from: todayPH(), ee_rate: "", er_rate: "", salary_floor: "", salary_ceiling: "", bracket_step: "",
    low_salary_limit: "", low_ee_rate: "", ec_threshold: "", ec_low: "", ec_high: "", remarks: "",
  });
  const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? null : v]));
  return (
    <Modal title="New contribution rate" onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={f.ee_rate === "" || f.er_rate === ""} onClick={() => api.post("/hr/contribution-settings", body).then((r) => onDone(r.message)).catch(onFail)}>Save</button></>}>
      <p className="hr-note">Rates are decimals: 0.05 = 5%. Fields that do not apply to the type can be left empty.</p>
      <div className="hr-form">
        <Field label="Type">
          <select className="input" value={f.type} onChange={set("type")}>
            <option value="SSS">SSS</option><option value="PHILHEALTH">PhilHealth</option><option value="PAGIBIG">Pag-IBIG</option>
          </select>
        </Field>
        <Field label="Effective from"><input type="date" className="input" value={f.effective_from} onChange={set("effective_from")} /></Field>
        <Field label="Employee rate"><input type="number" step="0.0001" className="input" value={f.ee_rate} onChange={set("ee_rate")} /></Field>
        <Field label="Employer rate"><input type="number" step="0.0001" className="input" value={f.er_rate} onChange={set("er_rate")} /></Field>
        <Field label="Salary floor"><input type="number" className="input" value={f.salary_floor} onChange={set("salary_floor")} /></Field>
        <Field label="Salary ceiling"><input type="number" className="input" value={f.salary_ceiling} onChange={set("salary_ceiling")} /></Field>
        {f.type === "SSS" && (
          <>
            <Field label="MSC step" hint="500"><input type="number" className="input" value={f.bracket_step} onChange={set("bracket_step")} /></Field>
            <Field label="EC threshold" hint="MSC below this pays EC low"><input type="number" className="input" value={f.ec_threshold} onChange={set("ec_threshold")} /></Field>
            <Field label="EC low"><input type="number" className="input" value={f.ec_low} onChange={set("ec_low")} /></Field>
            <Field label="EC high"><input type="number" className="input" value={f.ec_high} onChange={set("ec_high")} /></Field>
          </>
        )}
        {f.type === "PAGIBIG" && (
          <>
            <Field label="Low salary limit" hint="1,500"><input type="number" className="input" value={f.low_salary_limit} onChange={set("low_salary_limit")} /></Field>
            <Field label="Low employee rate" hint="0.01"><input type="number" step="0.0001" className="input" value={f.low_ee_rate} onChange={set("low_ee_rate")} /></Field>
          </>
        )}
        <Field label="Remarks" wide><input className="input" value={f.remarks} onChange={set("remarks")} placeholder="e.g. SSS Circular 2025-xxx" /></Field>
      </div>
    </Modal>
  );
}