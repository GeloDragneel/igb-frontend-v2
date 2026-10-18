import { useEffect, useMemo, useState } from "react";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";

const REPORTS = [
    { key: "P", label: "Purchase Summary", group: "e-Sub-Report" },
    { key: "S", label: "Sales Summary", group: "e-Sub-Report" },
    { key: "1601EQ_IT", label: "1601EQ / Sales / IT", group: "e-Sub-Report" },
    { key: "1601EQ_VT", label: "1601EQ / Sales / VT", group: "e-Sub-Report" },
    { key: "1601EQ_PE", label: "1601EQ / Purchases & Expenses", group: "e-Sub-Report" },
    { key: "1604E", label: "1604E", group: "e-Sub-Report" },
    { key: "SalesReport", label: "Sales Report", group: "Reports" },
    { key: "PurchaseReport", label: "Purchase Report", group: "Reports" },
    { key: "ExpenseReport", label: "Expense Report", group: "Reports" },
    { key: "SalesJournal", label: "Sales Journal", group: "Journals" },
    { key: "PurchaseJournal", label: "Purchase Journal", group: "Journals" },
    { key: "ExpenseJournal", label: "Expense Journal", group: "Journals" },
    { key: "GeneralLedger", label: "General Ledger", group: "Ledger" },
];
const GROUPS = ["e-Sub-Report", "Reports", "Journals", "Ledger"];
const FILTERS = [["DM", "Declared month"], ["DT", "Transaction date"], ["DE", "Date entry"]];

// "Save As" window where supported, normal download otherwise
async function saveBlob(blob, filename) {
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: "ZIP file", accept: { "application/zip": [".zip"] } }],
            });
            const w = await handle.createWritable();
            await w.write(blob);
            await w.close();
            return { status: "saved", name: handle.name };
        } catch (e) {
            if (e.name === "AbortError") return { status: "cancelled" };
        }
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { status: "downloaded", name: filename };
}

/* =========================================================
   Report Generator – Reports, Journal & e-Sub-Report (ZIP of Excel files)
   ========================================================= */
export default function ReportGenerator() {
    const notify = useToast();
    const { from: pFrom, to: pTo } = usePeriod();

    const [clients, setClients] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [clientNum, setClientNum] = useState("");
    const [branch, setBranch] = useState("all");
    const [filter, setFilter] = useState("DM");
    const [from, setFrom] = useState(pFrom.slice(0, 7));
    const [to, setTo] = useState(pTo.slice(0, 7));
    const [picked, setPicked] = useState(() => Object.fromEntries(REPORTS.map((r) => [r.key, true])));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        apiFetch("/report-generator/clients")
            .then(setClients)
            .catch((e) => { setClients([]); setLoadError(e.message || "Couldn't load the client list."); });
    }, []);

    // dates follow the filter type (month vs day) and the Reporting Period
    useEffect(() => {
        if (filter === "DM") { setFrom(pFrom.slice(0, 7)); setTo(pTo.slice(0, 7)); }
        else { setFrom(pFrom); setTo(pTo); }
    }, [filter, pFrom, pTo]);

    const client = useMemo(() => clients?.find((c) => c.client_num === clientNum), [clients, clientNum]);
    const clientOpts = useMemo(() => (clients || []).map((c) => ({
        value: c.client_num,
        label: c.person && c.person !== c.name ? `${c.name} — ${c.person}` : c.name,
    })), [clients]);
    const branchOpts = [
        { value: "all", label: "All branches" },
        ...(client?.branches || []).map((b) => ({ value: String(b.id), label: `${b.main ? "MAIN · " : ""}${b.label}` })),
    ];

    const chosen = REPORTS.filter((r) => picked[r.key]).map((r) => r.key);
    const allOn = chosen.length === REPORTS.length;

    const generate = async () => {
        if (!clientNum) return setError("Please select a client.");
        if (!from || !to) return setError("Choose both dates.");
        if (!chosen.length) return setError("Tick at least one report.");
        setError("");
        setBusy(true);
        try {
            const params = new URLSearchParams({ client_num: clientNum, branch, filter_type: filter, from, to });
            if (!allOn) chosen.forEach((k) => params.append("reports[]", k));
            const blob = await apiBlob(`/report-generator/generate?${params}`);
            const safe = (client?.name || "Client").replace(/[^\w\- .()]+/g, "").trim() || "Client";
            const res = await saveBlob(blob, `${safe} (${from}).zip`);
            if (res.status === "saved") notify(`Saved ${res.name}`);
            else if (res.status === "downloaded") notify(`Downloaded ${res.name}`);
        } catch (e) {
            setError(e.message || "Couldn't generate the reports.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="rg-wrap">
            <div className="card rg-card">
                <div className="rg-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 2h6a1 1 0 0 1 1 1v3H8V3a1 1 0 0 1 1-1Z" />
                        <path d="M6 8h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2v2H8v-2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
                        <path d="M8 15h8M8 18h5" />
                    </svg>
                </div>
                <h2 className="rg-title">Report Generator</h2>
                <p className="rg-sub">Reports, Journal &amp; e-Sub-Report in one ZIP of Excel files</p>

                {loadError && <div className="alert-error" role="alert">{loadError}</div>}

                <div className="rg-field">
                    <span className="rg-label">Client name</span>
                    <SearchSelect
                        value={clientNum}
                        onChange={(v) => { setClientNum(v); setBranch("all"); setError(""); }}
                        options={clientOpts}
                        placeholder={clients ? "Select client…" : "Loading clients…"}
                        aria-label="Client name"
                    />
                </div>

                <div className="rg-field">
                    <span className="rg-label">Branch</span>
                    <SearchSelect value={branch} onChange={setBranch} options={branchOpts} disabled={!client} aria-label="Branch" />
                </div>

                <div className="rg-field">
                    <span className="rg-label">Filter type</span>
                    <div className="rg-seg" role="radiogroup" aria-label="Filter type">
                        {FILTERS.map(([v, l]) => (
                            <button key={v} type="button" role="radio" aria-checked={filter === v}
                                className={`rg-seg-btn ${filter === v ? "is-active" : ""}`} onClick={() => setFilter(v)}>
                                {l}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="rg-two">
                    <label className="rg-field">
                        <span className="rg-label">From</span>
                        <input type={filter === "DM" ? "month" : "date"} className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </label>
                    <label className="rg-field">
                        <span className="rg-label">To</span>
                        <input type={filter === "DM" ? "month" : "date"} className="input" value={to} onChange={(e) => setTo(e.target.value)} />
                    </label>
                </div>

                <details className="rg-reports">
                    <summary>
                        <span>Reports included</span>
                        <span className="rg-count">{chosen.length} of {REPORTS.length}</span>
                    </summary>
                    <label className="rg-check rg-all">
                        <input type="checkbox" checked={allOn}
                            onChange={(e) => setPicked(Object.fromEntries(REPORTS.map((r) => [r.key, e.target.checked])))} />
                        All reports
                    </label>
                    {GROUPS.map((g) => (
                        <div key={g} className="rg-group">
                            <div className="rg-group-name">{g}</div>
                            {REPORTS.filter((r) => r.group === g).map((r) => (
                                <label key={r.key} className="rg-check">
                                    <input type="checkbox" checked={!!picked[r.key]}
                                        onChange={(e) => setPicked((p) => ({ ...p, [r.key]: e.target.checked }))} />
                                    {r.label}
                                </label>
                            ))}
                        </div>
                    ))}
                </details>

                {error && <div className="alert-error" role="alert">{error}</div>}

                <button className="btn btn-primary rg-btn" onClick={generate} disabled={busy || !clients}>
                    {busy ? (
                        <><span className="rg-spin" aria-hidden="true" /> Generating {chosen.length} report{chosen.length === 1 ? "" : "s"}…</>
                    ) : (
                        <>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="6 9 6 2 18 2 18 9" />
                                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                                <rect x="6" y="14" width="12" height="8" />
                            </svg>
                            Generate reports
                        </>
                    )}
                </button>
                {filter === "DE" && <p className="rg-note">With Date entry, the journals cover the From day only, the same as the Journals page.</p>}
            </div>
        </section>
    );
}