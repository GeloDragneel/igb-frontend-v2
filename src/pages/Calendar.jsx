import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";
import { apiFetch } from "../context/AuthContext";
import SearchSelect from "../components/SearchSelect";
import "./Calendar.css";

/* =========================================================
   Staff → Calendar (employees only)
   Month · Week · Day · Schedule, like a desk calendar app.
   Shows: events / tasks / meetings / reminders (yours + shared with you) · leaves · holidays.
   Rights come from the IT Officer (Manage access): Read · Write · Delete.
   ========================================================= */

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = ["#2563eb", "#0891b2", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#7c3aed", "#475569"];
const KINDS = [["event", "Event"], ["task", "Task"], ["meeting", "Meeting"], ["reminder", "Reminder"]];
const KIND_ICON = { event: "●", task: "☐", meeting: "👥", reminder: "⏰" };
const REPEATS = [["none", "Does not repeat"], ["daily", "Every day"], ["weekly", "Every week"], ["monthly", "Every month"], ["yearly", "Every year"]];
const HOUR = 48;                                   // px per hour in Week / Day

/* ---------- dates (local, no time zone surprises) ---------- */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const parseDt = (s) => { const [a, b = "00:00"] = s.split("T"); const d = parseYmd(a); const [h, mi] = b.split(":").map(Number); d.setHours(h, mi, 0, 0); return d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const startOfWeek = (d) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay());
const sameDay = (a, b) => ymd(a) === ymd(b);
const hm = (d) => { const h = d.getHours(), m = d.getMinutes(); return `${h % 12 || 12}${m ? `:${pad(m)}` : ""}${h < 12 ? "am" : "pm"}`; };
const dtLocal = (d) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const longDate = (d) => `${DOW[d.getDay()]}, ${MON[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;

/** the days the view needs: [from, to] */
function rangeOf(view, cursor) {
    if (view === "month") {
        const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const from = startOfWeek(first);
        return [from, addDays(from, 41)];
    }
    if (view === "week") { const from = startOfWeek(cursor); return [from, addDays(from, 6)]; }
    if (view === "day") return [cursor, cursor];
    return [cursor, addDays(cursor, 29)];                       // schedule: 30 days
}

/** items of one day: all-day / multi-day first, then by time */
function dayItems(day, events, leaves, holidays, show) {
    const key = ymd(day);
    const out = [];
    if (show.holidays) holidays.filter((h) => h.date === key).forEach((h) => out.push({ type: "holiday", key: `h-${h.date}-${h.name}`, title: h.name, sub: h.type, allDay: true }));
    if (show.leaves) leaves.filter((l) => l.from <= key && l.to >= key).forEach((l) => out.push({ type: "leave", key: `l-${l.id}-${key}`, title: `${l.employee}`, sub: `${l.type_name || l.type || "Leave"}${l.status === "pending" ? " · pending" : ""}`, allDay: true, leave: l }));
    if (show.events) events.filter((e) => {
        const s = e.start.slice(0, 10), en = e.end.slice(0, 10);
        return s <= key && en >= key;
    }).forEach((e) => out.push({ type: "event", key: `${e.key}-${key}`, title: e.title, allDay: e.all_day || e.start.slice(0, 10) !== e.end.slice(0, 10), ev: e }));
    return out.sort((a, b) => (b.allDay - a.allDay) || ((a.ev?.start || "") < (b.ev?.start || "") ? -1 : 1));
}

/** side-by-side columns for overlapping timed events of one day */
function layoutDay(list) {
    const items = list.map((e) => ({ e, s: parseDt(e.start), en: parseDt(e.end) })).sort((a, b) => a.s - b.s || b.en - a.en);
    const groups = [];
    let cur = [], end = 0;
    items.forEach((it) => {
        if (cur.length && it.s >= end) { groups.push(cur); cur = []; end = 0; }
        cur.push(it);
        end = Math.max(end, +it.en);
    });
    if (cur.length) groups.push(cur);
    const out = [];
    groups.forEach((g) => {
        const cols = [];
        g.forEach((it) => {
            let c = cols.findIndex((last) => last <= it.s);
            if (c < 0) { c = cols.length; cols.push(0); }
            cols[c] = it.en;
            it.col = c;
        });
        g.forEach((it) => out.push({ ...it, cols: cols.length }));
    });
    return out;
}

export default function Calendar() {
    const notify = useToast();
    const today = useMemo(() => new Date(), []);
    const [view, setView] = useState(() => { try { return localStorage.getItem("igb-cal-view") || "month"; } catch { return "month"; } });
    const [cursor, setCursor] = useState(() => new Date());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [show, setShow] = useState({ events: true, leaves: true, holidays: true });
    const [person, setPerson] = useState("");              // IT Officer: view one employee's calendar
    const [people, setPeople] = useState([]);
    const [peopleErr, setPeopleErr] = useState("");
    const [editor, setEditor] = useState(null);            // form object
    const [details, setDetails] = useState(null);          // event
    const [dayList, setDayList] = useState(null);          // { day, items } – "+N more"
    const [askDelete, setAskDelete] = useState(null);
    const [accessOpen, setAccessOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => { try { localStorage.setItem("igb-cal-view", view); } catch { /* ignore */ } }, [view]);

    const [from, to] = useMemo(() => rangeOf(view, cursor), [view, cursor]);
    const me = data?.me;
    const can = me?.can || { read: false, write: false, delete: false };

    // what is on today for me (the strip at the top) – same list as the "due today" popup
    const [todayInfo, setTodayInfo] = useState(null);
    const loadToday = useCallback(() => {
        apiFetch("/calendar/today").then(setTodayInfo).catch(() => setTodayInfo(null));
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const q = new URLSearchParams({ from: ymd(from), to: ymd(to) });
            if (person) q.set("employee_id", person);
            setData(await apiFetch(`/calendar?${q}`));
        } catch (e) {
            setError(e.message || "Couldn't load the calendar.");
        } finally {
            setLoading(false);
        }
    }, [from, to, person]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { loadToday(); }, [loadToday, data]);          // refresh after every change

    const loadPeople = useCallback(() => {
        setPeopleErr("");
        apiFetch("/calendar/employees")
            .then((r) => setPeople(Array.isArray(r) ? r : []))
            .catch((e) => { setPeople([]); setPeopleErr(e.message || "Couldn't load the employees."); });
    }, []);
    useEffect(() => { loadPeople(); }, [loadPeople]);

    const events = data?.events || [];
    const leaves = data?.leaves || [];
    const holidays = data?.holidays || [];

    /* ---------- navigation ---------- */
    const move = (n) => setCursor((c) => (view === "month" ? addMonths(c, n) : addDays(c, n * (view === "week" ? 7 : view === "day" ? 1 : 30))));
    const title = view === "month" ? `${MON[cursor.getMonth()]} ${cursor.getFullYear()}`
        : view === "day" ? longDate(cursor)
            : `${MON[from.getMonth()].slice(0, 3)} ${from.getDate()} – ${MON[to.getMonth()].slice(0, 3)} ${to.getDate()}, ${to.getFullYear()}`;

    /* ---------- editor ---------- */
    const newAt = (day, hour = 9, allDay = false) => {
        if (!can.write) return;
        const s = new Date(day); s.setHours(hour, 0, 0, 0);
        const e = new Date(s); e.setHours(hour + 1);
        setEditor({ id: 0, kind: "event", title: "", all_day: allDay, start: dtLocal(s), end: dtLocal(e), repeat: "none", repeat_until: "", color: COLORS[0], everyone: false, guests: [], location: "", description: "" });
    };
    const edit = (ev) => {
        setDetails(null);
        setEditor({
            id: ev.id, kind: ev.kind, title: ev.title, all_day: ev.all_day,
            start: ev.series_start, end: ev.series_end, repeat: ev.repeat, repeat_until: ev.repeat_until || "",
            color: ev.color, everyone: ev.everyone, guests: ev.guests.map((g) => g.id), location: ev.location || "", description: ev.description || "",
        });
    };

    const save = async () => {
        const f = editor;
        if (!f.title.trim()) return notify("Add a title.", "error");
        if (f.end < f.start) return notify("The end is before the start.", "error");
        setSaving(true);
        try {
            const body = { ...f, start: f.all_day ? `${f.start.slice(0, 10)}T00:00` : f.start, end: f.all_day ? `${f.end.slice(0, 10)}T23:59` : f.end, repeat_until: f.repeat === "none" ? null : f.repeat_until || null };
            await apiFetch(f.id ? `/calendar/events/${f.id}` : "/calendar/events", { method: f.id ? "PUT" : "POST", body: JSON.stringify(body) });
            notify(f.id ? "Event updated." : "Event added.");
            setEditor(null);
            load();
        } catch (e) {
            notify(e.message || "Couldn't save the event.", "error");
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        const ev = askDelete;
        setAskDelete(null);
        try {
            await apiFetch(`/calendar/events/${ev.id}`, { method: "DELETE" });
            notify("Event deleted.");
            setDetails(null);
            setEditor(null);
            load();
        } catch (e) {
            notify(e.message || "Couldn't delete the event.", "error");
        }
    };

    const toggleDone = async (ev) => {
        try {
            const r = await apiFetch(`/calendar/events/${ev.id}/done`, { method: "PATCH", body: JSON.stringify({ is_done: !ev.is_done }) });
            setDetails((d) => (d && d.id === ev.id ? { ...d, is_done: r.is_done } : d));
            load();
        } catch (e) {
            notify(e.message || "Couldn't update the task.", "error");
        }
    };

    /* ---------- pieces ---------- */
    const chip = (it, compact = false) => {
        if (it.type === "holiday") return <span key={it.key} className="cal-chip is-holiday" title={`${it.title} · ${it.sub || "Holiday"}`}>🎌 {it.title}</span>;
        if (it.type === "leave") return <span key={it.key} className={`cal-chip is-leave ${it.leave.status === "pending" ? "is-pending" : ""}`} title={`${it.title} – ${it.sub}`}>🌴 {it.title}{compact ? "" : ` · ${it.sub}`}</span>;
        const e = it.ev;
        const timed = !it.allDay;
        return (
            <button key={it.key} type="button" className={`cal-chip is-event ${timed ? "is-timed" : ""} ${e.is_done ? "is-done" : ""}`}
                style={{ "--ev": e.color }} onClick={(x) => { x.stopPropagation(); setDetails(e); }} title={e.title}>
                {timed ? <i className="cal-dot" /> : <span className="cal-kind">{e.kind === "task" ? (e.is_done ? "☑" : "☐") : KIND_ICON[e.kind] === "●" ? "" : KIND_ICON[e.kind]}</span>}
                {timed && <span className="cal-time">{hm(parseDt(e.start))}</span>}
                <span className="cal-chip-t">{e.title}</span>
            </button>
        );
    };

    const monthView = () => {
        const days = Array.from({ length: 42 }, (_, i) => addDays(from, i));
        return (
            <div className="cal-month">
                {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
                {days.map((d) => {
                    const items = dayItems(d, events, leaves, holidays, show);
                    const out = d.getMonth() !== cursor.getMonth();
                    const max = 3;
                    return (
                        <div key={ymd(d)} className={`cal-cell ${out ? "is-out" : ""} ${sameDay(d, today) ? "is-today" : ""} ${can.write ? "can-add" : ""}`}
                            onClick={() => newAt(d, 9, false)}>
                            <button type="button" className="cal-daynum" onClick={(x) => { x.stopPropagation(); setCursor(d); setView("day"); }}>{d.getDate()}</button>
                            <div className="cal-chips">
                                {items.slice(0, max).map((it) => chip(it, true))}
                                {items.length > max && (
                                    <button type="button" className="cal-more" onClick={(x) => { x.stopPropagation(); setDayList({ day: d, items }); }}>
                                        +{items.length - max} more
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const timeView = (days) => {
        const nowTop = (today.getHours() + today.getMinutes() / 60) * HOUR;
        return (
            <div className="cal-time-wrap">
                <div className="cal-time-head" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
                    <div />
                    {days.map((d) => (
                        <button type="button" key={ymd(d)} className={`cal-col-head ${sameDay(d, today) ? "is-today" : ""}`} onClick={() => { setCursor(d); setView("day"); }}>
                            <small>{DOW[d.getDay()]}</small><b>{d.getDate()}</b>
                        </button>
                    ))}
                    <div className="cal-allday-label">all-day</div>
                    {days.map((d) => (
                        <div key={ymd(d)} className="cal-allday" onClick={() => newAt(d, 0, true)}>
                            {dayItems(d, events, leaves, holidays, show).filter((it) => it.allDay).map((it) => chip(it, days.length > 1))}
                        </div>
                    ))}
                </div>
                <div className="cal-grid-scroll" ref={(el) => { if (el && !el.dataset.scrolled) { el.scrollTop = 7 * HOUR; el.dataset.scrolled = "1"; } }}>
                    <div className="cal-grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, height: 24 * HOUR }}>
                        <div className="cal-hours">
                            {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ top: h * HOUR }}>{h ? `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}` : ""}</span>)}
                        </div>
                        {days.map((d) => {
                            const timed = show.events ? events.filter((e) => !e.all_day && e.start.slice(0, 10) === ymd(d) && e.end.slice(0, 10) === ymd(d)) : [];
                            return (
                                <div key={ymd(d)} className={`cal-day-col ${can.write ? "can-add" : ""}`}
                                    onClick={(x) => { const r = x.currentTarget.getBoundingClientRect(); newAt(d, Math.max(0, Math.min(23, Math.floor((x.clientY - r.top) / HOUR)))); }}>
                                    {Array.from({ length: 24 }, (_, h) => <i key={h} className="cal-line" style={{ top: h * HOUR }} />)}
                                    {sameDay(d, today) && <i className="cal-now" style={{ top: nowTop }} />}
                                    {layoutDay(timed).map(({ e, s, en, col, cols }) => {
                                        const top = (s.getHours() + s.getMinutes() / 60) * HOUR;
                                        const h = Math.max(22, ((en - s) / 3600000) * HOUR - 2);
                                        return (
                                            <button type="button" key={e.key} className={`cal-block ${e.is_done ? "is-done" : ""}`}
                                                style={{ top, height: h, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`, "--ev": e.color }}
                                                onClick={(x) => { x.stopPropagation(); setDetails(e); }}>
                                                <b>{e.kind === "task" ? (e.is_done ? "☑ " : "☐ ") : ""}{e.title}</b>
                                                <small>{hm(s)} – {hm(en)}</small>
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const scheduleView = () => {
        const days = Array.from({ length: 30 }, (_, i) => addDays(from, i));
        const rows = days.map((d) => ({ d, items: dayItems(d, events, leaves, holidays, show) })).filter((r) => r.items.length);
        if (!rows.length) return <p className="cal-empty">Nothing in the next 30 days.</p>;
        return (
            <div className="cal-schedule">
                {rows.map(({ d, items }) => (
                    <div key={ymd(d)} className={`cal-srow ${sameDay(d, today) ? "is-today" : ""}`}>
                        <div className="cal-sdate"><b>{d.getDate()}</b><small>{MON[d.getMonth()].slice(0, 3)}, {DOW[d.getDay()]}</small></div>
                        <div className="cal-sitems">
                            {items.map((it) => (
                                <div key={it.key} className="cal-sitem" onClick={() => it.ev && setDetails(it.ev)}>
                                    <span className="cal-swhen">{it.allDay ? "All day" : `${hm(parseDt(it.ev.start))} – ${hm(parseDt(it.ev.end))}`}</span>
                                    {chip(it)}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(from, i)) : [cursor];

    if (error && !data) {
        return <section className="card cal"><div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div></section>;
    }

    return (
        <section className="cal">
            {/* ---------- left ---------- */}
            <aside className="card cal-side">
                {can.write && <button className="btn btn-primary cal-create" onClick={() => newAt(cursor, 9)}>＋ Create</button>}
                <MiniMonth cursor={cursor} today={today} onPick={(d) => setCursor(d)} />

                <div className="cal-side-h">Show</div>
                {[["events", "Events & tasks", "#2563eb"], ["leaves", "Leaves", "#7c3aed"], ["holidays", "Holidays", "#16a34a"]].map(([k, l, c]) => (
                    <label key={k} className="cal-layer">
                        <input type="checkbox" checked={show[k]} onChange={(e) => setShow((s) => ({ ...s, [k]: e.target.checked }))} style={{ accentColor: c }} />
                        {l}
                    </label>
                ))}

                {me?.is_admin && (
                    <>
                        <div className="cal-side-h">Whose calendar</div>
                        <SearchSelect
                            value={person}
                            onChange={(v) => setPerson(v || "")}
                            options={[
                                { value: "", label: "Everyone", hint: "All employees" },
                                ...people.map((p) => ({ value: String(p.id), label: p.name, hint: p.role || "—" })),
                            ]}
                            aria-label="Whose calendar"
                        />
                        <button className="btn cal-access-btn" onClick={() => setAccessOpen(true)}>🔐 Manage access</button>
                    </>
                )}

                {me && (
                    <p className="cal-rights">
                        You can: <b>{["read", "write", "delete"].filter((k) => can[k]).map((k) => k[0].toUpperCase() + k.slice(1)).join(" · ") || "nothing"}</b>
                        {me.is_admin && <span> (IT Officer)</span>}
                    </p>
                )}
            </aside>

            {/* ---------- right ---------- */}
            <div className="card cal-main">
                <header className="cal-bar">
                    <button className="btn" onClick={() => setCursor(new Date())}>Today</button>
                    <div className="cal-nav">
                        <button className="btn btn-icon" onClick={() => move(-1)} aria-label="Previous">‹</button>
                        <button className="btn btn-icon" onClick={() => move(1)} aria-label="Next">›</button>
                    </div>
                    <h2 className="cal-title">{title}</h2>
                    {loading && <span className="cal-loading">Loading…</span>}
                    <div className="cal-views" role="tablist">
                        {[["day", "Day"], ["week", "Week"], ["month", "Month"], ["schedule", "Schedule"]].map(([k, l]) => (
                            <button key={k} role="tab" aria-selected={view === k} className={view === k ? "is-on" : ""} onClick={() => setView(k)}>{l}</button>
                        ))}
                    </div>
                </header>
                {error && <div className="alert-error" role="alert">{error}</div>}
                {todayInfo && (todayInfo.events.length + todayInfo.leaves.length + todayInfo.holidays.length) > 0 && (
                    <div className="cal-todaybar" role="region" aria-label="Today">
                        <button type="button" className="cal-todaybar-day" onClick={() => { setCursor(new Date()); setView("day"); }} title="Open today">
                            <small>Today</small>
                            <b>{today.getDate()}</b>
                            <small>{DOW[today.getDay()]}</small>
                        </button>
                        <div className="cal-todaybar-list">
                            {todayInfo.holidays.map((h) => (
                                <span key={`h-${h.name}`} className="cal-tb-item is-holiday"><span>🎌</span><b>{h.name}</b><small>{h.type || "Holiday"}</small></span>
                            ))}
                            {todayInfo.leaves.map((l) => (
                                <span key={`l-${l.id}`} className="cal-tb-item is-leave"><span>🌴</span><b>You're on leave</b><small>{l.type_name || l.type || "Leave"}{l.status === "pending" ? " · pending" : ""}</small></span>
                            ))}
                            {todayInfo.events.map((e) => {
                                const s0 = parseDt(e.start);
                                const now = new Date();
                                const live = !e.all_day && s0 <= now && parseDt(e.end) >= now;
                                return (
                                    <button type="button" key={e.key} className={`cal-tb-item ${live ? "is-live" : ""}`} style={{ "--ev": e.color }} onClick={() => setDetails(e)}>
                                        <span>{KIND_ICON[e.kind] === "●" ? "📅" : KIND_ICON[e.kind]}</span>
                                        <b>{e.title}</b>
                                        <small>{live ? "Now · " : ""}{e.all_day ? "All day" : `${e.kind === "task" ? "Due " : ""}${hm(s0)}`}</small>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
                <div className="cal-body">
                    {view === "month" && monthView()}
                    {(view === "week" || view === "day") && timeView(days)}
                    {view === "schedule" && scheduleView()}
                </div>
            </div>

            {/* ---------- "+N more" ---------- */}
            {dayList && (
                <Modal title={longDate(dayList.day)} onClose={() => setDayList(null)}>
                    <div className="cal-daylist">{dayList.items.map((it) => chip(it))}</div>
                </Modal>
            )}

            {/* ---------- details ---------- */}
            {details && (
                <Modal title={details.title} onClose={() => setDetails(null)}
                    footer={
                        <div className="cal-foot">
                            {details.kind === "task" && details.can_done && (
                                <button className="btn" onClick={() => toggleDone(details)}>{details.is_done ? "Mark not done" : "✓ Mark done"}</button>
                            )}
                            <span className="cal-foot-gap" />
                            {details.can_delete && <button className="btn btn-danger" onClick={() => setAskDelete(details)}>Delete</button>}
                            {details.can_edit && <button className="btn btn-primary" onClick={() => edit(details)}>Edit</button>}
                            <button className="btn" onClick={() => setDetails(null)}>Close</button>
                        </div>
                    }>
                    <div className="cal-details" style={{ "--ev": details.color }}>
                        <p className="cal-d-kind"><i className="cal-dot" /> {KINDS.find((k) => k[0] === details.kind)?.[1] || "Event"}{details.kind === "task" && (details.is_done ? " · done ✓" : " · not done")}</p>
                        <p>🕒 {details.all_day
                            ? (details.start.slice(0, 10) === details.end.slice(0, 10) ? `${longDate(parseDt(details.start))} · all day` : `${longDate(parseDt(details.start))} – ${longDate(parseDt(details.end))}`)
                            : `${longDate(parseDt(details.start))} · ${hm(parseDt(details.start))} – ${hm(parseDt(details.end))}`}</p>
                        {details.repeat !== "none" && <p>🔁 {REPEATS.find((r) => r[0] === details.repeat)?.[1]}{details.repeat_until ? ` until ${longDate(parseYmd(details.repeat_until))}` : ""}</p>}
                        {details.location && <p>📍 {details.location}</p>}
                        <p>👥 {details.everyone ? "Shared with everyone" : details.guests.length ? `Shared with ${details.guests.map((g) => g.name).join(", ")}` : "Only the one who made it"}</p>
                        {details.description && <p className="cal-d-desc">{details.description}</p>}
                        <p className="muted small">Made by {details.created_by || "—"}{details.mine ? " (you)" : ""}</p>
                    </div>
                </Modal>
            )}

            {/* ---------- editor ---------- */}
            {editor && (
                <EventEditor
                    form={editor} setForm={setEditor} people={people} peopleErr={peopleErr} onRetryPeople={loadPeople} meId={me?.employee_id}
                    saving={saving} onSave={save} onClose={() => setEditor(null)}
                    canDelete={!!editor.id && (me?.is_admin || can.delete)}
                    onDelete={() => setAskDelete({ id: editor.id, title: editor.title })}
                />
            )}

            {askDelete && (
                <ConfirmDialog
                    title="Delete this event?"
                    message={`"${askDelete.title}" will be removed from everyone's calendar${askDelete.repeat && askDelete.repeat !== "none" ? " (every time it repeats)" : ""}.`}
                    confirmLabel="Delete"
                    onCancel={() => setAskDelete(null)}
                    onConfirm={remove}
                />
            )}

            {accessOpen && <AccessManager onClose={() => setAccessOpen(false)} />}
        </section>
    );
}

/* ---------------- small month on the left ---------------- */
function MiniMonth({ cursor, today, onPick }) {
    const [m, setM] = useState(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    useEffect(() => { setM(new Date(cursor.getFullYear(), cursor.getMonth(), 1)); }, [cursor]);
    const start = startOfWeek(m);
    return (
        <div className="cal-mini">
            <div className="cal-mini-head">
                <b>{MON[m.getMonth()]} {m.getFullYear()}</b>
                <span>
                    <button type="button" onClick={() => setM(addMonths(m, -1))} aria-label="Previous month">‹</button>
                    <button type="button" onClick={() => setM(addMonths(m, 1))} aria-label="Next month">›</button>
                </span>
            </div>
            <div className="cal-mini-grid">
                {DOW.map((d) => <small key={d}>{d[0]}</small>)}
                {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => (
                    <button type="button" key={ymd(d)} onClick={() => onPick(d)}
                        className={`${d.getMonth() !== m.getMonth() ? "is-out" : ""} ${sameDay(d, today) ? "is-today" : ""} ${sameDay(d, cursor) ? "is-on" : ""}`}>
                        {d.getDate()}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ---------------- create / edit ---------------- */
const initials = (name) => String(name || "?").replace(/[^A-Za-z, ]/g, "").split(/[ ,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const AV_COLORS = ["#2563eb", "#0891b2", "#16a34a", "#ca8a04", "#ea580c", "#db2777", "#7c3aed", "#475569"];
const avColor = (id) => AV_COLORS[Number(id) % AV_COLORS.length];

function EventEditor({ form, setForm, people, peopleErr, onRetryPeople, meId, saving, onSave, onClose, canDelete, onDelete }) {
    const set = (p) => setForm((f) => ({ ...f, ...p }));
    const [q, setQ] = useState("");
    const others = people.filter((p) => p.id !== meId);
    const shown = others.filter((p) => !q || `${p.name} ${p.role || ""}`.toLowerCase().includes(q.toLowerCase()));
    const toggleGuest = (id) => set({ guests: form.guests.includes(id) ? form.guests.filter((g) => g !== id) : [...form.guests, id] });
    const share = form.everyone ? "everyone" : form.guests.length || form.shareMode === "people" ? "people" : "me";
    const setShare = (m) => set({ everyone: m === "everyone", shareMode: m, guests: m === "me" ? [] : form.guests });
    const allShownOn = shown.length > 0 && shown.every((p) => form.guests.includes(p.id));
    const toggleAllShown = () => set({
        guests: allShownOn ? form.guests.filter((g) => !shown.some((p) => p.id === g)) : [...new Set([...form.guests, ...shown.map((p) => p.id)])],
    });
    const titleRef = useRef(null);
    useEffect(() => { titleRef.current?.focus(); }, []);

    return (
        <Modal title={form.id ? "Edit" : "New"} onClose={onClose} size="lg"
            footer={
                <div className="cal-foot">
                    {canDelete && <button className="btn btn-danger" onClick={onDelete}>Delete</button>}
                    <span className="cal-foot-gap" />
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                </div>
            }>
            <div className="cal-form">
                <input ref={titleRef} className="input cal-form-title" placeholder="Add title" value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={150}
                    onKeyDown={(e) => { if (e.key === "Enter") onSave(); }} />

                <div className="cal-kinds" role="radiogroup" aria-label="Type">
                    {KINDS.map(([k, l]) => (
                        <button key={k} type="button" role="radio" aria-checked={form.kind === k} className={form.kind === k ? "is-on" : ""} onClick={() => set({ kind: k })}>
                            {KIND_ICON[k] === "●" ? "📅" : KIND_ICON[k]} {l}
                        </button>
                    ))}
                </div>

                <label className="cal-check"><input type="checkbox" checked={form.all_day} onChange={(e) => set({ all_day: e.target.checked })} /> All day</label>
                <div className="cal-row2">
                    <label className="field"><span className="field-label">{form.kind === "task" ? "Start" : "Starts"}</span>
                        {form.all_day
                            ? <input type="date" className="input" value={form.start.slice(0, 10)} onChange={(e) => set({ start: `${e.target.value}T00:00`, end: form.end.slice(0, 10) < e.target.value ? `${e.target.value}T23:59` : form.end })} />
                            : <input type="datetime-local" className="input" value={form.start} onChange={(e) => {
                                const s = e.target.value;
                                const len = parseDt(form.end) - parseDt(form.start);
                                set({ start: s, end: form.end <= s ? dtLocal(new Date(+parseDt(s) + Math.max(len, 3600000))) : form.end });
                            }} />}
                    </label>
                    <label className="field"><span className="field-label">{form.kind === "task" ? "Due" : "Ends"}</span>
                        {form.all_day
                            ? <input type="date" className="input" value={form.end.slice(0, 10)} min={form.start.slice(0, 10)} onChange={(e) => set({ end: `${e.target.value}T23:59` })} />
                            : <input type="datetime-local" className="input" value={form.end} min={form.start} onChange={(e) => set({ end: e.target.value })} />}
                    </label>
                </div>

                <div className="cal-row2">
                    <label className="field"><span className="field-label">Repeat</span>
                        <select className="input" value={form.repeat} onChange={(e) => set({ repeat: e.target.value })}>
                            {REPEATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                    </label>
                    {form.repeat !== "none" && (
                        <label className="field"><span className="field-label">Until (optional)</span>
                            <input type="date" className="input" value={form.repeat_until} min={form.start.slice(0, 10)} onChange={(e) => set({ repeat_until: e.target.value })} />
                        </label>
                    )}
                </div>

                <div className="cal-share">
                    <div className="cal-share-head">
                        <span className="field-label">Share with</span>
                        <div className="cal-seg" role="radiogroup" aria-label="Share with">
                            {[["me", "🔒 Only me"], ["people", "👥 Selected people"], ["everyone", "🌐 Everyone"]].map(([k, l]) => (
                                <button key={k} type="button" role="radio" aria-checked={share === k} className={share === k ? "is-on" : ""} onClick={() => setShare(k)}>{l}</button>
                            ))}
                        </div>
                    </div>

                    {share === "everyone" && <p className="cal-share-note">Every employee sees it on their calendar and gets the “due today” popup.</p>}
                    {share === "me" && <p className="cal-share-note">Only you see it.</p>}

                    {share === "people" && (
                        <div className="cal-picker">
                            {form.guests.length > 0 && (
                                <div className="cal-picked">
                                    {form.guests.map((id) => {
                                        const p = people.find((x) => x.id === id);
                                        return (
                                            <span key={id} className="cal-pill">
                                                <i className="cal-av" style={{ background: avColor(id) }}>{initials(p?.name)}</i>
                                                {p?.name || `#${id}`}
                                                <button type="button" onClick={() => toggleGuest(id)} aria-label={`Remove ${p?.name || id}`}>✕</button>
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="cal-pick-search">
                                <span aria-hidden="true">🔎</span>
                                <input placeholder={`Search ${others.length} employee${others.length === 1 ? "" : "s"} by name or role…`} value={q} onChange={(e) => setQ(e.target.value)} />
                                {shown.length > 0 && (
                                    <button type="button" className="cal-pick-all" onClick={toggleAllShown}>{allShownOn ? "Clear these" : `Select ${q ? "these" : "all"} (${shown.length})`}</button>
                                )}
                            </div>
                            <div className="cal-pick-list">
                                {peopleErr && (
                                    <div className="cal-pick-empty">
                                        {peopleErr} <button type="button" className="btn btn-sm" onClick={onRetryPeople}>Try again</button>
                                    </div>
                                )}
                                {!peopleErr && !people.length && <div className="cal-pick-empty">Loading employees…</div>}
                                {!peopleErr && people.length > 0 && !shown.length && <div className="cal-pick-empty">No employee matches “{q}”.</div>}
                                {shown.slice(0, 300).map((p) => {
                                    const on = form.guests.includes(p.id);
                                    return (
                                        <button type="button" key={p.id} className={`cal-pick ${on ? "is-on" : ""}`} onClick={() => toggleGuest(p.id)} aria-pressed={on}>
                                            <i className="cal-av" style={{ background: avColor(p.id) }}>{initials(p.name)}</i>
                                            <span className="cal-pick-name"><b>{p.name}</b>{p.role && <small>{p.role}</small>}</span>
                                            <span className="cal-pick-check">{on ? "✓" : "+"}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="cal-share-note">{form.guests.length ? `${form.guests.length} selected · ` : ""}They see it on their calendar and get the “due today” popup.</p>
                        </div>
                    )}
                </div>

                <div className="field">
                    <span className="field-label">Color</span>
                    <div className="cal-colors">
                        {COLORS.map((c) => (
                            <button type="button" key={c} className={form.color === c ? "is-on" : ""} style={{ background: c }} onClick={() => set({ color: c })} aria-label={`Color ${c}`} />
                        ))}
                    </div>
                </div>

                <label className="field"><span className="field-label">Location</span>
                    <input className="input" value={form.location} onChange={(e) => set({ location: e.target.value })} maxLength={150} placeholder="Office, Zoom link…" />
                </label>
                <label className="field"><span className="field-label">Description</span>
                    <textarea className="input" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
                </label>
                {form.id > 0 && form.repeat !== "none" && <p className="muted small">Changes apply to every time it repeats.</p>}
            </div>
        </Modal>
    );
}

/* ---------------- IT Officer: who may read / write / delete ---------------- */
function AccessManager({ onClose }) {
    const notify = useToast();
    const [rows, setRows] = useState(null);
    const [q, setQ] = useState("");
    const [busy, setBusy] = useState(0);

    useEffect(() => {
        apiFetch("/calendar/access").then(setRows).catch((e) => { notify(e.message || "Couldn't load the access list.", "error"); setRows([]); });
    }, [notify]);

    const put = async (r, patch) => {
        const next = { can_read: r.can_read, can_write: r.can_write, can_delete: r.can_delete, ...patch };
        if (!next.can_read) { next.can_write = false; next.can_delete = false; }     // no read → nothing
        setBusy(r.id);
        try {
            const res = await apiFetch(`/calendar/access/${r.id}`, { method: "PUT", body: JSON.stringify(next) });
            setRows((list) => list.map((x) => (x.id === r.id ? { ...x, ...res, set: true } : x)));
        } catch (e) {
            notify(e.message || "Couldn't save.", "error");
        } finally {
            setBusy(0);
        }
    };

    const shown = (rows || []).filter((r) => !q || `${r.name} ${r.role}`.toLowerCase().includes(q.toLowerCase()));
    return (
        <Modal title="Calendar access" onClose={onClose} size="lg" footer={<button className="btn" onClick={onClose}>Done</button>}>
            <p className="muted small">Read = sees the Calendar and what is shared with them · Write = adds events / tasks and edits their own · Delete = deletes their own. New employees start with Read only.</p>
            <input className="input" placeholder="Search employee or role…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="cal-access">
                <table className="table">
                    <thead><tr><th>Employee</th><th>Role</th><th className="ta-center">Read</th><th className="ta-center">Write</th><th className="ta-center">Delete</th></tr></thead>
                    <tbody>
                        {!rows && <tr><td colSpan={5} className="muted">Loading…</td></tr>}
                        {shown.map((r) => (
                            <tr key={r.id}>
                                <td>{r.name}</td>
                                <td className="muted">{r.role || "—"}</td>
                                {["can_read", "can_write", "can_delete"].map((k) => (
                                    <td key={k} className="ta-center">
                                        <input type="checkbox" checked={!!r[k]} disabled={r.is_admin || busy === r.id}
                                            title={r.is_admin ? "IT Officer always has full access" : undefined}
                                            onChange={(e) => put(r, { [k]: e.target.checked })} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Modal>
    );
}