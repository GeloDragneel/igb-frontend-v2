// Purchases / Expenses → PAY BILL  (writes t_pvoucher_master / t_pvoucher_detail)
import { useCallback, useEffect, useState } from "react";
import Modal, { Field } from "../Modal";
import ConfirmDialog from "../ConfirmDialog";
import SearchSelect from "../SearchSelect";
import { useToast } from "../Toast";
import { apiFetch, apiForm, apiBlob } from "../../context/AuthContext";
import { n2, cleanNum, today, fmtDay, cashAccountOptions, toForm, FILE_ACCEPT, MAX_FILE_MB } from "./paymentUtils";
import "./payments.css";

/** type = "purchases" | "expenses" */
export default function PayBillModal({ type, invoiceNo, accounts = [], onClose, onDone }) {
  const notify = useToast();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toVoid, setToVoid] = useState(null);
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [f, setF] = useState({ pv_date: today(), bank: "", amount: "", payment_type: "Cash", ref_data: "", document_no: "", particulars: "" });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const base = `/${type}`;

  const load = useCallback(() => {
    apiFetch(`${base}/invoice/${encodeURIComponent(invoiceNo)}/payments`)
      .then((d) => { setInfo(d); setF((x) => ({ ...x, amount: x.amount === "" ? String(Math.max(0, d.balance)) : x.amount })); })
      .catch((e) => setError(e.message || "Couldn't load the bill."));
  }, [base, invoiceNo]);
  useEffect(() => { load(); }, [load]);

  const accOpts = cashAccountOptions(accounts);
  const amount = Number(f.amount) || 0;
  const over = info && amount > info.balance + 0.01;

  const save = async () => {
    setError("");
    if (!f.bank) return setError("Pick the cash / bank account the money comes from.");
    if (!(amount > 0)) return setError("Enter the amount paid.");
    if (over) return setError(`More than the balance (${n2(info.balance)}).`);
    if (f.payment_type === "Check" && !f.ref_data.trim()) return setError("Enter the check number.");
    setSaving(true);
    try {
      const res = await apiForm(`${base}/invoice/${encodeURIComponent(invoiceNo)}/payments`, toForm({
        pv_date: f.pv_date, bank: f.bank, amount, payment_type: f.payment_type,
        ref_data: f.ref_data, document_no: f.document_no, particulars: f.particulars,
      }, file));
      notify(res.message);
      onDone?.();
      if (res.balance <= 0.009) onClose();
      else { setF((x) => ({ ...x, amount: String(res.balance), ref_data: "" })); setFile(null); setFileKey((k) => k + 1); load(); }
    } catch (e) {
      setError(e.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const voidIt = async () => {
    const p = toVoid;
    setToVoid(null);
    try {
      const res = await apiFetch(`${base}/payments/${encodeURIComponent(p.pvoucher_no)}`, { method: "DELETE" });
      notify(res.message);
      onDone?.();
      load();
    } catch (e) {
      notify(e.message || "Couldn't remove.", "error");
    }
  };

  const pickFile = (e) => {
    const fl = e.target.files?.[0] || null;
    if (fl && fl.size > MAX_FILE_MB * 1024 * 1024) { setError(`Attachment is too big (${MAX_FILE_MB} MB max).`); e.target.value = ""; return; }
    setError("");
    setFile(fl);
  };

  const viewFile = async (p) => {
    try {
      const blob = await apiBlob(`${base}/payments/${encodeURIComponent(p.pvoucher_no)}/attachment`);
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (e) {
      notify(e.message || "Couldn't open the file.", "error");
    }
  };

  const done = info && info.balance <= 0.009;

  return (
    <Modal
      title={`Pay Bill · ${info?.document_no || invoiceNo}`}
      onClose={() => !saving && onClose()}
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>Close</button>
          {!done && <button className="btn btn-primary" onClick={save} disabled={saving || !info}>{saving ? "Saving…" : `Pay ${n2(amount)}`}</button>}
        </>
      }
    >
      {error && <div className="alert-error" role="alert">{error}</div>}
      {!info && !error && <span className="sk" />}

      {info && (
        <>
          <div className="pay-summary">
            <div><span>Bill total</span><b>{n2(info.grand_total)}</b></div>
            <div><span>Paid</span><b>{n2(info.paid)}</b></div>
            <div className={done ? "is-done" : "is-balance"}><span>{done ? "Fully paid" : "Balance"}</span><b>{n2(info.balance)}</b></div>
          </div>

          {!done && (
            <div className="pay-form">
              <Field label="Date *"><input type="date" className="input" value={f.pv_date} onChange={(e) => set("pv_date", e.target.value)} /></Field>
              <Field label="Amount paid *"><input className="input ta-right" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", cleanNum(e.target.value))} /></Field>
              <Field label="Payment method">
                <select className="input" value={f.payment_type} onChange={(e) => set("payment_type", e.target.value)}>
                  <option>Cash</option>
                  <option>Check</option>
                  <option>Bank Transfer</option>
                  <option>Online</option>
                </select>
              </Field>
              <Field label={f.payment_type === "Check" ? "Check no. *" : "Reference no."}>
                <input className="input" value={f.ref_data} onChange={(e) => set("ref_data", e.target.value)} />
              </Field>
              <div className="field span-2">
                <span className="field-label">Paid from (cash / bank) *</span>
                <SearchSelect value={f.bank} onChange={(v) => set("bank", v)} options={accOpts} searchPlaceholder="Search account..." aria-label="Paid from" />
              </div>
              <Field label="Voucher / document no."><input className="input" value={f.document_no} onChange={(e) => set("document_no", e.target.value)} placeholder={info.document_no || ""} /></Field>
              <Field label="Particulars"><input className="input" value={f.particulars} onChange={(e) => set("particulars", e.target.value)} /></Field>
              <Field label="Attachment (voucher, check, receipt…)">
                <input key={fileKey} type="file" className="input" accept={FILE_ACCEPT} onChange={pickFile} />
              </Field>
            </div>
          )}

          <section className="pay-history">
            <h4>Payments</h4>
            <table>
              <thead><tr><th>Voucher #</th><th>Date</th><th>Method</th><th>Ref</th><th className="n">Amount</th><th>File</th><th /></tr></thead>
              <tbody>
                {info.payments.length === 0 && <tr><td colSpan={7} className="empty">Nothing paid yet.</td></tr>}
                {info.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.pvoucher_no}</td>
                    <td>{fmtDay(p.date)}</td>
                    <td>{p.payment_type || "—"}</td>
                    <td>{p.ref_data || "—"}</td>
                    <td className="n"><b>{n2(p.amount)}</b></td>
                    <td>{p.attachment ? <button className="btn btn-sm" onClick={() => viewFile(p)} title={p.attachment}>View</button> : <span className="muted">—</span>}</td>
                    <td className="n"><button className="btn btn-sm" onClick={() => setToVoid(p)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {toVoid && (
        <ConfirmDialog title={`Remove ${toVoid.pvoucher_no}?`} message={`${n2(toVoid.amount)} goes back to the bill balance.`}
          confirmLabel="Remove" onCancel={() => setToVoid(null)} onConfirm={voidIt} />
      )}
    </Modal>
  );
}