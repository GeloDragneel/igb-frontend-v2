// Importation / Exportation list (same look as Sales.jsx)
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SearchCard from "../../../components/SearchCard";
import DataTable from "../../../components/DataTable";
import Badge from "../../../components/Badge";
import Modal from "../../../components/Modal";
import Icon from "../../../components/Icons";
import { useAuth, apiFetch } from "../../../context/AuthContext";
import { usePeriod } from "../../../context/PeriodContext";
import { TradeTicketModal } from "./TradeDetail";
import { countryName } from "./tradeConfig";

// search text kept per browser tab (survives F5, going back to the list, switching tabs)
const searchKey = (k) => `${k}.search`;
const readSearch = (k) => { try { return sessionStorage.getItem(searchKey(k)) || ""; } catch { return ""; } };
const saveSearch = (k, v) => { try { v ? sessionStorage.setItem(searchKey(k), v) : sessionStorage.removeItem(searchKey(k)); } catch { /* ignore */ } };

// last loaded rows per list + account + period, kept while the app is open:
// coming back shows the table right away (no skeleton) and refreshes quietly
const rowsCache = new Map();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TABLE_HEIGHT = "calc(100vh - 375px)";

const fmtDay = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};
const fmt4 = (n) => Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmt2 = (n) =>
  Number(n) ? Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

export default function TradeList({ cfg }) {
  const { user } = useAuth();
  const { from, to } = usePeriod();
  const navigate = useNavigate();
  const location = useLocation();

  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const cacheKey = `${cfg.key}:${user?.id}:${user?.caid}:${fromMonth}:${toMonth}`;

  const [rows, setRows] = useState(() => rowsCache.get(cacheKey) || []);
  const [loading, setLoading] = useState(true);
  // skeleton only until the first data has been shown
  const [loadedOnce, setLoadedOnce] = useState(() => rowsCache.has(cacheKey));
  const [error, setError] = useState("");
  const [query, setQueryState] = useState(() => readSearch(cfg.key));
  const setQuery = useCallback((v) => {
    setQueryState((cur) => {
      const next = typeof v === "function" ? v(cur) : v;
      saveSearch(cfg.key, next);
      return next;
    });
  }, [cfg.key]);
  const [journalFor, setJournalFor] = useState(null);
  const [ticketFor, setTicketFor] = useState(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    // a period / account already seen → show it straight away while it refreshes
    if (rowsCache.has(cacheKey)) setRows(rowsCache.get(cacheKey));
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`${cfg.api}?from=${fromMonth}&to=${toMonth}`);
      if (id !== reqId.current) return;           // an older request finished late
      rowsCache.set(cacheKey, data);
      setRows(data);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e.message || `Couldn't load ${cfg.title.toLowerCase()}.`);
      if (!rowsCache.has(cacheKey)) setRows([]);  // keep what's on screen if we had it
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setLoadedOnce(true);
      }
    }
  }, [cfg.api, cfg.title, fromMonth, toMonth, cacheKey]);

  useEffect(() => { load(); }, [load, user?.id, user?.caid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.party_name, r.no, r.invoice_no, r.entry_no, countryName(r.country)].join(" ").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const open = (r) => navigate(`${cfg.detailRoute}/${encodeURIComponent(r.no)}`, { state: { from: location.pathname } });

  // old columns: Seller · Release Date · Declared Month · Invoice No · Import Entry No · Origin Country · VAT Payment Date
  const columns = [
    { key: "party_name", label: cfg.party, render: (r) => <Trunc text={r.party_name} className="strong" max={220} /> },
    { key: "date", label: cfg.dateLabel, render: (r) => fmtDay(r.date) },
    { key: "declared_month", label: "Declared Month" },
    {
      key: "invoice_no",
      label: "Invoice No",
      render: (r) => (
        <div className="inv-no-cell">
          <span className="mono">{r.invoice_no || "N/A"}</span>
          {r.ticket_no && (
            <button
              type="button"
              className="ticket-icon"
              onClick={(e) => { e.stopPropagation(); setTicketFor(r.ticket_no); }}
              data-tip={`Ticket pending: ${r.ticket_no}`}
              aria-label={`View pending ticket ${r.ticket_no}`}
            >
              <Icon name="fileText" size={14} />
            </button>
          )}
        </div>
      ),
    },
    { key: "entry_no", label: cfg.entryLabel, render: (r) => <Trunc text={r.entry_no} max={160} /> },
    { key: "country", label: cfg.countryLabel, value: (r) => countryName(r.country), render: (r) => countryName(r.country) || "—" },
    { key: "pay_date", label: cfg.payLabel, render: (r) => fmtDay(r.pay_date) },
    { key: "total", label: cfg.totalLabel, align: "right", value: (r) => Number(r.total), render: (r) => <span className="mono">{fmt4(r.total)}</span> },
    { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "VOID" ? "gray" : "green"}>{r.status}</Badge> },
  ];

  const rowActions = (r) => [
    { label: "Journal", onClick: () => setJournalFor(r.no) },
    { label: cfg.title, onClick: () => open(r) },
  ];

  const actions = [
    { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
    { label: `Add ${cfg.title}`, icon: "plus", variant: "primary", onClick: () => navigate(`${cfg.detailRoute}/new`, { state: { from: location.pathname } }) },
  ];

  return (
    <>
      <SearchCard
        query={query}
        setQuery={setQuery}
        placeholder={`Search ${cfg.party.toLowerCase()}, invoice, entry no or country...`}
        actions={actions}
        sticky
      />

      {error && (
        <div className="alert-error" role="alert">
          {error} <button className="btn btn-sm" onClick={load}>Try again</button>
        </div>
      )}

      {loading && !loadedOnce ? (
        <TableSkeleton columns={columns} bodyHeight={TABLE_HEIGHT} label={`Loading ${cfg.title.toLowerCase()}`} />
      ) : (
        <div className="sales-table">
          <DataTable
            bodyHeight={TABLE_HEIGHT}
            columns={columns}
            rows={filtered}
            rowKey="id"
            exportName={`${cfg.key}-${fromMonth}-to-${toMonth}`}
            showToolbar={false}
            stateKey={cfg.key}
            resetKey={query}
            emptyText={`No ${cfg.title.toLowerCase()} for this period.`}
            onRowClick={open}
            rowActions={rowActions}
          />
        </div>
      )}

      {journalFor && <JournalModal api={cfg.api} no={journalFor} onClose={() => setJournalFor(null)} />}
      {ticketFor && <TradeTicketModal cfg={cfg} ticketNo={ticketFor} onClose={() => setTicketFor(null)} />}
    </>
  );
}

/* ---------- first-load skeleton (same as Sales) ---------- */
function TableSkeleton({ columns, bodyHeight, label, rows = 10 }) {
  const widths = ["70%", "55%", "60%", "65%", "60%", "50%", "55%", "45%", "40%"];
  return (
    <section className="card table-card" aria-busy="true" aria-label={label}>
      <div className="table-scroll scroll-body" style={{ maxHeight: bodyHeight }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => <th key={c.key} className={c.align ? `ta-${c.align}` : ""}>{c.label}</th>)}
              <th className="ta-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                {columns.map((c, i) => (
                  <td key={c.key} className={c.align ? `ta-${c.align}` : ""}>
                    <span className={`sk sk-cell ${c.key === "status" ? "sk-pill" : ""}`} style={{ width: widths[i % widths.length] }} />
                  </td>
                ))}
                <td className="ta-center"><span className="sk sk-dots" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="sk sk-foot" />
        <span className="sk sk-foot sk-foot-sm" />
      </div>
    </section>
  );
}

/* ---------- Journal popup ---------- */
export function JournalModal({ api, no, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`${api}/record/${encodeURIComponent(no)}/journal`)
      .then((res) => setRows(Array.isArray(res) ? res : res.journal || []))
      .catch((e) => setError(e.message || "Couldn't load the journal."));
  }, [api, no]);

  const totalDr = (rows || []).reduce((n, r) => n + Number(r.debit || 0), 0);
  const totalCr = (rows || []).reduce((n, r) => n + Number(r.credit || 0), 0);

  return (
    <Modal title="Journal" onClose={onClose} size="lg">
      <p className="muted small" style={{ marginTop: 0 }}>{no}</p>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="table-scroll">
        <table className="table journal-table">
          <thead>
            <tr>
              <th>Account No</th>
              <th className="ta-right">Debit</th>
              <th className="ta-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {!rows && !error && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>
                <td><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                <td className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                <td className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
              </tr>
            ))}
            {rows && rows.length === 0 && <tr><td colSpan={3} className="empty">No journal entries.</td></tr>}
            {rows?.map((r, i) => (
              <tr key={i}>
                <td>{r.account_code} - {r.account_name}</td>
                <td className="ta-right mono">{fmt2(r.debit)}</td>
                <td className="ta-right mono">{fmt2(r.credit)}</td>
              </tr>
            ))}
          </tbody>
          {rows && rows.length > 0 && (
            <tfoot>
              <tr>
                <td />
                <td className="ta-right mono strong">{fmt2(totalDr) || "0.00"}</td>
                <td className="ta-right mono strong">{fmt2(totalCr) || "0.00"}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows && rows.length > 0 && Math.abs(totalDr - totalCr) > 0.01 && (
        <div className="alert-error" style={{ marginTop: 12 }}>Not balanced: difference of {fmt2(Math.abs(totalDr - totalCr))}</div>
      )}
    </Modal>
  );
}

/* ---------- Text cut with "…"; tooltip only when it's actually cut ---------- */
function Trunc({ text, className = "", max }) {
  const ref = useRef(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setCut(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return (
    <span ref={ref} className={`cell-trunc ${className}`} style={max ? { maxWidth: max } : undefined} title={cut ? text : undefined}>
      {text || "—"}
    </span>
  );
}