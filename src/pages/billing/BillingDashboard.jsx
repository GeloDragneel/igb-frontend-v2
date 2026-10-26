// Billing → SOA dashboard (old pages/Billing/Dashboard.php)
// client → trade name → service period (SOA) · Services · Payments · PF / Returns / Non-recurring balances
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import SearchSelect from "../../components/SearchSelect";
import Badge from "../../components/Badge";
import { useToast } from "../../components/Toast";
import { apiFetch, apiBlob } from "../../context/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import "./BillingDashboard.css";

const PAID = 1, VOID = 5, CANCELLED = 9;
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};
const fmtAt = (s) => {
  if (!s) return "";
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(d) ? s : `${fmtDay(s)} · ${d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`;
};
const ZERO_TOTALS = {
  pf: { label: "PF & Other Charges", bill: 0, paid: 0, balance: 0 },
  returns: { label: "Returns", bill: 0, paid: 0, balance: 0 },
  eo: { label: "Non-recurring / EO", bill: 0, paid: 0, balance: 0 },
};
// lists that rarely change: fetched once per session, shared by every visit to this page
let lookupsCache = null;
let accountsCache = null;

// what a service's Total is made of: fee total + VAT − withholding − discount (Option)
const breakdownNote = (s) => [
  Number(s.inherited_vat) > 0 && `incl. VAT ${n2(s.inherited_vat)}`,
  Number(s.inherited_wh) > 0 && `less WH ${n2(s.inherited_wh)}`,
  Number(s.inherited_discount_amount) > 0 && `less disc. ${n2(s.inherited_discount_amount)}`,
].filter(Boolean).join(" · ");
const breakdownTitle = (s) => `Service total ${n2(s.total_service_fee)}`
  + (Number(s.inherited_vat) > 0 ? ` + VAT 12% ${n2(s.inherited_vat)}` : "")
  + (Number(s.inherited_wh) > 0 ? ` − withholding 5% ${n2(s.inherited_wh)}` : "")
  + (Number(s.inherited_discount_amount) > 0 ? ` − discount ${n2(s.inherited_discount_amount)}` : "")
  + ` = ${n2(s.net)}  (VAT / withholding / discount are set in Option)`;
/** same rules as the server (BillingController::inherited) */
function optionAmounts(total, f = {}) {
  const vat = Number(f.d_vat) ? Math.round(total * 0.12 * 100) / 100 : 0;
  const wh = Number(f.d_witholding) ? Math.round(total * 0.05 * 100) / 100 : 0;
  const base = total + vat - wh;
  const pct = Number(f.d_less_sc) || Number(f.d_less_pwd) ? 0.2 : Number(f.d_less_sp) ? 0.1 : Number(f.d_less_others) ? (Number(f.less_other_percentage) || 0) / 100 : 0;
  const disc = Math.round(base * pct * 100) / 100;
  return { vat, wh, disc, net: Math.round((base - disc) * 100) / 100 };
}

const PRINTS = ["C_RETURN", "PT_EO_SOA", "C_EO_SOA", "EO_SOA", "CLOSE", "PT_SOA", "C_SOA", "SOA"];   // CLOSE = Close SOA, same spot as before

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

export default function BillingDashboard() {
  const notify = useToast();
  const notifyRef = useRef(notify);          // effects don't re-run when the toast function changes
  notifyRef.current = notify;

  const [lk, setLk] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [viewBy, setViewBy] = useState("business");  // business = one account (trade name - branch) · client = every account of one client
  const [caid, setCaid] = useState("");
  const [clientNum, setClientNum] = useState("");
  const [clientPeriods, setClientPeriods] = useState([]);
  const [cPeriod, setCPeriod] = useState("");        // client view: service period across the accounts
  const [groups, setGroups] = useState([]);          // pf / eo / returns – empty = all
  const [account, setAccount] = useState(null);     // TIN, address, periods of the picked account
  const [transNumber, setTransNumber] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");                   // debounced search
  const [tab, setTab] = useState("services");
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [soa, setSoa] = useState(null);
  const [totals, setTotals] = useState(ZERO_TOTALS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ticked, setTicked] = useState([]);

  // popups
  const [serviceForm, setServiceForm] = useState(null);
  const [optionsFor, setOptionsFor] = useState(null);
  const [paymentForm, setPaymentForm] = useState(null);
  const [returnFor, setReturnFor] = useState(null);
  const [override, setOverride] = useState(null);     // { kind: "void"|"cancel"|"price", ... }
  const [logsFor, setLogsFor] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [printJob, setPrintJob] = useState(null);     // { type, serviceId?, label }

  // opened from a notification (or any link): /billing/dashboard?ca_id=12&groups=eo&status=open
  const location = useLocation();
  const navigate = useNavigate();
  const keepTrans = useRef("");                       // SOA to pick once the account's periods are loaded
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (![...p.keys()].length) return;
    const ca = p.get("ca_id") || "";
    const cn = p.get("client_num") || "";
    if (ca) {
      setViewBy("business"); setClientNum(""); setCPeriod("");
      keepTrans.current = p.get("trans_number") || "";
      setCaid(ca);
    } else if (cn) {
      setViewBy("client"); setCaid(""); setTransNumber("");
      setClientNum(cn);
    }
    setGroups((p.get("groups") || "").split(",").filter((g) => TYPE_OPTS.some(([v]) => v === g)));
    setStatus(p.get("status") || "");
    setQuery(p.get("q") || "");
    setTab("services");
    navigate(location.pathname, { replace: true });   // clean address: a refresh doesn't fill it again
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    (lookupsCache ??= apiFetch("/billing/lookups").catch((e) => { lookupsCache = null; throw e; }))
      .then((d) => alive && setLk(d)).catch((e) => alive && setError(e.message || "Couldn't load the lists."));
    (accountsCache ??= apiFetch("/billing/account-list").catch((e) => { accountsCache = null; throw e; }))
      .then((d) => alive && setAccounts(d || [])).catch(() => { });
    return () => { alive = false; };
  }, []);

  useEffect(() => { const id = setTimeout(() => setQ(query.trim()), 300); return () => clearTimeout(id); }, [query]);

  // client → the service periods of all its accounts
  useEffect(() => {
    let alive = true;
    setClientPeriods([]);
    setCPeriod("");
    if (!clientNum) return;
    apiFetch(`/billing/clients/${encodeURIComponent(clientNum)}/periods`).then((p) => alive && setClientPeriods(p || []))
      .catch((e) => alive && notifyRef.current(e.message, "error"));
    return () => { alive = false; };
  }, [clientNum]);

  const isClient = viewBy === "client";
  const scoped = isClient ? !!clientNum : !!caid;      // something picked to show
  const switchView = (v) => { setViewBy(v); setCaid(""); setClientNum(""); setTransNumber(""); setCPeriod(""); setStatus(""); setQuery(""); };

  // account → info + its service periods
  useEffect(() => {
    let alive = true;
    setAccount(null);
    setTransNumber("");
    if (!caid) return;
    apiFetch(`/billing/accounts/${caid}`).then((a) => {
      if (!alive) return;
      setAccount(a);
      // a link asked for one SOA – pick it when this account has it
      if (keepTrans.current && (a?.periods || []).some((p) => p.trans_number === keepTrans.current)) setTransNumber(keepTrans.current);
      keepTrans.current = "";
    }).catch((e) => alive && notifyRef.current(e.message, "error"));
    return () => { alive = false; };

  }, [caid]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (isClient) {
      if (clientNum) p.set("client_num", clientNum);
      if (cPeriod) p.set("service_period", cPeriod);
    } else {
      if (caid) p.set("ca_id", caid);
      if (transNumber) p.set("trans_number", transNumber);
    }
    if (groups.length) p.set("groups", groups.join(","));
    if (status && tab === "services") p.set("status", status);
    if (q) p.set("q", q);
    return p.toString();
  }, [isClient, clientNum, cPeriod, caid, transNumber, groups, status, q, tab]);

  // only the newest load may fill the page (an older, slower answer must not overwrite it)
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const id = ++loadId.current;
    setError("");
    if (!scoped) { setRows([]); setMore(false); setSoa(null); setTotals(ZERO_TOTALS); setTicked([]); setLoading(false); return; }
    setLoading(true);
    try {
      const scope = new URLSearchParams(isClient
        ? { client_num: clientNum, ...(cPeriod ? { service_period: cPeriod } : {}) }
        : { ca_id: caid, ...(transNumber ? { trans_number: transNumber } : {}) });
      const [list, s, tot] = await Promise.all([
        apiFetch(`/billing/${tab}?${params}`),
        !isClient && transNumber ? apiFetch(`/billing/soa/${encodeURIComponent(transNumber)}`) : Promise.resolve(null),
        apiFetch(`/billing/totals?${scope}`),
      ]);
      if (id !== loadId.current) return;
      setRows(list.rows || []);
      setMore(!!list.more);
      setSoa(s);
      setTotals(tot || ZERO_TOTALS);
      setTicked([]);
    } catch (e) {
      if (id !== loadId.current) return;
      setError(e.message || "Couldn't load.");
      setRows([]);
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  }, [tab, params, transNumber, caid, scoped, isClient, clientNum, cPeriod]);

  useEffect(() => { load(); }, [load]);

  const t = soa?.transaction;
  // 2 lines per account:  Trade name - Branch code  /  client name (smaller, grey) – sorted by trade name
  const accountOpts = useMemo(() => [{ value: "", label: "— Select account —" }, ...[...accounts]
    .sort((a, b) => `${a.trade_name || ""} ${a.branch_code || ""}`.localeCompare(`${b.trade_name || ""} ${b.branch_code || ""}`))
    .map((a) => ({
      value: String(a.id),
      label: `${a.trade_name || "—"}${a.branch_code ? ` (${a.branch_code})` : ""}`,
      hint: a.client_name || "—",
    }))], [accounts]);
  // clients: one per client_num (from the same account list), with how many accounts they have
  const clientOpts = useMemo(() => {
    const by = new Map();
    accounts.forEach((a) => {
      if (!a.client_num) return;
      const c = by.get(a.client_num) || { value: String(a.client_num), label: a.client_name || a.client_num, n: 0 };
      c.n += 1;
      by.set(a.client_num, c);
    });
    return [{ value: "", label: "— Select client —" }, ...[...by.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((c) => ({ value: c.value, label: c.label, hint: `${c.value} · ${c.n} account${c.n === 1 ? "" : "s"}` }))];
  }, [accounts]);
  const clientPeriodOpts = useMemo(() => [{ value: "", label: clientNum ? "All periods" : "Pick a client first" },
  ...clientPeriods.map((p) => ({ value: p.service_period, label: `${p.service_period} · ${p.soas} SOA${p.soas === 1 ? "" : "s"}${p.closed ? " · closed" : ""}` }))], [clientNum, clientPeriods]);
  const periodOpts = useMemo(() => [{ value: "", label: caid ? "All periods" : "Pick an account first" },
  ...(account?.periods || []).map((p) => ({ value: p.trans_number, label: `${p.service_period || p.trans_number} · ${p.trans_number}${p.is_paid ? " · closed" : ""}` }))], [caid, account]);

  const tickable = (s) => ![PAID, VOID, CANCELLED].includes(Number(s.invoice_status_id));
  const toggle = (id) => setTicked((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const allTickable = tab === "services" ? rows.filter(tickable).map((s) => s.id) : [];
  // totals leave out void / cancelled services (same as the balance boxes)
  const sum = (k) => rows.reduce((n, r) => ([VOID, CANCELLED].includes(Number(r.invoice_status_id)) ? n : n + (Number(r[k]) || 0)), 0);

  const addRow = () => {
    if (!t) return notify("Pick an account and a service period to add to its SOA", "error");
    if (tab === "services") setServiceForm({ id: null, trans_number: t.trans_number, ser_list_id: "", ser_fee_id: null, prep_target_date: today(), service_fee: "", qty: "1", less: "", surcharge: "", orig_fee: null });
    else setPaymentForm({ id: null, trans_number: t.trans_number, service_id: "", payment_date: today(), payment_type_id: "", cheque_type_id: "", cheque_type_date: "", details1: "", details2: "", amount: "", payment_col_type_id: "", receipt_type_id: "", receipt_no: "" });
  };

  // shortcut: open "Add payment" with this service already picked and the balance as the amount
  const payNow = (s) => {
    let payment_col_type_id = '';
    if (s.ser_type_id === 2) {
      payment_col_type_id = 3;
    }
    if (s.ser_type_id === 3) {
      payment_col_type_id = 2;
    }
    if (s.ser_type_id === 4) {
      payment_col_type_id = 1;
    }
    if (s.ser_type_id === 5) {
      payment_col_type_id = 1;
    }
    setPaymentForm({
      id: null, trans_number: s.trans_number, service_id: String(s.id), payment_date: today(),
      payment_type_id: "1", cheque_type_id: "", cheque_type_date: "", details1: "", details2: "",
      amount: (Number(s.balance) || 0).toFixed(2), payment_col_type_id: payment_col_type_id, receipt_type_id: "", receipt_no: "",
    });
  };

  // open the edit popup for a service row
  const editService = (s, dead) => setServiceForm({
    id: s.id, trans_number: s.trans_number, ser_list_id: String(s.ser_list_id || ""), ser_fee_id: s.ser_fee_id, prep_target_date: s.prep_target_date || today(),
    service_fee: String(s.service_fee), qty: String(s.qty), less: s.less ? String(s.less) : "", surcharge: s.surcharge ? String(s.surcharge) : "",
    orig_fee: s.service_fee, locked: dead,
    // Option flags (VAT / withholding / discount) – the popup shows the same Total as the list
    flags: { d_vat: s.d_vat, d_witholding: s.d_witholding, d_less_sc: s.d_less_sc, d_less_sp: s.d_less_sp, d_less_pwd: s.d_less_pwd, d_less_others: s.d_less_others, less_other_percentage: s.less_other_percentage },
  });

  const voidCancel = (kind) => {
    if (!ticked.length) return notify(kind === "void" ? "Please select item to void" : "Please select item to cancel", "error");
    setOverride({ kind, ids: ticked });
  };

  const closeSoa = async () => {
    setConfirmClose(false);
    try {
      const res = await apiFetch(`/billing/soa/${encodeURIComponent(t.trans_number)}/close`, { method: "POST" });
      notify(res.message);
      load();
    } catch (e) { notify(e.message, "error"); }
  };

  const clearFilters = () => { setCaid(""); setClientNum(""); setTransNumber(""); setCPeriod(""); setGroups([]); setStatus(""); setQuery(""); };
  const filtered = caid || clientNum || transNumber || cPeriod || groups.length || status || q;
  const who = (r) => (
    <div className="bd-who">
      <span className="strong">{r.client_name || "—"}</span>
      <span className="muted small">{r.trade_name || "—"}{r.branch_code ? ` | ${r.branch_code}` : ""}</span>
    </div>
  );
  const soaCell = (r) => (
    <div className="bd-who">
      <span className="mono">{r.trans_number || "—"}</span>
      <span className="muted small">{r.service_period || ""}</span>
    </div>
  );

  return (
    <div className="bd">
      {/* ---------- filters ---------- */}
      <section className="card bd-filters">
        <label className="bd-filter bd-filter-view">
          <span className="field-label">View by</span>
          <select className="input" value={viewBy} onChange={(e) => switchView(e.target.value)}>
            <option value="business">Business</option>
            <option value="client">Client</option>
          </select>
        </label>
        {isClient ? (
          <>
            <div className="bd-filter bd-filter-wide">
              <span className="field-label">Client (all of their accounts)</span>
              <SearchSelect value={clientNum} onChange={setClientNum} options={clientOpts} searchPlaceholder="Search client name or number..." aria-label="Client" />
            </div>
            <div className="bd-filter">
              <span className="field-label">Service period</span>
              <SearchSelect value={cPeriod} onChange={setCPeriod} options={clientPeriodOpts} searchPlaceholder="Search period..." aria-label="Service period" />
            </div>
          </>
        ) : (
          <>
            <div className="bd-filter bd-filter-wide">
              <span className="field-label">Account (trade name - branch · client)</span>
              <SearchSelect value={caid} onChange={setCaid} options={accountOpts} searchPlaceholder="Search trade name, branch or client..." aria-label="Account" />
            </div>
            <div className="bd-filter">
              <span className="field-label">Service period (SOA)</span>
              <SearchSelect value={transNumber} onChange={setTransNumber} options={periodOpts} searchPlaceholder="Search period..." aria-label="Service period" />
            </div>
          </>
        )}
        <div className="bd-filter bd-filter-sm">
          <span className="field-label">Type</span>
          <TypePicker value={groups} onChange={setGroups} disabled={!scoped} />
        </div>
        <label className="bd-filter bd-filter-sm">
          <span className="field-label">Status</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} disabled={!scoped || tab !== "services"}>
            <option value="">All</option>
            <option value="open">Unpaid + partial</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="bd-filter">
          <span className="field-label">Search</span>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} disabled={!scoped} placeholder={tab === "services" ? "Service, client or SOA #..." : "Service, client, SOA #, AR / OR, reference..."} />
        </label>
        <div className="bd-filter-actions">
          {filtered && <button className="btn" onClick={clearFilters}>Clear</button>}
        </div>

        {!isClient && account && (
          <p className="bd-info">
            <span>TIN <b>{account.tin || "—"}</b></span>
            <span>{account.branch_type || "—"}</span>
            <span>{[account.street, account.barangay, account.city, account.province].filter(Boolean).join(", ") || "No address"}</span>
          </p>
        )}
      </section>

      {/* ---------- PF / Returns / Non-recurring (always shown) ---------- */}
      <section className="card bd-soa">
        <div className="bd-soa-id">
          {t ? (
            <>
              <span className="muted small">SOA</span>
              <b className="mono">{t.trans_number}</b>
              <span className="muted small">{t.service_period}</span>
              {t.is_paid && <Badge tone="green">SOA closed</Badge>}
            </>
          ) : (
            <>
              <span className="muted small">Totals</span>
              <b>{!scoped ? (isClient ? "No client" : "No account") : (isClient && cPeriod) || "All periods"}</b>
              <span className="muted small">
                {!scoped ? (isClient ? "Select a client" : "Select an account")
                  : isClient ? `all ${clientOpts.find((c) => c.value === clientNum)?.hint?.split("· ")[1] || "accounts"} of this client` : "of this account"}
              </span>
            </>
          )}
        </div>
        <div className="bd-totals">
          {Object.entries(totals).map(([k, g]) => (
            <div key={k} className={`bd-total${groups.length && !groups.includes(k) ? " is-dim" : ""}`}>
              <h4>{g.label}</h4>
              <dl>
                <dt>Actual bill</dt><dd>{n2(g.bill)}</dd>
                <dt>Total payment</dt><dd>{n2(g.paid)}</dd>
                <dt>Balance</dt><dd className={g.balance > 0.009 ? "is-due" : "is-ok"}>{n2(g.balance)}</dd>
              </dl>
            </div>
          ))}
        </div>
      </section>

      {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

      {/* ---------- list ---------- */}
      <section className="card bd-body">
        <div className="bd-tabs" role="tablist">
          {[["services", "Services"], ["payments", "Payments"]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => { setTab(k); setRows([]); }}>
              {l} {tab === k && scoped && !loading && <span className="bd-count">{rows.length}{more ? "+" : ""}</span>}
            </button>
          ))}
          <button className="btn btn-primary bd-add" onClick={addRow} disabled={!t} title={t ? "" : "Pick an account and a service period first"}>
            + Add {tab === "services" ? "service" : "payment"}
          </button>
        </div>

        <div className="bd-scroll">
          {!scoped && (
            <div className="bd-pick">
              <b>{isClient ? "Select a client" : "Select an account"}</b>
              <span>{isClient
                ? "Pick a client above to see the services and payments of all their accounts."
                : "Pick an account (trade name - branch) above to see its services and payments."}</span>
            </div>
          )}
          {scoped && loading && <p className="bd-empty">Loading…</p>}

          {scoped && !loading && tab === "services" && (
            <table className="bd-table">
              <thead>
                <tr>
                  <th className="c">
                    <input type="checkbox" aria-label="Select all" checked={allTickable.length > 0 && allTickable.every((id) => ticked.includes(id))}
                      onChange={(e) => setTicked(e.target.checked ? allTickable : [])} disabled={!allTickable.length} />
                  </th>
                  <th>Client / branch</th><th>SOA</th><th>Service</th><th className="n">Due date</th>
                  <th className="n">Total</th><th className="n">Paid</th><th className="n">Balance</th><th className="c">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={9} className="bd-empty">{filtered ? "No services match the filters." : "No services yet."}</td></tr>}
                {rows.map((s) => {
                  const st = Number(s.invoice_status_id);
                  const dead = st === VOID || st === CANCELLED;
                  return (
                    <tr key={s.id} className={`bd-row is-static${dead ? " is-dead" : ""}`}>
                      <td className="c">
                        <input type="checkbox" aria-label={`Select ${s.service}`} disabled={!tickable(s)} checked={ticked.includes(s.id)} onChange={() => toggle(s.id)} />
                      </td>
                      <td>{who(s)}</td>
                      <td>{soaCell(s)}</td>
                      <td className="bd-svc">{s.service}</td>
                      <td className="n">{fmtDay(s.prep_target_date)}</td>
                      <td className="n strong bd-net-cell" title={breakdownTitle(s)}>
                        {n2(s.net)}
                        {breakdownNote(s) && <small className="bd-net-note">{breakdownNote(s)}</small>}
                      </td>
                      <td className="n">{dead ? "" : n2(s.paid || 0)}</td>
                      {(() => {
                        // paid more than the bill (e.g. paid the gross 6,720 on a 6,669 bill) → show the excess as a credit
                        const over = dead ? 0 : r2((Number(s.paid) || 0) - (Number(s.net) || 0));
                        return (
                          <td className={`n bd-net-cell ${s.balance > 0.009 ? "is-due" : over > 0.009 ? "is-over" : ""}`}
                            title={over > 0.009 ? `Overpaid by ${n2(over)} — counted as a credit in the balance` : undefined}>
                            {dead ? "" : over > 0.009 ? `(${n2(over)})` : n2(s.balance)}
                            {over > 0.009 && <small className="bd-net-note">overpaid</small>}
                          </td>
                        );
                      })()}
                      <td className="c">
                        <div className="bd-actions">
                          {dead ? (
                            <button className="btn btn-sm" onClick={() => setLogsFor(s)} title="Override logs">Logs</button>
                          ) : (
                            <button className="btn btn-sm btn-primary"
                              disabled={st === PAID || !(s.balance > 0.009)}
                              onClick={() => payNow(s)}
                              title={st === PAID ? "Already paid" : "Add payment for this service"}>Pay</button>
                          )}
                          <button className="btn btn-sm"
                            // disabled={dead || st === PAID} 
                            onClick={() => setOptionsFor(s)}
                            title="VAT, withholding, discount">Option</button>
                          <button className="btn btn-sm" onClick={() => editService(s, dead)}
                            title={dead ? "View (void / cancelled)" : "Edit service"}>Edit</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td /><td colSpan={4}>Total · {rows.length} service{rows.length === 1 ? "" : "s"}{more ? " (first 500 – narrow the filters)" : ""}</td>
                    <td className="n">{n2(sum("net"))}</td><td className="n">{n2(sum("paid"))}</td><td className="n" title="Total − Paid (overpayments count as credit, same as the Balance box)">{n2(sum("net") - sum("paid"))}</td><td />
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {scoped && !loading && tab === "payments" && (
            <table className="bd-table">
              <thead>
                <tr>
                  <th>Client / branch</th><th>SOA</th><th>Service</th><th>Date</th><th>Method</th><th>Bank / wallet</th>
                  <th>Ref / cheque #</th><th>Col type</th><th>AR / OR / AP</th><th className="n">Amount</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={11} className="bd-empty">{filtered ? "No payments match the filters." : "No payments yet."}</td></tr>}
                {rows.map((p) => (
                  <tr key={p.id} className="bd-row" onClick={() => setPaymentForm({
                    id: p.id, trans_number: p.trans_number, service_id: p.service_id ? String(p.service_id) : "", payment_date: p.payment_date || today(),
                    payment_type_id: p.payment_type_id ? String(p.payment_type_id) : "", cheque_type_id: p.cheque_type_id ? String(p.cheque_type_id) : "",
                    cheque_type_date: p.cheque_type_date || "", details1: p.details1 || "", details2: p.details2 || "", amount: String(p.amount),
                    payment_col_type_id: p.payment_col_type_id ? String(p.payment_col_type_id) : "", receipt_type_id: p.receipt_type_id ? String(p.receipt_type_id) : "",
                    receipt_no: p.receipt_no || "", deposited: !!Number(p.deposited),
                  })}>
                    <td>{who(p)}</td>
                    <td>{soaCell(p)}</td>
                    <td className="bd-svc">{p.service}</td>
                    <td>{fmtDay(p.payment_date)}</td>
                    <td>{p.payment_type || "—"}{p.cheque_type ? ` · ${p.cheque_type}` : ""}</td>
                    <td>{p.details1 || "—"}</td>
                    <td>{p.details2 || "—"}</td>
                    <td>{p.col_type || "—"}</td>
                    <td>{p.receipt_no || ""}</td>
                    <td className="n strong">{n2(p.amount)}</td>
                    <td className="c" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm" disabled={Number(p.payment_col_type_id) !== 2} title={Number(p.payment_col_type_id) === 2 ? "Itemized return" : "Only for return payments"}
                        onClick={() => {
                          if (!p.service_id) return notify("Please update service in payment first", "error");
                          setReturnFor(p);
                        }}>Return</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr><td colSpan={9}>Total · {rows.length} payment{rows.length === 1 ? "" : "s"}{more ? " (first 500 – narrow the filters)" : ""}</td><td className="n">{n2(sum("amount"))}</td><td /></tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </section>

      {/* ---------- footer actions (same buttons as the old page) ---------- */}
      <footer className="bd-foot">
        <div className="bd-foot-group">
          <button className="btn btn-danger" onClick={() => voidCancel("void")} disabled={tab !== "services" || !ticked.length}>VOID</button>
          <button className="btn btn-warning" onClick={() => voidCancel("cancel")} disabled={tab !== "services" || !ticked.length}>CANCEL</button>
          {ticked.length > 0 && <span className="muted small">{ticked.length} selected</span>}
        </div>
        <div className="bd-foot-group">
          {PRINTS.map((k) => k === "CLOSE" ? (
            <button key={k} className="btn btn-info" onClick={() => setConfirmClose(true)} disabled={!t || t.is_paid}
              title={!t ? "Select a service period first" : t.is_paid ? "Already closed" : ""}>CLOSE SOA</button>
          ) : (
            <button key={k} className="btn btn-info" disabled={!t} title={t ? "" : "Select a service period first"}
              onClick={() => setPrintJob({ type: k, label: k })}>{k}</button>
          ))}
          <button className="btn btn-info" onClick={load} disabled={!scoped || loading}>REFRESH</button>
        </div>
      </footer>

      {serviceForm && lk && (
        <ServiceModal initial={serviceForm} lk={lk} transNumber={serviceForm.trans_number}
          onNeedOverride={(body) => setOverride({ kind: "price", serviceId: serviceForm.id, body })}
          onClose={() => setServiceForm(null)} onSaved={(m) => { setServiceForm(null); notify(m); load(); }} />
      )}
      {optionsFor && <OptionsModal service={optionsFor} noteMax={Number(lk?.note_max) || 65535} onClose={() => setOptionsFor(null)} onSaved={(m) => { setOptionsFor(null); notify(m); load(); }}
        onPrint={() => setPrintJob({ type: "SOA2", serviceId: optionsFor.id, trans: optionsFor.trans_number, label: `SOA / item · ${optionsFor.service}` })} />}
      {printJob && <PrintModal transNumber={printJob.trans || t?.trans_number} job={printJob} onClose={() => setPrintJob(null)} />}
      {paymentForm && lk && (
        <PaymentModal initial={paymentForm} lk={lk} transNumber={paymentForm.trans_number}
          onClose={() => setPaymentForm(null)} onSaved={(m) => { setPaymentForm(null); notify(m); load(); }} />
      )}
      {returnFor && lk && <ReturnModal payment={returnFor} lk={lk}
        onClose={() => setReturnFor(null)} onSaved={(m) => { setReturnFor(null); notify(m); load(); }} />}
      {override && (
        <OverrideModal kind={override.kind} count={override.ids?.length}
          onClose={() => setOverride(null)}
          onSubmit={async (cred) => {
            if (override.kind === "price") {
              const res = await apiFetch(`/billing/services/${override.serviceId}`, { method: "PUT", body: JSON.stringify({ ...override.body, ...cred }) });
              setOverride(null); setServiceForm(null); notify(res.message); load();
            } else {
              const res = await apiFetch("/billing/services/void-cancel", { method: "POST", body: JSON.stringify({ type: override.kind, ids: override.ids, ...cred }) });
              setOverride(null); notify(res.message); load();
            }
          }} />
      )}
      {logsFor && <LogsModal service={logsFor} onClose={() => setLogsFor(null)} />}
      {confirmClose && (
        <ConfirmDialog title="Close SOA?" message="Are you sure you want to close this transaction?" confirmLabel="Close SOA"
          onCancel={() => setConfirmClose(false)} onConfirm={closeSoa} />
      )}
    </div>
  );
}

/* ---------- add / edit service (old modal_ChargesAndPenalty) ---------- */
export function ServiceModal({ initial, lk, transNumber, onClose, onSaved, onNeedOverride, freePrice = false }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const opts = [{ value: "", label: "— Select service —" }, ...lk.services.map((s) => ({ value: String(s.id), label: s.name }))];

  const gross = num(f.service_fee) * num(f.qty);
  const total = gross - num(f.less) + gross * (num(f.surcharge) / 100);
  const opt = optionAmounts(Math.round(total * 100) / 100, f.flags);
  const hasOpt = opt.vat > 0 || opt.wh > 0 || opt.disc > 0;

  const pickService = (v) => {
    const s = lk.services.find((x) => String(x.id) === v);
    setF((x) => ({ ...x, ser_list_id: v, ser_fee_id: s?.fee_id || null, service_fee: s ? String(Number(s.fee) || "") : x.service_fee }));
  };

  const save = async () => {
    setError("");
    if (!f.ser_list_id) return setError("Please select service");
    if (!(num(f.service_fee) > 0)) return setError("Please input unit price");
    if (!(num(f.qty) > 0)) return setError("Please input qty");
    const body = {
      ser_list_id: Number(f.ser_list_id), ser_fee_id: f.ser_fee_id || null, prep_target_date: f.prep_target_date,
      service_fee: num(f.service_fee), qty: num(f.qty), less: num(f.less), surcharge: num(f.surcharge),
    };
    // editing the unit price needs a supervisor
    if (!freePrice && f.id && Math.abs(num(f.service_fee) - Number(f.orig_fee)) > 0.004) return onNeedOverride(body);
    setSaving(true);
    try {
      const res = f.id
        ? await apiFetch(freePrice ? `/billing/return-ar/services/${f.id}` : `/billing/services/${f.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await apiFetch(`/billing/soa/${encodeURIComponent(transNumber)}/services`, { method: "POST", body: JSON.stringify(body) });
      onSaved(res.message);
    } catch (e) {
      setError(e.message || "Couldn't save.");
      setSaving(false);
    }
  };

  return (
    <Modal title={f.id ? "Edit charges and penalty" : "Add charges and penalty"} onClose={() => !saving && onClose()} size="md"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button>
        {!f.locked && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : f.id ? "Save" : "Add"}</button>}</>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {f.locked && <div className="inv-banner">This service is void / cancelled.</div>}
      <div className="bd-form">
        <div className="field bd-span-all"><span className="field-label">Service</span>
          <SearchSelect value={f.ser_list_id} onChange={pickService} options={opts} searchPlaceholder="Search service..." aria-label="Service" /></div>
        <Field label="Due date"><input type="date" className="input" value={f.prep_target_date} onChange={(e) => set("prep_target_date", e.target.value)} /></Field>
        <Field label={f.id && !freePrice ? "Unit price (change needs a supervisor)" : "Unit price"}><input className="input ta-right" inputMode="decimal" value={f.service_fee} onChange={(e) => set("service_fee", cleanNum(e.target.value))} /></Field>
        <Field label="Qty"><input className="input ta-right" inputMode="decimal" value={f.qty} onChange={(e) => set("qty", cleanNum(e.target.value))} /></Field>
        <Field label="Less"><input className="input ta-right" inputMode="decimal" value={f.less} onChange={(e) => set("less", cleanNum(e.target.value))} placeholder="0.00" /></Field>
        <Field label="Surcharge (%)"><input className="input ta-right" inputMode="decimal" value={f.surcharge} onChange={(e) => set("surcharge", cleanNum(e.target.value))} placeholder="0" /></Field>
        <Field label={hasOpt ? "Service total" : "Total"}><input className="input ta-right strong" disabled value={n2(total)} /></Field>
      </div>
      {hasOpt && (
        <dl className="bd-opt bd-opt-sum">
          <dt>Service total</dt><dd>{n2(total)}</dd>
          {opt.vat > 0 && <><dt>+ VAT (12%)</dt><dd>{n2(opt.vat)}</dd></>}
          {opt.wh > 0 && <><dt>− Withholding (5%)</dt><dd>({n2(opt.wh)})</dd></>}
          {opt.disc > 0 && <><dt>− Discount</dt><dd>({n2(opt.disc)})</dd></>}
          <dt className="strong">Total due</dt><dd className="bd-net">{n2(opt.net)}</dd>
        </dl>
      )}
      {hasOpt && <p className="muted small">VAT / withholding / discount come from <b>Option</b> on this service – untick them there if they don't apply.</p>}
    </Modal>
  );
}

/* ---------- VAT / withholding / discount (old modal_ServiceOptions) ---------- */
export function OptionsModal({ service, onClose, onSaved, onPrint, noteMax = 65535 }) {
  const initialDisc = service.d_less_sc ? "SC" : service.d_less_sp ? "SP" : service.d_less_pwd ? "PWD" : service.d_less_others ? "Others" : "";
  const [vat, setVat] = useState(!!Number(service.d_vat));
  const [wh, setWh] = useState(!!Number(service.d_witholding));
  const [disc, setDisc] = useState(initialDisc);
  const [pct, setPct] = useState(service.less_other_percentage ? String(service.less_other_percentage) : "");
  const [note, setNote] = useState(service.note || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fee = Number(service.total_service_fee) || 0;
  const vatAmt = vat ? fee * 0.12 : 0;
  const whAmt = wh ? fee * 0.05 : 0;
  const rate = disc === "SC" || disc === "PWD" ? 0.2 : disc === "SP" ? 0.1 : disc === "Others" ? num(pct) / 100 : 0;
  const discAmt = (fee + vatAmt - whAmt) * rate;
  const net = fee + vatAmt - whAmt - discAmt;
  const LABEL = { SC: "Senior Citizen", SP: "Solo Parent", PWD: "Person w/ Disability", Others: "Others" };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/billing/services/${service.id}/options`, {
        method: "PUT",
        body: JSON.stringify({ d_vat: vat, d_witholding: wh, discount: disc || null, less_other_percentage: disc === "Others" ? num(pct) : 0, note }),
      });
      onSaved(res.message);
    } catch (e) {
      setError(e.message || "Couldn't save.");
      setSaving(false);
    }
  };

  return (
    <Modal title={`Options · ${service.service}`} onClose={() => !saving && onClose()} size="md"
      footer={<>
        {onPrint && <button className="btn btn-info bd-left" onClick={onPrint} disabled={saving}>PRINT SOA / ITEM</button>}
        <button className="btn" onClick={onClose} disabled={saving}>Close</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <dl className="bd-opt">
        <dt>Service fee</dt><dd>{n2(fee)}</dd>
        <dt><label><input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} /> Value added tax (12%)</label></dt><dd>{n2(vatAmt)}</dd>
        <dt><label><input type="checkbox" checked={wh} onChange={(e) => setWh(e.target.checked)} /> Withholding (5%)</label></dt><dd>({n2(whAmt)})</dd>
      </dl>
      <fieldset className="bd-disc">
        <legend>Less</legend>
        {["SC", "SP", "PWD", "Others"].map((k) => (
          <label key={k} className="bd-radio">
            <input type="radio" name="disc" checked={disc === k} onChange={() => setDisc(k)} onClick={() => disc === k && setDisc("")} />
            {LABEL[k]} {k === "SC" || k === "PWD" ? "(20%)" : k === "SP" ? "(10%)" : ""}
            {k === "Others" && (
              <input className="input bd-pct" inputMode="decimal" disabled={disc !== "Others"} value={pct} onChange={(e) => setPct(cleanNum(e.target.value))} placeholder="%" aria-label="Discount %" />
            )}
          </label>
        ))}
      </fieldset>
      <dl className="bd-opt">
        <dt>Applied discount</dt><dd>{disc ? LABEL[disc] : "None"}</dd>
        <dt>Discount amount</dt><dd>({n2(discAmt)})</dd>
        <dt className="strong">Total</dt><dd className="bd-net">{n2(net)}</dd>
      </dl>
      <Field label="Note">
        <textarea className="input" rows={3} value={note} maxLength={noteMax} onChange={(e) => setNote(e.target.value.slice(0, noteMax))} />
        <small className={`muted bd-note-count${note.length >= noteMax ? " is-due" : ""}`}>{note.length} / {noteMax}</small>
      </Field>
    </Modal>
  );
}

/* ---------- add / edit payment (old modal_Payment) ---------- */
function PaymentModal({ initial, lk, transNumber, onClose, onSaved }) {
  const [services, setServices] = useState([]);
  useEffect(() => {
    if (!transNumber) return;
    apiFetch(`/billing/soa/${encodeURIComponent(transNumber)}`).then((d) => setServices(d.services || [])).catch(() => setServices([]));
  }, [transNumber]);
  const [f, setF] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const opt = (rows) => [{ value: "", label: "—" }, ...(rows || []).map((r) => ({ value: String(r.id), label: r.name }))];
  const svcOpts = [{ value: "", label: "— Select service —" }, ...services
    .filter((s) => ![VOID, CANCELLED].includes(Number(s.invoice_status_id)))
    .map((s) => ({ value: String(s.id), label: `${s.service} - ${n2(s.net)}` }))];
  const cheque = f.payment_type_id === "2";
  const rt = Number(f.receipt_type_id);
  const noLabel = rt === 2 ? "AP #" : rt === 3 ? "OR #" : "AR #";

  const pickService = (v) => {
    const s = services.find((x) => String(x.id) === v);
    setF((x) => ({ ...x, service_id: v, amount: !x.id && s ? String(s.net) : x.amount, payment_type_id: x.payment_type_id || "1" }));
  };

  const save = async () => {
    setError("");
    if (!f.service_id) return setError("Service is required");
    if (!f.payment_type_id) return setError("Please select payment method");
    if (!f.payment_col_type_id) return setError("Please select payment col type");
    if (!(num(f.amount) > 0)) return setError("Please input the amount");
    setSaving(true);
    try {
      const body = {
        service_id: Number(f.service_id), payment_date: f.payment_date, payment_type_id: Number(f.payment_type_id),
        cheque_type_id: cheque && f.cheque_type_id ? Number(f.cheque_type_id) : null, cheque_type_date: cheque ? f.cheque_type_date || null : null,
        details1: f.details1 || null, details2: f.details2 || null, amount: num(f.amount),
        payment_col_type_id: Number(f.payment_col_type_id), receipt_type_id: f.receipt_type_id ? Number(f.receipt_type_id) : null, receipt_no: f.receipt_no || null,
      };
      const res = f.id
        ? await apiFetch(`/billing/payments/${f.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await apiFetch(`/billing/soa/${encodeURIComponent(transNumber)}/payments`, { method: "POST", body: JSON.stringify(body) });
      onSaved(res.message);
    } catch (e) {
      setError(e.message || "Couldn't save.");
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDel(false);
    try {
      const res = await apiFetch(`/billing/payments/${f.id}`, { method: "DELETE" });
      onSaved(res.message);
    } catch (e) { setError(e.message || "Couldn't remove."); }
  };

  return (
    <Modal title={`${f.id ? `Edit payment #${f.id}` : "Add payment"} · ${transNumber || ""}`} onClose={() => !saving && onClose()} size="md"
      footer={<>
        {f.id && !f.deposited && <button className="btn btn-danger bd-left" onClick={() => setConfirmDel(true)} disabled={saving}>Remove</button>}
        <button className="btn" onClick={onClose} disabled={saving}>Close</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : f.id ? "Save" : "Add"}</button>
      </>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {f.deposited && <div className="inv-banner">Already deposited.</div>}
      <div className="bd-form">
        <div className="field bd-span-all"><span className="field-label">Service</span>
          <SearchSelect value={f.service_id} onChange={pickService} options={svcOpts} aria-label="Service" /></div>
        <Field label="Payment date"><input type="date" className="input" value={f.payment_date} onChange={(e) => set("payment_date", e.target.value)} /></Field>
        <Field label="Payment method">
          <select className="input" value={f.payment_type_id} onChange={(e) => set("payment_type_id", e.target.value)}>
            {opt(lk.payment_types).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Cheque type">
          <select className="input" value={f.cheque_type_id} disabled={!cheque} onChange={(e) => set("cheque_type_id", e.target.value)}>
            {opt(lk.cheque_types).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Cheque date"><input type="date" className="input" disabled={!cheque} value={f.cheque_type_date} onChange={(e) => set("cheque_type_date", e.target.value)} /></Field>
        <Field label="Bank / wallet"><input className="input" value={f.details1} onChange={(e) => set("details1", e.target.value)} /></Field>
        <Field label="Reference / cheque #"><input className="input" value={f.details2} onChange={(e) => set("details2", e.target.value)} /></Field>
        <Field label="Amount"><input className="input ta-right" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", cleanNum(e.target.value))} /></Field>
        <Field label="Payment col type">
          <select className="input" value={f.payment_col_type_id} onChange={(e) => set("payment_col_type_id", e.target.value)}>
            {opt(lk.col_types).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Receipt type">
          <select className="input" value={f.receipt_type_id} onChange={(e) => set("receipt_type_id", e.target.value)}>
            {opt(lk.receipt_types).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label={noLabel}><input className="input" disabled={!f.receipt_type_id} value={f.receipt_no} onChange={(e) => set("receipt_no", e.target.value)} /></Field>
      </div>
      {confirmDel && <ConfirmDialog title={`Remove payment #${f.id}?`} message="The service balances are recomputed." confirmLabel="Remove" onCancel={() => setConfirmDel(false)} onConfirm={remove} />}
    </Modal>
  );
}

/* ---------- itemized return (old modal_PaymentReturn) ---------- */
function ReturnModal({ payment, lk, onClose, onSaved }) {
  const [total, setTotal] = useState(String(payment.amount));
  const [status, setStatus] = useState(payment.return_status_id ? String(payment.return_status_id) : "");
  const [paid, setPaid] = useState(!!Number(payment.service_is_paid));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/billing/payments/${payment.id}/return`, {
        method: "PUT", body: JSON.stringify({ total: num(total), return_status_id: status ? Number(status) : null, is_paid: paid }),
      });
      onSaved(res.message);
    } catch (e) {
      setError(e.message || "Couldn't save.");
      setSaving(false);
    }
  };

  return (
    <Modal title="Itemized returns" onClose={() => !saving && onClose()} size="sm"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="bd-form bd-form-1">
        <Field label="Service"><input className="input" disabled value={payment.service} /></Field>
        <Field label="Total"><input className="input ta-right" inputMode="decimal" value={total} onChange={(e) => setTotal(cleanNum(e.target.value))} /></Field>
        <Field label="Return status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">—</option>
            {(lk.return_statuses || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <label className="bd-check"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paid</label>
      </div>
    </Modal>
  );
}

/* ---------- supervisor override (void / cancel / price change) ---------- */
function OverrideModal({ kind, count, onClose, onSubmit }) {
  const [f, setF] = useState({ remarks: "", username: "", password: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const title = kind === "void" ? `Void ${count} service(s)` : kind === "cancel" ? `Cancel ${count} service(s)` : "Change unit price";

  const submit = async () => {
    if (!f.username.trim()) return setError("Username is required");
    if (!f.password) return setError("Password is required");
    setError("");
    setSaving(true);
    try {
      await onSubmit({ remarks: f.remarks, username: f.username.trim(), password: f.password });
    } catch (e) {
      setError(e.message || "Couldn't submit.");
      setSaving(false);
    }
  };

  return (
    <Modal title={`Supervisor override · ${title}`} onClose={() => !saving && onClose()} size="sm"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Submitting…" : "Submit"}</button></>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="bd-form bd-form-1">
        <Field label="Remarks / reason"><textarea className="input" rows={3} maxLength={1000} value={f.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
        <Field label="Username"><input className="input" autoComplete="off" value={f.username} onChange={(e) => set("username", e.target.value)} /></Field>
        <Field label="Password">
          <input type="password" className="input" autoComplete="new-password" value={f.password} onChange={(e) => set("password", e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </Field>
      </div>
    </Modal>
  );
}

/* ---------- override logs (old btn_MessagePopup) ---------- */
function LogsModal({ service, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch(`/billing/services/${service.id}/logs`).then(setRows).catch((e) => setError(e.message || "Couldn't load the logs."));
  }, [service.id]);
  return (
    <Modal title={`Logs · ${service.service}`} onClose={onClose} size="sm" footer={<button className="btn" onClick={onClose}>Close</button>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {!rows && !error && <span className="sk sk-cell" />}
      {rows && rows.length === 0 && <p className="bd-empty">No logs.</p>}
      {rows && rows.length > 0 && (
        <ul className="bd-logs">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="strong">{r.action ? `${r.action} · ` : ""}{r.employee || "—"}{r.approved_by ? ` (approved by ${r.approved_by})` : ""}</div>
              <div>{r.remarks || "No comment"}</div>
              <div className="muted small">{fmtAt(r.created_at)}</div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* ---------- print preview (old modal_PrintPDF) ---------- */
function PrintModal({ transNumber, job, onClose }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    const qs = job.serviceId ? `?service_id=${job.serviceId}` : "";
    apiBlob(`/billing/soa/${encodeURIComponent(transNumber)}/print/${job.type}${qs}`)
      .then((blob) => { if (!alive) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch((e) => alive && setError(e.message || "Couldn't create the report."));
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [transNumber, job]);

  return (
    <Modal title={`Print Preview · ${job.label}`} onClose={onClose} size="xlg"
      footer={<>
        {url && <a className="btn" href={url} download={`${job.type}-${transNumber}.pdf`}>Download</a>}
      </>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {!url && !error && <div className="bd-pdf-wait">Preparing {job.label}…</div>}
      {url && <iframe className="bd-pdf" src={url} title={job.label} />}
    </Modal>
  );
}
/* ---------- Type: PF / EO / Return, pick any (none = all) ---------- */
const TYPE_OPTS = [["pf", "PF & other charges", "PF"], ["eo", "Non-recurring / EO", "EO"], ["returns", "Returns", "Return"]];
function TypePicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const flip = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : TYPE_OPTS.map(([v]) => v).filter((v) => v === k || value.includes(v)));
  const text = !value.length || value.length === TYPE_OPTS.length ? "All types" : TYPE_OPTS.filter(([v]) => value.includes(v)).map(([, , s]) => s).join(", ");
  return (
    <div className="bd-types" ref={box}>
      <button type="button" className={`input bd-types-btn${value.length && value.length < TYPE_OPTS.length ? " is-on" : ""}`} onClick={() => setOpen((o) => !o)}
        disabled={disabled} aria-haspopup="listbox" aria-expanded={open}>
        <span>{text}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div className="bd-types-pop" role="listbox" aria-multiselectable="true">
          {TYPE_OPTS.map(([v, l]) => (
            <label key={v} className="bd-types-opt">
              <input type="checkbox" checked={value.includes(v)} onChange={() => flip(v)} />
              <span>{l}</span>
            </label>
          ))}
          <div className="bd-types-foot">
            <button type="button" className="btn btn-sm" onClick={() => onChange([])}>All</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}