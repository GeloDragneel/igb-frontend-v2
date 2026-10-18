// Task → Loan Management
//   Loans payable (we borrowed) and loans receivable (we lent): schedule, payments, journal entries
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Badge from "../../components/Badge";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";

const API = "/loans";
const ROUTE = "/task/loan-management";
const TABLE_HEIGHT = "calc(100vh - 430px)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addMonth = (iso) => { const [y, m, d] = iso.split("-").map(Number); const last = new Date(y, m + 1, 0).getDate(); return `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-${pad(Math.min(d, last))}`; };
const fmtDay = (iso) => { if (!iso) return "—"; const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return `${MONTHS[m - 1]} ${pad(d)} ${y}`; };
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const STATUS = { active: ["blue", "Active"], closed: ["green", "Fully paid"], void: ["gray", "Void"] };
const ROW = { paid: ["green", "Paid"], partial: ["orange", "Partial"], overdue: ["red", "Overdue"], open: ["gray", "Open"] };

// guess an account by its name
const pick = (accounts, re) => accounts.find((a) => re.test(a.account_name))?.account_code || "";

export default function LoanManagement() {
  const { user } = useAuth();
  const notify = useToast();
  const [direction, setDirection] = useState("payable");
  const [status, setStatus] = useState("active");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await apiFetch(`${API}?direction=${direction}&status=${status}`)); }
    catch (e) { setError(e.message || "Couldn't load loans."); setData({ loans: [], accounts: [], parties: [] }); }
    finally { setLoading(false); }
  }, [direction, status]);
  useEffect(() => { load(); }, [load, user?.id, user?.caid]);

  const loans = data?.loans || [];
  const accounts = data?.accounts || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? loans.filter((l) => `${l.loan_no} ${l.party_name} ${l.reference || ""}`.toLowerCase().includes(q)) : loans;
  }, [loans, query]);

  const thisMonth = today().slice(0, 7);
  const stats = useMemo(() => ({
    outstanding: loans.filter((l) => l.status === "active").reduce((n, l) => n + l.outstanding, 0),
    dueThisMonth: loans.filter((l) => l.next_due && l.next_due.date.slice(0, 7) <= thisMonth && l.status === "active").reduce((n, l) => n + l.next_due.total, 0),
    overdue: loans.filter((l) => l.overdue).length,
    count: loans.filter((l) => l.status === "active").length,
  }), [loans, thisMonth]);

  const payable = direction === "payable";
  const newLoan = () => {
    const first = addMonth(today());
    setForm({
      id: null, direction, party_id: "", party_name: "", reference: "", principal: "", annual_rate: "", term_months: "12",
      method: "diminishing", release_date: today(), first_due_date: first,
      loan_account: pick(accounts, payable ? /loan.*payable|notes payable/i : /loan.*receivable|notes receivable|advances to/i),
      interest_account: pick(accounts, payable ? /interest expense/i : /interest income/i),
      cash_account: pick(accounts, /cash in bank|bank/i), post_release: true, remarks: "", locked: false,
    });
  };

  const columns = [
    { key: "loan_no", label: "Loan #", render: (l) => <span className="mono">{l.loan_no}</span> },
    {
      key: "party_name", label: payable ? "Lender" : "Borrower", render: (l) => (
        <div><div className="strong">{l.party_name}</div>{l.reference && <div className="muted small">Ref {l.reference}</div>}</div>
      )
    },
    { key: "principal", label: "Principal", align: "right", value: (l) => l.principal, render: (l) => <span className="mono">{n2(l.principal)}</span> },
    { key: "terms", label: "Terms", value: (l) => l.term_months, render: (l) => <span className="small">{l.annual_rate}% · {l.term_months} mo · {l.method === "diminishing" ? "Diminishing" : "Straight"}</span> },
    { key: "monthly", label: "Monthly", align: "right", value: (l) => l.monthly, render: (l) => <span className="mono">{n2(l.monthly)}</span> },
    {
      key: "outstanding", label: "Balance", align: "right", value: (l) => l.outstanding, render: (l) => (
        <div style={{ minWidth: 120 }}>
          <div className="mono strong" style={{ textAlign: "right" }}>{n2(l.outstanding)}</div>
          <div style={{ height: 5, borderRadius: 9, background: "rgba(148,163,184,.25)", marginTop: 4, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.min(100, (l.paid_principal / l.principal) * 100)}%`, background: "#10b981" }} />
          </div>
        </div>
      )
    },
    {
      key: "next", label: "Next due", value: (l) => l.next_due?.date || "", render: (l) => (l.status !== "active" || !l.next_due ? <span className="muted">—</span> : (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{fmtDay(l.next_due.date)}{l.overdue && <Badge tone="red">Overdue</Badge>}</span>
      ))
    },
    { key: "status", label: "Status", render: (l) => <Badge tone={STATUS[l.status]?.[0]}>{STATUS[l.status]?.[1]}</Badge> },
  ];

  return (
    <>
      <SearchCard
        query={query}
        setQuery={setQuery}
        placeholder={`Search loan #, ${payable ? "lender" : "borrower"} or reference...`}
        actions={[
          { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
          { label: "New Loan", icon: "plus", variant: "primary", onClick: newLoan, disabled: !data },
        ]}
        extra={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {[["payable", "Loans Payable"], ["receivable", "Loans Receivable"]].map(([v, l]) => (
              <button key={v} type="button" className={`btn btn-sm${direction === v ? " btn-primary" : ""}`} onClick={() => setDirection(v)}>{l}</button>
            ))}
            <select className="input" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="active">Active</option>
              <option value="closed">Fully paid</option>
              <option value="void">Void</option>
              <option value="all">All</option>
            </select>
          </div>
        }
        sticky
      />

      {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginBottom: 10 }}>
        {[
          [payable ? "Owed to lenders" : "Owed to us", n2(stats.outstanding), `${stats.count} active loan${stats.count === 1 ? "" : "s"}`],
          [payable ? "Due this month" : "To collect this month", n2(stats.dueThisMonth), "next installments"],
          ["Overdue", String(stats.overdue), stats.overdue ? "loans past their due date" : "nothing overdue"],
        ].map(([label, value, sub], i) => (
          <div key={label} className="card" style={{ padding: "12px 14px", borderLeft: `4px solid ${i === 2 && stats.overdue ? "#ef4444" : i === 1 ? "#f59e0b" : "#2563eb"}` }}>
            <div className="muted small">{label}</div>
            <div className="mono" style={{ fontSize: 21, fontWeight: 800 }}>{value}</div>
            <div className="muted small">{sub}</div>
          </div>
        ))}
      </div>

      <div className="sales-table">
        <DataTable
          bodyHeight={TABLE_HEIGHT}
          columns={columns}
          rows={loading ? [] : filtered}
          rowKey="id"
          exportName={`loans-${direction}`}
          emptyText={loading ? "Loading…" : `No ${status === "all" ? "" : STATUS[status]?.[1].toLowerCase() + " "}loans ${payable ? "payable" : "receivable"}. Click New Loan.`}
          onRowClick={(l) => setOpenId(l.id)}
          rowActions={(l) => [{ label: "Open", onClick: () => setOpenId(l.id) }]}
        />
      </div>

      {form && <LoanForm initial={form} data={data} onClose={() => setForm(null)} onSaved={(m) => { setForm(null); notify(m); load(); }} />}
      {openId && (
        <LoanDetail
          id={openId}
          data={data}
          onClose={() => setOpenId(null)}
          onChanged={(m) => { if (m) notify(m); load(); }}
          onEdit={(l) => { setOpenId(null); setForm({ ...l, party_id: l.party_id ? String(l.party_id) : "", principal: String(l.principal), annual_rate: String(l.annual_rate), term_months: String(l.term_months), cash_account: l.cash_account || "", post_release: !!l.release_jv_no, reference: l.reference || "", remarks: l.remarks || "", locked: l.paid_principal > 0 || l.paid_interest > 0 }); }}
        />
      )}
    </>
  );
}

/* =========================================================
   New / edit loan, with a live schedule preview
   ========================================================= */
function LoanForm({ initial, data, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const payable = f.direction === "payable";
  const accOpts = [{ value: "", label: "— Select —" }, ...data.accounts.map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` }))];
  const partyOpts = [{ value: "", label: "— Type a name below —" }, ...data.parties.map((p) => ({ value: String(p.id), label: p.name }))];

  // schedule preview (debounced)
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!(Number(f.principal) > 0) || !(Number(f.term_months) >= 1) || f.annual_rate === "" || !f.first_due_date) { setPreview(null); return undefined; }
    timer.current = setTimeout(() => {
      apiFetch(`${API}/preview`, { method: "POST", body: JSON.stringify({ principal: Number(f.principal), annual_rate: Number(f.annual_rate), term_months: Number(f.term_months), method: f.method, first_due_date: f.first_due_date }) })
        .then(setPreview).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(timer.current);
  }, [f.principal, f.annual_rate, f.term_months, f.method, f.first_due_date]);

  const save = async () => {
    setError("");
    if (!f.party_name.trim()) return setError(`${payable ? "Lender" : "Borrower"} is required.`);
    if (!(Number(f.principal) > 0)) return setError("Principal is required.");
    if (f.annual_rate === "") return setError("Interest rate is required (0 if none).");
    if (!f.loan_account || !f.interest_account) return setError("Pick the loan and interest accounts.");
    if (f.post_release && !f.cash_account) return setError("Pick the cash / bank account to post the release.");
    setSaving(true);
    try {
      const body = {
        direction: f.direction, party_id: f.party_id ? Number(f.party_id) : null, party_name: f.party_name.trim(), reference: f.reference || null,
        principal: Number(f.principal), annual_rate: Number(f.annual_rate), term_months: Number(f.term_months), method: f.method,
        release_date: f.release_date, first_due_date: f.first_due_date, loan_account: f.loan_account, interest_account: f.interest_account,
        cash_account: f.cash_account || null, post_release: !!f.post_release, remarks: f.remarks || null,
      };
      const res = await apiFetch(f.id ? `${API}/${f.id}` : API, { method: f.id ? "PUT" : "POST", body: JSON.stringify(body) });
      onSaved(res.message);
    } catch (e) {
      setError(e.message || "Couldn't save.");
      setSaving(false);
    }
  };

  return (
    <Modal title={f.id ? `Edit ${f.loan_no}` : `New Loan ${payable ? "Payable" : "Receivable"}`} onClose={() => !saving && onClose()} size="lg"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save loan"}</button></>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {f.locked && <div className="inv-banner" style={{ marginBottom: 10 }}>Payments are recorded, so amount, rate, term, method and due date are locked.</div>}

      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        {!f.id && (
          <Field label="Type">
            <select className="input" value={f.direction} onChange={(e) => set("direction", e.target.value)}>
              <option value="payable">Loan payable (we borrowed)</option>
              <option value="receivable">Loan receivable (we lent)</option>
            </select>
          </Field>
        )}
        <div className="field"><span className="field-label">{payable ? "Lender" : "Borrower"} from list</span>
          <SearchSelect value={f.party_id || ""} options={partyOpts} searchPlaceholder="Search..." aria-label="Party"
            onChange={(v) => setF((x) => ({ ...x, party_id: v, party_name: v ? data.parties.find((p) => String(p.id) === v)?.name || x.party_name : x.party_name }))} /></div>
        <Field label={`${payable ? "Lender" : "Borrower"} name *`}><input className="input" value={f.party_name} onChange={(e) => set("party_name", e.target.value)} placeholder={payable ? "e.g. Landbank" : "e.g. Juan Dela Cruz"} /></Field>
        <Field label="Reference / PN no."><input className="input" value={f.reference} onChange={(e) => set("reference", e.target.value)} /></Field>

        <Field label="Principal *"><input className="input ta-right" inputMode="decimal" disabled={f.locked} value={f.principal} onChange={(e) => set("principal", cleanNum(e.target.value))} /></Field>
        <Field label="Interest rate (% per year) *"><input className="input ta-right" inputMode="decimal" disabled={f.locked} value={f.annual_rate} onChange={(e) => set("annual_rate", cleanNum(e.target.value))} placeholder="e.g. 12" /></Field>
        <Field label="Term (months) *"><input className="input ta-right" inputMode="numeric" disabled={f.locked} value={f.term_months} onChange={(e) => set("term_months", e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Method">
          <select className="input" disabled={f.locked} value={f.method} onChange={(e) => set("method", e.target.value)}>
            <option value="diminishing">Diminishing balance (equal payments)</option>
            <option value="straight">Straight / add-on interest</option>
          </select>
        </Field>
        <Field label="Release date *"><input type="date" className="input" value={f.release_date} onChange={(e) => set("release_date", e.target.value)} /></Field>
        <Field label="First due date *"><input type="date" className="input" disabled={f.locked} value={f.first_due_date} onChange={(e) => set("first_due_date", e.target.value)} /></Field>
      </div>

      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: 6 }}>
        <div className="field"><span className="field-label">{payable ? "Loans Payable" : "Loans Receivable"} account *</span>
          <SearchSelect value={f.loan_account} onChange={(v) => set("loan_account", v)} options={accOpts} searchPlaceholder="Search account..." aria-label="Loan account" /></div>
        <div className="field"><span className="field-label">{payable ? "Interest Expense" : "Interest Income"} account *</span>
          <SearchSelect value={f.interest_account} onChange={(v) => set("interest_account", v)} options={accOpts} searchPlaceholder="Search account..." aria-label="Interest account" /></div>
        <div className="field"><span className="field-label">Cash / bank account</span>
          <SearchSelect value={f.cash_account} onChange={(v) => set("cash_account", v)} options={accOpts} searchPlaceholder="Search account..." aria-label="Cash account" /></div>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0" }}>
        <input type="checkbox" checked={!!f.post_release} disabled={!!f.id} onChange={(e) => set("post_release", e.target.checked)} />
        <span>Post the {payable ? "loan proceeds" : "loan release"} to the General Journal ({payable ? "Dr Cash / Cr Loans Payable" : "Dr Loans Receivable / Cr Cash"})</span>
      </label>
      <Field label="Remarks"><input className="input" value={f.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>

      {preview && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 6 }} className="small">
            <span>Monthly <b className="mono">{n2(preview.rows[0]?.total)}</b></span>
            <span>Total interest <b className="mono">{n2(preview.total_interest)}</b></span>
            <span>Total to {payable ? "pay" : "collect"} <b className="mono">{n2(Number(f.principal) + preview.total_interest)}</b></span>
          </div>
          <ScheduleTable rows={preview.rows} maxHeight={220} />
        </div>
      )}
    </Modal>
  );
}

function ScheduleTable({ rows, maxHeight = 320 }) {
  return (
    <div className="table-scroll" style={{ maxHeight }}>
      <table className="table">
        <thead><tr><th>#</th><th>Due date</th><th className="ta-right">Principal</th><th className="ta-right">Interest</th><th className="ta-right">Payment</th><th className="ta-right">Balance</th>{rows[0]?.status && <th>Status</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.no}>
              <td className="muted">{r.no}</td>
              <td>{fmtDay(r.due_date)}</td>
              <td className="ta-right mono">{n2(r.principal)}</td>
              <td className="ta-right mono">{n2(r.interest)}</td>
              <td className="ta-right mono strong">{n2(r.total)}</td>
              <td className="ta-right mono">{n2(r.balance)}</td>
              {r.status && <td><Badge tone={ROW[r.status][0]}>{ROW[r.status][1]}</Badge></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =========================================================
   Loan detail: summary, schedule, payments
   ========================================================= */
function LoanDetail({ id, data, onClose, onChanged, onEdit }) {
  const notify = useToast();
  const [loan, setLoan] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("schedule");
  const [pay, setPay] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(() => {
    apiFetch(`${API}/${id}`).then(setLoan).catch((e) => setError(e.message || "Couldn't load the loan."));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const payable = loan?.direction === "payable";
  const accName = (code) => data.accounts.find((a) => a.account_code === code)?.account_name || "";

  const startPayment = () => {
    const row = loan.schedule.find((r) => r.status !== "paid");
    // partly paid row: only the principal still owed on it
    let principal = row?.principal || 0;
    if (row?.status === "partial") {
      const before = loan.schedule.filter((r) => r.no < row.no).reduce((n, r) => n + r.principal, 0);
      principal = Math.round((before + row.principal - loan.paid_principal) * 100) / 100;
    }
    setPay({
      payment_date: today(), installment_no: row?.no || null, principal: String(Math.min(principal, loan.outstanding)),
      interest: String(row?.status === "partial" ? 0 : row?.interest || 0), penalty: "", cash_account: loan.cash_account || "", reference: "",
    });
  };

  const runConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    try {
      const res = await apiFetch(c.url, { method: "POST" });
      notify(res.message);
      onChanged();
      if (c.kind === "loan") onClose(); else load();
    } catch (e) {
      notify(e.message || "Couldn't void.", "error");
    }
  };

  return (
    <Modal title={loan ? `${loan.loan_no} · ${loan.party_name}` : "Loan"} onClose={onClose} size="lg"
      footer={loan && (
        <>
          {loan.status !== "void" && loan.paid_principal === 0 && loan.paid_interest === 0 && (
            <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => setConfirm({ kind: "loan", url: `${API}/${loan.id}/void`, title: `Void ${loan.loan_no}?`, message: loan.release_jv_no ? "Its release entry is removed from the General Journal." : "The loan is kept as void." })}>Void loan</button>
          )}
          <button className="btn" onClick={onClose}>Close</button>
          {loan.status !== "void" && <button className="btn" onClick={() => onEdit(loan)}>Edit</button>}
          {loan.status === "active" && <button className="btn btn-primary" onClick={startPayment}>{payable ? "Record payment" : "Record collection"}</button>}
        </>
      )}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {!loan && !error && <span className="sk" style={{ display: "block", height: 260, borderRadius: 10 }} />}
      {loan && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
            {[
              ["Principal", n2(loan.principal)],
              ["Paid principal", n2(loan.paid_principal)],
              ["Balance", n2(loan.outstanding)],
              [payable ? "Interest paid" : "Interest earned", n2(loan.paid_interest)],
            ].map(([l, v]) => (
              <div key={l} className="card" style={{ padding: "8px 12px" }}><div className="muted small">{l}</div><div className="mono strong" style={{ fontSize: 17 }}>{v}</div></div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>
            <Badge tone={STATUS[loan.status][0]}>{STATUS[loan.status][1]}</Badge>{" "}
            {loan.annual_rate}% per year, {loan.term_months} months, {loan.method === "diminishing" ? "diminishing balance" : "straight / add-on"}. Released {fmtDay(loan.release_date)}
            {loan.release_jv_no ? ` (journal ${loan.release_jv_no})` : " (release not posted)"}. Loan account {loan.loan_account} {accName(loan.loan_account)}; interest {loan.interest_account} {accName(loan.interest_account)}.
          </p>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[["schedule", "Schedule"], ["payments", `${payable ? "Payments" : "Collections"} (${loan.payments.length})`]].map(([v, l]) => (
              <button key={v} className={`btn btn-sm${view === v ? " btn-primary" : ""}`} onClick={() => setView(v)}>{l}</button>
            ))}
          </div>

          {view === "schedule" ? <ScheduleTable rows={loan.schedule} /> : (
            <div className="table-scroll" style={{ maxHeight: 320 }}>
              <table className="table">
                <thead><tr><th>Payment #</th><th>Date</th><th>Inst.</th><th className="ta-right">Principal</th><th className="ta-right">Interest</th><th className="ta-right">Penalty</th><th className="ta-right">Total</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {loan.payments.length === 0 && <tr><td colSpan={9} className="empty">Nothing recorded yet.</td></tr>}
                  {loan.payments.map((p) => (
                    <tr key={p.id} style={p.status === "void" ? { opacity: 0.55, textDecoration: "line-through" } : undefined}>
                      <td className="mono">{p.payment_no}</td>
                      <td>{fmtDay(p.date)}</td>
                      <td className="muted">{p.installment_no || "—"}</td>
                      <td className="ta-right mono">{n2(p.principal)}</td>
                      <td className="ta-right mono">{n2(p.interest)}</td>
                      <td className="ta-right mono">{p.penalty ? n2(p.penalty) : ""}</td>
                      <td className="ta-right mono strong">{n2(p.total)}</td>
                      <td>{p.status === "void" ? <Badge tone="gray">Void</Badge> : <Badge tone="green">Posted</Badge>}</td>
                      <td className="ta-right">{p.status === "posted" && (
                        <button className="btn btn-sm" onClick={() => setConfirm({ kind: "payment", url: `${API}/payments/${p.id}/void`, title: `Void ${p.payment_no}?`, message: "Its journal entry is removed and the balance goes back up." })}>Void</button>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {pay && loan && (
        <PaymentModal loan={loan} initial={pay} accounts={data.accounts} onClose={() => setPay(null)}
          onSaved={(m) => { setPay(null); notify(m); load(); onChanged(); }} />
      )}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel="Void" onCancel={() => setConfirm(null)} onConfirm={runConfirm} />}
    </Modal>
  );
}

/* ---------- record a payment / collection ---------- */
function PaymentModal({ loan, initial, accounts, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const payable = loan.direction === "payable";
  const accOpts = [{ value: "", label: "— Select —" }, ...accounts.map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` }))];
  const total = (Number(f.principal) || 0) + (Number(f.interest) || 0) + (Number(f.penalty) || 0);
  const name = (c) => accounts.find((a) => a.account_code === c)?.account_name || c;

  const save = async () => {
    setError("");
    if (!(total > 0)) return setError("Enter the amount.");
    if (Number(f.principal) > loan.outstanding + 0.009) return setError(`Principal is more than the balance (${n2(loan.outstanding)}).`);
    if (!f.cash_account) return setError("Pick the cash / bank account.");
    setSaving(true);
    try {
      const res = await apiFetch(`${API}/${loan.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          payment_date: f.payment_date, principal: Number(f.principal) || 0, interest: Number(f.interest) || 0, penalty: Number(f.penalty) || 0,
          cash_account: f.cash_account, reference: f.reference || null, installment_no: f.installment_no
        }),
      });
      onSaved(res.message);
    } catch (e) {
      setError(e.message || "Couldn't post.");
      setSaving(false);
    }
  };

  const lines = payable
    ? [[loan.loan_account, Number(f.principal) || 0, 0], [loan.interest_account, (Number(f.interest) || 0) + (Number(f.penalty) || 0), 0], [f.cash_account, 0, total]]
    : [[f.cash_account, total, 0], [loan.loan_account, 0, Number(f.principal) || 0], [loan.interest_account, 0, (Number(f.interest) || 0) + (Number(f.penalty) || 0)]];

  return (
    <Modal title={`${payable ? "Payment" : "Collection"} · ${loan.loan_no}${f.installment_no ? ` · installment ${f.installment_no}` : ""}`} onClose={() => !saving && onClose()} size="md"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Posting…" : `Post ${n2(total)}`}</button></>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Date *"><input type="date" className="input" value={f.payment_date} onChange={(e) => set("payment_date", e.target.value)} /></Field>
        <Field label="OR / check no."><input className="input" value={f.reference} onChange={(e) => set("reference", e.target.value)} /></Field>
        <Field label={`Principal (balance ${n2(loan.outstanding)})`}><input className="input ta-right" inputMode="decimal" value={f.principal} onChange={(e) => set("principal", cleanNum(e.target.value))} /></Field>
        <Field label="Interest"><input className="input ta-right" inputMode="decimal" value={f.interest} onChange={(e) => set("interest", cleanNum(e.target.value))} /></Field>
        <Field label="Penalty"><input className="input ta-right" inputMode="decimal" value={f.penalty} onChange={(e) => set("penalty", cleanNum(e.target.value))} placeholder="0.00" /></Field>
        <div className="field"><span className="field-label">Cash / bank account *</span>
          <SearchSelect value={f.cash_account} onChange={(v) => set("cash_account", v)} options={accOpts} searchPlaceholder="Search account..." aria-label="Cash account" /></div>
      </div>
      <table className="table journal-table" style={{ marginTop: 10 }}>
        <thead><tr><th>Journal entry</th><th className="ta-right">Debit</th><th className="ta-right">Credit</th></tr></thead>
        <tbody>
          {lines.filter(([, d, c]) => d || c).map(([code, d, c], i) => (
            <tr key={i}><td>{code ? `${code} - ${name(code)}` : <span className="muted">Cash / bank account</span>}</td><td className="ta-right mono">{d ? n2(d) : ""}</td><td className="ta-right mono">{c ? n2(c) : ""}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="muted small" style={{ margin: "6px 0 0" }}>Penalty is booked to the interest account.</p>
    </Modal>
  );
}
