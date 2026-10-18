import { useCallback, useEffect, useState } from "react";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { downloadCSV } from "../../utils/format";
import { amt, YearField, BranchField, Actions, SkeletonRows } from "./finShared";

export default function RetainedEarnings() {
    const { user } = useAuth();
    const { to: pTo } = usePeriod();
    const start = pTo.slice(0, 4) || String(new Date().getFullYear());
    const [yearFrom, setYearFrom] = useState(start);
    const [yearTo, setYearTo] = useState(start);
    const [branch, setBranch] = useState("current");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const search = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setData(await apiFetch(`/reports/retained-earnings?${new URLSearchParams({ year_from: yearFrom, year_to: yearTo, branch })}`));
        } catch (e) {
            setError(e.message || "Couldn't load the statement of retained earnings.");
        } finally {
            setLoading(false);
        }
    }, [yearFrom, yearTo, branch]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { search(); }, [user?.id, user?.caid]);

    const years = data?.years || [];
    const lines = data?.lines || [];
    const label = years.length > 1 ? `${years[0]} - ${years[years.length - 1]}` : String(years[0] || yearFrom);

    const exportCSV = () =>
        downloadCSV(`retained-earnings-${label}.csv`, ["", ...years.map(String)],
            lines.map((l) => [l.label, ...years.map((y) => (l.values[y] || 0).toFixed(2))]));

    return (
        <section className="card jr-card">
            <header className="jr-head">
                <h2>{data?.company?.trade_name || " "}</h2>
                <div className="jr-title">Statement of Retained Earnings</div>
                <div>Year {label}</div>
            </header>

            <div className="jr-filters no-print">
                <YearField label="From" value={yearFrom} onChange={setYearFrom} />
                <YearField label="To" value={yearTo} onChange={setYearTo} />
                <BranchField data={data} value={branch} onChange={setBranch} />
                <Actions loading={loading} ready={lines.length > 0} onSearch={search} onExport={exportCSV} />
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}

            <div className="rp-scroll">
                <table className="table fs-table">
                    <thead>
                        <tr>
                            <th />
                            {years.map((y) => <th key={y} className="ta-right fs-amt">{y}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <SkeletonRows rows={5} cols={(years.length || 1) + 1} />}
                        {!loading &&
                            lines.map((l, i) => (
                                <tr key={i} className={`fs-${l.kind}`}>
                                    <td>{l.label}</td>
                                    {years.map((y) => <td key={y} className="ta-right mono">{amt(l.values[y])}</td>)}
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}