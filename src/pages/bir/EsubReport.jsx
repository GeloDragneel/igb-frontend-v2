import { useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import "./EsubReport.css";

const REPORTS = [
    { id: "P", code: "Purchases", name: "Purchase Summary" },
    { id: "S", code: "Sales", name: "Sales Summary" },
    { id: "1601EQ_IT", code: "1601-EQ", name: "Sales · Income Tax (IT)" },
    { id: "1601EQ_VT", code: "1601-EQ", name: "Sales · VAT (VT)" },
    { id: "1601EQ_PE", code: "1601-EQ", name: "Purchases & Expenses" },
    { id: "1604E", code: "1604-E", name: "Annual Information Return", yearly: true },
    { id: "I", code: "Importation", name: "Summary of Importation", disabled: true },
];

// old File Type → Excel (template) / PDF (preview)
const PRINT_NAMES = { P: "PurchasesSummary", S: "SalesSummary", "1604E": "Report1604E" };
const PER_OPTIONS = [5, 25, 50, 0];          // 0 = All
/* 1 … 4 5 [6] 7 8 … 20 */
const pageNums = (page, pages) => {
    const out = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - page) <= 2) out.push(i);
        else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
};

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTin = (t) => String(t || "").replace(/(\d{3})(\d{3})(\d{3})(\d{3})?/, (_, a, b, c, d) => [a, b, c, d].filter(Boolean).join("-"));

// "Save As" window where the browser supports it, normal download otherwise
async function saveWithDialog(filename, content) {
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: "BIR DAT file", accept: { "text/plain": [".dat"] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(new Blob([content], { type: "text/plain" }));
            await writable.close();
            return { status: "saved", name: handle.name };
        } catch (e) {
            if (e.name === "AbortError") return { status: "cancelled" };
        }
    }
    const url = URL.createObjectURL(new Blob([content], { type: "application/octet-stream" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { status: "downloaded", name: filename };
}

/* =========================================================
   BIR & Tax → E-Sub Report (DAT files)
   ========================================================= */
export default function EsubReport() {
    const { user } = useAuth();
    const notify = useToast();
    const { from: pFrom, to: pTo } = usePeriod();

    const [type, setType] = useState("P");
    const [from, setFrom] = useState(pFrom.slice(0, 7));
    const [to, setTo] = useState(pTo.slice(0, 7));
    const [year, setYear] = useState(pTo.slice(0, 4));
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [printAs, setPrintAs] = useState("xlsx");          // xlsx | pdf
    const [printing, setPrinting] = useState(false);
    const [pdf, setPdf] = useState(null);                    // { url, name } for the preview
    const [per, setPer] = useState(25);                      // 5 | 25 | 50 | 0 (All)
    const [page, setPage] = useState(1);
    // long text columns that get cut off with "…"
    const CLIP = { name: "es-clip-name", address: "es-clip-addr", city: "es-clip-city" };
    const report = REPORTS.find((r) => r.id === type);
    const years = useMemo(() => Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + 1 - i)), []);

    // follow the Reporting Period
    useEffect(() => {
        setFrom(pFrom.slice(0, 7));
        setTo(pTo.slice(0, 7));
        setYear(pTo.slice(0, 4));
    }, [pFrom, pTo]);

    // reset when the client changes
    useEffect(() => { setData(null); }, [user?.id, user?.caid]);

    // free the PDF preview
    useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

    const load = async () => {
        if (report.disabled) return null;
        if (!report.yearly && (!from || !to)) { setError("Choose both months."); return null; }
        setLoading(true);
        setError("");
        try {
            const params = report.yearly ? { type, year } : { type, from, to };
            const r = await apiFetch(`/reports/esub?${new URLSearchParams(params)}`);
            const withKey = { ...r, key: JSON.stringify(params) };
            setData(withKey);
            setPage(1);
            return withKey;
        } catch (e) {
            setError(e.message || "Couldn't load the report.");
            return null;
        } finally {
            setLoading(false);
        }
    };

    // reuse what's on screen if it's for the same report and period
    const paramsKey = JSON.stringify(report.yearly ? { type, year } : { type, from, to });
    const current = async () => (data?.key === paramsKey ? data : await load());

    const downloadDat = async () => {
        const r = await current();
        if (!r) return;
        const res = await saveWithDialog(r.dat.filename, r.dat.content);
        if (res.status === "saved") notify(`Saved ${res.name}`);
        else if (res.status === "downloaded") notify(`Downloaded ${res.name} to your Downloads folder`);
    };

    // old Print: File Type Excel → xlsx from the template, PDF → shown in a popup
    const print = async () => {
        if (report.disabled) return;
        if (!report.yearly && (!from || !to)) { setError("Choose both months."); return; }
        setPrinting(true);
        setError("");
        try {
            const params = report.yearly ? { type, year, format: printAs } : { type, from, to, format: printAs };
            const blob = await apiBlob(`/print/esub?${new URLSearchParams(params)}`);
            const name = `${PRINT_NAMES[type] || "Report1601EQ"}-${user?.id ?? ""}.${printAs}`;
            if (printAs === "pdf") {
                setPdf({ url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })), name });
            } else {
                const url = URL.createObjectURL(blob);
                const a = Object.assign(document.createElement("a"), { href: url, download: name });
                document.body.append(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                notify(`Downloaded ${name}`);
            }
        } catch (e) {
            setError(e.message || "Couldn't print the report.");
        } finally {
            setPrinting(false);
        }
    };

    const savePdf = () => {
        const a = Object.assign(document.createElement("a"), { href: pdf.url, download: pdf.name });
        document.body.append(a);
        a.click();
        a.remove();
    };

    const pick = (r) => {
        if (r.disabled) return;
        setType(r.id);
        setData(null);
        setError("");
        setPage(1);
    };

    const shown = data?.key === paramsKey ? data : null;
    const off = loading || report.disabled;

    // pagination (rows are all loaded; only the page is shown)
    const allRows = shown?.rows ?? [];
    const pages = per ? Math.max(1, Math.ceil(allRows.length / per)) : 1;
    const curPage = Math.min(page, pages);
    const start = per ? (curPage - 1) * per : 0;
    const pageRows = per ? allRows.slice(start, start + per) : allRows;

    return (
        <section className="br-page">
            <div className="br-layout es-layout">
                {/* ---------- left: reports + period + actions ---------- */}
                <aside className="card br-side es-side no-print" aria-label="E-Sub reports">
                    {/* ---------- top: period + actions ---------- */}
                    <div className="es-opts">
                        <div className="br-side-head">{report.yearly ? "Year" : "Declared month"}</div>

                        {report.yearly ? (
                            <select className="input es-in" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
                                {years.map((y) => <option key={y} value={y}>{y}</option>)}
                            </select>
                        ) : (
                            <div className="es-row">
                                <input type="month" className="input es-in" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
                                <input type="month" className="input es-in" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
                            </div>
                        )}

                        <div className="es-row es-btns">
                            <button className="btn btn-sm btn-primary" onClick={load} disabled={off}>{loading ? "…" : "View"}</button>
                            <button className="btn btn-sm" onClick={downloadDat} disabled={off} title="Save the DAT file">DAT</button>
                        </div>

                        <div className="es-row es-btns">
                            <select className="input es-in es-printas" value={printAs} onChange={(e) => setPrintAs(e.target.value)} aria-label="File type" disabled={report.disabled}>
                                <option value="xlsx">Excel</option>
                                <option value="pdf">PDF</option>
                            </select>
                            <button className="btn btn-sm" onClick={print} disabled={off || printing} title="Print as Excel or PDF">{printing ? "…" : "Print"}</button>
                        </div>
                    </div>

                    {/* ---------- below: reports ---------- */}
                    <div className="br-side-head">Reports</div>
                    <ul className="br-side-list es-list" role="tablist" aria-orientation="vertical">
                        {REPORTS.map((r) => (
                            <li key={r.id}>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={type === r.id}
                                    aria-disabled={r.disabled || undefined}
                                    className={`br-side-item ${type === r.id ? "is-active" : ""} ${r.disabled ? "es-disabled" : ""}`}
                                    onClick={() => pick(r)}
                                    title={r.disabled ? "Not available yet" : undefined}
                                >
                                    <span className="br-side-code">{r.code}</span>
                                    <span className="br-side-name">{r.name}</span>
                                    {r.disabled && <span className="br-freq br-gray">Coming soon</span>}
                                </button>
                            </li>
                        ))}
                    </ul>
                </aside>
                {/* ---------- right: the report ---------- */}
                <div className="card br-panel es-panel">
                    {report.disabled && <p className="br-hint">Summary of Importation will be available once the importation tables are moved to the new system.</p>}
                    {error && <div className="alert-error" role="alert">{error}</div>}

                    {loading && (
                        <div className="es-skel">
                            {Array.from({ length: 6 }).map((_, i) => <span key={i} className="sk sk-cell" style={{ width: `${92 - i * 8}%` }} />)}
                        </div>
                    )}

                    {!loading && shown && (
                        <div className="es-report">
                            <header className="jr-head">
                                <h2>{shown.company.name}</h2>
                                <div className="mono">{fmtTin(shown.company.tin)}</div>
                                {shown.company.address && <div>{shown.company.address}</div>}
                                <div className="jr-title">{shown.title}</div>
                                <div>{shown.period}</div>
                            </header>

                            <div className="es-meta no-print">
                                <span>{shown.rows.length} line{shown.rows.length === 1 ? "" : "s"}</span>
                                <span className="mono">{shown.dat.filename}</span>
                            </div>

                            <div className="rp-scroll es-scroll">
                                <table className="table es-table">
                                    <thead>
                                        <tr>
                                            <th className="ta-right">#</th>
                                            {shown.columns.map((c) => (
                                                <th key={c.key} className={c.money || c.pct ? "ta-right" : CLIP[c.key] ? `es-clip ${CLIP[c.key]}` : ""}>
                                                    {c.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {shown.rows.length === 0 && (
                                            <tr><td colSpan={shown.columns.length + 1} className="empty">No transactions for this period.</td></tr>
                                        )}
                                        {pageRows.map((row, i) => (
                                            <tr key={start + i}>
                                                <td className="ta-right muted">{start + i + 1}</td>
                                                {shown.columns.map((c) => {
                                                    const text = row[c.key] ?? "";
                                                    if (CLIP[c.key]) {
                                                        return (
                                                            <td key={c.key} className={`es-clip ${CLIP[c.key]}`} title={text}>
                                                                {text}
                                                            </td>
                                                        );
                                                    }
                                                    return (
                                                        <td key={c.key} className={c.money || c.pct ? "ta-right mono" : ""}>
                                                            {c.money ? n2(text) : c.pct ? `${text}%` : c.key === "tin" ? fmtTin(text) : text}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                    {shown.rows.length > 0 && (
                                        <tfoot>
                                            <tr>
                                                <td />
                                                {shown.columns.map((c, i) => (
                                                    <td key={c.key} className={c.money ? "ta-right mono strong" : "strong"}>
                                                        {i === 0 ? "Total" : c.money && shown.totals[c.key] !== undefined ? n2(shown.totals[c.key]) : ""}
                                                    </td>
                                                ))}
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>

                            {allRows.length > 0 && (
                                <footer className="es-pager no-print">
                                    <span className="es-pager-info">
                                        {per ? `${start + 1}–${Math.min(allRows.length, start + per)} of ${allRows.length}` : allRows.length} line{allRows.length === 1 ? "" : "s"}
                                    </span>
                                    <nav className="es-pager-nav" aria-label="Pagination">
                                        <label className="es-pager-per">
                                            Rows
                                            <select className="input" value={per} onChange={(e) => { setPer(+e.target.value); setPage(1); }} aria-label="Rows per page">
                                                {PER_OPTIONS.map((n) => <option key={n} value={n}>{n || "All"}</option>)}
                                            </select>
                                        </label>
                                        {pages > 1 && (
                                            <>
                                                <button type="button" className="es-pg" onClick={() => setPage(curPage - 1)} disabled={curPage <= 1} aria-label="Previous page">‹</button>
                                                {pageNums(curPage, pages).map((n, i) => (n === "…"
                                                    ? <span key={`g${i}`} className="es-pg-gap">…</span>
                                                    : <button type="button" key={n} className={`es-pg${n === curPage ? " is-on" : ""}`} onClick={() => setPage(n)}
                                                        aria-current={n === curPage ? "page" : undefined}>{n}</button>))}
                                                <button type="button" className="es-pg" onClick={() => setPage(curPage + 1)} disabled={curPage >= pages} aria-label="Next page">›</button>
                                            </>
                                        )}
                                    </nav>
                                </footer>
                            )}
                        </div>
                    )}

                    {!loading && !shown && !error && !report.disabled && (
                        <div className="br-empty">
                            <p className="br-empty-title">{report.code} · {report.name}</p>
                            <p className="br-empty-sub">Choose the period on the left, then press View, DAT or Print.</p>
                        </div>
                    )}
                </div>
            </div>

            {pdf && (
                <Modal
                    title={`${report.code} · ${report.name}`}
                    onClose={() => setPdf(null)}
                    size="xxlg"
                    footer={
                        <>
                            <button className="btn" onClick={() => setPdf(null)}>Close</button>
                            <button className="btn btn-primary" onClick={savePdf}>Download PDF</button>
                        </>
                    }
                >
                    <iframe className="es-pdf" src={pdf.url} title={pdf.name} />
                </Modal>
            )}
        </section>
    );
}