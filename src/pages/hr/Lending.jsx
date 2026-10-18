// Lending: investments (invest / top up / cash out anytime), loans (apply → approve → release → pay), members, settings
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import SearchSelect from "../../components/SearchSelect";
import { Badge, DataTable, EmployeeSelect, Field, Pager, Stat, Tabs, api, fmtDate, n2, pct, todayPH, useForm, usePaged } from "./HRShared";
import "./Lending.css";

const RATE_LABEL = { per_day: "per day", per_month: "per month", fixed: "fixed" };
const rateText = (r) => (r.interest_type === "fixed" ? `${n2(r.fixed_interest)} fixed` : `${pct(r.interest_rate, 3)} ${RATE_LABEL[r.interest_type]}`);

export default function Lending() {
  const notify = useToast();
  const [tab, setTab] = useState("investments");
  const [summary, setSummary] = useState(null);
  const [lk, setLk] = useState({ members: [], settings: [] });
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    api.get("/lending/summary").then(setSummary).catch(() => { });
    Promise.all([api.get("/lending/members"), api.get("/hr/lookups")])
      .then(([members, l]) => setLk({ members, settings: l.lending })).catch(() => { });
  }, [tick]);

  const ctx = { notify, lk, refresh, tick };
  return (
    <div className="hr">
      <div className="hr-stats">
        <Stat label="Active investments" value={n2(summary?.active_investments)} />
        <Stat label="Interest owed to investors" value={n2(summary?.interest_owed_to_investors)} tone="is-orange" />
        <Stat label="Loans outstanding" value={n2(summary?.loans_outstanding)} tone="is-red" />
        <Stat label="Loan interest earned" value={n2(summary?.loan_interest_earned)} tone="is-green" />
        <Stat label="Cash on hand" value={n2(summary?.cash_on_hand)} sub="invested − cashed out − released + collected" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[["investments", "Investments"], ["loans", "Loans"], ["members", "Members"], ["settings", "Settings"]]} />
      {tab === "investments" && <Investments {...ctx} />}
      {tab === "loans" && <Loans {...ctx} />}
      {tab === "members" && <Members {...ctx} />}
      {tab === "settings" && <Settings {...ctx} />}
    </div>
  );
}

const fail = (notify) => (e) => notify(e.message || "Couldn't save.", "error");

/* members + active employees (an employee becomes a member on his first investment / loan) · value = row.key ("m12" member, "e34" employee) */
function MemberSelect({ members, value, onChange }) {
  const options = members.filter((m) => m.is_active).map((m) => ({
    value: m.key, label: `${m.name} · ${m.member_type === "employee" ? "Employee" : "Outside"}`,
  }));
  return <SearchSelect value={value} onChange={(v) => onChange(v ? String(v) : "")} options={options} searchPlaceholder="Search employee or member..." aria-label="Member" />;
}
const who = (key) => (String(key).startsWith("e") ? { employee_id: Number(String(key).slice(1)), member_id: null } : { member_id: Number(String(key).slice(1)), employee_id: null });

/** section toolbar: filters, search and the main button on ONE line */
function SectionBar({ children }) {
  return <header className="ln-head">{children}</header>;
}

/** filter chips: [[value, label, count?]] */
function Chips({ value, onChange, options, label }) {
  return (
    <div className="ln-chips" role="radiogroup" aria-label={label}>
      {options.map(([v, l, n]) => (
        <button key={l} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>
          {l}{n !== undefined && <em>{n}</em>}
        </button>
      ))}
    </div>
  );
}

/* =====================================================================
   INVESTMENTS
   ===================================================================== */
function Investments({ notify, lk, refresh, tick }) {
  const [status, setStatus] = useState("active");
  const [rows, setRows] = useState(null);
  const [modal, setModal] = useState(null);
  useEffect(() => { setRows(null); api.get(`/lending/investments${status ? `?status=${status}` : ""}`).then(setRows).catch(() => setRows([])); }, [status, tick]);
  const done = (msg) => { notify(msg); setModal(null); refresh(); };

  return (
    <section className="card hr-section">
      <SectionBar>
        <Chips label="Status" value={status} onChange={setStatus} options={[["active", "Active"], ["closed", "Closed"], ["", "All"]]} />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ type: "invest" })}>New investment</button>
      </SectionBar>
      <DataTable loading={!rows} rows={rows || []} onRow={(r) => setModal({ type: "view", id: r.id })}
        cols={[
          { key: "reference_no", label: "Ref #", render: (r) => <><b>{r.reference_no}</b><span className="hr-sub">{fmtDate(r.date_invested)}</span></> },
          { key: "member", label: "Investor", render: (r) => r.member?.name },
          { key: "rate", label: "Interest", render: rateText },
          { key: "principal_balance", label: "Invested", cls: "n", money: true },
          { key: "earned", label: "Earned to date", cls: "n", render: (r) => (r.today ? n2(r.today.interest_earned) : n2(r.total_interest_earned)) },
          { key: "value", label: "Cash-out value today", cls: "n", render: (r) => (r.today ? <b>{n2(r.today.cashout_value)}</b> : "—") },
          { key: "lock", label: "", render: (r) => (r.today?.in_lock_in ? <span className="hr-sub">lock-in until {fmtDate(r.today.lock_in_ends)}</span> : null) },
          { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> },
        ]} />
      {modal?.type === "invest" && <InvestModal lk={lk} onClose={() => setModal(null)} onDone={done} onFail={fail(notify)} />}
      {modal?.type === "view" && <InvestmentView id={modal.id} notify={notify} onClose={() => setModal(null)} onChanged={refresh} />}
    </section>
  );
}

function InvestModal({ lk, onClose, onDone, onFail }) {
  const settings = lk.settings.filter((s) => s.applies_to === "investment" && s.is_active);
  const def = settings.find((s) => s.is_default) || settings[0];
  const [f, set, setF] = useForm({
    member_id: "", amount: "", date_invested: todayPH(), lending_setting_id: def ? String(def.id) : "",
    interest_type: def?.interest_type || "per_month", interest_rate: def?.interest_rate ?? 0.01, fixed_interest: def?.fixed_interest ?? 0, lock_in_days: def?.lock_in_days ?? 0,
  });
  const pick = (id) => {
    const s = settings.find((x) => String(x.id) === id);
    setF((p) => ({ ...p, lending_setting_id: id, ...(s && { interest_type: s.interest_type, interest_rate: s.interest_rate, fixed_interest: s.fixed_interest, lock_in_days: s.lock_in_days }) }));
  };
  const amt = Number(f.amount) || 0;
  const month = f.interest_type === "per_day" ? amt * f.interest_rate * 30 : f.interest_type === "per_month" ? amt * f.interest_rate : 0;
  return (
    <Modal title="New investment" onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!f.member_id || !(amt > 0)}
        onClick={() => api.post("/lending/investments", { ...f, ...who(f.member_id), lending_setting_id: f.lending_setting_id ? Number(f.lending_setting_id) : null }).then((r) => onDone(r.message)).catch(onFail)}>Save</button></>}>
      <div className="hr-form">
        <Field label="Investor" wide><MemberSelect members={lk.members} value={f.member_id} onChange={(v) => set("member_id", v)} /></Field>
        <Field label="Amount"><input type="number" min="1" className="input" value={f.amount} onChange={set("amount")} /></Field>
        <Field label="Date invested"><input type="date" className="input" value={f.date_invested} onChange={set("date_invested")} /></Field>
        <Field label="Plan">
          <select className="input" value={f.lending_setting_id} onChange={(e) => pick(e.target.value)}>
            <option value="">Custom</option>
            {settings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Interest">
          <select className="input" value={f.interest_type} onChange={set("interest_type")}>
            <option value="per_month">Per month</option><option value="per_day">Per day</option><option value="fixed">Fixed amount</option>
          </select>
        </Field>
        {f.interest_type === "fixed"
          ? <Field label="Fixed interest"><input type="number" min="0" className="input" value={f.fixed_interest} onChange={set("fixed_interest")} /></Field>
          : <Field label="Rate" hint="0.01 = 1%"><input type="number" step="0.0001" min="0" className="input" value={f.interest_rate} onChange={set("interest_rate")} /></Field>}
        <Field label="Lock-in days" hint="Cash-out before this = no interest"><input type="number" min="0" className="input" value={f.lock_in_days} onChange={set("lock_in_days")} /></Field>
      </div>
      {amt > 0 && f.interest_type !== "fixed" && (
        <p className="hr-note">Earns about <b>{n2(month)}</b> every 30 days ({n2(month / 30)} a day) while invested. Cash out anytime: interest is counted to the day.</p>
      )}
    </Modal>
  );
}

function InvestmentView({ id, notify, onClose, onChanged }) {
  const [asOf, setAsOf] = useState(todayPH());
  const [data, setData] = useState(null);
  const [mode, setMode] = useState(null); // top-up | cashout
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayPH());
  const load = useCallback(() => { api.get(`/lending/investments/${id}?as_of=${asOf}`).then(setData).catch(() => setData(false)); }, [id, asOf]);
  useEffect(() => { load(); }, [load]);

  const submit = () => {
    const url = `/lending/investments/${id}/${mode === "top-up" ? "top-up" : "cashout"}`;
    api.post(url, { amount: amount === "" ? null : Number(amount), date })
      .then((r) => { notify(r.message); setMode(null); setAmount(""); load(); onChanged(); })
      .catch(fail(notify));
  };
  const inv = data?.investment;
  const p = data?.preview;
  return (
    <Modal title={inv ? `${inv.reference_no} · ${inv.member?.name}` : "Investment"} onClose={onClose} size="xl"
      footer={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
      {!data && <p className="hr-muted">Loading…</p>}
      {inv && (
        <>
          <div className="hr-kv">
            <div><span>Interest</span><b>{rateText(inv)}</b></div>
            <div><span>Invested since</span><b>{fmtDate(inv.date_invested)}</b></div>
            <div><span>Total put in</span><b>{n2(inv.total_invested)}</b></div>
            <div><span>Total cashed out</span><b>{n2(inv.total_cashed_out)}</b></div>
            <div><span>Principal now</span><b>{n2(inv.principal_balance)}</b></div>
            <div><span>Status</span><b><Badge status={inv.status} /></b></div>
          </div>

          {inv.status === "active" && p && (
            <>
              <div className="hr-form">
                <Field label="If cashed out on"><input type="date" className="input" value={asOf} min={String(inv.last_accrual_date).slice(0, 10)} onChange={(e) => setAsOf(e.target.value)} /></Field>
              </div>
              <div className="hr-kv">
                <div><span>Days invested</span><b>{p.days_invested}</b></div>
                <div><span>Interest earned</span><b>{n2(p.interest_earned)}</b></div>
                <div className="is-big"><span>Cash-out value</span><b>{n2(p.cashout_value)}</b></div>
              </div>
              {p.in_lock_in && <p className="hr-note is-warn">Still in the lock-in until {fmtDate(p.lock_in_ends)}: cashing out now pays the principal only.</p>}

              {!mode && (
                <div className="hr-actions">
                  <button type="button" className="btn" onClick={() => { setMode("top-up"); setDate(todayPH()); }}>Top up</button>
                  <button type="button" className="btn btn-primary" onClick={() => { setMode("cashout"); setDate(asOf); }}>Cash out</button>
                </div>
              )}
              {mode && (
                <div className="hr-form">
                  <Field label={mode === "top-up" ? "Top-up amount" : "Cash-out amount"} hint={mode === "cashout" ? "Empty = everything (closes the investment)" : ""}>
                    <input type="number" min="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </Field>
                  <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                  <div className="hr-actions">
                    <button type="button" className="btn" onClick={() => setMode(null)}>Back</button>
                    <button type="button" className="btn btn-primary" onClick={submit} disabled={mode === "top-up" && !(Number(amount) > 0)}>
                      {mode === "top-up" ? "Save top-up" : amount ? `Cash out ${n2(amount)}` : "Cash out everything"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <h6 className="hr-muted">Statement</h6>
          <DataTable rows={inv.transactions || []} cols={[
            { key: "txn_date", label: "Date", render: (t) => fmtDate(t.txn_date) },
            { key: "txn_type", label: "Type", render: (t) => t.txn_type.replace(/_/g, " ") },
            { key: "remarks", label: "Details", cls: "wrap", render: (t) => <>{t.remarks}{t.days ? <span className="hr-sub">{t.days} day(s)</span> : null}</> },
            { key: "amount", label: "Amount", cls: "n", money: true },
            { key: "principal_after", label: "Principal", cls: "n", money: true },
            { key: "interest_after", label: "Interest", cls: "n", money: true },
          ]} />
        </>
      )}
    </Modal>
  );
}

/* =====================================================================
   LOANS
   ===================================================================== */
function Loans({ notify, lk, refresh, tick }) {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState(null);
  const [modal, setModal] = useState(null);
  useEffect(() => { setRows(null); api.get(`/lending/loans${status ? `?status=${status}` : ""}`).then(setRows).catch(() => setRows([])); }, [status, tick]);
  const done = (msg) => { notify(msg); setModal(null); refresh(); };

  return (
    <section className="card hr-section">
      <SectionBar>
        <Chips label="Status" value={status} onChange={setStatus}
          options={[["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["released", "Released"], ["paid", "Paid"], ["rejected", "Rejected"], ["cancelled", "Cancelled"]]} />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ type: "apply" })}>New loan</button>
      </SectionBar>
      <DataTable loading={!rows} rows={rows || []} onRow={(r) => setModal({ type: "view", id: r.id })} totals={["principal", "total_payable", "total_paid", "balance"]}
        cols={[
          { key: "reference_no", label: "Ref #", render: (r) => <><b>{r.reference_no}</b><span className="hr-sub">{r.date_released ? fmtDate(r.date_released) : "not released"}</span></> },
          { key: "member", label: "Borrower", render: (r) => r.member?.name },
          { key: "rate", label: "Interest", render: rateText },
          { key: "term", label: "Term", render: (r) => `${r.term_months} mo · ${r.due_frequency === "semi_monthly" ? "every cut-off" : "monthly"}` },
          { key: "principal", label: "Principal", cls: "n", money: true },
          { key: "total_payable", label: "Payable", cls: "n", money: true },
          { key: "amount_per_due", label: "Per due", cls: "n", money: true },
          { key: "total_paid", label: "Paid", cls: "n", money: true },
          { key: "balance", label: "Balance", cls: "n", money: true },
          { key: "deduction_mode", label: "Pay by", render: (r) => (r.deduction_mode === "payroll" ? "Payroll" : "Manual") },
          { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> },
        ]} />
      {modal?.type === "apply" && <LoanApply lk={lk} onClose={() => setModal(null)} onDone={done} onFail={fail(notify)} />}
      {modal?.type === "view" && <LoanView id={modal.id} notify={notify} onClose={() => setModal(null)} onChanged={refresh} />}
    </section>
  );
}

function LoanApply({ lk, onClose, onDone, onFail }) {
  const settings = lk.settings.filter((s) => s.applies_to === "loan" && s.is_active);
  const def = settings.find((s) => s.is_default) || settings[0];
  const [f, set, setF] = useForm({
    member_id: "", lending_setting_id: def ? String(def.id) : "", principal: "", term_months: 6,
    interest_type: def?.interest_type || "per_month", interest_rate: def?.interest_rate ?? 0.02, fixed_interest: def?.fixed_interest ?? 0,
    penalty_rate_per_day: def?.penalty_rate_per_day ?? 0, due_frequency: "monthly", deduction_mode: "payroll", date_released: todayPH(), purpose: "",
  });
  const [preview, setPreview] = useState(null);
  const member = lk.members.find((m) => m.key === f.member_id);
  const pick = (id) => {
    const s = settings.find((x) => String(x.id) === id);
    setF((p) => ({ ...p, lending_setting_id: id, ...(s && { interest_type: s.interest_type, interest_rate: s.interest_rate, fixed_interest: s.fixed_interest, penalty_rate_per_day: s.penalty_rate_per_day }) }));
  };
  const body = { ...f, ...who(f.member_id), lending_setting_id: f.lending_setting_id ? Number(f.lending_setting_id) : null, term_months: Number(f.term_months), principal: Number(f.principal) };

  useEffect(() => {
    if (!(Number(f.principal) > 0) || !(Number(f.term_months) > 0)) { setPreview(null); return undefined; }
    const id = setTimeout(() => api.post("/lending/loans/preview", body).then(setPreview).catch(() => setPreview(null)), 300);
    return () => clearTimeout(id);
  }, [f.principal, f.term_months, f.interest_type, f.interest_rate, f.fixed_interest, f.due_frequency, f.date_released]); // eslint-disable-line react-hooks/exhaustive-deps

  // rates are kept as decimals (0.02); the form shows them as % (2)
  const asPct = (v) => (v === "" || v === null || v === undefined ? "" : String(Number((Number(v) * 100).toFixed(4))));
  const fromPct = (k) => (e) => set(k, e.target.value === "" ? "" : Number(e.target.value) / 100);
  const outside = member && member.member_type !== "employee";

  return (
    <Modal title="New loan" onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!f.member_id || !preview}
        onClick={() => api.post("/lending/loans", body).then((r) => onDone(r.message)).catch(onFail)}>Apply</button></>}>
      <div className="ln-apply">
        <div className="ln-form">
          <div className="ln-row is-2">
            <Field label="Borrower"><MemberSelect members={lk.members} value={f.member_id} onChange={(v) => set("member_id", v)} /></Field>
            <Field label="Loan type">
              <select className="input" value={f.lending_setting_id} onChange={(e) => pick(e.target.value)}>
                <option value="">Custom</option>
                {settings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>

          <fieldset className="ln-group">
            <legend>Amount</legend>
            <div className="ln-row is-3">
              <Field label="Principal"><input type="number" min="1" className="input" value={f.principal} onChange={set("principal")} placeholder="0.00" autoFocus /></Field>
              <Field label="Term (months)"><input type="number" min="1" className="input" value={f.term_months} onChange={set("term_months")} /></Field>
              <Field label="Release date"><input type="date" className="input" value={f.date_released} onChange={set("date_released")} /></Field>
            </div>
          </fieldset>

          <fieldset className="ln-group">
            <legend>Interest & penalty</legend>
            <div className="ln-row is-3">
              <Field label="Interest">
                <select className="input" value={f.interest_type} onChange={set("interest_type")}>
                  <option value="per_month">Per month</option><option value="per_day">Per day</option><option value="fixed">Fixed amount</option>
                </select>
              </Field>
              {f.interest_type === "fixed"
                ? <Field label="Fixed interest"><input type="number" min="0" step="0.01" className="input" value={f.fixed_interest} onChange={set("fixed_interest")} /></Field>
                : <Field label={`Rate (% ${f.interest_type === "per_day" ? "per day" : "per month"})`}><input type="number" step="0.01" min="0" className="input" value={asPct(f.interest_rate)} onChange={fromPct("interest_rate")} /></Field>}
              <Field label="Penalty (% per day)" hint="on the overdue amount"><input type="number" step="0.01" min="0" className="input" value={asPct(f.penalty_rate_per_day)} onChange={fromPct("penalty_rate_per_day")} /></Field>
            </div>
          </fieldset>

          <fieldset className="ln-group">
            <legend>Payment</legend>
            <div className="ln-row is-2">
              <Field label="Dues">
                <select className="input" value={f.due_frequency} onChange={set("due_frequency")}>
                  <option value="monthly">Monthly</option><option value="semi_monthly">Every cut-off (15th / end)</option>
                </select>
              </Field>
              <Field label="Pay by" hint={outside ? "Outside members pay manually" : ""}>
                <select className="input" value={outside ? "manual" : f.deduction_mode} onChange={set("deduction_mode")} disabled={outside}>
                  <option value="payroll">Payroll deduction</option><option value="manual">Manual payment</option>
                </select>
              </Field>
            </div>
          </fieldset>

          <Field label="Purpose"><input className="input" value={f.purpose} onChange={set("purpose")} placeholder="e.g. Tuition, house repair" /></Field>
        </div>

        {/* summary + schedule */}
        <aside className="ln-side">
          {!preview ? (
            <div className="ln-empty">Enter the principal and term to see the dues.</div>
          ) : (
            <>
              <div className="ln-due">
                <small>Per due · {preview.dues} dues</small>
                <b>{n2(preview.amount_per_due)}</b>
                <span>{fmtDate(preview.first_due_date)} – {fmtDate(preview.maturity_date)}</span>
              </div>
              <div className="ln-sum">
                <div><span>Principal</span><b>{n2(f.principal)}</b></div>
                <div><span>Interest</span><b>{n2(preview.interest)}</b></div>
                <div className="is-total"><span>Total payable</span><b>{n2(preview.total_payable)}</b></div>
              </div>
              <div className="ln-sched">
                <div className="ln-sched-head"><span>#</span><span>Due date</span><span>Amount</span></div>
                <div className="ln-sched-body">
                  {preview.schedule.map((r) => (
                    <div key={r.due_no}><span>{r.due_no}</span><span>{fmtDate(r.due_date)}</span><b>{n2(r.amount_due)}</b></div>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </Modal>
  );
}

function Schedule({ rows }) {
  return (
    <DataTable rows={rows} rowKey="due_no" totals={["principal_due", "interest_due", "amount_due", "amount_paid"]} cols={[
      { key: "due_no", label: "#", cls: "c" },
      { key: "due_date", label: "Due date", render: (s) => fmtDate(s.due_date) },
      { key: "principal_due", label: "Principal", cls: "n", money: true },
      { key: "interest_due", label: "Interest", cls: "n", money: true },
      { key: "amount_due", label: "Amount due", cls: "n", money: true },
      ...(rows[0] && "amount_paid" in rows[0] ? [
        { key: "penalty", label: "Penalty", cls: "n", money: true },
        { key: "amount_paid", label: "Paid", cls: "n", money: true },
        { key: "status", label: "Status", render: (s) => <Badge status={s.status} /> },
      ] : []),
    ]} />
  );
}

function LoanView({ id, notify, onClose, onChanged }) {
  const [loan, setLoan] = useState(null);
  const [pay, setPay] = useState({ amount: "", date: todayPH(), or_number: "", remarks: "" });
  const [releaseDate, setReleaseDate] = useState(todayPH());
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState("schedule");
  const load = useCallback(() => { api.get(`/lending/loans/${id}`).then(setLoan).catch(() => setLoan(false)); }, [id]);
  useEffect(() => { load(); }, [load]);
  const run = (p) => { setBusy(true); return p.then((r) => { notify(r.message); load(); onChanged(); return r; }).catch(fail(notify)).finally(() => setBusy(false)); };
  const decide = (action) => run(api.put(`/lending/loans/${id}/${action}`, { remarks }));

  const total = Number(loan?.total_payable) || 0;
  const paid = Number(loan?.total_paid) || 0;
  const interest = Math.max(0, total - (Number(loan?.principal) || 0));
  const dues = loan?.schedules || [];
  const nextDue = dues.find((d) => d.status !== "paid");

  return (
    <Modal title={loan ? `Loan ${loan.reference_no}` : "Loan"} onClose={onClose} size="lg"
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      {loan === null && <p className="hr-muted">Loading…</p>}
      {loan === false && <p className="hr-muted">Couldn't load this loan.</p>}
      {loan && (
        <div className="ln-view">
          {/* who + balance */}
          <section className="ln-hero">
            <div className="ln-hero-who">
              <small>Borrower</small>
              <b>{loan.member?.name || "—"}</b>
              <div className="ln-hero-tags">
                <Badge status={loan.status} />
                <span>{loan.deduction_mode === "payroll" ? "Payroll deduction" : "Manual payment"}</span>
                {loan.purpose && <span>{loan.purpose}</span>}
              </div>
            </div>
            <div className="ln-hero-bal">
              <small>Balance</small>
              <b>{n2(loan.balance)}</b>
              <progress className="ln-bar" max={total || 1} value={paid} />
              <span>{n2(paid)} paid of {n2(total)}</span>
            </div>
          </section>

          {/* the numbers */}
          <div className="ln-tiles">
            <div><small>Principal</small><b>{n2(loan.principal)}</b></div>
            <div><small>Interest</small><b>{n2(interest)}</b><span>{rateText(loan)}</span></div>
            <div><small>Term</small><b>{loan.term_months ? `${loan.term_months} mo.` : "—"}</b><span>{loan.due_frequency === "semi_monthly" ? "every cut-off" : "monthly dues"}</span></div>
            <div><small>{nextDue ? "Next due" : "Released"}</small><b>{nextDue ? n2(nextDue.amount_due) : loan.date_released ? fmtDate(loan.date_released) : "Not yet"}</b><span>{nextDue ? fmtDate(nextDue.due_date) : ""}</span></div>
          </div>

          {/* what to do now */}
          {loan.status === "pending" && (
            <section className="ln-act">
              <header><b>Waiting for approval</b><span>Approve to release the money later, or reject it.</span></header>
              <div className="ln-act-row">
                <Field label="Remarks"><input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" /></Field>
                <div className="ln-act-btns">
                  <button type="button" className="btn ln-danger" onClick={() => decide("cancel")} disabled={busy}>Cancel loan</button>
                  <button type="button" className="btn" onClick={() => decide("reject")} disabled={busy}>Reject</button>
                  <button type="button" className="btn btn-primary" onClick={() => decide("approve")} disabled={busy}>Approve</button>
                </div>
              </div>
            </section>
          )}
          {loan.status === "approved" && (
            <section className="ln-act">
              <header><b>Approved · ready to release</b><span>The due dates are counted from the release date.</span></header>
              <div className="ln-act-row">
                <Field label="Release date"><input type="date" className="input" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} /></Field>
                <div className="ln-act-btns">
                  <button type="button" className="btn ln-danger" onClick={() => decide("cancel")} disabled={busy}>Cancel loan</button>
                  <button type="button" className="btn btn-primary" onClick={() => run(api.post(`/lending/loans/${id}/release`, { date: releaseDate }))} disabled={busy}>Release money</button>
                </div>
              </div>
            </section>
          )}
          {loan.status === "released" && (
            <section className="ln-act">
              <header><b>Record a payment</b><span>{loan.deduction_mode === "payroll" ? "Dues are also deducted in payroll automatically." : "Paid over the counter."}</span></header>
              <div className="ln-act-row is-pay">
                <Field label="Amount"><input type="number" min="0.01" step="0.01" className="input" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder={nextDue ? n2(nextDue.amount_due) : "0.00"} /></Field>
                <Field label="Date"><input type="date" className="input" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
                <Field label="OR #"><input className="input" value={pay.or_number} onChange={(e) => setPay({ ...pay, or_number: e.target.value })} /></Field>
                <div className="ln-act-btns">
                  <button type="button" className="btn btn-primary" disabled={busy || !(Number(pay.amount) > 0)}
                    onClick={() => run(api.post(`/lending/loans/${id}/payments`, { ...pay, amount: Number(pay.amount) })).then((r) => r && setPay({ ...pay, amount: "", or_number: "" }))}>
                    Save payment
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* schedule / payments */}
          <div className="ln-lists">
            <div className="ln-seg" role="tablist">
              <button type="button" className={list === "schedule" ? "is-on" : ""} onClick={() => setList("schedule")}>Schedule ({dues.length})</button>
              <button type="button" className={list === "payments" ? "is-on" : ""} onClick={() => setList("payments")}>Payments ({loan.payments?.length || 0})</button>
            </div>
            {list === "schedule" && (dues.length === 0
              ? <p className="ln-none">The schedule is made when the money is released.</p>
              : <Schedule rows={dues} />)}
            {list === "payments" && (!loan.payments?.length
              ? <p className="ln-none">No payment yet.</p>
              : (
                <DataTable rows={loan.payments} totals={["amount", "penalty_paid"]} cols={[
                  { key: "payment_date", label: "Date", render: (p) => fmtDate(p.payment_date) },
                  { key: "source", label: "From", render: (p) => (p.source === "payroll" ? "Payroll" : "Manual") },
                  { key: "or_number", label: "OR #", render: (p) => p.or_number || "—" },
                  { key: "amount", label: "Amount", cls: "n", money: true },
                  { key: "penalty_paid", label: "Penalty", cls: "n", money: true },
                  { key: "remarks", label: "Remarks", cls: "wrap" },
                ]} />
              ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* =====================================================================
   MEMBERS + SETTINGS
   ===================================================================== */
function Members({ notify, lk, refresh }) {
  const [modal, setModal] = useState(null);
  const [show, setShow] = useState("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return lk.members
      .filter((m) => (show === "members" ? m.is_member : show === "employees" ? m.member_type === "employee" : show === "outside" ? m.member_type === "outside" : true))
      .filter((m) => !term || [m.name, m.contact_no, m.email].some((v) => String(v || "").toLowerCase().includes(term)));
  }, [lk.members, show, q]);
  const paged = usePaged(rows, `${show}|${q}`);
  const count = useMemo(() => ({
    all: lk.members.length,
    members: lk.members.filter((m) => m.is_member).length,
    employees: lk.members.filter((m) => m.member_type === "employee").length,
    outside: lk.members.filter((m) => m.member_type === "outside").length,
  }), [lk.members]);
  return (
    <section className="card hr-section">
      <SectionBar>
        <Chips label="Show" value={show} onChange={setShow} options={[
          ["all", "All", count.all], ["members", "Members", count.members], ["employees", "Employees", count.employees], ["outside", "Outside", count.outside],
        ]} />
        <input className="input ln-search" type="search" placeholder="Search name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ member_type: "outside" })}>New outside member</button>
      </SectionBar>
      <DataTable rows={paged.pageRows} rowKey="key" onRow={(m) => setModal(m)} empty="No employee or member found." cols={[
        { key: "name", label: "Name", render: (m) => <><b>{m.name}</b><span className="hr-sub">{m.member_type === "employee" ? "Employee" : "Outside"}</span></> },
        { key: "is_member", label: "Member", render: (m) => (m.is_member ? <Badge status="active" /> : <span className="hr-muted">Not yet</span>) },
        { key: "contact_no", label: "Contact", render: (m) => <>{m.contact_no || "—"}<span className="hr-sub">{m.email}</span></> },
        { key: "bank", label: "Bank", render: (m) => (m.bank_name ? `${m.bank_name} ${m.account_no || ""}` : "—") },
        { key: "invested", label: "Invested", cls: "n", money: true },
        { key: "loan_balance", label: "Loan balance", cls: "n", money: true },
        { key: "is_active", label: "", render: (m) => (!m.is_active ? <Badge status="inactive" /> : null) },
      ]} />
      <Pager {...paged} label="name(s)" />
      {modal && <MemberModal row={modal} onClose={() => setModal(null)}
        onDone={(msg) => { notify(msg); setModal(null); refresh(); }} onFail={fail(notify)} />}
    </section>
  );
}

function MemberModal({ row, onClose, onDone, onFail }) {
  const [f, set] = useForm({
    member_type: row?.member_type || "employee", employee_id: row?.employee_id ? String(row.employee_id) : "", name: row?.name || "",
    contact_no: row?.contact_no || "", email: row?.email || "", address: row?.address || "", bank_name: row?.bank_name || "",
    account_no: row?.account_no || "", is_active: row?.is_active ?? true,
  });
  const save = () => {
    const body = { ...f, employee_id: f.employee_id ? Number(f.employee_id) : null };
    (row?.id ? api.put(`/lending/members/${row.id}`, body) : api.post("/lending/members", body)).then((r) => onDone(r.message)).catch(onFail);
  };
  return (
    <Modal title={row?.id ? `Member · ${row.name}` : row?.name ? `Make ${row.name} a member` : "New member"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={f.member_type === "employee" ? !f.employee_id : !f.name}>Save</button></>}>
      <div className="hr-form">
        <Field label="Member">
          <select className="input" value={f.member_type} onChange={set("member_type")}>
            <option value="employee">Employee</option><option value="outside">Outside person</option>
          </select>
        </Field>
        {f.member_type === "employee"
          ? (row?.employee_id
            ? <Field label="Employee" wide><input className="input" value={row.name} disabled /></Field>
            : <div className="hr-field is-wide"><span className="field-label">Employee</span><EmployeeSelect value={f.employee_id} onChange={(v) => set("employee_id", v)} /></div>)
          : <Field label="Name" wide><input className="input" value={f.name} onChange={set("name")} /></Field>}
        <Field label="Contact no."><input className="input" value={f.contact_no} onChange={set("contact_no")} /></Field>
        <Field label="Email"><input type="email" className="input" value={f.email} onChange={set("email")} /></Field>
        <Field label="Address" wide><input className="input" value={f.address} onChange={set("address")} /></Field>
        <Field label="Bank (for cash-outs)"><input className="input" value={f.bank_name} onChange={set("bank_name")} /></Field>
        <Field label="Account no."><input className="input" value={f.account_no} onChange={set("account_no")} /></Field>
        <label className="hr-check"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active</label>
      </div>
    </Modal>
  );
}

function Settings({ notify, lk, refresh }) {
  const [modal, setModal] = useState(null);
  return (
    <section className="card hr-section">
      <SectionBar>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({})}>New setting</button>
      </SectionBar>
      <DataTable rows={lk.settings} onRow={(s) => setModal(s)} cols={[
        { key: "name", label: "Name", render: (s) => <><b>{s.name}</b> {s.is_default && <Badge status="default" />}</> },
        { key: "applies_to", label: "For" },
        { key: "rate", label: "Interest", render: rateText },
        { key: "amount", label: "Amount", render: (s) => `${n2(s.min_amount)} – ${s.max_amount ? n2(s.max_amount) : "no limit"}` },
        { key: "max_term_months", label: "Max term", render: (s) => (s.max_term_months ? `${s.max_term_months} mo` : "—") },
        { key: "penalty", label: "Penalty / day", render: (s) => (Number(s.penalty_rate_per_day) ? pct(s.penalty_rate_per_day, 3) : "—") },
        { key: "lock_in_days", label: "Lock-in", render: (s) => (s.lock_in_days ? `${s.lock_in_days} days` : "—") },
        { key: "is_active", label: "", render: (s) => (!s.is_active ? <Badge status="cancelled" /> : null) },
      ]} />
      {modal && <SettingModal row={modal.id ? modal : null} onClose={() => setModal(null)} onDone={(msg) => { notify(msg); setModal(null); refresh(); }} onFail={fail(notify)} />}
    </section>
  );
}

function SettingModal({ row, onClose, onDone, onFail }) {
  const [f, set] = useForm({
    name: row?.name || "", applies_to: row?.applies_to || "loan", interest_type: row?.interest_type || "per_month",
    interest_rate: row?.interest_rate ?? 0.02, fixed_interest: row?.fixed_interest ?? 0, min_amount: row?.min_amount ?? 0,
    max_amount: row?.max_amount ?? "", max_term_months: row?.max_term_months ?? "", penalty_rate_per_day: row?.penalty_rate_per_day ?? 0,
    lock_in_days: row?.lock_in_days ?? 0, payroll_deductible: row ? !!row.payroll_deductible : true, is_default: !!row?.is_default, is_active: row ? !!row.is_active : true,
  });
  const save = () => {
    const body = { ...f, max_amount: f.max_amount === "" ? null : f.max_amount, max_term_months: f.max_term_months === "" ? null : f.max_term_months };
    (row ? api.put(`/lending/settings/${row.id}`, body) : api.post("/lending/settings", body)).then((r) => onDone(r.message)).catch(onFail);
  };
  return (
    <Modal title={row ? `Setting · ${row.name}` : "New lending setting"} onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!f.name}>Save</button></>}>
      <div className="hr-form">
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} placeholder="e.g. Salary Loan" /></Field>
        <Field label="For">
          <select className="input" value={f.applies_to} onChange={set("applies_to")}><option value="loan">Loan</option><option value="investment">Investment</option></select>
        </Field>
        <Field label="Interest">
          <select className="input" value={f.interest_type} onChange={set("interest_type")}>
            <option value="per_month">Per month</option><option value="per_day">Per day</option><option value="fixed">Fixed amount</option>
          </select>
        </Field>
        {f.interest_type === "fixed"
          ? <Field label="Fixed interest"><input type="number" min="0" className="input" value={f.fixed_interest} onChange={set("fixed_interest")} /></Field>
          : <Field label="Rate" hint="0.02 = 2%"><input type="number" step="0.0001" min="0" className="input" value={f.interest_rate} onChange={set("interest_rate")} /></Field>}
        <Field label="Minimum amount"><input type="number" min="0" className="input" value={f.min_amount} onChange={set("min_amount")} /></Field>
        <Field label="Maximum amount"><input type="number" min="0" className="input" value={f.max_amount} onChange={set("max_amount")} placeholder="no limit" /></Field>
        {f.applies_to === "loan" ? (
          <>
            <Field label="Longest term (months)"><input type="number" min="1" className="input" value={f.max_term_months} onChange={set("max_term_months")} /></Field>
            <Field label="Penalty per day" hint="0.001 = 0.1% of the overdue amount"><input type="number" step="0.0001" min="0" className="input" value={f.penalty_rate_per_day} onChange={set("penalty_rate_per_day")} /></Field>
            <label className="hr-check"><input type="checkbox" checked={f.payroll_deductible} onChange={set("payroll_deductible")} /> Can be deducted in payroll</label>
          </>
        ) : (
          <Field label="Lock-in days" hint="Cash-out before this = no interest"><input type="number" min="0" className="input" value={f.lock_in_days} onChange={set("lock_in_days")} /></Field>
        )}
        <label className="hr-check"><input type="checkbox" checked={f.is_default} onChange={set("is_default")} /> Default</label>
        <label className="hr-check"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Active</label>
      </div>
    </Modal>
  );
}