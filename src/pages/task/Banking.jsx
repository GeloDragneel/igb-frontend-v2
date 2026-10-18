// Task → Banking → Collection (old Sales/Receive_Money.php)
// Customer · Date · Transaction # · Total · Payment Method · Journal. Row opens the invoices paid.
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Modal from "../../components/Modal";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { BANKING_TABS, JournalModal, TABLE_HEIGHT, fmtDay, n2 } from "./banking/bankingShared";

const API = "/banking/collections";

export default function Banking() {
  const { user } = useAuth();
  const { from, to } = usePeriod();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);
  const [journal, setJournal] = useState(null);
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setRows(await apiFetch(`${API}?from=${fromMonth}&to=${toMonth}`)); }
    catch (e) { setError(e.message || "Couldn't load collections."); setRows([]); }
    finally { setLoading(false); }
  }, [fromMonth, toMonth]);
  useEffect(() => { load(); }, [load, user?.id, user?.caid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => [r.customer, r.rvoucher_no, r.invoice_no, r.document_no, r.payment_method].join(" ").toLowerCase().includes(q)) : rows;
  }, [rows, query]);
  const total = filtered.reduce((n, r) => n + r.amount, 0);

  const columns = [
    { key: "customer", label: "Customer", render: (r) => <span className="strong">{r.customer}</span> },
    { key: "date", label: "Date", render: (r) => fmtDay(r.date) },
    { key: "rvoucher_no", label: "Transaction #", render: (r) => <span className="mono">{r.rvoucher_no}</span> },
    { key: "invoice_no", label: "Invoice #", render: (r) => <span className="mono">{r.document_no || r.invoice_no || "—"}</span> },
    { key: "amount", label: "Total", align: "right", value: (r) => r.amount, render: (r) => <span className="mono">{n2(r.amount)}</span> },
    { key: "payment_method", label: "Payment Method" },
  ];

  return (
    <>
      <SearchCard
        query={query}
        setQuery={setQuery}
        placeholder="Search customer, transaction # or invoice #..."
        navTabs={BANKING_TABS}
        actions={[{ label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading }]}
        sticky
      />
      {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}
      <p className="muted small" style={{ margin: "0 0 8px" }}>{filtered.length} collection(s) · Total <b className="mono">{n2(total)}</b></p>
      <div className="sales-table">
        <DataTable
          bodyHeight={TABLE_HEIGHT}
          columns={columns}
          rows={loading ? [] : filtered}
          rowKey="id"
          exportName={`collections-${fromMonth}-to-${toMonth}`}
          emptyText={loading ? "Loading…" : "No collections for this period."}
          onRowClick={setOpen}
          rowActions={(r) => [
            { label: "Details", onClick: () => setOpen(r) },
            { label: "Journal", onClick: () => setJournal(r) },
          ]}
        />
      </div>
      {open && <CollectionDetails row={open} onClose={() => setOpen(null)} onJournal={() => { setJournal(open); setOpen(null); }} />}
      {journal && <JournalModal title={`Journal · ${journal.rvoucher_no}`} url={`${API}/${encodeURIComponent(journal.rvoucher_no)}/journal`} onClose={() => setJournal(null)} />}
    </>
  );
}

function CollectionDetails({ row, onClose, onJournal }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch(`${API}/${encodeURIComponent(row.rvoucher_no)}`).then(setRows).catch((e) => setError(e.message || "Couldn't load."));
  }, [row.rvoucher_no]);
  const total = (rows || []).reduce((n, r) => n + r.amount, 0);
  return (
    <Modal title={`Collection ${row.rvoucher_no}`} onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={onJournal}>Journal</button></>}>
      <p className="muted small" style={{ marginTop: 0 }}>{row.customer} · {fmtDay(row.date)} · {row.payment_method}</p>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="table-scroll">
        <table className="table">
          <thead><tr><th>Invoice #</th><th>Account</th><th className="ta-right">Withholding</th><th className="ta-right">Amount</th></tr></thead>
          <tbody>
            {!rows && !error && <tr><td colSpan={4}><span className="sk sk-cell" style={{ width: "60%" }} /></td></tr>}
            {rows?.length === 0 && <tr><td colSpan={4} className="empty">No lines.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.invoice_no}</td>
                <td>{r.account_code} {r.account_name && <span className="muted">– {r.account_name}</span>}</td>
                <td className="ta-right mono">{r.withholding ? n2(r.withholding) : ""}</td>
                <td className="ta-right mono">{n2(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          {rows?.length > 0 && <tfoot><tr><td colSpan={3} className="strong">Total</td><td className="ta-right mono strong">{n2(total)}</td></tr></tfoot>}
        </table>
      </div>
    </Modal>
  );
}
