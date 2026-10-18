import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SearchSelect from "../../components/SearchSelect";
import Modal from "../../components/Modal";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { downloadCSV } from "../../utils/format";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => `${((Number(v) || 0) * 100).toFixed(2)}%`;
const monthLabel = (m, multiYear) => {
    const [y, mm] = m.split("-");
    return multiYear ? `${MON[Number(mm) - 1]} ${y.slice(2)}` : MON[Number(mm) - 1];
};

/* =========================================================
   Financial Reports → Annual Summary
   ========================================================= */
export default function AnnualSummary() {
    const { user } = useAuth();
    const { to: pTo } = usePeriod();
    const navigate = useNavigate();
    const location = useLocation();

    const thisYear = new Date().getFullYear();
    const years = Array.from({ length: 10 }, (_, i) => String(thisYear - i));
    const startYear = pTo.slice(0, 4) || String(thisYear);

    const [yearFrom, setYearFrom] = useState(startYear);
    const [yearTo, setYearTo] = useState(startYear);
    const [branch, setBranch] = useState("current");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [cell, setCell] = useState(null);   // { title, type, month, account }

    const search = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setData(await apiFetch(`/reports/annual-summary?${new URLSearchParams({ year_from: yearFrom, year_to: yearTo, branch })}`));
        } catch (e) {
            setError(e.message || "Couldn't load the annual summary.");
        } finally {
            setLoading(false);
        }
    }, [yearFrom, yearTo, branch]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { search(); }, [user?.id, user?.caid]);

    const months = data?.months || [];
    const lines = data?.lines || [];
    const multiYear = months.length > 12;
    const first = months[0], last = months[months.length - 1];
    const range = first ? `${monthLabel(first, true)} - ${monthLabel(last, true)}`.replace(/ (\d\d)/g, " 20$1") : "";

    const branchOpts = [
        { value: "current", label: "This branch" },
        ...(data?.branches?.length ? [{ value: "all", label: "All Branches" }] : []),
        ...(data?.branches || []).map((b) => ({ value: String(b.id), label: b.label })),
    ];

    const exportCSV = () => {
        const body = lines.map((l) => {
            if (!l.values) return [l.label];
            const f = l.kind === "rate" ? (v) => (v * 100).toFixed(2) + "%" : (v) => Number(v).toFixed(2);
            return [l.label, ...months.map((m) => f(l.values[m] || 0)), f(l.total || 0)];
        });
        downloadCSV(`annual-summary-${first}-to-${last}.csv`, ["", ...months.map((m) => monthLabel(m, true)), "Total"], body);
    };

    return (
        <section className="card jr-card">
            <header className="jr-head">
                <h2>{data?.company?.trade_name || " "}</h2>
                <div>TIN : {data?.company?.tin || "—"}</div>
                <div>Date : {range}</div>
            </header>

            <div className="jr-filters no-print">
                <div className="field bs-year">
                    <span className="field-label">From</span>
                    <SearchSelect value={yearFrom} onChange={setYearFrom} options={years.map((y) => ({ value: y, label: y }))} aria-label="From year" />
                </div>
                <div className="field bs-year">
                    <span className="field-label">To</span>
                    <SearchSelect value={yearTo} onChange={setYearTo} options={years.map((y) => ({ value: y, label: y }))} aria-label="To year" />
                </div>
                {branchOpts.length > 1 && (
                    <div className="field jr-branch">
                        <span className="field-label">Branch</span>
                        <SearchSelect value={branch} onChange={setBranch} options={branchOpts} aria-label="Branch" />
                    </div>
                )}
                <div className="jr-btns">
                    <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
                    <button className="btn" onClick={exportCSV} disabled={loading || !lines.length}>Export CSV</button>
                    <button className="btn" onClick={() => window.print()} disabled={loading || !lines.length}>Print</button>
                </div>
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}

            <div className="as-scroll">
                <table className="table as-table">
                    <thead>
                        <tr>
                            <th className="as-label" />
                            {(loading && !months.length ? MON : months).map((m) => (
                                <th key={m} className="ta-right">{loading && !months.length ? m : monthLabel(m, multiYear)}</th>
                            ))}
                            <th className="ta-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading &&
                            Array.from({ length: 16 }).map((_, i) => (
                                <tr key={i}>
                                    <td className="as-label"><span className="sk sk-cell" style={{ width: "70%" }} /></td>
                                    {Array.from({ length: (months.length || 12) + 1 }).map((__, c) => (
                                        <td key={c} className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                    ))}
                                </tr>
                            ))}

                        {!loading &&
                            lines.map((l, i) => {
                                if (l.kind === "blank") return <tr key={i} className="as-blank"><td colSpan={months.length + 2} /></tr>;
                                if (l.kind === "head") return <tr key={i} className="as-head"><td className="as-label" colSpan={months.length + 2}>{l.label}</td></tr>;

                                const f = l.kind === "rate" ? pct : n2;
                                return (
                                    <tr key={i} className={`as-${l.kind}`}>
                                        <td className="as-label" title={l.code || undefined}>{l.label}</td>
                                        {months.map((m) => {
                                            const v = l.values?.[m] || 0;
                                            return (
                                                <td key={m} className="ta-right mono">
                                                    {l.drill && v ? (
                                                        <button
                                                            type="button"
                                                            className="as-cell"
                                                            onClick={() => setCell({ title: `${l.label} · ${monthLabel(m, true)}`, month: m, ...l.drill })}
                                                        >
                                                            {f(v)}
                                                        </button>
                                                    ) : f(v)}
                                                </td>
                                            );
                                        })}
                                        <td className="ta-right mono strong">{f(l.total)}</td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>

            {cell && (
                <CellDocs
                    cell={cell}
                    branch={branch}
                    onClose={() => setCell(null)}
                    onOpenSale={(no) => navigate(`/task/sales/${encodeURIComponent(no)}`, { state: { from: location.pathname } })}
                />
            )}
        </section>
    );
}

/* ---------- documents behind one cell (loaded on click) ---------- */
function CellDocs({ cell, branch, onClose, onOpenSale }) {
    const [docs, setDocs] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const qs = new URLSearchParams({ type: cell.type, month: cell.month, branch, ...(cell.account ? { account: cell.account } : {}) });
        apiFetch(`/reports/annual-summary/docs?${qs}`)
            .then((r) => setDocs(r.docs || []))
            .catch((e) => setError(e.message || "Couldn't load the documents."));
    }, [cell, branch]);

    return (
        <Modal title={cell.title} onClose={onClose} size="xl" footer={<button className="btn" onClick={onClose}>Close</button>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="table-scroll" style={{ maxHeight: "60vh" }}>
                <table className="table">
                    <thead>
                        <tr>
                            <th>Customer / Vendor Name</th>
                            <th>Reference</th>
                            <th>Document No</th>
                            <th>Date</th>
                            <th>Declared Month</th>
                            <th>Module</th>
                            <th className="ta-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!docs && !error &&
                            Array.from({ length: 6 }).map((_, i) => (
                                <tr key={i}>{Array.from({ length: 7 }).map((__, c) => <td key={c}><span className="sk sk-cell" style={{ width: "70%" }} /></td>)}</tr>
                            ))}
                        {docs && docs.length === 0 && <tr><td colSpan={7} className="empty">No documents.</td></tr>}
                        {docs?.map((d, i) => (
                            <tr key={i}>
                                <td>{d.name}</td>
                                <td className="mono">
                                    {d.open === "sales"
                                        ? <button type="button" className="gl-ref" onClick={() => onOpenSale(d.ref)}>{d.ref}</button>
                                        : d.ref}
                                </td>
                                <td>{d.document_no}</td>
                                <td>{d.date}</td>
                                <td>{d.declared_month}</td>
                                <td>{d.module}</td>
                                <td className="ta-right mono">{n2(d.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Modal>
    );
}