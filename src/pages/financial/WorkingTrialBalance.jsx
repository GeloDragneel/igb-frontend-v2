import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../../components/Modal";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import "./WorkingTrialBalance.css";

const SECTION_ORDER = ["ASSET", "LIABILITIES", "OWNERS EQUITY", "REVENUE", "COS", "EXPENSES", "OTHER INCOME", "OTHER EXPENSE", "OTHER"];

// 1,234.56 · (1,234.56) · "-" for zero (old wtbFmt)
const fmt = (n) => {
    if (n === null || n === undefined || Math.abs(n) < 0.005) return "-";
    const v = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? `(${v})` : v;
};
const toInput = (n) => (n ? Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const parse = (s) => parseFloat(String(s).replace(/,/g, "")) || 0;

// all computed columns for one row
const calc = (r) => {
    const endD = r.beg_debit + r.data_debit;
    const endC = r.beg_credit + r.data_credit;
    const fendD = endD + r.adj_debit;
    const fendC = endC + r.adj_credit;
    const fclose = fendD - fendC;
    return {
        endD, endC, close: endD - endC, fendD, fendC, fclose,
        is: r.statement === "IS" ? Math.abs(fclose) : null,
        bs: r.statement === "BS" ? Math.abs(fclose) : null,
    };
};

/* =========================================================
   Financial Reports → Working Trial Balance
   ========================================================= */
export default function WorkingTrialBalance() {
    const { user } = useAuth();
    const { to: pTo } = usePeriod();
    const notify = useToast();
    const navigate = useNavigate();

    const thisYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => String(thisYear - i));

    const [year, setYear] = useState(pTo.slice(0, 4) || String(thisYear));
    const [branch, setBranch] = useState("current");
    const [data, setData] = useState(null);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [usedBranch, setUsedBranch] = useState("current");
    const [menu, setMenu] = useState(false);          // Print ▾ (Download XLSX / Download PDF)
    const [printing, setPrinting] = useState(false);
    const [pdf, setPdf] = useState(null);             // { url, name } for the preview
    const menuRef = useRef(null);
    const pending = useRef(new Set());                // cell saves still on their way (Print waits for them)

    const search = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await apiFetch(`/reports/working-trial-balance?${new URLSearchParams({ year, branch })}`);
            setData(res);
            setRows(res.rows || []);
            setUsedBranch(branch);
        } catch (e) {
            setError(e.message || "Couldn't load the working trial balance.");
        } finally {
            setLoading(false);
        }
    }, [year, branch]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { search(); }, [user?.id, user?.caid]);

    // autosave one editable cell
    const save = async (code, field, text) => {
        const value = parse(text);
        const before = rows.find((r) => r.account_code === code)?.[field] ?? 0;
        if (Math.abs(value - before) < 0.005) return;

        setRows((list) => list.map((r) => (r.account_code === code ? { ...r, [field]: value } : r)));
        const req = apiFetch("/reports/working-trial-balance", {
            method: "POST",
            body: JSON.stringify({ year: String(data?.year || year), account_code: code, field, value }),
        });
        pending.current.add(req);
        try {
            await req;
        } catch (e) {
            setRows((list) => list.map((r) => (r.account_code === code ? { ...r, [field]: before } : r)));
            notify(e.message || "Couldn't save. Try again.", "error");
        } finally {
            pending.current.delete(req);
        }
    };

    const shownYear = data?.year || year;

    const { sections, T } = useMemo(() => {
        const by = {};
        rows.forEach((r) => (by[r.section] = by[r.section] || []).push(r));
        const T = { begD: 0, begC: 0, dataD: 0, dataC: 0, endD: 0, endC: 0, adjD: 0, adjC: 0, fendD: 0, fendC: 0, isNet: 0, isSum: 0, bsSum: 0 };
        rows.forEach((r) => {
            const c = calc(r);
            T.begD += r.beg_debit; T.begC += r.beg_credit;
            T.dataD += r.data_debit; T.dataC += r.data_credit;
            T.endD += c.endD; T.endC += c.endC;
            T.adjD += r.adj_debit; T.adjC += r.adj_credit;
            T.fendD += c.fendD; T.fendC += c.fendC;
            if (r.statement === "IS") { T.isNet += -c.fclose; T.isSum += c.is; }
            else T.bsSum += c.bs;
        });
        return { sections: SECTION_ORDER.filter((s) => by[s]?.length).map((s) => [s, by[s]]), T };
    }, [rows]);

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

    // Print ▾: Download XLSX / Download PDF (preview) — the year and branch on screen, typed cells are already saved
    const print = async (format) => {
        setMenu(false);
        setPrinting(true);
        try {
            await Promise.allSettled([...pending.current]);           // print what was just typed too
            const blob = await apiBlob(`/print/working-trial-balance?${new URLSearchParams({ year: String(shownYear), branch: usedBranch, format })}`);
            const name = `WorkingTrialBalance-${user?.username || user?.id || ""}.${format}`;
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
            notify(e.message || "Couldn't print the working trial balance.", "error");
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

    // ADJUSTING ENTRIES come from General Journal → Adjusting Entry: click a figure to see the entries behind it
    const gjLink = (code) => navigate(`/task/general-journal?${new URLSearchParams({
        type: "ADJUSTING", from: `${shownYear}-01`, to: `${shownYear}-12`, ...(code ? { account: code } : {}),
    })}`);
    const Adj = ({ r, field }) => (r[field] ? (
        <button type="button" className="wtb-adj-link" onClick={() => gjLink(r.account_code)}
            title={`Open the adjusting entries of ${r.account_name} (${r.adj_count || 0} entr${r.adj_count === 1 ? "y" : "ies"})`}>
            {fmt(r[field])}
        </button>
    ) : "-");

    const Edit = ({ r, field }) => (
        <input
            key={`${r.account_code}-${field}-${r[field]}`}
            type="text"
            inputMode="decimal"
            className="wtb-input"
            defaultValue={toInput(r[field])}
            aria-label={`${r.account_name} ${field.replace("_", " ")}`}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => save(r.account_code, field, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
        />
    );

    return (
        <section className="card jr-card">
            <header className="jr-head">
                <h2>{data?.company?.trade_name || " "}</h2>
                <div className="jr-title">Working Trial Balance</div>
                <div>Year {shownYear}</div>
            </header>

            <div className="jr-filters no-print">
                <div className="field bs-year">
                    <span className="field-label">Year</span>
                    <SearchSelect value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y }))} aria-label="Year" />
                </div>
                {branchOpts.length > 1 && (
                    <div className="field jr-branch">
                        <span className="field-label">Branch</span>
                        <SearchSelect value={branch} onChange={setBranch} options={branchOpts} aria-label="Branch" />
                    </div>
                )}
                <div className="jr-btns">
                    <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
                    <div className="wtbp-print" ref={menuRef}>
                        <button className="btn" onClick={() => setMenu((m) => !m)} disabled={loading || printing || !rows.length}
                            aria-haspopup="menu" aria-expanded={menu}>
                            {printing ? "Printing…" : "Print ▾"}
                        </button>
                        {menu && (
                            <ul className="wtbp-print-menu" role="menu">
                                <li><button type="button" role="menuitem" onClick={() => print("xlsx")}>Download XLSX</button></li>
                                <li><button type="button" role="menuitem" onClick={() => print("pdf")}>Download PDF</button></li>
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}

            <div className="wtb-scroll">
                <table className="wtb-table">
                    <thead>
                        <tr>
                            <th className="wtb-acct" rowSpan={3}>ACCOUNT TITLES</th>
                            <th colSpan={14}>{shownYear}</th>
                        </tr>
                        <tr>
                            <th colSpan={2}>BEG. BALANCES</th>
                            <th colSpan={2}>DATA-{shownYear}</th>
                            <th colSpan={2}>END. BALANCES</th>
                            <th rowSpan={2}>CLOSING BALANCE<br />DEBIT (CREDIT)</th>
                            <th colSpan={2}>
                                <button type="button" className="wtb-adj-head" onClick={() => gjLink("")} title="Open General Journal → Adjusting Entry">
                                    ADJUSTING ENTRIES ↗
                                </button>
                            </th>
                            <th colSpan={2}>FINAL END. BALANCES</th>
                            <th rowSpan={2}>FINAL CLOSING<br />DEBIT (CREDIT)</th>
                            <th rowSpan={2}>INCOME<br />STATEMENT</th>
                            <th rowSpan={2}>BALANCE<br />SHEET</th>
                        </tr>
                        <tr>
                            {Array.from({ length: 5 }).flatMap((_, i) => [<th key={`d${i}`}>DEBIT</th>, <th key={`c${i}`}>CREDIT</th>])}
                        </tr>
                    </thead>

                    <tbody>
                        {loading && <tr><td colSpan={15} className="wtb-msg">Loading…</td></tr>}
                        {!loading && data && rows.length === 0 && <tr><td colSpan={15} className="wtb-msg">No accounts found for {shownYear}.</td></tr>}

                        {!loading &&
                            sections.map(([sec, list]) => [
                                <tr key={sec} className="wtb-section"><td className="wtb-acct" colSpan={15}>{sec}</td></tr>,
                                ...list.map((r) => {
                                    const c = calc(r);
                                    return (
                                        <tr key={r.account_code}>
                                            <td className="wtb-acct wtb-name" title={r.account_code}>{r.account_name}</td>
                                            <td className="wtb-edit"><Edit r={r} field="beg_debit" /></td>
                                            <td className="wtb-edit"><Edit r={r} field="beg_credit" /></td>
                                            <td>{fmt(r.data_debit)}</td>
                                            <td>{fmt(r.data_credit)}</td>
                                            <td>{fmt(c.endD)}</td>
                                            <td>{fmt(c.endC)}</td>
                                            <td>{fmt(c.close)}</td>
                                            <td><Adj r={r} field="adj_debit" /></td>
                                            <td><Adj r={r} field="adj_credit" /></td>
                                            <td>{fmt(c.fendD)}</td>
                                            <td>{fmt(c.fendC)}</td>
                                            <td>{fmt(c.fclose)}</td>
                                            <td>{c.is === null ? "-" : fmt(c.is)}</td>
                                            <td>{c.bs === null ? "-" : fmt(c.bs)}</td>
                                        </tr>
                                    );
                                }),
                            ])}
                    </tbody>

                    {!loading && rows.length > 0 && (
                        <tfoot>
                            <tr className="wtb-total">
                                <td className="wtb-acct">TOTAL</td>
                                <td>{fmt(T.begD)}</td><td>{fmt(T.begC)}</td>
                                <td>{fmt(T.dataD)}</td><td>{fmt(T.dataC)}</td>
                                <td>{fmt(T.endD)}</td><td>{fmt(T.endC)}</td>
                                <td>{fmt(T.endD - T.endC)}</td>
                                <td>{fmt(T.adjD)}</td><td>{fmt(T.adjC)}</td>
                                <td>{fmt(T.fendD)}</td><td>{fmt(T.fendC)}</td>
                                <td>{fmt(T.fendD - T.fendC)}</td>
                                <td>{fmt(T.isSum)}</td>
                                <td>{fmt(T.bsSum)}</td>
                            </tr>
                            <tr className="wtb-net">
                                <td className="wtb-acct">Net Income / (Loss)</td>
                                <td colSpan={12} />
                                <td>{fmt(T.isNet)}</td>
                                <td>{fmt(-T.isNet)}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {pdf && (
                <Modal
                    title="Working Trial Balance - Print Preview"
                    onClose={() => setPdf(null)}
                    size="xxlg"
                    footer={
                        <>
                            <button className="btn" onClick={() => setPdf(null)}>Close</button>
                            <button className="btn btn-primary" onClick={savePdf}>Download PDF</button>
                        </>
                    }
                >
                    <iframe className="wtbp-pdf" src={pdf.url} title={pdf.name} />
                </Modal>
            )}
        </section>
    );
}