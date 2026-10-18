// Shared screen for Receivables / Payables (old Reports/Account_Receivable, Aged_Receivable, Account_Payable, Aged_Payable)
//   mode "asof": pick a month → everything unpaid as of month end (0-30 · 31-60 · 61-90 · Over 90)
//   mode "aged": Declared Month / Date Range / Date of Entry, customer or vendor, branch (… · 91-120 · Over 120)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SearchCard from "../../components/SearchCard";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { agingExcel, agingPdf, money } from "./agingExport";

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const thisMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const monthStart = `${thisMonth}-01`;
const today = `${thisMonth}-${pad(now.getDate())}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso) => { if (!iso) return "—"; const [y, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${pad(d)} ${y}`; };
const fmtMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };

/**
 * type   "ar" | "ap"
 * mode   "asof" | "aged"
 */
export default function AgingReport({ type, mode }) {
  const { user } = useAuth();
  const notify = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const ar = type === "ar";
  const party = ar ? "Customer" : "Vendor";
  const base = location.pathname.replace(/\/aged\/?$/, "");
  const tabs = [
    { to: base, label: ar ? "Account Receivable" : "Account Payable", end: true },
    { to: `${base}/aged`, label: ar ? "Aged Receivable" : "Aged Payable" },
  ];

  const [month, setMonth] = useState(thisMonth);
  const [filterType, setFilterType] = useState("DM");
  const [dmFrom, setDmFrom] = useState(`${now.getFullYear()}-01`);
  const [dmTo, setDmTo] = useState(thisMonth);
  const [dFrom, setDFrom] = useState(monthStart);
  const [dTo, setDTo] = useState(today);
  const [partyId, setPartyId] = useState("");
  const [branch, setBranch] = useState("current");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");

  const params = useCallback(() => {
    const q = new URLSearchParams({ type, branch });
    if (mode === "asof") { q.set("filter_type", "AS"); q.set("from", month); }
    else {
      q.set("filter_type", filterType);
      q.set("from", filterType === "DM" ? dmFrom : dFrom);
      q.set("to", filterType === "DM" ? dmTo : dTo);
      if (partyId) q.set("party_id", partyId);
    }
    return q;
  }, [type, mode, branch, month, filterType, dmFrom, dmTo, dFrom, dTo, partyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await apiFetch(`/reports/aging?${params()}`)); }
    catch (e) { setError(e.message || "Couldn't load the report."); setData(null); }
    finally { setLoading(false); }
  }, [params]);

  // first load, and whenever the tab / client changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [mode, type, user?.id, user?.caid]);

  const buckets = data?.buckets || [];
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (data?.rows || []).filter((r) => !q || `${r.party_name} ${r.document_no} ${r.invoice_no}`.toLowerCase().includes(q));
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.party_id)) map.set(r.party_id, { party_id: r.party_id, party_name: r.party_name, rows: [], totals: {} });
      map.get(r.party_id).rows.push(r);
    }
    const keys = [...buckets.map((b) => b.key), "amount_due"];
    return [...map.values()].map((g) => ({ ...g, totals: Object.fromEntries(keys.map((k) => [k, g.rows.reduce((n, r) => n + Number(r[k] || 0), 0)])) }));
  }, [data, query, buckets]);

  const totals = useMemo(() => {
    const keys = [...buckets.map((b) => b.key), "amount_due"];
    return Object.fromEntries(keys.map((k) => [k, groups.reduce((n, g) => n + g.totals[k], 0)]));
  }, [groups, buckets]);

  const title = mode === "asof" ? (ar ? "Accounts Receivable" : "Accounts Payable") : (ar ? "Aged Receivables" : "Aged Payables");
  const subtitle = data ? (mode === "asof" ? `As of ${fmtDay(data.as_of)}`
    : filterType === "DM" ? `Declared ${fmtMonth(dmFrom)} to ${fmtMonth(dmTo)} · aged as of ${fmtDay(data.as_of)}`
      : `${filterType === "DE" ? "Entered" : "Dated"} ${fmtDay(dFrom)} to ${fmtDay(dTo)} · aged as of ${fmtDay(data.as_of)}`) : "";

  const exportIt = async (kind) => {
    if (!data) return;
    setBusy(kind);
    try {
      const args = {
        title, subtitle, partyLabel: party, company: data.company, buckets, groups, totals,
        fileName: `${title.replace(/\s+/g, "_")}_${(data.as_of || "").slice(0, 10)}`
      };
      if (kind === "xlsx") await agingExcel(args); else await agingPdf(args);
    } catch (e) {
      notify(e.message || "Couldn't create the file.", "error");
    } finally {
      setBusy("");
    }
  };

  const partyOpts = [{ value: "", label: `All ${party.toLowerCase()}s` }, ...(data?.parties || []).map((p) => ({ value: String(p.id), label: p.name }))];
  const openInvoice = (r) => {
    if (ar) navigate(`/task/sales/${encodeURIComponent(r.invoice_no)}`, { state: { from: location.pathname } });
    else navigate(`/task/${r.trans_type === "Expenses" ? "expenses" : "purchases"}/${encodeURIComponent(r.invoice_no)}`, { state: { from: location.pathname } });
  };

  return (
    <div className="ag">
      <SearchCard
        query={query}
        setQuery={setQuery}
        placeholder={`Search ${party.toLowerCase()} or invoice #...`}
        navTabs={tabs}
        actions={[
          { label: loading ? "Loading…" : "Search", icon: "refresh", onClick: load, disabled: loading },
          { label: busy === "xlsx" ? "Preparing…" : "Excel", icon: "download", onClick: () => exportIt("xlsx"), disabled: !data || !!busy || loading },
          { label: busy === "pdf" ? "Preparing…" : "PDF", icon: "download", variant: "primary", onClick: () => exportIt("pdf"), disabled: !data || !!busy || loading },
        ]}
        extra={
          <div className="ag-filters">
            {mode === "asof" ? (
              <label className="ag-f"><span>Transaction month</span>
                <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
            ) : (
              <>
                <label className="ag-f"><span>Filter type</span>
                  <select className="input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="DM">Declared Month</option>
                    <option value="DR">Date Range</option>
                    <option value="DE">Date of Entry</option>
                  </select></label>
                {filterType === "DM" ? (
                  <>
                    <label className="ag-f"><span>From</span><input type="month" className="input" value={dmFrom} onChange={(e) => setDmFrom(e.target.value)} /></label>
                    <label className="ag-f"><span>To</span><input type="month" className="input" value={dmTo} onChange={(e) => setDmTo(e.target.value)} /></label>
                  </>
                ) : (
                  <>
                    <label className="ag-f"><span>Date from</span><input type="date" className="input" value={dFrom} onChange={(e) => setDFrom(e.target.value)} /></label>
                    <label className="ag-f"><span>Date to</span><input type="date" className="input" value={dTo} onChange={(e) => setDTo(e.target.value)} /></label>
                  </>
                )}
                <div className="ag-f ag-party"><span>{party}</span>
                  <SearchSelect value={partyId} onChange={setPartyId} options={partyOpts} searchPlaceholder={`Search ${party.toLowerCase()}...`} aria-label={party} /></div>
              </>
            )}
            {data?.branches?.length > 1 && (
              <label className="ag-f"><span>Branch</span>
                <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
                  <option value="current">This branch</option>
                  <option value="all">All branches</option>
                  {data.branches.map((b) => <option key={b.id} value={String(b.id)}>{b.label}</option>)}
                </select></label>
            )}
          </div>
        }
        sticky
      />

      {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

      <section className="card ag-card">
        <header className="ag-head">
          <h2>{data?.company?.trade_name || data?.company?.name || ""}</h2>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </header>

        {data && !loading && (
          <div className="ag-summary">
            {buckets.map((b, i) => (
              <div key={b.key} className={`ag-pill t${i}`}><span>{b.label}</span><b>{money(totals[b.key])}</b></div>
            ))}
            <div className="ag-pill total"><span>Amount due</span><b>{money(totals.amount_due)}</b></div>
          </div>
        )}

        <div className="ag-scroll">
          <table className="ag-table">
            <thead>
              <tr>
                <th className="ag-sticky">{party} / Invoice #</th>
                <th className="c">Date</th>
                <th className="c">Days</th>
                {buckets.map((b) => <th key={b.key} className="n">{b.label}</th>)}
                <th className="n">Amount Due</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={4 + buckets.length || 8}><span className="sk sk-cell" style={{ width: `${50 + (i % 3) * 15}%` }} /></td></tr>
              ))}
              {!loading && groups.length === 0 && (
                <tr><td colSpan={4 + buckets.length} className="ag-empty">
                  {query ? "Nothing matches your search." : `No unpaid ${ar ? "receivables" : "payables"} for this period.`}
                </td></tr>
              )}
              {!loading && groups.map((g) => (
                <GroupRows key={g.party_id} g={g} buckets={buckets} onOpen={openInvoice} />
              ))}
            </tbody>
            {!loading && groups.length > 0 && (
              <tfoot>
                <tr>
                  <td className="ag-sticky">Grand total · {groups.length} {party.toLowerCase()}{groups.length === 1 ? "" : "s"}</td>
                  <td /><td />
                  {buckets.map((b) => <td key={b.key} className="n">{money(totals[b.key])}</td>)}
                  <td className="n">{money(totals.amount_due)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
function GroupRows({ g, buckets, onOpen }) {
  return (
    <>
      <tr className="ag-party-row">
        <td className="ag-sticky" colSpan={3}>{g.party_name} <span className="ag-id">#{g.party_id}</span></td>
        {buckets.map((b) => <td key={b.key} />)}
        <td />
      </tr>
      {g.rows.map((r) => (
        <tr key={r.id} className="ag-row" tabIndex={0} onClick={() => onOpen(r)} onKeyDown={(e) => e.key === "Enter" && onOpen(r)}>
          <td className="ag-sticky ag-doc">{r.document_no}</td>
          <td className="c">{fmtDay(r.date)}</td>
          <td className="c">{r.days}</td>
          {buckets.map((b) => <td key={b.key} className="n">{Number(r[b.key]) ? money(r[b.key]) : ""}</td>)}
          <td className="n strong">{money(r.amount_due)}</td>
        </tr>
      ))}
      <tr className="ag-sub">
        <td className="ag-sticky">Total {g.party_name}</td>
        <td /><td />
        {buckets.map((b) => <td key={b.key} className="n">{money(g.totals[b.key])}</td>)}
        <td className="n">{money(g.totals.amount_due)}</td>
      </tr>
    </>
  );
}