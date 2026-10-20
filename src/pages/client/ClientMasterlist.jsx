// Client → Masterlist: every m_client and m_client_account.
// Clicking a client opens the Settings screens for that client; clicking an account opens the Settings account popup.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import { ClientPopup, AccountPopup, DeleteAccountPopup, AssignedClientPopup, isActive, isMain } from "./ClientPopups";
import "./ClientMasterlist.css";

const ENDPOINT = { clients: "/clients", accounts: "/client-accounts", assigned: "/client-accounts/assigned" };
const val = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

export default function ClientMasterlist() {
    const notify = useToast();
    const [meta, setMeta] = useState(null); // { lookups, has_rdo }
    const [tab, setTab] = useState("clients");
    const [rows, setRows] = useState([]); // the current page (clients or accounts)
    const [total, setTotal] = useState(0); // rows matching the filters
    const [counts, setCounts] = useState({ clients: 0, accounts: 0 });
    const [clientList, setClientList] = useState([]);  // client # + name for the client filter
    const [debounced, setDebounced] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [clientFilter, setClientFilter] = useState("");
    const [status, setStatus] = useState("all"); // all | active | inactive
    const [openClient, setOpenClient] = useState(undefined);   // client_num | null (new) | undefined (closed)
    const [openAccount, setOpenAccount] = useState(null);
    const [delAccount, setDelAccount] = useState(null);
    const [assignAcc, setAssignAcc] = useState(null); // account whose DA / Auditor is being edited
    const [staff, setStaff] = useState(null); // { da, auditors } for the assign popup
    const [pg, setPg] = useState({ key: "", n: 1 });
    const [perPage, setPerPage] = useState(15);

    // wait 300 ms after typing before searching
    useEffect(() => {
        const t = setTimeout(() => setDebounced(query.trim()), 300);
        return () => clearTimeout(t);
    }, [query]);

    // the page number belongs to the current tab + filters: any change → page 1 (in the same render, no extra request)
    const listKey = [tab, debounced, clientFilter, status, perPage].join("|");
    const page = pg.key === listKey ? pg.n : 1;
    const setPage = useCallback((n) => setPg({ key: listKey, n }), [listKey]);
    const reqId = useRef(0);

    // one page from the server (LIMIT / OFFSET)
    const load = useCallback(async () => {
        const id = ++reqId.current;                      // only the newest reply is used
        setLoading(true);
        setError("");
        try {
            const p = new URLSearchParams({ page: String(page), per_page: String(perPage) });
            if (debounced) p.set("q", debounced);
            if (tab !== "clients") {
                if (clientFilter) p.set("client_num", clientFilter);
                if (status !== "all") p.set("active", status);
            }
            const r = await apiFetch(`${ENDPOINT[tab]}?${p}`);
            if (id !== reqId.current) return;
            setRows(r.data || []);
            setTotal(r.total || 0);
            if (r.counts) setCounts(r.counts);
            if (r.page && r.page !== page) setPage(r.page);   // server clamps past the last page
        } catch (e) {
            if (id !== reqId.current) return;
            setError(e.message || "Couldn't load the masterlist.");
            setRows([]);
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    }, [tab, page, perPage, debounced, clientFilter, status, setPage]);

    useEffect(() => { load(); }, [load]);

    const loadClientList = useCallback(() => {
        apiFetch("/clients/options").then(setClientList).catch(() => { });
    }, []);

    useEffect(() => {
        apiFetch("/clients/lookups").then(setMeta).catch((e) => setError(e.message || "Couldn't load the lists."));
        loadClientList();
    }, [loadClientList]);

    const reload = () => { load(); loadClientList(); };

    // DA / Auditor lists: loaded once, the first time the assign popup opens
    const openAssign = (a) => {
        setAssignAcc(a);
        if (!staff) apiFetch("/client-accounts/assignees").then(setStaff).catch((e) => { setAssignAcc(null); notify(e.message || "Couldn't load the employees."); });
    };

    const clientOpts = useMemo(() => [{ value: "", label: "All clients" }, ...clientList.map((c) => ({
        value: String(c.client_num), label: [c.client_num, c.name].filter(Boolean).join(" - ") || "—",
    }))], [clientList]);

    const pages = Math.max(1, Math.ceil(total / perPage));
    const from = (page - 1) * perPage;
    const filtered = !!debounced || (tab !== "clients" && (!!clientFilter || status !== "all"));
    const q = debounced;

    const L = meta?.lookups || {};
    const hasRdo = !!meta?.has_rdo;

    return (
        <div className="cml">
            <section className="card cml-tabs" role="tablist" aria-label="Masterlist">
                {[["clients", "Clients", counts.clients], ["accounts", "Client accounts", counts.accounts], ["assigned", "Assigned clients", counts.accounts]].map(([k, l, n]) => (
                    <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => { if (tab !== k) { setRows([]); setTab(k); } }}>
                        {l} <span className="cml-count">{n}</span>
                    </button>
                ))}
            </section>

            <section className="card cml-bar">
                <label className="cml-field cml-grow">
                    <span className="field-label">Search</span>
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)}
                        placeholder={tab === "clients" ? "Client #, name, phone, email, status..." : tab === "assigned" ? "Client, trade name, branch code, DA, auditor..." : "Trade name, branch code, client, nature, TIN, RDO..."} />
                </label>
                {tab !== "clients" && (
                    <>
                        <div className="cml-field cml-md">
                            <span className="field-label">Client</span>
                            <SearchSelect value={clientFilter} onChange={setClientFilter} options={clientOpts} searchPlaceholder="Search client..." aria-label="Client filter" />
                        </div>
                        <label className="cml-field cml-sm">
                            <span className="field-label">Active</span>
                            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                                <option value="all">All</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </label>
                    </>
                )}
                <div className="cml-actions">
                    <button className="btn" onClick={reload} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
                    {tab === "clients" && <button className="btn btn-primary" disabled={!meta} onClick={() => setOpenClient(null)}>＋ Add client</button>}
                    {tab === "accounts" && (
                        <button className="btn btn-primary" disabled={!meta || !clientFilter} title={clientFilter ? "" : "Pick a client first"}
                            onClick={() => setOpenAccount({ client_num: clientFilter, client_name: clientOpts.find((o) => o.value === clientFilter)?.label })}>
                            ＋ Add account
                        </button>
                    )}
                </div>
            </section>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={reload}>Try again</button></div>}

            <section className="card cml-body">
                <div className="cml-scroll">
                    {tab === "clients" ? (
                        <table className="cml-table">
                            <thead>
                                <tr><th>Client #</th><th>Client name</th><th>Cellphone</th><th>Telephone</th><th>Email</th><th>Status</th><th className="n">Accounts</th></tr>
                            </thead>
                            <tbody>
                                {loading && <SkeletonRows cols={7} rows={Math.min(perPage, perPage)} />}
                                {!loading && rows.length === 0 && <tr><td colSpan={7} className="cml-empty">{q ? "Nothing matches the search." : "No clients yet."}</td></tr>}
                                {!loading && rows.map((c) => (
                                    <tr key={c.id ?? c.client_num} className="cml-row" tabIndex={0} onClick={() => setOpenClient(c.client_num)}
                                        onKeyDown={(e) => e.key === "Enter" && setOpenClient(c.client_num)}>
                                        <td className="mono">{c.client_num}</td>
                                        <td className="strong">{c.full_name || "—"}</td>
                                        <td>{val(c.phone_num)}</td>
                                        <td>{val(c.tell_num)}</td>
                                        <td>{val(c.email_address)}</td>
                                        <td>{c.status_label || "—"}</td>
                                        <td className="n">
                                            <button className="btn btn-sm" title="Show this client's accounts"
                                                onClick={(e) => { e.stopPropagation(); setRows([]); setTab("accounts"); setClientFilter(String(c.client_num)); setQuery(""); setDebounced(""); }}>
                                                {c.accounts}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : tab === "assigned" ? (
                        <table className="cml-table">
                            <thead>
                                <tr><th>Client account</th><th>Status</th><th>DA</th><th>Auditor</th><th className="c">Active</th><th /></tr>
                            </thead>
                            <tbody>
                                {loading && <SkeletonRows cols={6} rows={perPage} twoLine />}
                                {!loading && rows.length === 0 && <tr><td colSpan={6} className="cml-empty">{q || clientFilter || status !== "all" ? "Nothing matches the filters." : "No client accounts yet."}</td></tr>}
                                {!loading && rows.map((a) => (
                                    <tr key={a.id} className={`cml-row${isActive(a) ? "" : " is-off"}`} tabIndex={0} onClick={() => openAssign(a)}
                                        onKeyDown={(e) => e.key === "Enter" && openAssign(a)}>
                                        <td>
                                            <div className="cml-who">
                                                <span className="strong">{[a.client_num, a.client_name].filter(Boolean).join(" - ") || "—"}</span>
                                                <small>{[a.branch_type, a.branch_code, a.trade_name].filter(Boolean).join(" - ") || "—"}</small>
                                            </div>
                                        </td>
                                        <td>{a.status_label || "—"}</td>
                                        <td className={a.da_name ? "" : "cml-none"}>{a.da_name || "Not assigned"}</td>
                                        <td className={a.auditor_name ? "" : "cml-none"}>{a.auditor_name || "Not assigned"}</td>
                                        <td className="c"><span className={`tm-status ${isActive(a) ? "is-on" : ""}`}><span className="tm-dot" aria-hidden="true" />{isActive(a) ? "Yes" : "No"}</span></td>
                                        <td className="c" onClick={(e) => e.stopPropagation()}>
                                            <button className="btn btn-sm" onClick={() => openAssign(a)} aria-label={`Assign DA / Auditor for ${a.trade_name}`}>Assign</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <table className="cml-table">
                            <thead>
                                <tr><th>Client account</th><th>Nature of business</th><th>Tax reg.</th>{hasRdo && <th>RDO</th>}<th>Login</th><th>Status</th><th className="c">Active</th><th /></tr>
                            </thead>
                            <tbody>
                                {loading && <SkeletonRows cols={hasRdo ? 8 : 7} rows={Math.min(perPage, perPage)} twoLine />}
                                {!loading && rows.length === 0 && <tr><td colSpan={hasRdo ? 8 : 7} className="cml-empty">{q || clientFilter || status !== "all" ? "Nothing matches the filters." : "No client accounts yet."}</td></tr>}
                                {!loading && rows.map((a) => (
                                    <tr key={a.id} className={`cml-row${isActive(a) ? "" : " is-off"}`} tabIndex={0} onClick={() => setOpenAccount(a)}
                                        onKeyDown={(e) => e.key === "Enter" && setOpenAccount(a)}>
                                        <td>
                                            {/* Client Num - Client Name / Type - Branch - Trade name */}
                                            <div className="cml-who">
                                                <span className="strong">{[a.client_num, a.client_name].filter(Boolean).join(" - ") || "—"}</span>
                                                <small>
                                                    {[a.branch_type, a.branch_code, a.trade_name].filter(Boolean).join(" - ") || "—"}
                                                </small>
                                            </div>
                                        </td>
                                        <td>{a.nature_label || "—"}</td>
                                        <td>{a.tax_registration || "—"}</td>
                                        {hasRdo && <td className="mono">{a.rdo || "—"}</td>}
                                        <td className={`mono${a.login && a.login.is_active === false ? " cml-login-off" : ""}`}>{a.login?.username || "—"}</td>
                                        <td>{a.status_label || "—"}</td>
                                        <td className="c"><span className={`tm-status ${isActive(a) ? "is-on" : ""}`}><span className="tm-dot" aria-hidden="true" />{isActive(a) ? "Yes" : "No"}</span></td>
                                        <td className="c" onClick={(e) => e.stopPropagation()}>
                                            <button className="tm-icon tm-icon-danger" onClick={() => setDelAccount(a)} aria-label={`Delete ${a.trade_name}`} title="Delete">
                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <footer className="cml-foot">
                    {loading ? <span className="sk sk-cell cml-sk-foot" aria-label="Loading" /> : (
                        <span>
                            {total ? `${from + 1}–${Math.min(from + perPage, total)} of ${total}` : "0"} {tab === "clients" ? "client(s)" : "client account(s)"}
                            {filtered && ` (filtered from ${tab === "clients" ? counts.clients : counts.accounts})`}
                        </span>
                    )}
                    {tab !== "clients" && clientFilter && <button className="btn btn-sm" onClick={() => setClientFilter("")}>Show all clients</button>}
                    <Pager page={page} pages={pages} onPage={setPage} perPage={perPage} onPerPage={setPerPage} disabled={loading} />
                </footer>
            </section>

            {openClient !== undefined && meta && (
                <ClientPopup clientNum={openClient} L={L} hasRdo={hasRdo} onClose={() => setOpenClient(undefined)} onChanged={reload} />
            )}
            {openAccount && meta && (
                <AccountPopup account={openAccount} clientNum={openAccount.client_num} L={L} hasRdo={hasRdo} onClose={() => setOpenAccount(null)}
                    onSaved={(_, m) => { setOpenAccount(null); notify(m); reload(); }} />
            )}
            {assignAcc && (
                <AssignedClientPopup account={assignAcc} staff={staff} onClose={() => setAssignAcc(null)}
                    onSaved={(m) => { setAssignAcc(null); notify(m); load(); }} />
            )}
            {delAccount && (
                <DeleteAccountPopup account={delAccount} onClose={() => setDelAccount(null)}
                    onDeleted={(_, m) => { setDelAccount(null); notify(m); reload(); }} />
            )}
        </div>
    );
}

/* ---------- pagination ---------- */
function Pager({ page, pages, onPage, perPage, onPerPage, disabled }) {
    // 1 … 4 5 [6] 7 8 … 20
    const nums = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i);
        else if (nums[nums.length - 1] !== "…") nums.push("…");
    }
    return (
        <nav className="cml-pager" aria-label="Pagination">
            <label className="cml-per">
                Rows
                <select className="input" value={perPage} onChange={(e) => onPerPage(Number(e.target.value))} aria-label="Rows per page">
                    {[15, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
            </label>
            <button className="cml-pg" onClick={() => onPage(page - 1)} disabled={disabled || page <= 1} aria-label="Previous page">‹</button>
            {nums.map((n, i) => n === "…"
                ? <span key={`g${i}`} className="cml-pg-gap">…</span>
                : <button key={n} className={`cml-pg${n === page ? " is-on" : ""}`} disabled={disabled} onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}>{n}</button>)}
            <button className="cml-pg" onClick={() => onPage(page + 1)} disabled={disabled || page >= pages} aria-label="Next page">›</button>
        </nav>
    );
}

/* ---------- skeleton rows while a page loads (same sk / sk-cell shimmer as Settings) ---------- */
const SK_WIDTHS = [62, 88, 54, 70, 46, 80, 58, 66];
function SkeletonRows({ cols, rows, twoLine = false }) {
    return Array.from({ length: rows }).map((_, r) => (
        <tr key={`sk${r}`} className="cml-sk-row" aria-hidden="true">
            {Array.from({ length: cols }).map((__, c) => (
                <td key={c}>
                    <span className="sk sk-cell" style={{ width: `${SK_WIDTHS[(r + c) % SK_WIDTHS.length]}%` }} />
                    {twoLine && c === 0 && <span className="sk sk-cell cml-sk-sub" style={{ width: `${SK_WIDTHS[(r + 3) % SK_WIDTHS.length] - 10}%` }} />}
                </td>
            ))}
        </tr>
    ));
}