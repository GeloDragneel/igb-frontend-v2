// Monitoring → Efficiency → Employee Performance (dashboard of one employee)
//   Top: Day / Week / Month · ‹ Employee › (active + Regular) · ‹ Client ›   (‹ › = previous / next)
//   Tiles: total scanned, pending, confirmed · sales, purchases, expenses typed in by hand (not from a scan)
//   Work efficiency: first entry → last entry per day, minus the 2-hour break → entries per hour / minute
//   Assigned clients: scans by status (pending, confirmed, invalid, partially invalid, cancel) + manual entries
//   Data analyst: assigned_daid · Auditor: assigned_auid (an employee with both gets a DA / Auditor switch)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SearchSelect from "../../components/SearchSelect";
import { apiFetch } from "../../context/AuthContext";
import "./EmployeePerformance.css";

/* ---------------- dates (local, no UTC shift) ---------------- */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const addMonths = (s, n) => { const d = parse(s); return ymd(new Date(d.getFullYear(), d.getMonth() + n, 1)); };
const TODAY = ymd(new Date());

const MODES = [{ key: "day", label: "Day" }, { key: "week", label: "Week" }, { key: "month", label: "Month" }];

function periodOf(mode, anchor) {
    const d = parse(anchor);
    if (mode === "day") {
        return { from: anchor, to: anchor, label: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) };
    }
    if (mode === "week") {                                 // Monday – Sunday
        const mon = new Date(d);
        mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        const f = (x, y) => x.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(y ? { year: "numeric" } : {}) });
        return { from: ymd(mon), to: ymd(sun), label: `${f(mon)} – ${f(sun, true)}` };
    }
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: ymd(first), to: ymd(last), label: first.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
}
const shift = (mode, anchor, step) => (mode === "day" ? addDays(anchor, step) : mode === "week" ? addDays(anchor, 7 * step) : addMonths(anchor, step));

/* ---------------- formatting ---------------- */
const n0 = (v) => (Number(v) || 0).toLocaleString("en-PH");
const dash = (v) => (Number(v) ? n0(v) : "—");
const num1 = (v) => (v == null ? "—" : Number(v).toLocaleString("en-PH", { maximumFractionDigits: 2 }));
const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
// 545 → "9h 05m"
const hm = (min) => { const m = Math.max(0, Math.round(Number(min) || 0)); return `${Math.floor(m / 60)}h ${pad(m % 60)}m`; };
// "13:05" → "1:05 PM"
const clock = (t) => {
    if (!t) return "—";
    const [h, m] = t.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
};
const dayText = (s) => parse(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const hourText = (h) => clock(`${h}:00`).replace(":00", "");

const C = { brand: "var(--brand)", red: "var(--red)", green: "var(--green)", orange: "var(--orange)", blue: "var(--blue)", muted: "var(--muted)" };
const tipStyle = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)", fontSize: 12 };
const axis = { axisLine: false, tickLine: false, tick: { fill: C.muted, fontSize: 11 } };

/* =========================================================
   page
   ========================================================= */
export default function EfficiencyMonitoring() {
    const [mode, setMode] = useState("month");
    const [anchor, setAnchor] = useState(TODAY);
    const [empId, setEmpId] = useState("");
    const [caid, setCaid] = useState("");
    const [view, setView] = useState("");                 // "da" | "au" ("" = by designation)

    const [employees, setEmployees] = useState(null);
    const [roles, setRoles] = useState({ da: 3, au: 5 });  // designation ids from the server
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const reqId = useRef(0);

    const period = useMemo(() => periodOf(mode, anchor), [mode, anchor]);

    // active + Regular employees → start on the first data analyst
    useEffect(() => {
        apiFetch("/monitoring/performance/lookups")
            .then((r) => {
                const list = r.employees || [];
                setEmployees(list);
                setRoles({ da: r.data_analyst, au: r.auditor });
                const first = list.find((e) => e.designation_id === r.data_analyst) || list[0];
                if (first) setEmpId(String(first.id));
            })
            .catch((e) => { setEmployees([]); setError(e.message || "Couldn't load the employees."); });
    }, []);

    const load = useCallback(async () => {
        if (!empId) return;
        const id = ++reqId.current;
        setLoading(true);
        setError("");
        try {
            const qs = new URLSearchParams({ from: period.from, to: period.to, ...(caid ? { caid } : {}) });
            const res = await apiFetch(`/monitoring/performance/${empId}?${qs}`);
            if (id === reqId.current) setData(res);
        } catch (e) {
            if (id === reqId.current) setError(e.message || "Couldn't load the employee performance.");
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    }, [empId, caid, period.from, period.to]);

    useEffect(() => { load(); }, [load]);

    /* ---------- employee ‹ › ---------- */
    // grouped by designation: Data Analyst first, then Auditor, then the rest A–Z (names A–Z inside each)
    const employeeOpts = useMemo(() => {
        const rank = (e) => (e.designation_id === roles.da ? 0 : e.designation_id === roles.au ? 1 : 2);
        return [...(employees || [])]
            .sort((a, b) => rank(a) - rank(b)
                || (a.designation || "~").localeCompare(b.designation || "~")
                || a.name.localeCompare(b.name))
            .map((e) => ({ value: String(e.id), label: e.name, hint: e.company || "", group: e.designation || "No designation" }));
    }, [employees, roles]);
    const pickEmployee = (v) => { setEmpId(v); setCaid(""); setView(""); };
    const stepEmployee = (step) => {
        if (!employeeOpts.length) return;
        const i = employeeOpts.findIndex((o) => o.value === empId);
        pickEmployee(employeeOpts[(i + step + employeeOpts.length) % employeeOpts.length].value);
    };

    /* ---------- DA / auditor view ---------- */
    const hasDa = !!data && (data.da.clients > 0 || data.da.total > 0);
    const hasAu = !!data && (data.au.clients > 0 || data.au.total > 0 || data.au.actions > 0);
    const role = view || (data?.role === "auditor" ? "au" : data?.role === "da" ? "da" : hasAu && !hasDa ? "au" : "da");
    const switchView = (v) => { setView(v); setCaid(""); };

    /* ---------- client ‹ › (assigned clients of the view) ---------- */
    const clients = useMemo(() => (role === "au" ? data?.au_clients : data?.da_clients) || [], [data, role]);
    const clientOpts = useMemo(() => [
        { value: "", label: "All clients" },
        ...clients.map((c) => ({ value: String(c.id), label: c.trade_name || c.client_name || c.branch_code, hint: [c.branch_code, c.client_name].filter(Boolean).join(" · ") })),
    ], [clients]);
    const stepClient = (step) => {
        if (clientOpts.length < 2) return;
        const i = Math.max(0, clientOpts.findIndex((o) => o.value === caid));
        setCaid(clientOpts[(i + step + clientOpts.length) % clientOpts.length].value);
    };
    const clientName = caid ? clientOpts.find((o) => o.value === caid)?.label : "";

    return (
        <div className="ep">
            <section className="card ep-bar">
                <div className="ep-title">
                    <h4>Employee Performance</h4>
                    <span>{period.label}{clientName ? ` · ${clientName}` : ""}</span>
                </div>

                <div className="ep-controls">
                    <div className="ep-seg" role="tablist" aria-label="Period">
                        {MODES.map((m) => (
                            <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} className={mode === m.key ? "is-on" : ""} onClick={() => setMode(m.key)}>
                                {m.label}
                            </button>
                        ))}
                    </div>

                    <div className="ep-step-group">
                        <button type="button" className="ep-step" onClick={() => setAnchor((a) => shift(mode, a, -1))} aria-label="Previous period">‹</button>
                        {mode === "month"
                            ? <input type="month" className="input ep-date" value={anchor.slice(0, 7)} onChange={(e) => e.target.value && setAnchor(`${e.target.value}-01`)} aria-label="Month" />
                            : <input type="date" className="input ep-date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} aria-label={mode === "week" ? "Any day of the week" : "Day"} />}
                        <button type="button" className="ep-step" onClick={() => setAnchor((a) => shift(mode, a, 1))} aria-label="Next period">›</button>
                    </div>

                    <div className="field">
                        <span className="field-label">Employee</span>
                        <div className="ep-step-group ep-pick">
                            <button type="button" className="ep-step" onClick={() => stepEmployee(-1)} disabled={!employeeOpts.length} aria-label="Previous employee">‹</button>
                            <SearchSelect value={empId} onChange={pickEmployee} options={employeeOpts} placeholder="Select employee" searchPlaceholder="Search employee..." aria-label="Employee" />
                            <button type="button" className="ep-step" onClick={() => stepEmployee(1)} disabled={!employeeOpts.length} aria-label="Next employee">›</button>
                        </div>
                    </div>

                    <div className="field">
                        <span className="field-label">Client</span>
                        <div className="ep-step-group ep-pick">
                            <button type="button" className="ep-step" onClick={() => stepClient(-1)} disabled={clientOpts.length < 2} aria-label="Previous client">‹</button>
                            <SearchSelect value={caid} onChange={setCaid} options={clientOpts} searchPlaceholder="Search client..." aria-label="Client" disabled={!data} />
                            <button type="button" className="ep-step" onClick={() => stepClient(1)} disabled={clientOpts.length < 2} aria-label="Next client">›</button>
                        </div>
                    </div>
                </div>
            </section>

            {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

            {employees && !employees.length && !error && <section className="card ep-empty-card">No active Regular employees.</section>}

            {(data || loading) && (
                <Dashboard
                    data={data} loading={loading} mode={mode} role={role}
                    canSwitch={hasDa && hasAu} onView={switchView}
                    clients={clients} caid={caid} onClient={setCaid}
                />
            )}
        </div>
    );
}

/* =========================================================
   dashboard (one employee)
   ========================================================= */
function Dashboard({ data, loading, role, canSwitch, onView, clients, caid, onClient }) {
    const e = data?.employee;
    const isAu = role === "au";
    const first = !data;                                      // nothing yet → skeletons
    const tot = isAu ? data?.au_totals : data?.da_totals;
    const work = isAu ? data?.work_au : data?.work_da;
    const wt = work?.totals;
    const s = isAu ? data?.au : data?.da;

    const hourly = useMemo(() => {
        const h = work?.hourly || [];
        const used = h.filter((x) => x.entries > 0);
        if (!used.length) return [];
        // from the first to the last hour with entries (no empty night hours)
        const a = h.indexOf(used[0]);
        const b = h.indexOf(used[used.length - 1]);
        return h.slice(a, b + 1);
    }, [work]);

    const pie = !s ? [] : isAu
        ? [{ name: "Audited", value: s.audited, c: C.green }, { name: "Reverted", value: s.reverted, c: C.red }, { name: "Pending", value: s.pending, c: C.muted }]
        : [{ name: "Audited", value: s.audited, c: C.green }, { name: "Confirmed", value: s.confirmed, c: C.blue }, { name: "Pending", value: s.pending, c: C.muted }, { name: "Reverted", value: s.reverted, c: C.red }];
    const pieTotal = pie.reduce((a, x) => a + x.value, 0);
    const slices = pie.filter((x) => x.value > 0);
    const reverted = (isAu ? data?.reverted_au : data?.reverted_da) || [];

    // client table totals (all assigned clients)
    const sumRow = useMemo(() => {
        const z = { scan: { total: 0, pending: 0, confirmed: 0, invalid: 0, partial: 0, cancel: 0, billing: 0 }, manual: { sales: 0, purchases: 0, expenses: 0 } };
        clients.forEach((c) => {
            Object.keys(z.scan).forEach((k) => { z.scan[k] += c.scan?.[k] || 0; });
            Object.keys(z.manual).forEach((k) => { z.manual[k] += c.manual?.[k] || 0; });
        });
        return z;
    }, [clients]);

    return (
        <div className={`ep-dash${loading && !first ? " is-busy" : ""}`}>
            {/* ---------- profile ---------- */}
            <section className="ep-profile">
                {first ? <span className="sk ep-sk-profile" /> : (
                    <>
                        <Avatar name={e.name} photo={e.photo} size={120} />
                        <h3>{e.name}</h3>
                        <span className="ep-profile-role">{e.designation || "Employee"}</span>
                        {e.company && <span className="ep-profile-sub">{e.company}</span>}
                        <dl className="ep-profile-facts">
                            {e.employment_status && <div><dt>Status</dt><dd>{e.employment_status}</dd></div>}
                            {e.date_hired && <div><dt>Hired</dt><dd>{parse(e.date_hired).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</dd></div>}
                            {e.mobile && <div><dt>Mobile</dt><dd>{e.mobile}</dd></div>}
                            {e.email && <div><dt>Email</dt><dd title={e.email}>{e.email}</dd></div>}
                            <div><dt>Assigned clients</dt><dd>{n0(clients.length)}</dd></div>
                        </dl>
                        {canSwitch && (
                            <div className="ep-view" role="tablist" aria-label="Show work as">
                                <button type="button" role="tab" aria-selected={!isAu} className={!isAu ? "is-on" : ""} onClick={() => onView("da")}>Data analyst</button>
                                <button type="button" role="tab" aria-selected={isAu} className={isAu ? "is-on" : ""} onClick={() => onView("au")}>Auditor</button>
                            </div>
                        )}
                    </>
                )}
            </section>

            {/* ---------- tiles ---------- */}
            <div className="ep-kpis">
                <Kpi label="Total scanned" value={n0(tot?.scan.total)} loading={first} />
                <Kpi label="Pending" value={n0(tot?.scan.pending)} cls={tot?.scan.pending ? "is-warn" : ""} loading={first} />
                <Kpi label="Confirmed" value={n0(tot?.scan.confirmed)} cls="is-good" loading={first} />
                <Kpi label="Sales" sub="manual entry" value={n0(tot?.manual.sales)} loading={first} />
                <Kpi label="Purchases" sub="manual entry" value={n0(tot?.manual.purchases)} loading={first} />
                <Kpi label="Expenses" sub="manual entry" value={n0(tot?.manual.expenses)} loading={first} />
            </div>

            {/* ---------- work efficiency ---------- */}
            <section className="card ep-panel ep-work">
                <header>
                    <h5>Work efficiency</h5>
                    <small className="ep-note">first → last entry per day, less {hm(data?.break_minutes ?? 120)} break</small>
                </header>
                {first ? <span className="sk ep-sk-chart" /> : !wt?.entries ? <div className="ep-chart-empty">No entries in this period.</div> : (
                    <>
                        <div className="ep-work-main">
                            <div className="ep-work-big">
                                <strong>{num1(wt.per_hour)}</strong>
                                <span>entries / hour</span>
                            </div>
                            <div className="ep-work-big">
                                <strong>{num1(wt.min_per_entry)}</strong>
                                <span>minutes / entry</span>
                            </div>
                            <div className="ep-work-big">
                                <strong>{num1(wt.per_minute)}</strong>
                                <span>entries / minute</span>
                            </div>
                        </div>
                        <dl className="ep-work-facts">
                            <div><dt>Entries</dt><dd>{n0(wt.entries)}</dd></div>
                            <div><dt>Days worked</dt><dd>{n0(wt.days)}</dd></div>
                            <div><dt>Start → end</dt><dd>{hm(wt.span)}</dd></div>
                            <div><dt>Less break</dt><dd>− {hm(wt.break)}</dd></div>
                            <div className="is-total"><dt>Hours worked</dt><dd>{hm(wt.worked)}</dd></div>
                            <div><dt>Avg start · end</dt><dd>{clock(wt.avg_start)} · {clock(wt.avg_end)}</dd></div>
                        </dl>
                    </>
                )}
            </section>

            <section className="card ep-panel ep-hourly">
                <header><h5>Entries per hour</h5><small className="ep-note">% of all entries made in each hour</small></header>
                <div className="ep-chart-body">
                    {first ? <span className="sk ep-sk-chart" /> : !hourly.length ? <div className="ep-chart-empty">No entries in this period.</div> : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={hourly} margin={{ top: 18, right: 4, left: -12, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke="var(--line)" />
                                <XAxis dataKey="h" tickFormatter={hourText} interval={0} {...axis} />
                                <YAxis tickFormatter={(v) => `${v}%`} width={44} {...axis} />
                                <Tooltip contentStyle={tipStyle} cursor={{ fill: "var(--card-2)" }}
                                    labelFormatter={(h) => `${clock(`${h}:00`)} – ${clock(`${h}:59`)}`}
                                    formatter={(v, _n, p) => [`${v}% · ${n0(p.payload.entries)} entries`, "Share"]} />
                                <Bar dataKey="pct" name="Share" fill={C.brand} radius={[4, 4, 0, 0]} maxBarSize={28}
                                    label={{ position: "top", fontSize: 10, fill: "var(--muted)", formatter: (v) => (v ? `${v}%` : "") }} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </section>

            {/* ---------- assigned clients: scans + manual entries ---------- */}
            <section className="card ep-panel ep-clients">
                <header><h5>Assigned clients</h5><span className="ep-count">{n0(clients.length)}</span></header>
                <div className="ep-scroll">
                    <table className="ep-table ep-ctable">
                        <thead>
                            <tr className="ep-group">
                                <th rowSpan={2}>Client</th>
                                <th colSpan={7} className="c">Scanned</th>
                                <th colSpan={3} className="c">Manual entry</th>
                            </tr>
                            <tr>
                                <th className="c">All</th>
                                <th className="c">Pending</th>
                                <th className="c">Confirmed</th>
                                <th className="c">Invalid</th>
                                <th className="c">Partially invalid</th>
                                <th className="c">Cancel</th>
                                <th className="c" title="For collection / for payment">For coll. / pay.</th>
                                <th className="c">Sales</th>
                                <th className="c">Purchases</th>
                                <th className="c">Expenses</th>
                            </tr>
                        </thead>
                        <tbody>
                            {first && <tr><td colSpan={11}><span className="sk ep-sk-row" /></td></tr>}
                            {!first && !clients.length && <tr><td colSpan={11} className="ep-empty">No assigned clients.</td></tr>}
                            {!first && clients.map((c) => (
                                <tr key={c.id} className={`ep-click${String(c.id) === caid ? " is-on" : ""}`}
                                    onClick={() => onClient(String(c.id) === caid ? "" : String(c.id))} tabIndex={0}
                                    onKeyDown={(ev) => ev.key === "Enter" && onClient(String(c.id) === caid ? "" : String(c.id))}>
                                    <td>
                                        <strong className="ep-trunc" title={c.trade_name}>{c.trade_name || c.client_name || "—"}</strong>
                                        <small className="ep-sub">{[c.branch_code, c.client_name, c.status].filter(Boolean).join(" · ")}</small>
                                    </td>
                                    <td className="c strong">{dash(c.scan?.total)}</td>
                                    <td className={`c${c.scan?.pending ? " ep-orange" : ""}`}>{dash(c.scan?.pending)}</td>
                                    <td className={`c${c.scan?.confirmed ? " ep-green" : ""}`}>{dash(c.scan?.confirmed)}</td>
                                    <td className={`c${c.scan?.invalid ? " ep-red" : ""}`}>{dash(c.scan?.invalid)}</td>
                                    <td className={`c${c.scan?.partial ? " ep-red" : ""}`}>{dash(c.scan?.partial)}</td>
                                    <td className="c">{dash(c.scan?.cancel)}</td>
                                    <td className="c">{dash(c.scan?.billing)}</td>
                                    <td className="c">{dash(c.manual?.sales)}</td>
                                    <td className="c">{dash(c.manual?.purchases)}</td>
                                    <td className="c">{dash(c.manual?.expenses)}</td>
                                </tr>
                            ))}
                        </tbody>
                        {!first && clients.length > 1 && (
                            <tfoot>
                                <tr>
                                    <th>Total</th>
                                    {["total", "pending", "confirmed", "invalid", "partial", "cancel", "billing"].map((k) => <th key={k} className="c">{n0(sumRow.scan[k])}</th>)}
                                    {["sales", "purchases", "expenses"].map((k) => <th key={k} className="c">{n0(sumRow.manual[k])}</th>)}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </section>

            {/* ---------- daily work log ---------- */}
            <section className="card ep-panel ep-log">
                <header><h5>Daily work log</h5><span className="ep-count">{n0(work?.days?.length)}</span></header>
                <div className="ep-scroll">
                    <table className="ep-table">
                        <thead>
                            <tr>
                                <th>Date</th><th>Start</th><th>End</th><th className="r">Start → end</th><th className="r">Break</th>
                                <th className="r">Worked</th><th className="r">Entries</th><th className="r">Per hour</th><th className="r">Min / entry</th>
                            </tr>
                        </thead>
                        <tbody>
                            {first && <tr><td colSpan={9}><span className="sk ep-sk-row" /></td></tr>}
                            {!first && !work?.days?.length && <tr><td colSpan={9} className="ep-empty">No entries in this period.</td></tr>}
                            {!first && (work?.days || []).map((d) => (
                                <tr key={d.date}>
                                    <td className="nowrap">{dayText(d.date)}</td>
                                    <td className="nowrap">{clock(d.start)}</td>
                                    <td className="nowrap">{clock(d.end)}</td>
                                    <td className="r">{hm(d.span)}</td>
                                    <td className="r ep-muted">{d.break ? `− ${hm(d.break)}` : "—"}</td>
                                    <td className="r strong">{hm(d.worked)}</td>
                                    <td className="r">{n0(d.entries)}</td>
                                    <td className="r">{num1(d.per_hour)}</td>
                                    <td className="r">{num1(d.min_per_entry)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ---------- audit status ---------- */}
            <section className="card ep-panel ep-status">
                <header><h5>{isAu ? "Audit progress" : "Audit status"}</h5></header>
                {first ? <span className="sk ep-sk-chart" /> : !pieTotal ? <div className="ep-chart-empty">No data for this period.</div> : (
                    <div className="ep-donut">
                        <div className="ep-donut-chart">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={slices} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="96%" paddingAngle={2} stroke="var(--card)" strokeWidth={2}>
                                        {slices.map((x) => <Cell key={x.name} fill={x.c} />)}
                                    </Pie>
                                    <Tooltip contentStyle={tipStyle} formatter={(v, n) => [`${n0(v)} (${Math.round((v / pieTotal) * 100)}%)`, n]} />
                                </PieChart>
                            </ResponsiveContainer>
                            <span className="ep-donut-center"><b>{n0(pieTotal)}</b><small>invoices</small></span>
                        </div>
                        <ul className="ep-legend">
                            {pie.map((x) => (
                                <li key={x.name}><i style={{ background: x.c }} /><b>{n0(x.value)}</b><span>{x.name}</span></li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>

            {/* ---------- reverted invoices ---------- */}
            <section className="card ep-panel ep-reverted">
                <header><h5>Reverted invoices</h5><span className="ep-count is-red">{n0(reverted.length)}</span></header>
                <div className="ep-scroll">
                    <table className="ep-table">
                        <thead>
                            <tr><th>Date</th><th>Client</th><th>Declared month</th><th>Reference</th><th>Document no</th><th>Type</th><th>Remarks</th></tr>
                        </thead>
                        <tbody>
                            {first && <tr><td colSpan={7}><span className="sk ep-sk-row" /></td></tr>}
                            {!first && !reverted.length && <tr><td colSpan={7} className="ep-empty">No reverted invoices in this period.</td></tr>}
                            {!first && reverted.map((x, i) => (
                                <tr key={`${x.type}-${x.ref_no}-${i}`}>
                                    <td className="nowrap">{x.date}</td>
                                    <td><span className="ep-trunc" title={x.trade_name}>{x.trade_name || "—"}</span><small className="ep-sub">{x.branch_code}</small></td>
                                    <td>{x.declared_month || "—"}</td>
                                    <td className="mono">{x.ref_no}</td>
                                    <td className="mono">{x.document_no || "—"}</td>
                                    <td>{x.type}</td>
                                    <td>{x.remarks?.length ? <ul className="ep-remarks">{x.remarks.map((m, k) => <li key={k}>{m}</li>)}</ul> : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

/* =========================================================
   small parts
   ========================================================= */
function Avatar({ name, photo, size = 36 }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => setBroken(false), [photo]);
    return (
        <span className="ep-av" style={{ width: size, height: size, fontSize: Math.max(11, size * 0.34) }}>
            {photo && !broken ? <img src={photo} alt="" onError={() => setBroken(true)} /> : initials(name)}
        </span>
    );
}

function Kpi({ label, sub, value, cls = "", loading }) {
    return (
        <div className={`card ep-kpi ${cls}`}>
            <span className="ep-kpi-label">{label}</span>
            {loading ? <span className="sk ep-sk-kpi" /> : <strong>{value}</strong>}
            {sub && <small>{sub}</small>}
        </div>
    );
}