// Document No. already used → show the invoices that have it + supervisor override (Cancel / Override)
import { useState } from "react";
import Modal, { Field } from "../Modal";
import { apiFetch } from "../../context/AuthContext";

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso) => {
    if (!iso) return "—";
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return `${MON[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};

/**
 * module   "sales" | "purchases" | "expenses"
 * docNo    the document no. being saved
 * matches  [{ invoice_no, document_no, transaction_date, party, grand_total, status }]
 * onApproved(token) · onCancel()
 */
export default function DuplicateDocModal({ module, docNo, matches, partyLabel = "Customer", onApproved, onCancel }) {
    const [f, setF] = useState({ username: "", password: "" });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const override = async () => {
        if (!f.username.trim()) return setError("Username is required");
        if (!f.password) return setError("Password is required");
        setError("");
        setBusy(true);
        try {
            const r = await apiFetch(`/${module}/document-override`, {
                method: "POST",
                body: JSON.stringify({ document_no: docNo, username: f.username.trim(), password: f.password }),
            });
            onApproved(r.token);
        } catch (e) {
            setError(e.message || "Override failed.");
            setBusy(false);
        }
    };

    return (
        <Modal
            title="Document No. already used"
            onClose={() => !busy && onCancel()}
            size="lg"
            footer={
                <>
                    <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
                    <button className="btn btn-primary" onClick={override} disabled={busy}>{busy ? "Checking…" : "Override"}</button>
                </>
            }
        >
            <p style={{ marginTop: 0 }}>
                Document No. <b className="mono">{docNo}</b> is already on {matches.length} record{matches.length === 1 ? "" : "s"}.
                A supervisor has to approve to save it anyway.
            </p>

            <div className="table-scroll" style={{ maxHeight: 260, marginBottom: 14 }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Document No.</th><th>Invoice No.</th><th>Date</th><th>{partyLabel}</th><th className="ta-right">Total</th><th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matches.map((m) => (
                            <tr key={m.id}>
                                <td className="mono"><b>{m.document_no}</b></td>
                                <td className="mono">{m.invoice_no}</td>
                                <td>{day(m.transaction_date)}</td>
                                <td>{m.party || "—"}</td>
                                <td className="ta-right mono">{n2(m.grand_total)}</td>
                                <td>{m.status || "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <Field label="Supervisor username">
                    <input className="input" autoComplete="off" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
                </Field>
                <Field label="Password">
                    <input type="password" className="input" autoComplete="new-password" value={f.password}
                        onChange={(e) => setF({ ...f, password: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && override()} />
                </Field>
            </div>
        </Modal>
    );
}