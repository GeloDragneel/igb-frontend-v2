// Task → Banking → Petty Cash (imprest)
//   Funds: amount, cash on hand, unreplenished vouchers
//   Vouchers (PCV): payee, expense account, amount → reduce cash on hand
//   Replenish: Dr expense accounts / Cr bank → posted to General Journal; vouchers become "replenished"
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../../components/SearchCard";
import DataTable from "../../../components/DataTable";
import Badge from "../../../components/Badge";
import Modal, { Field } from "../../../components/Modal";
import ConfirmDialog from "../../../components/ConfirmDialog";
import SearchSelect from "../../../components/SearchSelect";
import { useToast } from "../../../components/Toast";
import { useAuth, apiFetch } from "../../../context/AuthContext";
import { usePeriod } from "../../../context/PeriodContext";
import { BANKING_TABS, JournalModal, fmtDay, n2, today } from "./bankingShared";

const API = "/banking/petty-cash";
const TABLE_HEIGHT = "calc(100vh - 520px)";
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const STATUS = { open: ["orange", "Unreplenished"], replenished: ["green", "Replenished"], void: ["gray", "Void"] };

export default function PettyCash() {
  const { user } = useAuth();
  const { from, to } = usePeriod();
  const notify = useToast();

  const [overview, setOverview] = useState(null);       // { funds, accounts }
  const [fundId, setFundId] = useState("");             // "" = all funds
  const [view, setView] = useState("vouchers");         // vouchers | history
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const [fundForm, setFundForm] = useState(null);
  const [voucher, setVoucher] = useState(null);
  const [replenish, setReplenish] = useState(null);
  const [toVoid, setToVoid] = useState(null);
  const [journal, setJournal] = useState(null);

  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);

  const loadOverview = useCallback(async () => {
    try { setOverview(await apiFetch(API)); }
    catch (e) { setError(e.message || "Couldn't load petty cash."); setOverview({ funds: [], accounts: [] }); }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const f = fundId ? `&fund_id=${fundId}` : "";
      if (view === "vouchers") setRows(await apiFetch(`${API}/vouchers?status=${status}&from=${fromMonth}&to=${toMonth}${f}`));
      else setHistory(await apiFetch(`${API}/history?${f.slice(1)}`));
    } catch (e) {
      setError(e.message || "Couldn't load.");
    } finally {
      setLoading(false);
    }
  }, [fundId, view, status, fromMonth, toMonth]);

  const reload = () => { loadOverview(); loadList(); };

  useEffect(() => { loadOverview(); }, [loadOverview, user?.id, user?.caid]);
  useEffect(() => { loadList(); }, [loadList, user?.id, user?.caid]);

  const funds = overview?.funds || [];
  const accounts = overview?.accounts || [];
  const accOpts = useMemo(() => [{ value: "", label: "— Select —" }, ...accounts.map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` }))], [accounts]);
  const activeFunds = funds.filter((f) => f.is_active);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = view === "vouchers" ? rows : history;
    if (!q) return list;
    return list.filter((r) => Object.values(r).join(" ").toLowerCase().includes(q));
  }, [rows, history, view, query]);

  const newVoucher = (f) => setVoucher({
    id: null, fund_id: String(f?.id || activeFunds[0]?.id || ""), pcv_date: today(), declared_month: today().slice(0, 7),
    payee: "", particulars: "", reference: "", expense_account: "", amount: "",
  });

  const voidVoucher = async () => {
    const v = toVoid;
    setToVoid(null);
    try { const res = await apiFetch(`${API}/vouchers/${v.id}/void`, { method: "POST" }); notify(res.message); reload(); }
    catch (e) { notify(e.message || "Couldn't void.", "error"); }
  };

  const voucherCols = [
    { key: "pcv_no", label: "PCV #", render: (r) => <span className="mono">{r.pcv_no}</span> },
    { key: "date", label: "Date", render: (r) => fmtDay(r.date) },
    {
      key: "payee", label: "Payee", render: (r) => (
        <div><div className="strong">{r.payee}</div>{r.particulars && <div className="muted small">{r.particulars}</div>}</div>
      )
    },
    { key: "expense", label: "Expense account", value: (r) => r.expense_account, render: (r) => <span>{r.expense_account} <span className="muted">– {r.expense_name}</span></span> },
    ...(fundId ? [] : [{ key: "fund_name", label: "Fund" }]),
    { key: "amount", label: "Amount", align: "right", value: (r) => r.amount, render: (r) => <span className="mono">{n2(r.amount)}</span> },
    {
      key: "status", label: "Status", render: (r) => (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <Badge tone={STATUS[r.status]?.[0]}>{STATUS[r.status]?.[1] || r.status}</Badge>
          {r.replenish_no && <span className="muted small mono">{r.replenish_no}</span>}
        </span>
      )
    },
  ];

  const historyCols = [
    { key: "date", label: "Date", render: (r) => fmtDay(r.date) },
    { key: "replenish_no", label: "Transaction #", render: (r) => <span className="mono">{r.replenish_no}</span> },
    { key: "type", label: "Type", render: (r) => <Badge tone={r.type === "fund" ? "blue" : "green"}>{r.type === "fund" ? "Fund" : "Replenishment"}</Badge> },
    ...(fundId ? [] : [{ key: "fund_name", label: "Fund" }]),
    { key: "remarks", label: "Remarks" },
    { key: "bank", label: "Bank / Cash", value: (r) => r.bank_account, render: (r) => <span>{r.bank_account} <span className="muted">– {r.bank_name}</span></span> },
    { key: "reference", label: "Reference" },
    { key: "amount", label: "Amount", align: "right", value: (r) => r.amount, render: (r) => <span className="mono">{n2(r.amount)}</span> },
  ];

  return (
    <>
      <SearchCard
        query={query}
        setQuery={setQuery}
        placeholder={view === "vouchers" ? "Search PCV #, payee, account..." : "Search transaction #, remarks..."}
        navTabs={BANKING_TABS}
        actions={[
          { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: reload, disabled: loading },
          { label: "New Fund", icon: "plus", onClick: () => setFundForm({ id: null, name: "", custodian: "", account_code: "", fund_amount: "", is_active: true, bank_account: "", txn_date: today(), reference: "", original: 0 }), disabled: !overview },
          { label: "New Voucher", icon: "plus", variant: "primary", onClick: () => newVoucher(funds.find((f) => String(f.id) === String(fundId))), disabled: !activeFunds.length },
        ]}
        sticky
      />

      {error && <div className="alert-error" role="alert">{error}</div>}

      {/* ---------- funds ---------- */}
      {overview && !funds.length && (
        <div className="card" style={{ padding: 24, textAlign: "center", marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>No petty cash fund yet</h3>
          <p className="muted">Set up a fund first: its Petty Cash account, the amount, and the bank it comes from.</p>
          <button className="btn btn-primary" onClick={() => setFundForm({ id: null, name: "Petty Cash Fund", custodian: "", account_code: "", fund_amount: "", is_active: true, bank_account: "", txn_date: today(), reference: "", original: 0 })}>Set up a fund</button>
        </div>
      )}
      {funds.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginBottom: 12 }}>
          {[{ id: "", name: "All funds" }, ...funds].map((f) => {
            const all = f.id === "";
            const fa = all ? funds.filter((x) => x.is_active).reduce((n, x) => n + x.fund_amount, 0) : f.fund_amount;
            const oh = all ? funds.filter((x) => x.is_active).reduce((n, x) => n + x.on_hand, 0) : f.on_hand;
            const un = all ? funds.reduce((n, x) => n + x.unreplenished, 0) : f.unreplenished;
            const pct = fa > 0 ? Math.max(0, Math.min(100, (oh / fa) * 100)) : 0;
            const sel = String(fundId) === String(f.id);
            return (
              <div key={f.id || "all"} className="card" role="button" tabIndex={0}
                onClick={() => setFundId(String(f.id))} onKeyDown={(e) => e.key === "Enter" && setFundId(String(f.id))}
                style={{ padding: 14, cursor: "pointer", outline: sel ? "2px solid #6366f1" : "none", opacity: !all && !f.is_active ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <b>{f.name}</b>
                  {!all && !f.is_active && <Badge tone="gray">Closed</Badge>}
                  {!all && f.is_active && <span className="muted small">{f.custodian || ""}</span>}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 2px" }} className="mono">{n2(oh)}</div>
                <div className="muted small">cash on hand of {n2(fa)}</div>
                <div style={{ height: 6, borderRadius: 99, background: "rgba(148,163,184,.25)", margin: "8px 0", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${pct}%`, borderRadius: 99, background: pct < 25 ? "#ef4444" : pct < 50 ? "#f59e0b" : "#10b981" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <span className="small">{un > 0 ? <>Unreplenished <b className="mono">{n2(un)}</b></> : <span className="muted">Nothing to replenish</span>}</span>
                  {!all && (
                    <span style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm" onClick={() => setFundForm({ ...f, fund_amount: String(f.fund_amount), bank_account: "", txn_date: today(), reference: "", original: f.fund_amount })}>Edit</button>
                      {f.is_active && un > 0 && <button className="btn btn-sm btn-primary" onClick={() => setReplenish(f)}>Replenish</button>}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- list switch ---------- */}
      {funds.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          {[["vouchers", "Vouchers"], ["history", "Fund & Replenishments"]].map(([v, l]) => (
            <button key={v} className={`btn btn-sm${view === v ? " btn-primary" : ""}`} onClick={() => setView(v)}>{l}</button>
          ))}
          {view === "vouchers" && (
            <select className="input" style={{ width: 170, marginLeft: "auto" }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="all">All statuses</option>
              <option value="open">Unreplenished</option>
              <option value="replenished">Replenished</option>
              <option value="void">Void</option>
            </select>
          )}
        </div>
      )}

      {funds.length > 0 && (
        <div className="sales-table">
          {view === "vouchers" ? (
            <DataTable
              bodyHeight={TABLE_HEIGHT}
              columns={voucherCols}
              rows={loading ? [] : filtered}
              rowKey="id"
              exportName="petty-cash-vouchers"
              emptyText={loading ? "Loading…" : "No vouchers. Click New Voucher."}
              onRowClick={(r) => r.status === "open" && setVoucher({ ...r, fund_id: String(r.fund_id), pcv_date: r.date, amount: String(r.amount), particulars: r.particulars || "", reference: r.reference || "" })}
              rowActions={(r) => [
                ...(r.status === "open" ? [
                  { label: "Edit", onClick: () => setVoucher({ ...r, fund_id: String(r.fund_id), pcv_date: r.date, amount: String(r.amount), particulars: r.particulars || "", reference: r.reference || "" }) },
                  { label: "Void", onClick: () => setToVoid(r) },
                ] : []),
                ...(r.replenish_no ? [{ label: `Journal ${r.replenish_no}`, onClick: () => setJournal(r.replenish_no) }] : []),
              ]}
            />
          ) : (
            <DataTable
              bodyHeight={TABLE_HEIGHT}
              columns={historyCols}
              rows={loading ? [] : filtered}
              rowKey="id"
              exportName="petty-cash-history"
              emptyText={loading ? "Loading…" : "Nothing yet."}
              onRowClick={(r) => r.jv_no && setJournal(r.jv_no)}
              rowActions={(r) => (r.jv_no ? [{ label: "Journal", onClick: () => setJournal(r.jv_no) }] : [])}
            />
          )}
        </div>
      )}

      {fundForm && <FundModal initial={fundForm} accOpts={accOpts} onClose={() => setFundForm(null)} onSaved={(m) => { setFundForm(null); notify(m); reload(); }} />}
      {voucher && <VoucherModal initial={voucher} funds={activeFunds} accOpts={accOpts} onClose={() => setVoucher(null)} onSaved={(m) => { setVoucher(null); notify(m); reload(); }} />}
      {replenish && <ReplenishModal fund={replenish} accOpts={accOpts} onClose={() => setReplenish(null)} onDone={(m) => { setReplenish(null); notify(m); reload(); }} />}
      {journal && <JournalModal title={`Journal · ${journal}`} url={`${API}/journal/${encodeURIComponent(journal)}`} onClose={() => setJournal(null)} />}
      {toVoid && (
        <ConfirmDialog title={`Void ${toVoid.pcv_no}?`} message={`${n2(toVoid.amount)} goes back to cash on hand.`}
          confirmLabel="Void" onCancel={() => setToVoid(null)} onConfirm={voidVoucher} />
      )}
    </>
  );
}

/* ---------- Fund set-up / edit ---------- */
function FundModal({ initial, accOpts, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const diff = Math.round(((Number(f.fund_amount) || 0) - (Number(f.original) || 0)) * 100) / 100;

  const save = async () => {
    setError("");
    if (!f.name.trim()) return setError("Fund name is required.");
    if (!f.account_code) return setError("Pick the Petty Cash account.");
    if (diff !== 0 && !f.bank_account) return setError("Pick the bank / cash account the money comes from (or goes back to).");
    setSaving(true);
    try {
      const res = await apiFetch(f.id ? `${API}/funds/${f.id}` : `${API}/funds`, {
        method: f.id ? "PUT" : "POST",
        body: JSON.stringify({
          name: f.name.trim(), custodian: f.custodian || null, account_code: f.account_code, fund_amount: Number(f.fund_amount) || 0,
          is_active: !!f.is_active, bank_account: f.bank_account || null, txn_date: f.txn_date, reference: f.reference || null,
        }),
      });
      onSaved(res.message);
    } catch (e) {
      setError(e.message || "Couldn't save.");
      setSaving(false);
    }
  };

  return (
    <Modal title={f.id ? `Edit ${initial.name}` : "New Petty Cash Fund"} onClose={() => !saving && onClose()} size="md"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Fund name *"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <Field label="Custodian"><input className="input" value={f.custodian || ""} onChange={(e) => set("custodian", e.target.value)} /></Field>
      </div>
      <div
        className="form-grid"
        style={{
          gridTemplateColumns: "1fr 1fr",
          marginTop: 8,
          alignItems: "end"
        }}
      >
        <div className="field">
          <span className="field-label">Petty Cash account *</span>
          <SearchSelect
            value={f.account_code || ""}
            onChange={(v) => set("account_code", v)}
            options={accOpts}
            searchPlaceholder="Search account..."
            aria-label="Petty Cash account"
          />
        </div>
        <Field label="Fund amount *">
          <input
            className="input ta-right"
            inputMode="decimal"
            value={f.fund_amount}
            onChange={(e) =>
              set("fund_amount", cleanNum(e.target.value))
            }
          />
        </Field>
      </div>
      {diff !== 0 && (
        <div className="card" style={{ padding: 12, marginTop: 8, background: "rgba(99,102,241,.06)" }}>
          <p className="small" style={{ margin: "0 0 8px" }}>
            {f.id ? (diff > 0 ? "Fund increase" : "Fund decrease") : "Fund set-up"} of <b className="mono">{n2(Math.abs(diff))}</b> will be posted to the General Journal:
            {" "}{diff > 0 ? "Dr Petty Cash / Cr Bank" : "Dr Bank / Cr Petty Cash"}.
          </p>
          <div className="field"><span className="field-label">Bank / cash account *</span>
            <SearchSelect value={f.bank_account || ""} onChange={(v) => set("bank_account", v)} options={accOpts} searchPlaceholder="Search account..." aria-label="Bank account" /></div>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
            <Field label="Date"><input type="date" className="input" value={f.txn_date} onChange={(e) => set("txn_date", e.target.value)} /></Field>
            <Field label="Check / reference no."><input className="input" value={f.reference || ""} onChange={(e) => set("reference", e.target.value)} /></Field>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------- Petty cash voucher ---------- */
function VoucherModal({ initial, funds, accOpts, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const fund = funds.find((x) => String(x.id) === String(f.fund_id));
  const available = fund ? fund.on_hand + (initial.id ? Number(initial.amount) || 0 : 0) : 0;

  const save = async () => {
    setError("");
    if (!f.fund_id) return setError("Pick the fund.");
    if (!f.payee.trim()) return setError("Payee is required.");
    if (!f.expense_account) return setError("Pick the expense account.");
    if (!(Number(f.amount) > 0)) return setError("Amount is required.");
    if (Number(f.amount) > available + 0.001) return setError(`Not enough cash on hand (${n2(available)}). Replenish the fund first.`);
    setSaving(true);
    try {
      const res = await apiFetch(f.id ? `${API}/vouchers/${f.id}` : `${API}/vouchers`, {
        method: f.id ? "PUT" : "POST",
        body: JSON.stringify({
          fund_id: Number(f.fund_id), pcv_date: f.pcv_date, declared_month: f.declared_month, payee: f.payee.trim(),
          particulars: f.particulars || null, reference: f.reference || null, expense_account: f.expense_account, amount: Number(f.amount),
        }),
      });
      onSaved(res.message);
    } catch (e) {
      setError(e.message || "Couldn't save.");
      setSaving(false);
    }
  };

  return (
    <Modal title={f.id ? `Edit ${f.pcv_no}` : "New Petty Cash Voucher"} onClose={() => !saving && onClose()} size="md"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Fund *">
          <select className="input" value={f.fund_id} onChange={(e) => set("fund_id", e.target.value)}>
            {funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="Cash on hand"><input className="input ta-right mono" readOnly value={n2(available)} /></Field>
        <Field label="Date *"><input type="date" className="input" value={f.pcv_date} onChange={(e) => { set("pcv_date", e.target.value); set("declared_month", e.target.value.slice(0, 7)); }} /></Field>
        <Field label="Declared month *"><input type="month" className="input" value={f.declared_month} onChange={(e) => set("declared_month", e.target.value)} /></Field>
        <Field label="Payee *"><input className="input" value={f.payee} onChange={(e) => set("payee", e.target.value)} autoFocus /></Field>
        <Field label="OR / receipt no."><input className="input" value={f.reference} onChange={(e) => set("reference", e.target.value)} /></Field>
      </div>
      <Field label="Particulars"><input className="input" value={f.particulars} onChange={(e) => set("particulars", e.target.value)} placeholder="e.g. Office supplies, taxi fare" /></Field>
      <div className="form-grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="field"><span className="field-label">Expense account *</span>
          <SearchSelect value={f.expense_account || ""} onChange={(v) => set("expense_account", v)} options={accOpts} searchPlaceholder="Search account..." aria-label="Expense account" /></div>
        <Field label="Amount *"><input className="input ta-right" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", cleanNum(e.target.value))} /></Field>
      </div>
    </Modal>
  );
}

/* ---------- Replenish ---------- */
function ReplenishModal({ fund, accOpts, onClose, onDone }) {
  const [list, setList] = useState(null);
  const [picked, setPicked] = useState([]);
  const [date, setDate] = useState(today());
  const [bank, setBank] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch(`${API}/vouchers?fund_id=${fund.id}&status=open`)
      .then((r) => { setList(r); setPicked(r.map((x) => x.id)); })
      .catch((e) => setError(e.message || "Couldn't load vouchers."));
  }, [fund.id]);

  const chosen = (list || []).filter((v) => picked.includes(v.id));
  const total = chosen.reduce((n, v) => n + v.amount, 0);
  const byAcc = Object.values(chosen.reduce((m, v) => {
    m[v.expense_account] ??= { account_code: v.expense_account, account_name: v.expense_name, amount: 0 };
    m[v.expense_account].amount += v.amount;
    return m;
  }, {}));
  const bankName = accOpts.find((a) => a.value === bank)?.label || "Bank";

  const submit = async () => {
    setError("");
    if (!chosen.length) return setError("Pick at least one voucher.");
    if (!bank) return setError("Pick the bank / cash account.");
    setSaving(true);
    try {
      const res = await apiFetch(`${API}/replenish`, {
        method: "POST",
        body: JSON.stringify({ fund_id: fund.id, voucher_ids: picked, txn_date: date, bank_account: bank, reference: reference || null }),
      });
      onDone(res.message);
    } catch (e) {
      setError(e.message || "Couldn't replenish.");
      setSaving(false);
    }
  };

  return (
    <Modal title={`Replenish · ${fund.name}`} onClose={() => !saving && onClose()} size="lg"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={submit} disabled={saving || !chosen.length}>{saving ? "Posting…" : `Replenish ${n2(total)}`}</button></>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 2fr 1fr" }}>
        <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="field"><span className="field-label">Bank / cash account *</span>
          <SearchSelect value={bank} onChange={setBank} options={accOpts} searchPlaceholder="Search account..." aria-label="Bank account" /></div>
        <Field label="Check / reference no."><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>

      <div className="table-scroll" style={{ maxHeight: 260, marginTop: 8 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input type="checkbox" aria-label="Select all"
                  checked={!!list?.length && picked.length === list.length}
                  onChange={(e) => setPicked(e.target.checked ? list.map((x) => x.id) : [])} />
              </th>
              <th>PCV #</th><th>Date</th><th>Payee</th><th>Account</th><th className="ta-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {!list && !error && <tr><td colSpan={6}><span className="sk sk-cell" style={{ width: "60%" }} /></td></tr>}
            {list?.length === 0 && <tr><td colSpan={6} className="empty">No unreplenished vouchers.</td></tr>}
            {list?.map((v) => (
              <tr key={v.id}>
                <td><input type="checkbox" checked={picked.includes(v.id)} aria-label={`Select ${v.pcv_no}`}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, v.id] : p.filter((x) => x !== v.id)))} /></td>
                <td className="mono">{v.pcv_no}</td>
                <td>{fmtDay(v.date)}</td>
                <td>{v.payee}</td>
                <td>{v.expense_account} <span className="muted">– {v.expense_name}</span></td>
                <td className="ta-right mono">{n2(v.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chosen.length > 0 && (
        <>
          <h4 style={{ margin: "14px 0 6px" }}>Journal entry</h4>
          <table className="table journal-table">
            <thead><tr><th>Account</th><th className="ta-right">Debit</th><th className="ta-right">Credit</th></tr></thead>
            <tbody>
              {byAcc.map((a) => (
                <tr key={a.account_code}><td>{a.account_code} - {a.account_name}</td><td className="ta-right mono">{n2(a.amount)}</td><td /></tr>
              ))}
              <tr><td>{bank ? bankName : <span className="muted">Bank / cash account</span>}</td><td /><td className="ta-right mono">{n2(total)}</td></tr>
            </tbody>
            <tfoot><tr><td /><td className="ta-right mono strong">{n2(total)}</td><td className="ta-right mono strong">{n2(total)}</td></tr></tfoot>
          </table>
        </>
      )}
    </Modal>
  );
}
