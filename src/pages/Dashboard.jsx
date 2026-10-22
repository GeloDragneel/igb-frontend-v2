// Dashboard (IMSDashboardController) — one month at a time, tabs by user type (m_user_type):
//   IT Officer · CEO · Supervisor · CFO · Audit Supervisor → Billing · Client · Employees · Calendar (= HR dashboard)
//   Data Analyst → my assigned clients (scans, sales, purchases, expenses, reverted, deadlines)
//   Auditor → my assigned clients (for audit, audited, reverted, scan monitoring, deadlines)
//   Liaison Officer · Billing & Collection Officer → Billing
//   anything else → nothing
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import Modal from "../components/Modal";
import HRDashboard from "./hr/HrDashboard";
import { apiFetch } from "../context/AuthContext";
import { exportCsv } from "../utils/exportRows";
import "./Dashboard.css";
import "./DashboardRoles.css";
import "./DashboardLoading.css";

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = (v) => (Number(v) || 0).toLocaleString("en-PH");
const compact = (v) => new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v) || 0);
const short = (v) => (String(v).length > 22 ? `${String(v).slice(0, 21)}…` : String(v));
const dayLabel = (d) => String(Number(String(d).slice(8, 10)));
const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleString("en-PH", { month: "short" });
const monthShort = (m) => (m ? new Date(`${m}-01T00:00:00`).toLocaleString("en-PH", { month: "short", year: "numeric" }) : "");
const monthTitle = (m) => (m ? new Date(`${m}-01T00:00:00`).toLocaleString("en-PH", { month: "long", year: "numeric" }) : "");
const sumBy = (rows, k) => (rows || []).reduce((s, r) => s + (Number(r[k]) || 0), 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// series colors live in Dashboard.css (--dsh-1 … --dsh-5)
const S = (i) => `var(--dsh-${i})`;
const SVC = [{ key: "PF", label: "PF", c: 1 }, { key: "Return", label: "Return", c: 2 }, { key: "EO", label: "EO", c: 3 }];
const TRX = [{ key: "sales", label: "Sales", c: 1 }, { key: "purchases", label: "Purchases", c: 2 }, { key: "expenses", label: "Expenses", c: 3 }];
const TAB_LABELS = { billing: "Billing", clients: "Client", employees: "Employees", calendar: "Calendar", da: "My clients", auditor: "My audits" };

export default function Dashboard() {
    const [info, setInfo] = useState(null); // { is_ceo, role, tabs, user_type_id, employee_id, month }
    const [month, setMonth] = useState("");
    const [tab, setTab] = useState("billing");
    // Billing tab: a month range (From – To) or all data
    const [bMode, setBMode] = useState("range");        // "range" | "all"
    const [bFrom, setBFrom] = useState("");
    const [bTo, setBTo] = useState("");
    // what is shown = what you last SEARCHED (changing From / To / Period alone does not load anything)
    const [applied, setApplied] = useState({ mode: "range", from: "", to: "" });
    const [data, setData] = useState({});   // "tab|month" → response
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        apiFetch("/ims_dashboard")
            .then((r) => { setInfo(r); setMonth(r.month); setBFrom(r.month); setBTo(r.month); setApplied({ mode: "range", from: r.month, to: r.month }); setTab(r.tabs?.[0] || ""); })
            .catch((e) => setError(e.message || "Couldn't load the dashboard."));
    }, []);

    // billing: ?mode=range&from=&to= | ?mode=all · every other tab: ?month=
    const [from, to] = applied.from <= applied.to ? [applied.from, applied.to] : [applied.to, applied.from];
    const billingQs = applied.mode === "all" ? "mode=all" : `mode=range&from=${from}&to=${to}`;
    const period = useMemo(() => ({
        mode: applied.mode, from, to, qs: billingQs,
        label: applied.mode === "all" ? "All data" : from === to ? monthTitle(from) : `${monthShort(from)} – ${monthShort(to)}`,
        file: applied.mode === "all" ? "All" : from === to ? from : `${from}-to-${to}`,
    }), [applied.mode, from, to, billingQs]);
    const lastBilling = useRef(null);       // charts keep showing while the tiles load
    const key = tab === "billing" ? `billing|${billingQs}` : `${tab}|${month}`;
    const load = useCallback(async (force = false) => {
        if (!info || !month || !tab || tab === "calendar") return;   // the calendar loads itself (HR dashboard)
        if (tab === "billing" && applied.mode === "range" && (!applied.from || !applied.to)) return;
        if (!force && data[key]) return;
        setLoading(true);
        setError("");
        try {
            const res = await apiFetch(tab === "billing" ? `/ims_dashboard/billing?${billingQs}` : `/ims_dashboard/${tab}?month=${month}`);
            setData((d) => ({ ...d, [key]: res }));
            if (tab === "billing") lastBilling.current = res;
        } catch (e) {
            setError(e.message || "Couldn't load the dashboard.");
        } finally {
            setLoading(false);
        }
    }, [info, month, tab, key, data, applied, billingQs]);

    useEffect(() => { load(); }, [info, month, tab, billingQs]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!info) return <div className="dsh">{error ? <div className="alert-error" role="alert">{error}</div> : <p className="dsh-muted">Loading…</p>}</div>;

    const tabs = info.tabs || [];
    // no dashboard for this user type
    if (!tabs.length) return <div className="dsh" />;

    const fresh = data[key];
    // Billing: while a new period loads, the charts keep the last result and only the tiles show placeholders
    const d = fresh || (tab === "billing" && loading ? lastBilling.current : undefined);
    const busy = loading && !d;
    const tilesLoading = tab === "billing" && loading && !fresh;
    const search = () => {
        if (tab !== "billing") return load(true);
        const next = { mode: bMode, from: bFrom, to: bTo };
        if (next.mode === applied.mode && next.from === applied.from && next.to === applied.to) return load(true);
        setApplied(next);                    // → the effect loads the new period
    };
    const draftChanged = tab === "billing" && (bMode !== applied.mode || (bMode === "range" && (bFrom !== applied.from || bTo !== applied.to)));
    const needsEmployee = (tab === "da" || tab === "auditor") && !info.employee_id;
    return (
        <div className="dsh">
            {tab !== "calendar" && (
                <section className="card dsh-hero">
                    <div className="dsh-title">
                        <h4>Dashboard</h4>
                        <span>{tab === "billing" ? period.label : monthTitle(month)}</span>
                    </div>
                    {tab === "billing" ? (
                        <>
                            <label className="dsh-field">
                                <span className="field-label">Period</span>
                                <select className="input" value={bMode} onChange={(e) => setBMode(e.target.value)}>
                                    <option value="range">Month range</option>
                                    <option value="all">All data</option>
                                </select>
                            </label>
                            {bMode === "range" && (
                                <>
                                    <label className="dsh-field">
                                        <span className="field-label">From</span>
                                        <input type="month" className="input" value={bFrom} max={bTo || undefined} onChange={(e) => e.target.value && setBFrom(e.target.value)} />
                                    </label>
                                    <label className="dsh-field">
                                        <span className="field-label">To</span>
                                        <input type="month" className="input" value={bTo} min={bFrom || undefined} onChange={(e) => e.target.value && setBTo(e.target.value)} />
                                    </label>
                                </>
                            )}
                        </>
                    ) : (
                        <label className="dsh-field">
                            <span className="field-label">Month</span>
                            <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
                        </label>
                    )}
                    <button type="button" className={`btn btn-primary${draftChanged ? " dsh-pulse" : ""}`} onClick={search} disabled={loading}>
                        {loading ? <><span className="dsh-spin" aria-hidden="true" /> Loading…</> : tab === "billing" ? "Search" : "Refresh"}
                    </button>
                    {loading && <span className="dsh-progress" role="progressbar" aria-label="Loading" />}
                </section>
            )}

            {tabs.length > 1 && (
                <nav className="card dsh-tabs" role="tablist" aria-label="Dashboard">
                    {tabs.map((k) => (
                        <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
                            {TAB_LABELS[k] || k}
                        </button>
                    ))}
                </nav>
            )}

            {needsEmployee && (
                <p className="card dsh-info">Your login is not linked to an employee (m_user_staff.comid → m_employee.com_id), so no client is assigned to you and everything is 0.</p>
            )}

            {error && <div className="alert-error" role="alert">{error}</div>}

            {tab === "billing" && <BillingTab b={d} busy={busy} period={period} tilesLoading={tilesLoading} />}
            {tab === "clients" && <ClientTab c={d} busy={busy} month={month} />}
            {tab === "employees" && <EmployeesTab e={d} busy={busy} month={month} ceo={info.is_ceo} />}
            {tab === "calendar" && <HRDashboard />}
            {tab === "da" && <DaTab x={d} busy={busy} month={month} />}
            {tab === "auditor" && <AuditorTab x={d} busy={busy} month={month} />}
        </div>
    );
}

/* =====================================================================
   BILLING
   ===================================================================== */
// "client" column = Client name over "Branch code - Trade name"
const CLIENT = { key: "client_name", label: "Client", kind: "client" };
const UNPAID_COLS = [
    CLIENT,
    { key: "PF", label: "PF", cls: "n", money: true, sum: true },
    { key: "Return", label: "Return", cls: "n", money: true, sum: true },
    { key: "EO", label: "EO", cls: "n", money: true, sum: true },
    { key: "forwarding", label: "Arrears", cls: "n", money: true, sum: true },
    { key: "current", label: "Outstanding", cls: "n", money: true, sum: true },
    { key: "total", label: "Total", cls: "n", money: true, sum: true },
];

function BillingTab({ b, busy, period, tilesLoading }) {
    const [open, setOpen] = useState(null); // kpi key of the popup
    const sm = b?.summary;
    const undeposited = Math.max(0, (sm?.collected || 0) - (sm?.deposited || 0));
    const depPct = pct(sm?.deposited || 0, sm?.collected || 0);
    const types = useMemo(() => SVC.map((t) => ({
        type: t.label,
        collected: b?.billing?.[t.key]?.collected || 0,
        outstanding: b?.billing?.[t.key]?.balance || 0,
        arrears: b?.billing?.[t.key]?.forwarding || 0,
    })), [b]);
    const trend = useMemo(() => (b?.trend || []).map((t) => ({ month: t.month, billed: t.billed, collected: t.PF + t.Return + t.EO + t.Others })), [b]);
    const perMonth = b?.bucket === "month";
    // only the 5 tiles follow the period; charts + table = one month (last month of the range · All data → this month)
    const chartMonth = b?.month || (period.mode === "all" ? "" : period.to);
    const chartWhen = chartMonth ? monthTitle(chartMonth) : "";
    const multiYear = (b?.trend || []).some((t, i, a) => i && t.month.slice(0, 4) !== a[0].month.slice(0, 4));
    const trendTick = (m) => (multiYear ? monthShort(m) : monthLabel(m));
    const top = useMemo(() => (b?.unpaid?.rows || []).slice(0, 10).map((r) => ({ ...r, label: r.branch || r.client_name })), [b]);
    const kpi = (key, label, value, sub) => (
        <Kpi key={key} label={label} value={sm ? n2(value) : "—"} sub={sm ? sub : ""} loading={tilesLoading || (busy && !sm)}
            onClick={sm && !tilesLoading ? () => setOpen(key) : undefined} />
    );

    return (
        <>
            <div className="dsh-kpis">
                {kpi("billed", "Total billed", sm?.billed, `${n0(sm?.billed_count)} PF / EO bill(s)`)}
                {kpi("collected", "Collected", sm?.collected, `${n0(sm?.collected_count)} payment(s) on those bills`)}
                {kpi("deposited", "Deposited", sm?.deposited, `${depPct}% of collected`)}
                {kpi("outstanding", "Outstanding", sm?.outstanding, `billed − collected · ${n0(sm?.outstanding_count)} bill(s)`)}
                {kpi("arrears", "Total arrears", sm?.arrears, `${n0(sm?.arrears_count)} unpaid bill(s) · ${n0(sm?.arrears_clients)} client(s)`)}
            </div>
            {open && <KpiPopup kpi={open} period={period} onClose={() => setOpen(null)} />}

            <div className="dsh-grid">
                <ChartCard span={8} title={perMonth ? "Monthly collection" : "Daily collection"}
                    sub={`${chartWhen} · payments per ${perMonth ? "month" : "day"}, by service type`} keys={SVC} busy={busy}>
                    <BarChart data={b?.daily || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="day" tickFormatter={perMonth ? monthShort : dayLabel} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tickFormatter={compact} axisLine={false} tickLine={false} width={48} />
                        <Tooltip content={<Tip money labelFmt={perMonth ? monthTitle : undefined} />} />
                        {SVC.map((t, i) => stackBar({ k: t.key, name: t.label, c: t.c, last: i === SVC.length - 1 }))}
                    </BarChart>
                </ChartCard>

                <ChartCard span={4} title="Deposit" sub={`${period.label} · PF / EO collected: deposited vs not yet`} busy={busy}
                    keys={[{ key: "d", label: "Deposited", c: 1 }, { key: "u", label: "Not deposited", c: 2 }]}
                    center={sm ? <><b>{depPct}%</b><small>deposited</small></> : null}>
                    <PieChart>
                        <Pie data={[{ name: "Deposited", value: sm?.deposited || 0 }, { name: "Not deposited", value: undeposited }]}
                            dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="var(--card)" strokeWidth={2}>
                            <Cell fill={S(1)} />
                            <Cell fill={S(2)} />
                        </Pie>
                        <Tooltip content={<Tip money />} />
                    </PieChart>
                </ChartCard>

                <ChartCard span={6} title="Billed vs collected"
                    sub={`Last 6 months up to ${chartWhen} · billed = PF + Return of the month`} busy={busy}
                    keys={[{ key: "b", label: "Billed", c: 1 }, { key: "c", label: "Collected", c: 3 }]}>
                    <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="month" tickFormatter={trendTick} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={compact} axisLine={false} tickLine={false} width={48} />
                        <Tooltip content={<Tip money labelFmt={monthTitle} />} />
                        <Bar dataKey="billed" name="Billed" fill={S(1)} maxBarSize={22} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="collected" name="Collected" fill={S(3)} maxBarSize={22} radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ChartCard>

                <ChartCard span={6} title="By service type" sub={`${chartWhen} · collected · outstanding · arrears`} busy={busy}
                    keys={[{ key: "c", label: "Collected", c: 3 }, { key: "o", label: "Outstanding", c: 4 }, { key: "a", label: "Arrears", c: 2 }]}>
                    <BarChart data={types} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" tickFormatter={compact} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="type" axisLine={false} tickLine={false} width={56} />
                        <Tooltip content={<Tip money />} />
                        {stackBar({ k: "collected", name: "Collected", c: 3, vertical: true })}
                        {stackBar({ k: "outstanding", name: "Outstanding", c: 4, vertical: true })}
                        {stackBar({ k: "arrears", name: "Arrears", c: 2, vertical: true, last: true })}
                    </BarChart>
                </ChartCard>

                <ChartCard span={12} title="Top 10 clients owing" sub={`${chartWhen} · arrears + outstanding`} busy={busy} empty={!top.length} tall
                    keys={[{ key: "a", label: "Arrears", c: 2 }, { key: "o", label: "Outstanding", c: 4 }]}>
                    <BarChart data={top} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" tickFormatter={compact} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="label" tickFormatter={short} axisLine={false} tickLine={false} width={170} />
                        <Tooltip content={<Tip money />} />
                        {stackBar({ k: "forwarding", name: "Arrears", c: 2, vertical: true })}
                        {stackBar({ k: "current", name: "Outstanding", c: 4, vertical: true, last: true })}
                    </BarChart>
                </ChartCard>
            </div>

            <TableSection title="Clients with outstanding / arrears"
                sub={`${chartWhen} · Arrears = unpaid before this month · Outstanding = unpaid bills of the month`}
                cols={UNPAID_COLS} rows={b?.unpaid?.rows} busy={busy} rowKey="ca_id" file={`Dashboard-Billing-${chartMonth}`} />
        </>
    );
}

/* =====================================================================
   CLIENT — scans by the client himself (employee_id 0 / null)
   ===================================================================== */
function ClientTab({ c, busy, month }) {
    const rows = useMemo(() => c?.rows || [], [c]);
    const statusBars = useMemo(() => Object.entries(c?.scan_labels || {}).map(([st, label]) => ({ status: label, scans: sumBy(rows, `scan_${st}`) })), [c, rows]);
    const typeSlices = TRX.map((t) => ({ name: t.label, value: sumBy(rows, t.key), c: t.c }));
    const top = useMemo(() => rows.slice(0, 10).map((r) => ({ ...r, label: r.branch || r.client_name })), [rows]);
    const total = sumBy(rows, "scans");
    const cols = useMemo(() => [
        CLIENT,
        { key: "scans", label: "Scans", cls: "n", sum: true },
        ...TRX.map((t) => ({ key: t.key, label: t.label, cls: "n", sum: true })),
        ...Object.entries(c?.scan_labels || {}).map(([st, label]) => ({ key: `scan_${st}`, label, cls: "n", sum: true })),
    ], [c]);

    return (
        <>
            <div className="dsh-kpis">
                <Kpi label="Client scans" value={n0(total)} sub={`${n0(rows.length)} client account(s)`} />
                {TRX.map((t) => <Kpi key={t.key} label={t.label} value={n0(sumBy(rows, t.key))} sub={`${pct(sumBy(rows, t.key), total)}% of scans`} />)}
                <Kpi label="Confirmed" value={n0(sumBy(rows, "scan_1"))} sub={`${pct(sumBy(rows, "scan_1"), total)}% of scans`} />
            </div>

            <div className="dsh-grid">
                <ChartCard span={8} title="Scans per day" sub="By the client, by transaction type" keys={TRX} busy={busy}>
                    <BarChart data={c?.daily || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="day" tickFormatter={dayLabel} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                        <Tooltip content={<Tip />} />
                        {TRX.map((t, i) => stackBar({ k: t.key, name: t.label, c: t.c, last: i === TRX.length - 1 }))}
                    </BarChart>
                </ChartCard>

                <ChartCard span={4} title="By transaction type" sub="Share of client scans" keys={TRX} busy={busy}
                    center={<><b>{n0(total)}</b><small>scans</small></>}>
                    <PieChart>
                        <Pie data={typeSlices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="var(--card)" strokeWidth={2}>
                            {typeSlices.map((s) => <Cell key={s.name} fill={S(s.c)} />)}
                        </Pie>
                        <Tooltip content={<Tip />} />
                    </PieChart>
                </ChartCard>

                <ChartCard span={6} title="Top 10 clients" sub="Most scans this month" keys={TRX} busy={busy} empty={!top.length} tall>
                    <BarChart data={top} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="label" tickFormatter={short} axisLine={false} tickLine={false} width={160} />
                        <Tooltip content={<Tip />} />
                        {TRX.map((t, i) => stackBar({ k: t.key, name: t.label, c: t.c, vertical: true, last: i === TRX.length - 1 }))}
                    </BarChart>
                </ChartCard>

                <ChartCard span={6} title="Scan statuses" sub="All client scans this month" busy={busy} tall>
                    <BarChart data={statusBars} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="status" axisLine={false} tickLine={false} width={150} />
                        <Tooltip content={<Tip />} />
                        <Bar dataKey="scans" name="Scans" fill={S(1)} maxBarSize={22} radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ChartCard>
            </div>

            <TableSection title="Client scans" sub="Scanned by the client (no employee)" cols={cols} rows={rows} busy={busy}
                rowKey="ca_id" file={`Dashboard-Client-Scans-${month}`} />
        </>
    );
}

/* =====================================================================
   EMPLOYEES — data analyst via assigned_daid · auditor via t_audit_history (auditor_id)
   ===================================================================== */
const DA_KEYS = [{ key: "scans", label: "Scans", c: 4 }, ...TRX];
const DAILY_KEYS = [...DA_KEYS, { key: "audits", label: "Audits", c: 5 }];
const EMP_COLS = [
    { key: "name", label: "Employee", cls: "dsh-wide" },
    { key: "role", label: "Role" },
    { key: "da_scans", label: "DA · Scans", cls: "n", sum: true },
    { key: "da_confirmed", label: "DA · Confirmed", cls: "n", sum: true },
    { key: "da_sales", label: "DA · Sales", cls: "n", sum: true },
    { key: "da_purchases", label: "DA · Purchases", cls: "n", sum: true },
    { key: "da_expenses", label: "DA · Expenses", cls: "n", sum: true },
    { key: "da_reverted", label: "DA · Reverted", cls: "n", sum: true },
    { key: "au_sales", label: "Audits · Sales", cls: "n", sum: true },
    { key: "au_purchases", label: "Audits · Purchases", cls: "n", sum: true },
    { key: "au_expenses", label: "Audits · Expenses", cls: "n", sum: true },
    { key: "au_confirmed", label: "Audits · Confirmed", cls: "n", sum: true },
    { key: "au_audited", label: "Audits · Audited", cls: "n", sum: true },
    { key: "au_reverted", label: "Audits · Reverted", cls: "n", sum: true },
    { key: "au_total", label: "Audits · Total", cls: "n", sum: true },
];

function EmployeesTab({ e, busy, month, ceo }) {
    const rows = useMemo(() => e?.employees || [], [e]);
    const daily = e?.daily || [];
    const topDa = useMemo(() => rows.filter((r) => r.da_scans + r.da_total > 0)
        .sort((a, b) => (b.da_scans + b.da_total) - (a.da_scans + a.da_total)).slice(0, 10)
        .map((r) => ({ name: r.name, scans: r.da_scans, sales: r.da_sales, purchases: r.da_purchases, expenses: r.da_expenses })), [rows]);
    const topAu = useMemo(() => rows.filter((r) => r.au_total > 0)
        .sort((a, b) => b.au_total - a.au_total).slice(0, 10)
        .map((r) => ({ name: r.name, sales: r.au_sales, purchases: r.au_purchases, expenses: r.au_expenses })), [rows]);
    const who = ceo ? "linked to an analyst" : "assigned to me";

    return (
        <>
            <div className="dsh-kpis">
                {DA_KEYS.map((k) => <Kpi key={k.key} label={k.label} value={n0(sumBy(daily, k.key))} sub={who} />)}
                <Kpi label="Audits" value={n0(sumBy(daily, "audits"))}
                    sub={`${n0(sumBy(rows, "au_audited"))} audited · ${n0(sumBy(rows, "au_reverted"))} reverted`} />
            </div>

            {e?.missing?.length > 0 && <p className="dsh-note">Not found in the database (counted as 0): {e.missing.join(", ")}</p>}

            <div className="dsh-grid">
                <ChartCard span={12} title="Per day" sub="Scans and transactions created (data analysts) · audits done (audit history)" keys={DAILY_KEYS} busy={busy}>
                    <LineChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="day" tickFormatter={dayLabel} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                        <Tooltip content={<Tip />} />
                        {DAILY_KEYS.map((k) => (
                            <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={S(k.c)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        ))}
                    </LineChart>
                </ChartCard>

                {ceo && (
                    <>
                        <ChartCard span={6} title="Data analysts" sub="Top 10 · scans and transactions via assigned_daid" keys={DA_KEYS} busy={busy} empty={!topDa.length} tall>
                            {empBars(topDa, DA_KEYS)}
                        </ChartCard>
                        <ChartCard span={6} title="Auditors" sub="Top 10 · audits done this month (audit history)" keys={TRX} busy={busy} empty={!topAu.length} tall>
                            {empBars(topAu, TRX)}
                        </ChartCard>
                    </>
                )}
            </div>

            <TableSection title="Employees" sub="DA = assigned_daid · Audits = t_audit_history by auditor" cols={EMP_COLS} rows={rows} busy={busy}
                rowKey="emp_id" file={`Dashboard-Employees-${month}`} />
        </>
    );
}

function empBars(data, keys) {
    return (
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tickFormatter={short} axisLine={false} tickLine={false} width={150} />
            <Tooltip content={<Tip />} />
            {keys.map((k, i) => stackBar({ k: k.key, name: k.label, c: k.c, vertical: true, last: i === keys.length - 1 }))}
        </BarChart>
    );
}

/* =====================================================================
   DATA ANALYST — my assigned clients (m_client_account.assigned_daid)
   ===================================================================== */
const DA_DAILY = [{ key: "scans", label: "Scans", c: 4 }, ...TRX];
const DA_COLS = [
    CLIENT,
    { key: "scans", label: "Scans", cls: "n", sum: true },
    { key: "scan_0", label: "Scans pending", cls: "n", sum: true },
    { key: "scan_1", label: "Scans confirmed", cls: "n", sum: true },
    { key: "sales", label: "Sales", cls: "n", sum: true },
    { key: "purchases", label: "Purchases", cls: "n", sum: true },
    { key: "expenses", label: "Expenses", cls: "n", sum: true },
    { key: "pending", label: "For audit", cls: "n", sum: true },
    { key: "reverted", label: "Reverted (to fix)", cls: "n", sum: true },
];

function DaTab({ x, busy, month }) {
    const rows = useMemo(() => x?.clients || [], [x]);
    const daily = x?.daily || [];
    const top = useMemo(() => [...rows].sort((a, b) => (b.scans + b.total) - (a.scans + a.total)).slice(0, 10)
        .filter((r) => r.scans + r.total > 0).map((r) => ({ ...r, label: r.branch || r.client_name })), [rows]);
    const typeSlices = TRX.map((t) => ({ name: t.label, value: sumBy(rows, t.key), c: t.c }));
    const trx = sumBy(rows, "total");

    return (
        <>
            <div className="dsh-kpis">
                <Kpi label="Assigned clients" value={n0(rows.length)} sub="assigned to me" />
                <Kpi label="Scans" value={n0(sumBy(rows, "scans"))} sub={`${n0(sumBy(rows, "scan_0"))} pending · ${n0(sumBy(rows, "scan_1"))} confirmed`} />
                {TRX.map((t) => <Kpi key={t.key} label={t.label} value={n0(sumBy(rows, t.key))} sub="created this month" />)}
                <Kpi label="Reverted" value={n0(sumBy(rows, "reverted"))} sub="sent back by the auditor · to fix" />
            </div>

            <div className="dsh-grid">
                <ChartCard span={8} title="Per day" sub="Scans and transactions of my clients" keys={DA_DAILY} busy={busy}>
                    <BarChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="day" tickFormatter={dayLabel} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                        <Tooltip content={<Tip />} />
                        {DA_DAILY.map((k, i) => stackBar({ k: k.key, name: k.label, c: k.c, last: i === DA_DAILY.length - 1 }))}
                    </BarChart>
                </ChartCard>

                <ChartCard span={4} title="By transaction type" sub="This month" keys={TRX} busy={busy} empty={!trx}
                    center={<><b>{n0(trx)}</b><small>transactions</small></>}>
                    <PieChart>
                        <Pie data={typeSlices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="var(--card)" strokeWidth={2}>
                            {typeSlices.map((s) => <Cell key={s.name} fill={S(s.c)} />)}
                        </Pie>
                        <Tooltip content={<Tip />} />
                    </PieChart>
                </ChartCard>

                <ChartCard span={12} title="Most active clients" sub="Top 10 · scans + transactions" keys={DA_DAILY} busy={busy} empty={!top.length} tall>
                    <BarChart data={top} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="label" tickFormatter={short} axisLine={false} tickLine={false} width={170} />
                        <Tooltip content={<Tip />} />
                        {DA_DAILY.map((k, i) => stackBar({ k: k.key, name: k.label, c: k.c, vertical: true, last: i === DA_DAILY.length - 1 }))}
                    </BarChart>
                </ChartCard>
            </div>

            <Deadlines list={x?.deadlines} busy={busy} />

            <TableSection title="My assigned clients" sub="Scans / transactions created this month · For audit and Reverted = right now"
                cols={DA_COLS} rows={rows} busy={busy} rowKey="ca_id" file={`Dashboard-DA-${month}`} />
        </>
    );
}

/* =====================================================================
   AUDITOR — my assigned clients (m_client_account.assigned_auid)
   ===================================================================== */
const AU_DAILY = [{ key: "audited", label: "Audited", c: 3 }, { key: "reverted", label: "Reverted", c: 2 }, { key: "confirmed", label: "Confirmed", c: 1 }];
const AU_PENDING = TRX.map((t) => ({ key: `pending_${t.key}`, label: t.label, c: t.c }));

function AuditorTab({ x, busy, month }) {
    const rows = useMemo(() => x?.clients || [], [x]);
    const daily = x?.daily || [];
    const labels = x?.scan_labels || {};
    const cols = useMemo(() => [
        CLIENT,
        { key: "pending", label: "For audit", cls: "n", sum: true },
        ...AU_PENDING.map((t) => ({ key: t.key, label: `For audit · ${t.label}`, cls: "n", sum: true })),
        { key: "audited", label: "Audited by me", cls: "n", sum: true },
        { key: "reverted", label: "Reverted by me", cls: "n", sum: true },
        { key: "open_reverted", label: "Still reverted", cls: "n", sum: true },
        { key: "scans", label: "Scans", cls: "n", sum: true },
        ...Object.entries(labels).map(([st, label]) => ({ key: `scan_${st}`, label: `Scans · ${label}`, cls: "n", sum: true })),
    ], [labels]);
    const scanBars = useMemo(() => Object.entries(labels).map(([st, label]) => ({ status: label, scans: sumBy(rows, `scan_${st}`) })), [labels, rows]);
    const pendingTop = useMemo(() => rows.filter((r) => r.pending > 0).slice(0, 10).map((r) => ({ ...r, label: r.branch || r.client_name })), [rows]);
    const audited = sumBy(rows, "audited");
    const reverted = sumBy(rows, "reverted");

    return (
        <>
            <div className="dsh-kpis">
                <Kpi label="Assigned clients" value={n0(rows.length)} sub="assigned to me" />
                <Kpi label="For audit" value={n0(sumBy(rows, "pending"))} sub="waiting right now" />
                <Kpi label="Audited" value={n0(audited)} sub="by me this month" />
                <Kpi label="Reverted" value={n0(reverted)} sub={`by me this month · ${n0(sumBy(rows, "open_reverted"))} still open`} />
                <Kpi label="Scans" value={n0(sumBy(rows, "scans"))} sub={`${n0(sumBy(rows, "scan_0"))} pending · ${n0(sumBy(rows, "scan_1"))} confirmed`} />
            </div>

            <div className="dsh-grid">
                <ChartCard span={8} title="My audits per day" sub="Audit history this month" keys={AU_DAILY} busy={busy}>
                    <BarChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="day" tickFormatter={dayLabel} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                        <Tooltip content={<Tip />} />
                        {AU_DAILY.map((k, i) => stackBar({ k: k.key, name: k.label, c: k.c, last: i === AU_DAILY.length - 1 }))}
                    </BarChart>
                </ChartCard>

                <ChartCard span={4} title="Audited vs reverted" sub="By me this month" busy={busy} empty={!audited && !reverted}
                    keys={[{ key: "a", label: "Audited", c: 3 }, { key: "r", label: "Reverted", c: 2 }]}
                    center={<><b>{pct(audited, audited + reverted)}%</b><small>audited</small></>}>
                    <PieChart>
                        <Pie data={[{ name: "Audited", value: audited }, { name: "Reverted", value: reverted }]} dataKey="value" nameKey="name"
                            innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="var(--card)" strokeWidth={2}>
                            <Cell fill={S(3)} />
                            <Cell fill={S(2)} />
                        </Pie>
                        <Tooltip content={<Tip />} />
                    </PieChart>
                </ChartCard>

                <ChartCard span={6} title="Waiting for audit" sub="Top 10 clients · by transaction type" keys={AU_PENDING} busy={busy} empty={!pendingTop.length} tall>
                    <BarChart data={pendingTop} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="label" tickFormatter={short} axisLine={false} tickLine={false} width={160} />
                        <Tooltip content={<Tip />} />
                        {AU_PENDING.map((k, i) => stackBar({ k: k.key, name: k.label, c: k.c, vertical: true, last: i === AU_PENDING.length - 1 }))}
                    </BarChart>
                </ChartCard>

                <ChartCard span={6} title="Scan monitoring" sub="Scans of my clients this month, by status" busy={busy} tall empty={!sumBy(rows, "scans")}>
                    <BarChart data={scanBars} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} />
                        <YAxis type="category" dataKey="status" axisLine={false} tickLine={false} width={150} />
                        <Tooltip content={<Tip />} />
                        <Bar dataKey="scans" name="Scans" fill={S(1)} maxBarSize={22} radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ChartCard>
            </div>

            <Deadlines list={x?.deadlines} busy={busy} />

            <TableSection title="My assigned clients" sub="For audit / Still reverted = right now · Audited / Reverted by me and scans = this month"
                cols={cols} rows={rows} busy={busy} rowKey="ca_id" file={`Dashboard-Auditor-${month}`} />
        </>
    );
}

/* compliance deadlines of my clients (Client → Master File → Compliance) */
function Deadlines({ list, busy }) {
    const items = list || [];
    return (
        <section className="card dsh-section">
            <header className="dsh-section-head">
                <div>
                    <h5>Deadlines</h5>
                    <span className="dsh-muted">Compliance of my assigned clients</span>
                </div>
            </header>
            {busy ? <p className="dsh-plot-msg">Loading…</p> : !items.length ? <p className="dsh-plot-msg">No compliance set for your clients.</p> : (
                <ul className="dshr-deadlines">
                    {items.map((c) => (
                        <li key={c.id}>
                            <div className="dshr-dl-main">
                                <b>{c.compliance}</b>
                                {c.deadline && <span className="dshr-dl-when">{c.deadline}</span>}
                            </div>
                            <span className="dshr-dl-count" title={c.client_list}>{n0(c.clients)} client{c.clients === 1 ? "" : "s"}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/* =====================================================================
   shared pieces
   ===================================================================== */

// one segment of a stacked bar (2px surface gap, rounded data-end on the last segment) — a plain function so recharts sees a real <Bar>
function stackBar({ k, name, c, vertical = false, last = false }) {
    return (
        <Bar key={k} dataKey={k} name={name} stackId="a" fill={S(c)} stroke="var(--card)" strokeWidth={1} maxBarSize={vertical ? 20 : 18}
            radius={last ? (vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0} />
    );
}

function Kpi({ label, value, sub, onClick, loading = false }) {
    const body = loading ? (
        <>
            <small>{label}</small>
            <b className="dsh-sk dsh-sk-num" aria-hidden="true" />
            <span className="dsh-sk dsh-sk-sub" aria-hidden="true" />
            <span className="sr-only">Loading…</span>
        </>
    ) : (
        <>
            <small>{label}</small>
            <b>{value}</b>
            {sub && <span>{sub}</span>}
        </>
    );
    if (loading) return <section className="card dsh-kpi is-loading" aria-busy="true">{body}</section>;
    return onClick
        ? <button type="button" className="card dsh-kpi is-click" onClick={onClick} aria-label={`${label}: show details`}>{body}</button>
        : <section className="card dsh-kpi">{body}</section>;
}

/* popup behind a Billing tile */
const KPI_INFO = {
    billed: { title: "Total billed", note: "PF bills of the period's months + EO bills of its years (void bills left out).", sumKey: "amount" },
    collected: { title: "Collected", note: "Payments made on the period's PF / EO bills.", sumKey: "amount" },
    deposited: { title: "Deposited", note: "Payments on the period's PF / EO bills that are deposited.", sumKey: "amount" },
    outstanding: { title: "Outstanding", note: "Total billed − collected: the period's PF / EO bills with a balance.", sumKey: "balance" },
    arrears: { title: "Total arrears", note: "PF / EO bills from before the period with no payment at all on their SOA (none for All data).", sumKey: "amount" },
};
const BILL_COLS = [
    CLIENT,
    { key: "type", label: "Type", cls: "c" },
    { key: "service", label: "Service", cls: "dsh-wide" },
    { key: "period", label: "Period" },
    { key: "trans_number", label: "SOA #" },
    { key: "date_billed", label: "Date billed" },
    { key: "amount", label: "Billed", cls: "n", money: true, sum: true },
    { key: "collected", label: "Collected", cls: "n", money: true, sum: true },
    { key: "balance", label: "Balance", cls: "n", money: true, sum: true },
    { key: "status", label: "Status", cls: "c" },
];
const COLLECTED_COLS = [
    CLIENT,
    { key: "type", label: "Type", cls: "c" },
    { key: "service", label: "Service", cls: "dsh-wide" },
    { key: "period", label: "Period" },
    { key: "trans_number", label: "SOA #" },
    { key: "or_number", label: "OR #" },
    { key: "amount", label: "Amount", cls: "n", money: true, sum: true },
    { key: "collected_date", label: "Collected date" },
    { key: "collected_by", label: "Collected by", cls: "dsh-wide" },
    { key: "deposited", label: "Deposited", cls: "c" },
];
const DEPOSITED_COLS = [
    CLIENT,
    { key: "type", label: "Type", cls: "c" },
    { key: "period", label: "Period" },
    { key: "trans_number", label: "SOA #" },
    { key: "or_number", label: "OR #" },
    { key: "amount", label: "Amount", cls: "n", money: true, sum: true },
    { key: "collected_date", label: "Collected date" },
    { key: "collected_by", label: "Collected by", cls: "dsh-wide" },
    { key: "deposited_date", label: "Deposited date" },
    { key: "deposited_by", label: "Deposited by", cls: "dsh-wide" },
    { key: "dep_slip_number", label: "Deposit slip #" },
];
const ARREARS_COLS = [
    CLIENT,
    { key: "type", label: "Type", cls: "c" },
    { key: "service", label: "Unpaid service", cls: "dsh-wide" },
    { key: "period", label: "Period" },
    { key: "trans_number", label: "SOA #" },
    { key: "date_billed", label: "Date billed" },
    { key: "months_unpaid", label: "Months unpaid", cls: "n" },
    { key: "amount", label: "Amount due", cls: "n", money: true, sum: true },
];
const KPI_COLS = { billed: BILL_COLS, outstanding: BILL_COLS, collected: COLLECTED_COLS, deposited: DEPOSITED_COLS, arrears: ARREARS_COLS };

function KpiPopup({ kpi, period, onClose }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [type, setType] = useState("All"); // All | PF | EO
    const info = KPI_INFO[kpi];
    const cols = KPI_COLS[kpi];

    useEffect(() => {
        let alive = true;
        apiFetch(`/ims_dashboard/billing/detail?${period.qs}&kpi=${kpi}`)
            .then((r) => alive && setData(r))
            .catch((e) => alive && setError(e.message || "Couldn't load the details."));
        return () => { alive = false; };
    }, [kpi, period.qs]);

    const rows = useMemo(() => {
        const term = q.trim().toLowerCase();
        return (data?.rows || [])
            .filter((r) => type === "All" || r.type === type)
            .filter((r) => !term || [...cols.map((c) => r[c.key]), r.branch].some((v) => String(v ?? "").toLowerCase().includes(term)));
    }, [data, q, type, cols]);
    const all = data?.rows || [];
    const filters = [{ type: "All", amount: sumBy(all, info.sumKey), count: all.length }, ...(data?.by_type || [])];

    return (
        <Modal title={`${info.title} · ${period.label}`} onClose={onClose} size="xxlg"
            footer={(
                <>
                    <button type="button" className="btn" disabled={!rows.length}
                        onClick={() => csv(`Dashboard-${info.title.replace(/\s+/g, "-")}-${type}-${period.file}`, cols, rows)}>CSV</button>
                    <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
                </>
            )}>
            <p className="dsh-pop-note">{info.note}</p>
            {error && <div className="alert-error" role="alert">{error}</div>}
            {!data && !error && <p className="dsh-plot-msg">Loading…</p>}
            {data && (
                <>
                    <div className="dsh-pop-chips" role="group" aria-label="Filter by type">
                        {filters.map((t) => (
                            <button key={t.type} type="button" className={`dsh-pop-chip${type === t.type ? " is-on" : ""}`}
                                aria-pressed={type === t.type} onClick={() => setType(t.type)}>
                                <small>{t.type === "All" ? "All (PF + EO)" : t.type}</small>
                                <b>{n2(t.amount)}</b>
                                <span>{n0(t.count)} record(s)</span>
                            </button>
                        ))}
                    </div>
                    <input className="input dsh-pop-search" type="search" placeholder="Search client, trade name, SOA #, OR #…" value={q}
                        onChange={(e) => setQ(e.target.value)} aria-label="Search" />
                    <Table cols={cols} rows={rows} busy={false} rowKey="id" />
                </>
            )}
        </Modal>
    );
}

function ChartCard({ span = 6, title, sub, keys, center, busy, empty = false, tall = false, children }) {
    return (
        <section className={`card dsh-chart dsh-span-${span}`}>
            <header className="dsh-chart-head">
                <div>
                    <h5>{title}</h5>
                    {sub && <span>{sub}</span>}
                </div>
                {keys?.length > 1 && (
                    <ul className="dsh-keys">
                        {keys.map((k) => <li key={k.key}><i className={`is-${k.c}`} />{k.label}</li>)}
                    </ul>
                )}
            </header>
            <div className={`dsh-plot${tall ? " is-tall" : ""}`}>
                {busy ? <p className="dsh-plot-msg">Loading…</p>
                    : empty ? <p className="dsh-plot-msg">No data this month.</p>
                        : <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>}
                {!busy && !empty && center && <div className="dsh-center">{center}</div>}
            </div>
        </section>
    );
}

function Tip({ active, payload, label, money = false, labelFmt }) {
    if (!active || !payload?.length) return null;
    const title = labelFmt ? labelFmt(label) : label;
    return (
        <div className="dsh-tip">
            {title && <p>{title}</p>}
            {payload.map((p) => (
                <div key={p.dataKey ?? p.name} className="dsh-tip-row">
                    <span>{p.name}</span>
                    <b>{money ? n2(p.value) : n0(p.value)}</b>
                </div>
            ))}
        </div>
    );
}

function TableSection({ title, sub, cols, rows = [], busy, rowKey, file }) {
    const list = rows || [];
    return (
        <section className="card dsh-section">
            <header className="dsh-section-head">
                <div>
                    <h5>{title}</h5>
                    {sub && <span className="dsh-muted">{sub}</span>}
                </div>
                {list.length > 0 && <button type="button" className="btn btn-sm" onClick={() => csv(file, cols, list)}>CSV</button>}
            </header>
            <Table cols={cols} rows={list} busy={busy} rowKey={rowKey} />
        </section>
    );
}

function Table({ cols, rows, busy, rowKey }) {
    const totals = useMemo(() => Object.fromEntries(cols.filter((c) => c.sum).map((c) => [c.key, sumBy(rows, c.key)])), [cols, rows]);
    const fmt = (c, v) => (c.money ? n2(v) : c.sum ? n0(v) : v || "—");
    return (
        <div className="dsh-scroll">
            <table className="dsh-table">
                <thead>
                    <tr>
                        <th className="c">#</th>
                        {cols.map((c) => <th key={c.key} className={c.cls}>{c.label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {busy && <tr><td className="dsh-empty" colSpan={cols.length + 1}>Loading…</td></tr>}
                    {!busy && !rows.length && <tr><td className="dsh-empty" colSpan={cols.length + 1}>No record found.</td></tr>}
                    {!busy && rows.map((r, i) => (
                        <tr key={r[rowKey] ?? i}>
                            <td className="c">{i + 1}</td>
                            {cols.map((c) => (c.kind === "client"
                                ? <td key={c.key} className="dsh-client"><b>{r.client_name || "—"}</b><span>{r.branch || "—"}</span></td>
                                : <td key={c.key} className={c.cls} title={c.cls === "dsh-wide" ? r[c.key] : undefined}>{fmt(c, r[c.key])}</td>))}
                        </tr>
                    ))}
                </tbody>
                {rows.length > 0 && (
                    <tfoot>
                        <tr>
                            <th />
                            {cols.map((c, i) => <th key={c.key} className={c.cls}>{i === 0 ? `Total (${rows.length})` : c.sum ? fmt(c, totals[c.key]) : ""}</th>)}
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}

function csv(name, cols, rows) {
    const columns = cols.flatMap((c) => (c.kind === "client"
        ? [{ label: "Client name", value: (r) => r.client_name }, { label: "Branch code - Trade name", value: (r) => r.branch }]
        : [{ label: c.label, money: c.money, value: (r) => r[c.key] }]));
    const t = { [cols[0].key]: `TOTAL (${rows.length})` };
    cols.forEach((c) => { if (c.sum) t[c.key] = sumBy(rows, c.key); });
    exportCsv(name, columns, rows, t);
}