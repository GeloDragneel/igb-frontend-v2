import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import "./Journals.css";

const TABS = [
    { key: "sales", label: "Sales Journal", title: "Sales Journal", endpoint: "/journals/sales" },
    { key: "purchases", label: "Purchase Receipts Journal", title: "Purchase Receipts Journal", endpoint: "/journals/purchases" },
    { key: "disbursement", label: "Cash Disbursement Journal", title: "Cash Disbursement Journal", endpoint: "/journals/expenses" },
    { key: "general", label: "General Journal", title: "General Journal", endpoint: "/journals/general-journal" },
];

// old file names (merge.php)
const PRINT_FILE = {
    sales: "Cash_Receipt_Journal",
    purchases: "Purchase_Receipts_Journal",
    disbursement: "Cash_Disbursement_Journal",
    general: "General_Journal",
};

const FILTERS = [
    { value: "DM", label: "Declared Month" },
    { value: "DR", label: "Date Range" },
    { value: "DE", label: "Date Encoded" },
];

const n4 = (v) => (Number(v) ? Number(v).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "");

/* =========================================================
   Books & Ledger → Journals
   ========================================================= */
export default function Journals() {
    const { user } = useAuth();
    const notify = useToast();
    const { from: pFrom, to: pTo } = usePeriod();
    const [tab, setTab] = useState("sales");
    const current = TABS.find((t) => t.key === tab);
    // default: declared month of the reporting period (old default)
    const [filterType, setFilterType] = useState("DM");
    const [from, setFrom] = useState(pFrom.slice(0, 7));
    const [to, setTo] = useState(pTo.slice(0, 7));
    const [branch, setBranch] = useState("current");

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [shown, setShown] = useState({ type: "DM", from: pFrom.slice(0, 7), to: pTo.slice(0, 7), branch: "current" });
    const [menu, setMenu] = useState(false);          // Print ▾ (Download XLSX / Download PDF)
    const [printing, setPrinting] = useState(false);
    const [pdf, setPdf] = useState(null);             // { url, name } for the preview
    const menuRef = useRef(null);

    // switching filter type changes the input format
    const changeType = (t) => {
        setFilterType(t);
        if (t === "DM") { setFrom(pFrom.slice(0, 7)); setTo(pTo.slice(0, 7)); }
        if (t === "DR") { setFrom(pFrom); setTo(pTo); }
        if (t === "DE") { setFrom(new Date().toISOString().slice(0, 10)); setTo(""); }
    };

    const search = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const qs = new URLSearchParams({ filter_type: filterType, from, to: to || from, branch });
            if (!current.endpoint) return;
            setData(await apiFetch(`${current.endpoint}?${qs}`));
            setShown({ type: filterType, from, to: to || from, branch });
        } catch (e) {
            setError(e.message || "Couldn't load the journal.");
        } finally {
            setLoading(false);
        }
    }, [filterType, from, to, branch, current]);

    // first load + branch switch
    useEffect(() => {
        setData(null);
        search();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, user?.caid, tab]);

    // insert a blank row between invoices (old addSpacingByGroup)
    const groups = useMemo(() => {
        const out = [];
        (data?.rows || []).forEach((r, i, all) => {
            out.push(r);
            if (i === all.length - 1 || all[i + 1].invoice_no !== r.invoice_no) out.push(null);
        });
        return out;
    }, [data]);

    const branchOpts = [
        { value: "current", label: "This branch" },
        ...(data?.branches?.length ? [{ value: "all", label: "All Branches" }] : []),
        ...(data?.branches || []).map((b) => ({ value: String(b.id), label: b.label })),
    ];

    // close the Print menu on outside click
    useEffect(() => {
        if (!menu) return undefined;
        const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [menu]);

    // free the PDF preview
    useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

    // old Print: Download XLSX (template) / Download PDF (preview) — same filters as the rows on screen
    const print = async (format) => {
        setMenu(false);
        setPrinting(true);
        try {
            const qs = new URLSearchParams({ tab, filter_type: shown.type, from: shown.from, to: shown.to || shown.from, branch: shown.branch, format });
            const blob = await apiBlob(`/print/journal?${qs}`);
            const name = `${PRINT_FILE[tab]}-${user?.username || user?.id || ""}.${format}`;
            if (format === "pdf") {
                setPdf({ url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })), name });
            } else {
                const url = URL.createObjectURL(blob);
                const a = Object.assign(document.createElement("a"), { href: url, download: name });
                document.body.append(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            notify(e.message || "Couldn't print the journal.", "error");
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

    const periodText = shown.type === "DE" ? shown.from : `${shown.from} to ${shown.to}`;

    return (
        <section className="card jr-card">
            {/* tabs */}
            <nav className="jr-tabs" role="tablist">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        role="tab"
                        aria-selected={tab === t.key}
                        className={`jr-tab ${tab === t.key ? "is-active" : ""}`}
                        onClick={() => setTab(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>

            {!current.endpoint ? (
                <div className="jr-soon">{current.label} is coming soon.</div>
            ) : (
                <>
                    {/* report header */}
                    <header className="jr-head">
                        <div className="jr-title">{current.title}</div>
                        {data?.company?.address && <div>{data.company.address}</div>}
                        <div>For the Period From : {periodText}</div>
                    </header>

                    {/* filters */}
                    <div className="jr-filters no-print">
                        <div className="field">
                            <span className="field-label">Filter Type</span>
                            <SearchSelect value={filterType} onChange={changeType} options={FILTERS} aria-label="Filter Type" />
                        </div>
                        <label className="field">
                            <span className="field-label">{filterType === "DE" ? "Date" : "From"}</span>
                            <input
                                type={filterType === "DM" ? "month" : "date"}
                                className="input"
                                value={from}
                                onChange={(e) => setFrom(e.target.value)}
                            />
                        </label>
                        {filterType !== "DE" && (
                            <label className="field">
                                <span className="field-label">To</span>
                                <input
                                    type={filterType === "DM" ? "month" : "date"}
                                    className="input"
                                    value={to}
                                    onChange={(e) => setTo(e.target.value)}
                                />
                            </label>
                        )}
                        {branchOpts.length > 1 && (
                            <div className="field jr-branch">
                                <span className="field-label">Branch</span>
                                <SearchSelect value={branch} onChange={setBranch} options={branchOpts} aria-label="Branch" />
                            </div>
                        )}
                        <div className="jr-btns">
                            <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
                            <div className="jr-print" ref={menuRef}>
                                <button className="btn" onClick={() => setMenu((m) => !m)} disabled={loading || printing || !data?.rows?.length}
                                    aria-haspopup="menu" aria-expanded={menu}>
                                    {printing ? "Printing…" : "Print ▾"}
                                </button>
                                {menu && (
                                    <ul className="jr-print-menu" role="menu">
                                        <li><button type="button" role="menuitem" onClick={() => print("xlsx")}>Download XLSX</button></li>
                                        <li><button type="button" role="menuitem" onClick={() => print("pdf")}>Download PDF</button></li>
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>

                    {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}

                    {/* table */}
                    <div className="jr-scroll">
                        <table className="table jr-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Account ID</th>
                                    <th>Tran</th>
                                    <th>Name</th>
                                    <th>Line Description</th>
                                    <th className="ta-right">Debit Amnt</th>
                                    <th className="ta-right">Credit Amnt</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading &&
                                    Array.from({ length: 12 }).map((_, i) => (
                                        <tr key={i}>
                                            {["55%", "60%", "50%", "70%", "75%", "60%", "60%"].map((w, c) => (
                                                <td key={c} className={c > 4 ? "ta-right" : ""}><span className="sk sk-cell" style={{ width: w }} /></td>
                                            ))}
                                        </tr>
                                    ))}

                                {!loading && data && groups.length === 0 && (
                                    <tr><td colSpan={7} className="empty">No entries for this period.</td></tr>
                                )}

                                {!loading &&
                                    groups.map((r, i) =>
                                        r ? (
                                            <tr key={i}>
                                                <td>{r.date}</td>
                                                <td className="mono">{r.account_id}</td>
                                                <td className="mono">{r.tran}</td>
                                                <td>{r.name}</td>
                                                <td>{r.description}</td>
                                                <td className="ta-right mono">{n4(r.debit)}</td>
                                                <td className="ta-right mono">{n4(r.credit)}</td>
                                            </tr>
                                        ) : (
                                            <tr key={i} className="jr-gap" aria-hidden="true"><td colSpan={7} /></tr>
                                        )
                                    )}
                            </tbody>
                            {!loading && data?.rows?.length > 0 && (
                                <tfoot>
                                    <tr>
                                        <td colSpan={5} />
                                        <td className="ta-right mono strong jr-total">{n4(data.totals.debit) || "0.0000"}</td>
                                        <td className="ta-right mono strong jr-total">{n4(data.totals.credit) || "0.0000"}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </>
            )}

            {pdf && (
                <Modal
                    title={`${current.title} - Print Preview`}
                    onClose={() => setPdf(null)}
                    size="xxlg"
                    footer={
                        <>
                            <button className="btn" onClick={() => setPdf(null)}>Close</button>
                            <button className="btn btn-primary" onClick={savePdf}>Download PDF</button>
                        </>
                    }
                >
                    <iframe className="jr-pdf" src={pdf.url} title={pdf.name} />
                </Modal>
            )}
        </section>
    );
}