import { useState } from "react";
import Modal from "../Modal";
import Badge from "../Badge";

// same labels as the Invalid tabs
const SCAN_STATUS = {
    2: { label: "Invalid", tone: "red", color: "#dc2626" },
    3: { label: "Partially Invalid", tone: "blue", color: "#2563eb" },
    5: { label: "Cancel", tone: "gray", color: "#6b7280" },
};

const label = { fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", opacity: 0.6, marginBottom: 4 };

/** Reason popup for Invalid / Partially Invalid / Cancel rows (Sales, Purchases, Expenses) */
export default function InvalidReasonModal({ row, partyLabel = "Customer", onClose }) {
    const [copied, setCopied] = useState(false);
    const s = SCAN_STATUS[row.scan_status];
    const color = s?.color || "#dc2626";
    const reason = (row.reason || "").trim();

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(reason);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked */ }
    };

    return (
        <Modal
            title="Invalid Reason"
            onClose={onClose}
            size="sm"
            footer={
                <>
                    {reason && <button className="btn" onClick={copy}>{copied ? "Copied" : "Copy"}</button>}
                    <button className="btn btn-primary" onClick={onClose}>Close</button>
                </>
            }
        >
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "14px 16px", alignItems: "start" }}>
                <div style={{ minWidth: 0 }}>
                    <div style={label}>Invoice No</div>
                    <div className="mono" style={{ fontWeight: 600, wordBreak: "break-all" }}>{row.invoice_no}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div style={label}>Status</div>
                    {s ? <Badge tone={s.tone}>{s.label}</Badge> : "—"}
                </div>
                <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
                    <div style={label}>{partyLabel}</div>
                    <div style={{ fontWeight: 600, lineHeight: 1.35 }}>{row.customer_name || "—"}</div>
                </div>
            </div>

            <div style={{ ...label, marginTop: 20, marginBottom: 8 }}>Reason</div>
            <div
                style={{
                    borderLeft: `4px solid ${color}`,
                    background: `${color}14`,
                    borderRadius: 8,
                    padding: "14px 16px",
                    minHeight: 72,
                    fontSize: 15,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                }}
            >
                {reason || <span style={{ opacity: 0.55, fontStyle: "italic" }}>No reason was saved for this invoice.</span>}
            </div>
        </Modal>
    );
}