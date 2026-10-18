import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import SearchSelect from "../../components/SearchSelect";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (s) => Number(String(s ?? "").replace(/,/g, "")) || 0;
const monLabel = (ym) => { const [y, m] = ym.split("-"); return `${MON[+m - 1]} ${y}`; };

// current quarter (old page default)
const quarter = () => {
    const d = new Date(), y = d.getFullYear(), s = Math.floor(d.getMonth() / 3) * 3 + 1;
    const p = (n) => String(n).padStart(2, "0");
    return [`${y}-${p(s)}`, `${y}-${p(s + 2)}`];
};

/* =========================================================
   BIR & Tax → VAT Summary (2550-M/Q Summary)
   ========================================================= */
export default function VatSummary() {
    const { user } = useAuth();
    const { from: pFrom, to: pTo } = usePeriod();

    const [filterType, setFilterType] = useState("DM");
    const [mFrom, setMFrom] = useState(pFrom.slice(0, 7));   // e.g. 2026-01
    const [mTo, setMTo] = useState(pTo.slice(0, 7)); // e.g. 2026-09
    const [dFrom, setDFrom] = useState(pFrom); // e.g. 2026-01-01
    const [dTo, setDTo] = useState(pTo); // e.g. 2026-09-30
    const [account, setAccount] = useState("0");
    const [branch, setBranch] = useState("all");

    // follow the Reporting Period when it changes
    useEffect(() => {
        setMFrom(pFrom.slice(0, 7));
        setMTo(pTo.slice(0, 7));
        setDFrom(pFrom);
        setDTo(pTo);
    }, [pFrom, pTo]);

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [used, setUsed] = useState(null);           // filters behind the data shown
    const [paid1, setPaid1] = useState("0.00");
    const [paid2, setPaid2] = useState("0.00");
    const [detail, setDetail] = useState(null);       // popup
    const [printing, setPrinting] = useState(false);

    const search = useCallback(async () => {
        const from = filterType === "DM" ? mFrom : dFrom;
        const to = filterType === "DM" ? mTo : dTo;
        if (!from || !to) return setError("Choose both dates.");
        const params = { filter_type: filterType, from, to, account_code: account, branch };
        setLoading(true);
        setError("");
        try {
            const r = await apiFetch(`/reports/vat-summary?${new URLSearchParams(params)}`);
            setData(r);
            setUsed(params);
            setPaid1(n2(r.less.first));
            setPaid2(n2(r.less.second));
        } catch (e) {
            setError(e.message || "Couldn't load the VAT summary.");
        } finally {
            setLoading(false);
        }
    }, [filterType, mFrom, mTo, dFrom, dTo, account, branch]);

    // search on open, when the client changes, and when the Reporting Period changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { search(); }, [user?.id, user?.caid, mFrom, mTo, dFrom, dTo]);

    const months = data?.months || [];
    const cols = months.length + 3;
    const payable = data ? data.due.total - (num(paid1) + num(paid2) + data.less.vt2307) : 0;
    const rangeText = months.length ? `${MON[+months[0].slice(5) - 1]} - ${MON[+months.at(-1).slice(5) - 1]} ${months.at(-1).slice(0, 4)}` : "";

    const accountOpts = useMemo(() => [
        { value: "0", label: "All accounts" },
        ...(data?.accounts || []).map((a) => ({ value: a.code, label: `${a.code} - ${a.name}` })),
    ], [data?.accounts]);
    const branchOpts = [
        { value: "all", label: "All branches" },
        ...(data?.branches || []).map((b) => ({ value: String(b.id), label: b.label })),
    ];

    /* ---------- popup with the documents behind a cell ---------- */
    const openDocs = async (section, field, label, month) => {
        setDetail({ title: `${label} · ${monLabel(month)}`, rows: null });
        try {
            const r = await apiFetch(`/reports/vat-summary/docs?${new URLSearchParams({
                section, field: field || "", month,
                filter_type: used.filter_type, account_code: used.account_code, branch: used.branch,
            })}`);
            setDetail({ title: `${label} · ${monLabel(month)}`, rows: r.rows, total: r.total });
        } catch (e) {
            setDetail({ title: `${label} · ${monLabel(month)}`, rows: [], error: e.message || "Couldn't load the documents." });
        }
    };

    /* ---------- table pieces ---------- */
    const Cells = ({ r, section, field, label, link = true }) => (
        <>
            {months.map((m) => (
                <td key={m} className="ta-right mono">
                    {link && r.values[m] !== 0 ? (
                        <button type="button" className="vs-link" onClick={() => openDocs(section, field, label, m)}>{n2(r.values[m])}</button>
                    ) : n2(r.values[m])}
                </td>
            ))}
            <td className="ta-right mono strong">{n2(r.total)}</td>
        </>
    );

    const Section = ({ tag, section, block }) => (
        <>
            {block.rows.map((r) => (
                <tr key={`${section}-${r.key}`}>
                    <td className="vs-tag">{tag}</td>
                    <td>{r.label}</td>
                    <Cells r={r} section={section} field={r.key} label={`${tag} – ${r.label}`} />
                </tr>
            ))}
            <tr className="vs-sub">
                <td className="vs-tag">{tag}</td>
                <td>Total</td>
                <Cells r={block.total} link={false} />
            </tr>
            <tr className="vs-gap"><td colSpan={cols} /></tr>
        </>
    );

    const Total = ({ label, r, cls = "vs-sub", section }) => (
        <tr className={cls}>
            <td className="vs-tag">{label}</td>
            <td />
            <Cells r={r} section={section} label={label} link={!!section} />
        </tr>
    );

    // called as a function (not <LessRow>) so the typed cell keeps its focus while typing
    const lessRow = (label, children, edit = false) => (
        <tr key={label}>
            <td />
            <td className="ta-right">{label}</td>
            {months.map((m) => <td key={m} />)}
            <td className="ta-right mono" style={edit ? EDIT_CELL : undefined}>{children}</td>
        </tr>
    );
    // the typed amount fills its cell (no box sticking out of the column)
    const EDIT_CELL = { padding: 0, position: "relative" };
    const EDIT_INPUT = {
        display: "block", width: "100%", minWidth: 0, height: "100%", minHeight: 44, boxSizing: "border-box",
        margin: 0, padding: "0 14px", border: 0, borderRadius: 0, boxShadow: "none", outlineOffset: -2,
        background: "transparent", font: "inherit", textAlign: "right",
    };

    /* ---------- Print → EBIR .xlsx (old Print: EBIR.xlsx template, same rows as the table) ---------- */
    const printXlsx = async () => {
        if (!used) return;
        setPrinting(true);
        try {
            const q = new URLSearchParams({ ...used, paid1: num(paid1).toFixed(2), paid2: num(paid2).toFixed(2), range: rangeText });
            const blob = await apiBlob(`/print/vat-summary?${q}`);
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement("a"), { href: url, download: `EBIR-${user?.id ?? ""}.xlsx` });
            document.body.append(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            setError(e.message || "Couldn't print the VAT summary.");
        } finally {
            setPrinting(false);
        }
    };

    return (
        <section className="card jr-card">
            <header className="jr-head">
                <h2>{data?.company?.name || " "}</h2>
                {data?.company?.tin && <div className="mono">{data.company.tin}</div>}
                {data?.company?.address && <div>{data.company.address}</div>}
                <div className="jr-title">2550-M/Q Summary</div>
                {rangeText && <div>From {rangeText}</div>}
            </header>

            <div className="jr-filters no-print">
                <div className="field">
                    <span className="field-label">Filter by</span>
                    <div className="vs-seg" role="radiogroup" aria-label="Filter by">
                        {[["DM", "Declared month"], ["DR", "Date range"]].map(([v, l]) => (
                            <button key={v} type="button" role="radio" aria-checked={filterType === v}
                                className={`vs-seg-btn ${filterType === v ? "is-active" : ""}`} onClick={() => setFilterType(v)}>
                                {l}
                            </button>
                        ))}
                    </div>
                </div>

                {filterType === "DM" ? (
                    <>
                        <label className="field"><span className="field-label">From</span>
                            <input type="month" className="input" value={mFrom} onChange={(e) => setMFrom(e.target.value)} /></label>
                        <label className="field"><span className="field-label">To</span>
                            <input type="month" className="input" value={mTo} onChange={(e) => setMTo(e.target.value)} /></label>
                    </>
                ) : (
                    <>
                        <label className="field"><span className="field-label">Date from</span>
                            <input type="date" className="input" value={dFrom} onChange={(e) => setDFrom(e.target.value)} /></label>
                        <label className="field"><span className="field-label">Date to</span>
                            <input type="date" className="input" value={dTo} onChange={(e) => setDTo(e.target.value)} /></label>
                    </>
                )}

                <div className="field vs-account">
                    <span className="field-label">Accounts</span>
                    <SearchSelect value={account} onChange={setAccount} options={accountOpts} aria-label="Accounts" />
                </div>

                {data?.branches?.length > 1 && (
                    <div className="field jr-branch">
                        <span className="field-label">Branch</span>
                        <SearchSelect value={branch} onChange={setBranch} options={branchOpts} aria-label="Branch" />
                    </div>
                )}

                <div className="jr-btns">
                    <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
                    <button className="btn" onClick={printXlsx} disabled={loading || printing || !data}>{printing ? "Printing…" : "Print"}</button>
                </div>
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}

            <div className="rp-scroll">
                <table className="table vs-table">
                    <thead>
                        <tr>
                            <th className="vs-tag">Tag</th>
                            <th>Summary Data</th>
                            {months.map((m) => <th key={m} className="ta-right">{monLabel(m)}</th>)}
                            <th className="ta-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && Array.from({ length: 8 }).map((_, i) => (
                            <tr key={i}>
                                {Array.from({ length: Math.max(cols, 6) }).map((__, c) => (
                                    <td key={c}><span className="sk sk-cell" style={{ width: c < 2 ? "70%" : "55%" }} /></td>
                                ))}
                            </tr>
                        ))}

                        {!loading && data && (
                            <>
                                <Section tag="Sales" section="sales" block={data.sales} />
                                <Section tag="Purchases" section="purchases" block={data.purchases} />
                                <Section tag="Expenses" section="expenses" block={data.expenses} />

                                <Total label="Total Purchases/Expenses" r={data.purch_exp} />
                                <tr className="vs-gap"><td colSpan={cols} /></tr>
                                <Total label="Net Total" r={data.net} cls="vs-grand" />
                                <tr className="vs-gap"><td colSpan={cols} /></tr>

                                <Total label="Output VAT" r={data.output} cls="" section="output" />
                                <Total label="Input VAT" r={data.input} cls="" section="input" />
                                <Total label="VAT Due" r={data.due} />

                                <tr><td className="vs-tag strong">Less : Tax Paid</td><td colSpan={cols - 1} /></tr>
                                {lessRow("1ST MONTH", (
                                    <input inputMode="decimal" value={paid1} style={EDIT_INPUT}
                                        onFocus={(e) => e.target.select()} onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                                        onChange={(e) => setPaid1(e.target.value.replace(/[^\d.,-]/g, ""))}
                                        onBlur={() => setPaid1(n2(num(paid1)))} aria-label="Tax paid, 1st month" />
                                ), true)}
                                {lessRow("2ND MONTH", (
                                    <input inputMode="decimal" value={paid2} style={EDIT_INPUT}
                                        onFocus={(e) => e.target.select()} onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                                        onChange={(e) => setPaid2(e.target.value.replace(/[^\d.,-]/g, ""))}
                                        onBlur={() => setPaid2(n2(num(paid2)))} aria-label="Tax paid, 2nd month" />
                                ), true)}
                                {lessRow("2307 (VT)", n2(data.less.vt2307))}

                                <tr className="vs-grand">
                                    <td className="vs-tag" colSpan={2}>TOTAL VAT PAYABLE/EXCESS</td>
                                    {months.map((m) => <td key={m} />)}
                                    <td className={`ta-right mono ${payable < 0 ? "vs-neg" : ""}`}>{n2(payable)}</td>
                                </tr>
                            </>
                        )}
                    </tbody>
                </table>
            </div>

            {detail && (
                <Modal title={`Details : ${detail.title}`} onClose={() => setDetail(null)} size="xxlg">
                    {detail.error && <div className="alert-error" role="alert">{detail.error}</div>}
                    <div className="rp-scroll">
                        <table className="table">
                            <thead>
                                <tr><th>Date</th><th>Doc #</th><th>Reference</th><th>Customer / Vendor</th><th>Module</th><th className="ta-right">Amount</th></tr>
                            </thead>
                            <tbody>
                                {!detail.rows && Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i}>{Array.from({ length: 6 }).map((__, c) => <td key={c}><span className="sk sk-cell" /></td>)}</tr>
                                ))}
                                {detail.rows?.length === 0 && !detail.error && (
                                    <tr><td colSpan={6} className="empty">No documents.</td></tr>
                                )}
                                {detail.rows?.map((r, i) => (
                                    <tr key={i}>
                                        <td>{r.date}</td>
                                        <td>{r.doc}</td>
                                        <td>{r.ref}</td>
                                        <td>{r.party}</td>
                                        <td>{r.module}</td>
                                        <td className="ta-right mono">{n2(r.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {detail.rows?.length > 0 && (
                                <tfoot>
                                    <tr><td colSpan={5} className="strong">Total</td><td className="ta-right mono strong">{n2(detail.total)}</td></tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </Modal>
            )}
        </section>
    );
}