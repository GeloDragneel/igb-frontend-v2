import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../../components/Modal";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { useLookups } from "../../context/LookupsContext";
import "./Reports.css";

/* ---------- columns per report (num = money, total = summed in footer) ---------- */
const SALES_COLS = [
    { key: "branch_client", label: "Branch Code (Client)" },
    { key: "date", label: "Date" },
    { key: "tin", label: "TIN" },
    { key: "branch_code", label: "Branch Code (Customer)" },
    { key: "customer", label: "Customer" },
    { key: "document_no", label: "Document" },
    { key: "account_name", label: "Account Title" },
    { key: "amount", label: "Amount", num: true, total: true },
    { key: "currency", label: "Currency", center: true },
    { key: "ex_rate", label: "Ex Rate", num: true },
    { key: "php", label: "PHP", num: true, total: true },
    { key: "net_of_vat", label: "Net VAT", num: true, total: true },
    { key: "output_vat", label: "Output VAT", num: true, total: true },
    { key: "vat_exempt", label: "VAT Exempt", num: true, total: true },
    { key: "zero_rated", label: "Zero Rated", num: true, total: true },
    { key: "non_vat", label: "Non VAT", num: true, total: true },
];

const PURCHASE_COLS = [
    { key: "branch_client", label: "Branch Code (Client)" },
    { key: "date", label: "Date" },
    { key: "tin", label: "TIN" },
    { key: "branch_code", label: "Branch Code (Vendor)" },
    { key: "vendor", label: "Vendor" },
    { key: "document_no", label: "Document" },
    { key: "ref_no", label: "Ref No" },
    { key: "account_name", label: "Account Title" },
    { key: "amount", label: "Amount", num: true, total: true },
    { key: "currency", label: "Currency", center: true },
    { key: "ex_rate", label: "Ex Rate", num: true },
    { key: "php", label: "PHP", num: true, total: true },
    { key: "net_of_vat", label: "Net VAT", num: true, total: true },
    { key: "input_vat", label: "Input VAT", num: true, total: true },
    { key: "vat_exempt", label: "VAT Exempt", num: true, total: true },
    { key: "zero_rated", label: "Zero Rated", num: true, total: true },
    { key: "non_vat", label: "Non VAT", num: true, total: true },
];

const TABS = [
    { key: "sales", label: "Sales Report", title: "Sales Report", endpoint: "/reports/sales", cols: SALES_COLS },
    { key: "purchase", label: "Purchase Report", title: "Purchase Report", endpoint: "/reports/purchase", cols: PURCHASE_COLS },
    { key: "expense", label: "Expense Report", title: "Expense Report", endpoint: "/reports/expense", cols: PURCHASE_COLS },
    { key: "import", label: "Importation Report" },
    { key: "export", label: "Exportation Report" },
];

const FILTERS = [
    { value: "DM", label: "Declared Month" },
    { value: "DR", label: "Date Range" },
    { value: "DE", label: "Date of Entry" },
];

// old merge.php columns (data1 … data15) and file names
const PRINT_KEYS = {
    sales: ["date", "tin", "customer", "document_no", "account_name", "amount", "currency", "ex_rate", "php", "net_of_vat", "output_vat", "vat_exempt", "zero_rated", "non_vat"],
    purchase: ["date", "tin", "vendor", "document_no", "account_name", "amount", "currency", "ex_rate", "php", "net_of_vat", "input_vat", "vat_exempt", "zero_rated", "non_vat"],
};
const PRINT_NUM = new Set(["amount", "ex_rate", "php", "net_of_vat", "output_vat", "input_vat", "vat_exempt", "zero_rated", "non_vat"]);
const PRINT_FILE = { sales: "ReportSalesJournal", purchase: "ReportPurchaseJournal", expense: "ReportExpenseJournal" };

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cellText = (c, r) => (c.num ? n2(r[c.key]) : String(r[c.key] ?? ""));

/* =========================================================
   Books & Ledger → Reports
   ========================================================= */
export default function Reports() {
    const { user } = useAuth();
    const notify = useToast();
    const { from: pFrom, to: pTo } = usePeriod();
    const { lookups } = useLookups();

    const [tab, setTab] = useState("sales");
    const current = TABS.find((t) => t.key === tab);
    const cols = current.cols || [];

    const [filterType, setFilterType] = useState("DM");
    const [from, setFrom] = useState(pFrom.slice(0, 7));
    const [to, setTo] = useState(pTo.slice(0, 7));
    const [accountCode, setAccountCode] = useState("");
    const [branch, setBranch] = useState("current");

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [shown, setShown] = useState({ from: pFrom.slice(0, 7), to: pTo.slice(0, 7), type: "DM", branch: "current" });
    const [menu, setMenu] = useState(false);          // Print ▾ (Download XLSX / Download PDF)
    const [printing, setPrinting] = useState(false);
    const [pdf, setPdf] = useState(null);             // { url, name } for the preview
    const menuRef = useRef(null);

    // Excel-style column filters: { colKey: Set(values) }  (no key = All)
    const [colFilters, setColFilters] = useState({});
    const [openFilter, setOpenFilter] = useState(null); // { key, rect }

    const changeType = (t) => {
        setFilterType(t);
        if (t === "DM") { setFrom(pFrom.slice(0, 7)); setTo(pTo.slice(0, 7)); }
        else { setFrom(pFrom); setTo(pTo); }
    };

    const search = useCallback(async () => {
        if (!current.endpoint) return;
        setLoading(true);
        setError("");
        try {
            const qs = new URLSearchParams({ filter_type: filterType, from, to: to || from, account_code: accountCode, branch });
            setData(await apiFetch(`${current.endpoint}?${qs}`));
            setShown({ from, to: to || from, type: filterType, branch });
            setColFilters({});
        } catch (e) {
            setError(e.message || "Couldn't load the report.");
        } finally {
            setLoading(false);
        }
    }, [current, filterType, from, to, accountCode, branch]);

    // first load, branch switch, tab switch
    useEffect(() => {
        setData(null);
        setColFilters({});
        setOpenFilter(null);
        search();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, user?.caid, tab]);

    const rows = data?.rows || [];

    const visible = useMemo(
        () => rows.filter((r) => Object.entries(colFilters).every(([key, set]) => {
            const c = cols.find((x) => x.key === key);
            return !c || set.has(cellText(c, r));
        })),
        [rows, colFilters, cols]
    );

    const totals = useMemo(() => {
        const t = {};
        cols.filter((c) => c.total).forEach((c) => (t[c.key] = visible.reduce((n, r) => n + (Number(r[c.key]) || 0), 0)));
        return t;
    }, [visible, cols]);

    const accountOpts = [
        { value: "", label: "All" },
        ...(lookups?.accounts || [])
            .filter((a) => a.root_name && String(a.root_name) !== "0")
            .map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` })),
    ];

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

    // old EXCEL ▾: DownloadXLSX / DownloadPDF — prints the rows on screen (column filters applied)
    const print = async (format) => {
        setMenu(false);
        setPrinting(true);
        try {
            const keys = PRINT_KEYS[tab === "sales" ? "sales" : "purchase"];
            const lines = visible.map((r) => ["", ...keys.map((k) => (PRINT_NUM.has(k) ? Number(r[k]) || 0 : String(r[k] ?? "")))]);
            const { token } = await apiFetch("/print/book-report", {
                method: "POST",
                body: JSON.stringify({ kind: tab, filter_type: shown.type, from: shown.from, to: shown.to, branch: shown.branch, rows: lines }),
            });
            const blob = await apiBlob(`/print/book-report/${token}?format=${format}`);
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
            notify(e.message || "Couldn't print the report.", "error");
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

    return (
        <section className="card jr-card">
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
                    <header className="jr-head">
                        <div className="jr-title">{current.title}</div>
                        {data?.company?.address && <div>{data.company.address}</div>}
                        <div>From : {shown.from} To {shown.to}</div>
                    </header>

                    <div className="jr-filters no-print">
                        <div className="field">
                            <span className="field-label">Filter Type</span>
                            <SearchSelect value={filterType} onChange={changeType} options={FILTERS} aria-label="Filter Type" />
                        </div>
                        <label className="field">
                            <span className="field-label">From</span>
                            <input type={filterType === "DM" ? "month" : "date"} className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                        </label>
                        <label className="field">
                            <span className="field-label">To</span>
                            <input type={filterType === "DM" ? "month" : "date"} className="input" value={to} onChange={(e) => setTo(e.target.value)} />
                        </label>
                        <div className="field rp-account">
                            <span className="field-label">Accounts</span>
                            <SearchSelect value={accountCode} onChange={setAccountCode} options={accountOpts} searchPlaceholder="Search account..." aria-label="Accounts" />
                        </div>
                        {branchOpts.length > 1 && (
                            <div className="field jr-branch">
                                <span className="field-label">Branch</span>
                                <SearchSelect value={branch} onChange={setBranch} options={branchOpts} aria-label="Branch" />
                            </div>
                        )}
                        <div className="jr-btns">
                            <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
                            <div className="rp-print" ref={menuRef}>
                                <button className="btn" onClick={() => setMenu((m) => !m)} disabled={loading || printing || !visible.length}
                                    aria-haspopup="menu" aria-expanded={menu}>
                                    {printing ? "Printing…" : "Print ▾"}
                                </button>
                                {menu && (
                                    <ul className="rp-print-menu" role="menu">
                                        <li><button type="button" role="menuitem" onClick={() => print("xlsx")}>Download XLSX</button></li>
                                        <li><button type="button" role="menuitem" onClick={() => print("pdf")}>Download PDF</button></li>
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>

                    {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}

                    <div className="rp-scroll">
                        <table className="table rp-table">
                            <thead>
                                <tr>
                                    <th className="rp-num-col">#</th>
                                    {cols.map((c) => (
                                        <th key={c.key} className={c.num ? "ta-right" : c.center ? "ta-center" : ""}>{c.label}</th>
                                    ))}
                                </tr>
                                <tr className="rp-filter-row no-print">
                                    <th />
                                    {cols.map((c) => {
                                        const active = colFilters[c.key];
                                        return (
                                            <th key={c.key}>
                                                <button
                                                    type="button"
                                                    className={`rp-filter-btn ${active ? "is-active" : ""}`}
                                                    onClick={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setOpenFilter((f) => (f?.key === c.key ? null : { key: c.key, rect }));
                                                    }}
                                                    disabled={!rows.length}
                                                    aria-label={`Filter ${c.label}`}
                                                >
                                                    <span>{active ? `${active.size} selected` : "All"}</span>
                                                    <span aria-hidden="true">▾</span>
                                                </button>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {loading &&
                                    Array.from({ length: 12 }).map((_, i) => (
                                        <tr key={i}>
                                            <td><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                            {cols.map((c, j) => (
                                                <td key={c.key} className={c.num ? "ta-right" : ""}>
                                                    <span className="sk sk-cell" style={{ width: ["70%", "55%", "65%", "80%"][j % 4] }} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}

                                {!loading && data && visible.length === 0 && (
                                    <tr><td colSpan={cols.length + 1} className="empty">No records for this period.</td></tr>
                                )}

                                {!loading &&
                                    visible.map((r, i) => (
                                        <tr key={r.id}>
                                            <td className="rp-num-col muted">{i + 1}</td>
                                            {cols.map((c) => (
                                                <td key={c.key} className={c.num ? "ta-right mono" : c.center ? "ta-center" : ""}>{cellText(c, r)}</td>
                                            ))}
                                        </tr>
                                    ))}
                            </tbody>
                            {!loading && visible.length > 0 && (
                                <tfoot>
                                    <tr>
                                        <td />
                                        {cols.map((c) => (
                                            <td key={c.key} className={c.total ? "ta-right mono strong" : ""}>{c.total ? n2(totals[c.key]) : ""}</td>
                                        ))}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    {openFilter && (
                        <ColumnFilter
                            col={cols.find((c) => c.key === openFilter.key)}
                            rect={openFilter.rect}
                            rows={rows}
                            selected={colFilters[openFilter.key]}
                            onClose={() => setOpenFilter(null)}
                            onApply={(set) => {
                                setColFilters((f) => {
                                    const next = { ...f };
                                    if (set) next[openFilter.key] = set;
                                    else delete next[openFilter.key];
                                    return next;
                                });
                                setOpenFilter(null);
                            }}
                        />
                    )}
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
                    <iframe className="rp-pdf" src={pdf.url} title={pdf.name} />
                </Modal>
            )}
        </section>
    );
}

/* =========================================================
   Excel-style checkbox filter for one column
   ========================================================= */
function ColumnFilter({ col, rect, rows, selected, onClose, onApply }) {
    const ref = useRef(null);
    const values = useMemo(
        () => [...new Set(rows.map((r) => cellText(col, r)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        [rows, col]
    );
    const [checked, setChecked] = useState(() => new Set(selected || values));
    const [term, setTerm] = useState("");

    useEffect(() => {
        const down = (e) => !ref.current?.contains(e.target) && onClose();
        const key = (e) => e.key === "Escape" && onClose();
        const t = setTimeout(() => document.addEventListener("mousedown", down), 0);
        document.addEventListener("keydown", key);
        return () => {
            clearTimeout(t);
            document.removeEventListener("mousedown", down);
            document.removeEventListener("keydown", key);
        };
    }, [onClose]);

    const shownValues = values.filter((v) => v.toLowerCase().includes(term.toLowerCase()));
    const toggle = (v) => setChecked((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
    const setAll = (on) => setChecked((s) => { const n = new Set(s); shownValues.forEach((v) => (on ? n.add(v) : n.delete(v))); return n; });

    const left = Math.min(rect.left, window.innerWidth - 270);

    return (
        <div ref={ref} className="rp-filter-panel" style={{ top: rect.bottom + 4, left }} role="dialog" aria-label={`Filter ${col.label}`}>
            <input className="input rp-filter-search" placeholder="Search..." value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
            <div className="rp-filter-actions">
                <button type="button" onClick={() => setAll(true)}>Select All</button>
                <button type="button" onClick={() => setAll(false)}>Clear</button>
            </div>
            <div className="rp-filter-list">
                {shownValues.map((v) => (
                    <label key={v} className="check">
                        <input type="checkbox" checked={checked.has(v)} onChange={() => toggle(v)} />
                        <span>{v === "" ? "(Blank)" : v}</span>
                    </label>
                ))}
                {shownValues.length === 0 && <div className="muted small">No matches</div>}
            </div>
            <div className="rp-filter-foot">
                <button type="button" className="btn btn-sm" onClick={() => onApply(null)}>Clear</button>
                <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => onApply(checked.size === values.length ? null : checked)}
                    disabled={checked.size === 0}
                >
                    Apply
                </button>
            </div>
        </div>
    );
}