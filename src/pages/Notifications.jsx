// Notifications page – everything from the bell, in full.
//   Work to do  = live items counted from the data (gone when the work is done), grouped by category,
//                 each one opens a list (which clients / which tickets) right on the page
//   Messages    = every saved notification (no 7-day limit), newest first, 30 per page
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { useAuth, apiFetch } from "../context/AuthContext";
import "./Notifications.css";

/* ---------- categories of "work to do" (by item key) ---------- */
const CATS = [
    { id: "tickets", label: "Tickets", hint: "Edit / void / cancel requests waiting for approval", icon: "ticket", test: (k) => k.startsWith("tkt") },
    { id: "reverted", label: "Reverted", hint: "Sent back by the auditor – to fix", icon: "undo", test: (k) => k.startsWith("allrev") || /^rev\d/.test(k) },
    { id: "billing", label: "Billing", hint: "Non-recurring (EO) bills not fully paid", icon: "bill", test: (k) => k.startsWith("bill") },
    { id: "audit", label: "Scans & audit", hint: "Scanned receipts and invoices waiting", icon: "scan", test: (k) => k.startsWith("scan") || k.startsWith("aud") },
    { id: "hr", label: "HR approvals", hint: "Leave and overtime requests", icon: "people", test: (k) => k.startsWith("hr") },
    { id: "other", label: "Other", hint: "", icon: "bell", test: () => true },
];
const catOf = (key) => CATS.find((c) => c.test(key)) || CATS[CATS.length - 1];
const TYPE_OF = (key) => (/(sales)/.test(key) ? "Sales" : /(purchases)/.test(key) ? "Purchases" : /(expenses)/.test(key) ? "Expenses" : "");

const SHOW = [["all", "All"], ["unread", "Unread"], ["work", "Work to do"], ["messages", "Messages"]];

/* ---------- small helpers ---------- */
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function dayTitle(key) {
    const today = dayKey(Date.now());
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (key === today) return "Today";
    if (key === dayKey(y)) return "Yesterday";
    return new Date(`${key}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
const clock = (t) => (t ? new Date(t).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "");
function ago(t) {
    if (!t) return "";
    const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}
const num = (n) => Number(n || 0).toLocaleString("en-PH");
const pingBell = () => window.dispatchEvent(new Event("notifications:changed"));

function Ic({ n, s = 18 }) {
    const p = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
    switch (n) {
        case "ticket": return <svg {...p}><path d="M3 9a3 3 0 0 0 0 6v3h18v-3a3 3 0 0 0 0-6V6H3z" /><path d="M13 6v12" strokeDasharray="2 2" /></svg>;
        case "undo": return <svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>;
        case "bill": return <svg {...p}><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6M9 15h4" /></svg>;
        case "scan": return <svg {...p}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></svg>;
        case "people": return <svg {...p}><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" /></svg>;
        case "mail": return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
        case "alert": return <svg {...p}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></svg>;
        case "clock": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
        case "check": return <svg {...p}><path d="m5 12 5 5L20 7" /></svg>;
        case "down": return <svg {...p}><path d="m6 9 6 6 6-6" /></svg>;
        case "arrow": return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
        case "refresh": return <svg {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></svg>;
        case "search": return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
        default: return <svg {...p}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" /></svg>;
    }
}

/* ============================================================== */
export default function Notifications() {
    const notify = useToast();
    const navigate = useNavigate();
    const { user, selectBranch } = useAuth();

    const [show, setShow] = useState("all");
    const [module, setModule] = useState("");
    const [query, setQuery] = useState("");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 300); return () => clearTimeout(t); }, [query]);
    useEffect(() => { setPage(1); }, [show, module, q]);

    const load = useCallback(async (p = 1) => {
        setLoading(true);
        setError("");
        try {
            const qs = new URLSearchParams({ show, page: String(p) });
            if (module) qs.set("module", module);
            if (q) qs.set("q", q);
            const r = await apiFetch(`/notifications/all?${qs}`);
            setData(r);
            setMessages((m) => (p === 1 ? r.messages : [...m, ...r.messages]));
        } catch (e) {
            setError(e.message || "Couldn't load the notifications.");
        } finally {
            setLoading(false);
        }
    }, [show, module, q]);

    useEffect(() => { load(page); }, [load, page]);

    useEffect(() => {
        const again = () => load(1);
        window.addEventListener("notifications:page", again);
        const t = setInterval(() => document.visibilityState === "visible" && page === 1 && load(1), 60000);
        return () => { window.removeEventListener("notifications:page", again); clearInterval(t); };
    }, [load, page]);

    const work = data?.work || [];
    const counts = data?.counts || {};

    // summary tiles
    const sum = useMemo(() => {
        const by = (tone) => work.filter((w) => w.tone === tone).reduce((a, w) => a + (w.n || 0), 0);
        return { red: by("red"), orange: by("orange"), blue: by("blue") };
    }, [work]);

    // work grouped by category
    const cats = useMemo(() => {
        const m = new Map();
        work.forEach((w) => {
            const c = catOf(w.key);
            if (!m.has(c.id)) m.set(c.id, { ...c, items: [] });
            m.get(c.id).items.push(w);
        });
        // categories with the newest notification first (items inside are already newest first)
        const t = (x) => (x.items[0]?.time ? new Date(x.items[0].time).getTime() : 0);
        return CATS.map((c) => m.get(c.id)).filter(Boolean).sort((a, b) => t(b) - t(a));
    }, [work]);

    const groups = useMemo(() => {
        const by = new Map();
        messages.forEach((m) => {
            const k = m.time ? dayKey(m.time) : "unknown";
            if (!by.has(k)) by.set(k, []);
            by.get(k).push(m);
        });
        return [...by.entries()];
    }, [messages]);

    const markRead = async (n) => {
        if (!n.unread) return;
        setData((d) => d && ({ ...d, work: d.work.map((x) => (x.key === n.key ? { ...x, unread: false } : x)) }));
        setMessages((list) => list.map((x) => (x.key === n.key ? { ...x, unread: false, tone: "gray" } : x)));
        try {
            await apiFetch("/notifications/read", { method: "PUT", body: JSON.stringify({ key: n.key }) });
            pingBell();
        } catch { load(1); }
    };

    const markAll = async () => {
        try {
            await apiFetch("/notifications/read-all", { method: "PUT" });
            notify("All notifications marked as read.");
            pingBell();
            setPage(1);
            load(1);
        } catch (e) {
            notify(e.message || "Couldn't mark as read.", "error");
        }
    };

    // open a page (switch branch first when it belongs to another one)
    const go = async (to, caId, label, n) => {
        if (n) markRead(n);
        if (!to) return;
        if (caId && user?.type === "Staff" && String(caId) !== String(user?.caid)) {
            const res = await selectBranch(caId);
            if (res?.error) { notify(res.error, "error"); return; }
            notify(`Switched to ${label || "the branch"}`);
        }
        navigate(to);
    };

    if (data && data.enabled === false) {
        return (
            <div className="ntf">
                <section className="card ntf-empty"><Ic n="bell" s={30} /><b>No notifications</b><span>Notifications are for staff logins.</span></section>
            </div>
        );
    }

    const showWork = show !== "messages" && !module;
    const showMsgs = show !== "work";
    const nothing = data && !loading && (!showWork || !work.length) && (!showMsgs || !messages.length);

    return (
        <div className="ntf">
            {/* ---------- header ---------- */}
            <section className="card ntf-hero">
                <div className="ntf-hero-top">
                    <div className="ntf-title">
                        <span className="ntf-title-ico"><Ic n="bell" s={22} />{counts.unread > 0 && <i>{counts.unread > 99 ? "99+" : counts.unread}</i>}</span>
                        <div>
                            <h4>Notifications</h4>
                            <span>{counts.unread ? `${counts.unread} unread · updated ${clock(new Date().toISOString())}` : "You're all caught up"}</span>
                        </div>
                    </div>
                    <div className="ntf-actions">
                        <button type="button" className="btn ntf-icon-btn" onClick={() => { setPage(1); load(1); }} disabled={loading} title="Refresh" aria-label="Refresh">
                            <span className={loading ? "ntf-spin" : ""}><Ic n="refresh" s={16} /></span>
                        </button>
                        <button type="button" className="btn btn-primary" onClick={markAll} disabled={!counts.unread}><Ic n="check" s={16} /> Mark all read</button>
                    </div>
                </div>

                <div className="ntf-stats">
                    <Stat tone="red" icon="alert" label="Needs fixing" value={sum.red} onClick={() => setShow("work")} />
                    <Stat tone="orange" icon="clock" label="Waiting for approval" value={sum.orange} onClick={() => setShow("work")} />
                    <Stat tone="blue" icon="bill" label="To do / to collect" value={sum.blue} onClick={() => setShow("work")} />
                    <Stat tone="violet" icon="mail" label="Unread messages" value={counts.messages_unread || 0} onClick={() => setShow("messages")} />
                </div>

                <div className="ntf-filter">
                    <div className="ntf-tabs" role="tablist" aria-label="Show">
                        {SHOW.map(([k, label]) => {
                            const n = k === "unread" ? counts.unread : k === "work" ? counts.work : k === "messages" ? counts.messages_unread : null;
                            return (
                                <button key={k} role="tab" aria-selected={show === k} className={show === k ? "is-on" : ""} onClick={() => setShow(k)}>
                                    {label}{n ? <i>{n}</i> : null}
                                </button>
                            );
                        })}
                    </div>
                    <label className="ntf-search">
                        <Ic n="search" s={16} />
                        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notifications" aria-label="Search" />
                    </label>
                    {(data?.modules || []).length > 0 && show !== "work" && (
                        <select className="input ntf-module" value={module} onChange={(e) => setModule(e.target.value)} aria-label="Module">
                            <option value="">All modules</option>
                            {data.modules.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    )}
                </div>
            </section>

            {error && <div className="alert-error" role="alert">{error}</div>}

            {!data && loading && (
                <section className="card ntf-section">{Array.from({ length: 5 }, (_, i) => <div key={i} className="ntf-sk" />)}</section>
            )}

            {/* ---------- work to do ---------- */}
            {data && showWork && cats.map((c) => (
                <section key={c.id} className={`card ntf-section cat-${c.id}`}>
                    <header className="ntf-cat-head">
                        <span className="ntf-cat-ico"><Ic n={c.icon} s={18} /></span>
                        <div>
                            <h5>{c.label}</h5>
                            {c.hint && <span>{c.hint}</span>}
                        </div>
                        <b className="ntf-cat-total">{num(c.items.reduce((a, w) => a + (w.n || 0), 0))}</b>
                    </header>
                    <div className="ntf-work">
                        {c.items.map((w) => <WorkCard key={w.key} w={w} onRead={() => markRead(w)} onGo={go} />)}
                    </div>
                </section>
            ))}

            {/* ---------- messages ---------- */}
            {data && showMsgs && messages.length > 0 && (
                <section className="card ntf-section">
                    <header className="ntf-cat-head">
                        <span className="ntf-cat-ico is-violet"><Ic n="mail" s={18} /></span>
                        <div><h5>Messages</h5><span>Sent to you – scans, assignments, leave / overtime decisions…</span></div>
                        <b className="ntf-cat-total">{num(data.total)}</b>
                    </header>
                    {groups.map(([day, list]) => (
                        <div key={day} className="ntf-day">
                            <h6>{day === "unknown" ? "Earlier" : dayTitle(day)}</h6>
                            <ul className="ntf-timeline">
                                {list.map((n) => (
                                    <li key={n.key} className={n.unread ? "is-unread" : ""}>
                                        <span className="ntf-tl-dot" />
                                        <button type="button" className="ntf-tl-body" onClick={() => go(n.to, n.ca_id, n.sub, n)}>
                                            <span className="ntf-tl-main">
                                                <span className="ntf-tl-text">{n.text}</span>
                                                <span className="ntf-tl-tags">
                                                    {n.module && <em>{n.module}</em>}
                                                    {n.sub && <small>{n.sub}</small>}
                                                </span>
                                            </span>
                                            <time dateTime={n.time || undefined} title={n.time ? new Date(n.time).toLocaleString("en-PH") : ""}>
                                                {clock(n.time)}<small>{ago(n.time)}</small>
                                            </time>
                                        </button>
                                        {n.unread && <button type="button" className="ntf-read" onClick={() => markRead(n)} title="Mark as read" aria-label={`Mark as read: ${n.text}`}><Ic n="check" s={14} /></button>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    {data.page < data.pages && (
                        <div className="ntf-more">
                            <button type="button" className="btn" onClick={() => setPage((p) => p + 1)} disabled={loading}>{loading ? "Loading…" : `Load more (${num(data.total - messages.length)} left)`}</button>
                        </div>
                    )}
                </section>
            )}

            {nothing && (
                <section className="card ntf-empty">
                    <span className="ntf-empty-ico"><Ic n="check" s={28} /></span>
                    <b>{q || module || show !== "all" ? "Nothing matches" : "You're all caught up"}</b>
                    <span>{q || module || show !== "all" ? "Try another filter." : "New notifications will show up here."}</span>
                </section>
            )}
        </div>
    );
}

function Stat({ tone, icon, label, value, onClick }) {
    return (
        <button type="button" className={`ntf-stat tone-${tone}${value ? "" : " is-zero"}`} onClick={onClick}>
            <span className="ntf-stat-ico"><Ic n={icon} s={18} /></span>
            <span className="ntf-stat-body"><b>{num(value)}</b><small>{label}</small></span>
        </button>
    );
}

/* one "work to do" item: count, what, open the page, and the list behind it (clients / tickets) */
function WorkCard({ w, onRead, onGo }) {
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState(null);
    const [note, setNote] = useState("");
    const [err, setErr] = useState("");
    const [filter, setFilter] = useState("");
    const hasList = /^(tkt|allrev|rev\d|billeo)/.test(w.key);
    const type = TYPE_OF(w.key);
    const amount = (w.text.match(/₱[\d,.]+/) || [])[0];
    const title = w.text.replace(/^\d+\s*/, "").replace(/\s*·\s*₱[\d,.]+/, "");

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next && !rows) {
            apiFetch(`/notifications/detail?key=${encodeURIComponent(w.key)}`)
                .then((r) => { setRows(r.rows || []); setNote(r.note || ""); })
                .catch((e) => setErr(e.message || "Couldn't load the list."));
        }
    };
    const shown = (rows || []).filter((r) => !filter || `${r.title} ${r.sub} ${r.meta}`.toLowerCase().includes(filter.toLowerCase()));

    return (
        <article className={`ntf-card tone-${w.tone}${w.unread ? " is-unread" : ""}${open ? " is-open" : ""}`}>
            <div className="ntf-card-row">
                <b className="ntf-n">{num(w.n)}</b>
                <div className="ntf-card-body">
                    <span className="ntf-card-title">
                        {title}
                        {w.unread && <i className="ntf-new">NEW</i>}
                    </span>
                    <span className="ntf-card-sub">
                        {type && <em className={`ntf-type t-${type.toLowerCase()}`}>{type}</em>}
                        {amount && <strong>{amount}</strong>}
                        <small>{w.sub}</small>
                        {w.time && <time className="ntf-card-time" title={new Date(w.time).toLocaleString("en-PH")}>latest {ago(w.time)}</time>}
                    </span>
                </div>
                <div className="ntf-card-actions">
                    {hasList && (
                        <button type="button" className="btn btn-sm" onClick={toggle} aria-expanded={open}>
                            {open ? "Hide" : "View list"} <span className={`ntf-chev${open ? " is-up" : ""}`}><Ic n="down" s={14} /></span>
                        </button>
                    )}
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => onGo(w.to, w.ca_id, w.sub, w)}>Open <Ic n="arrow" s={14} /></button>
                    {w.unread && <button type="button" className="ntf-read" onClick={onRead} title="Mark as read" aria-label="Mark as read"><Ic n="check" s={14} /></button>}
                </div>
            </div>

            {open && (
                <div className="ntf-detail">
                    {err && <div className="alert-error" role="alert">{err}</div>}
                    {!rows && !err && <div className="ntf-detail-msg">Loading…</div>}
                    {rows && rows.length > 8 && (
                        <input className="input ntf-detail-search" type="search" placeholder="Filter this list" value={filter} onChange={(e) => setFilter(e.target.value)} />
                    )}
                    {rows && !shown.length && <div className="ntf-detail-msg">Nothing to show.</div>}
                    {rows && shown.length > 0 && (
                        <ul className="ntf-detail-list">
                            {shown.map((r, i) => (
                                <li key={i}>
                                    <button type="button" onClick={() => onGo(r.to, r.ca_id, r.title)}>
                                        <span className="ntf-d-main"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                                        {r.time && <time>{ago(r.time)}</time>}
                                        {r.meta !== "" && r.meta !== null && <strong className="ntf-d-meta">{typeof r.meta === "number" ? num(r.meta) : r.meta}</strong>}
                                        <Ic n="arrow" s={14} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {note && rows?.length > 0 && <p className="ntf-detail-note">{note}</p>}
                </div>
            )}
        </article>
    );
}