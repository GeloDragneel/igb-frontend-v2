// Sales → RECEIVE MONEY  (writes t_rvoucher_master / t_rvoucher_detail)
import { useCallback, useEffect, useState } from "react";
import Modal, { Field } from "../Modal";
import ConfirmDialog from "../ConfirmDialog";
import SearchSelect from "../SearchSelect";
import { useToast } from "../Toast";
import { apiFetch, apiForm, apiBlob } from "../../context/AuthContext";
import { n2, cleanNum, today, fmtDay, cashAccountOptions, toForm, FILE_ACCEPT, MAX_FILE_MB } from "./paymentUtils";
import "./payments.css";

export default function ReceiveMoneyModal({ invoiceNo, accounts = [], atc = [], declaredMonth, onClose, onDone }) {
  const notify = useToast();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toVoid, setToVoid] = useState(null);
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [f, setF] = useState({
    rv_date: today(), declared_month: declaredMonth || today().slice(0, 7), document_no: "", bank: "", amount: "",
    atc_vt_id: "", vt: "", atc_it_id: "", it: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const load = useCallback(() => {
    apiFetch(`/sales/invoice/${encodeURIComponent(invoiceNo)}/collections`)
      .then((d) => { setInfo(d); setF((x) => ({ ...x, amount: x.amount === "" ? String(Math.max(0, d.balance)) : x.amount })); })
      .catch((e) => setError(e.message || "Couldn't load the invoice."));
  }, [invoiceNo]);
  useEffect(() => { load(); }, [load]);

  const accOpts = cashAccountOptions(accounts);
  // same list as the invoice form: "WC158 (1%)"
  const pct = (a) => { const r = Number(a.rate ?? a.percent ?? 0); return (r > 1 ? r : r * 100).toFixed(2).replace(/\.00$/, ""); };
  const atcList = [{ value: "", label: "None" }, ...atc.map((a) => ({ value: String(a.id), label: `${a.name || a.atc || a.id} (${pct(a)}%)` }))];
  const atcOpts = () => atcList;

  const applied = (Number(f.amount) || 0) + (Number(f.vt) || 0) + (Number(f.it) || 0);
  const over = info && applied > info.balance + 0.01;

  const save = async () => {
    setError("");
    if (!f.bank) return setError("Pick the cash / bank account the money goes to.");
    if (!(applied > 0)) return setError("Enter the amount received.");
    if (over) return setError(`More than the balance (${n2(info.balance)}).`);
    if (Number(f.vt) > 0 && !f.atc_vt_id) return setError("Pick the ATC for 2307 (VT/PT).");
    if (Number(f.it) > 0 && !f.atc_it_id) return setError("Pick the ATC for 2307 (IT).");
    setSaving(true);
    try {
      const res = await apiForm(`/sales/invoice/${encodeURIComponent(invoiceNo)}/collections`, toForm({
        rv_date: f.rv_date, declared_month: f.declared_month, document_no: f.document_no, bank: f.bank,
        amount: Number(f.amount) || 0,
        atc_vt_id: f.atc_vt_id, "2307_vt": Number(f.vt) || 0, vt_month: f.declared_month,
        atc_it_id: f.atc_it_id, "2307_it": Number(f.it) || 0, it_month: f.declared_month,
      }, file));
      notify(res.message);
      onDone?.();
      if (res.balance <= 0.009) onClose();
      else { setF((x) => ({ ...x, amount: String(res.balance), vt: "", it: "", document_no: "" })); setFile(null); setFileKey((k) => k + 1); load(); }
    } catch (e) {
      setError(e.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const voidIt = async () => {
    const r = toVoid;
    setToVoid(null);
    try {
      const res = await apiFetch(`/sales/collections/${encodeURIComponent(r.rvoucher_no)}`, { method: "DELETE" });
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

  const viewFile = async (r) => {
    try {
      const blob = await apiBlob(`/sales/collections/${encodeURIComponent(r.rvoucher_no)}/attachment`);
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (e) {
      notify(e.message || "Couldn't open the file.", "error");
    }
  };

  const done = info && info.balance <= 0.009;

  return (
    <Modal
      title={`Receive Money · ${info?.document_no || invoiceNo}`}
      onClose={() => !saving && onClose()}
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>Close</button>
          {!done && <button className="btn btn-primary" onClick={save} disabled={saving || !info}>{saving ? "Saving…" : `Receive ${n2(applied)}`}</button>}
        </>
      }
    >
      {error && <div className="alert-error" role="alert">{error}</div>}
      {!info && !error && <span className="sk" />}

      {info && (
        <>
          <div className="pay-summary">
            <div><span>Invoice total</span><b>{n2(info.grand_total)}</b></div>
            <div><span>Collected</span><b>{n2(info.collected)}</b></div>
            <div className={done ? "is-done" : "is-balance"}><span>{done ? "Fully paid" : "Balance"}</span><b>{n2(info.balance)}</b></div>
          </div>

          {!done && (
            <>
              <div className="pay-form">
                <Field label="Date *"><input type="date" className="input" value={f.rv_date} onChange={(e) => set("rv_date", e.target.value)} /></Field>
                <Field label="Declared month *"><input type="month" className="input" value={f.declared_month} onChange={(e) => set("declared_month", e.target.value)} /></Field>
                <Field label="OR / reference no."><input className="input" value={f.document_no} onChange={(e) => set("document_no", e.target.value)} /></Field>
                <Field label="Amount received *"><input className="input ta-right" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", cleanNum(e.target.value))} /></Field>
                <div className="field span-2">
                  <span className="field-label">Deposit to (cash / bank) *</span>
                  <SearchSelect value={f.bank} onChange={(v) => set("bank", v)} options={accOpts} searchPlaceholder="Search account..." aria-label="Deposit to" />
                </div>
                <Field label="Attachment (OR, deposit slip, 2307…)">
                  <input key={fileKey} type="file" className="input" accept={FILE_ACCEPT} onChange={pickFile} />
                </Field>
              </div>

              <div className="pay-wht">
                <p className="pay-wht-title">Withheld by the customer (BIR 2307) – optional</p>
                <div className="field">
                  <span className="field-label">ATC (VT/PT)</span>
                  <SearchSelect value={f.atc_vt_id} onChange={(v) => set("atc_vt_id", v)} options={atcOpts("vt")} aria-label="ATC VT" />
                </div>
                <Field label="2307 (VT/PT)"><input className="input ta-right" inputMode="decimal" value={f.vt} onChange={(e) => set("vt", cleanNum(e.target.value))} placeholder="0.00" /></Field>
                <span />
                <div className="field">
                  <span className="field-label">ATC (IT)</span>
                  <SearchSelect value={f.atc_it_id} onChange={(v) => set("atc_it_id", v)} options={atcOpts("it")} aria-label="ATC IT" />
                </div>
                <Field label="2307 (IT)"><input className="input ta-right" inputMode="decimal" value={f.it} onChange={(e) => set("it", cleanNum(e.target.value))} placeholder="0.00" /></Field>
              </div>

              <p className={`pay-applied${over ? " is-over" : ""}`}>
                <span>Applied to this invoice (cash + 2307)</span><b>{n2(applied)}</b>
              </p>
            </>
          )}

          <section className="pay-history">
            <h4>Collections</h4>
            <table>
              <thead><tr><th>Receipt #</th><th>Date</th><th>OR / Ref</th><th className="n">Cash</th><th className="n">2307</th><th className="n">Applied</th><th>File</th><th /></tr></thead>
              <tbody>
                {info.receipts.length === 0 && <tr><td colSpan={8} className="empty">Nothing collected yet.</td></tr>}
                {info.receipts.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.rvoucher_no}</td>
                    <td>{fmtDay(r.date)}</td>
                    <td>{r.document_no || "—"}</td>
                    <td className="n">{n2(r.cash)}</td>
                    <td className="n">{r.withholding ? n2(r.withholding) : ""}</td>
                    <td className="n"><b>{n2(r.applied)}</b></td>
                    <td>{r.attachment ? <button className="btn btn-sm" onClick={() => viewFile(r)} title={r.attachment}>View</button> : <span className="muted">—</span>}</td>
                    <td className="n"><button className="btn btn-sm" onClick={() => setToVoid(r)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {toVoid && (
        <ConfirmDialog title={`Remove ${toVoid.rvoucher_no}?`} message={`${n2(toVoid.applied)} goes back to the invoice balance.`}
          confirmLabel="Remove" onCancel={() => setToVoid(null)} onConfirm={voidIt} />
      )}
    </Modal>
  );
}