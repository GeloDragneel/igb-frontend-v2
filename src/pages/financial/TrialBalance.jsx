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

/* ---------- comparative: period vs period (month vs month · quarter vs quarter · year vs year) ---------- */
const COMPARE = [
    { value: "", label: "Detailed" },
    { value: "M", label: "Comparative · Monthly" },
    { value: "Q", label: "Comparative · Quarterly" },
    { value: "Y", label: "Comparative · Yearly" },
];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");
const periodLabel = (v, by) => (!v ? "" : by === "Y" ? v : by === "Q" ? `${v.slice(5)} ${v.slice(0, 4)}` : `${MON[Number(v.slice(5, 7)) - 1]} ${v.slice(0, 4)}`);
// first / last month of a period ("2026-10" · "2026-Q4" · "2026")
const periodMonths = (v, by) => {
    const y = v.slice(0, 4);
    if (by === "Y") return [`${y}-01`, `${y}-12`];
    if (by === "Q") { const q = Number(v.slice(6)); return [`${y}-${pad2(q * 3 - 2)}`, `${y}-${pad2(q * 3)}`]; }
    return [v, v];
};
const defaultPair = (by, ym) => {
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    if (by === "Y") return [String(y - 1), String(y)];
    if (by === "Q") { const q = Math.ceil(m / 3); return [q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`, `${y}-Q${q}`]; }
    return [m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`, ym];
};
const lastDay = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
const THIS_YEAR = new Date().getFullYear();
const YEAR_OPTS = Array.from({ length: 12 }, (_, i) => String(THIS_YEAR - i)).map((y) => ({ value: y, label: y }));

/* one period picker: month · quarter (Q + year) · year */
function PeriodPick({ by, value, onChange, label }) {
    if (by === "M") return <input type="month" className="input" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label={label} />;
    if (by === "Y") return <SearchSelect value={value} onChange={onChange} options={YEAR_OPTS} aria-label={label} />;
    const y = value.slice(0, 4);
    const q = value.slice(5);
    return (
        <div style={{ display: "flex", gap: 6 }}>
            <select className="input" value={q} onChange={(e) => onChange(`${y}-${e.target.value}`)} aria-label={`${label} quarter`} style={{ width: 80 }}>
                {["Q1", "Q2", "Q3", "Q4"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select className="input" value={y} onChange={(e) => onChange(`${e.target.value}-${q}`)} aria-label={`${label} year`} style={{ width: 96 }}>
                {YEAR_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    );
}

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
    const [compare, setCompare] = useState("");      // "" detailed · M · Q · Y
    const [cmpA, setCmpA] = useState("");
    const [cmpB, setCmpB] = useState("");
    const [cmp, setCmp] = useState(null);            // { by, a, b, rows: [{ account_code, account_name, A, B }] }
    const pickCompare = (v) => {
        setCompare(v);
        setCmp(null);
        if (!v) return;
        const [a, b] = defaultPair(v, pTo.slice(0, 7));
        setCmpA(a);
        setCmpB(b);
    };

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

    // fit the table to the screen so the Total row is always visible
    useEffect(() => {
        const fit = () => document.querySelectorAll(".tb-scroll").forEach((el) => {
            const top = el.getBoundingClientRect().top;
            el.style.maxHeight = `${Math.max(320, window.innerHeight - Math.max(top, 0) - 20)}px`;
        });
        fit();
        const t = setTimeout(fit, 50);
        window.addEventListener("resize", fit);
        window.addEventListener("scroll", fit, true);
        return () => {
            clearTimeout(t);
            window.removeEventListener("resize", fit);
            window.removeEventListener("scroll", fit, true);
        };
    });

    const changeType = (t) => {
        setFilterType(t);
        if (t === "DM") { setFrom(pFrom.slice(0, 7)); setTo(pTo.slice(0, 7)); }
        else { setFrom(pFrom); setTo(pTo); }
    };

    const search = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            if (compare && cmpA && cmpB) {
                // the trial balance of each period, then side by side per account
                const range = (v) => {
                    const [m1, m2] = periodMonths(v, compare);
                    return [m1, m2];
                };
                const get = (v) => {
                    const [f, t] = range(v);
                    return apiFetch(`/reports/trial-balance?${new URLSearchParams({ filter_type: "DM", from: f, to: t, account_code: accountCode, branch })}`);
                };
                const [ra, rb] = await Promise.all([get(cmpA), get(cmpB)]);
                const by = new Map();
                const zero = { debit: 0, credit: 0, balance: 0 };
                [["A", ra], ["B", rb]].forEach(([k, r]) => (r?.rows || []).forEach((x) => {
                    const row = by.get(x.account_code) || { account_code: x.account_code, account_name: x.account_name, A: zero, B: zero };
                    row[k] = { debit: Number(x.debit) || 0, credit: Number(x.credit) || 0, balance: Number(x.balance) || 0 };
                    by.set(x.account_code, row);
                }));
                setCmp({ by: compare, a: cmpA, b: cmpB, rows: [...by.values()].sort((x, y) => String(x.account_code).localeCompare(String(y.account_code), undefined, { numeric: true })) });
                setData(rb);                                   // company name / branches
                setShown({ from: range(cmpA)[0], to: range(cmpB)[1], type: "DM", account: accountCode, branch });
                return;
            }
            setCmp(null);
            const qs = new URLSearchParams({ filter_type: filterType, from, to: to || from, account_code: accountCode, branch });
            setData(await apiFetch(`/reports/trial-balance?${qs}`));
            setShown({ from, to: to || from, type: filterType, account: accountCode, branch });
        } catch (e) {
            setError(e.message || "Couldn't load the trial balance.");
        } finally {
            setLoading(false);
        }
    }, [filterType, from, to, accountCode, branch, compare, cmpA, cmpB]);

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
                <div>{cmp ? `${periodLabel(cmp.a, cmp.by)} vs ${periodLabel(cmp.b, cmp.by)}` : `For the Period From ${shown.from} to ${shown.to}`}</div>
            </header>

            <div className="jr-filters no-print">
                <div className="field">
                    <span className="field-label">View</span>
                    <SearchSelect value={compare} onChange={pickCompare} options={COMPARE} aria-label="View" />
                </div>
                {!compare && (
                    <div className="field">
                        <span className="field-label">Filter Type</span>
                        <SearchSelect value={filterType} onChange={changeType} options={FILTERS} aria-label="Filter Type" />
                    </div>
                )}
                {compare ? (
                    <>
                        <div className="field">
                            <span className="field-label">{compare === "M" ? "Month" : compare === "Q" ? "Quarter" : "Year"}</span>
                            <PeriodPick by={compare} value={cmpA} onChange={setCmpA} label="First period" />
                        </div>
                        <div className="field">
                            <span className="field-label">vs</span>
                            <PeriodPick by={compare} value={cmpB} onChange={setCmpB} label="Second period" />
                        </div>
                    </>
                ) : (
                    <>
                        <label className="field">
                            <span className="field-label">From</span>
                            <input type={filterType === "DM" ? "month" : "date"} className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                        </label>
                        <label className="field">
                            <span className="field-label">To</span>
                            <input type={filterType === "DM" ? "month" : "date"} className="input" value={to} onChange={(e) => setTo(e.target.value)} />
                        </label>
                    </>
                )}
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
                        <button className="btn" onClick={() => setMenu((m) => !m)} disabled={loading || printing || !rows.length || !!cmp}
                            title={cmp ? "Print is for the detailed trial balance" : undefined}
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

            {/* comparative: account × (period A · period B · change on the balance) */}
            {cmp && !loading && (() => {
                const A = periodLabel(cmp.a, cmp.by);
                const B = periodLabel(cmp.b, cmp.by);
                const sum = (p, k) => cmp.rows.reduce((n, r) => n + r[p][k], 0);
                return (
                    <div className="tb-scroll">
                        <table className="table tb-table">
                            <thead>
                                <tr>
                                    <th rowSpan={2}>Account ID</th>
                                    <th rowSpan={2}>Account Description</th>
                                    <th colSpan={3} className="ta-center">{A}</th>
                                    <th colSpan={3} className="ta-center">{B}</th>
                                    <th rowSpan={2} className="ta-right">Change<br /><small className="muted">balance {B} − {A}</small></th>
                                    <th rowSpan={2} className="ta-right">%</th>
                                </tr>
                                <tr>
                                    <th className="ta-right">Debit</th><th className="ta-right">Credit</th><th className="ta-right">Balance</th>
                                    <th className="ta-right">Debit</th><th className="ta-right">Credit</th><th className="ta-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!cmp.rows.length && <tr><td colSpan={10} className="empty">No entries for these periods.</td></tr>}
                                {cmp.rows.map((r) => {
                                    const ch = r.B.balance - r.A.balance;
                                    return (
                                        <tr key={r.account_code}>
                                            <td className="mono">{r.account_code}</td>
                                            <td>{r.account_name}</td>
                                            <td className="ta-right mono">{n4(r.A.debit)}</td>
                                            <td className="ta-right mono">{n4(r.A.credit)}</td>
                                            <td className="ta-right mono strong">{n4(r.A.balance)}</td>
                                            <td className="ta-right mono">{n4(r.B.debit)}</td>
                                            <td className="ta-right mono">{n4(r.B.credit)}</td>
                                            <td className="ta-right mono strong">{n4(r.B.balance)}</td>
                                            <td className="ta-right mono strong">{n4(ch) || "–"}</td>
                                            <td className="ta-right mono">{r.A.balance ? `${((ch / Math.abs(r.A.balance)) * 100).toFixed(1)}%` : "–"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {cmp.rows.length > 0 && (
                                <tfoot>
                                    <tr>
                                        <td />
                                        <td className="strong">Total</td>
                                        {["A", "B"].map((p) => ["debit", "credit", "balance"].map((k) => (
                                            <td key={p + k} className="ta-right mono strong">{n4(sum(p, k)) || "0.0000"}</td>
                                        )))}
                                        <td className="ta-right mono strong">{n4(sum("B", "balance") - sum("A", "balance")) || "0.0000"}</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                );
            })()}

            {!cmp && (<>
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
            </>)}
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