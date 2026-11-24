// Administration → Third Party: billing of Amazon (AWS) and GoDaddy (pulled by the backend: php artisan thirdparty:sync)
import { useEffect, useState } from "react";
import { useToast } from "../../components/Toast";
import { DataTable, Pager, Tabs, api, fmtDate, n2 } from "../hr/HRShared";
import "./ThirdParty.css";

const PROVIDER = { aws: "Amazon (AWS)", godaddy: "GoDaddy" };
const money = (v, cur) => `${cur && cur !== "PHP" ? `${cur} ` : cur === "PHP" ? "₱" : ""}${n2(v)}`;
const when = (v) => (v ? new Date(String(v).replace(" ", "T")).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "never");

export default function ThirdParty() {
  const notify = useToast();
  const [tab, setTab] = useState("bills");
  const [tick, setTick] = useState(0);
  const [sum, setSum] = useState(null);
  const [syncing, setSyncing] = useState("");
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => { api.get("/third-party/summary").then(setSum).catch(() => setSum(false)); }, [tick]);

  const sync = (provider) => {
    setSyncing(provider || "all");
    api.post("/third-party/sync", provider ? { provider } : {})
      .then((r) => {
        const bad = Object.entries(r.results || {}).filter(([, x]) => !x.ok);
        bad.length ? notify(bad.map(([p, x]) => `${PROVIDER[p]}: ${x.message}`).join(" · "), "error") : notify(r.message);
        refresh();
      })
      .catch((e) => notify(e.message || "Sync failed.", "error"))
      .finally(() => setSyncing(""));
  };

  const ctx = { tick, refresh, notify };
  return (
    <div className="tp-page">
      <aside className="tp-side">
        <ProviderCard id="aws" s={sum?.aws} loading={sum === null} syncing={syncing} onSync={sync}>
          {(a) => (
            <>
              <Line label={`This month${a.this_month_estimated ? " (estimated)" : ""}`} value={money(a.this_month, a.currency)} big />
              <Line label="Last month" value={money(a.last_month, a.currency)} />
              <Line label="Last 12 months" value={money(a.last_12, a.currency)} />
              <Line label="Last invoice" value={a.last_invoice ? `${money(a.last_invoice.amount, a.last_invoice.currency)} · ${a.last_invoice.period || fmtDate(a.last_invoice.bill_date)}` : "—"} />
            </>
          )}
        </ProviderCard>
        <ProviderCard id="godaddy" s={sum?.godaddy} loading={sum === null} syncing={syncing} onSync={sync}>
          {(g) => (
            <>
              <Line label="Spent · last 12 months" value={money(g.spend_12, g.currency)} big />
              <Line label="Domains · subscriptions" value={`${g.domains} · ${g.subscriptions}`} />
              <Line label="Renewing in 30 days" value={g.due_30} warn={g.due_30 > 0} />
              <Line label="Renewing in 60 days" value={g.due_60} />
              <Line label="Expired" value={g.expired} warn={g.expired > 0} />
              <Line label="Next" value={g.next ? `${g.next.name} · ${fmtDate(g.next.expires_at)}` : "—"} />
            </>
          )}
        </ProviderCard>
      </aside>

      <div className="tp-main">
        <div className="tp-tabbar">
          <Tabs value={tab} onChange={setTab} tabs={[["bills", "Invoices & Orders"], ["costs", "AWS Costs"], ["renewals", "Renewals"], ["logs", "Sync log"]]} />
          <div className="tp-tabbar-btns">
            <button type="button" className="btn btn-sm" onClick={refresh}>Refresh</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => sync()} disabled={!!syncing}>{syncing === "all" ? "Syncing…" : "Sync now"}</button>
          </div>
        </div>
        {tab === "bills" && <Bills {...ctx} />}
        {tab === "costs" && <Costs {...ctx} />}
        {tab === "renewals" && <Renewals {...ctx} />}
        {tab === "logs" && <Logs {...ctx} />}
      </div>
    </div>
  );
}

function ProviderCard({ id, s, loading, syncing, onSync, children }) {
  return (
    <section className={`tp-card is-${id}`}>
      <header>
        <b>{PROVIDER[id]}</b>
        <button type="button" className="btn btn-sm" onClick={() => onSync(id)} disabled={!!syncing || (s && !s.configured)}>{syncing === id ? "Syncing…" : "Sync"}</button>
      </header>
      {loading && <p className="tp-muted">Loading…</p>}
      {s === undefined && !loading && <p className="tp-muted">Couldn't load.</p>}
      {s && !s.configured && (
        <p className="tp-warn">Not set up yet. Add the {id === "aws" ? "AWS_BILLING_KEY, AWS_BILLING_SECRET, AWS_BILLING_ACCOUNT_ID" : "GODADDY_API_KEY, GODADDY_API_SECRET"} keys to the server's .env.</p>
      )}
      {s && children(s)}
      {s && (
        <footer className={s.last_sync && !s.last_sync.ok ? "is-bad" : ""} title={s.last_sync?.message || ""}>
          Last sync: {when(s.last_sync?.finished_at || s.last_sync?.started_at)}{s.last_sync && !s.last_sync.ok ? " · failed" : ""}
        </footer>
      )}
    </section>
  );
}

const Line = ({ label, value, big, warn }) => (
  <div className={`tp-line${big ? " is-big" : ""}${warn ? " is-warn" : ""}`}><span>{label}</span><b>{value}</b></div>
);

/* ---------- Invoices & Orders ---------- */
function Bills({ tick }) {
  const [provider, setProvider] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState({ key: "bill_date", dir: "desc" });
  const pg = useServerPage("/third-party/bills", { provider, q, from, to, sort: sort.key, dir: sort.dir }, tick);
  const head = (k, l, r) => <SortHead k={k} label={l} sort={sort} setSort={setSort} right={r} def="bill_date" />;
  return (
    <section className="card hr-section">
      <header className="tp-bar">
        <Chips value={provider} onChange={setProvider} options={[["", "All"], ["aws", "Amazon (AWS)"], ["godaddy", "GoDaddy"]]} />
        <label className="tp-inline">From <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="tp-inline">To <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <input className="input tp-search" type="search" placeholder="Search invoice / order #, item…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </header>
      {pg.data?.totals?.length > 0 && (
        <div className="tp-totals">{pg.data.totals.map((t) => <span key={t.currency || "-"}>{t.n} bill(s) · <b>{money(t.amount, t.currency)}</b></span>)}</div>
      )}
      <DataTable loading={pg.loading} rows={pg.rows} empty="No bill yet. Click Sync now."
        cols={[
          { key: "bill_date", label: head("bill_date", "Date"), render: (r) => fmtDate(r.bill_date) },
          { key: "provider", label: head("provider", "From"), render: (r) => <span className={`tp-pill is-${r.provider}`}>{PROVIDER[r.provider]}</span> },
          { key: "ref_no", label: head("ref_no", "Invoice / Order #"), render: (r) => <><b>{r.ref_no}</b><span className="hr-sub">{r.kind}</span></> },
          { key: "description", label: "Description", cls: "wrap" },
          { key: "period", label: head("period", "Period") },
          { key: "due_date", label: head("due_date", "Due"), render: (r) => (r.due_date ? fmtDate(r.due_date) : "—") },
          { key: "tax", label: "Tax", cls: "n", render: (r) => (Number(r.tax) ? n2(r.tax) : "—") },
          { key: "amount", label: head("amount", "Amount", true), cls: "n", render: (r) => <b>{money(r.amount, r.currency)}</b> },
        ]} />
      <Pager {...pg.pager} label="bill(s)" />
    </section>
  );
}

/* ---------- AWS cost per month + per service ---------- */
function Costs({ tick }) {
  const [period, setPeriod] = useState("");
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    api.get(`/third-party/costs?months=12${period ? `&period=${period}` : ""}`).then(setD).catch(() => setD({ months: [], services: [] }));
  }, [period, tick]);
  const max = Math.max(1, ...(d?.months || []).map((m) => Number(m.total)));
  const cur = d?.months?.[0]?.currency || "USD";
  const monthName = (p) => new Date(`${p}-01T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
  return (
    <section className="card hr-section">
      {!d && <p className="tp-muted tp-pad">Loading…</p>}
      {d && !d.months.length && <p className="tp-muted tp-pad">No AWS cost yet. Click Sync now.</p>}
      {d && d.months.length > 0 && (
        <>
          <div className="tp-chart" role="list" aria-label="AWS cost per month">
            {d.months.map((m) => (
              <button type="button" role="listitem" key={m.period} className={`tp-bar-col${m.period === d.period ? " is-on" : ""}`}
                onClick={() => setPeriod(m.period)} title={`${m.period}: ${money(m.total, m.currency)}${Number(m.estimated) ? " (estimated)" : ""}`}>
                <small>{n2(m.total)}</small>
                <i style={{ height: `${Math.max(2, (Number(m.total) / max) * 100)}%` }} className={Number(m.estimated) ? "is-est" : ""} />
                <span>{monthName(m.period)}</span>
              </button>
            ))}
          </div>
          <div className="tp-totals"><span>Services in <b>{monthName(d.period)}</b> · total <b>{money(d.services.reduce((a, s) => a + Number(s.amount), 0), cur)}</b>{d.services[0]?.estimated ? " · estimated (month not closed)" : ""}</span></div>
          <DataTable rows={d.services} rowKey="service" totals={["amount"]} empty="No cost in this month."
            cols={[
              { key: "service", label: "Service" },
              { key: "share", label: "Share", render: (s) => {
                const tot = d.services.reduce((a, x) => a + Number(x.amount), 0) || 1;
                const p = (Number(s.amount) / tot) * 100;
                return <span className="tp-share"><i style={{ width: `${p}%` }} />{p.toFixed(1)}%</span>;
              } },
              { key: "amount", label: "Amount", cls: "n", money: true },
            ]} />
        </>
      )}
    </section>
  );
}

/* ---------- GoDaddy domains + subscriptions ---------- */
function Renewals({ tick }) {
  const [kind, setKind] = useState("");
  const [within, setWithin] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "expires_at", dir: "asc" });
  const pg = useServerPage("/third-party/renewals", { kind, within, q, sort: sort.key, dir: sort.dir }, tick);
  const head = (k, l, r) => <SortHead k={k} label={l} sort={sort} setSort={setSort} right={r} def="expires_at" defDir="asc" />;
  return (
    <section className="card hr-section">
      <header className="tp-bar">
        <Chips value={kind} onChange={setKind} options={[["", "All"], ["domain", "Domains"], ["subscription", "Subscriptions"]]} />
        <Chips value={within} onChange={setWithin} options={[["", "Any date"], ["30", "≤ 30 days"], ["60", "≤ 60 days"], ["90", "≤ 90 days"], ["expired", "Expired"]]} />
        <input className="input tp-search" type="search" placeholder="Search domain, product…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </header>
      <DataTable loading={pg.loading} rows={pg.rows} empty="Nothing here. Click Sync now."
        cols={[
          { key: "name", label: head("name", "Name"), render: (r) => <><b>{r.name}</b><span className="hr-sub">{r.kind === "domain" ? "Domain" : r.ref}</span></> },
          { key: "product", label: head("product", "Product") },
          { key: "status", label: head("status", "Status"), render: (r) => r.status || "—" },
          { key: "renew_auto", label: head("renew_auto", "Auto-renew"), render: (r) => (Number(r.renew_auto) ? <span className="tp-pill is-ok">On</span> : <span className="tp-pill is-off">Off</span>) },
          { key: "expires_at", label: head("expires_at", "Expires"), render: (r) => (r.expires_at ? fmtDate(r.expires_at) : "—") },
          { key: "days_left", label: "Days left", cls: "n", render: (r) => {
            if (r.days_left === null || r.days_left === undefined) return "—";
            const n = Number(r.days_left);
            return <b className={n < 0 ? "tp-bad" : n <= 30 ? "tp-warn-t" : ""}>{n < 0 ? `${-n} day(s) ago` : n}</b>;
          } },
        ]} />
      <Pager {...pg.pager} label="item(s)" />
    </section>
  );
}

/* ---------- sync history ---------- */
function Logs({ tick }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { setRows(null); api.get("/third-party/logs").then(setRows).catch(() => setRows([])); }, [tick]);
  return (
    <section className="card hr-section">
      <DataTable loading={!rows} rows={rows || []} empty="No sync yet."
        cols={[
          { key: "started_at", label: "When", render: (r) => when(r.started_at) },
          { key: "provider", label: "From", render: (r) => <span className={`tp-pill is-${r.provider}`}>{PROVIDER[r.provider]}</span> },
          { key: "ok", label: "Result", render: (r) => (Number(r.ok) ? <span className="tp-pill is-ok">OK</span> : <span className="tp-pill is-bad">Failed</span>) },
          { key: "run_by", label: "By", render: (r) => (r.run_by ? `User #${r.run_by}` : "Schedule") },
          { key: "message", label: "Details", cls: "wrap" },
        ]} />
    </section>
  );
}

/* ---------- small shared pieces ---------- */
function Chips({ value, onChange, options }) {
  return (
    <div className="tp-chips" role="radiogroup">
      {options.map(([v, l]) => (
        <button key={l} type="button" role="radio" aria-checked={value === v} className={value === v ? "is-on" : ""} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

/** header click: ↓ then ↑ then back to the default sort · sorting is done by the server */
function SortHead({ k, label, sort, setSort, right, def, defDir = "desc" }) {
  const on = sort.key === k;
  const next = () => setSort(!on ? { key: k, dir: "desc" } : sort.dir === "desc" ? { key: k, dir: "asc" } : k === def ? { key: k, dir: "desc" } : { key: def, dir: defDir });
  return (
    <button type="button" className={`tp-sort${on ? " is-on" : ""}${right ? " is-right" : ""}`} onClick={next} title={`Sort by ${label}`}>
      {label}<i aria-hidden="true">{on ? (sort.dir === "desc" ? "▼" : "▲") : "↕"}</i>
    </button>
  );
}

/** server pagination: only one page is read from the database · { rows, total, page, per_page } */
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
