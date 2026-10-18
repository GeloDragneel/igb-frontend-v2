// Shared bits for Task → Banking (tabs, formatters, journal popup)
import { useEffect, useState } from "react";
import Modal from "../../../components/Modal";
import { apiFetch } from "../../../context/AuthContext";

export const BANKING_TABS = [
  { to: "/task/banking", label: "Collection", end: true },
  { to: "/task/banking/payment", label: "Payment" },
  { to: "/task/banking/petty-cash", label: "Petty Cash" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};
export const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const today = () => new Date().toISOString().slice(0, 10);
export const TABLE_HEIGHT = "calc(100vh - 375px)";

/** Journal popup: url returns [{account_code, account_name, debit, credit}] */
export function JournalModal({ title, url, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch(url).then(setRows).catch((e) => setError(e.message || "Couldn't load the journal."));
  }, [url]);
  const dr = (rows || []).reduce((n, r) => n + Number(r.debit || 0), 0);
  const cr = (rows || []).reduce((n, r) => n + Number(r.credit || 0), 0);
  return (
    <Modal title={title} onClose={onClose} size="lg">
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="table-scroll">
        <table className="table journal-table">
          <thead><tr><th>Account No</th><th>Description</th><th className="ta-right">Debit</th><th className="ta-right">Credit</th></tr></thead>
          <tbody>
            {!rows && !error && <tr><td colSpan={4}><span className="sk sk-cell" style={{ width: "60%" }} /></td></tr>}
            {rows?.length === 0 && <tr><td colSpan={4} className="empty">No journal lines.</td></tr>}
            {rows?.map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.account_code}</td>
                <td>{r.account_name || <span className="muted">—</span>}</td>
                <td className="ta-right mono">{Number(r.debit) ? n2(r.debit) : ""}</td>
                <td className="ta-right mono">{Number(r.credit) ? n2(r.credit) : ""}</td>
              </tr>
            ))}
          </tbody>
          {rows?.length > 0 && (
            <tfoot>
              <tr><td /><td className="strong">Total</td><td className="ta-right mono strong">{n2(dr)}</td><td className="ta-right mono strong">{n2(cr)}</td></tr>
            </tfoot>
          )}
        </table>
      </div>
    </Modal>
  );
}
