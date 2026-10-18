// Task → Inventory → Receive Inventory list (old Receive_Inventory.php; same look as Sales.jsx)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { INVENTORY_TABS, RECEIVE_DETAIL_PATH } from "./inventory/inventoryMeta";

// Task → Inventory → Receive Inventory list (old Receive_Inventory.php; same look as Sales.jsx)

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TABLE_HEIGHT = "calc(100vh - 375px)";
const fmtDay = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};
const fmt4 = (n) => Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmt2 = (n) => (Number(n) ? Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

export default function Inventory() {
  const { user } = useAuth();
  const { from, to } = usePeriod();
  const navigate = useNavigate();
  const location = useLocation();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [journalFor, setJournalFor] = useState(null);
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await apiFetch(`/inventory/receive?from=${fromMonth}&to=${toMonth}`));
    } catch (e) {
      setError(e.message || "Couldn't load received inventory.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromMonth, toMonth]);

  useEffect(() => { load(); }, [load, user?.id, user?.caid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.vendor, r.no, r.location, r.po, r.status].join(" ").toLowerCase().includes(q));
  }, [rows, query]);

  const open = (r) => navigate(`${RECEIVE_DETAIL_PATH}/${encodeURIComponent(r.no)}`, { state: { from: location.pathname } });

  // old columns: Vendor · Transaction No · Transaction Date · Location · Total · Status
  const columns = [
    { key: "vendor", label: "Vendor", render: (r) => <span className="strong">{r.vendor}</span> },
    { key: "no", label: "Transaction No", render: (r) => <span className="mono">{r.no}</span> },
    { key: "date", label: "Transaction Date", render: (r) => fmtDay(r.date) },
    { key: "location", label: "Location" },
    { key: "po", label: "PO / Invoice", render: (r) => <span className="mono">{r.po || "—"}</span> },
    { key: "total", label: "Total", align: "right", value: (r) => Number(r.total), render: (r) => <span className="mono">{fmt4(r.total)}</span> },
    { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "VOID" ? "gray" : "green"}>{r.status}</Badge> },
  ];

  const rowActions = (r) => [
    { label: "Journal", onClick: () => setJournalFor(r.no) },
    { label: "Receive Inventory", onClick: () => open(r) },
  ];

  const actions = [
    { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
    { label: "Receive Inventory", icon: "plus", variant: "primary", onClick: () => navigate(`${RECEIVE_DETAIL_PATH}/new`, { state: { from: location.pathname } }) },
  ];

  return (
    <>
      <SearchCard query={query} setQuery={setQuery} placeholder="Search vendor, transaction no, location or PO..." navTabs={INVENTORY_TABS} actions={actions} sticky />

      {error && (
        <div className="alert-error" role="alert">
          {error} <button className="btn btn-sm" onClick={load}>Try again</button>
        </div>
      )}

      <div className="sales-table">
        <DataTable
          bodyHeight={TABLE_HEIGHT}
          columns={columns}
          rows={loading ? [] : filtered}
          rowKey="id"
          exportName={`receive-inventory-${fromMonth}-to-${toMonth}`}
          showToolbar={false}
          emptyText={loading ? "Loading…" : "Nothing received in this period."}
          onRowClick={open}
          rowActions={rowActions}
        />
      </div>

      {journalFor && <JournalModal no={journalFor} onClose={() => setJournalFor(null)} />}
    </>
  );
}

function JournalModal({ no, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch(`/inventory/receive/record/${encodeURIComponent(no)}/journal`)
      .then((res) => setRows(Array.isArray(res) ? res : res.journal || []))
      .catch((e) => setError(e.message || "Couldn't load the journal."));
  }, [no]);
  const dr = (rows || []).reduce((n, r) => n + Number(r.debit || 0), 0);
  const cr = (rows || []).reduce((n, r) => n + Number(r.credit || 0), 0);
  return (
    <Modal title="Journal" onClose={onClose} size="lg">
      <p className="muted small" style={{ marginTop: 0 }}>{no}</p>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="table-scroll">
        <table className="table journal-table">
          <thead><tr><th>Account No</th><th className="ta-right">Debit</th><th className="ta-right">Credit</th></tr></thead>
          <tbody>
            {!rows && !error && <tr><td colSpan={3}><span className="sk sk-cell" style={{ width: "60%" }} /></td></tr>}
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
            <tfoot><tr><td /><td className="ta-right mono strong">{fmt2(dr) || "0.00"}</td><td className="ta-right mono strong">{fmt2(cr) || "0.00"}</td></tr></tfoot>
          )}
        </table>
      </div>
      {rows && rows.length > 0 && Math.abs(dr - cr) > 0.01 && <div className="alert-error" style={{ marginTop: 12 }}>Not balanced: difference of {fmt2(Math.abs(dr - cr))}</div>}
    </Modal>
  );
}
