// Billing → Send Requests
// every "Send via" made from a printed SOA: PENDING · REVISED · DECLINED · CONFIRMED
// supervisor: Confirm (email goes out) · Ask to revise · Decline     requester: Edit & resubmit
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob } from "../../context/AuthContext";
import { SendRequestModal, ChatSendPanel, Glyph, appOf } from "./SendRequestModal";

const TABLE_HEIGHT = "calc(100vh - 400px)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtWhen = (v) => {
    if (!v) return "—";
    const [d, t = ""] = String(v).split(/[ T]/);
    const [y, m, dd] = d.split("-").map(Number);
    return `${MONTHS[m - 1]} ${String(dd).padStart(2, "0")} ${y}${t ? ` ${t.slice(0, 5)}` : ""}`;
};
const STATUS = [
    ["", "All"],
    ["PENDING", "Pending"],
    ["REVISED", "Revised"],
    ["DECLINED", "Declined"],
    ["CONFIRMED", "Confirmed"],
];
const toneOf = (s) => ({ PENDING: "orange", REVISED: "blue", DECLINED: "red", CONFIRMED: "green" }[s] || "gray");
const Channels = ({ list }) => (
    <span style={{ display: "inline-flex", gap: 4 }}>
        {(list || []).map((k) => <span key={k} title={appOf(k).label}><Glyph app={appOf(k)} size={22} /></span>)}
    </span>
);

export default function SendRequests() {
    const { user } = useAuth();
    const [data, setData] = useState({ rows: [], counts: {}, can_approve: false, me: null });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("PENDING");
    const [openId, setOpenId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setData(await apiFetch("/send-requests"));
        } catch (e) {
            setError(e.message || "Couldn't load the send requests.");
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load, user?.id]);

    const counts = data.counts || {};
    const total = Object.values(counts).reduce((n, v) => n + Number(v || 0), 0);
    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (data.rows || [])
            .filter((r) => !status || r.status === status)
            .filter((r) => !q || [r.reference_no, r.party_name, r.client_num, r.label, r.requested_by_name, r.status].join(" ").toLowerCase().includes(q));
    }, [data.rows, status, query]);
    const current = (data.rows || []).find((r) => r.id === openId);

    const columns = [
        { key: "created_at", label: "Requested", render: (r) => fmtWhen(r.created_at) },
        { key: "reference_no", label: "SOA #", render: (r) => <span className="mono">{r.reference_no}</span> },
        { key: "label", label: "Document" },
        { key: "party_name", label: "Client", render: (r) => <span className="strong">{r.party_name || "—"}</span> },
        { key: "channels", label: "Send via", render: (r) => <Channels list={r.channels} /> },
        { key: "requested_by_name", label: "Requested by" },
        { key: "status", label: "Status", render: (r) => <Badge tone={toneOf(r.status)}>{r.status}</Badge> },
        { key: "remarks", label: "Remarks", render: (r) => <span className="muted small">{r.remarks || ""}</span> },
    ];

    return (
        <>
            <SearchCard query={query} setQuery={setQuery} placeholder="Search SOA #, client, document or requester..."
                actions={[{ label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading }]} sticky />

            {error && (
                <div className="alert-error" role="alert">
                    {error} <button className="btn btn-sm" onClick={load}>Try again</button>
                </div>
            )}

            <div role="tablist" aria-label="Status" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 0 10px" }}>
                {STATUS.map(([k, l]) => {
                    const n = k ? Number(counts[k] || 0) : total;
                    return (
                        <button key={k || "all"} type="button" role="tab" aria-selected={status === k}
                            className={`btn btn-sm${status === k ? " btn-primary" : ""}`} onClick={() => setStatus(k)}>
                            {l} <span style={{ opacity: 0.75, marginLeft: 4 }}>{n}</span>
                        </button>
                    );
                })}
            </div>

            <div className="sales-table">
                <DataTable
                    bodyHeight={TABLE_HEIGHT}
                    columns={columns}
                    rows={loading ? [] : rows}
                    rowKey="id"
                    exportName="send-requests"
                    showToolbar={false}
                    emptyText={loading ? "Loading…" : "No send requests."}
                    onRowClick={(r) => setOpenId(r.id)}
                    rowActions={(r) => [{ label: "Open", onClick: () => setOpenId(r.id) }]}
                />
            </div>

            {current && (
                <RequestModal req={current} canApprove={data.can_approve} me={data.me}
                    onClose={() => setOpenId(null)} onChanged={load} />
            )}
        </>
    );
}

/* ---------- one request: PDF + recipients + actions ---------- */
function RequestModal({ req, canApprove, me, onClose, onChanged }) {
    const notify = useToast();
    const [url, setUrl] = useState("");
    const [pdfError, setPdfError] = useState("");
    const [busy, setBusy] = useState(false);
    const [ask, setAsk] = useState(null);          // "decline" | "revise"
    const [edit, setEdit] = useState(false);

    useEffect(() => {
        let alive = true;
        let u = "";
        apiBlob(`/send-requests/${req.id}/pdf`)
            .then((b) => { if (!alive) return; u = URL.createObjectURL(b); setUrl(u); })
            .catch((e) => alive && setPdfError(e.message || "Couldn't load the PDF."));
        return () => { alive = false; if (u) URL.revokeObjectURL(u); };
    }, [req.id]);

    const mine = Number(req.requested_by) === Number(me);
    const open = req.status === "PENDING" || req.status === "REVISED";
    const canEdit = open && (mine || canApprove);

    const act = async (path, body) => {
        setBusy(true);
        try {
            const r = await apiFetch(`/send-requests/${req.id}/${path}`, { method: "POST", body: JSON.stringify(body || {}) });
            notify(r.message || "Saved.");
            setAsk(null);
            onChanged();
        } catch (e) {
            notify(e.message || "Couldn't save.", "error");
        } finally {
            setBusy(false);
        }
    };

    const Item = ({ label, children }) => (
        <div style={{ display: "grid", gap: 2 }}>
            <span className="muted small">{label}</span>
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>{children || "—"}</span>
        </div>
    );

    return (
        <>
            <Modal title={`Send request · ${req.reference_no}`} onClose={onClose} size="xlg"
                footer={<>
                    {canEdit && <button className="btn" style={{ marginRight: "auto" }} onClick={() => setEdit(true)} disabled={busy}>{req.status === "REVISED" ? "Edit & resubmit" : "Edit"}</button>}
                    <button className="btn" onClick={onClose} disabled={busy}>Close</button>
                    {canApprove && open && <button className="btn" onClick={() => setAsk("decline")} disabled={busy} style={{ color: "#ef4444" }}>Decline</button>}
                    {canApprove && req.status === "PENDING" && <button className="btn" onClick={() => setAsk("revise")} disabled={busy}>Ask to revise</button>}
                    {canApprove && req.status === "PENDING" && (
                        <button className="btn btn-primary" onClick={() => act("confirm")} disabled={busy}>{busy ? "Sending…" : "Confirm & send"}</button>
                    )}
                </>}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", gap: 16, alignItems: "start" }}>
                    {/* left: details */}
                    <div style={{ display: "grid", gap: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Badge tone={toneOf(req.status)}>{req.status}</Badge>
                            <span className="muted small">{req.label}</span>
                        </div>
                        {req.remarks && (
                            <div style={{
                                padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)",
                                background: req.status === "DECLINED" ? "rgba(239,68,68,.12)" : "rgba(37,99,235,.12)", color: "var(--ink)"
                            }}>
                                <div className="muted small">{req.status === "DECLINED" ? "Reason declined" : "Revise"} · {req.approved_by_name}</div>
                                {req.remarks}
                            </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 14, borderRadius: 12, background: "var(--card-2)", border: "1px solid var(--line)" }}>
                            <Item label="Client">{req.party_name}</Item>
                            <Item label="Client #">{req.client_num}</Item>
                            <Item label="Requested by">{req.requested_by_name}</Item>
                            <Item label="Requested">{fmtWhen(req.created_at)}</Item>
                            {(req.status === "CONFIRMED" || req.status === "DECLINED") && <Item label={req.status === "CONFIRMED" ? "Confirmed by" : "Declined by"}>{req.approved_by_name}</Item>}
                            {req.approved_at && <Item label="On">{fmtWhen(req.approved_at)}</Item>}
                        </div>

                        <div style={{ display: "grid", gap: 8 }}>
                            <span className="field-label">Send via</span>
                            {(req.channels || []).map((k) => {
                                const a = appOf(k);
                                const to = k === "email" ? req.emails : (req.contacts || []).filter((c) => c.channel === k).map((c) => c.value);
                                return (
                                    <div key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 10, borderRadius: 12, background: "var(--card)", border: "1px solid var(--line)" }}>
                                        <Glyph app={a} size={30} />
                                        <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                                            <b style={{ color: "var(--ink)" }}>{a.label}
                                                {k === "email" && req.sent_at && <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 12, marginLeft: 8 }}>✓ sent {fmtWhen(req.sent_at)}</span>}
                                            </b>
                                            <span className="muted small" style={{ wordBreak: "break-word" }}>{to?.length ? to.join(", ") : "pick in the app"}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {(req.channels || []).includes("email") && (
                            <div style={{ padding: 12, borderRadius: 12, background: "var(--card-2)", border: "1px solid var(--line)", display: "grid", gap: 6 }}>
                                <span className="muted small">Subject</span>
                                <b style={{ color: "var(--ink)" }}>{req.subject || "—"}</b>
                                <span className="muted small">Message</span>
                                <div style={{ whiteSpace: "pre-wrap", color: "var(--ink)", fontSize: 13 }}>{req.message || "—"}</div>
                            </div>
                        )}

                        {req.status === "CONFIRMED" && <ChatSendPanel request={req} />}
                    </div>

                    {/* right: the PDF */}
                    <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--card-2)", minHeight: 420 }}>
                        {pdfError && <div className="alert-error" role="alert" style={{ margin: 12 }}>{pdfError}</div>}
                        {!url && !pdfError && <div className="muted" style={{ padding: 20 }}>Loading PDF…</div>}
                        {url && <iframe src={url} title="PDF" style={{ width: "100%", height: "62vh", border: 0, display: "block" }} />}
                    </div>
                </div>
            </Modal>

            {ask && <RemarksModal kind={ask} busy={busy} onClose={() => setAsk(null)} onSubmit={(remarks) => act(ask, { remarks })} />}
            {edit && <SendRequestModal request={req} onClose={() => setEdit(false)} onSaved={onChanged} />}
        </>
    );
}

function RemarksModal({ kind, busy, onClose, onSubmit }) {
    const [text, setText] = useState("");
    const decline = kind === "decline";
    return (
        <Modal title={decline ? "Decline request" : "Ask to revise"} onClose={() => !busy && onClose()} size="sm"
            footer={<>
                <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
                <button className="btn btn-primary" onClick={() => onSubmit(text.trim())} disabled={busy || !text.trim()}
                    style={decline ? { background: "#ef4444", borderColor: "#ef4444" } : undefined}>
                    {busy ? "Saving…" : decline ? "Decline" : "Send back"}
                </button>
            </>}>
            <label className="field">
                <span className="field-label">{decline ? "Reason" : "What should be changed?"} <b className="st-req">*</b></span>
                <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} autoFocus />
            </label>
        </Modal>
    );
}