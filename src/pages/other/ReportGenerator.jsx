// Other Reports → Report Generator
// Reports, Journal & e-Sub-Report in one ZIP of Excel files – made ONE report at a time,
// with a progress bar per report (short requests: no server timeout on big clients / quarters)
import { useEffect, useMemo, useRef, useState } from "react";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { apiFetch, apiBlob } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import "./ReportGenerator.css";

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
    { key: "SalesJournal", label: "Sales Journal", group: "Journal" },
    { key: "PurchaseJournal", label: "Purchase Journal", group: "Journal" },
    { key: "ExpenseJournal", label: "Expense Journal", group: "Journal" },
    { key: "GeneralLedger", label: "General Ledger", group: "Journal" },
];
const GROUPS = ["e-Sub-Report", "Reports", "Journal"];
const FILTERS = [["DM", "Declared month"], ["DT", "Transaction date"], ["DE", "Date entry"]];

// status of one report while generating
const S = { wait: "wait", run: "run", done: "done", empty: "empty", fail: "fail" };

function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportGenerator() {
    const notify = useToast();
    const { from: pFrom, to: pTo } = usePeriod();

    const [clients, setClients] = useState([]);
    const [clientNum, setClientNum] = useState("");
    const [branch, setBranch] = useState("all");
    const [type, setType] = useState("DM");
    const [from, setFrom] = useState(pFrom.slice(0, 7));
    const [to, setTo] = useState(pTo.slice(0, 7));
    const [dFrom, setDFrom] = useState(pFrom);
    const [dTo, setDTo] = useState(pTo);
    const [picked, setPicked] = useState(REPORTS.map((r) => r.key));
    const [openList, setOpenList] = useState(false);
    const [error, setError] = useState("");

    const [run, setRun] = useState(null);        // { items: [{key,label,status,rows,ms,error}], zipping, done, file }
    const stop = useRef(false);

    useEffect(() => {
        apiFetch("/report-generator/clients").then((c) => setClients(c || [])).catch((e) => setError(e.message || "Couldn't load the clients."));
    }, []);
    useEffect(() => { setFrom(pFrom.slice(0, 7)); setTo(pTo.slice(0, 7)); setDFrom(pFrom); setDTo(pTo); }, [pFrom, pTo]);

    const client = clients.find((c) => c.client_num === clientNum);
    const clientOpts = useMemo(() => [{ value: "", label: "— Select client —" },
    ...clients.map((c) => ({ value: c.client_num, label: c.person ? `${c.name} — ${c.person}` : c.name }))], [clients]);
    const branchOpts = useMemo(() => [{ value: "all", label: "All branches" },
    ...(client?.branches || []).map((b) => ({ value: String(b.id), label: `${b.label}${b.main ? " (MAIN)" : ""}` }))], [client]);

    const busy = !!run && !run.done;
    const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : REPORTS.map((r) => r.key).filter((x) => x === k || p.includes(x))));
    const setGroup = (g, on) => setPicked((p) => {
        const keys = REPORTS.filter((r) => r.group === g).map((r) => r.key);
        const set = new Set(p);
        keys.forEach((k) => (on ? set.add(k) : set.delete(k)));
        return REPORTS.map((r) => r.key).filter((k) => set.has(k));
    });
    const patch = (key, v) => setRun((r) => r && { ...r, items: r.items.map((it) => (it.key === key ? { ...it, ...v } : it)) });

    const generate = async () => {
        setError("");
        if (!clientNum) return setError("Select a client.");
        if (!picked.length) return setError("Tick at least one report.");
        const f = type === "DM" ? from : dFrom;
        const t = type === "DM" ? to : dTo;
        if (!f || !t) return setError("Choose both dates.");

        stop.current = false;
        const items = REPORTS.filter((r) => picked.includes(r.key)).map((r) => ({ key: r.key, label: r.label, status: S.wait }));
        setRun({ items, zipping: false, done: false });

        let token = null;
        let zipName = "Reports.zip";
        let made = 0;
        for (const it of items) {
            if (stop.current) { patch(it.key, { status: S.fail, error: "Stopped" }); continue; }
            patch(it.key, { status: S.run, started: Date.now() });
            const t0 = Date.now();
            try {
                const r = await apiFetch("/report-generator/part", {
                    method: "POST",
                    body: JSON.stringify({ client_num: clientNum, branch, filter_type: type, from: f, to: t, report: it.key, ...(token ? { token } : {}) }),
                });
                token = r.token;
                zipName = r.zip_name || zipName;
                if (r.file) made += 1;
                patch(it.key, { status: r.file ? S.done : S.empty, rows: r.rows || 0, ms: Date.now() - t0 });
            } catch (e) {
                patch(it.key, { status: S.fail, error: e.message || "Failed", ms: Date.now() - t0 });
            }
        }

        if (!made || !token) {
            setRun((r) => r && { ...r, done: true });
            return setError(stop.current ? "Stopped." : "No report had data for this period – nothing to download.");
        }
        setRun((r) => r && { ...r, zipping: true });
        try {
            const blob = await apiBlob(`/report-generator/zip?${new URLSearchParams({ token, name: zipName })}`);
            saveBlob(blob, zipName);
            notify(`Downloaded ${zipName}`);
            setRun((r) => r && { ...r, zipping: false, done: true, file: zipName });
        } catch (e) {
            setRun((r) => r && { ...r, zipping: false, done: true });
            setError(e.message || "Couldn't make the ZIP.");
        }
    };

    const items = run?.items || [];
    const finished = items.filter((i) => [S.done, S.empty, S.fail].includes(i.status)).length;
    const pct = items.length ? Math.round((finished / items.length) * 100) : 0;
    const failed = items.filter((i) => i.status === S.fail).length;

    return (
        <div className="rgx">
            <section className="card rgx-card">
                <div className="rgx-ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="26" height="26"><path d="M7 8V4h10v4M6 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-2M7 14h10v6H7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                </div>
                <h2>Report Generator</h2>
                <p className="rgx-sub">Reports, Journal &amp; e-Sub-Report in one ZIP of Excel files</p>

                <fieldset className="rgx-form" disabled={busy}>
                    <label className="rgx-field">
                        <span>Client name</span>
                        <SearchSelect value={clientNum} onChange={(v) => { setClientNum(v); setBranch("all"); }} options={clientOpts} searchPlaceholder="Search client…" aria-label="Client" />
                    </label>
                    <label className="rgx-field">
                        <span>Branch</span>
                        <SearchSelect value={branch} onChange={setBranch} options={branchOpts} aria-label="Branch" />
                    </label>
                    <div className="rgx-field">
                        <span>Filter type</span>
                        <div className="rgx-seg" role="radiogroup" aria-label="Filter type">
                            {FILTERS.map(([v, l]) => (
                                <button key={v} type="button" role="radio" aria-checked={type === v} className={type === v ? "is-on" : ""} onClick={() => setType(v)}>{l}</button>
                            ))}
                        </div>
                    </div>
                    <div className="rgx-two">
                        <label className="rgx-field">
                            <span>From</span>
                            {type === "DM"
                                ? <input type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
                                : <input type="date" className="input" value={dFrom} onChange={(e) => setDFrom(e.target.value)} />}
                        </label>
                        <label className="rgx-field">
                            <span>To</span>
                            {type === "DM"
                                ? <input type="month" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
                                : <input type="date" className="input" value={dTo} onChange={(e) => setDTo(e.target.value)} />}
                        </label>
                    </div>

                    <div className={`rgx-list${openList ? " is-open" : ""}`}>
                        <button type="button" className="rgx-list-head" onClick={() => setOpenList((o) => !o)} aria-expanded={openList}>
                            <b>Reports included</b>
                            <span className="rgx-count">{picked.length} of {REPORTS.length}</span>
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                        </button>
                        {openList && (
                            <div className="rgx-groups">
                                {GROUPS.map((g) => {
                                    const keys = REPORTS.filter((r) => r.group === g);
                                    const on = keys.filter((r) => picked.includes(r.key)).length;
                                    return (
                                        <div key={g} className="rgx-group">
                                            <label className="rgx-check rgx-check-head">
                                                <input type="checkbox" checked={on === keys.length} ref={(el) => el && (el.indeterminate = on > 0 && on < keys.length)}
                                                    onChange={(e) => setGroup(g, e.target.checked)} />
                                                <b>{g}</b><span className="rgx-muted">{on}/{keys.length}</span>
                                            </label>
                                            {keys.map((r) => (
                                                <label key={r.key} className="rgx-check">
                                                    <input type="checkbox" checked={picked.includes(r.key)} onChange={() => toggle(r.key)} />
                                                    <span>{r.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </fieldset>

                {error && <div className="alert-error rgx-error" role="alert">{error}</div>}

                {/* ---------- progress: one bar per report ---------- */}
                {run && (
                    <div className="rgx-prog" aria-live="polite">
                        <div className="rgx-prog-top">
                            <b>{run.zipping ? "Making the ZIP…" : run.done ? (run.file ? "Done" : "Finished") : `Generating ${Math.min(finished + 1, items.length)} of ${items.length}…`}</b>
                            <span>{pct}%{failed ? ` · ${failed} failed` : ""}</span>
                        </div>
                        <div className="rgx-bar"><i style={{ width: `${run.zipping || run.done ? 100 : pct}%` }} className={run.done && failed ? "is-warn" : ""} /></div>
                        <ul className="rgx-items">
                            {items.map((it) => (
                                <li key={it.key} className={`is-${it.status}`}>
                                    <span className="rgx-dot" aria-hidden="true">
                                        {it.status === S.done ? "✓" : it.status === S.fail ? "!" : it.status === S.empty ? "–" : ""}
                                    </span>
                                    <span className="rgx-name">{it.label}</span>
                                    <span className="rgx-mini"><i /></span>
                                    <span className="rgx-note">
                                        {it.status === S.wait && "Waiting"}
                                        {it.status === S.run && "Generating…"}
                                        {it.status === S.done && `${it.rows} line${it.rows === 1 ? "" : "s"} · ${(it.ms / 1000).toFixed(1)}s`}
                                        {it.status === S.empty && "No data – left out"}
                                        {it.status === S.fail && <span title={it.error}>{it.error}</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {run.file && <p className="rgx-file">Downloaded <b>{run.file}</b></p>}
                    </div>
                )}

                <div className="rgx-actions">
                    {busy && !run.zipping && <button type="button" className="btn" onClick={() => { stop.current = true; }}>Stop</button>}
                    <button type="button" className="btn btn-primary rgx-go" onClick={generate} disabled={busy}>
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 8V4h10v4M6 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-2M7 14h10v6H7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                        {busy ? (run.zipping ? "Making the ZIP…" : "Generating…") : "Generate reports"}
                    </button>
                </div>
            </section>
        </div>
    );
}