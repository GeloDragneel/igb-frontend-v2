// Header bell.
//   Staff / ClientStaff → /notifications (NotificationController): live work counts + saved notices
//   other logins (Client) → the local alerts the Header already builds (stock, unpaid …)
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "./Icons";
import { useToast } from "./Toast";
import { useAuth, apiFetch } from "../context/AuthContext";
import "./NotificationBell.css";

const EMPLOYEE_TYPES = ["Staff", "ClientStaff"];
const REFRESH_MS = 60000;   // full reload
const PULSE_MS = 15000;     // tiny change check (/notifications/pulse) – real time without a hook in every module

function ago(t) {
    if (!t) return "";
    const s = Math.max(0, (Date.now() - new Date(String(t).replace(" ", "T")).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationBell({ alerts = [], open, setOpen, onOpen }) {
    const { user, selectBranch } = useAuth();
    const navigate = useNavigate();
    const notify = useToast();
    const ref = useRef(null);
    const isEmployee = EMPLOYEE_TYPES.includes(user?.type);

    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);

    const load = useCallback(() => {
        if (!isEmployee) return;
        setLoading(true);
        apiFetch("/notifications")
            .then((r) => { setItems(r.items || []); setUnread(r.unread || 0); })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [isEmployee]);

    // on login / branch switch, then every minute (only while the tab is visible)
    useEffect(() => {
        if (!isEmployee) { setItems([]); setUnread(0); return; }
        load();
        const t = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
        window.addEventListener("notifications:changed", load);           // the Notifications page changed something
        return () => { clearInterval(t); window.removeEventListener("notifications:changed", load); };
    }, [isEmployee, load, user?.caid]);

    /* ---------- real time ----------
       1) instant: a saved notification is pushed on my Pusher channel (the Messenger relays it as "notifications:push")
       2) within 15 s: /notifications/pulse says something changed (tickets, reverted, EO, scans … counted from the data) */
    const sigRef = useRef("");
    const unreadRef = useRef(0);
    unreadRef.current = unread;
    const fresh = useCallback(async (toastText) => {
        const before = unreadRef.current;
        try {
            const r = await apiFetch("/notifications");
            setItems(r.items || []);
            setUnread(r.unread || 0);
            window.dispatchEvent(new Event("notifications:page"));          // the Notifications page reloads too
            const firstNew = (r.items || []).find((x) => x.unread);
            if ((r.unread || 0) > before && (toastText || firstNew)) notify(`🔔 ${toastText || firstNew.text}`);
        } catch { /* next pulse */ }
    }, [notify]);
    useEffect(() => {
        if (!isEmployee) return;
        let alive = true;
        const pulse = async () => {
            if (document.visibilityState !== "visible") return;
            try {
                const r = await apiFetch("/notifications/pulse");
                if (!alive || !r?.sig) return;
                if (sigRef.current && sigRef.current !== r.sig) fresh();
                sigRef.current = r.sig;
            } catch { /* offline – try again */ }
        };
        pulse();
        const t = setInterval(pulse, PULSE_MS);
        const onPush = (e) => { sigRef.current = ""; fresh(e.detail?.message || ""); };
        const onVisible = () => document.visibilityState === "visible" && pulse();
        window.addEventListener("notifications:push", onPush);
        document.addEventListener("visibilitychange", onVisible);
        return () => { alive = false; clearInterval(t); window.removeEventListener("notifications:push", onPush); document.removeEventListener("visibilitychange", onVisible); };
    }, [isEmployee, fresh, user?.caid]);

    // close on outside click / Escape
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
        const onKey = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
    }, [open, setOpen]);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next) { onOpen?.(); load(); }
    };

    // read right away on screen, then saved on the server
    const markRead = (n) => {
        if (!n.unread) return;
        setItems((list) => list.map((x) => (x.key === n.key ? { ...x, unread: false } : x)));
        setUnread((u) => Math.max(0, u - 1));
        apiFetch("/notifications/read", { method: "PUT", body: JSON.stringify({ key: n.key }) })
            .then(() => window.dispatchEvent(new Event("notifications:page")))
            .catch(() => load());
    };

    const markAll = async () => {
        setItems((list) => list.map((x) => ({ ...x, unread: false })));
        setUnread(0);
        try {
            await apiFetch("/notifications/read-all", { method: "PUT" });
        } catch (e) {
            notify(e.message || "Couldn't mark as read.", "error");
            load();
        }
    };

    // open the page; for another branch, switch to it first (Staff)
    const go = async (n) => {
        markRead(n);
        setOpen(false);
        if (!n.to) return;
        if (n.ca_id && user?.type === "Staff" && String(n.ca_id) !== String(user?.caid)) {
            const res = await selectBranch(n.ca_id);
            if (res?.error) { notify(res.error, "error"); return; }
            notify(`Switched to ${n.sub || "the branch"}`);
        }
        navigate(n.to);
    };

    const count = isEmployee ? unread : alerts.length;

    return (
        <div className="pop-wrap" ref={ref}>
            <button className="icon-btn round" onClick={toggle} aria-label={`Notifications${count ? ` (${count})` : ""}`} aria-expanded={open}>
                <Icon name="bell" />
                {count > 0 && <span className="count">{count > 99 ? "99+" : count}</span>}
            </button>
            {open && (
                <div className="popover nb-pop" role="dialog" aria-label="Notifications">
                    <div className="popover-head nb-head">
                        <span>Notifications</span>
                        {isEmployee && unread > 0 && <button className="nb-link" onClick={markAll}>Mark all read</button>}
                    </div>
                    {isEmployee && (
                        <button type="button" className="nb-all" onClick={() => { setOpen(false); navigate("/notifications"); }}>
                            See all notifications →
                        </button>
                    )}

                    {!isEmployee && (alerts.length === 0
                        ? <div className="popover-empty">You're all caught up.</div>
                        : alerts.map((a) => (
                            <Link key={a.key} to={a.to} className="popover-item" onClick={() => setOpen(false)}>
                                <span className={`dot dot-${a.tone}`} />{a.text}
                            </Link>
                        )))}

                    {isEmployee && (
                        <div className="nb-list">
                            {items.length === 0 && <div className="popover-empty">{loading ? "Loading…" : "You're all caught up."}</div>}
                            {items.map((n) => (
                                <div key={n.key} className={`popover-item nb-item${n.unread ? " is-unread" : ""}`}>
                                    <button type="button" className="nb-open" onClick={() => go(n)}>
                                        <span className={`dot dot-${n.unread ? n.tone : "gray"}`} />
                                        <span className="nb-body">
                                            <span className="nb-text">{n.text}</span>
                                            {(n.sub || n.time) && <small className="nb-sub">{[n.sub, ago(n.time)].filter(Boolean).join(" · ")}</small>}
                                        </span>
                                    </button>
                                    {n.unread && (
                                        <button type="button" className="nb-check" onClick={() => markRead(n)} title="Mark as read" aria-label={`Mark as read: ${n.text}`}>✓</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}