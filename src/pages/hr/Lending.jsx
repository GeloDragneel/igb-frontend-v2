// Lending: investments (invest / top up / cash out anytime), loans (apply → approve → release → pay), members, settings
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import SearchSelect from "../../components/SearchSelect";
import { Badge, DataTable, EmployeeSelect, Field, Pager, Tabs, api, fmtDate, n2, pct, todayPH, useForm, usePaged } from "./HRShared";
import "./Lending.css";
import "./LendingInvest.css";

const RATE_LABEL = { per_day: "per day", per_month: "per month", fixed: "fixed", flat: "per due · flat" };
const rateText = (r) => (r.interest_type === "fixed" ? `${n2(r.fixed_interest)} fixed` : `${pct(r.interest_rate, 3)} ${RATE_LABEL[r.interest_type] || ""}`);
// how often the dues fall
const FREQ_LABEL = { semi_monthly: "every 15th / end", monthly: "monthly", weekly: "weekly" };
// Excel penalty: 5% a month on the overdue due = 0.05 / 30 a day
const EXCEL_PENALTY = 0.001667;
const termText = (r) => (r.interest_type === "flat"
  ? `${r.dues || r.term_months} dues · ${FREQ_LABEL[r.due_frequency] || r.due_frequency}`
  : `${r.term_months} mo · ${r.due_frequency === "semi_monthly" ? "every cut-off" : FREQ_LABEL[r.due_frequency] || "monthly"}`);

export default function Lending() {
  const notify = useToast();
  const [tab, setTab] = useState("investments");
  const [lk, setLk] = useState({ members: [], settings: [] });
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    Promise.all([api.get("/lending/members"), api.get("/hr/lookups")])
      .then(([members, l]) => setLk({ members, settings: l.lending })).catch(() => { });
  }, [tick]);

  const ctx = { notify, lk, refresh, tick };
  const mainRef = useFitTable();
  return (
    <div className="hr">
      <div className="ln-page">
        <aside className="ln-page-side"><Dashboard {...ctx} /></aside>
        <div className="ln-page-main" ref={mainRef}>
          <div className="ln-tabbar">
            <Tabs value={tab} onChange={setTab} tabs={[["investments", "Investments"], ["loans", "Loans"], ["dues", "Over Due / Due Today"], ["cashout", "Cash-out"], ["members", "Members"], ["settings", "Settings"]]} />
            <button type="button" className="btn btn-sm ln-refresh" onClick={refresh} title="Reload the dashboard and the list">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
              </svg>
              Refresh
            </button>
          </div>
          {tab === "investments" && <Investments {...ctx} />}
          {tab === "loans" && <Loans {...ctx} />}
          {tab === "dues" && <Dues {...ctx} />}
          {tab === "cashout" && <CashoutSheet {...ctx} />}
          {tab === "members" && <Members {...ctx} />}
          {tab === "settings" && <Settings {...ctx} />}
        </div>
      </div>
    </div>
  );
}

/* Dashboard — same tiles as the IGBLending Excel dashboard */
function Dashboard({ tick }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { setD(null); setErr(""); api.get("/lending/dashboard").then(setD).catch((e) => { setErr(e?.message || ""); setD(false); }); }, [tick]);
  if (d === false) return <div className="ln-dash-empty">Couldn't load the dashboard.{err && <><br /><small>{err}</small></>}</div>;
  const v = (k) => (d ? n2(d[k]) : "…");
  const Tile = ({ label, k, tone, subs = [] }) => (
    <div className={`ln-dash-tile ${tone || ""}`}>
      <div className="ln-dash-label">{label}</div>
      <div className="ln-dash-value">{v(k)}</div>
      {subs.map(([l, sk]) => (
        <div className="ln-dash-sub" key={sk}><span>{l}</span><b>{v(sk)}</b></div>
      ))}
    </div>
  );
  return (
    <div className="ln-dash">
      <div className="ln-dash-asof">As of {d ? fmtDate(d.as_of) : "…"}</div>
      <div className="ln-dash-tiles">
        <Tile label="Capital" k="capital" tone="is-blue" subs={[["Total Investment", "total_investment"]]} />
        <Tile label="Cash Balance" k="cash_balance" tone="is-teal" subs={[["Withdrawal", "withdrawal"]]} />
        <Tile label="Total Lent" k="total_lent" tone="is-orange" />
        <Tile label="Total Collected" k="total_collected" tone="is-green" subs={[["Principal", "collected_principal"]]} />
        <Tile label="Total Receivable" k="total_receivable" tone="is-red" subs={[["Outstanding Principal", "outstanding_principal"], ["Future Interest", "future_interest"]]} />
        <Tile label="Net Profit" k="net_profit" tone="is-purple" />
      </div>
    </div>
  );
}

/* Over Due / Due Today — unpaid dues of released loans */
function Dues({ tick }) {
  const [show, setShow] = useState("overdue");
  const [q, setQ] = useState("");
  const pg = useServerPage("/lending/dues", { type: show, q }, tick);
  const d = pg.data;
  return (
    <section className="card hr-section">
      <SectionBar>
        <Chips label="Show" value={show} onChange={setShow}
          options={[["overdue", "Over Due", d?.overdue_count], ["due_today", "Due Today", d?.due_today_count]]} />
        <input className="input ln-search" type="search" placeholder="Search LN #, borrower, ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search dues" />
      </SectionBar>
      <DataTable loading={pg.loading} rows={pg.rows} totals={["amount"]} empty={q ? "No due matches the search." : "None"}
        cols={[
          { key: "name", label: "Borrower", render: (r) => <><b>{r.name}</b>{r.code && <span className="hr-sub">{r.code}</span>}</> },
          { key: "reference_no", label: "Loan #" },
          { key: "due_no", label: "Due #", cls: "c" },
          { key: "due_date", label: "Due date", render: (r) => fmtDate(r.due_date) },
          ...(show === "overdue" ? [{ key: "days_late", label: "Days late", cls: "n" }] : []),
          { key: "deduction_mode", label: "Pay by", render: (r) => (r.deduction_mode === "payroll" ? "Payroll" : "Manual") },
          { key: "amount", label: "Amount", cls: "n", money: true },
        ]} />
      <Pager {...pg.pager} label="due(s)" />
    </section>
  );
}

/** default order of the Investments / Loans tables: reference # newest first */
const DEFAULT_SORT = { key: "reference_no", dir: "desc" };

/** clickable column header: 1st click ↓ (high → low / Z → A), 2nd ↑, 3rd = back to Ref # ↓ · sorting is done by the server
    (Ref # itself just switches ↓ / ↑) */
function SortHead({ k, label, sort, setSort, right }) {
  const on = sort.key === k;
  const next = () => setSort(!on ? { key: k, dir: "desc" }
    : sort.dir === "desc" ? { key: k, dir: "asc" }
      : k === DEFAULT_SORT.key ? { key: k, dir: "desc" } : DEFAULT_SORT);
  return (
    <button type="button" className={`ln-sort${on ? " is-on" : ""}${right ? " is-right" : ""}`} onClick={next}
      aria-label={`Sort by ${label}`} title={`Sort by ${label}`}>
      {label}<i aria-hidden="true">{on ? (sort.dir === "desc" ? "▼" : "▲") : "↕"}</i>
    </button>
  );
}

/* Cash-out: every active investor · capital + interest by the capital-share formula (like the Excel sheet) */
function CashoutSheet({ notify, tick, refresh }) {
  const [asOf, setAsOf] = useState(todayPH());
  const [period, setPeriod] = useState(11);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [open, setOpen] = useState(null);
  const [batch, setBatch] = useState(false);
  const pg = useServerPage("/lending/cashout-sheet", { as_of: asOf, period: Number(period) || 11, q, sort: sort.key, dir: sort.dir }, tick);
  const t = pg.data?.totals;
  const head = (key, label, right) => <SortHead k={key} label={label} sort={sort} setSort={setSort} right={right} />;
  return (
    <section className="card hr-section">
      <SectionBar>
        <label className="ln-inline">As of <input type="date" className="input" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} /></label>
        <label className="ln-inline">Period <input type="number" min="1" step="0.5" className="input ln-num" value={period} onChange={(e) => setPeriod(e.target.value)} /> mo</label>
        <input className="input ln-search" type="search" placeholder="Search ref #, investor, ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search investors" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setBatch(true)}>Cashout</button>
      </SectionBar>
      {t && (
        <div className="ln-co-sum">
          <div><small>Total capital</small><b>{n2(t.total_capital)}</b></div>
          <div><small>Net profit</small><b>{n2(t.profit)}</b></div>
          <div><small>Capital + profit</small><b>{n2(t.pool)}</b></div>
          <div className="is-blue"><small>For shareholders{q ? " (shown)" : ""}</small><b>{n2(t.capital_interest)}</b></div>
          {t.for_management !== null && <div className="is-green"><small>For management</small><b>{n2(t.for_management)}</b></div>}
        </div>
      )}
      <DataTable loading={pg.loading} rows={pg.rows} totals={["capital", "share_full", "interest", "capital_interest", "cashed_out"]} onRow={(r) => setOpen(r.id)}
        empty={q ? "No investor matches the search." : "No active investment."}
        cols={[
          { key: "reference_no", label: head("reference_no", "Ref #"), render: (r) => <><b>{r.reference_no}</b><span className="hr-sub">{fmtDate(r.date_invested)}{r.deposits > 1 ? ` · ${r.deposits} deposits` : ""}</span></> },
          { key: "name", label: head("name", "Investor"), render: (r) => <>{r.name}{r.code && <span className="hr-sub">{r.code}</span>}</> },
          { key: "capital", label: head("capital", "Capital", true), cls: "n", money: true },
          { key: "share_pct", label: head("share_pct", "Share %", true), cls: "n", render: (r) => Number(r.share_pct).toFixed(4) },
          { key: "share_full", label: "Profit share", cls: "n", money: true },
          { key: "months", label: head("months", "Months", true), cls: "n", render: (r) => `${r.months} · ${Number(r.months_pct).toFixed(2)}%` },
          { key: "interest", label: head("interest", "Interest earned", true), cls: "n", money: true },
          { key: "capital_interest", label: head("capital_interest", "Capital + interest", true), cls: "n", render: (r) => <b>{n2(r.capital_interest)}</b> },
          { key: "cashed_out", label: head("cashed_out", "Cashed out", true), cls: "n", money: true },
        ]} />
      <Pager {...pg.pager} label="investor(s)" />
      {open && <InvestmentView id={open} notify={notify} onClose={() => setOpen(null)} onChanged={refresh} />}
      {batch && <CashoutBatch asOf={asOf} period={Number(period) || 11} notify={notify} onClose={() => setBatch(false)}
        onDone={(msg) => { notify(msg); setBatch(false); refresh(); }} />}
    </section>
  );
}

/* Cashout popup: every active investor · check who cashes out · Retain capital (only the interest is paid)
   · Retain interest (that % of the interest stays in the fund as capital — default from Settings) */
function CashoutBatch({ asOf, period, notify, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [pick, setPick] = useState({});
  const [defPct, setDefPct] = useState(30);
  const [headPct, setHeadPct] = useState("30"); // header % → every row
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    Promise.all([api.get(`/lending/cashout-sheet?all=1&as_of=${asOf}&period=${period}&sort=name&dir=asc`), api.get("/lending/config").catch(() => ({ retain_interest_pct: 30 }))])
      .then(([sheet, cfg]) => {
        const pct = Number(cfg.retain_interest_pct ?? 30);
        setDefPct(pct);
        setHeadPct(String(pct));
        setRows(sheet.rows);
        setPick(Object.fromEntries(sheet.rows.map((r) => [r.id, { on: false, cap: false, int: false, pct }])));
      })
      .catch(() => setRows([]));
  }, [asOf, period]);
  const set = (id, patch) => setPick((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const calc = (r) => {
    const x = pick[r.id] || {};
    const interest = Math.max(0, Number(r.capital_interest) - Number(r.capital));
    const retained = x.int ? Math.round(interest * Number(x.pct || 0)) / 100 : 0;
    const payInt = interest - retained;
    const payCap = x.cap ? 0 : Number(r.capital);
    return { interest, retained, pay: payInt + payCap, left: (x.cap ? Number(r.capital) : 0) + retained };
  };
  const shown = (rows || []).filter((r) => !q.trim() || [r.name, r.code, r.reference_no].some((v) => String(v || "").toLowerCase().includes(q.trim().toLowerCase())));
  const chosen = (rows || []).filter((r) => pick[r.id]?.on);
  const sum = chosen.reduce((a, r) => { const c = calc(r); return { pay: a.pay + c.pay, retained: a.retained + c.retained, left: a.left + c.left }; }, { pay: 0, retained: 0, left: 0 });
  const allOn = shown.length > 0 && shown.every((r) => pick[r.id]?.on);
  const allCap = shown.length > 0 && shown.every((r) => pick[r.id]?.cap);
  const allInt = shown.length > 0 && shown.every((r) => pick[r.id]?.int);
  // check all: the rows shown (after the search) · retain boxes also select the row
  const setAll = (patch) => setPick((p) => ({ ...p, ...Object.fromEntries(shown.map((r) => [r.id, { ...p[r.id], ...patch }])) }));
  const save = () => {
    setBusy(true);
    api.post("/lending/cashout-batch", {
      date: asOf, period,
      items: chosen.map((r) => ({ investment_id: r.id, retain_capital: !!pick[r.id].cap, retain_interest: !!pick[r.id].int, retain_pct: Number(pick[r.id].pct || 0) })),
    }).then((r) => onDone(r.message)).catch(fail(notify)).finally(() => setBusy(false));
  };
  return (
    <Modal title={`Cashout · ${fmtDate(asOf)} · period ${period} mo`} onClose={onClose} size="xxlg"
      footer={<>
        <span className="ln-cb-sum">{chosen.length} selected · pay <b>{n2(sum.pay)}</b> · retained interest <b>{n2(sum.retained)}</b> · stays invested <b>{n2(sum.left)}</b></span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !chosen.length} onClick={save}>{busy ? "Saving…" : `Cash out ${n2(sum.pay)}`}</button>
      </>}>
      <SectionBar>
        <input className="input ln-search" type="search" placeholder="Search investor, ID, ref #…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <span className="hr-muted">Retain interest default: {defPct}% (Settings)</span>
      </SectionBar>
      <DataTable loading={!rows} rows={shown} empty="No active investment."
        cols={[
          {
            key: "on", label: <input type="checkbox" checked={allOn} onChange={(e) => setAll({ on: e.target.checked })} aria-label="Select all" />, cls: "c",
            render: (r) => <input type="checkbox" checked={!!pick[r.id]?.on} onChange={(e) => set(r.id, { on: e.target.checked })} aria-label={`Cash out ${r.name}`} />
          },
          { key: "name", label: "Investor", render: (r) => <><b>{r.name}</b><span className="hr-sub">{r.reference_no}{r.code ? ` · ${r.code}` : ""}</span></> },
          { key: "capital", label: "Capital", cls: "n", money: true },
          { key: "interest", label: "Interest", cls: "n", render: (r) => n2(calc(r).interest) },
          {
            key: "cap", label: <button type="button" className={`btn btn-sm${allCap ? " btn-primary" : ""}`} title={allCap ? "Click again to clear" : "Retain capital on every investor shown"}
              onClick={() => setAll(allCap ? { cap: false } : { cap: true, on: true })}>Apply All</button>, cls: "c",
            render: (r) => (
              <label className="ln-cb-all">
                <input type="checkbox" checked={!!pick[r.id]?.cap} onChange={(e) => set(r.id, { cap: e.target.checked, on: true })} /> Retain capital
              </label>
            )
          },
          {
            key: "int", label: (
              <span className="ln-cb-int">
                <button type="button" className={`btn btn-sm${allInt ? " btn-primary" : ""}`} title={allInt ? "Click again to clear" : "Retain interest on every investor shown"}
                  onClick={() => setAll(allInt ? { int: false } : { int: true, on: true })}>Apply All</button>
                <input type="number" min="0" max="100" step="1" className="input" value={headPct} aria-label="Retain interest % for everyone"
                  title="Changes the % of every investor shown" onChange={(e) => { setHeadPct(e.target.value); setAll({ pct: e.target.value }); }} />%
              </span>
            ), cls: "c",
            render: (r) => (
              <span className="ln-cb-int">
                <label className="ln-cb-all"><input type="checkbox" checked={!!pick[r.id]?.int} onChange={(e) => set(r.id, { int: e.target.checked, on: true })} /> Retain interest</label>
                <input type="number" min="0" max="100" step="1" className="input" value={pick[r.id]?.pct ?? defPct} disabled={!pick[r.id]?.int}
                  onChange={(e) => set(r.id, { pct: e.target.value })} aria-label="Retain %" />%
              </span>
            )
          },
          { key: "retained", label: "Retained", cls: "n", render: (r) => (pick[r.id]?.on ? n2(calc(r).retained) : "—") },
          { key: "pay", label: "To cash out", cls: "n", render: (r) => (pick[r.id]?.on ? <b>{n2(calc(r).pay)}</b> : "—") },
          { key: "left", label: "Stays invested", cls: "n", render: (r) => (pick[r.id]?.on ? n2(calc(r).left) : "—") },
        ]} />
    </Modal>
  );
}

/** server pagination: only one page is read from the database · { rows, total, page, per_page } from the API */
function useServerPage(url, params, tick, initialPerPage = 25) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);
  const [data, setData] = useState(null);
  const key = JSON.stringify(params);
  useEffect(() => { setPage(1); }, [key, perPage]);
  useEffect(() => {
    setData(null);
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ page, per_page: perPage });
      Object.entries(params).forEach(([k, v]) => { if (v !== "" && v !== null && v !== undefined) qs.set(k, String(v).trim()); });
      api.get(`${url}?${qs}`).then(setData).catch(() => setData({ rows: [], total: 0, page: 1, per_page: perPage }));
    }, params.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [url, key, page, perPage, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = data?.total || 0;
  const cur = data?.page || page;
  return {
    data, loading: !data, rows: data?.rows || [],
    pager: { page: cur, setPage, perPage, setPerPage, pages: Math.max(1, Math.ceil(total / perPage)), from: (cur - 1) * perPage, total },
  };
}

/** stretch the table's scroll box down to the bottom of the screen (no empty space under it) */
function useFitTable() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const box = [...root.querySelectorAll("*")].find((el) => {
          const o = getComputedStyle(el).overflowY;
          return (o === "auto" || o === "scroll") && el.querySelector("table");
        });
        if (!box) return;
        const sec = box.closest("section") || root;
        const below = sec.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom;
        box.style.maxHeight = `${Math.max(240, window.innerHeight - box.getBoundingClientRect().top - below - 16)}px`;
      });
    };
    const mo = new MutationObserver(fit);
    mo.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", fit);
    fit();
    return () => { cancelAnimationFrame(raf); mo.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  return ref;
}

const fail = (notify) => (e) => notify(e.message || "Couldn't save.", "error");

/* members + active employees (an employee becomes a member on his first investment / loan) · value = row.key ("m12" member, "e34" employee) */
function MemberSelect({ members, value, onChange }) {
  const options = members.filter((m) => m.is_active).map((m) => ({
    value: m.key, label: `${m.code ? `${m.code} · ` : ""}${m.name} · ${m.member_type === "employee" ? "Employee" : "Outside"}`,
  }));
  return <SearchSelect value={value} onChange={(v) => onChange(v ? String(v) : "")} options={options} searchPlaceholder="Search employee or member..." aria-label="Member" />;
}
const who = (key) => (String(key).startsWith("e") ? { employee_id: Number(String(key).slice(1)), member_id: null } : { member_id: Number(String(key).slice(1)), employee_id: null });

/** section toolbar: filters, search and the main button on ONE line */
function SectionBar({ children }) {
  return <header className="ln-head">{children}</header>;
}

/** filter chips: [[value, label, count?]] */
function Chips({ value, onChange, options, label, tones }) {
  return (
    <div className="ln-chips" role="radiogroup" aria-label={label}>
      {options.map(([v, l, n]) => (
        <button key={l} type="button" role="radio" aria-checked={value === v} className={`${value === v ? "is-on" : ""}${tones ? ` ln-st is-${v || "all"}` : ""}`} onClick={() => onChange(v)}>
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
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const pg = useServerPage("/lending/investments", { status, q, sort: sort.key, dir: sort.key ? sort.dir : "" }, tick);
  const head = (key, label, right) => <SortHead k={key} label={label} sort={sort} setSort={setSort} right={right} />;
  const done = (msg) => { notify(msg); setModal(null); refresh(); };

  return (
    <section className="card hr-section">
      <SectionBar>
        <Chips label="Status" value={status} onChange={setStatus} options={[["active", "Active"], ["closed", "Closed"], ["", "All"]]} />
        <input className="input ln-search" type="search" placeholder="Search ref #, investor, ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search investments" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ type: "invest" })}>New investment</button>
      </SectionBar>
      <DataTable loading={pg.loading} rows={pg.rows} empty={q ? "No investment matches the search." : undefined} onRow={(r) => setModal({ type: "view", id: r.id })}
        cols={[
          { key: "reference_no", label: head("reference_no", "Ref #"), render: (r) => <><b>{r.reference_no}</b><span className="hr-sub">{fmtDate(r.date_invested)}</span></> },
          { key: "member", label: head("member", "Investor"), render: (r) => r.member?.name },
          { key: "rate", label: head("interest", "Interest"), render: rateText },
          { key: "principal_balance", label: head("principal_balance", "Invested", true), cls: "n", money: true },
          { key: "earned", label: "Earned to date", cls: "n", render: (r) => (r.today ? n2(r.today.interest_earned) : n2(r.total_interest_earned)) },
          { key: "value", label: "Cash-out value today", cls: "n", render: (r) => (r.today ? <b>{n2(r.today.cashout_value)}</b> : "—") },
          { key: "lock", label: "", render: (r) => (r.today?.in_lock_in ? <span className="hr-sub">lock-in until {fmtDate(r.today.lock_in_ends)}</span> : null) },
          { key: "status", label: head("status", "Status"), render: (r) => <Badge status={r.status} /> },
        ]} />
      <Pager {...pg.pager} label="investment(s)" />
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

const TXN_LABEL = { deposit: "Deposit", top_up: "Top-up", interest: "Interest", cashout_interest: "Cash-out · interest", cashout_principal: "Cash-out · principal" };

function InvestmentView({ id, notify, onClose, onChanged }) {
  const [asOf, setAsOf] = useState(todayPH());
  const [data, setData] = useState(null);
  const [mode, setMode] = useState(null); // top-up | cashout
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayPH());
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api.get(`/lending/investments/${id}?as_of=${asOf}`).then(setData).catch(() => setData(false)); }, [id, asOf]);
  useEffect(() => { load(); }, [load]);

  // cash-out = the capital-share formula (capital ÷ total capital × net profit × months ÷ period)
  const [period, setPeriod] = useState(11);
  const [share, setShare] = useState(null);
  useEffect(() => {
    if (mode !== "cashout" || !date) { setShare(null); return undefined; }
    setShare(null);
    const t = setTimeout(() => api.get(`/lending/investments/${id}/share?as_of=${date}&period=${Number(period) || 11}`).then(setShare).catch(() => setShare(false)), 250);
    return () => clearTimeout(t);
  }, [mode, date, period, id]);
  const submit = () => {
    const url = mode === "top-up" ? `/lending/investments/${id}/top-up` : `/lending/investments/${id}/cashout-share`;
    setBusy(true);
    api.post(url, { amount: amount === "" ? null : Number(amount), date, ...(mode === "cashout" && { period: Number(period) || 11 }) })
      .then((r) => { notify(r.message); setMode(null); setAmount(""); load(); onChanged(); })
      .catch(fail(notify))
      .finally(() => setBusy(false));
  };
  const inv = data?.investment;
  const p = data?.preview;
  const txns = inv?.transactions || [];
  const active = inv?.status === "active";

  return (
    <Modal title={inv ? `Investment ${inv.reference_no}` : "Investment"} onClose={onClose} size="lg"
      footer={<button className="btn" onClick={onClose}>Close</button>}>
      {data === null && <p className="hr-muted">Loading…</p>}
      {data === false && <p className="hr-muted">Couldn't load this investment.</p>}
      {inv && (
        <div className="ln-view">
          {/* who + value */}
          <section className="ln-hero">
            <div className="ln-hero-who">
              <small>Investor</small>
              <b>{inv.member?.name || "—"}</b>
              <div className="ln-hero-tags">
                <Badge status={inv.status} />
                {inv.member?.code && <span>{inv.member.code}</span>}
                <span>{rateText(inv)}</span>
                <span>since {fmtDate(inv.date_invested)}</span>
              </div>
            </div>
            <div className="ln-hero-bal">
              <small>{active ? `Cash-out value · ${fmtDate(asOf)}` : "Total cashed out"}</small>
              <b>{n2(active && p ? p.cashout_value : inv.total_cashed_out)}</b>
              {active && p && <span>{n2(inv.principal_balance)} principal + {n2(p.interest_earned)} interest</span>}
            </div>
          </section>

          {/* the numbers */}
          <div className="ln-tiles">
            <div><small>Total put in</small><b>{n2(inv.total_invested)}</b><span>{txns.length} deposit / top-up{txns.length === 1 ? "" : "s"}</span></div>
            <div><small>Principal now</small><b>{n2(inv.principal_balance)}</b><span>still invested</span></div>
            <div><small>Interest earned</small><b>{n2(active && p ? p.interest_earned : inv.total_interest_earned)}</b><span>{active && p ? `${p.days_invested} day(s) invested` : ""}</span></div>
            <div><small>Cashed out</small><b>{n2(inv.total_cashed_out)}</b><span>{inv.closed_at ? `closed ${fmtDate(inv.closed_at)}` : "so far"}</span></div>
          </div>

          {/* what to do now */}
          {active && p && (
            <section className="ln-act">
              <header>
                <b>{mode === "top-up" ? "Add a top-up" : mode === "cashout" ? "Cash out" : "Top up or cash out"}</b>
                <span>{mode === "cashout" ? "Leave the amount empty to cash out everything and close the investment." : "Interest is counted to the day."}</span>
              </header>
              {!mode ? (
                <div className="ln-act-row">
                  <Field label="Value if cashed out on">
                    <input type="date" className="input" value={asOf} min={String(inv.last_accrual_date).slice(0, 10)} onChange={(e) => setAsOf(e.target.value)} />
                  </Field>
                  <div className="ln-act-btns">
                    <button type="button" className="btn" onClick={() => { setMode("top-up"); setDate(todayPH()); }}>Top up</button>
                    <button type="button" className="btn btn-primary" onClick={() => { setMode("cashout"); setDate(asOf); }}>Cash out</button>
                  </div>
                </div>
              ) : (
                <>
                  {mode === "cashout" && (
                    <div className="ln-co">
                      {share === null && <div><span>Computing…</span></div>}
                      {share === false && <div><span>Couldn't compute the interest.</span></div>}
                      {share && (
                        <>
                          <div><span>Capital</span><b>{n2(share.capital)}</b></div>
                          <div><span>Capital share · {n2(share.total_invested)} ÷ {n2(share.total_capital)} total capital</span><b>{Number(share.share_pct).toFixed(4)}%</b></div>
                          <div><span>Profit share · {Number(share.share_pct).toFixed(4)}% × {n2(share.profit)} net profit</span><b>{n2(share.share_full)}</b></div>
                          {share.deposits.map((d, i) => (
                            <div key={i} className="is-sub"><span>{fmtDate(d.date)} · {n2(d.amount)} · {d.months} of {share.period_months} month(s)</span><b>{Number(d.pct).toFixed(4)}%</b></div>
                          ))}
                          <div><span>Interest earned{share.already_credited > 0 ? ` (less ${n2(share.already_credited)} already credited)` : ""}</span><b>{n2(share.interest)}</b></div>
                          <div className="is-total"><span>Total cash-out · {fmtDate(share.as_of)}</span><b>{n2(share.total)}</b></div>
                        </>
                      )}
                    </div>
                  )}
                  <div className="ln-act-row is-pay">
                    <Field label={mode === "top-up" ? "Top-up amount" : "Cash-out amount"}>
                      <input type="number" min="0.01" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)}
                        placeholder={mode === "cashout" ? `All · ${n2(share?.total ?? 0)}` : "0.00"} autoFocus />
                    </Field>
                    {mode === "cashout" && (
                      <Field label="Period (months)"><input type="number" min="1" step="0.5" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
                    )}
                    <Field label="Date"><input type="date" className="input" value={date} min={mode === "cashout" ? String(inv.last_accrual_date).slice(0, 10) : undefined}
                      onChange={(e) => { setDate(e.target.value); if (mode === "cashout" && e.target.value) setAsOf(e.target.value); }} /></Field>
                    <div className="ln-act-btns">
                      <button type="button" className="btn" onClick={() => { setMode(null); setAmount(""); }} disabled={busy}>Back</button>
                      <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || (mode === "top-up" && !(Number(amount) > 0)) || (mode === "cashout" && !share)}>
                        {mode === "top-up" ? "Save top-up" : amount ? `Cash out ${n2(amount)}` : `Cash out ${n2(share?.total ?? 0)}`}
                      </button>
                    </div>
                  </div>
                </>
              )}
              {p.in_lock_in && <p className="hr-note is-warn">Still in the lock-in until {fmtDate(p.lock_in_ends)}: cashing out now pays the principal only.</p>}
            </section>
          )}

          {/* statement */}
          <div className="ln-lists">
            <div className="ln-seg" role="tablist">
              <button type="button" className="is-on">Statement ({txns.length})</button>
            </div>
            {!txns.length ? <p className="ln-none">No transaction yet.</p> : (
              <DataTable rows={txns} totals={["amount"]} cols={[
                { key: "txn_date", label: "Date", render: (t) => fmtDate(t.txn_date) },
                { key: "txn_type", label: "Type", render: (t) => <span className={`ln-txn is-${t.txn_type}`}>{TXN_LABEL[t.txn_type] || t.txn_type.replace(/_/g, " ")}</span> },
                { key: "remarks", label: "Reference", cls: "wrap", render: (t) => <>{String(t.remarks || "—").split(" · ")[0]}{t.days ? <span className="hr-sub">{t.days} day(s)</span> : null}</> },
                { key: "amount", label: "Amount", cls: "n", money: true },
                { key: "principal_after", label: "Principal after", cls: "n", money: true },
                { key: "interest_after", label: "Interest after", cls: "n", money: true },
              ]} />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* =====================================================================
   LOANS
   ===================================================================== */
function Loans({ notify, lk, refresh, tick }) {
  const [status, setStatus] = useState("");
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const pg = useServerPage("/lending/loans", { status, q, sort: sort.key, dir: sort.key ? sort.dir : "" }, tick);
  const head = (key, label, right) => <SortHead k={key} label={label} sort={sort} setSort={setSort} right={right} />;
  const done = (msg) => { notify(msg); setModal(null); refresh(); };

  return (
    <section className="card hr-section">
      <SectionBar>
        <Chips label="Status" value={status} onChange={setStatus} tones
          options={[["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["released", "Released"], ["paid", "Paid"], ["rejected", "Rejected"], ["cancelled", "Cancelled"]]} />
        <input className="input ln-search" type="search" placeholder="Search LN #, borrower, ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search loans" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ type: "apply" })}>New loan</button>
      </SectionBar>
      <DataTable loading={pg.loading} rows={pg.rows} empty={q ? "No loan matches the search." : undefined} onRow={(r) => setModal({ type: "view", id: r.id })} totals={["principal", "total_payable", "total_paid", "balance"]}
        cols={[
          { key: "reference_no", label: head("reference_no", "Ref #"), render: (r) => <><b>{r.reference_no}</b><span className="hr-sub">{r.date_released ? fmtDate(r.date_released) : "not released"}</span></> },
          { key: "member", label: head("member", "Borrower"), render: (r) => r.member?.name },
          { key: "rate", label: head("interest", "Interest"), render: rateText },
          { key: "term", label: head("term", "Term"), render: termText },
          { key: "principal", label: head("principal", "Principal", true), cls: "n", money: true },
          { key: "total_payable", label: head("total_payable", "Payable", true), cls: "n", money: true },
          { key: "amount_per_due", label: head("amount_per_due", "Per due", true), cls: "n", money: true },
          { key: "total_paid", label: head("total_paid", "Paid", true), cls: "n", money: true },
          { key: "balance", label: head("balance", "Balance", true), cls: "n", money: true },
          { key: "deduction_mode", label: head("deduction_mode", "Pay by"), render: (r) => (r.deduction_mode === "payroll" ? "Payroll" : "Manual") },
          { key: "status", label: head("status", "Status"), render: (r) => <LoanStatus status={r.status} /> },
        ]} />
      <Pager {...pg.pager} label="loan(s)" />
      {modal?.type === "apply" && <LoanApply lk={lk} onClose={() => setModal(null)} onDone={done} onFail={fail(notify)} />}
      {modal?.type === "view" && <LoanView id={modal.id} notify={notify} onClose={() => setModal(null)} onChanged={refresh} />}
    </section>
  );
}

/** loan status pill — same colors as the status filter */
const LoanStatus = ({ status }) => <span className={`ln-lst is-${status}`}>{String(status || "").replace(/^\w/, (c) => c.toUpperCase())}</span>;

function LoanApply({ lk, onClose, onDone, onFail }) {
  const settings = lk.settings.filter((s) => s.applies_to === "loan" && s.is_active);
  const def = settings.find((s) => s.is_default) || settings[0];
  const [f, set, setF] = useForm({
    member_id: "", lending_setting_id: def ? String(def.id) : "", principal: "", term_months: 6,
    interest_type: def?.interest_type || "flat", interest_rate: def?.interest_rate ?? 0.025, fixed_interest: def?.fixed_interest ?? 0,
    penalty_rate_per_day: def?.penalty_rate_per_day ?? EXCEL_PENALTY,
    due_frequency: (def?.interest_type || "flat") === "flat" ? "semi_monthly" : "monthly",
    deduction_mode: "payroll", date_released: todayPH(), purpose: "", co_maker: "", collection_method: "Salary Deduction",
  });
  const flat = f.interest_type === "flat";
  const [preview, setPreview] = useState(null);
  const member = lk.members.find((m) => m.key === f.member_id);
  const pick = (id) => {
    const s = settings.find((x) => String(x.id) === id);
    setF((p) => ({
      ...p, lending_setting_id: id, ...(s && {
        interest_type: s.interest_type, interest_rate: s.interest_rate, fixed_interest: s.fixed_interest, penalty_rate_per_day: s.penalty_rate_per_day,
        due_frequency: s.interest_type === "flat" ? (p.due_frequency || "semi_monthly") : p.due_frequency === "weekly" ? "monthly" : p.due_frequency
      })
    }));
  };
  const body = {
    ...f, ...who(f.member_id), lending_setting_id: f.lending_setting_id ? Number(f.lending_setting_id) : null, term_months: Number(f.term_months), principal: Number(f.principal),
    deduction_mode: f.collection_method === "Salary Deduction" ? "payroll" : "manual"
  };

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
              <Field label={flat ? "Terms (number of dues)" : "Term (months)"}><input type="number" min="1" className="input" value={f.term_months} onChange={set("term_months")} /></Field>
              <Field label="Release date"><input type="date" className="input" value={f.date_released} onChange={set("date_released")} /></Field>
            </div>
          </fieldset>

          <fieldset className="ln-group">
            <legend>Interest & penalty</legend>
            <div className="ln-row is-3">
              <Field label="Interest">
                <select className="input" value={f.interest_type} onChange={(e) => setF((p) => ({ ...p, interest_type: e.target.value, due_frequency: e.target.value !== "flat" && p.due_frequency === "weekly" ? "monthly" : p.due_frequency }))}>
                  <option value="flat">Flat · rate per due</option>
                  <option value="per_month">Per month</option><option value="per_day">Per day</option><option value="fixed">Fixed amount</option>
                </select>
              </Field>
              {f.interest_type === "fixed"
                ? <Field label="Fixed interest"><input type="number" min="0" step="0.01" className="input" value={f.fixed_interest} onChange={set("fixed_interest")} /></Field>
                : <Field label={`Rate (% ${flat ? "per due" : f.interest_type === "per_day" ? "per day" : "per month"})`}><input type="number" step="0.01" min="0" className="input" value={asPct(f.interest_rate)} onChange={fromPct("interest_rate")} /></Field>}
              <Field label="Penalty (% per day)" hint="on the overdue amount"><input type="number" step="0.01" min="0" className="input" value={asPct(f.penalty_rate_per_day)} onChange={fromPct("penalty_rate_per_day")} /></Field>
            </div>
          </fieldset>

          <fieldset className="ln-group">
            <legend>Payment</legend>
            <div className="ln-row is-2">
              <Field label="Dues">
                <select className="input" value={f.due_frequency} onChange={set("due_frequency")}>
                  <option value="semi_monthly">Twice a month (15th / end)</option><option value="monthly">Monthly</option>
                  {flat && <option value="weekly">Weekly</option>}
                </select>
              </Field>
              <Field label="Pay by" hint={outside ? "Outside members pay manually" : "follows Collection below"}>
                <input className="input" value={outside || f.collection_method !== "Salary Deduction" ? "Manual payment" : "Payroll deduction"} disabled />
              </Field>
            </div>
          </fieldset>

          <div className="ln-row is-3">
            <Field label="Purpose"><input className="input" value={f.purpose} onChange={set("purpose")} placeholder="e.g. Tuition, house repair" /></Field>
            <Field label="Co-maker"><input className="input" value={f.co_maker} onChange={set("co_maker")} /></Field>
            <Field label="Collection">
              <select className="input" value={f.collection_method} onChange={set("collection_method")}>
                <option>Salary Deduction</option><option>OTC</option><option>Fund Transfer</option>
              </select>
            </Field>
          </div>
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
                <LoanStatus status={loan.status} />
                <span>{loan.deduction_mode === "payroll" ? "Payroll deduction" : "Manual payment"}</span>
                {loan.member?.code && <span>{loan.member.code}</span>}
                {loan.collection_method && <span>{loan.collection_method}</span>}
                {loan.co_maker && <span>Co-maker: {loan.co_maker}</span>}
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
            <div><small>Term</small><b>{loan.interest_type === "flat" ? `${loan.dues || loan.term_months} dues` : loan.term_months ? `${loan.term_months} mo.` : "—"}</b><span>{FREQ_LABEL[loan.due_frequency] || loan.due_frequency}</span></div>
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
                    onClick={() => run(api.post(`/lending/loans/${id}/payments`, { ...pay, amount: Number(pay.amount) })).then((r) => { if (r) { setPay({ ...pay, amount: "", or_number: "", remarks: "" }); setList("payments"); } })}>
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
                <DataTable rows={loan.payments} totals={["amount", "principal_paid", "interest_paid", "penalty_paid"]} cols={[
                  { key: "payment_date", label: "Date", render: (p) => fmtDate(p.payment_date) },
                  { key: "source", label: "From", render: (p) => <>{p.source === "payroll" ? "Payroll" : "Manual"}{p.payment_type && <span className="hr-sub">{p.payment_type}</span>}</> },
                  { key: "or_number", label: "AR / OR #", render: (p) => p.or_number || "—" },
                  { key: "amount", label: "Amount", cls: "n", money: true },
                  { key: "principal_paid", label: "Principal", cls: "n", money: true },
                  { key: "interest_paid", label: "Interest", cls: "n", money: true },
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
      .filter((m) => !term || [m.name, m.code, m.contact_no, m.email].some((v) => String(v || "").toLowerCase().includes(term)));
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
        { key: "name", label: "Name", render: (m) => <><b>{m.name}</b><span className="hr-sub">{m.code ? `${m.code} · ` : ""}{m.member_type === "employee" ? "Employee" : "Outside"}</span></> },
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
    member_type: row?.member_type || "employee", employee_id: row?.employee_id ? String(row.employee_id) : "", name: row?.name || "", code: row?.code || "",
    contact_no: row?.contact_no || "", email: row?.email || "", address: row?.address || "", bank_name: row?.bank_name || "",
    account_no: row?.account_no || "", is_active: row?.is_active ?? true,
  });
  const save = () => {
    const body = { ...f, employee_id: f.employee_id ? Number(f.employee_id) : null, code: f.code || null };
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
        <Field label="Borrower ID" hint="e.g. B0064"><input className="input" value={f.code} maxLength={10} onChange={set("code")} /></Field>
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
  const [retainPct, setRetainPct] = useState("");
  useEffect(() => { api.get("/lending/config").then((c) => setRetainPct(String(c.retain_interest_pct ?? 30))).catch(() => setRetainPct("30")); }, []);
  const savePct = () => api.put("/lending/config", { retain_interest_pct: Number(retainPct) }).then((r) => notify(r.message)).catch(fail(notify));
  return (
    <section className="card hr-section">
      <SectionBar>
        <label className="ln-inline">Cash-out · retain interest
          <input type="number" min="0" max="100" step="1" className="input ln-num" value={retainPct} onChange={(e) => setRetainPct(e.target.value)} />%
        </label>
        <button type="button" className="btn btn-sm" onClick={savePct} disabled={retainPct === "" || Number(retainPct) < 0 || Number(retainPct) > 100}>Save</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({})}>New setting</button>
      </SectionBar>
      <DataTable rows={lk.settings} onRow={(s) => setModal(s)} cols={[
        { key: "name", label: "Name", render: (s) => <><b>{s.name}</b> {s.is_default && <Badge status="default" />}</> },
        { key: "applies_to", label: "For" },
        { key: "rate", label: "Interest", render: rateText },
        { key: "amount", label: "Amount", render: (s) => `${n2(s.min_amount)} – ${s.max_amount ? n2(s.max_amount) : "no limit"}` },
        { key: "max_term_months", label: "Max term", render: (s) => (s.max_term_months ? `${s.max_term_months} ${s.interest_type === "flat" ? "dues" : "mo"}` : "—") },
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
            {f.applies_to === "loan" && <option value="flat">Flat · rate per due</option>}
            <option value="per_month">Per month</option><option value="per_day">Per day</option><option value="fixed">Fixed amount</option>
          </select>
        </Field>
        {f.interest_type === "fixed"
          ? <Field label="Fixed interest"><input type="number" min="0" className="input" value={f.fixed_interest} onChange={set("fixed_interest")} /></Field>
          : <Field label="Rate" hint={f.interest_type === "flat" ? "per due · 0.025 = 2.5%" : "0.02 = 2%"}><input type="number" step="0.0001" min="0" className="input" value={f.interest_rate} onChange={set("interest_rate")} /></Field>}
        <Field label="Minimum amount"><input type="number" min="0" className="input" value={f.min_amount} onChange={set("min_amount")} /></Field>
        <Field label="Maximum amount"><input type="number" min="0" className="input" value={f.max_amount} onChange={set("max_amount")} placeholder="no limit" /></Field>
        {f.applies_to === "loan" ? (
          <>
            <Field label={f.interest_type === "flat" ? "Most dues" : "Longest term (months)"}><input type="number" min="1" className="input" value={f.max_term_months} onChange={set("max_term_months")} /></Field>
            <Field label="Penalty per day" hint="0.001667 = 5% a month on the overdue due"><input type="number" step="0.0001" min="0" className="input" value={f.penalty_rate_per_day} onChange={set("penalty_rate_per_day")} /></Field>
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