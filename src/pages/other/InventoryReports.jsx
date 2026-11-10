// Other Reports → Inventory
// Tabs: Item Costing Report · Inventory Profitability Report · Cost of Goods Sold Journal · Inventory Adjustment Journal
// Data: GET /reports/inventory/{report}?from=&to=   ·   Excel: GET /reports/inventory/{report}/excel?from=&to=
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import SearchCard from "../../components/SearchCard";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { INVENTORY_REPORT_TABS } from "../../components/routesMeta";

// path → report key on the server
const REPORT_OF = {
    "/other/inventory": "costing",
    "/other/inventory/profitability": "profitability",
    "/other/inventory/cogs-journal": "cogs",
    "/other/inventory/adjustment-journal": "adjustment",
};
const FILE_OF = {
    costing: "Item_Costing_Report.xlsx",
    profitability: "Inventory_Profitability_Report.xlsx",
    cogs: "COST_OF_GOOD_SOLD_JOURNAL.xlsx",
    adjustment: "Inventory_Adjustment_Journal.xlsx",
};
const TABLE_HEIGHT = "calc(100vh - 375px)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso) => {
    if (!iso) return "";
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InventoryReports() {
    const { user } = useAuth();
    const { from, to } = usePeriod();
    const notify = useToast();
    const { pathname } = useLocation();
    const report = REPORT_OF[pathname.replace(/\/+$/, "")] || "costing";

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [sheet, setSheet] = useState(0);              // Item Costing: Cost / Sales / Margin
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setData(await apiFetch(`/reports/inventory/${report}?${new URLSearchParams({ from, to })}`));
        } catch (e) {
            setError(e.message || "Couldn't load the report.");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [report, from, to]);

    useEffect(() => { setSheet(0); }, [report]);
    useEffect(() => { load(); }, [load, user?.id, user?.caid]);

    const exportExcel = async () => {
        setBusy(true);
        try {
            const blob = await apiBlob(`/reports/inventory/${report}/excel?${new URLSearchParams({ from, to })}`);
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement("a"), { href: url, download: FILE_OF[report] });
            document.body.append(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            notify(`Downloaded ${FILE_OF[report]}`);
        } catch (e) {
            notify(e.message || "Couldn't make the Excel file.", "error");
        } finally {
            setBusy(false);
        }
    };

    const sheets = data?.sheets || [];
    const cur = sheets[Math.min(sheet, Math.max(0, sheets.length - 1))];

    // search: keeps item / group rows whose text matches (totals always stay)
    const rows = useMemo(() => {
        const all = cur?.rows || [];
        const q = query.trim().toLowerCase();
        if (!q) return all;
        return all.filter((r) => r.kind === "total" || Object.values(r.cells || {}).join(" ").toLowerCase().includes(q));
    }, [cur, query]);

    const actions = [
        { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
        { label: busy ? "Preparing…" : "Export Excel", icon: "download", variant: "primary", onClick: exportExcel, disabled: busy || loading },
    ];

    return (
        <>
            <SearchCard
                query={query}
                setQuery={setQuery}
                placeholder="Search item, reference or account..."
                navTabs={INVENTORY_REPORT_TABS}
                actions={actions}
                sticky
            />

            {error && (
                <div className="alert-error" role="alert">
                    {error} <button className="btn btn-sm" onClick={load}>Try again</button>
                </div>
            )}

            {sheets.length > 1 && (
                <div className="gj-tabs" role="tablist" aria-label="Report" style={{ display: "flex", gap: 6, margin: "0 0 10px" }}>
                    {sheets.map((s, i) => (
                        <button key={s.name} type="button" role="tab" aria-selected={sheet === i}
                            className={`btn btn-sm${sheet === i ? " btn-primary" : ""}`} onClick={() => setSheet(i)}>
                            {s.name}
                        </button>
                    ))}
                </div>
            )}

            <section className="card table-card">
                <div className="table-scroll scroll-body" style={{ maxHeight: TABLE_HEIGHT }}>
                    <table className="table">
                        <thead>
                            <tr>
                                {(cur?.columns || []).map(([key, label, type]) => (
                                    <th key={key} className={type === "num" ? "ta-right" : ""} style={{ whiteSpace: "nowrap" }}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading && Array.from({ length: 8 }).map((_, i) => (
                                <tr key={`sk${i}`}>
                                    {(cur?.columns || Array.from({ length: 8 }, (_, k) => [k])).map(([key]) => (
                                        <td key={key}><span className="sk sk-cell" style={{ width: "70%" }} /></td>
                                    ))}
                                </tr>
                            ))}
                            {!loading && !rows.length && (
                                <tr><td colSpan={cur?.columns?.length || 8} className="empty">No records for this period.</td></tr>
                            )}
                            {!loading && rows.map((r, i) => (
                                <tr key={i} style={r.kind === "group" ? { background: "var(--surface-2, #f1f5f9)", fontWeight: 700 } : r.kind === "total" ? { fontWeight: 700, borderTop: "2px solid var(--border, #cbd5e1)" } : undefined}>
                                    {cur.columns.map(([key, , type]) => {
                                        const v = r.cells?.[key];
                                        const has = v !== undefined && v !== null && v !== "";
                                        return (
                                            <td key={key} className={type === "num" ? "ta-right mono" : ""} style={{ whiteSpace: "nowrap" }}>
                                                {!has ? "" : type === "num" ? n2(v) : type === "date" ? fmtDay(v) : v}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="table-foot">
                    <span className="muted small">
                        {data?.title || ""}{cur && sheets.length > 1 ? ` · ${cur.name}` : ""} · {fmtDay(data?.from || from)} – {fmtDay(data?.to || to)}
                    </span>
                    <span className="muted small">{rows.filter((r) => r.kind === "line").length} line(s)</span>
                </div>
            </section>
        </>
    );
}