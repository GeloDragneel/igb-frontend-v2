// HR → Payroll: cut-off runs (draft → computed → approved → released), every employee's pay, payslip
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { exportCsv } from "../../utils/exportRows";
import { Badge, DataTable, Field, PageHead, Stat, api, fmtDate, n2, todayPH, useForm } from "./HRShared";
import "./Payroll.css";
import SupervisorOverride from "./SupervisorOverride";

const nameOf = (e) => (e ? `${e.last_name}, ${e.first_name}` : "—");

/* SSS / PhilHealth / Pag-IBIG share a cut-off deducts */
export const SHARES = [["0", "Not deducted"], ["0.5", "Half of the month"], ["1", "Whole month"]];
export const BENEFITS = [["sss_share", "SSS"], ["philhealth_share", "PhilHealth"], ["pagibig_share", "Pag-IBIG"]];
export const shareText = (v) => (Number(v) >= 1 ? "whole" : Number(v) > 0 ? "half" : "none");
export const benefitsText = (r) => BENEFITS.map(([k, l]) => `${l} ${shareText(r[k] ?? (r.deduct_contributions ? 1 : 0))}`).join(" · ");
export const dayText = (d) => (Number(d) >= 31 ? "end of month" : `day ${d}`);

/** period of a cut-off for a month ("2026-10" = the month the period ENDS) — same rule as PayrollCutoff::period() */
export function cutoffPeriod(c, month) {
  if (!c || !/^\d{4}-\d{2}$/.test(month || "")) return null;
  const [y, m] = month.split("-").map(Number);
  const dim = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const ymd = (yy, mm, dd) => `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  let fy = y;
  let fm = m;
  if (Number(c.end_day) < Number(c.start_day)) { fm = m - 1; if (fm === 0) { fm = 12; fy = y - 1; } }
  const to = ymd(y, m, Math.min(Number(c.end_day), dim(y, m)));
  const pay = new Date(`${to}T00:00:00Z`);
  pay.setUTCDate(pay.getUTCDate() + Number(c.pay_days_after || 0));
  return { period_from: ymd(fy, fm, Math.min(Number(c.start_day), dim(fy, fm))), period_to: to, pay_date: pay.toISOString().slice(0, 10) };
}

export default function Payroll() {
  const notify = useToast();
  const [year, setYear] = useState(Number(todayPH().slice(0, 4)));
  const [runs, setRuns] = useState(null);
  const [runId, setRunId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [cutoffs, setCutoffs] = useState([]);
  const loadCutoffs = useCallback(() => { api.get("/hr/payroll-cutoffs").then(setCutoffs).catch(() => setCutoffs([])); }, []);
  useEffect(() => { loadCutoffs(); }, [loadCutoffs]);

  const loadRuns = useCallback(() => {
    api.get(`/hr/payroll?year=${year}`).then((r) => {
      // latest first (newest period, then newest created) · cancelled ones at the bottom
      const list = [...r].sort((a, b) => (a.status === "cancelled") - (b.status === "cancelled")
        || String(b.period_from).localeCompare(String(a.period_from)) || b.id - a.id);
      setRuns(list);
      setRunId((cur) => (cur && list.some((x) => x.id === cur) ? cur : list[0]?.id || null));
    }).catch(() => setRuns([]));
  }, [year]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  // year · payroll · New payroll — shown at the top of the payroll card
  const picker = (
    <div className="pr-pick">
      <div className="pr-year">
        <button type="button" onClick={() => { setYear((y) => y - 1); setRunId(null); }} aria-label="Previous year">‹</button>
        <b>{year}</b>
        <button type="button" onClick={() => { setYear((y) => y + 1); setRunId(null); }} aria-label="Next year">›</button>
      </div>
      <select className="input pr-select" value={runId || ""} onChange={(e) => setRunId(Number(e.target.value))} aria-label="Payroll">
        {!runs?.length && <option value="">No payroll yet</option>}
        {(runs || []).map((r) => <option key={r.id} value={r.id}>{r.code} · {fmtDate(r.period_from)} – {fmtDate(r.period_to)} ({r.status})</option>)}
      </select>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>New payroll</button>
    </div>
  );

  return (
    <div className="hr">
      {runId
        ? <RunDetail id={runId} notify={notify} onChanged={loadRuns} picker={picker} />
        : (
          <section className="card hr-section pr-head">
            {picker}
            {runs && <p className="pr-none">No payroll in {year} yet. Click <b>New payroll</b> to create one for a cut-off.</p>}
          </section>
        )}

      {creating && (
        <CreateRun cutoffs={cutoffs} onClose={() => setCreating(false)}
          onDone={(r) => { notify(r.message); setCreating(false); setRunId(r.run.id); loadRuns(); }}
          onFail={(e) => notify(e.message || "Couldn't create.", "error")} />
      )}

    </div>
  );
}

/* supervisor actions: a supervisor does it directly, HR needs a supervisor override */
const SUPERVISOR_ACTIONS = {
  cancel: ["Cancel payroll", "The computed pay of every employee in this payroll is removed and the payroll is marked cancelled."],
  approve: ["Approve payroll", "Approving posts the loan deductions and locks the attendance."],
  "undo-approve": ["Undo approval", "The loan payments it posted are removed and the attendance is unlocked, so you can recompute."],
  "undo-release": ["Undo release", "The payroll goes back to approved."],
};

function RunDetail({ id, notify, onChanged, picker }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [slip, setSlip] = useState(null);
  const [q, setQ] = useState("");
  const [override, setOverride] = useState(null); // supervisor action waiting for username + password

  const load = useCallback(() => { setData(null); api.get(`/hr/payroll/${id}`).then(setData).catch(() => setData({ run: null, items: [] })); }, [id]);
  useEffect(() => { load(); }, [load]);

  const send = (what, method = "post", body = {}) => {
    setBusy(what);
    const url = `/hr/payroll/${id}/${what}`;
    return (method === "del" ? api.del(url) : api.post(url, body)).then((r) => { notify(r.message); setOverride(null); load(); onChanged(); })
      .catch((e) => notify(e.message || "Couldn't do that.", "error")).finally(() => setBusy(""));
  };
  const act = (what, method = "post") => {
    if (SUPERVISOR_ACTIONS[what]) { setOverride(what); return; } // always the supervisor login
    send(what, method);
  };
  const canEdit = true;
  const skips = (empId) => {
    const x = data?.exclusions?.[empId];
    if (!x) return "";
    const nLoans = (x.skip_loan_ids || []).length;
    return [x.skip_sss && "SSS", x.skip_philhealth && "PhilHealth", x.skip_pagibig && "Pag-IBIG", x.skip_loans && "loans", nLoans && `${nLoans} loan(s)`].filter(Boolean).join(", ");
  };

  const run = data?.run;
  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.items || []).filter((i) => !term || nameOf(i.employee).toLowerCase().includes(term));
  }, [data, q]);
  const sum = (k) => items.reduce((s, i) => s + (Number(i[k]) || 0), 0);

  const csv = () => exportCsv(`Payroll-${run.code}`, [
    { label: "Employee", value: (i) => nameOf(i.employee) }, { label: "Type", value: (i) => i.salary_type },
    { label: "Days worked", value: (i) => i.days_worked }, { label: "Absent", value: (i) => i.days_absent },
    ...[["basic_pay", "Basic"], ["ot_pay", "OT"], ["night_diff_pay", "Night diff"], ["holiday_pay", "Holiday"], ["leave_pay", "Leave"], ["allowance", "Allowance"],
    ["absent_deduction", "Absences"], ["late_undertime_deduction", "Late/UT"], ["gross_pay", "Gross"], ["sss_ee", "SSS"], ["philhealth_ee", "PhilHealth"],
    ["pagibig_ee", "Pag-IBIG"], ["withholding_tax", "Tax"], ["loan_deduction", "Loans"], ["net_pay", "Net pay"]]
      .map(([k, l]) => ({ label: l, money: true, value: (i) => i[k] })),
    { label: "Bank", value: (i) => i.bank_name }, { label: "Account", value: (i) => i.account_no },
  ], items);

  // the employee list fills the rest of the screen and scrolls by itself (the page does not)
  const listRef = useRef(null);
  useEffect(() => {
    const fit = () => {
      const el = listRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty("--pr-list-h", `${Math.max(240, window.innerHeight - top - 24)}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [data]);

  if (!data) return <section className="card hr-section pr-head">{picker}<p className="pr-none">Loading…</p></section>;
  if (!run) return <section className="card hr-section pr-head">{picker}<p className="pr-none">Payroll not found.</p></section>;

  return (
    <>
      <section className="card hr-section pr-head">
        {picker}
        <header className="pr-run">
          <div className="pr-run-info">
            <h5>{run.code} <Badge status={run.status} /></h5>
            <span>
              {fmtDate(run.period_from)} – {fmtDate(run.period_to)} · pay date {fmtDate(run.pay_date)} · {run.frequency.replace("_", "-")}
              {" · "}{benefitsText(run)}{run.deduct_loans ? " · with loans" : " · no loans"}
            </span>
          </div>
          <div className="pr-run-act">
            {canEdit && ["draft", "computed"].includes(run.status) && <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act("compute")}>{busy === "compute" ? "Computing…" : run.status === "draft" ? "Compute" : "Recompute"}</button>}
            {canEdit && run.status === "computed" && <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => act("approve")}>Approve</button>}
            {canEdit && run.status === "approved" && <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => act("undo-approve")}>Undo approval</button>}
            {canEdit && run.status === "approved" && <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act("release")}>Release</button>}
            {canEdit && run.status === "released" && <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => act("undo-release")}>Undo release</button>}
            {canEdit && ["draft", "computed"].includes(run.status) && <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => act("cancel")}>Cancel</button>}
            <button type="button" className="btn btn-sm" onClick={csv} disabled={!items.length}>CSV</button>
          </div>
        </header>
      </section>

      <div className="hr-stats">
        <Stat label="Employees" value={items.length} />
        <Stat label="Gross pay" value={n2(sum("gross_pay"))} />
        <Stat label="Deductions" value={n2(sum("total_deductions"))} sub={`Tax ${n2(sum("withholding_tax"))} · Loans ${n2(sum("loan_deduction"))}`} tone="is-orange" />
        <Stat label="Net pay" value={n2(sum("net_pay"))} tone="is-green" />
        <Stat label="Employer share" value={n2(sum("sss_er") + sum("sss_ec") + sum("philhealth_er") + sum("pagibig_er"))} sub="SSS + EC · PhilHealth · Pag-IBIG" />
      </div>

      <section className="card hr-section pr-list-card">
        <header className="pr-list-head">
          <h5>Employees <em>{items.length}</em></h5>
          <input className="input" type="search" placeholder="Search employee…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search employee" />
        </header>
        <div ref={listRef} className="pr-list">
          <DataTable rows={items} onRow={(i) => setSlip(i.id)} empty={run.status === "draft" ? "Click Compute to build this payroll." : "No employee."}
            totals={["basic_pay", "ot_pay", "night_diff_pay", "holiday_pay", "gross_pay", "sss_ee", "philhealth_ee", "pagibig_ee", "withholding_tax", "loan_deduction", "net_pay"]}
            cols={[
              { key: "employee", label: "Employee", render: (i) => <><b>{nameOf(i.employee)}</b><span className="hr-sub">{i.salary_type} · {n2(i.salary_type === "monthly" ? i.monthly_rate : i.daily_rate)}{skips(i.employee_id) ? ` · no ${skips(i.employee_id)}` : ""}</span></> },
              { key: "days_worked", label: "Days", cls: "n", render: (i) => <>{Number(i.days_worked)}{Number(i.days_absent) > 0 && <span className="hr-sub">{Number(i.days_absent)} absent</span>}</> },
              { key: "basic_pay", label: "Basic", cls: "n", money: true },
              { key: "ot_pay", label: "OT", cls: "n", money: true },
              { key: "night_diff_pay", label: "Night diff", cls: "n", money: true },
              { key: "holiday_pay", label: "Holiday", cls: "n", money: true },
              { key: "gross_pay", label: "Gross", cls: "n", render: (i) => <b>{n2(i.gross_pay)}</b> },
              { key: "sss_ee", label: "SSS", cls: "n", money: true },
              { key: "philhealth_ee", label: "PhilHealth", cls: "n", money: true },
              { key: "pagibig_ee", label: "Pag-IBIG", cls: "n", money: true },
              { key: "withholding_tax", label: "Tax", cls: "n", money: true },
              { key: "loan_deduction", label: "Loans", cls: "n", money: true },
              { key: "net_pay", label: "Net pay", cls: "n", render: (i) => <b>{n2(i.net_pay)}</b> },
            ]} />
        </div>
      </section>

      {slip && (
        <Payslip id={slip} run={run} exclusions={data.exclusions || {}} canEdit={canEdit && ["draft", "computed"].includes(run.status)} notify={notify}
          onSaved={() => { setSlip(null); load(); onChanged(); }} onClose={() => setSlip(null)} />
      )}
      {override && (
        <SupervisorOverride title={`${SUPERVISOR_ACTIONS[override][0]} · ${run.code}`} message={SUPERVISOR_ACTIONS[override][1]} confirmLabel={SUPERVISOR_ACTIONS[override][0]}
          onSubmit={(cred) => send(override, "post", cred)} onClose={() => setOverride(null)} />
      )}
    </>
  );
}

/* benefit switches on the payslip: only the ones this cut-off deducts */
const SKIPS = [["skip_sss", "SSS", "sss_share"], ["skip_philhealth", "PhilHealth", "philhealth_share"], ["skip_pagibig", "Pag-IBIG", "pagibig_share"]];
const shareOfRun = (run, key) => Number(run?.[key] ?? (run?.deduct_contributions ? 1 : 0));
/** "10 days × 575.08" · "2 h × 89.84" · "35 min" */
const qtyText = (l) => {
  const q = Number(l.quantity);
  const unit = ["BASIC", "LEAVE", "RH_UNWORKED", "ABSENT"].includes(l.code) ? (q === 1 ? "day" : "days") : l.code === "LATE_UT" ? "min" : "h";
  return l.rate != null && Number(l.rate) > 0 && unit !== "min" ? `${q} ${unit} × ${n2(l.rate)}` : `${q} ${unit}`;
};

/* absences and late are taken out of the gross, so the payslip shows them under earnings */
const LESS_GROSS = ["ABSENT", "LATE_UT"];

function Payslip({ id, run, exclusions, canEdit, notify, onSaved, onClose }) {
  const [s, setS] = useState(null);
  const [skip, setSkip] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get(`/hr/payroll/items/${id}`).then(setS).catch(() => setS(false)); }, [id]);
  useEffect(() => {
    if (!s) return;
    const x = exclusions[s.employee_id] || {};
    setSkip({ ...Object.fromEntries(SKIPS.map(([k]) => [k, !!x[k]])), skip_loan_ids: (x.skip_loan_ids || []).map(Number) });
  }, [s, exclusions]);
  const benefits = SKIPS.filter(([, , share]) => shareOfRun(run, share) > 0);
  const loans = s?.loan_dues || [];
  const toggleLoan = (id, on) => setSkip((p) => ({ ...p, skip_loan_ids: on ? p.skip_loan_ids.filter((x) => x !== id) : [...p.skip_loan_ids, id] }));
  const saveSkip = () => {
    setSaving(true);
    api.post(`/hr/payroll/${run.id}/exclusions`, { employee_id: s.employee_id, ...skip, skip_loans: false })
      .then((r) => { notify(r.message); onSaved(); })
      .catch((e) => notify(e.message || "Couldn't save.", "error"))
      .finally(() => setSaving(false));
  };
  const lines = (kind) => (s?.lines || []).filter((l) => (kind === "earning"
    ? l.kind === "earning" || (l.kind === "deduction" && LESS_GROSS.includes(l.code))
    : l.kind === kind && !LESS_GROSS.includes(l.code)));
  return (
    <Modal title={s ? `Payslip · ${nameOf(s.employee)}` : "Payslip"} onClose={onClose} size="lg"
      footer={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
      {s === null && <p className="hr-muted">Loading…</p>}
      {s === false && <p className="alert-error">Couldn't load the payslip.</p>}
      {s && (
        <div className="hr-entry">
          {/* summary */}
          <div className="hr-tiles">
            <div className="hr-tile"><small>Period</small><b>{fmtDate(s.run.period_from).replace(/, \d{4}$/, "")} – {fmtDate(s.run.period_to)}</b><span>pay date {fmtDate(s.run.pay_date)}</span></div>
            <div className="hr-tile"><small>Rate</small><b>{s.salary_type === "monthly" ? `${n2(s.monthly_rate)} / month` : `${n2(s.daily_rate)} / day`}</b><span>{s.salary_type === "monthly" ? "monthly-paid" : "daily-paid"}</span></div>
            <div className="hr-tile"><small>Days worked</small><b>{Number(s.days_worked)}</b><span>{Number(s.days_absent)} absent · {Number(s.days_paid_leave)} paid leave</span></div>
            <div className="hr-tile"><small>Bank</small><b>{s.bank_name || "—"}</b><span>{s.account_no || "No account"}</span></div>
          </div>
          <div className="hr-prof-ids">
            <span><small>SSS</small>{s.employee?.sss_no || "—"}</span>
            <span><small>PhilHealth</small>{s.employee?.phic_no || "—"}</span>
            <span><small>Pag-IBIG</small>{s.employee?.hdmf_no || "—"}</span>
            <span><small>TIN</small>{s.employee?.tin || "—"}</span>
          </div>

          {/* earnings · deductions */}
          <div className="hr-slip">
            {[["earning", "Earnings", s.gross_pay, "Gross pay"], ["deduction", "Deductions", s.total_deductions, "Total deductions"]].map(([kind, title, total, totalLabel]) => (
              <section key={kind} className="hr-slip-box">
                <h6>{title}</h6>
                {lines(kind).length === 0 && <p className="hr-blank">None</p>}
                <ul className="hr-slip-lines">
                  {lines(kind).map((l) => (
                    <li key={l.id}>
                      <span>{l.description}{l.quantity != null && kind === "earning" ? <small className="hr-sub">{qtyText(l)}</small> : null}</span>
                      <b>{LESS_GROSS.includes(l.code) ? `− ${n2(l.amount)}` : n2(l.amount)}</b>
                    </li>
                  ))}
                </ul>
                <div className="hr-slip-total"><span>{totalLabel}</span><b>{n2(total)}</b></div>
              </section>
            ))}
          </div>

          {/* deduct switches (before approval) */}
          {canEdit && skip && (benefits.length > 0 || loans.length > 0) && (
            <fieldset className="hr-entry-times hr-slip-skip">
              <legend>Deduct in this payroll · this employee only</legend>
              <div className="hr-slip-checks">
                {benefits.map(([k, l, share]) => (
                  <label key={k} className="hr-check">
                    <input type="checkbox" checked={!skip[k]} onChange={(e) => setSkip((p) => ({ ...p, [k]: !e.target.checked }))} />
                    {l}{shareOfRun(run, share) < 1 ? " (half)" : ""} · {n2(s.benefit_amounts?.[share])}
                  </label>
                ))}
                {loans.map((d) => (
                  <label key={d.loan_id} className="hr-check">
                    <input type="checkbox" checked={!skip.skip_loan_ids.includes(Number(d.loan_id))} onChange={(e) => toggleLoan(Number(d.loan_id), e.target.checked)} />
                    Loan {d.reference_no} · {n2(d.amount)}
                  </label>
                ))}
              </div>
              <button type="button" className="btn btn-sm btn-primary" onClick={saveSkip} disabled={saving}>{saving ? "Saving…" : "Save & recompute"}</button>
              <span className="hr-hint">Untick to not deduct it in {run.code}. Everyone else keeps the cut-off setting.</span>
            </fieldset>
          )}

          {/* net pay */}
          <div className="hr-slip-net">
            <span>{n2(s.gross_pay)} gross − {n2(s.total_deductions)} deductions</span>
            <div><small>Net pay</small><b>{n2(s.net_pay)}</b></div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CreateRun({ cutoffs, onClose, onDone, onFail }) {
  const active = cutoffs.filter((c) => c.is_active);
  const today = todayPH();
  const thisMonth = today.slice(0, 7);
  const nextMonth = (() => { const d = new Date(`${thisMonth}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
  // the cut-off whose period has today (this month or next), else the first one
  const guess = (() => {
    for (const month of [thisMonth, nextMonth]) {
      const c = active.find((x) => { const p = cutoffPeriod(x, month); return p && p.period_from <= today && today <= p.period_to; });
      if (c) return { c, month };
    }
    return { c: active[0], month: thisMonth };
  })();
  const fromCutoff = (c, month) => {
    const p = cutoffPeriod(c, month) || {};
    return {
      cutoff_id: c ? String(c.id) : "", month, frequency: c?.frequency || "semi_monthly",
      period_from: p.period_from || today, period_to: p.period_to || today, pay_date: p.pay_date || today,
      sss_share: String(c?.sss_share ?? 0), philhealth_share: String(c?.philhealth_share ?? 0), pagibig_share: String(c?.pagibig_share ?? 0),
      deduct_loans: c ? !!c.deduct_loans : true,
    };
  };
  const [f, set, setF] = useForm({ ...fromCutoff(guess.c, guess.month), code: "", remarks: "" });
  const cut = active.find((x) => String(x.id) === f.cutoff_id);
  const autoCode = `PR-${(f.period_to || today).slice(0, 7)}-${cut ? cut.code : "…"}`;
  const pick = (id, month) => {
    const c = active.find((x) => String(x.id) === id);
    setF((p) => ({ ...p, ...(c ? fromCutoff(c, month) : { cutoff_id: "", month }) }));
  };
  const body = {
    ...f, code: f.code.trim() || null, cutoff_id: f.cutoff_id ? Number(f.cutoff_id) : null, month: f.cutoff_id ? f.month : null,
    sss_share: Number(f.sss_share), philhealth_share: Number(f.philhealth_share), pagibig_share: Number(f.pagibig_share),
  };
  return (
    <Modal title="New payroll" onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!f.period_from || !f.period_to || f.period_to < f.period_from} onClick={() => api.post("/hr/payroll", body).then(onDone).catch(onFail)}>Create</button></>}>
      {!active.length && <p className="hr-note is-warn">No cut-off yet. Add one in HR Settings → Payroll cut-offs, or use custom dates.</p>}
      <div className="hr-entry">
        <div className="hr-entry-row is-3">
          <Field label="Cut-off">
            <select className="input" value={f.cutoff_id} onChange={(e) => pick(e.target.value, f.month)}>
              {active.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              <option value="">Custom dates</option>
            </select>
          </Field>
          {f.cutoff_id
            ? <Field label="Month" hint="The month the period ends"><input type="month" className="input" value={f.month} onChange={(e) => pick(f.cutoff_id, e.target.value)} /></Field>
            : (
              <Field label="Frequency">
                <select className="input" value={f.frequency} onChange={set("frequency")}>
                  <option value="semi_monthly">Semi-monthly</option><option value="monthly">Monthly</option><option value="weekly">Weekly</option>
                </select>
              </Field>
            )}
          <Field label="Payroll code" hint="Blank = automatic">
            <input className="input" value={f.code} maxLength={30} placeholder={autoCode}
              onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} />
          </Field>
        </div>

        <fieldset className="hr-entry-times is-3">
          <legend>Period</legend>
          <Field label="From"><input type="date" className="input" value={f.period_from} onChange={set("period_from")} /></Field>
          <Field label="To"><input type="date" className="input" value={f.period_to} onChange={set("period_to")} /></Field>
          <Field label="Pay date"><input type="date" className="input" value={f.pay_date} onChange={set("pay_date")} /></Field>
        </fieldset>

        <fieldset className="hr-entry-times">
          <legend>Deductions in this payroll</legend>
          {BENEFITS.map(([k, l]) => (
            <Field key={k} label={l}>
              <select className="input" value={f[k]} onChange={set(k)}>{SHARES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
            </Field>
          ))}
          <Field label="Loan dues">
            <select className="input" value={f.deduct_loans ? "1" : "0"} onChange={(e) => set("deduct_loans", e.target.value === "1")}>
              <option value="1">Deduct</option><option value="0">Not deducted</option>
            </select>
          </Field>
        </fieldset>

        <Field label="Remarks"><input className="input" value={f.remarks} onChange={set("remarks")} placeholder="Optional" /></Field>
      </div>
      <p className="hr-note"><b>{f.code || autoCode}</b> · {fmtDate(f.period_from)} – {fmtDate(f.period_to)} · pay date {fmtDate(f.pay_date)}. Deductions come from the cut-off setting; changes here apply to this payroll only.</p>
    </Modal>
  );
}

/* HR Settings → Payroll cut-offs: the days of each cut-off and which benefits it deducts */
export function PayrollCutoffs({ notify }) {
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null); // row, or {} for new
  const load = useCallback(() => { api.get("/hr/payroll-cutoffs").then(setRows).catch((e) => { notify(e.message || "Couldn't load the cut-offs.", "error"); setRows([]); }); }, [notify]);
  useEffect(() => { load(); }, [load]);
  const month = todayPH().slice(0, 7);
  return (
    <section className="card hr-section">
      <header className="hr-section-head">
        <div><h5>Payroll cut-offs</h5><span className="hr-muted">e.g. 11 – 25 and 26 – 10 · choose which cut-off deducts SSS, PhilHealth, Pag-IBIG and loans</span></div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({})}>New cut-off</button>
      </header>
      <DataTable loading={!rows} rows={rows || []} onRow={setEdit} empty="No cut-off yet." cols={[
        { key: "code", label: "Code", render: (c) => <><b>{c.code}</b>{!c.is_active && <span className="hr-sub">inactive</span>}</> },
        { key: "name", label: "Cut-off", render: (c) => <><b>{c.name}</b><span className="hr-sub">{dayText(c.start_day)} → {dayText(c.end_day)}{Number(c.end_day) < Number(c.start_day) ? " (next month)" : ""}</span></> },
        { key: "example", label: `Example (${month})`, render: (c) => { const p = cutoffPeriod(c, month); return p ? <>{fmtDate(p.period_from)} – {fmtDate(p.period_to)}<span className="hr-sub">pay {fmtDate(p.pay_date)}</span></> : "—"; } },
        ...BENEFITS.map(([k, l]) => ({ key: k, label: l, render: (c) => shareText(c[k]) })),
        { key: "deduct_loans", label: "Loans", render: (c) => (c.deduct_loans ? "yes" : "no") },
        { key: "act", label: "", cls: "n", render: (c) => <button type="button" className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setEdit(c); }}>Edit</button> },
      ]} />
      {edit && <CutoffModal row={edit.id ? edit : null} count={(rows || []).length} month={month} onClose={() => setEdit(null)}
        onDone={(m) => { notify(m); setEdit(null); load(); }} onFail={(e) => notify(e.message || "Couldn't save.", "error")} />}
    </section>
  );
}

function CutoffModal({ row, count, month, onClose, onDone, onFail }) {
  const [f, set] = useForm({
    code: row?.code || "", name: row?.name || "", frequency: row?.frequency || "semi_monthly",
    start_day: row?.start_day ?? 11, end_day: row?.end_day ?? 25, pay_days_after: row?.pay_days_after ?? 5,
    sss_share: String(Number(row?.sss_share ?? 0)), philhealth_share: String(Number(row?.philhealth_share ?? 0)), pagibig_share: String(Number(row?.pagibig_share ?? 0)),
    deduct_loans: row ? !!row.deduct_loans : true, is_active: row ? !!row.is_active : true, sort_order: row?.sort_order ?? count + 1,
  });
  const sample = cutoffPeriod(f, month);
  const save = () => {
    const body = {
      ...f, start_day: Number(f.start_day), end_day: Number(f.end_day), pay_days_after: Number(f.pay_days_after), sort_order: Number(f.sort_order) || 0,
      sss_share: Number(f.sss_share), philhealth_share: Number(f.philhealth_share), pagibig_share: Number(f.pagibig_share)
    };
    (row ? api.put(`/hr/payroll-cutoffs/${row.id}`, body) : api.post("/hr/payroll-cutoffs", body)).then((r) => onDone(r.message)).catch(onFail);
  };
  return (
    <Modal title={row ? `Cut-off ${row.code} · ${row.name}` : "New cut-off"} onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!f.code || !f.start_day || !f.end_day}>Save</button></>}>
      <div className="hr-form">
        <Field label="Code" hint={`End of the payroll code: PR-${month}-${f.code || "A"}`}>
          <input className="input" value={f.code} maxLength={20} placeholder="e.g. A or 1ST-CUT"
            onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} />
        </Field>
        <Field label="Name" hint="Blank = from the days"><input className="input" value={f.name} onChange={set("name")} placeholder="e.g. 11 – 25" /></Field>
        <Field label="Start day"><input type="number" min="1" max="31" className="input" value={f.start_day} onChange={set("start_day")} /></Field>
        <Field label="End day" hint="31 = end of the month · lower than start day = next month (26 – 10)"><input type="number" min="1" max="31" className="input" value={f.end_day} onChange={set("end_day")} /></Field>
        <Field label="Pay date" hint="Days after the period ends"><input type="number" min="0" max="31" className="input" value={f.pay_days_after} onChange={set("pay_days_after")} /></Field>
        <Field label="Frequency">
          <select className="input" value={f.frequency} onChange={set("frequency")}><option value="semi_monthly">Semi-monthly</option><option value="monthly">Monthly</option></select>
        </Field>
        {BENEFITS.map(([k, l]) => (
          <Field key={k} label={l}>
            <select className="input" value={f[k]} onChange={set(k)}>{SHARES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          </Field>
        ))}
        <Field label="Order"><input type="number" min="0" className="input" value={f.sort_order} onChange={set("sort_order")} /></Field>
        <label className="hr-check"><input type="checkbox" checked={f.deduct_loans} onChange={set("deduct_loans")} /> Deduct loan dues</label>
        <label className="hr-check"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active</label>
      </div>
      {sample && <p className="hr-note">For {month}: {fmtDate(sample.period_from)} – {fmtDate(sample.period_to)} · pay date {fmtDate(sample.pay_date)} · {benefitsText(f)}</p>}
    </Modal>
  );
}