// Task → Banking → Payment (old Vendors_and_Purchases/Pay_Bill.php)
// Vendor Name · Date · Transaction # · Reference # · Total · Payment Method. Row opens the lines paid.
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../../components/SearchCard";
import DataTable from "../../../components/DataTable";
import Modal from "../../../components/Modal";
import { useAuth, apiFetch } from "../../../context/AuthContext";
import { usePeriod } from "../../../context/PeriodContext";
import { BANKING_TABS, JournalModal, TABLE_HEIGHT, fmtDay, n2 } from "./bankingShared";

const API = "/banking/payments";

export default function Payment() {
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
    catch (e) { setError(e.message || "Couldn't load payments."); setRows([]); }
    finally { setLoading(false); }
  }, [fromMonth, toMonth]);
  useEffect(() => { load(); }, [load, user?.id, user?.caid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => [r.vendor, r.pvoucher_no, r.document_no, r.ap_invoice_no, r.payment_method, r.ref_data].join(" ").toLowerCase().includes(q)) : rows;
  }, [rows, query]);
  const total = filtered.reduce((n, r) => n + r.amount, 0);

  const columns = [
    { key: "vendor", label: "Vendor Name", render: (r) => <span className="strong">{r.vendor}</span> },
    { key: "date", label: "Date", render: (r) => fmtDay(r.date) },
    { key: "pvoucher_no", label: "Transaction #", render: (r) => <span className="mono">{r.pvoucher_no}</span> },
    { key: "document_no", label: "Reference #", render: (r) => <span className="mono">{r.document_no || "—"}</span> },
    { key: "amount", label: "Total", align: "right", value: (r) => r.amount, render: (r) => <span className="mono">{n2(r.amount)}</span> },
    { key: "payment_method", label: "Payment Method" },
  ];

  return (
    <>
      <SearchCard
        query={query}
        setQuery={setQuery}
        placeholder="Search vendor, transaction # or reference #..."
        navTabs={BANKING_TABS}
        actions={[{ label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading }]}
        sticky
      />
      {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}
      <p className="muted small" style={{ margin: "0 0 8px" }}>{filtered.length} payment(s) · Total <b className="mono">{n2(total)}</b></p>
      <div className="sales-table">
        <DataTable
          bodyHeight={TABLE_HEIGHT}
          columns={columns}
          rows={loading ? [] : filtered}
          rowKey="id"
          exportName={`payments-${fromMonth}-to-${toMonth}`}
          emptyText={loading ? "Loading…" : "No payments for this period."}
          onRowClick={setOpen}
          rowActions={(r) => [
            { label: "Details", onClick: () => setOpen(r) },
            { label: "Journal", onClick: () => setJournal(r) },
          ]}
        />
      </div>
      {open && <PaymentDetails row={open} onClose={() => setOpen(null)} onJournal={() => { setJournal(open); setOpen(null); }} />}
      {journal && <JournalModal title={`Journal · ${journal.pvoucher_no}`} url={`${API}/${encodeURIComponent(journal.pvoucher_no)}/journal`} onClose={() => setJournal(null)} />}
    </>
  );
}

function PaymentDetails({ row, onClose, onJournal }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch(`${API}/${encodeURIComponent(row.pvoucher_no)}`).then(setRows).catch((e) => setError(e.message || "Couldn't load."));
  }, [row.pvoucher_no]);
  const total = (rows || []).reduce((n, r) => n + r.amount, 0);
  return (
    <Modal title={`Payment ${row.pvoucher_no}`} onClose={onClose} size="lg"
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={onJournal}>Journal</button></>}>
      <p className="muted small" style={{ marginTop: 0 }}>{row.vendor} · {fmtDay(row.date)} · {row.payment_method}{row.ref_data ? ` · ${row.ref_data}` : ""}</p>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="table-scroll">
        <table className="table">
          <thead><tr><th>Item ID</th><th>Description</th><th>Invoice #</th><th>Code</th><th>Accounts</th><th className="ta-right">Amount</th></tr></thead>
          <tbody>
            {!rows && !error && <tr><td colSpan={6}><span className="sk sk-cell" style={{ width: "60%" }} /></td></tr>}
            {rows?.length === 0 && <tr><td colSpan={6} className="empty">No lines.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.item_code || "—"}</td>
                <td>{r.description || "—"}</td>
                <td className="mono">{r.ap_invoice_no || "—"}</td>
                <td className="mono">{r.acc_code}</td>
                <td>{r.account_name}</td>
                <td className="ta-right mono">{n2(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          {rows?.length > 0 && <tfoot><tr><td colSpan={5} className="strong">Total</td><td className="ta-right mono strong">{n2(total)}</td></tr></tfoot>}
        </table>
      </div>
    </Modal>
  );
}
