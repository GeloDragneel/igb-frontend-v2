// Administration → Database (old pages/Administration/Database)
// Database backups + Sales / Purchases / Expenses files on S3 · Backup Database with supervisor override
import { useCallback, useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiFetch, apiBlob } from "../../context/AuthContext";
import "./DatabaseSettings.css";

const TABS = [
    { key: "db", label: "Database" },
    { key: "sales", label: "Sales" },
    { key: "purchases", label: "Purchases" },
    { key: "expenses", label: "Expenses" },
];

export default function DatabaseSettings() {
    const notify = useToast();
    const [tab, setTab] = useState("db");
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [per, setPer] = useState(15);
    const [res, setRes] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [downloading, setDownloading] = useState("");
    const [override, setOverride] = useState(false);

    // search after typing stops
    useEffect(() => {
        const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [q]);

    const load = useCallback(async (fresh = false) => {
        setLoading(true);
        setError("");
        try {
            const qs = new URLSearchParams({ tab, q: query, page, per, ...(fresh ? { fresh: 1 } : {}) });
            setRes(await apiFetch(`/admin/database/files?${qs}`));
        } catch (e) {
            setError(e.message || "Couldn't load the files.");
            setRes(null);
        } finally {
            setLoading(false);
        }
    }, [tab, query, page, per]);
    useEffect(() => { load(); }, [load]);

    const switchTab = (k) => { setTab(k); setPage(1); setQ(""); setQuery(""); setRes(null); };

    const download = async (name) => {
        setDownloading(name);
        try {
            const blob = await apiBlob(`/admin/database/files/download?${new URLSearchParams({ tab, name })}`);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            notify(e.message || "Couldn't download the file.", "error");
        } finally {
            setDownloading("");
        }
    };

    const rows = res?.data || [];
    const last = res?.last_page || 1;

    return (
        <div className="dbs">
            <section className="card dbs-bar">
                <div className="dbs-tabs" role="tablist">
                    {TABS.map((t) => (
                        <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "is-on" : ""} onClick={() => switchTab(t.key)}>
                            {t.label}
                        </button>
                    ))}
                </div>
                <input className="input dbs-search" placeholder="Search file name..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search file name" />
                <div className="dbs-actions">
                    <button className="btn" onClick={() => load(true)} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
                    {tab === "db" && <button className="btn btn-primary" onClick={() => setOverride(true)}>Backup database</button>}
                </div>
            </section>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={() => load(true)}>Try again</button></div>}

            <section className="card dbs-body">
                <div className="dbs-scroll">
                    <table className="dbs-table">
                        <thead>
                            <tr><th>File name</th><th className="n">File size</th><th>Date created</th><th className="c">Action</th></tr>
                        </thead>
                        <tbody>
                            {loading && !rows.length && <tr><td colSpan={4} className="dbs-empty">Loading…</td></tr>}
                            {!loading && !rows.length && <tr><td colSpan={4} className="dbs-empty">{query ? `No file matches “${query}”.` : "No files yet."}</td></tr>}
                            {rows.map((r) => (
                                <tr key={r.name}>
                                    <td className="dbs-name" title={r.name}>{r.name}</td>
                                    <td className="n">{r.size}</td>
                                    <td>{r.modified}</td>
                                    <td className="c">
                                        <button className="btn btn-sm btn-info" onClick={() => download(r.name)} disabled={!!downloading}>
                                            {downloading === r.name ? "Downloading…" : "Download"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="dbs-pager">
                    <span className="dbs-muted">
                        {res?.total ? `Showing ${(res.page - 1) * res.per + 1}–${Math.min(res.page * res.per, res.total)} of ${res.total}` : "0 files"}
                    </span>
                    <div className="dbs-pager-nav">
                        <label className="dbs-per">Results
                            <select className="input" value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(1); }}>
                                {[15, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <button className="dbs-pg" onClick={() => setPage(1)} disabled={page <= 1}>«</button>
                        <button className="dbs-pg" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>‹</button>
                        <span className="dbs-muted">Page {res?.page || page} of {last}</span>
                        <button className="dbs-pg" onClick={() => setPage((p) => p + 1)} disabled={page >= last}>›</button>
                        <button className="dbs-pg" onClick={() => setPage(last)} disabled={page >= last}>»</button>
                    </div>
                </div>
            </section>

            {override && (
                <OverrideModal onClose={() => setOverride(false)}
                    onDone={(m) => { setOverride(false); notify(m); if (tab === "db") load(true); }} />
            )}
        </div>
    );
}

/* ---------- supervisor override → backup (old modal_Supervisor_Override) ---------- */
function OverrideModal({ onClose, onDone }) {
    const notify = useToast();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!username.trim()) return notify("Username is required", "error");
        if (!password) return notify("Password is required", "error");
        setBusy(true);
        try {
            const r = await apiFetch("/admin/database/backup", { method: "POST", body: JSON.stringify({ username: username.trim(), password }) });
            onDone(r.message || "Database successfully backup");
        } catch (err) {
            notify(err.message || "Something went wrong. Please try again.", "error");
            setBusy(false);
        }
    };

    return (
        <Modal title="Supervisor override" onClose={busy ? () => { } : onClose} size="sm"
            footer={<>
                <button className="btn btn-dark" onClick={onClose} disabled={busy}>Close</button>
                <button className="btn btn-primary" type="submit" form="dbs-override" disabled={busy}>{busy ? "Processing…" : "Submit"}</button>
            </>}>
            <form id="dbs-override" className="dbs-form" onSubmit={submit}>
                <label><span className="field-label">Username</span>
                    <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoFocus disabled={busy} />
                </label>
                <label><span className="field-label">Password</span>
                    <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" disabled={busy} />
                </label>
                {busy && <p className="dbs-muted">Backing up the database and uploading to S3. This can take a few minutes…</p>}
            </form>
        </Modal>
    );
}