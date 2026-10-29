import { useEffect, useMemo, useRef, useState } from "react";
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

// several DAT files (one per month): pick a folder once where the browser supports it, normal downloads otherwise
async function saveManyDat(files) {
    if (window.showDirectoryPicker) {
        try {
            const dir = await window.showDirectoryPicker({ mode: "readwrite" });
            for (const f of files) {
                const handle = await dir.getFileHandle(f.filename, { create: true });
                const writable = await handle.createWritable();
                await writable.write(new Blob([f.content], { type: "text/plain" }));
                await writable.close();
            }
            return { status: "saved", folder: dir.name };
        } catch (e) {
            if (e.name === "AbortError") return { status: "cancelled" };
        }
    }
    for (const f of files) {
        const url = URL.createObjectURL(new Blob([f.content], { type: "application/octet-stream" }));
        const a = Object.assign(document.createElement("a"), { href: url, download: f.filename });
        document.body.append(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        await new Promise((ok) => setTimeout(ok, 400));   // a short gap so the browser takes every file
    }
    return { status: "downloaded" };
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
    const [printing, setPrinting] = useState(false);         // false | "pdf" | "xlsx" (the button that is busy)
    const [pdf, setPdf] = useState(null);                    // { url, name } for the preview
    const [per, setPer] = useState(25);                      // 5 | 25 | 50 | 0 (All)
    const [page, setPage] = useState(1);
    const [check, setCheck] = useState(null);                // validation popup: { data, mode: "errors" | "warnings" }
    const [flash, setFlash] = useState(0);                   // line number to highlight
    const reqId = useRef(0);                                 // only the latest request fills the screen
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
        const id = ++reqId.current;
        setLoading(true);
        setError("");
        try {
            const params = report.yearly ? { type, year } : { type, from, to };
            const r = await apiFetch(`/reports/esub?${new URLSearchParams(params)}`);
            if (id !== reqId.current) return null;            // another report was picked meanwhile
            const withKey = { ...r, key: JSON.stringify(params) };
            setData(withKey);
            setPage(1);
            return withKey;
        } catch (e) {
            if (id === reqId.current) setError(e.message || "Couldn't load the report.");
            return null;
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    };

    // picking a report (and opening the page) shows its data right away
    useEffect(() => {
        if (!report.disabled) load();
    }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

    // reuse what's on screen if it's for the same report and period
    const paramsKey = JSON.stringify(report.yearly ? { type, year } : { type, from, to });
    const current = async () => (data?.key === paramsKey ? data : await load());

    const saveDat = async (r) => {
        // more than one month (e.g. Jul 2026 – Sep 2026) → one DAT per month: Jul, Aug, Sep
        const months = r.dat.files;
        if (Array.isArray(months) && months.length) {
            const ok = months.filter((f) => f.content);
            const bad = months.filter((f) => !f.content);
            if (!ok.length) { notify(`No DAT saved – ${bad.map((f) => f.label).join(", ")} still ha${bad.length === 1 ? "s" : "ve"} errors. View that month to fix them.`); return; }
            const res = await saveManyDat(ok);
            if (res.status === "cancelled") return;
            const names = ok.map((f) => f.label).join(", ");
            notify(res.status === "saved"
                ? `Saved ${ok.length} DAT file${ok.length === 1 ? "" : "s"} (${names}) to ${res.folder}`
                : `Downloaded ${ok.length} DAT file${ok.length === 1 ? "" : "s"} (${names}) to your Downloads folder`);
            if (bad.length) notify(`Not saved: ${bad.map((f) => `${f.label} (${f.errors} error${f.errors === 1 ? "" : "s"})`).join(", ")} – view that month to fix them.`);
            return;
        }
        const res = await saveWithDialog(r.dat.filename, r.dat.content);
        if (res.status === "saved") notify(`Saved ${res.name}`);
        else if (res.status === "downloaded") notify(`Downloaded ${res.name} to your Downloads folder`);
    };

    // DAT: validated first (like the BIR RELIEF Validation Module) – errors stop it, warnings ask first
    const downloadDat = async () => {
        const r = await current();
        if (!r) return;
        const v = r.validation;
        if (v && (!v.ok || !r.dat.content)) { setCheck({ data: r, mode: "errors" }); return; }
        if (v?.warnings?.length) { setCheck({ data: r, mode: "warnings" }); return; }
        await saveDat(r);
    };

    // jump to a line of the table and light it up
    const goLine = (line) => {
        if (!line) return;
        setCheck(null);
        if (per) setPage(Math.ceil(line / per));
        setFlash(line);
        setTimeout(() => setFlash(0), 2400);
    };

    // PDF → shown in a popup · Excel → downloaded
    const print = async (format) => {
        if (report.disabled) return;
        if (!report.yearly && (!from || !to)) { setError("Choose both months."); return; }
        setPrinting(format);
        setError("");
        try {
            const params = report.yearly ? { type, year, format } : { type, from, to, format };
            const blob = await apiBlob(`/print/esub?${new URLSearchParams(params)}`);
            const name = `${PRINT_NAMES[type] || "Report1601EQ"}-${user?.id ?? ""}.${format}`;
            if (format === "pdf") {
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
    const v = shown?.validation;
    // line number → "err" | "warn"
    const marks = useMemo(() => {
        const m = {};
        (v?.warnings || []).forEach((x) => { if (x.line) m[x.line] = "warn"; });
        (v?.errors || []).forEach((x) => { if (x.line) m[x.line] = "err"; });
        return m;
    }, [v]);

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
                            <button className="btn btn-sm btn-primary" onClick={load} disabled={off}>{loading ? "…" : "SEARCH"}</button>
                            <button className="btn btn-sm" onClick={downloadDat} disabled={off} title="Save the DAT file">DAT</button>
                        </div>

                        <div className="es-row es-btns">
                            <button className="btn btn-sm" onClick={() => print("pdf")} disabled={off || !!printing} title="Open as PDF">
                                {printing === "pdf" ? "…" : "PDF"}
                            </button>
                            <button className="btn btn-sm" onClick={() => print("xlsx")} disabled={off || !!printing} title="Download as Excel">
                                {printing === "xlsx" ? "…" : "Excel"}
                            </button>
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

                            {v && (
                                <div className={`es-check no-print ${!v.ok ? "is-err" : v.warnings.length ? "is-warn" : "is-ok"}`} role="status">
                                    <span className="es-check-ico" aria-hidden="true">{!v.ok ? "!" : v.warnings.length ? "!" : "✓"}</span>
                                    <div className="es-check-text">
                                        <b>
                                            {!v.ok
                                                ? `${v.errors.length} problem${v.errors.length === 1 ? "" : "s"} – the DAT can't be made yet`
                                                : v.warnings.length
                                                    ? `Ready for RELIEF, with ${v.warnings.length} warning${v.warnings.length === 1 ? "" : "s"}`
                                                    : "Passed the RELIEF checks – the DAT is ready"}
                                        </b>
                                        <small>
                                            {!v.ok ? "Fix them in the vendor / customer or client records, then View again." : "TIN, names, amounts, period and header were checked."}
                                            {v.fixed?.length ? ` ${v.fixed.length} thing${v.fixed.length === 1 ? " was" : "s were"} fixed automatically.` : ""}
                                        </small>
                                    </div>
                                    {(v.errors.length > 0 || v.warnings.length > 0 || v.fixed?.length > 0) && (
                                        <button className="btn btn-sm" onClick={() => setCheck({ data: shown, mode: v.ok ? "warnings" : "errors", view: true })}>See details</button>
                                    )}
                                </div>
                            )}

                            <div className="es-meta no-print">
                                <span>{shown.rows.length} line{shown.rows.length === 1 ? "" : "s"}</span>
                                <span className="mono">{shown.dat.files?.length ? shown.dat.files.map((f) => f.filename).join(" · ") : shown.dat.filename}</span>
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
                                            <tr key={start + i} className={[marks[start + i + 1] ? `es-row-${marks[start + i + 1]}` : "", flash === start + i + 1 ? "es-row-flash" : ""].join(" ").trim() || undefined}>
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
                            <p className="br-empty-sub">Choose the period on the left, then press View. DAT checks the file the same way BIR RELIEF does before it downloads.</p>
                        </div>
                    )}
                </div>
            </div>

            {check && (
                <DatCheck
                    check={check}
                    onClose={() => setCheck(null)}
                    onLine={goLine}
                    onDownload={async () => { const r = check.data; setCheck(null); await saveDat(r); }}
                />
            )}

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
/* ---------- the RELIEF check popup: errors (no DAT), warnings (download anyway), what was fixed ---------- */
function DatCheck({ check, onClose, onLine, onDownload }) {
    const v = check.data.validation || { errors: [], warnings: [], fixed: [] };
    const canDownload = v.ok && !!check.data.dat?.content;
    const [tab, setTab] = useState(v.errors.length ? "errors" : v.warnings.length ? "warnings" : "fixed");
    const list = tab === "errors" ? v.errors : tab === "warnings" ? v.warnings : [];

    return (
        <Modal
            title={canDownload ? (check.view ? "RELIEF check" : "Download with warnings?") : "The DAT can't be made yet"}
            onClose={onClose}
            size="xlg"
            footer={
                <>
                    <span className="muted small es-chk-foot">{check.data.dat?.files?.length ? `${check.data.dat.files.length} DAT files (one per month)` : check.data.dat?.filename}</span>
                    <button className="btn" onClick={onClose}>Close</button>
                    {canDownload && <button className="btn btn-primary" onClick={onDownload}>{v.warnings.length ? "Download anyway" : "Download DAT"}</button>}
                </>
            }
        >
            <p className={`es-chk-lead ${canDownload ? "" : "is-err"}`}>
                {canDownload
                    ? "These won't stop the BIR RELIEF Validation Module, but check them before you file."
                    : "The BIR RELIEF Validation Module would reject this file. Fix these first – the DAT is made once there are no problems left."}
            </p>

            <div className="es-chk-tabs" role="tablist">
                <button role="tab" aria-selected={tab === "errors"} className={`is-err ${tab === "errors" ? "is-on" : ""}`} onClick={() => setTab("errors")}>
                    Problems <span>{v.errors.length}</span>
                </button>
                <button role="tab" aria-selected={tab === "warnings"} className={`is-warn ${tab === "warnings" ? "is-on" : ""}`} onClick={() => setTab("warnings")}>
                    Warnings <span>{v.warnings.length}</span>
                </button>
                <button role="tab" aria-selected={tab === "fixed"} className={`is-ok ${tab === "fixed" ? "is-on" : ""}`} onClick={() => setTab("fixed")}>
                    Fixed automatically <span>{v.fixed?.length || 0}</span>
                </button>
            </div>

            {tab === "fixed" ? (
                v.fixed?.length
                    ? <ul className="es-chk-fixed">{v.fixed.map((f) => <li key={f}>{f}</li>)}</ul>
                    : <p className="es-chk-none">Nothing needed fixing.</p>
            ) : !list.length ? (
                <p className="es-chk-none">{tab === "errors" ? "No problems." : "No warnings."}</p>
            ) : (
                <div className="es-chk-scroll">
                    <table className="table es-chk-table">
                        <thead>
                            <tr><th className="ta-right">Line</th><th>Branch</th><th>Reference</th><th>TIN</th><th>Registered name</th><th>Field</th><th>Problem</th></tr>
                        </thead>
                        <tbody>
                            {list.map((x, i) => (
                                <tr key={i} className={x.line ? "is-link" : ""} onClick={() => onLine(x.line)} title={x.line ? "Show this line in the report" : undefined}>
                                    <td className="ta-right mono">{x.line ?? "Header"}</td>
                                    <td className="es-chk-branch" title={x.branch}>{x.branch || "—"}</td>
                                    <td className="mono">{x.ref || "—"}</td>
                                    <td className="mono">{x.tin ? fmtTin(x.tin) : "—"}</td>
                                    <td className="es-chk-name" title={x.name}>{x.name || "—"}</td>
                                    <td><span className={`es-chk-field ${tab === "errors" ? "is-err" : "is-warn"}`}>{x.field}</span></td>
                                    <td>{x.message}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Modal>
    );
}