import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "2026-01","2026-09" → "Jan - Sep 2026" · different years → "Dec 2025 - Feb 2026"
const rangeLabel = (from, to) => {
    if (!from || !to) return "";
    const [fy, fm] = from.split("-").map(Number);
    const [ty, tm] = to.split("-").map(Number);
    return fy === ty
        ? `${MONTHS[fm - 1]} - ${MONTHS[tm - 1]} ${ty}`
        : `${MONTHS[fm - 1]} ${fy} - ${MONTHS[tm - 1]} ${ty}`;
};

/* =========================================================
   Financial Reports → Consolidated Report (Detailed)
   ========================================================= */
export default function ConsolidatedReport() {
    const { user } = useAuth();
    const notify = useToast();
    const { from: pFrom, to: pTo } = usePeriod();

    const [from, setFrom] = useState(pFrom.slice(0, 7));
    const [to, setTo] = useState(pTo.slice(0, 7));
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [printing, setPrinting] = useState(false);

    const search = useCallback(async () => {
        if (!from || !to) {
            setError("Choose both months.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            setData(await apiFetch(`/reports/consolidated?${new URLSearchParams({ from, to })}`));
        } catch (e) {
            setError(e.message || "Couldn't load the consolidated report.");
        } finally {
            setLoading(false);
        }
    }, [from, to]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { search(); }, [user?.id, user?.caid]);

    const users = data?.users || [];
    const rows = data?.rows || [];
    const label = rangeLabel(data?.from || from, data?.to || to);

    // old Print: table rows → merge.php + ConsolidatedReport.xlsx → Consolidated_Report-{Username}.xlsx
    const print = async () => {
        setPrinting(true);
        try {
            const num = (v) => Math.round((Number(v) || 0) * 100) / 100;
            const rowsOut = [
                { k: "head", c: ["", ...users.map((u) => u.username), "Total"] },
                ...rows.map((r) => ({ k: "row", c: [r.label, ...users.map((u) => num(r.values[u.id])), num(r.total)] })),
                { k: "total", c: ["Total", ...users.map((u) => num(data.totals.values[u.id])), num(data.totals.total)] },
            ];
            const { token } = await apiFetch("/print/consolidated", {
                method: "POST",
                body: JSON.stringify({ from: data.from, to: data.to, range: label, rows: rowsOut }),
            });
            const blob = await apiBlob(`/print/consolidated/${token}`);
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement("a"), { href: url, download: `Consolidated_Report-${user?.username || user?.id || ""}.xlsx` });
            document.body.append(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            notify(e.message || "Couldn't print the consolidated report.", "error");
        } finally {
            setPrinting(false);
        }
    };

    return (
        <section className="card jr-card">
            <header className="jr-head">
                <div className="jr-title">Consolidated Report (Detailed)</div>
                <div>TIN : {data?.company?.tin || "—"}</div>
                <div>Date : {label}</div>
            </header>

            <div className="jr-filters no-print">
                <label className="field">
                    <span className="field-label">From</span>
                    <input type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="field">
                    <span className="field-label">To</span>
                    <input type="month" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
                <div className="jr-btns">
                    <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
                    <button className="btn" onClick={print} disabled={loading || printing || !users.length}>{printing ? "Printing…" : "Print"}</button>
                </div>
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}

            <div className="rp-scroll">
                <table className="table cr-table">
                    <thead>
                        <tr>
                            <th className="cr-label" />
                            {loading
                                ? Array.from({ length: 3 }).map((_, i) => <th key={i} className="ta-right"><span className="sk sk-cell" style={{ width: "70%" }} /></th>)
                                : users.map((u) => (
                                    <th key={u.id} className="ta-right" title={u.branch}>
                                        {u.username}
                                        {u.branch && <span className="cr-branch">{u.branch}</span>}
                                    </th>
                                ))}
                            <th className="ta-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading &&
                            ["Sales", "Purchases", "Expenses"].map((l) => (
                                <tr key={l}>
                                    <td className="cr-label">{l}</td>
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <td key={i} className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                    ))}
                                </tr>
                            ))}

                        {!loading && data && users.length === 0 && (
                            <tr><td colSpan={2} className="empty">No users found for this client.</td></tr>
                        )}

                        {!loading &&
                            users.length > 0 &&
                            rows.map((r) => (
                                <tr key={r.label}>
                                    <td className="cr-label">{r.label}</td>
                                    {users.map((u) => <td key={u.id} className="ta-right mono">{n2(r.values[u.id])}</td>)}
                                    <td className="ta-right mono strong">{n2(r.total)}</td>
                                </tr>
                            ))}
                    </tbody>
                    {!loading && users.length > 0 && (
                        <tfoot>
                            <tr>
                                <td className="cr-label strong">Total</td>
                                {users.map((u) => <td key={u.id} className="ta-right mono strong">{n2(data.totals.values[u.id])}</td>)}
                                <td className="ta-right mono strong">{n2(data.totals.total)}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </section>
    );
}