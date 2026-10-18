// Invoice logs: created, scanned, tickets (EDIT / VOID / CANCEL / declared month), audit, money received / paid
import { useEffect, useState } from "react";
import Modal from "../Modal";
import Badge from "../Badge";
import { apiFetch } from "../../context/AuthContext";
import "./invoiceExtras.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtAt = (s) => {
  if (!s) return "";
  const [d, t = ""] = String(s).split(" ");
  const [y, m, day] = d.split("-").map(Number);
  const [hh = 0, mm = 0] = t.split(":").map(Number);
  const h12 = hh % 12 || 12;
  return `${MONTHS[m - 1]} ${String(day).padStart(2, "0")} ${y}${t ? ` · ${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}` : ""}`;
};

/** type = "sales" | "purchases" | "expenses" */
export default function InvoiceLogsModal({ type = "sales", invoiceNo, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/${type}/invoice/${encodeURIComponent(invoiceNo)}/logs`)
      .then(setData)
      .catch((e) => setError(e.message || "Couldn't load the logs."));
  }, [type, invoiceNo]);

  return (
    <Modal title="Logs" onClose={onClose} size="md" footer={<button className="btn" onClick={onClose}>Close</button>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {!data && !error && <span className="sk sk-cell" />}
      {data && (
        <>
          <p className="logs-head">
            <span className="mono strong">{data.invoice_no}</span>
            {data.document_no && <span className="muted">Doc # {data.document_no}</span>}
            {data.status && <Badge tone={/UNPAID/i.test(data.status) ? "red" : /PARTIAL/i.test(data.status) ? "orange" : /PAID/i.test(data.status) ? "green" : "gray"}>{data.status}</Badge>}
          </p>
          {data.events.length === 0 ? (
            <p className="logs-empty">Nothing recorded yet.</p>
          ) : (
            <ol className="logs">
              {data.events.map((e, i) => (
                <li key={i} className={`t-${e.tone || "gray"}`}>
                  <div className="logs-title">{e.title}</div>
                  <div className="logs-meta">{fmtAt(e.at)}{e.by ? ` · ${e.by}` : ""}</div>
                  {e.detail && <div className="logs-detail">{e.detail}</div>}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Modal>
  );
}
