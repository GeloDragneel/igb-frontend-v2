// Popup after login (like BirthdayPopup): my open work, aged 1-30 · 31-60 · 61-90 · 90+ days
//   Data analyst → pending scans + reverted (assigned clients)
//   Auditor      → pending scans + for audit + reverted (assigned clients)
//   Audit Supervisor / IT / CEO → all clients
// once per login (sessionStorage, cleared on Sign out) · Confirm = hidden for the rest of today
import { useEffect, useState } from "react";
import Modal from "./Modal";
import { useToast } from "./Toast";
import { useAuth, apiFetch } from "../context/AuthContext";
import "./WorkReminder.css";

const AGES = [["d30", "1–30 days"], ["d60", "31–60 days"], ["d90", "61–90 days"], ["d90p", "90+ days"]];
const SETS = [["scans", "Pending scans"], ["for_audit", "For audit"], ["reverted", "Reverted"]];
const fmt = (n) => Number(n || 0).toLocaleString();

export default function WorkReminder() {
    const { user } = useAuth();
    const notify = useToast();
    const [data, setData] = useState(null);
    const [tab, setTab] = useState("scans");
    const [busy, setBusy] = useState(false);

    const key = user ? `work-popup:${user.login_id ?? user.id}` : null;

    useEffect(() => {
        if (user?.type !== "Staff" || !key) return;
        try { if (sessionStorage.getItem(key)) return; } catch { /* ignore */ }
        let alive = true;
        apiFetch("/work-reminder")
            .then((d) => {
                try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
                if (!alive || !d?.show) return;
                setData(d);
                setTab(SETS.find(([k]) => d[k]?.totals?.total)?.[0] || "scans");
            })
            .catch(() => { /* no popup */ });
        return () => { alive = false; };
    }, [key, user?.type]);

    if (!data) return null;

    const confirm = async () => {
        setBusy(true);
        try {
            await apiFetch("/work-reminder/confirm", { method: "POST" });
            setData(null);
        } catch (e) {
            notify(e.message || "Couldn't confirm.", "error");
        } finally {
            setBusy(false);
        }
    };

    const sets = SETS.filter(([k]) => data[k]);
    const cur = data[tab] || { totals: {}, clients: [] };
    const scope = data.role === "all" ? "All clients" : `${data.clients ?? 0} assigned client${data.clients === 1 ? "" : "s"}`;

    return (
        <Modal title={`Your pending work · ${scope}`} onClose={() => setData(null)} size="xlg"
            footer={<>
                <button className="btn" onClick={() => setData(null)} disabled={busy}>Close</button>
                <button className="btn btn-primary" onClick={confirm} disabled={busy}>{busy ? "Confirming…" : "Confirm"}</button>
            </>}>
            <div className="wr-tabs" role="tablist">
                {sets.map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
                        {l} <span className="wr-n">{fmt(data[k].totals.total)}</span>
                    </button>
                ))}
            </div>

            <div className="wr-ages">
                {AGES.map(([k, l], i) => (
                    <div key={k} className={`wr-age is-${i}`}>
                        <span>{l}</span>
                        <b>{fmt(cur.totals[k])}</b>
                    </div>
                ))}
            </div>

            <div className="wr-scroll">
                <table className="table wr-table">
                    <thead>
                        <tr><th>Client account</th>{AGES.map(([k, l]) => <th key={k} className="num">{l}</th>)}<th className="num">Total</th></tr>
                    </thead>
                    <tbody>
                        {!cur.clients.length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>Nothing here.</td></tr>}
                        {cur.clients.map((c) => (
                            <tr key={c.caid}>
                                <td><b>{c.trade_name || "—"}</b>{c.branch_code ? <small className="muted"> · {c.branch_code}</small> : null}</td>
                                {AGES.map(([k], i) => <td key={k} className={`num${c[k] ? ` wr-hot is-${i}` : " muted"}`}>{c[k] ? fmt(c[k]) : "–"}</td>)}
                                <td className="num"><b>{fmt(c.total)}</b></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>Confirm hides this until tomorrow. Close shows it again on your next login.</p>
        </Modal>
    );
}