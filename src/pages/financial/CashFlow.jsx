import { useCallback, useEffect, useState } from "react";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { downloadCSV } from "../../utils/format";
import { amt, YearField, BranchField, Actions, SkeletonRows } from "./finShared";

export default function CashFlow() {
    const { user } = useAuth();
    const { to: pTo } = usePeriod();
    const [year, setYear] = useState(pTo.slice(0, 4) || String(new Date().getFullYear()));
    const [branch, setBranch] = useState("current");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const search = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setData(await apiFetch(`/reports/cash-flow?${new URLSearchParams({ year, branch })}`));
        } catch (e) {
            setError(e.message || "Couldn't load the cash flow statement.");
        } finally {
            setLoading(false);
        }
    }, [year, branch]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { search(); }, [user?.id, user?.caid]);

    const lines = data?.lines || [];
    const exportCSV = () =>
        downloadCSV(`cash-flow-${data.year}.csv`, ["", String(data.year)],
            lines.filter((l) => l.kind !== "blank").map((l) => [l.label, l.amount === null ? "" : l.amount.toFixed(2)]));

    return (
        <section className="card jr-card">
            <header className="jr-head">
                <h2>{data?.company?.trade_name || " "}</h2>
                <div className="jr-title">Statement of Cash Flows</div>
                <div>For the year ended December 31, {data?.year || year}</div>
            </header>

            <div className="jr-filters no-print">
                <YearField value={year} onChange={setYear} />
                <BranchField data={data} value={branch} onChange={setBranch} />
                <Actions loading={loading} ready={lines.length > 0} onSearch={search} onExport={exportCSV} />
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}

            <div className="cf-scroll">
                <table className="table fs-table fs-narrow">
                    <thead>
                        <tr><th /><th className="ta-right fs-amt">{data?.year || year}</th></tr>
                    </thead>
                    <tbody>
                        {loading && <SkeletonRows rows={14} cols={2} />}
                        {!loading && data && lines.length === 0 && <tr><td colSpan={2} className="empty">No entries for {data.year}.</td></tr>}
                        {!loading &&
                            lines.map((l, i) =>
                                l.kind === "blank" ? (
                                    <tr key={i} className="fs-blank"><td colSpan={2} /></tr>
                                ) : (
                                    <tr key={i} className={`fs-${l.kind}`}>
                                        <td title={l.code || undefined}>{l.label}</td>
                                        <td className="ta-right mono">{l.amount === null ? "" : amt(l.amount)}</td>
                                    </tr>
                                )
                            )}
                    </tbody>
                </table>
            </div>

            {!loading && data?.cash_accounts?.length > 0 && (
                <p className="fs-note no-print">Cash accounts used: {data.cash_accounts.join(", ")}</p>
            )}
        </section>
    );
}