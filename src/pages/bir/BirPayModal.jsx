// BIR Return → PAY = a General Journal entry (no Expenses, no Pay Bill):
//   Dr <tax payable of the return>   Cr <cash / bank>
// attachment saved on S3 under BIR_Return/<form>/
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { apiFetch, apiForm, apiBlob } from "../../context/AuthContext";
import { n2, cleanNum, today, fmtDay, cashAccountOptions, toForm, FILE_ACCEPT, MAX_FILE_MB } from "../../components/payments/paymentUtils";
import "../../components/payments/payments.css";

/** filename = the filed return's save file */
export default function BirPayModal({ filename, onClose, onDone }) {
    const notify = useToast();
    const [info, setInfo] = useState(null);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [toVoid, setToVoid] = useState(null);
    const [file, setFile] = useState(null);
    const [fileKey, setFileKey] = useState(0);
    const [f, setF] = useState({ date: today(), bank: "", amount: "", ref: "", remarks: "" });
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
    const base = `/bir/filing/${encodeURIComponent(filename)}/payments`;

    const load = useCallback(() => {
        apiFetch(base)
            .then((d) => { setInfo(d); setF((x) => ({ ...x, amount: x.amount === "" ? String(Math.max(0, d.balance)) : x.amount })); })
            .catch((e) => setError(e.message || "Couldn't load the return."));
    }, [base]);
    useEffect(() => { load(); }, [load]);

    const accounts = info?.accounts || [];
    const accName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.account_code, a.account_name])), [accounts]);
    const label = (code) => (code ? `${code} - ${accName[code] || ""}` : "—");
    const accOpts = cashAccountOptions(accounts).filter((o) => o.value !== info?.payable);
    const amount = Number(f.amount) || 0;
    const over = info && amount > info.balance + 0.01;
    const done = info && info.balance <= 0.009;

    const save = async () => {
        setError("");
        if (!f.bank) return setError("Pick the cash / bank account the money comes from.");
        if (!(amount > 0)) return setError("Enter the amount paid.");
        if (over) return setError(`More than the balance (${n2(info.balance)}).`);
        setSaving(true);
        try {
            const res = await apiForm(base, toForm({
                pv_date: f.date, bank: f.bank, amount, ref_data: f.ref, particulars: f.remarks,
            }, file));
            notify(res.message);
            onDone?.();
            if (res.balance <= 0.009) onClose();
            else { setF((x) => ({ ...x, amount: String(res.balance), ref: "" })); setFile(null); setFileKey((k) => k + 1); load(); }
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
            const res = await apiFetch(`/bir/payments/${p.id}`, { method: "DELETE" });
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
            const blob = await apiBlob(`/bir/payments/${p.id}/attachment`);
            window.open(URL.createObjectURL(blob), "_blank", "noopener");
        } catch (e) {
            notify(e.message || "Couldn't open the file.", "error");
        }
    };

    return (
        <Modal
            title={`Pay · ${info?.document_no || filename}`}
            onClose={() => !saving && onClose()}
            size="lg"
            footer={
                <>
                    <button className="btn" onClick={onClose} disabled={saving}>Close</button>
                    {!done && <button className="btn btn-primary" onClick={save} disabled={saving || !info}>{saving ? "Posting…" : `Post payment ${n2(amount)}`}</button>}
                </>
            }
        >
            {error && <div className="alert-error" role="alert">{error}</div>}
            {!info && !error && <span className="sk" />}

            {info && (
                <>
                    <div className="pay-summary">
                        <div><span>Tax to pay</span><b>{n2(info.grand_total)}</b></div>
                        <div><span>Paid</span><b>{n2(info.paid)}</b></div>
                        <div className={done ? "is-done" : "is-balance"}><span>{done ? "Fully paid" : "Balance"}</span><b>{n2(info.balance)}</b></div>
                    </div>
                    <p className="muted small" style={{ margin: "6px 0 12px" }}>
                        Filed in the General Journal as <b className="mono">{info.jv_no}</b>. Each payment is posted as its own General Journal entry.
                    </p>

                    {!done && (
                        <>
                            <div className="pay-form">
                                <Field label="Payment date *"><input type="date" className="input" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
                                <Field label="Amount paid *"><input className="input ta-right" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", cleanNum(e.target.value))} /></Field>
                                <div className="field span-2">
                                    <span className="field-label">Paid from (cash / bank) *</span>
                                    <SearchSelect value={f.bank} onChange={(v) => set("bank", v)} options={accOpts} searchPlaceholder="Search account..." aria-label="Paid from" />
                                </div>
                                <Field label="Reference no. (eFPS / bank / OR)"><input className="input" value={f.ref} onChange={(e) => set("ref", e.target.value)} /></Field>
                                <Field label="Remarks"><input className="input" value={f.remarks} onChange={(e) => set("remarks", e.target.value)} placeholder={`${info.document_no} · payment`} /></Field>
                                <div className="field span-2">
                                    <span className="field-label">Attachment (proof of payment) · saved to {info.form_folder}/</span>
                                    <input key={fileKey} type="file" className="input" accept={FILE_ACCEPT} onChange={pickFile} />
                                </div>
                            </div>

                            {/* the General Journal entry that will be posted */}
                            <section className="pay-history">
                                <h4>Journal entry</h4>
                                <table>
                                    <thead><tr><th>Account</th><th className="n">Debit</th><th className="n">Credit</th></tr></thead>
                                    <tbody>
                                        <tr><td>{label(info.payable)}</td><td className="n">{n2(amount)}</td><td className="n" /></tr>
                                        <tr><td>{f.bank ? label(f.bank) : <span className="muted">Pick the cash / bank account</span>}</td><td className="n" /><td className="n">{n2(amount)}</td></tr>
                                    </tbody>
                                </table>
                            </section>
                        </>
                    )}

                    <section className="pay-history">
                        <h4>Payments posted</h4>
                        <table>
                            <thead><tr><th>Journal ref</th><th>Date</th><th>Paid from</th><th>Ref</th><th className="n">Amount</th><th>File</th><th /></tr></thead>
                            <tbody>
                                {info.payments.length === 0 && <tr><td colSpan={7} className="empty">Nothing paid yet.</td></tr>}
                                {info.payments.map((p) => (
                                    <tr key={p.id}>
                                        <td className="mono">{p.pvoucher_no}</td>
                                        <td>{fmtDay(p.date)}</td>
                                        <td>{label(p.bank)}</td>
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
                <ConfirmDialog title={`Remove ${toVoid.pvoucher_no}?`} message={`Its General Journal entry is deleted and ${n2(toVoid.amount)} goes back to the balance.`}
                    confirmLabel="Remove" onCancel={() => setToVoid(null)} onConfirm={voidIt} />
            )}
        </Modal>
    );
}