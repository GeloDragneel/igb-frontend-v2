import { useCallback, useEffect, useState } from "react";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { downloadCSV } from "../../utils/format";
import { amt, YearField, BranchField, Actions, SkeletonRows } from "./finShared";

export default function ChangesInEquity() {
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
            setData(await apiFetch(`/reports/changes-in-equity?${new URLSearchParams({ year, branch })}`));
        } catch (e) {
            setError(e.message || "Couldn't load the statement of changes in equity.");
        } finally {
            setLoading(false);
        }
    }, [year, branch]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { search(); }, [user?.id, user?.caid]);

    const cols = data?.columns || [];
    const lines = data?.lines || [];

    const exportCSV = () =>
        downloadCSV(`changes-in-equity-${data.year}.csv`, ["", ...cols.map((c) => c.label), "Total"],
            lines.map((l) => [l.label, ...cols.map((c) => (l.values[c.key] || 0).toFixed(2)), l.total.toFixed(2)]));

    return (
        <section className="card jr-card">
            <header className="jr-head">
                <h2>{data?.company?.trade_name || " "}</h2>
                <div className="jr-title">Statement of Changes in Equity</div>
                <div>For the year ended December 31, {data?.year || year}</div>
            </header>

            <div className="jr-filters no-print">
                <YearField value={year} onChange={setYear} />
                <BranchField data={data} value={branch} onChange={setBranch} />
                <Actions loading={loading} ready={lines.length > 0} onSearch={search} onExport={exportCSV} />
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}

            <div className="rp-scroll">
                <table className="table fs-table">
                    <thead>
                        <tr>
                            <th />
                            {cols.map((c) => <th key={c.key} className="ta-right fs-amt">{c.label}</th>)}
                            <th className="ta-right fs-amt">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <SkeletonRows rows={5} cols={(cols.length || 1) + 2} />}
                        {!loading &&
                            lines.map((l, i) => (
                                <tr key={i} className={`fs-${l.kind}`}>
                                    <td>{l.label}</td>
                                    {cols.map((c) => <td key={c.key} className="ta-right mono">{amt(l.values[c.key])}</td>)}
                                    <td className="ta-right mono strong">{amt(l.total)}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}