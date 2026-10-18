import { useCallback, useEffect, useState } from "react";
import SearchSelect from "../../components/SearchSelect";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { downloadCSV } from "../../utils/format";

// 1,234.56 · (1,234.56) for negatives · blank for 0 (old fmtAmount)
const amt = (v) => {
    const n = Number(v) || 0;
    if (!n) return "";
    const s = Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? `(${s})` : s;
};

/* =========================================================
   Financial Reports → Balance Sheet
   ========================================================= */
export default function BalanceSheet() {
    const { user } = useAuth();
    const { to: pTo } = usePeriod();
    const thisYear = Number(pTo.slice(0, 4)) || new Date().getFullYear();

    const [yearFrom, setYearFrom] = useState(String(thisYear));
    const [yearTo, setYearTo] = useState(String(thisYear));
    const [branch, setBranch] = useState("current");

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const search = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const qs = new URLSearchParams({ year_from: yearFrom, year_to: yearTo, branch });
            setData(await apiFetch(`/reports/balance-sheet?${qs}`));
        } catch (e) {
            setError(e.message || "Couldn't load the balance sheet.");
        } finally {
            setLoading(false);
        }
    }, [yearFrom, yearTo, branch]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { search(); }, [user?.id, user?.caid]);

    const years = data?.years || [];
    const t = data?.totals || {};
    const s = data?.sections || { assets: [], liabilities: [], equity: [] };
    const label = years.length > 1 ? `${years[0]} - ${years[years.length - 1]}` : String(years[0] || yearFrom);

    const branchOpts = [
        { value: "current", label: "This branch" },
        ...(data?.branches?.length ? [{ value: "all", label: "All Branches" }] : []),
        ...(data?.branches || []).map((b) => ({ value: String(b.id), label: b.label })),
    ];

    // table body as a list of rows (used for screen and CSV)
    const lines = [];
    const section = (title, list) => {
        lines.push({ kind: "section", label: title });
        list.forEach((r) => lines.push({ kind: "row", code: r.code, label: r.name, amounts: r.amounts }));
    };
    const total = (title, amounts, grand = false) => lines.push({ kind: grand ? "grand" : "total", label: title, amounts: amounts || {} });

    if (data) {
        section("Current Assets", s.assets);
        total("Total Current Assets", t.current_assets);
        total("TOTAL ASSETS", t.current_assets);
        section("Current Liabilities", s.liabilities);
        total("Total Current Liabilities", t.current_liabilities);
        total("TOTAL LIABILITIES", t.current_liabilities);
        section("Retained Earnings", s.equity);
        total("Total Retained Earnings", t.retained_earnings);
        total("TOTAL EQUITY", t.retained_earnings);
        total("TOTAL LIABILITIES AND EQUITY", t.liabilities_equity, true);
    }

    const exportCSV = () => {
        const body = lines.map((l) =>
            l.kind === "section"
                ? [l.label, "", ...years.map(() => "")]
                : [l.code || "", l.label, ...years.map((y) => (Number(l.amounts?.[y]) || 0).toFixed(2))]
        );
        downloadCSV(`balance-sheet-${label}.csv`, ["Code", "Account", ...years.map(String)], body);
    };

    return (
        <section className="card jr-card">
            <header className="jr-head">
                <h2>{data?.company?.trade_name || " "}</h2>
                <div className="jr-title">Balance Sheet</div>
                <div>Year {label}</div>
            </header>

            <div className="jr-filters no-print">
                <label className="field bs-year">
                    <span className="field-label">From</span>
                    <input type="number" className="input" min="2000" max="2100" step="1" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} />
                </label>
                <label className="field bs-year">
                    <span className="field-label">To</span>
                    <input type="number" className="input" min="2000" max="2100" step="1" value={yearTo} onChange={(e) => setYearTo(e.target.value)} />
                </label>
                {branchOpts.length > 1 && (
                    <div className="field jr-branch">
                        <span className="field-label">Branch</span>
                        <SearchSelect value={branch} onChange={setBranch} options={branchOpts} aria-label="Branch" />
                    </div>
                )}
                <div className="jr-btns">
                    <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
                    <button className="btn" onClick={exportCSV} disabled={loading || !data}>Export CSV</button>
                    <button className="btn" onClick={() => window.print()} disabled={loading || !data}>Print</button>
                </div>
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}

            <div className="cf-scroll">
                <table className="table bs-table">
                    <thead>
                        <tr>
                            <th className="bs-code">Code</th>
                            <th>Account</th>
                            {years.map((y) => <th key={y} className="ta-right bs-amt">{y}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {loading &&
                            Array.from({ length: 14 }).map((_, i) => (
                                <tr key={i}>
                                    <td><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                    <td><span className="sk sk-cell" style={{ width: "70%" }} /></td>
                                    {(years.length ? years : [0]).map((y) => (
                                        <td key={y} className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                    ))}
                                </tr>
                            ))}

                        {!loading &&
                            lines.map((l, i) =>
                                l.kind === "section" ? (
                                    <tr key={i} className="bs-section">
                                        <td colSpan={2 + years.length}>{l.label}</td>
                                    </tr>
                                ) : (
                                    <tr key={i} className={l.kind === "row" ? "" : l.kind === "grand" ? "bs-grand" : "bs-total"}>
                                        {l.kind === "row" ? (
                                            <>
                                                <td className="mono bs-code">{l.code}</td>
                                                <td>{l.label}</td>
                                            </>
                                        ) : (
                                            <td colSpan={2}>{l.label}</td>
                                        )}
                                        {years.map((y) => <td key={y} className="ta-right mono">{amt(l.amounts?.[y])}</td>)}
                                    </tr>
                                )
                            )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}