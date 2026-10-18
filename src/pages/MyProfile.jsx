// My profile (the logged-in staff): same look as "Employee information"
//   Personal · Contact  → he can edit
//   Work · Shift · Banks · photo → view only
//   Leave & OT → calendar (click a day to file leave / overtime) + his requests with status, approved date and who
// A login that is not a staff login (m_user_staff) goes to /settings.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../components/Modal";
import { useToast } from "../components/Toast";
import { PROFILE_SECTIONS, SectionGrid, toBody, toForm, useEmployeeLookups } from "./hr/Employeeform";
import { Badge, DataTable, Field, api, fmtDate, fmtTime, mins, todayPH, useForm } from "./hr/HRShared";
import "./Profile.css";

const TABS = [
    ["personal", "Personal"], ["contact", "Contact"], ["work", "Work"], ["shift", "Shift"], ["bank", "Banks"], ["calendar", "Leave & OT"],
];
const EDITABLE = ["personal", "contact"];
const SUBTITLE = {
    personal: "Name, birth and civil details · you can update these",
    contact: "How to reach you and where you live · you can update these",
    work: "Company, position and contract · set by HR",
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const num = (v) => Number(v) || 0;
const t12 = (t) => {
    if (!t) return "—";
    const [h, m] = String(t).split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const initials = (name = "") => name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addMonth = (month, n) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
const PROFILE_KEYS = EDITABLE.flatMap((s) => PROFILE_SECTIONS[s].fields.map(([k]) => k));

function Tile({ label, value, sub }) {
    return <div className="hr-tile"><small>{label}</small><b>{value}</b>{sub && <span>{sub}</span>}</div>;
}
function Blank({ children }) {
    return <p className="hr-blank">{children}</p>;
}

export default function Profile() {
    const notify = useToast();
    const navigate = useNavigate();
    const lk = useEmployeeLookups();
    const [data, setData] = useState(null);
    const [tab, setTab] = useState("personal");
    const [pf, setPf] = useState(null);
    const [saving, setSaving] = useState(false);

    // refs: navigate / notify may be new functions on every render, the profile must load once
    const navRef = useRef(navigate);
    navRef.current = navigate;
    const notifyRef = useRef(notify);
    notifyRef.current = notify;
    const load = useCallback(() => {
        api.get("/hr/my-profile").then((r) => {
            if (!r.is_staff) { navRef.current("/settings", { replace: true }); return; }
            setData(r);
        }).catch((e) => { notifyRef.current(e.message || "Couldn't load your profile.", "error"); setData(false); });
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (data?.profile) setPf(toForm(data.profile)); }, [data]);

    const saved = data?.profile ? toForm(data.profile) : null;
    const changed = (section) => pf && saved && PROFILE_SECTIONS[section].fields.some(([k]) => String(pf[k]) !== String(saved[k]));
    const dirty = EDITABLE.some(changed);
    const nameOk = pf && pf.last_name.trim() && pf.first_name.trim();
    // photo: picked here, sent to S3 (Employee_Profile) only when "Save changes" is clicked
    const [pending, setPending] = useState(undefined); // undefined = no change · dataURL = new photo · null = remove
    const photoChanged = pending !== undefined;
    const shown = photoChanged ? pending : data?.photo_url || null;
    const pickPhoto = (file) => {
        if (!file) return;
        if (!/^image\//.test(file.type)) { notify("Choose a JPG, PNG or WEBP image.", "error"); return; }
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            // whole picture (no crop), longest side 800 px, JPEG
            const scale = Math.min(1, 800 / Math.max(img.width, img.height));
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * scale);
            c.height = Math.round(img.height * scale);
            const g = c.getContext("2d");
            g.fillStyle = "#fff";
            g.fillRect(0, 0, c.width, c.height);
            g.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            setPending(c.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => { URL.revokeObjectURL(url); notify("This image can't be read.", "error"); };
        img.src = url;
    };

    const save = async () => {
        setSaving(true);
        try {
            const msgs = [];
            if (dirty) {
                const body = toBody(pf);
                msgs.push((await api.put("/hr/my-profile", Object.fromEntries(PROFILE_KEYS.map((k) => [k, body[k]])))).message);
            }
            if (photoChanged) {
                const r = await api.post("/hr/my-profile/photo", { photo: pending });
                msgs.push(r.message);
                setPending(undefined);
                window.dispatchEvent(new CustomEvent("profile-photo", { detail: r.photo_url || null })); // header updates right away
            }
            notify(msgs.filter(Boolean).join(" ") || "Saved.");
            load();
        } catch (e) {
            notify(e.message || "Couldn't save.", "error");
        } finally {
            setSaving(false);
        }
    };
    const discard = () => { setPf(saved); setPending(undefined); };

    if (data === null) return <div className="hr"><section className="card hr-section"><Blank>Loading…</Blank></section></div>;
    if (data === false) return <div className="hr"><section className="card hr-section"><Blank>Couldn't load your profile. Refresh the page to try again.</Blank></section></div>;
    if (!data.linked) {
        return (
            <div className="hr">

                <section className="card hr-section hr-me-empty">
                    <div className="hr-emp-photo is-view"><span>{initials(data.login_name || "") || "?"}</span></div>
                    <div>
                        <h5>{data.login_name || "Your login"}</h5>
                        <p>Your login is not linked to an employee record yet, so there is no profile to show.</p>
                        {data.login_columns?.length > 0 && (
                            <p className="hr-hint">For IT · login columns checked: {data.login_columns.join(", ")}</p>
                        )}
                    </div>
                </section>
            </div>
        );
    }

    const designation = lk?.designations?.find((x) => String(x.value) === String(data.profile.designation_id))?.label;
    const company = lk?.companies?.find((x) => String(x.value) === String(data.profile.company_caid))?.label;

    return (
        <div className="hr">
            <section className="card hr-section hr-me">
                <div className="hr-emp">
                    <aside className="hr-emp-side">
                        <div className="hr-emp-who">
                            <label className={`hr-emp-photo${photoChanged ? " is-pending" : ""}`} title="Choose a photo">
                                {shown ? <img src={shown} alt="" /> : <span>{initials(data.employee.full_name)}</span>}
                                <i>{shown ? "Change photo" : "Choose photo"}</i>
                                <input type="file" accept="image/png,image/jpeg,image/webp" className="hr-file-input" disabled={saving}
                                    onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
                            </label>
                            <b>{data.employee.full_name}</b>
                            {photoChanged && <span className="hr-photo-note">{pending ? "New photo · not saved yet" : "Photo will be removed"}</span>}
                            <div className="hr-photo-act">
                                {photoChanged && <button type="button" className="hr-linkbtn" onClick={() => setPending(undefined)} disabled={saving}>Undo</button>}
                                {shown && <button type="button" className="hr-linkbtn" onClick={() => setPending(data.photo_url ? null : undefined)} disabled={saving}>Remove photo</button>}
                            </div>
                            {designation && <span>{designation}</span>}
                            {company && <span>{company}</span>}
                        </div>
                    </aside>

                    <div className="hr-emp-main">
                        <nav className="hr-emp-tabs" role="tablist" aria-label="My profile">
                            <div className="hr-emp-tabgroup">
                                <div>
                                    {TABS.map(([k, l]) => (
                                        <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-active" : ""} onClick={() => setTab(k)}>
                                            <span>{l}</span>
                                            {EDITABLE.includes(k) && changed(k) && <i className="hr-emp-dot" title="Not saved" />}
                                            {k === "bank" && data.banks.length ? <em>{data.banks.length}</em> : null}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </nav>

                        {/* Personal · Contact (editable) · Work (view only) */}
                        {["personal", "contact", "work"].includes(tab) && pf && (
                            <section className="hr-pop-sec">
                                <header>
                                    <div><h5>{PROFILE_SECTIONS[tab].title}</h5><span className="hr-muted">{SUBTITLE[tab]}</span></div>
                                    {tab === "work" && <span className="hr-viewonly">View only</span>}
                                </header>
                                {!lk ? <Blank>Loading…</Blank> : <SectionGrid section={tab} f={pf} setF={setPf} lk={lk} edit={EDITABLE.includes(tab)} />}
                            </section>
                        )}
                        {(dirty || photoChanged) && (
                            <div className="hr-savebar">
                                <span>{nameOk ? `Not saved yet: ${[dirty && "profile", photoChanged && "photo"].filter(Boolean).join(" and ")}.` : "Last name and first name are required."}</span>
                                <button type="button" className="btn btn-sm" onClick={discard} disabled={saving}>Discard</button>
                                <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={saving || !nameOk}>{saving ? "Saving…" : "Save changes"}</button>
                            </div>
                        )}

                        {/* Shift (view only) */}
                        {tab === "shift" && (
                            <section className="hr-pop-sec">
                                <header>
                                    <div>
                                        <h5>{data.shift?.name || "No shift"} {data.shift_is_default && <Badge status="default" />}</h5>
                                        <span className="hr-muted">{data.shift_is_default ? "You follow the default shift" : "Your own shift"}</span>
                                    </div>
                                    <span className="hr-viewonly">View only</span>
                                </header>
                                {!data.shift ? <Blank>No shift set yet. HR sets it.</Blank> : (
                                    <>
                                        <div className="hr-shift">
                                            <div className="hr-shift-step"><small>Time in</small><b>{t12(data.shift.time_in)}</b></div>
                                            <div className="hr-shift-line" />
                                            <div className="hr-shift-step is-break"><small>Break</small><b>{data.shift.break_in ? `${t12(data.shift.break_in)} – ${t12(data.shift.break_out)}` : "No break"}</b></div>
                                            <div className="hr-shift-line" />
                                            <div className="hr-shift-step"><small>Time out</small><b>{t12(data.shift.time_out)}{data.shift.is_overnight ? " (+1 day)" : ""}</b></div>
                                        </div>
                                        <div className="hr-tiles is-4">
                                            <Tile label="Paid hours" value={`${num(data.shift.paid_hours)} h / day`} />
                                            <Tile label="Grace period" value={`${num(data.shift.grace_minutes)} min`} sub="late allowance" />
                                            <Tile label="Overnight" value={data.shift.is_overnight ? "Yes" : "No"} />
                                            <div className="hr-tile">
                                                <small>Work days</small>
                                                <div className="hr-daychips">
                                                    {DAYS.map((d, i) => <span key={d} className={String(data.shift.work_days || "").split(",").includes(String(i + 1)) ? "is-on" : ""}>{d}</span>)}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </section>
                        )}

                        {/* Banks (view only) */}
                        {tab === "bank" && (
                            <section className="hr-pop-sec">
                                <header>
                                    <div><h5>Bank accounts</h5><span className="hr-muted">Your salary goes to the default account</span></div>
                                    <span className="hr-viewonly">View only</span>
                                </header>
                                {data.banks.length === 0 ? <Blank>No bank account yet. HR adds it.</Blank> : (
                                    <div className="hr-cards">
                                        {data.banks.map((r) => (
                                            <article key={r.id} className={`hr-acct${r.is_default ? " is-default" : ""}`}>
                                                <div className="hr-acct-top"><b>{r.bank_name}</b>{r.is_default ? <Badge status="default" /> : <span className="hr-muted">{r.account_type}</span>}</div>
                                                <div className="hr-acct-no">{r.account_no}</div>
                                                <div className="hr-muted">{r.account_name}{r.branch ? ` · ${r.branch}` : ""}</div>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        {/* Leave & OT */}
                        {tab === "calendar" && <LeaveAndOt shift={data.shift} credits={data.leave_credits} notify={notify} onChanged={load} />}
                    </div>
                </div>
            </section>
        </div>
    );
}

/* ---------------- Leave & OT: calendar + my requests ---------------- */
function LeaveAndOt({ shift, credits, notify, onChanged }) {
    const today = todayPH();
    const [month, setMonth] = useState(today.slice(0, 7));
    const [cal, setCal] = useState({ attendance: [], holidays: [] });
    const [reqs, setReqs] = useState(null);
    const [list, setList] = useState("leave");
    const [pick, setPick] = useState(null); // a date → choose leave / OT
    const [filing, setFiling] = useState(null); // { kind, date }
    const [cancelling, setCancelling] = useState(null);
    const year = month.slice(0, 4);

    const loadReqs = useCallback(() => {
        api.get(`/hr/my-requests?year=${year}`).then(setReqs).catch(() => setReqs({ overtime: [], leaves: [] }));
    }, [year]);
    useEffect(() => { loadReqs(); }, [loadReqs]);
    useEffect(() => {
        api.get(`/hr/my-calendar?month=${month}`).then(setCal).catch(() => setCal({ attendance: [], holidays: [] }));
    }, [month]);

    // the 6-week grid of the month (Sunday first)
    const cells = useMemo(() => {
        const first = new Date(`${month}-01T00:00:00`);
        const start = new Date(first);
        start.setDate(1 - first.getDay());
        return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    }, [month]);
    const byDate = useMemo(() => {
        const m = {};
        const add = (date, key, item) => { (m[date] ??= { leaves: [], ot: [], holidays: [], att: null })[key].push(item); };
        (cal.holidays || []).forEach((h) => add(h.date, "holidays", h));
        (cal.attendance || []).forEach((a) => { (m[a.date] ??= { leaves: [], ot: [], holidays: [], att: null }).att = a; });
        (reqs?.overtime || []).filter((o) => o.status !== "cancelled").forEach((o) => add(String(o.work_date).slice(0, 10), "ot", o));
        (reqs?.leaves || []).filter((l) => l.status !== "cancelled").forEach((l) => {
            for (let d = new Date(`${String(l.date_from).slice(0, 10)}T00:00:00`); ymd(d) <= String(l.date_to).slice(0, 10); d.setDate(d.getDate() + 1)) add(ymd(d), "leaves", l);
        });
        return m;
    }, [cal, reqs]);
    const workDays = String(shift?.work_days || "1,2,3,4,5,6").split(",");
    const isRest = (d) => !workDays.includes(String(d.getDay() === 0 ? 7 : d.getDay()));

    const done = (msg) => { notify(msg); setFiling(null); setCancelling(null); loadReqs(); onChanged(); };
    const fail = (e) => notify(e.message || "Couldn't save.", "error");
    const pending = (reqs?.leaves || []).filter((l) => l.status === "pending").length + (reqs?.overtime || []).filter((o) => o.status === "pending").length;

    return (
        <section className="hr-pop-sec">
            <header>
                <div><h5>Leave & overtime</h5><span className="hr-muted">Click a day to file a leave or overtime{pending ? ` · ${pending} waiting for approval` : ""}</span></div>
                <div className="hr-toolbar">
                    <button type="button" className="btn btn-sm" onClick={() => setFiling({ kind: "overtime", date: today })}>File overtime</button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setFiling({ kind: "leave", date: today })}>File leave</button>
                </div>
            </header>

            {/* calendar */}
            <div className="hr-cal">
                <div className="hr-cal-head">
                    <button type="button" className="hr-back" onClick={() => setMonth((m) => addMonth(m, -1))} aria-label="Previous month">‹</button>
                    <b>{monthLabel(month)}</b>
                    <button type="button" className="hr-back" onClick={() => setMonth((m) => addMonth(m, 1))} aria-label="Next month">›</button>
                    {month !== today.slice(0, 7) && <button type="button" className="btn btn-sm" onClick={() => setMonth(today.slice(0, 7))}>Today</button>}
                    <div className="hr-cal-legend">
                        <span className="is-leave">Leave</span><span className="is-ot">Overtime</span><span className="is-holiday">Holiday</span><span className="is-present">Worked</span>
                    </div>
                </div>
                <div className="hr-cal-grid">
                    {WEEK.map((w) => <div key={w} className="hr-cal-dow">{w}</div>)}
                    {cells.map((d) => {
                        const key = ymd(d);
                        const info = byDate[key] || {};
                        const out = key.slice(0, 7) !== month;
                        const cls = ["hr-cal-day", out && "is-out", key === today && "is-today", isRest(d) && "is-rest", info.holidays?.length && "is-holiday"].filter(Boolean).join(" ");
                        const att = info.att;
                        return (
                            <button key={key} type="button" className={cls} onClick={() => setPick(key)} title="File leave or overtime on this day">
                                <span className="hr-cal-num">{d.getDate()}</span>
                                {info.holidays?.map((h) => <span key={h.name} className="hr-cal-chip is-holiday">{h.name}</span>)}
                                {info.leaves?.map((l) => <span key={`l${l.id}`} className={`hr-cal-chip is-leave is-${l.status}`}>{l.leave_type?.code || "Leave"}{l.is_half_day ? ` ½ ${l.half_day_part || ""}` : ""}</span>)}
                                {info.ot?.map((o) => <span key={`o${o.id}`} className={`hr-cal-chip is-ot is-${o.status}`}>OT {mins(o.minutes)}</span>)}
                                {att && att.time_in && <span className={`hr-cal-chip is-present${att.late_minutes ? " is-late" : ""}`}>{fmtTime(att.time_in)}{att.late_minutes ? ` · late ${att.late_minutes}m` : ""}</span>}
                                {att && !att.time_in && att.status === "absent" && <span className="hr-cal-chip is-absent">Absent</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* my requests */}
            <div className="hr-me-list">
                <div className="hr-seg is-inline" role="tablist">
                    <button type="button" className={list === "leave" ? "is-on" : ""} onClick={() => setList("leave")}>My leave ({reqs?.leaves?.length || 0})</button>
                    <button type="button" className={list === "overtime" ? "is-on" : ""} onClick={() => setList("overtime")}>My overtime ({reqs?.overtime?.length || 0})</button>
                </div>
                <span className="hr-muted">{year}</span>
            </div>
            {list === "leave" ? (
                <DataTable loading={!reqs} rows={reqs?.leaves || []} empty={`No leave filed in ${year}.`} cols={[
                    { key: "date_from", label: "Dates", render: (r) => (String(r.date_from).slice(0, 10) === String(r.date_to).slice(0, 10) ? fmtDate(r.date_from) : `${fmtDate(r.date_from)} – ${fmtDate(r.date_to)}`) },
                    { key: "type", label: "Leave", render: (r) => <><b>{r.leave_type?.code}</b><span className="hr-sub">{r.leave_type?.name}</span></> },
                    { key: "days", label: "Days", cls: "n", render: (r) => `${num(r.days)}${r.is_half_day ? ` (${r.half_day_part || "half"})` : ""}` },
                    { key: "reason", label: "Reason", cls: "wrap" },
                    { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> },
                    { key: "approved_at", label: "Approved / decided", render: (r) => (r.status === "pending" ? <span className="hr-muted">Waiting</span> : <>{fmtDate(r.approved_at)}<span className="hr-sub">{r.decided_by ? `by ${r.decided_by}` : ""}</span></>) },
                    { key: "remarks", label: "Remarks", cls: "wrap", render: (r) => r.approver_remarks || "—" },
                    { key: "act", label: "", cls: "n", render: (r) => (r.status === "pending" ? <button type="button" className="btn btn-sm" onClick={() => setCancelling({ kind: "leave", row: r })}>Cancel</button> : null) },
                ]} />
            ) : (
                <DataTable loading={!reqs} rows={reqs?.overtime || []} empty={`No overtime filed in ${year}.`} cols={[
                    { key: "work_date", label: "Date", render: (r) => fmtDate(r.work_date) },
                    { key: "time", label: "Time", render: (r) => `${fmtTime(r.time_start)} – ${fmtTime(r.time_end)}` },
                    { key: "minutes", label: "Hours", cls: "n", render: (r) => mins(r.minutes) },
                    { key: "reason", label: "Reason", cls: "wrap" },
                    { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> },
                    { key: "approved_at", label: "Approved / decided", render: (r) => (r.status === "pending" ? <span className="hr-muted">Waiting</span> : <>{fmtDate(r.approved_at)}<span className="hr-sub">{r.decided_by ? `by ${r.decided_by}` : ""}</span></>) },
                    { key: "remarks", label: "Remarks", cls: "wrap", render: (r) => r.approver_remarks || "—" },
                    { key: "act", label: "", cls: "n", render: (r) => (r.status === "pending" ? <button type="button" className="btn btn-sm" onClick={() => setCancelling({ kind: "overtime", row: r })}>Cancel</button> : null) },
                ]} />
            )}

            {pick && (
                <Modal title={fmtDate(pick)} onClose={() => setPick(null)} footer={<button className="btn" onClick={() => setPick(null)}>Close</button>}>
                    <div className="hr-me-pick">
                        <button type="button" onClick={() => { setFiling({ kind: "leave", date: pick }); setPick(null); }}>
                            <b>File leave</b><span>Vacation, sick or other leave starting this day</span>
                        </button>
                        <button type="button" onClick={() => { setFiling({ kind: "overtime", date: pick }); setPick(null); }}>
                            <b>File overtime</b><span>Extra hours worked on this day</span>
                        </button>
                    </div>
                </Modal>
            )}
            {filing?.kind === "leave" && <MyLeaveForm date={filing.date} credits={credits} onClose={() => setFiling(null)} onDone={done} onFail={fail} />}
            {filing?.kind === "overtime" && <MyOvertimeForm date={filing.date} shift={shift} onClose={() => setFiling(null)} onDone={done} onFail={fail} />}
            {cancelling && (
                <Modal title={`Cancel this ${cancelling.kind === "leave" ? "leave" : "overtime"}?`} onClose={() => setCancelling(null)}
                    footer={<><button className="btn" onClick={() => setCancelling(null)}>Keep it</button>
                        <button className="btn btn-primary" onClick={() => api.put(`/hr/my-requests/${cancelling.kind}/${cancelling.row.id}/cancel`).then((r) => done(r.message)).catch(fail)}>Cancel request</button></>}>
                    <p className="hr-note">
                        {cancelling.kind === "leave"
                            ? `${cancelling.row.leave_type?.code || "Leave"} · ${fmtDate(cancelling.row.date_from)}${String(cancelling.row.date_from).slice(0, 10) !== String(cancelling.row.date_to).slice(0, 10) ? ` – ${fmtDate(cancelling.row.date_to)}` : ""} · ${num(cancelling.row.days)} day(s)`
                            : `${fmtDate(cancelling.row.work_date)} · ${fmtTime(cancelling.row.time_start)} – ${fmtTime(cancelling.row.time_end)}`}
                    </p>
                </Modal>
            )}
        </section>
    );
}

function MyLeaveForm({ date, credits, onClose, onDone, onFail }) {
    const [types, setTypes] = useState([]);
    useEffect(() => { api.get("/hr/lookups").then((r) => setTypes(r.leave_types.filter((t) => t.is_active))).catch(() => { }); }, []);
    const [f, set] = useForm({ leave_type_id: "", date_from: date, date_to: date, is_half_day: false, half_day_part: "AM", reason: "" });
    const [busy, setBusy] = useState(false);
    const credit = credits.find((c) => String(c.leave_type_id) === String(f.leave_type_id));
    const save = () => {
        setBusy(true);
        api.post("/hr/leaves", {
            ...f, leave_type_id: Number(f.leave_type_id), date_to: f.is_half_day ? f.date_from : f.date_to, half_day_part: f.is_half_day ? f.half_day_part : null,
        }).then((r) => onDone(r.message)).catch(onFail).finally(() => setBusy(false));
    };
    return (
        <Modal title="File leave" onClose={onClose}
            footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy || !f.leave_type_id || !f.reason.trim()}>{busy ? "Filing…" : "File leave"}</button></>}>
            <div className="hr-entry">
                <div className="hr-entry-row">
                    <Field label="Leave type" wide>
                        <select className="input" value={f.leave_type_id} onChange={set("leave_type_id")} autoFocus>
                            <option value="">Select…</option>
                            {types.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}{t.is_paid ? "" : " (unpaid)"}</option>)}
                        </select>
                    </Field>
                </div>
                {f.leave_type_id && (
                    <div className="hr-calc">
                        <span><small>Days left</small><b>{credit ? num(credit.remaining_days) : "—"}</b></span>
                        <span><small>Allowed</small><b>{credit ? num(credit.allowed_days) + num(credit.carried_over) : "—"}</b></span>
                        <span><small>Used</small><b>{credit ? num(credit.used_days) : "—"}</b></span>
                    </div>
                )}
                <fieldset className="hr-entry-times is-3">
                    <legend>When</legend>
                    <Field label={f.is_half_day ? "Date" : "From"}><input type="date" className="input" value={f.date_from} onChange={(e) => { set("date_from", e.target.value); if (f.date_to < e.target.value) set("date_to", e.target.value); }} /></Field>
                    {f.is_half_day ? (
                        <Field label="Half">
                            <select className="input" value={f.half_day_part} onChange={set("half_day_part")}><option value="AM">Morning (AM)</option><option value="PM">Afternoon (PM)</option></select>
                        </Field>
                    ) : <Field label="To"><input type="date" className="input" value={f.date_to} min={f.date_from} onChange={set("date_to")} /></Field>}
                    <label className="hr-check"><input type="checkbox" checked={f.is_half_day} onChange={set("is_half_day")} /> Half day</label>
                </fieldset>
                <Field label="Reason" wide><input className="input" value={f.reason} onChange={set("reason")} placeholder="e.g. Family event, check-up" /></Field>
                <p className="hr-hint">Only your work days are counted. Rest days and holidays are skipped.</p>
            </div>
        </Modal>
    );
}

function MyOvertimeForm({ date, shift, onClose, onDone, onFail }) {
    const [rates, setRates] = useState([]);
    useEffect(() => { api.get("/hr/lookups").then((r) => setRates(r.pay_rates.filter((x) => x.is_active && x.code.includes("OT")))).catch(() => { }); }, []);
    const out = shift?.time_out ? String(shift.time_out).slice(0, 5) : "17:00";
    const later = (t, h) => { const [a, b] = t.split(":").map(Number); return `${String((a + h) % 24).padStart(2, "0")}:${String(b).padStart(2, "0")}`; };
    const [f, set] = useForm({ work_date: date, start: out, end: later(out, 2), pay_rate_code: "REG_OT", reason: "" });
    const [busy, setBusy] = useState(false);
    const nextDay = f.end <= f.start;
    const [sh, sm] = f.start.split(":").map(Number);
    const [eh, em] = f.end.split(":").map(Number);
    const minutes = ((eh * 60 + em) - (sh * 60 + sm) + (nextDay ? 1440 : 0));
    const save = () => {
        setBusy(true);
        const end = nextDay ? ymd(new Date(new Date(`${f.work_date}T00:00:00`).getTime() + 86400000)) : f.work_date;
        api.post("/hr/overtime", {
            work_date: f.work_date, time_start: `${f.work_date} ${f.start}:00`, time_end: `${end} ${f.end}:00`, pay_rate_code: f.pay_rate_code, reason: f.reason,
        }).then((r) => onDone(r.message)).catch(onFail).finally(() => setBusy(false));
    };
    return (
        <Modal title="File overtime" onClose={onClose}
            footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy || !f.reason.trim() || minutes <= 0}>{busy ? "Filing…" : "File overtime"}</button></>}>
            <div className="hr-entry">
                <div className="hr-entry-row">
                    <Field label="Date"><input type="date" className="input" value={f.work_date} onChange={set("work_date")} /></Field>
                    <Field label="Kind">
                        <select className="input" value={f.pay_rate_code} onChange={set("pay_rate_code")}>
                            {rates.length === 0 && <option value="REG_OT">Regular overtime</option>}
                            {rates.map((r) => <option key={r.code} value={r.code}>{r.description || r.code}</option>)}
                        </select>
                    </Field>
                </div>
                <fieldset className="hr-entry-times is-3">
                    <legend>Time</legend>
                    <Field label="Start"><input type="time" className="input" value={f.start} onChange={set("start")} /></Field>
                    <Field label="End" hint={nextDay ? "Ends the next day" : ""}><input type="time" className="input" value={f.end} onChange={set("end")} /></Field>
                    <div className="hr-calc is-one"><span><small>Total</small><b>{mins(minutes)}</b></span></div>
                </fieldset>
                <Field label="Reason" wide><input className="input" value={f.reason} onChange={set("reason")} placeholder="e.g. Month-end closing" /></Field>
                <p className="hr-hint">Your supervisor approves it. Approved overtime is paid in the payroll.</p>
            </div>
        </Modal>
    );
}