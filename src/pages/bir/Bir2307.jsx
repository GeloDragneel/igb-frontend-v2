import { useCallback, useEffect, useState } from "react";
import SearchSelect from "../../components/SearchSelect";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { downloadCSV } from "../../utils/format";

const TYPES = [
    { value: "S_VT", label: "Sales · VT/PT" },
    { value: "S_IT", label: "Sales · IT" },
    { value: "PE_IT", label: "Purchases & Expenses · IT" },
];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monLabel = (ym) => { const [y, m] = ym.split("-"); return `${MON[+m - 1]} ${y}`; };
const fmtTin = (t) => {
    const d = String(t || "").replace(/\D/g, "");
    return d.length >= 12 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{3}).*/, "$1-$2-$3-$4") : d.length === 9 ? d.replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3") : t;
};

/* =========================================================
   BIR & Tax → BIR 2307 summary
   ========================================================= */
export default function Bir2307() {
    const { user } = useAuth();
    const { from: pFrom, to: pTo } = usePeriod();

    const [type, setType] = useState("S_VT");
    const [from, setFrom] = useState(pFrom.slice(0, 7));
    const [to, setTo] = useState(pTo.slice(0, 7));
    const [branch, setBranch] = useState("all");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const search = useCallback(async (t = type) => {
        if (!from || !to) return setError("Choose both months.");
        setLoading(true);
        setError("");
        try {
            setData(await apiFetch(`/reports/bir2307?${new URLSearchParams({ type: t, from, to, branch })}`));
        } catch (e) {
            setError(e.message || "Couldn't load the 2307 summary.");
        } finally {
            setLoading(false);
        }
    }, [type, from, to, branch]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { search(); }, [user?.id, user?.caid]);

    const pickType = (t) => { setType(t); search(t); };   // old page searched on change too

    const months = data?.months || [];
    const rows = data?.rows || [];
    const first = months[0], last = months[months.length - 1];
    const rangeText = first ? `${MON[+first.split("-")[1] - 1]} to ${MONTH_FULL[+last.split("-")[1] - 1]} ${last.split("-")[0]}` : "";

    const branchOpts = [
        { value: "all", label: "All branches" },
        ...(data?.branches || []).map((b) => ({ value: String(b.id), label: b.label })),
    ];

    const exportCSV = () => {
        const head = ["ATC & Rate", ...months.flatMap((m) => [`${monLabel(m)} Tax Base`, `${monLabel(m)} BIR2307`]), "Total Tax Base", "Total BIR2307"];
        const body = rows.map((r) => [
            r.rate === null ? r.atc : `${r.atc} - ${r.rate.toFixed(2)}%`,
            ...months.flatMap((m) => [r.values[m].base.toFixed(2), r.values[m].tax.toFixed(2)]),
            r.total.base.toFixed(2), r.total.tax.toFixed(2),
        ]);
        body.push(["Total", ...months.flatMap((m) => [data.totals.months[m].base.toFixed(2), data.totals.months[m].tax.toFixed(2)]), data.totals.base.toFixed(2), data.totals.tax.toFixed(2)]);
        downloadCSV(`BIR2307-${type}-${first}-to-${last}.csv`, head, body);          
    };

    return (
        <section className="card jr-card">
            <header className="jr-head">
                <div className="jr-title">{data?.title || TYPES.find((t) => t.value === type)?.label}</div>
                {data?.company?.address && <div>{data.company.address}</div>}
                {rangeText && <div>From : {rangeText}</div>}
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

                <div className="field">
                    <span className="field-label">Type</span>
                    <div className="b7-types" role="tablist" aria-label="Report type">
                        {TYPES.map((t) => (
                            <button
                                key={t.value}
                                type="button"
                                role="tab"
                                aria-selected={type === t.value}
                                className={`b7-type ${type === t.value ? "is-active" : ""}`}
                                onClick={() => pickType(t.value)}
                                disabled={loading}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {data?.branches?.length > 1 && (
                    <div className="field jr-branch">
                        <span className="field-label">Branch</span>
                        <SearchSelect value={branch} onChange={setBranch} options={branchOpts} aria-label="Branch" />
                    </div>
                )}

                <div className="jr-btns">
                    <button className="btn btn-primary" onClick={() => search()} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
                    <button className="btn" onClick={exportCSV} disabled={loading || !rows.length}>Export CSV</button>
                    <button className="btn" onClick={() => window.print()} disabled={loading || !rows.length}>Print</button>
                </div>
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={() => search()}>Try again</button></div>}

            <div className="rp-scroll">
                <table className="table b7-table">
                    <thead>
                        <tr>
                            <th rowSpan={2} className="b7-atc">ATC &amp; Rate</th>
                            {months.map((m) => <th key={m} colSpan={2} className="ta-center">{monLabel(m)}</th>)}
                            <th colSpan={2} className="ta-center">Total</th>
                        </tr>
                        <tr>
                            {[...months, "total"].flatMap((m) => [
                                <th key={`${m}b`} className="ta-right">Tax Base</th>,
                                <th key={`${m}t`} className="ta-right">BIR2307</th>,
                            ])}
                        </tr>
                    </thead>
                    <tbody>
                        {loading &&
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i}>
                                    <td className="b7-atc"><span className="sk sk-cell" style={{ width: "70%" }} /></td>
                                    {Array.from({ length: (months.length || 3) * 2 + 2 }).map((__, c) => (
                                        <td key={c} className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                    ))}
                                </tr>
                            ))}

                        {!loading && data && rows.length === 0 && (
                            <tr><td colSpan={months.length * 2 + 3} className="empty">No 2307 entries for this period.</td></tr>
                        )}

                        {!loading &&
                            rows.map((r) => (
                                <tr key={r.atc} className={r.rate === null ? "b7-noatc" : ""}>
                                    <td className="b7-atc">{r.rate === null ? r.atc : `${r.atc} - ${r.rate.toFixed(2)}%`}</td>
                                    {months.flatMap((m) => [
                                        <td key={`${m}b`} className="ta-right mono">{n2(r.values[m].base)}</td>,
                                        <td key={`${m}t`} className="ta-right mono">{n2(r.values[m].tax)}</td>,
                                    ])}
                                    <td className="ta-right mono strong">{n2(r.total.base)}</td>
                                    <td className="ta-right mono strong">{n2(r.total.tax)}</td>
                                </tr>
                            ))}
                    </tbody>
                    {!loading && rows.length > 0 && (
                        <tfoot>
                            <tr>
                                <td className="b7-atc strong">Total</td>
                                {months.flatMap((m) => [
                                    <td key={`${m}b`} className="ta-right mono strong">{n2(data.totals.months[m].base)}</td>,
                                    <td key={`${m}t`} className="ta-right mono strong">{n2(data.totals.months[m].tax)}</td>,
                                ])}
                                <td className="ta-right mono strong">{n2(data.totals.base)}</td>
                                <td className="ta-right mono strong">{n2(data.totals.tax)}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </section>
    );
}