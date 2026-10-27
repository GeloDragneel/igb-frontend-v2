import { useCallback, useEffect, useRef, useState } from "react";
import SearchSelect from "../../components/SearchSelect";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { useLookups } from "../../context/LookupsContext";
import "./TrialBalance.css";

const FILTERS = [
    { value: "DM", label: "Declared Month" },
    { value: "DR", label: "Date Range" },
];
const n4 = (v) => (Number(v) ? Number(v).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "");
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* =========================================================
   Financial Reports → Trial Balance
   ========================================================= */
export default function TrialBalance() {
    const { user } = useAuth();
    const notify = useToast();
    const { from: pFrom, to: pTo } = usePeriod();
    const { lookups } = useLookups();

    const [filterType, setFilterType] = useState("DM");
    const [from, setFrom] = useState(pFrom.slice(0, 7));
    const [to, setTo] = useState(pTo.slice(0, 7));
    const [accountCode, setAccountCode] = useState("");
    const [branch, setBranch] = useState("current");

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [shown, setShown] = useState({ from: pFrom.slice(0, 7), to: pTo.slice(0, 7), type: "DM", account: "", branch: "current" });
    const [menu, setMenu] = useState(false);          // Print ▾ (Download XLSX / Download PDF)
    const [printing, setPrinting] = useState(false);
    const [pdf, setPdf] = useState(null);             // { url, name } for the preview
    const menuRef = useRef(null);
    const [view, setView] = useState(null); // account row for the popup
    const [offOpen, setOffOpen] = useState(false); // documents whose debit ≠ credit

    const changeType = (t) => {
        setFilterType(t);
        if (t === "DM") { setFrom(pFrom.slice(0, 7)); setTo(pTo.slice(0, 7)); }
        else { setFrom(pFrom); setTo(pTo); }
    };

    const search = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const qs = new URLSearchParams({ filter_type: filterType, from, to: to || from, account_code: accountCode, branch });
            setData(await apiFetch(`/reports/trial-balance?${qs}`));
            setShown({ from, to: to || from, type: filterType, account: accountCode, branch });
        } catch (e) {
            setError(e.message || "Couldn't load the trial balance.");
        } finally {
            setLoading(false);
        }
    }, [filterType, from, to, accountCode, branch]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { search(); }, [user?.id, user?.caid]);

    const rows = data?.rows || [];
    const total = rows.reduce(
        (t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit, balance: t.balance + r.balance }),
        { debit: 0, credit: 0, balance: 0 }
    );
    const off = Math.round((total.debit - total.credit) * 100) / 100;          // ≠ 0 → not balanced
    const unbalanced = data?.unbalanced || [];

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

    // old Print ▾: Download XLSX (TrialBalance.xlsx) / Download PDF (preview) — same filters as the rows on screen
    const print = async (format) => {
        setMenu(false);
        setPrinting(true);
        try {
            const qs = new URLSearchParams({ filter_type: shown.type, from: shown.from, to: shown.to, account_code: shown.account, branch: shown.branch, format });
            const blob = await apiBlob(`/print/trial-balance?${qs}`);
            const name = `TrialBalance-${user?.username || user?.id || ""}.${format}`;
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
            notify(e.message || "Couldn't print the trial balance.", "error");
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
            <header className="jr-head">
                <h2>{data?.company?.trade_name || " "}</h2>
                <div className="jr-title">General Ledger Trial Balance</div>
                <div>For the Period From {shown.from} to {shown.to}</div>
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
                    <div className="tbp-print" ref={menuRef}>
                        <button className="btn" onClick={() => setMenu((m) => !m)} disabled={loading || printing || !rows.length}
                            aria-haspopup="menu" aria-expanded={menu}>
                            {printing ? "Printing…" : "Print ▾"}
                        </button>
                        {menu && (
                            <ul className="tbp-print-menu" role="menu">
                                <li><button type="button" role="menuitem" onClick={() => print("xlsx")}>Download XLSX</button></li>
                                <li><button type="button" role="menuitem" onClick={() => print("pdf")}>Download PDF</button></li>
                            </ul>
                        )}
                    </div>
                </div>
            </div>
            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}
            <div className="tb-scroll">
                <table className="table tb-table">
                    <thead>
                        <tr>
                            <th className="tb-view no-print" />
                            <th>Account ID</th>
                            <th>Account Description</th>
                            <th className="ta-right">Debit Amount</th>
                            <th className="ta-right">Credit Amount</th>
                            <th className="ta-right">Balance</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading &&
                            Array.from({ length: 12 }).map((_, i) => (
                                <tr key={i}>
                                    {["40%", "60%", "80%", "60%", "60%", "60%"].map((w, c) => (
                                        <td key={c} className={c > 2 ? "ta-right" : ""}><span className="sk sk-cell" style={{ width: w }} /></td>
                                    ))}
                                </tr>
                            ))}
                        {!loading && data && rows.length === 0 && (
                            <tr><td colSpan={6} className="empty">No entries for this period.</td></tr>
                        )}
                        {!loading &&
                            rows.map((r) => (
                                <tr key={r.account_code}>
                                    <td className="tb-view no-print">
                                        <button type="button" className="gl-ref" onClick={() => setView(r)}>View</button>
                                    </td>
                                    <td className="mono">{r.account_code}</td>
                                    <td>{r.account_name}</td>
                                    <td className="ta-right mono">{n4(r.debit)}</td>
                                    <td className="ta-right mono">{n4(r.credit)}</td>
                                    <td className="ta-right mono">{n4(r.balance)}</td>
                                </tr>
                            ))}
                    </tbody>
                    {!loading && rows.length > 0 && (
                        <tfoot>
                            <tr>
                                <td className="no-print" />
                                <td />
                                <td className="strong">Total</td>
                                <td className="ta-right mono strong">{n4(total.debit) || "0.0000"}</td>
                                <td className="ta-right mono strong">{n4(total.credit) || "0.0000"}</td>
                                <td className="ta-right mono strong">{n4(total.balance) || "0.0000"}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
            {!loading && rows.length > 0 && Math.abs(off) >= 0.01 && (
                <div className="tb-off no-print" role="alert">
                    <span>
                        <b>Not balanced:</b> Debit is {off > 0 ? "more" : "less"} than Credit by <b className="mono">{n2(Math.abs(off))}</b>.
                        {unbalanced.length
                            ? ` ${unbalanced.length} document${unbalanced.length === 1 ? " has" : "s have"} a debit that isn't equal to the credit.`
                            : " Every document is balanced – the difference comes from an account filter."}
                    </span>
                    {unbalanced.length > 0 && <button type="button" className="btn btn-sm" onClick={() => setOffOpen(true)}>See documents</button>}
                </div>
            )}
            {offOpen && (
                <Modal title="Documents not balanced (Debit ≠ Credit)" onClose={() => setOffOpen(false)} size="xlg"
                    footer={<button className="btn" onClick={() => setOffOpen(false)}>Close</button>}>
                    <p className="muted small" style={{ marginTop: 0 }}>
                        Each document should post the same Debit and Credit. Open these and check their totals, lines, VAT and 2307 –
                        the differences add up to {n2(Math.abs(off))}.
                    </p>
                    <div className="table-scroll" style={{ maxHeight: "60vh" }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Date</th><th>Doc#</th><th>Reference</th><th>Customer / Vendor</th><th>Module</th>
                                    <th className="ta-right">Debit</th><th className="ta-right">Credit</th><th className="ta-right">Difference</th>
                                </tr>
                            </thead>
                            <tbody>
                                {unbalanced.map((d, i) => (
                                    <tr key={i}>
                                        <td>{d.date}</td><td>{d.document_no}</td><td className="mono">{d.reference}</td><td>{d.name}</td><td>{d.module}</td>
                                        <td className="ta-right mono">{n2(d.debit)}</td><td className="ta-right mono">{n2(d.credit)}</td>
                                        <td className="ta-right mono strong">{n2(d.difference)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={7} className="strong">Total difference</td>
                                    <td className="ta-right mono strong">{n2(unbalanced.reduce((n, d) => n + Number(d.difference || 0), 0))}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Modal>
            )}
            {view && (
                <Modal title={`Details : ${view.account_code} ${view.account_name}`} onClose={() => setView(null)} size="lg"
                    footer={<button className="btn" onClick={() => setView(null)}>Close</button>}>
                    <div className="table-scroll" style={{ maxHeight: "60vh" }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Doc#</th>
                                    <th>Customer / Vendor</th>
                                    <th>Module</th>
                                    <th className="ta-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {view.docs.length === 0 && <tr><td colSpan={6} className="empty">No documents.</td></tr>}
                                {view.docs.map((d, i) => (
                                    <tr key={i}>
                                        <td>{d.date}</td>
                                        <td>{d.document_no}</td>
                                        <td>{d.name}</td>
                                        <td>{d.module}</td>
                                        <td className="ta-right mono">{n2(d.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Modal>
            )}

            {pdf && (
                <Modal
                    title="Trial Balance - Print Preview"
                    onClose={() => setPdf(null)}
                    size="xxlg"
                    footer={
                        <>
                            <button className="btn" onClick={() => setPdf(null)}>Close</button>
                            <button className="btn btn-primary" onClick={savePdf}>Download PDF</button>
                        </>
                    }
                >
                    <iframe className="tbp-pdf" src={pdf.url} title={pdf.name} />
                </Modal>
            )}
        </section>
    );
}