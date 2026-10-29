import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./Modal";
import { useAuth, apiFetch } from "../context/AuthContext";

/* =========================================================
   "Due today" popup (Staff → Calendar)
   Put it once in the Layout: <CalendarToday />
   · staff logins only
   · shows what is due / happening today for me: my events + what is shared with me (tasks not done yet),
     my leave today, today's holiday
   · once per item per day (opening again later only shows NEW items), checks again every 15 minutes
   ========================================================= */
const pad = (n) => String(n).padStart(2, "0");
const hm = (s) => { const [h, m] = s.slice(11, 16).split(":").map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };
const ICON = { event: "📅", task: "☐", meeting: "👥", reminder: "⏰" };

export default function CalendarToday() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [today, setToday] = useState(null);
    const isStaff = user?.type === "Staff";

    useEffect(() => {
        if (!isStaff) return undefined;
        let alive = true;
        const check = async () => {
            try {
                const r = await apiFetch("/calendar/today");
                if (!alive || !r?.date) return;
                const key = `igb-cal-seen:${user.id}:${r.date}`;
                let seen = [];
                try { seen = JSON.parse(localStorage.getItem(key) || "[]"); } catch { /* ignore */ }
                const ids = [
                    ...r.events.map((e) => `e${e.key}`),
                    ...r.leaves.map((l) => `l${l.id}`),
                    ...r.holidays.map((h) => `h${h.name}`),
                ];
                const fresh = ids.filter((i) => !seen.includes(i));
                if (!fresh.length) return;
                setToday({ ...r, key, ids });
            } catch {
                /* no Calendar access / not an employee → no popup */
            }
        };
        const first = setTimeout(check, 1500);                 // after the page has loaded
        const t = setInterval(check, 15 * 60 * 1000);
        return () => { alive = false; clearTimeout(first); clearInterval(t); };
    }, [isStaff, user?.id]);

    if (!today) return null;

    const close = () => {
        try { localStorage.setItem(today.key, JSON.stringify(today.ids)); } catch { /* ignore */ }
        setToday(null);
    };
    const open = () => { close(); navigate("/calendar"); };
    const count = today.events.length + today.leaves.length + today.holidays.length;

    return (
        <Modal title={`📌 Today · ${count} item${count === 1 ? "" : "s"}`} onClose={close}
            footer={<><button className="btn" onClick={close}>Dismiss</button><button className="btn btn-primary" onClick={open}>Open Calendar</button></>}>
            <div className="cal-today">
                {today.holidays.map((h) => (
                    <div key={h.name} className="cal-today-item is-holiday"><span>🎌</span><div><b>{h.name}</b><small>{h.type || "Holiday"}</small></div></div>
                ))}
                {today.leaves.map((l) => (
                    <div key={l.id} className="cal-today-item is-leave"><span>🌴</span><div><b>You're on leave</b><small>{l.type_name || l.type || "Leave"}{l.status === "pending" ? " · pending" : ""}</small></div></div>
                ))}
                {today.events.map((e) => (
                    <div key={e.key} className="cal-today-item" style={{ "--ev": e.color }}>
                        <span>{ICON[e.kind] || "📅"}</span>
                        <div>
                            <b>{e.title}</b>
                            <small>
                                {e.all_day ? "All day" : `${e.kind === "task" ? "Due " : ""}${hm(e.start)}${e.kind === "task" ? "" : ` – ${hm(e.end)}`}`}
                                {e.location ? ` · ${e.location}` : ""}
                                {!e.mine && e.created_by ? ` · from ${e.created_by}` : ""}
                            </small>
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    );
}
