// HR → Dashboard: today at a glance + a month calendar (holidays, leave, overtime, birthdays, pay days, attendance)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../../components/Modal";
import PersonAvatar from "../../components/PersonAvatar";
import { Badge, api, fmtDate, mins, n2, todayPH } from "./HRShared";
import "./HRDashboard.css";

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMPTY = { holidays: [], leaves: [], overtime: [], birthdays: [], payroll: [], present: 0, late: 0 };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addMonth = (month, n) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
const shortDate = (v) => new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
const dayTitle = (v) => new Date(`${v}T00:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export default function HRDashboard() {
    const navigate = useNavigate();
    const today = todayPH();
    const [month, setMonth] = useState(today.slice(0, 7));
    const [data, setData] = useState(null);
    const [open, setOpen] = useState(null); // a date
    const [hideParty, setHideParty] = useState(false);

    const load = useCallback(() => {
        api.get(`/hr/dashboard?month=${month}`).then(setData).catch(() => setData(false));
    }, [month]);
    useEffect(() => { load(); }, [load]);

    const cells = useMemo(() => {
        const first = new Date(`${month}-01T00:00:00`);
        const start = new Date(first);
        start.setDate(1 - first.getDay());
        return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    }, [month]);
    const dayOf = (key) => ({ ...EMPTY, ...(data?.days?.[key] || {}) });
    const s = data?.stats || {};

    return (
        <div className="hr hd">
            {/* birthday celebration */}
            {!hideParty && data?.birthdays_today?.length > 0 && (
                <BirthdayBanner people={data.birthdays_today} soon={data.birthdays_soon || []} onClose={() => setHideParty(true)} />
            )}

            {/* today */}
            <div className="hd-stats">
                <Stat label="Employees" value={s.employees ?? "—"} sub="active" />
                <Stat label="Present today" value={s.present ?? "—"} sub={s.employees ? `of ${s.employees} · ${Math.max(0, s.employees - (s.present || 0) - (s.on_leave || 0))} not in yet` : ""} tone="green" />
                <Stat label="Late today" value={s.late ?? "—"} sub="came in after the grace period" tone="orange" />
                <Stat label="On leave today" value={s.on_leave ?? "—"} sub="approved leave" tone="blue" />
                <Stat label="Leave to approve" value={s.pending_leave ?? "—"} sub="Manage leave ›" tone="violet" onClick={() => navigate("/hr/manage-leave")} />
                <Stat label="Overtime to approve" value={s.pending_ot ?? "—"} sub="Manage overtime ›" tone="violet" onClick={() => navigate("/hr/manage-overtime")} />
            </div>

            <div className="hd-main">
                {/* calendar */}
                <section className="card hd-cal">
                    <header className="hd-cal-head">
                        <button type="button" className="hd-nav" onClick={() => setMonth((m) => addMonth(m, -1))} aria-label="Previous month">‹</button>
                        <b>{monthLabel(month)}</b>
                        <button type="button" className="hd-nav" onClick={() => setMonth((m) => addMonth(m, 1))} aria-label="Next month">›</button>
                        {month !== today.slice(0, 7) && <button type="button" className="btn btn-sm" onClick={() => setMonth(today.slice(0, 7))}>Today</button>}
                        <div className="hd-legend">
                            <span className="is-holiday">Holiday</span><span className="is-pay">Pay day</span><span className="is-leave">Leave</span>
                            <span className="is-ot">Overtime</span><span className="is-bday">Birthday</span><span className="is-in">Attendance</span>
                        </div>
                    </header>
                    <div className="hd-grid">
                        {WEEK.map((w) => <div key={w} className="hd-dow">{w}</div>)}
                        {cells.map((d) => {
                            const key = ymd(d);
                            const x = dayOf(key);
                            const pendingLeave = x.leaves.filter((l) => l.status === "pending").length;
                            const pendingOt = x.overtime.filter((o) => o.status === "pending").length;
                            const cls = ["hd-day", key.slice(0, 7) !== month && "is-out", key === today && "is-today", (d.getDay() === 0) && "is-sun", x.holidays.length && "is-holiday"].filter(Boolean).join(" ");
                            return (
                                <button key={key} type="button" className={cls} onClick={() => setOpen(key)}>
                                    <span className="hd-num">{d.getDate()}</span>
                                    {x.holidays.map((h) => <span key={h.name} className="hd-chip is-holiday" title={h.name}>{h.name}</span>)}
                                    {x.payroll.map((p) => <span key={p.id} className="hd-chip is-pay" title={`${p.code} · ${p.status}`}>Pay day · {p.code.replace(/^PR-\d{4}-/, "")}</span>)}
                                    {x.leaves.length > 0 && (
                                        <span className={`hd-chip is-leave${pendingLeave === x.leaves.length ? " is-pending" : ""}`}>
                                            {x.leaves.length === 1 ? `${x.leaves[0].employee.split(",")[0]} · ${x.leaves[0].type || "Leave"}` : `${x.leaves.length} on leave`}
                                        </span>
                                    )}
                                    {x.overtime.length > 0 && (
                                        <span className={`hd-chip is-ot${pendingOt === x.overtime.length ? " is-pending" : ""}`}>
                                            {x.overtime.length === 1 ? `${x.overtime[0].employee.split(",")[0]} · OT ${mins(x.overtime[0].minutes)}` : `${x.overtime.length} overtime`}
                                        </span>
                                    )}
                                    {x.birthdays.length > 0 && (
                                        <span className="hd-chip is-bday">{x.birthdays.length === 1 ? `${x.birthdays[0].employee.split(",")[0]}'s birthday` : `${x.birthdays.length} birthdays`}</span>
                                    )}
                                    {x.present > 0 && <span className="hd-in">{x.present} in{x.late ? ` · ${x.late} late` : ""}</span>}
                                </button>
                            );
                        })}
                    </div>
                    {data === false && <p className="hd-none">Couldn't load the dashboard. Refresh to try again.</p>}
                </section>

                {/* side */}
                <aside className="hd-side">
                    <section className="card hd-panel">
                        <header><b>On leave today</b><span>{fmtDate(today)}</span></header>
                        {!data ? <p className="hd-none">Loading…</p> : data.on_leave_today.length === 0 ? <p className="hd-none">Everyone is in today.</p> : (
                            <ul className="hd-list">
                                {data.on_leave_today.map((l, i) => (
                                    <li key={i}><b>{l.employee}</b><span>{l.type_name || l.type}{l.half ? ` · ${l.half}` : ""} · until {shortDate(l.until)}</span></li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="card hd-panel">
                        <header><b>Waiting for approval</b><span>{data ? data.pending.length : ""}</span></header>
                        {!data ? <p className="hd-none">Loading…</p> : data.pending.length === 0 ? <p className="hd-none">Nothing to approve.</p> : (
                            <ul className="hd-list is-click">
                                {data.pending.slice(0, 8).map((p) => (
                                    <li key={`${p.kind}${p.id}`}>
                                        <button type="button" onClick={() => navigate(p.kind === "leave" ? "/hr/manage-leave" : "/hr/manage-overtime")}>
                                            <b>{p.employee}</b>
                                            <span>
                                                <em className={`hd-tag is-${p.kind}`}>{p.kind === "leave" ? p.what : "OT"}</em>
                                                {p.from === p.to ? shortDate(p.from) : `${shortDate(p.from)} – ${shortDate(p.to)}`}
                                                {p.kind === "leave" ? ` · ${p.days} day(s)` : ` · ${mins(p.minutes)}`}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="card hd-panel">
                        <header><b>Birthdays</b><span>{monthLabel(month)}</span></header>
                        {!data ? <p className="hd-none">Loading…</p> : data.birthdays.length === 0 ? <p className="hd-none">No birthday this month.</p> : (
                            <ul className="hd-list">
                                {data.birthdays.map((b, i) => <li key={i}><b>{b.employee}</b><span>{shortDate(b.date)} · turns {b.age}</span></li>)}
                            </ul>
                        )}
                    </section>

                    {data?.next_payroll && (
                        <section className="card hd-panel is-pay">
                            <header><b>Next payroll</b><Badge status={data.next_payroll.status} /></header>
                            <button type="button" className="hd-payroll" onClick={() => navigate("/hr/payroll")}>
                                <b>{data.next_payroll.code}</b>
                                <span>{shortDate(data.next_payroll.period_from)} – {shortDate(data.next_payroll.period_to)} · pay {shortDate(data.next_payroll.pay_date)}</span>
                                {data.next_payroll.total_net > 0 && <span>Net {n2(data.next_payroll.total_net)}</span>}
                            </button>
                        </section>
                    )}
                </aside>
            </div>

            {open && <DayModal date={open} day={dayOf(open)} onClose={() => setOpen(null)} />}
        </div>
    );
}

/* ---------------- birthday celebration ---------------- */
const titleCase = (v = "") => String(v).toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
const firstName = (p) => titleCase((p.first_name || String(p.employee).split(",")[1]?.trim() || p.employee).split(" ")[0]);
const joinNames = (list) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

function BirthdayBanner({ people, soon, onClose }) {
    const names = people.map(firstName);
    return (
        <section className="hd-party" aria-label="Birthday today">
            {/* confetti + balloons (CSS) */}
            <div className="hd-confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} />)}</div>
            <div className="hd-balloons" aria-hidden="true"><span /><span /><span /></div>

            <svg className="hd-cake" viewBox="0 0 120 120" aria-hidden="true">
                <rect x="18" y="70" width="84" height="34" rx="8" className="c-base" />
                <rect x="26" y="46" width="68" height="28" rx="7" className="c-top" />
                <path d="M26 58 q8 8 17 0 t17 0 t17 0 t17 0 v-5 h-68z" className="c-icing" />
                <path d="M18 84 q10 9 21 0 t21 0 t21 0 t21 0 v-6 h-84z" className="c-icing" />
                <rect x="44" y="28" width="6" height="18" rx="2" className="c-candle" />
                <rect x="57" y="24" width="6" height="22" rx="2" className="c-candle is-2" />
                <rect x="70" y="28" width="6" height="18" rx="2" className="c-candle" />
                <ellipse cx="47" cy="22" rx="3.5" ry="6" className="c-flame" />
                <ellipse cx="60" cy="18" rx="3.5" ry="6" className="c-flame" />
                <ellipse cx="73" cy="22" rx="3.5" ry="6" className="c-flame" />
            </svg>

            <div className="hd-party-text">
                <small>Today we celebrate</small>
                <h3>Happy birthday, {joinNames(names)}!</h3>
                <div className="hd-party-people">
                    {people.map((p) => (
                        <div key={p.id} className="hd-party-person">
                            <PersonAvatar className="hd-party-face" photo={p.photo_url} gender={p.gender} />
                            <div><b>{titleCase(p.employee)}</b><span>turns {p.age} today</span></div>
                        </div>
                    ))}
                </div>
            </div>

            {soon.length > 0 && (
                <div className="hd-party-soon">
                    <small>Coming up</small>
                    {soon.slice(0, 4).map((p) => (
                        <span key={p.id}><b>{firstName(p)}</b> · {p.in_days === 1 ? "tomorrow" : `in ${p.in_days} days`}</span>
                    ))}
                </div>
            )}
            <button type="button" className="hd-party-x" onClick={onClose} aria-label="Hide">×</button>
        </section>
    );
}

function Stat({ label, value, sub, tone = "", onClick }) {
    const Tag = onClick ? "button" : "div";
    return (
        <Tag type={onClick ? "button" : undefined} className={`card hd-stat${tone ? ` is-${tone}` : ""}${onClick ? " is-click" : ""}`} onClick={onClick}>
            <small>{label}</small>
            <b>{value}</b>
            {sub && <span>{sub}</span>}
        </Tag>
    );
}

function DayModal({ date, day, onClose }) {
    const empty = !day.holidays.length && !day.payroll.length && !day.leaves.length && !day.overtime.length && !day.birthdays.length && !day.present;
    return (
        <Modal title={dayTitle(date)} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
            <div className="hd-day-detail">
                {empty && <p className="hd-none">Nothing on this day.</p>}
                {day.holidays.map((h) => (
                    <div key={h.name} className="hd-banner is-holiday"><b>{h.name}</b><span>{h.type === "regular" ? "Regular holiday" : "Special non-working day"}</span></div>
                ))}
                {day.payroll.map((p) => (
                    <div key={p.id} className="hd-banner is-pay"><b>Pay day · {p.code}</b><span>{p.status}</span></div>
                ))}
                {day.leaves.length > 0 && (
                    <section>
                        <h6>On leave ({day.leaves.length})</h6>
                        <ul className="hd-list">
                            {day.leaves.map((l, i) => (
                                <li key={i} className="is-row"><b>{l.employee}</b><span>{l.type_name || l.type}{l.half ? ` · ${l.half}` : ""}</span><Badge status={l.status} /></li>
                            ))}
                        </ul>
                    </section>
                )}
                {day.overtime.length > 0 && (
                    <section>
                        <h6>Overtime ({day.overtime.length})</h6>
                        <ul className="hd-list">
                            {day.overtime.map((o, i) => (
                                <li key={i} className="is-row"><b>{o.employee}</b><span>{mins(o.minutes)}</span><Badge status={o.status} /></li>
                            ))}
                        </ul>
                    </section>
                )}
                {day.birthdays.length > 0 && (
                    <section>
                        <h6>Birthdays</h6>
                        <ul className="hd-list">{day.birthdays.map((b, i) => <li key={i} className="is-row"><b>{b.employee}</b><span>turns {b.age}</span></li>)}</ul>
                    </section>
                )}
                {day.present > 0 && (
                    <section>
                        <h6>Attendance</h6>
                        <p className="hd-att"><b>{day.present}</b> timed in{day.late ? <> · <b>{day.late}</b> late</> : null}</p>
                    </section>
                )}
            </div>
        </Modal>
    );
}