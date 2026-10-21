import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SearchCard from "../../../components/SearchCard";
import DataTable from "../../../components/DataTable";
import Badge from "../../../components/Badge";
import Modal from "../../../components/Modal";
import Icon from "../../../components/Icons";
import { useToast } from "../../../components/Toast";
import { PURCHASE_TABS } from "../../../components/routesMeta";
import { useAuth, apiFetch, apiBlob } from "../../../context/AuthContext";

const TABLE_HEIGHT = "calc(100vh - 375px)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// search + status filter kept per browser tab: survive refresh (F5), going back to the list and switching tabs
const KEY = "purchases-scanned";
const readKept = (k) => { try { return sessionStorage.getItem(`${KEY}.${k}`) || ""; } catch { return ""; } };
const keep = (k, v) => { try { v ? sessionStorage.setItem(`${KEY}.${k}`, v) : sessionStorage.removeItem(`${KEY}.${k}`); } catch { /* ignore */ } };

// last loaded rows per account, kept while the app is open → coming back shows the table at once
const rowsCache = new Map();

// receipts read ahead in the background (id → request), so Scan opens the invoice at once
const preRead = new Map();
const readScan = (id) => {
    if (!preRead.has(id)) {
        const p = apiFetch(`/purchases/scanned/${id}/read`, { method: "POST" });
        preRead.set(id, p);
        p.catch(() => preRead.delete(id));            // failed → try again on click
    }
    return preRead.get(id);
};

const STATUS = {
    0: { label: "Pending", tone: "orange" },
    1: { label: "Confirmed", tone: "green" },
};

// "2026-05-05 11:28:00" -> "May 05 2026 11:28AM"
const fmtDateTime = (v) => {
    if (!v) return "—";
    const [d, t = "00:00"] = String(v).split(" ");
    const [y, m, day] = d.split("-").map(Number);
    let [h, min] = t.split(":").map(Number);
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${MONTHS[m - 1]} ${String(day).padStart(2, "0")} ${y} ${h}:${String(min).padStart(2, "0")}${ap}`;
};

export default function ScannedReceipts() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const notify = useToast();

    const cacheKey = `${user?.id}:${user?.caid}`;
    const [rows, setRows] = useState(() => rowsCache.get(cacheKey) || []);
    const [loading, setLoading] = useState(true);
    // "Loading…" only until the first data has been shown
    const [loadedOnce, setLoadedOnce] = useState(() => rowsCache.has(cacheKey));
    const [error, setError] = useState("");
    const [query, setQueryState] = useState(() => readKept("search"));
    const [status, setStatusState] = useState(() => readKept("status"));
    const setQuery = useCallback((v) => setQueryState((cur) => {
        const next = typeof v === "function" ? v(cur) : v;
        keep("search", next);
        return next;
    }), []);
    const setStatus = (v) => { keep("status", v); setStatusState(v); };
    const [preview, setPreview] = useState(null);
    const [scanningId, setScanningId] = useState(null);

    const reqId = useRef(0);
    const load = useCallback(async () => {
        const id = ++reqId.current;
        if (rowsCache.has(cacheKey)) setRows(rowsCache.get(cacheKey));
        setLoading(true);
        setError("");
        try {
            const data = await apiFetch("/purchases/scanned");
            if (id !== reqId.current) return;
            rowsCache.set(cacheKey, data);
            setRows(data);
        } catch (e) {
            if (id !== reqId.current) return;
            setError(e.message || "Couldn't load scanned receipts.");
            if (!rowsCache.has(cacheKey)) setRows([]);   // keep what's on screen if we had it
        } finally {
            if (id === reqId.current) {
                setLoading(false);
                setLoadedOnce(true);
            }
        }
    }, [cacheKey]);

    useEffect(() => { load(); }, [load, user?.id, user?.caid]);

    // read the newest pending receipts ahead (one at a time, max 5); the server keeps the result
    useEffect(() => {
        let stop = false;
        const todo = rows.filter((r) => !r.reference_no && Number(r.trans_status) === 0 && !preRead.has(r.id)).slice(0, 5);
        (async () => {
            for (const r of todo) {
                if (stop) return;
                try { await readScan(r.id); } catch { /* clicked Scan will show the error */ }
            }
        })();
        return () => { stop = true; };
    }, [rows]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter(
            (r) =>
                (status === "" || String(r.trans_status) === status) &&
                (!q || [r.filename, r.reference_no, STATUS[r.trans_status]?.label].join(" ").toLowerCase().includes(q))
        );
    }, [rows, query, status]);

    const openInvoice = (invoiceNo) =>
        navigate(`/task/purchases/${encodeURIComponent(invoiceNo)}`, { state: { from: location.pathname, fromScan: true } });

    // Scan: read the receipt, then open a new invoice filled with what was found
    const scan = async (r) => {
        if (r.reference_no) return openInvoice(r.reference_no);
        setScanningId(r.id);
        try {
            const res = await readScan(r.id);          // already read in the background → instant
            if (res.reference_no) return openInvoice(res.reference_no);
            navigate("/task/purchases/new", { state: { from: location.pathname, scan: res } });
        } catch (e) {
            notify(e.message || "Scanning failed.", "error");
        } finally {
            setScanningId(null);
        }
    };

    const columns = [
        {
            key: "scan",
            label: "",
            render: (r) =>
                r.reference_no ? (
                    <button
                        type="button"
                        className="ticket-icon open-icon tip-right"
                        onClick={() => scan(r)}
                        data-tip={`Open ${r.reference_no}`}
                        aria-label={`Open invoice ${r.reference_no}`}
                    >
                        <OpenIcon />
                    </button>
                ) : (
                    <button
                        type="button"
                        className="ticket-icon scan-icon tip-right"
                        onClick={() => scan(r)}
                        disabled={scanningId !== null}
                        data-tip={scanningId === r.id ? "Scanning…" : "Scan receipt"}
                        aria-label={`Scan ${r.filename}`}
                    >
                        {scanningId === r.id ? <span className="scan-spin" /> : <ScanIcon />}
                    </button>
                ),
        },
        {
            key: "filename",
            label: "Filename",
            render: (r) => (
                <div className="inv-no-cell">
                    <button
                        type="button"
                        className="ticket-icon scan-icon"
                        onClick={() => setPreview(r)}
                        data-tip="View file"
                        aria-label={`View ${r.filename}`}
                    >
                        <Icon name="fileText" size={14} />
                    </button>
                    <span className="mono">{r.filename}</span>
                </div>
            ),
        },
        {
            key: "trans_status",
            label: "Status",
            value: (r) => STATUS[r.trans_status]?.label || "",
            render: (r) => {
                const s = STATUS[r.trans_status] || { label: "Unknown", tone: "gray" };
                return <Badge tone={s.tone}>{s.label}</Badge>;
            },
        },
        { key: "reference_no", label: "Invoice No", render: (r) => <span className="mono">{r.reference_no || "—"}</span> },
        { key: "date_added", label: "Date Added", render: (r) => fmtDateTime(r.date_added) },
        { key: "date_updated", label: "Date Updated", render: (r) => fmtDateTime(r.date_updated) },
    ];

    const rowActions = (r) => [
        { label: r.reference_no ? "Open invoice" : "Scan", onClick: () => scan(r) },
        { label: "View file", onClick: () => setPreview(r) },
    ];

    const actions = [
        { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
    ];

    return (
        <>
            <SearchCard
                query={query}
                setQuery={setQuery}
                placeholder="Search filename or invoice no..."
                navTabs={PURCHASE_TABS}
                actions={actions}
                extra={
                    <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                        <option value="">All statuses</option>
                        {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                    </select>
                }
                sticky
            />

            {error && (
                <div className="alert-error" role="alert">
                    {error} <button className="btn btn-sm" onClick={load}>Try again</button>
                </div>
            )}
            <div className="scanned-table">
                <DataTable
                    bodyHeight={TABLE_HEIGHT}
                    columns={columns}
                    rows={loading && !loadedOnce ? [] : filtered}
                    rowKey="id"
                    exportName="purchases-scanned-receipts"
                    showToolbar={false}
                    emptyText={loading && !loadedOnce ? "Loading…" : "No scanned receipts."}
                    stateKey={KEY}
                    resetKey={`${query}|${status}`}
                    onRowClick={(r) => (r.reference_no ? openInvoice(r.reference_no) : setPreview(r))}
                    rowActions={rowActions}
                />
            </div>
            {preview && <ScanPreview row={preview} onClose={() => setPreview(null)} />}
        </>
    );
}

/* ---------- File preview (PDF / image) ---------- */
function ScanPreview({ row, onClose }) {
    const [url, setUrl] = useState("");
    const [type, setType] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let objectUrl = "";
        let alive = true;
        apiBlob(`/purchases/scanned/${row.id}/file`)
            .then((blob) => {
                if (!alive) return;
                objectUrl = URL.createObjectURL(blob);
                setType(blob.type || "");
                setUrl(objectUrl);
            })
            .catch((e) => alive && setError(e.message || "Couldn't load the file."));
        return () => {
            alive = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [row.id]);

    const isImage = type.startsWith("image/");

    return (
        <Modal
            title={row.filename}
            onClose={onClose}
            size="lg"
            footer={
                <>
                    {url && <a className="btn" href={url} download={row.filename}>Download</a>}
                    {url && <a className="btn" href={url} target="_blank" rel="noopener noreferrer">Open in new tab</a>}
                    <button className="btn btn-primary" onClick={onClose}>Close</button>
                </>
            }
        >
            {error ? (
                <div className="alert-error" role="alert">{error}</div>
            ) : !url ? (
                <span className="sk" style={{ display: "block", height: "70vh", borderRadius: 12 }} />
            ) : isImage ? (
                <img src={url} alt={row.filename} style={{ maxWidth: "100%", display: "block", margin: "0 auto" }} />
            ) : (
                <iframe src={url} title={row.filename} style={{ width: "100%", height: "70vh", border: 0 }} />
            )}
        </Modal>
    );
}
/* ---------- icons ---------- */
function ScanIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
    );
}

function OpenIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
    );
}