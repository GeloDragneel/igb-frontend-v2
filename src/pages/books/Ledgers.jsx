import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SearchSelect from "../../components/SearchSelect";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { useLookups } from "../../context/LookupsContext";
import "./Ledgers.css";

const TABS = [
    { key: "general", label: "General Ledger" },
    { key: "summary", label: "Summary Ledger" },
    { key: "customer", label: "Customer Ledger" },
    { key: "vendor", label: "Vendor Ledger" },
];

const FILTERS = [
    { value: "DM", label: "Declared Month" },
    { value: "DR", label: "Date Range" },
    { value: "DE", label: "Date of Entry" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// 1,234.56 (blank when 0)
const n2 = (v) => (Number(v) ? Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const n2z = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// balance = debit − credit: a debit balance as 1,234.56, a credit balance as (1,234.56)
const bal = (v) => { const n = Math.round((Number(v) || 0) * 100) / 100; return n < 0 ? `(${n2z(-n)})` : n2z(n); };

// rows (sorted by account) + beginning { code: { name, balance } } → [{ code, name, rows, debit, credit, begin }]
// accounts with a beginning balance but no entries in the period still get their own group
// balance = debit − credit (beginning, running balance per line, ending)
const groupByAccount = (rows, beginning) => {
    const map = new Map();
    (rows || []).forEach((r) => {
        let g = map.get(r.account_code);
        if (!g) {
            g = { code: r.account_code, name: r.account_name, rows: [], debit: 0, credit: 0, begin: 0 };
            map.set(r.account_code, g);
        }
        g.rows.push(r);
        g.debit += Number(r.debit) || 0;
        g.credit += Number(r.credit) || 0;
    });
    Object.entries(beginning || {}).forEach(([code, b]) => {
        const g = map.get(code) || { code, name: b.name, rows: [], debit: 0, credit: 0, begin: 0 };
        g.begin = Number(b.balance) || 0;
        map.set(code, g);
    });
    const list = [...map.values()].sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
    // running balance after each line (the server sends it too; computed here so the popup and print match)
    list.forEach((g) => {
        let run = g.begin;
        g.rows = g.rows.map((r) => {
            run += (Number(r.debit) || 0) - (Number(r.credit) || 0);
            return { ...r, run: Math.round(run * 100) / 100 };
        });
    });
    return list;
};
// Ending = Beginning + Debit − Credit
const endingOf = (g) => g.begin + g.debit - g.credit;
const begDebit = (g) => (g.begin > 0 ? g.begin : 0);
const begCredit = (g) => (g.begin < 0 ? -g.begin : 0);

/* shared dropdown options */
function useAccountOpts() {
    const { lookups } = useLookups();
    return [
        { value: "", label: "All" },
        ...(lookups?.accounts || [])
            .filter((a) => a.root_name && String(a.root_name) !== "0")
            .map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` })),
    ];
}
const branchOptsFrom = (data) => [
    { value: "current", label: "This branch" },
    ...(data?.branches?.length ? [{ value: "all", label: "All Branches" }] : []),
    ...(data?.branches || []).map((b) => ({ value: String(b.id), label: b.label })),
];

/* =========================================================
   Print ▾ (old: Download XLSX / Download PDF)
   rows on screen → POST /print/ledger → GET /print/ledger/{token}?format=
   ========================================================= */
const PRINT_FILE = { general: "GeneralLedger", customer: "CustomerLedger", vendor: "VendorLedger", summary: "SummaryLedger" };

function useLedgerPrint(title) {
    const { user } = useAuth();
    const notify = useToast();
    const [printing, setPrinting] = useState(false);
    const [pdf, setPdf] = useState(null);             // { url, name }

    useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

    const print = async (format, payload) => {
        setPrinting(true);
        try {
            const { token } = await apiFetch("/print/ledger", { method: "POST", body: JSON.stringify(payload) });
            const blob = await apiBlob(`/print/ledger/${token}?format=${format}`);
            const name = `${PRINT_FILE[payload.kind]}-${user?.username || user?.id || ""}.${format}`;
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
            notify(e.message || "Couldn't print the ledger.", "error");
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

    const preview = pdf && (
        <Modal
            title={`${title} - Print Preview`}
            onClose={() => setPdf(null)}
            size="xxlg"
            footer={
                <>
                    <button className="btn" onClick={() => setPdf(null)}>Close</button>
                    <button className="btn btn-primary" onClick={savePdf}>Download PDF</button>
                </>
            }
        >
            <iframe className="lg-pdf" src={pdf.url} title={pdf.name} />
        </Modal>
    );

    return { printing, print, preview };
}

// old Summary / Customer / Vendor Ledger: one Print button (XLSX)
function PrintButton({ disabled, printing, onPick }) {
    return (
        <button className="btn" onClick={() => onPick("xlsx")} disabled={disabled || printing}>
            {printing ? "Printing…" : "Print"}
        </button>
    );
}

function PrintMenu({ disabled, printing, onPick }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open]);

    const pick = (f) => { setOpen(false); onPick(f); };

    return (
        <div className="lg-print" ref={ref}>
            <button className="btn" onClick={() => setOpen((o) => !o)} disabled={disabled || printing} aria-haspopup="menu" aria-expanded={open}>
                {printing ? "Printing…" : "Print ▾"}
            </button>
            {open && (
                <ul className="lg-print-menu" role="menu">
                    <li><button type="button" role="menuitem" onClick={() => pick("xlsx")}>Download XLSX</button></li>
                    <li><button type="button" role="menuitem" onClick={() => pick("pdf")}>Download PDF</button></li>
                </ul>
            )}
        </div>
    );
}

/* =========================================================
   Books & Ledger → Ledgers
   ========================================================= */
export default function Ledgers() {
    const [tab, setTab] = useState("general");
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

            {tab === "general" && <LedgerPanel key="general" kind="general" />}
            {tab === "summary" && <SummaryLedger />}
            {tab === "customer" && <LedgerPanel key="customer" kind="customer" />}
            {tab === "vendor" && <LedgerPanel key="vendor" kind="vendor" />}
        </section>
    );
}

/* =========================================================
   General / Customer / Vendor Ledger (same screen, different filter)
   ========================================================= */
const LEDGERS = {
    general: { title: "General Ledger", endpoint: "/ledgers/general" },
    customer: { title: "Customer Ledger", endpoint: "/ledgers/customer", party: "Customer", param: "customer_id", list: "/contacts/customer" },
    vendor: { title: "Vendor Ledger", endpoint: "/ledgers/vendor", party: "Vendor", param: "vendor_id", list: "/contacts/vendor" },
};

function LedgerPanel({ kind }) {
    const cfg = LEDGERS[kind];
    const { user } = useAuth();
    const { from: pFrom, to: pTo } = usePeriod();
    const accountOpts = useAccountOpts();

    const [filterType, setFilterType] = useState("DM");
    const [from, setFrom] = useState(pFrom.slice(0, 7));
    const [to, setTo] = useState(pTo.slice(0, 7));
    const [accountCode, setAccountCode] = useState("");
    const [branch, setBranch] = useState("current");

    // customer / vendor list
    const [parties, setParties] = useState([]);
    const [partyId, setPartyId] = useState("");

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [shown, setShown] = useState({ type: "DM", from: pFrom.slice(0, 7), to: pTo.slice(0, 7), party: "", branch: "current" });
    const { printing, print, preview } = useLedgerPrint(cfg.title);

    useEffect(() => {
        if (!cfg.list) return;
        apiFetch(cfg.list)
            .then((list) => setParties(list.map((p) => ({ value: String(p.id), label: p.name }))))
            .catch(() => setParties([]));
    }, [cfg.list, user?.id, user?.caid]);

    const changeType = (t) => {
        setFilterType(t);
        if (t === "DM") { setFrom(pFrom.slice(0, 7)); setTo(pTo.slice(0, 7)); }
        if (t === "DR") { setFrom(pFrom); setTo(pTo); }
        if (t === "DE") { setFrom(new Date().toISOString().slice(0, 10)); setTo(""); }
    };

    const search = useCallback(async () => {
        if (cfg.party && !partyId) {
            setError(`Choose a ${cfg.party.toLowerCase()}.`);
            return;
        }
        setLoading(true);
        setError("");
        try {
            const params = { filter_type: filterType, from, to: to || from, branch };
            if (cfg.party) params[cfg.param] = partyId;
            else params.account_code = accountCode;

            setData(await apiFetch(`${cfg.endpoint}?${new URLSearchParams(params)}`));
            setShown({
                type: filterType,
                from,
                to: to || from,
                party: parties.find((p) => p.value === partyId)?.label || "",
                branch,
            });
        } catch (e) {
            setError(e.message || "Couldn't load the ledger.");
        } finally {
            setLoading(false);
        }
    }, [cfg, filterType, from, to, accountCode, branch, partyId, parties]);

    // General Ledger loads right away; Customer / Vendor wait for a choice (old behaviour)
    useEffect(() => {
        if (!cfg.party) search();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, user?.caid]);

    const groups = useMemo(() => groupByAccount(data?.rows, data?.beginning), [data]);
    const branchOpts = branchOptsFrom(data);

    const periodText = shown.type === "DE" ? shown.from : `${shown.from} to ${shown.to}`;

    // the table as on screen: beginning, entries, change, ending, gap (old: every <tr> of the ledger)
    const printLedger = (format) => {
        const num = (v) => (Number(v) ? Number(v) : "");
        const rows = [];
        groups.forEach((g) => {
            rows.push({ k: "begin", c: [g.code, g.name, shown.from, "", "", "Beginning Balance", num(begDebit(g)), num(begCredit(g)), g.begin || ""] });
            g.rows.forEach((r) => rows.push({ k: "row", c: [r.account_code, r.account_name, r.date, r.reference || r.ref_data || "", r.jrnl, r.description, num(r.debit), num(r.credit), r.run] }));
            rows.push({ k: "change", c: ["", "", "", "", "", "Current Period Change", g.debit, g.credit, g.debit - g.credit] });
            rows.push({ k: "ending", c: ["", "", "", "", "", "Ending Balance", "", "", endingOf(g)] });
            rows.push({ k: "gap", c: [] });
        });
        print(format, { kind, period: `For the Period From ${periodText}`, party: shown.party, branch: shown.branch, rows });
    };

    return (
        <>
            <header className="jr-head">
                <h2>{data?.company?.trade_name || " "}</h2>
                <div className="jr-title">{cfg.title}</div>
                {cfg.party && shown.party && <div>{cfg.party}: {shown.party}</div>}
                <div>For the Period From {periodText}</div>
            </header>

            <div className="jr-filters no-print">
                <div className="field">
                    <span className="field-label">Filter Type</span>
                    <SearchSelect value={filterType} onChange={changeType} options={FILTERS} aria-label="Filter Type" />
                </div>
                <label className="field">
                    <span className="field-label">{filterType === "DE" ? "Date of Entry" : "From"}</span>
                    <input type={filterType === "DM" ? "month" : "date"} className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                {filterType !== "DE" && (
                    <label className="field">
                        <span className="field-label">To</span>
                        <input type={filterType === "DM" ? "month" : "date"} className="input" value={to} onChange={(e) => setTo(e.target.value)} />
                    </label>
                )}

                {cfg.party ? (
                    <div className="field rp-account">
                        <span className="field-label">{cfg.party}</span>
                        <SearchSelect
                            value={partyId}
                            onChange={setPartyId}
                            options={[{ value: "", label: `— Choose ${cfg.party.toLowerCase()} —` }, ...parties]}
                            searchPlaceholder={`Search ${cfg.party.toLowerCase()}...`}
                            aria-label={cfg.party}
                        />
                    </div>
                ) : (
                    <>
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
                    </>
                )}

                <div className="jr-btns">
                    <button className="btn btn-primary" onClick={search} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
                    {kind === "general"
                        ? <PrintMenu disabled={loading || !groups.length} printing={printing} onPick={printLedger} />
                        : <PrintButton disabled={loading || !groups.length} printing={printing} onPick={printLedger} />}
                </div>
            </div>

            {error && <div className="alert-error" role="alert">{error}</div>}

            {cfg.party && !data && !loading ? (
                <div className="jr-soon">Choose a {cfg.party.toLowerCase()} and click <strong>Search</strong>.</div>
            ) : (
                <div className="rp-scroll">
                    <LedgerTable groups={groups} loading={loading} loaded={!!data} beginDate={shown.from} />
                </div>
            )}

            {preview}
        </>
    );
}

/* =========================================================
   Summary Ledger (per account × month)
   ========================================================= */
function SummaryLedger() {
    const { user } = useAuth();
    const { to: pTo } = usePeriod();
    const notify = useToast();
    const accountOpts = useAccountOpts();

    const thisYear = new Date().getFullYear();
    const years = Array.from({ length: 10 }, (_, i) => String(thisYear - i));

    const [year, setYear] = useState(pTo.slice(0, 4));
    const [accountCode, setAccountCode] = useState("");
    const [branch, setBranch] = useState("current");

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [detail, setDetail] = useState(null); // { code, name, month: 'YYYY-MM' }
    const [usedBranch, setUsedBranch] = useState("current");
    const { printing, print, preview } = useLedgerPrint("Summary Ledger");

    const search = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const qs = new URLSearchParams({ year, account_code: accountCode, branch });
            setData(await apiFetch(`/ledgers/summary?${qs}`));
            setUsedBranch(branch);
        } catch (e) {
            setError(e.message || "Couldn't load the summary ledger.");
        } finally {
            setLoading(false);
        }
    }, [year, accountCode, branch]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { search(); }, [user?.id, user?.caid]);

    const rows = data?.rows || [];
    const shownYear = data?.year || year;
    const branchOpts = branchOptsFrom(data);

    const openMonth = (r, m) => {
        if (String(r.account_code) === "0") return notify("No Account Settings", "error");
        setDetail({ code: r.account_code, name: r.account_name, month: `${shownYear}-${String(m).padStart(2, "0")}` });
    };

    const printSummary = (format) => {
        const num = (v) => (Number(v) ? Number(v) : "");
        print(format, {
            kind: "summary",
            period: `FOR THE PERIOD 01/01/${shownYear} - 12/31/${shownYear}`,      // old [m.Period]
            branch: usedBranch,
            rows: rows.map((r) => ({ k: "row", c: [r.account_name || `(${r.account_code})`, ...MONTHS.map((_, i) => num(r.months[i + 1])), num(r.total)] })),
        });
    };

    return (
        <>
            <header className="jr-head">
                <h2>{data?.company?.trade_name || " "}</h2>
                <div className="jr-title">Summary Ledger</div>
                <div>For the Period : 01/01/{shownYear} - 12/31/{shownYear}</div>
            </header>

            <div className="jr-filters no-print">
                <div className="field sl-year">
                    <span className="field-label">Year</span>
                    <SearchSelect value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y }))} aria-label="Year" />
                </div>
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
                    <PrintButton disabled={loading || !rows.length} printing={printing} onPick={printSummary} />
                </div>
            </div>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={search}>Try again</button></div>}

            <div className="rp-scroll">
                <table className="table sl-table">
                    <thead>
                        <tr>
                            <th className="sl-title">Account Title</th>
                            {MONTHS.map((m) => <th key={m} className="ta-right">{m}</th>)}
                            <th className="ta-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading &&
                            Array.from({ length: 12 }).map((_, i) => (
                                <tr key={i}>
                                    <td className="sl-title"><span className="sk sk-cell" style={{ width: "80%" }} /></td>
                                    {Array.from({ length: 13 }).map((__, c) => (
                                        <td key={c} className="ta-right"><span className="sk sk-cell" style={{ width: "60%" }} /></td>
                                    ))}
                                </tr>
                            ))}

                        {!loading && data && rows.length === 0 && (
                            <tr><td colSpan={14} className="empty">No entries for {shownYear}.</td></tr>
                        )}

                        {!loading &&
                            rows.map((r) => (
                                <tr key={r.account_code}>
                                    <td className="sl-title" title={`${r.account_code} - ${r.account_name}`}>
                                        {r.account_name || `(${r.account_code})`}
                                    </td>
                                    {MONTHS.map((m, i) => {
                                        const v = r.months[i + 1];
                                        return (
                                            <td key={m} className="ta-right mono">
                                                {Number(v) ? (
                                                    <button type="button" className="sl-cell" onClick={() => openMonth(r, i + 1)} title={`View ${m} ${shownYear}`}>
                                                        {n2(v)}
                                                    </button>
                                                ) : ""}
                                            </td>
                                        );
                                    })}
                                    <td className="ta-right mono strong">{n2(r.total)}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            {detail && <MonthDetail detail={detail} branch={branch} onClose={() => setDetail(null)} />}
            {preview}
        </>
    );
}

/* ---------- popup: General Ledger for one account + one declared month ---------- */
function MonthDetail({ detail, branch, onClose }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const qs = new URLSearchParams({
            filter_type: "DM",
            from: detail.month,
            to: detail.month,
            account_code: detail.code,
            branch,
        });
        apiFetch(`/ledgers/general?${qs}`)
            .then(setData)
            .catch((e) => setError(e.message || "Couldn't load the details."));
    }, [detail, branch]);

    const groups = useMemo(() => groupByAccount(data?.rows, data?.beginning), [data]);

    return (
        <Modal title={`Details · ${detail.code} - ${detail.name} · ${detail.month}`} onClose={onClose} size="xl"
            footer={<button className="btn" onClick={onClose}>Close</button>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="rp-scroll sl-detail">
                <LedgerTable groups={groups} loading={!data && !error} loaded={!!data} beginDate={detail.month} />
            </div>
        </Modal>
    );
}

/* =========================================================
   Ledger table (used by General Ledger and the Summary popup)
   ========================================================= */
function LedgerTable({ groups, loading, loaded, beginDate }) {
    const navigate = useNavigate();
    const location = useLocation();

    const openRef = (r) => {
        if (r.trans_type === "INV" || r.trans_type === "RV") {
            navigate(`/task/sales/${encodeURIComponent(r.ref_data)}`, { state: { from: location.pathname } });
        }
    };

    return (
        <table className="table gl-table">
            <thead>
                <tr>
                    <th>Account ID</th>
                    <th>Account Description</th>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Jrnl</th>
                    <th>Trans Description</th>
                    <th className="ta-right">Debit Amount</th>
                    <th className="ta-right">Credit Amount</th>
                    <th className="ta-right">Balance</th>
                </tr>
            </thead>
            <tbody>
                {loading &&
                    Array.from({ length: 12 }).map((_, i) => (
                        <tr key={i}>
                            {["50%", "75%", "55%", "60%", "40%", "80%", "60%", "60%", "60%"].map((w, c) => (
                                <td key={c} className={c > 5 ? "ta-right" : ""}><span className="sk sk-cell" style={{ width: w }} /></td>
                            ))}
                        </tr>
                    ))}

                {!loading && loaded && groups.length === 0 && (
                    <tr><td colSpan={9} className="empty">No entries for this period.</td></tr>
                )}

                {!loading && groups.map((g) => <GroupRows key={g.code} g={g} beginDate={beginDate} onOpen={openRef} />)}
            </tbody>
        </table>
    );
}

/* ---------- one account: beginning, entries, change, ending, gap ---------- */
function GroupRows({ g, beginDate, onOpen }) {
    const change = g.debit - g.credit;
    const ending = endingOf(g);         // Beginning + Debit − Credit

    return (
        <>
            <tr className="gl-begin">
                <td className="mono">{g.code}</td>
                <td>{g.name}</td>
                <td>{beginDate}</td>
                <td />
                <td />
                <td>Beginning Balance</td>
                <td className="ta-right mono">{n2(begDebit(g))}</td>
                <td className="ta-right mono">{n2(begCredit(g))}</td>
                <td className="ta-right mono">{bal(g.begin)}</td>
            </tr>

            {g.rows.map((r, i) => (
                <tr key={`${r.trans_type}-${r.id}-${i}`}>
                    <td className="mono">{r.account_code}</td>
                    <td>{r.account_name}</td>
                    <td>{r.date}</td>
                    <td>
                        {r.trans_type === "INV" || r.trans_type === "RV" ? (
                            <button type="button" className="gl-ref" onClick={() => onOpen(r)} title={`Open ${r.ref_data}`}>
                                {r.reference || r.ref_data}
                            </button>
                        ) : (
                            r.reference
                        )}
                    </td>
                    <td>{r.jrnl}</td>
                    <td><span className="gl-desc" title={r.description}>{r.description}</span></td>
                    <td className="ta-right mono">{n2(r.debit)}</td>
                    <td className="ta-right mono">{n2(r.credit)}</td>
                    <td className="ta-right mono gl-run">{bal(r.run)}</td>
                </tr>
            ))}

            <tr className="gl-change">
                <td colSpan={5} />
                <td>Current Period Change</td>
                <td className="ta-right mono">{n2z(g.debit)}</td>
                <td className="ta-right mono">{n2z(g.credit)}</td>
                <td className="ta-right mono">{bal(change)}</td>
            </tr>
            <tr className="gl-ending">
                <td colSpan={5} />
                <td><strong>Ending Balance</strong></td>
                <td />
                <td />
                <td className="ta-right mono"><strong>{bal(ending)}</strong></td>
            </tr>
            <tr className="gl-gap" aria-hidden="true"><td colSpan={9} /></tr>
        </>
    );
}