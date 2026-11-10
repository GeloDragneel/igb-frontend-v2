import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, apiFetch } from "../context/AuthContext";
import { usePeriod } from "../context/PeriodContext";
import Icon from "../components/Icons";
import Modal from "../components/Modal";
import { fmtDate, money } from "../utils/format";
import { calc as itsCalc, fromApi as itsFromApi } from "./bir/IncomeTaxSummary";
import "./HomePayables.css";

/* =========================================================
   BIR filing calendar (Philippines) – the dates of the RETURN DEADLINE schedule, exactly as written
   (a date on a Saturday / Sunday is NOT moved to Monday)
     1601-C / 0619-E       10th day after the end of each month
     1601-EQ               last day of the month after the end of each quarter
     2550Q / SLSP / 2551Q  25th day after the end of the quarter
     1701Q                 May 15 · Aug 15 · Nov 15        1702Q   May 29 · Aug 29 · Nov 29
     1701 / 1702-RT        April 15                         1604-C  January 31 · 1604-E  March 01
========================================================= */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();            // m = 0-based
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const at = (y, m, day) => new Date(y, m, Math.min(day, lastDay(y, m)));

function birDeadlines(today, { vat, corp }, maxDays = 120) {
    const out = [];
    const add = (form, title, due, period, tag) => out.push({ form, title, due, period, tag });
    const y0 = today.getFullYear();

    for (let y = y0 - 1; y <= y0 + 1; y++) {
        for (let m = 0; m < 12; m++) {
            const label = `${MONTHS[m]} ${y}`;
            const ny = m === 11 ? y + 1 : y;
            const nm = (m + 1) % 12;
            const quarterEnd = m % 3 === 2;

            // monthly withholding – every 10th day after the end of each month
            add("1601-C", "Withholding Tax on Compensation", at(ny, nm, 10), label, "Monthly");
            add("0619-E", "Expanded Withholding Tax remittance", at(ny, nm, 10), label, "Monthly");

            if (quarterEnd) {
                const q = Math.floor(m / 3) + 1;
                const ql = `Q${q} ${y}`;
                add("1601-EQ", "Quarterly Expanded Withholding Tax + QAP", at(ny, nm, 31), ql, "Quarterly");   // last day of the next month
                if (vat) {
                    add("2550Q", "Quarterly VAT Return + SAWT", at(ny, nm, 25), ql, "Quarterly");
                    add("SLSP", "Summary List of Sales & Purchases", at(ny, nm, 25), ql, "Quarterly");
                } else {
                    add("2551Q", "Quarterly Percentage Tax", at(ny, nm, 25), ql, "Quarterly");
                }
                if (q <= 3) {
                    if (corp) add("1702Q", "Quarterly Income Tax (Corporation)", at(y, [4, 7, 10][q - 1], 29), ql, "Quarterly");
                    else add("1701Q", "Quarterly Income Tax (Individual)", at(y, [4, 7, 10][q - 1], 15), ql, "Quarterly");
                }
            }
        }
        // annual
        add("1604-C", "Annual Info Return – Compensation (Alphalist)", at(y, 0, 31), `CY ${y - 1}`, "Annual");
        add("1604-E", "Annual Info Return – Expanded Withholding", at(y, 2, 1), `CY ${y - 1}`, "Annual");
        add(corp ? "1702-RT" : "1701", corp ? "Annual Income Tax (Corporation)" : "Annual Income Tax (Individual)", at(y, 3, 15), `CY ${y - 1}`, "Annual");
    }

    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return out
        .map((x) => ({ ...x, days: Math.round((x.due - t) / 86400000) }))
        .filter((x) => x.days >= -5 && x.days <= maxDays)
        .sort((a, b) => a.due - b.due);
}


const readPref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === "1"; } catch { return d; } };
const writePref = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* ignore */ } };
const short = (n) => {
    const v = Math.abs(Number(n) || 0);
    const s = v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0);
    return (n < 0 ? "−" : "") + "₱" + s;
};
const urgency = (days) => (days < 0 ? "late" : days <= 3 ? "hot" : days <= 10 ? "warm" : "calm");
const dueText = (days) => (days < 0 ? `${-days}d late` : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`);

const BIR_LINKS = [
    ["BIR", "https://www.bir.gov.ph/"],
    ["eFPS", "https://efps.bir.gov.ph/"],
    ["ORUS", "https://orus.bir.gov.ph/"],
    ["eBIRForms", "https://www.bir.gov.ph/ebirforms"],
];
/* ---------- number that counts up to its value (₱0 → ₱45,942,161.84) ---------- */
function CountUp({ value, format = money, duration = 1200 }) {
    const target = Number(value) || 0;
    const [shown, setShown] = useState(0);
    const fromRef = useRef(0);
    useEffect(() => {
        const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        const start = fromRef.current;
        if (reduce || start === target) { setShown(target); fromRef.current = target; return; }
        let raf = 0;
        const t0 = performance.now();
        const tick = (now) => {
            const p = Math.min(1, (now - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 3);                 // fast at first, slows down at the end
            const v = start + (target - start) * eased;
            setShown(v);
            fromRef.current = v;
            if (p < 1) raf = requestAnimationFrame(tick);
            else fromRef.current = target;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);
    return <span className="hd-count-up">{format(Math.round(shown * 100) / 100)}</span>;
}
/* ---------- tiny SVG helpers ---------- */
function Sparkline({ values, color = "#fff" }) {
    const w = 110, h = 34, max = Math.max(1, ...values), min = Math.min(0, ...values);
    const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - ((v - min) / (max - min || 1)) * (h - 4) - 2]);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
            <path d={`${d} L${w},${h} L0,${h} Z`} fill={color} opacity=".18" />
            <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function AreaChart({ trend }) {
    const [hover, setHover] = useState(null);
    const W = 640, H = 230, P = { l: 52, r: 14, t: 14, b: 28 };
    const max = Math.max(1, ...trend.flatMap((t) => [t.sales, t.costs])) * 1.1;
    const x = (i) => P.l + (i / Math.max(1, trend.length - 1)) * (W - P.l - P.r);
    const y = (v) => P.t + (1 - v / max) * (H - P.t - P.b);
    // smooth curve
    const path = (key) => trend.map((t, i) => {
        if (!i) return `M${x(i)},${y(t[key])}`;
        const px = x(i - 1), py = y(trend[i - 1][key]), cx = (px + x(i)) / 2;
        return `C${cx},${py} ${cx},${y(t[key])} ${x(i)},${y(t[key])}`;
    }).join(" ");
    const area = (key) => `${path(key)} L${x(trend.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);

    return (
        <div className="hd-chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Sales and costs, last 6 months">
                <defs>
                    <linearGradient id="hdSales" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#6366f1" stopOpacity=".45" /><stop offset="1" stopColor="#6366f1" stopOpacity="0" /></linearGradient>
                    <linearGradient id="hdCosts" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f97316" stopOpacity=".35" /><stop offset="1" stopColor="#f97316" stopOpacity="0" /></linearGradient>
                </defs>
                {ticks.map((t) => (
                    <g key={t}>
                        <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="hd-grid" />
                        <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="hd-axis">{short(t).replace("₱", "")}</text>
                    </g>
                ))}
                <path d={area("costs")} fill="url(#hdCosts)" />
                <path d={area("sales")} fill="url(#hdSales)" />
                <path d={path("costs")} fill="none" stroke="#f97316" strokeWidth="2.5" />
                <path d={path("sales")} fill="none" stroke="#6366f1" strokeWidth="3" />
                {trend.map((t, i) => (
                    <g key={t.month}>
                        <text x={x(i)} y={H - 8} textAnchor="middle" className="hd-axis">{t.label}</text>
                        <rect x={x(i) - 24} y={P.t} width="48" height={H - P.t - P.b} fill="transparent"
                            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
                        {hover === i && <line x1={x(i)} x2={x(i)} y1={P.t} y2={H - P.b} className="hd-hoverline" />}
                        <circle cx={x(i)} cy={y(t.sales)} r={hover === i ? 5 : 3.5} fill="#6366f1" stroke="#fff" strokeWidth="2" />
                        <circle cx={x(i)} cy={y(t.costs)} r={hover === i ? 5 : 3.5} fill="#f97316" stroke="#fff" strokeWidth="2" />
                    </g>
                ))}
            </svg>
            {hover !== null && (
                <div className="hd-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
                    <b>{trend[hover].label}</b>
                    <span><i style={{ background: "#6366f1" }} />Sales {money(trend[hover].sales)}</span>
                    <span><i style={{ background: "#f97316" }} />Costs {money(trend[hover].costs)}</span>
                    <span className={trend[hover].sales - trend[hover].costs >= 0 ? "hd-up" : "hd-down"}>Net {money(trend[hover].sales - trend[hover].costs)}</span>
                </div>
            )}
        </div>
    );
}

function Ring({ a, b }) {
    const total = Math.max(1, a + b), r = 54, c = 2 * Math.PI * r;
    const aLen = (a / total) * c;
    return (
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
            <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(148,163,184,.2)" strokeWidth="16" />
            <circle cx="70" cy="70" r={r} fill="none" stroke="url(#hdRingA)" strokeWidth="16" strokeLinecap="round"
                strokeDasharray={`${aLen} ${c}`} transform="rotate(-90 70 70)" />
            <circle cx="70" cy="70" r={r} fill="none" stroke="url(#hdRingB)" strokeWidth="16" strokeLinecap="round"
                strokeDasharray={`${c - aLen} ${c}`} strokeDashoffset={-aLen} transform="rotate(-90 70 70)" />
            <defs>
                <linearGradient id="hdRingA"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#ec4899" /></linearGradient>
                <linearGradient id="hdRingB"><stop offset="0" stopColor="#06b6d4" /><stop offset="1" stopColor="#10b981" /></linearGradient>
            </defs>
        </svg>
    );
}

/* =========================================================
   Page
   ========================================================= */
export default function Home() {
    const { user } = useAuth();
    const { from, to } = usePeriod();
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [vat, setVat] = useState(() => readPref("home.vat", true));
    const [corp, setCorp] = useState(() => readPref("home.corp", true));
    const [pay, setPay] = useState(null);            // /bir/payables
    const [incomeTax, setIncomeTax] = useState();    // undefined = loading · null = not available · number
    const fromMonth = from.slice(0, 7);
    const toMonth = to.slice(0, 7);

    useEffect(() => {
        let alive = true;
        setError("");
        apiFetch(`/dashboard?from=${fromMonth}&to=${toMonth}`)
            .then((d) => alive && setData(d))
            .catch((e) => alive && setError(e.message || "Couldn't load the dashboard."));
        return () => { alive = false; };
    }, [fromMonth, toMonth, user?.id, user?.caid]);

    // tax payables: returns filed + books; income tax = the same math as BIR & Tax → Income Tax Summary
    useEffect(() => {
        let alive = true;
        setPay(null);
        setIncomeTax(undefined);
        const q = `from=${fromMonth}&to=${toMonth}`;
        apiFetch(`/bir/payables?${q}`).then((d) => alive && setPay(d)).catch(() => alive && setPay(false));
        return () => { alive = false; };
    }, [fromMonth, toMonth, user?.id, user?.caid]);

    /* ---------- tax tiles = the LATEST period only (the return that is due now), not the whole range ----------
       VAT            last finished quarter     (2550Q)
       Withholding    last finished month       (0619-E)
       Compensation   last finished month       (1601-C)
       Income tax     last finished quarter     (1701Q / 1702Q; Q4 = annual): Jan→quarter end minus Jan→previous quarter end
       "now" = today, or the end of the picked period when it is in the past */
    const latest = useMemo(() => {
        const today = new Date();
        const [ty, tm] = toMonth.split("-").map(Number);
        const ref = new Date(Math.min(today.getTime(), new Date(ty, tm, 1).getTime()));     // first day after the picked period
        const ym = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;                       // m = 0-based
        const lm = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);                       // last finished month
        const qEndMonth = Math.floor(ref.getMonth() / 3) * 3 - 1;                            // last month of the last finished quarter
        const qEnd = new Date(ref.getFullYear(), qEndMonth, 1);
        const qStart = new Date(qEnd.getFullYear(), qEnd.getMonth() - 2, 1);
        const q = Math.floor(qEnd.getMonth() / 3) + 1;
        const prevEnd = new Date(qEnd.getFullYear(), qEnd.getMonth() - 3, 1);
        return {
            month: ym(lm.getFullYear(), lm.getMonth()), monthLabel: `${MONTHS[lm.getMonth()]} ${lm.getFullYear()}`,
            qFrom: ym(qStart.getFullYear(), qStart.getMonth()), qTo: ym(qEnd.getFullYear(), qEnd.getMonth()),
            qLabel: `Q${q} ${qEnd.getFullYear()}`, q, year: qEnd.getFullYear(),
            prevTo: q > 1 ? ym(prevEnd.getFullYear(), prevEnd.getMonth()) : null,
        };
    }, [toMonth]);
    const [payQ, setPayQ] = useState(null);           // /bir/payables for the last quarter  (VAT)
    const [payM, setPayM] = useState(null);           // /bir/payables for the last month    (EWT, compensation)
    useEffect(() => {
        let alive = true;
        setPayQ(null); setPayM(null); setIncomeTax(undefined);
        apiFetch(`/bir/payables?from=${latest.qFrom}&to=${latest.qTo}`).then((d) => alive && setPayQ(d)).catch(() => alive && setPayQ(false));
        apiFetch(`/bir/payables?from=${latest.month}&to=${latest.month}`).then((d) => alive && setPayM(d)).catch(() => alive && setPayM(false));
        // income tax of the quarter = year-to-date payable up to this quarter − year-to-date up to the previous one
        const its = (to) => apiFetch(`/reports/income-tax-summary?from=${latest.year}-01&to=${to}&branch=all`)
            .then((r) => itsCalc(itsFromApi(r), r.months, r.brackets, r.corporate).payable);
        Promise.all([its(latest.qTo), latest.prevTo ? its(latest.prevTo) : Promise.resolve(0)])
            .then(([now, before]) => alive && setIncomeTax(Math.round((now - before) * 100) / 100))
            .catch(() => alive && setIncomeTax(null));
        return () => { alive = false; };
    }, [latest, user?.id, user?.caid]);

    const deadlines = useMemo(() => birDeadlines(new Date(), { vat, corp }), [vat, corp]);
    const upcoming = deadlines.filter((d) => d.days >= -5).slice(0, 6);
    // "All deadlines" popup: the next 12 months
    const [allOpen, setAllOpen] = useState(false);
    const allDeadlines = useMemo(() => (allOpen ? birDeadlines(new Date(), { vat, corp }, 366) : []), [allOpen, vat, corp]);
    const allByMonth = useMemo(() => {
        const m = [];
        for (const d of allDeadlines) {
            const key = `${MONTHS[d.due.getMonth()]} ${d.due.getFullYear()}`;
            const g = m.find((x) => x.key === key);
            if (g) g.items.push(d); else m.push({ key, items: [d] });
        }
        return m;
    }, [allDeadlines]);
    const next = deadlines.find((d) => d.days >= 0);
    // next 2 due dates; forms with the same due date are merged in one box (e.g. 1601-C + 0619-E on the 10th)
    const nextDue = useMemo(() => {
        const groups = [];
        for (const d of deadlines) {
            if (d.days < 0) continue;
            const g = groups.find((x) => x.days === d.days);
            if (g) g.items.push(d);
            else if (groups.length < 2) groups.push({ days: d.days, due: d.due, items: [d] });
        }
        return groups;
    }, [deadlines]);

    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const name = (user?.name || user?.fullname || user?.username || "").split(" ")[0] || "there";

    const trend = data?.trend || [];
    const costs = data ? data.buy.purchases + data.buy.expenses : 0;
    const net = data ? data.sales.total - costs : 0;
    // VAT on Home = the BIR return numbers (all branches, sales + purchases/expenses + GRN by declared month)
    const vatBooks = payM && payM.vat && payM.vat.output != null ? payM.vat : null;   // same month as the VAT tile
    const vatPay = vatBooks ? vatBooks.books : (data?.vat_payable ?? 0);
    const outVat = vatBooks ? vatBooks.output : (data?.sales.vat ?? 0);
    const inVat = vatBooks ? vatBooks.input : (data?.buy.vat ?? 0);

    const a = data?.attention;
    const sc = a?.scanned || {};
    const chips = a ? [
        { n: a.tickets, label: "Pending tickets", to: "/task/sales", c: "amber", icon: "clock" },
        { n: (sc.sales || 0) + (sc.purchases || 0) + (sc.expenses || 0), label: "Scanned receipts", to: "/task/sales/scanned-receipts", c: "blue", icon: "fileText" },
        { n: a.for_collection, label: "For collection", to: "/task/sales/for-collection", c: "green", icon: "wallet" },
        { n: a.for_payment, label: "For payment", to: "/task/purchases/for-payment", c: "pink", icon: "cart" },
        { n: a.unaudited, label: "Not audited", to: "/task/sales", c: "violet", icon: "checkSquare" },
        { n: a.out_of_stock, label: "Out of stock", to: "/task/inventory/stocks", c: "red", icon: "alert" },
    ] : [];

    const tiles = [
        { label: "Sales", value: data?.sales.total, sub: data ? `${data.sales.count} invoices` : "", icon: "receipt", g: "hd-g1", ready: !!data, failed: false, spark: trend.map((t) => t.sales), to: "/task/sales" },
        { label: "Purchases & expenses", value: costs, sub: data ? `${data.buy.count} records` : "", icon: "cart", g: "hd-g2", ready: !!data, failed: false, spark: trend.map((t) => t.costs), to: "/task/purchases" },
        { label: "Accounts receivable", value: pay ? pay.ar?.total : undefined, sub: pay ? `${pay.ar?.count ?? 0} unpaid invoice${pay.ar?.count === 1 ? "" : "s"} · no receipt yet` : "", icon: "wallet", g: "hd-g3", ready: !!pay, failed: pay === false, spark: null, to: "/books/receivables" },
        { label: "Accounts payable", value: pay ? pay.ap?.total : undefined, sub: pay ? `${pay.ap?.count ?? 0} unpaid bill${pay.ap?.count === 1 ? "" : "s"} · no payment yet` : "", icon: "cart", g: "hd-g5", ready: !!pay, failed: pay === false, spark: null, to: "/books/payables" },
    ];

    // src = the /bir/payables answer the tile's filed / paid pill comes from
    const payCards = [
        { key: "vat", label: "VAT payable", neg: "Excess input VAT", hint: `${latest.monthLabel} · Output − Input VAT`, src: payM, value: payM ? payM.vat.books : payM === false ? null : undefined, to: "/bir/vat-summary", c: "pv-g1", icon: "fileText" },
        { key: "ewt", label: "Withholding tax payable", neg: "Withholding tax payable", hint: `${latest.monthLabel} · 0619-E`, src: payM, value: payM ? payM.ewt.books : payM === false ? null : undefined, to: "/bir/returns", c: "pv-g2", icon: "cart" },
        { key: "income", label: "Income tax payable", neg: "Income tax (excess credits)", hint: `${latest.qLabel} · ${latest.q === 4 ? "Annual" : "Quarterly"} ITR`, src: null, value: incomeTax, to: "/bir/income-tax", c: "pv-g3", icon: "barChart" },
        { key: "comp", label: "Compensation payable", neg: "Compensation payable", hint: `${latest.monthLabel} · 1601-C`, src: payM, value: payM ? (payM.comp.returns ? payM.comp.filed : null) : payM === false ? null : undefined, to: "/bir/returns", c: "pv-g4", icon: "wallet" },
    ];

    const topMax = Math.max(1, ...(data?.top_customers || []).map((c) => c.total));
    const [detail, setDetail] = useState(null);      // tile popup: { kind, label, to, value }

    return (
        <div className="hd">
            {/* ---------- hero ---------- */}
            <section className="hd-hero">
                <div className="hd-hero-text">
                    <span className="hd-eyebrow">{fmtDate(from)} – {fmtDate(to)}</span>
                    <h1>{greet}, {name} <span aria-hidden="true">👋</span></h1>
                    <p>{data ? <>You made <b>{money(data.sales.total)}</b> in sales and spent <b>{money(costs)}</b> this period.</> : "Loading your numbers…"}</p>
                    <div className="hd-hero-actions">
                        <Link to="/task/sales/new" className="hd-btn hd-btn-light"><Icon name="plus" size={16} /> New Sales Invoice</Link>
                        <Link to="/task/purchases/new" className="hd-btn hd-btn-ghost">New purchase</Link>
                        <Link to="/task/expenses/new" className="hd-btn hd-btn-ghost">New expense</Link>
                        <Link to="/setup/product" className="hd-btn hd-btn-ghost">New Inventory Item</Link>
                        <Link to="/task/general-journal" className="hd-btn hd-btn-ghost">Journal entry</Link>
                    </div>
                </div>
                {next && (
                    <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
                        <div style={{ display: "flex", flexDirection: "row-reverse", gap: 12, flexWrap: "wrap", justifyContent: "flex-start" }}>
                            {/* box 1 = next due date, box 2 = the due date after it; same due date = one box */}
                            {nextDue.map((g, i) => (
                                <div key={g.days} className={`hd-count hd-${urgency(g.days)}`}>
                                    <span className="hd-count-label">{i === 0 ? "Next due" : "Following due"}</span>
                                    <span className="hd-count-num">{g.days}<small>{g.days === 1 ? "day" : "days"}</small></span>
                                    <span className="hd-count-form">Form {g.items.map((d) => d.form).join(" / ")}</span>
                                    <span className="hd-count-date">Period Covered : {[...new Set(g.items.map((d) => d.period))].join(" / ")}</span>
                                    <span className="hd-count-date">Due : {fmtDate(ymd(g.due))}</span>
                                </div>
                            ))}
                        </div>
                        <button type="button" className="hd-btn hd-btn-ghost" onClick={() => setAllOpen(true)}>Show more</button>
                    </div>
                )}
            </section>

            {error && <div className="alert-error" role="alert">{error}</div>}

            {/* ---------- KPI tiles ---------- */}
            <section className="hd-tiles">
                {tiles.map((t, i) => (
                    <button type="button" key={t.label} className={`hd-tile ${t.g}`} style={{ textAlign: "left", border: 0, cursor: "pointer", font: "inherit", width: "100%" }}
                        onClick={() => setDetail({ kind: ["sales", "buy", "ar", "ap"][i], label: t.label, to: t.to, value: t.value })}>
                        <div className="hd-tile-top">
                            <span className="hd-tile-icon"><Icon name={t.icon} size={18} /></span>
                            <span className="hd-tile-label">{t.label}</span>
                        </div>
                        <div className="hd-tile-value">{t.failed ? "—" : t.ready ? <CountUp value={t.value} /> : <span className="hd-sk" />}</div>
                        <div className="hd-tile-bottom">
                            <span>{t.sub}</span>
                            {t.spark && t.spark.length > 1 && <Sparkline values={t.spark} />}
                        </div>
                    </button>
                ))}
            </section>

            {/* ---------- tax payables (same tiles as above) ---------- */}
            <section className="hd-tiles">
                {payCards.map((p) => {
                    const r = p.src ? p.src[p.key] : null;
                    const failed = p.value === null;
                    const loading = !failed && p.value === undefined;
                    const v = Number(p.value) || 0;
                    return (
                        <button type="button" key={p.key} className={`hd-tile ${p.c}`} style={{ textAlign: "left", border: 0, cursor: "pointer", font: "inherit", width: "100%" }}
                            onClick={() => setDetail({ kind: p.key, label: v < 0 ? p.neg : p.label, to: p.to, value: p.value })}>
                            <div className="hd-tile-top">
                                <span className="hd-tile-icon"><Icon name={p.icon} size={18} /></span>
                                <span className="hd-tile-label">{v < 0 ? p.neg : p.label}</span>
                            </div>
                            <div className="hd-tile-value">{loading ? <span className="hd-sk" /> : failed ? "—" : <CountUp value={Math.abs(v)} />}</div>
                            <div className="hd-tile-bottom pv-bottom">
                                <span>{p.hint}</span>
                                {r && (r.returns
                                    ? <span className="pv-pill">{r.balance > 0.009 ? `Unpaid ${money(r.balance)}` : "Filed · Paid"}</span>
                                    : <span className="pv-pill pv-pill-dim">Not filed</span>)}
                            </div>
                        </button>
                    );
                })}
            </section>

            {/* ---------- needs attention ---------- */}
            {chips.some((c) => c.n > 0) && (
                <section className="hd-chips">
                    {chips.filter((c) => c.n > 0).map((c) => (
                        <Link key={c.label} to={c.to} className={`hd-chip hd-c-${c.c}`}>
                            <Icon name={c.icon} size={15} />
                            <b>{c.n}</b> {c.label}
                        </Link>
                    ))}
                </section>
            )}

            {/* ---------- chart + VAT ---------- */}
            <section className="hd-row hd-row-2">
                <div className="hd-card">
                    <header className="hd-card-head">
                        <h3>Sales vs costs</h3>
                        <div className="hd-legend"><span><i style={{ background: "#6366f1" }} />Sales</span><span><i style={{ background: "#f97316" }} />Purchases & expenses</span></div>
                    </header>
                    {data ? <AreaChart trend={trend} /> : <div className="hd-sk hd-sk-chart" />}
                </div>

                <div className="hd-card hd-vat">
                    <header className="hd-card-head"><h3>VAT · {latest.monthLabel}</h3></header>
                    {data ? (
                        <>
                            <div className="hd-ring">
                                <Ring a={outVat} b={inVat} />
                                <div className="hd-ring-center">
                                    <span>{vatPay >= 0 ? "Payable" : "Excess"}</span>
                                    <b>{short(Math.abs(vatPay))}</b>
                                </div>
                            </div>
                            <ul className="hd-vat-list">
                                <li><i className="hd-dot-a" />Output VAT<b>{money(outVat)}</b></li>
                                <li><i className="hd-dot-b" />Input VAT<b>{money(inVat)}</b></li>
                            </ul>
                            <Link to="/bir/vat-summary" className="hd-link">Open VAT Summary →</Link>
                        </>
                    ) : <div className="hd-sk hd-sk-chart" />}
                </div>
            </section>

            {detail && <TileDetail tile={detail} from={fromMonth} to={toMonth} onClose={() => setDetail(null)} />}

            {/* all upcoming BIR deadlines (next 12 months) */}
            {allOpen && (
                <Modal title="Upcoming BIR deadlines" onClose={() => setAllOpen(false)} size="lg"
                    footer={<button className="btn" onClick={() => setAllOpen(false)}>Close</button>}>
                    <p className="muted small" style={{ marginTop: 0 }}>
                        Next 12 months · {vat ? "VAT" : "Non-VAT"} · {corp ? "Corporation" : "Individual"}
                    </p>
                    <div style={{ display: "grid", gap: 18 }}>
                        {allByMonth.map((g) => (
                            <section key={g.key}>
                                <h4 style={{ margin: "0 0 6px", fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.7 }}>{g.key}</h4>
                                <ol className="hd-timeline" style={{ margin: 0 }}>
                                    {g.items.map((d, i) => (
                                        <li key={i} className={`hd-${urgency(d.days)}`}>
                                            <span className="hd-tl-date"><small>{MONTHS[d.due.getMonth()]}</small>{d.due.getDate()}</span>
                                            <span className="hd-tl-body"><b>Form {d.form}</b><small>{d.title} · Period Covered : {d.period}</small></span>
                                            <span className="hd-tl-due">{dueText(d.days)}</span>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        ))}
                    </div>
                </Modal>
            )}

            {/* ---------- deadlines + customers + recent ---------- */}
            <section className="hd-row hd-row-3">
                <div className="hd-card">
                    <header className="hd-card-head">
                        <h3>BIR calendar</h3>
                        <div className="hd-seg">
                            <button className={vat ? "on" : ""} onClick={() => { setVat(true); writePref("home.vat", true); }}>VAT</button>
                            <button className={!vat ? "on" : ""} onClick={() => { setVat(false); writePref("home.vat", false); }}>Non-VAT</button>
                        </div>
                        <div className="hd-seg">
                            <button className={corp ? "on" : ""} onClick={() => { setCorp(true); writePref("home.corp", true); }}>Corp</button>
                            <button className={!corp ? "on" : ""} onClick={() => { setCorp(false); writePref("home.corp", false); }}>Indiv</button>
                        </div>
                    </header>
                    <ol className="hd-timeline">
                        {upcoming.map((d, i) => (
                            <li key={i} className={`hd-${urgency(d.days)}`}>
                                <span className="hd-tl-date"><small>{MONTHS[d.due.getMonth()]}</small>{d.due.getDate()}</span>
                                <span className="hd-tl-body"><b>{d.form}</b><small>{d.title} · {d.period}</small></span>
                                <span className="hd-tl-due">{dueText(d.days)}</span>
                            </li>
                        ))}
                    </ol>
                    <button type="button" className="btn btn-primary" onClick={() => setAllOpen(true)}
                        style={{ width: "100%", justifyContent: "center", margin: "12px 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                        <Icon name="calendar" size={16} /> Show all upcoming deadlines
                    </button>
                    <div className="hd-birlinks">
                        {BIR_LINKS.map(([l, href]) => <a key={l} href={href} target="_blank" rel="noopener noreferrer">{l} ↗</a>)}
                    </div>
                </div>

                <div className="hd-card">
                    <header className="hd-card-head"><h3>Top customers</h3></header>
                    {!data && <div className="hd-sk hd-sk-list" />}
                    {data && !data.top_customers?.length && <p className="hd-empty">No sales in this period yet.</p>}
                    <ul className="hd-bars">
                        {(data?.top_customers || []).map((c, i) => (
                            <li key={c.name}>
                                <div className="hd-bar-row"><span className="hd-rank">{i + 1}</span><span className="hd-bar-name">{c.name}</span><b>{short(c.total)}</b></div>
                                <div className="hd-bar"><span style={{ width: `${(c.total / topMax) * 100}%` }} /></div>
                                <small>{c.invoices} invoice{c.invoices === 1 ? "" : "s"}</small>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="hd-card">
                    <header className="hd-card-head"><h3>Recent invoices</h3><Link to="/task/sales" className="hd-link">All →</Link></header>
                    {!data && <div className="hd-sk hd-sk-list" />}
                    {data && !data.recent.length && <p className="hd-empty">No invoices yet.</p>}
                    <ul className="hd-recent">
                        {(data?.recent || []).map((s) => (
                            <li key={s.invoice_no}>
                                <Link to={`/task/sales/${encodeURIComponent(s.invoice_no)}`}>
                                    <span className="hd-avatar">{(s.customer || "?").slice(0, 1)}</span>
                                    <span className="hd-recent-main"><b>{s.customer}</b><small>{fmtDate(s.transaction_date)}{s.status ? ` · ${s.status}` : ""}</small></span>
                                    <span className="hd-recent-amt">{money(s.grand_total)}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>
        </div>
    );
}

/* =========================================================
   Tile popup: what is CURRENTLY open first (not filed / unpaid / not reconciled),
   the earlier periods that are already filed & paid folded below.
   ========================================================= */
const KIND_INFO = {
    sales: { forms: "VAT return (2550M / 2550Q)", party: "Customer", rowsTitle: "Latest sales invoices" },
    buy: { forms: "VAT return (2550M / 2550Q)", party: "Vendor", rowsTitle: "Latest purchases & expenses" },
    ar: { party: "Customer", rowsTitle: "Open receivables (no receipt yet)" },
    ap: { party: "Vendor", rowsTitle: "Open payables (no payment yet)" },
    vat: { forms: "2550M / 2550Q" },
    ewt: { forms: "0619-E / 1601-EQ" },
    income: { forms: "1701Q / 1702Q / 1701 / 1702-RT" },
    comp: { forms: "1601-C" },
};
const pill = (tone, text) => {
    const c = { green: ["rgba(22,163,74,.12)", "#15803d"], red: ["rgba(220,38,38,.12)", "#b91c1c"], amber: ["rgba(217,119,6,.14)", "#b45309"], gray: ["rgba(100,116,139,.14)", "#475569"] }[tone];
    return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: c[0], color: c[1], whiteSpace: "nowrap" }}>{text}</span>;
};
const filedPill = (m) => (m.filed ? pill("green", "Filed") : pill("red", "Not filed"));
const paidPill = (m) => (!m.filed ? pill("gray", "—") : m.paid ? pill("green", "Paid") : pill("amber", "Unpaid"));
const reconPill = (v) => (v === true ? pill("green", "Reconciled ✓") : v === false ? pill("red", "Not reconciled") : pill("gray", "No books to compare"));

function TileDetail({ tile, from, to, onClose }) {
    const [d, setD] = useState(null);
    const [error, setError] = useState("");
    const [showPrev, setShowPrev] = useState(false);
    const info = KIND_INFO[tile.kind] || {};
    const isTax = ["vat", "ewt", "income", "comp"].includes(tile.kind);
    const isOpen = tile.kind === "ar" || tile.kind === "ap";
    const isFlow = tile.kind === "sales" || tile.kind === "buy";      // no BIR filing here – just the numbers

    useEffect(() => {
        let alive = true;
        apiFetch(`/bir/payables/detail?${new URLSearchParams({ kind: tile.kind, from, to })}`)
            .then((r) => alive && setD(r))
            .catch((e) => alive && setError(e.message || "Couldn't load the details."));
        return () => { alive = false; };
    }, [tile.kind, from, to]);

    // income tax "books" per MONTH = Income Tax Summary: year-to-date payable at month end − at the previous month end
    const [itq, setItq] = useState({});              // { "2026-09": 2310.12 }
    useEffect(() => {
        if (tile.kind !== "income") return undefined;
        let alive = true;
        const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])];
        Promise.all(years.map(async (y) => {
            const ytd = await Promise.all(Array.from({ length: 12 }, (_, i) =>
                apiFetch(`/reports/income-tax-summary?from=${y}-01&to=${y}-${String(i + 1).padStart(2, "0")}&branch=all`)
                    .then((r) => itsCalc(itsFromApi(r), r.months, r.brackets, r.corporate).payable).catch(() => null)));
            return ytd.map((v, i) => [`${y}-${String(i + 1).padStart(2, "0")}`, v == null ? null : Math.round((v - (i ? ytd[i - 1] || 0 : 0)) * 100) / 100]);
        })).then((all) => alive && setItq(Object.fromEntries(all.flat())));
        return () => { alive = false; };
    }, [tile.kind, from, to]);

    // every month is shown; a month that is not over yet is "Not due yet" (not "Not filed")
    const quarterly = false;
    const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const months = useMemo(() => {
        const list = (d?.months || []).map((m) => (tile.kind === "income" ? { ...m, books: itq[m.month] ?? null } : m));
        if (!quarterly) return list;
        const g = [];
        for (const m of list) {
            const y = m.month.slice(0, 4), q = Math.floor((+m.month.slice(5, 7) - 1) / 3) + 1, key = `${y}-Q${q}`;
            let x = g.find((z) => z.key === key);
            if (!x) g.push(x = { key, month: `${y}-${String(q * 3).padStart(2, "0")}`, label: `Q${q} ${y}`, parts: [] });
            x.parts.push(m);
        }
        return g.map((x) => {
            const sum = (k) => (x.parts.some((p) => p[k] != null) ? Math.round(x.parts.reduce((n, p) => n + (Number(p[k]) || 0), 0) * 100) / 100 : null);
            const rets = [];
            x.parts.forEach((p) => p.returns.forEach((r) => { if (!rets.some((z) => z.form === r.form && z.period === r.period)) rets.push(r); }));
            const filed = x.parts.every((p) => p.filed);
            const rec = x.parts.map((p) => p.reconciled);
            return {
                ...x, output: sum("output"), input: sum("input"),
                books: sum("books"),
                returns: rets, filed, paid: filed && x.parts.every((p) => p.paid),
                reconciled: !filed ? null : rec.includes(false) ? false : rec.includes(true) ? true : null,
            };
        });
    }, [d, quarterly, tile.kind, itq]);
    const due = months.filter((m) => m.month < thisMonth);                 // the month is over → the return is due
    const done = (m) => m.filed && m.paid && m.reconciled !== false;
    const current = months.filter((m) => !done(m)).reverse();              // newest first (not-due months show "Not due yet")
    const previous = months.filter(done).reverse();
    const openReturns = (d?.returns || []).filter((r) => r.status !== "paid" || r.reconciled === false);
    const s = d?.summary;

    const th = { textAlign: "left", fontSize: 12, fontWeight: 700, opacity: 0.7, padding: "8px 10px", whiteSpace: "nowrap" };
    const td = { padding: "9px 10px", borderTop: "1px solid var(--border, #e2e8f0)", whiteSpace: "nowrap" };
    const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

    const MonthTable = ({ list }) => (
        <div className="table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                    <th style={th}>{quarterly ? "Quarter" : "Month"}</th>
                    {tile.kind === "vat" && <><th style={{ ...th, textAlign: "right" }}>Output VAT</th><th style={{ ...th, textAlign: "right" }}>Input VAT</th></>}
                    {tile.kind === "buy" && <><th style={{ ...th, textAlign: "right" }}>Purchases</th><th style={{ ...th, textAlign: "right" }}>Expenses</th></>}
                    <th style={{ ...th, textAlign: "right" }}>{tile.kind === "sales" || tile.kind === "buy" ? "System total" : "Books (system)"}</th>
                    <th style={th}>BIR return</th><th style={th}>Filed</th><th style={th}>Paid</th><th style={th}>Reconciled</th>
                </tr></thead>
                <tbody>
                    {list.map((m) => (
                        <tr key={m.month}>
                            <td style={{ ...td, fontWeight: 700 }}>{m.label}{m.count != null && <small className="muted"> · {m.count}</small>}</td>
                            {tile.kind === "vat" && <><td style={num}>{money(m.output)}</td><td style={num}>{money(m.input)}</td></>}
                            {tile.kind === "buy" && <><td style={num}>{money(m.purchases)}</td><td style={num}>{money(m.expenses)}</td></>}
                            <td style={{ ...num, fontWeight: 700 }}>{m.books == null ? <span className="muted">{tile.kind === "income" ? "…" : "not in the books"}</span> : money(m.books)}</td>
                            <td style={td}>{m.returns.length ? m.returns.map((r) => `${r.form} · ${r.period}`).join(", ") : <span className="muted">—</span>}</td>
                            <td style={td}>{!m.filed && m.month >= thisMonth ? pill("gray", "Not due yet") : filedPill(m)}</td>
                            <td style={td}>{paidPill(m)}</td>
                            <td style={td}>{m.filed ? reconPill(m.reconciled) : pill("gray", "—")}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const card = { border: "1px solid var(--border, #e2e8f0)", borderRadius: 14, padding: 14, marginBottom: 14 };
    const stat = (label, value, tone) => (
        <div style={{ padding: "10px 14px", borderRadius: 12, background: "var(--surface-2, #f1f5f9)" }}>
            <div className="muted small">{label}</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: tone }}>{value}</div>
        </div>
    );

    return (
        <Modal title={tile.label} onClose={onClose} size="xlg"
            footer={<>
                <Link to={tile.to} className="btn" onClick={onClose} style={{ marginRight: "auto" }}>Open full page →</Link>
                <button className="btn btn-primary" onClick={onClose}>Close</button>
            </>}>
            {error && <div className="alert-error" role="alert">{error}</div>}
            {!d && !error && <div className="hd-sk hd-sk-chart" />}

            {d && (
                <>
                    {/* headline numbers */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
                        {stat(isOpen ? "Open balance" : isTax ? "Current (books)" : "This period", tile.value == null ? "—" : money(Math.abs(Number(tile.value) || 0)))}
                        {isOpen && stat("Open invoices", d.rows.length)}
                        {isFlow && stat(tile.kind === "sales" ? "Invoices" : "Records", months.reduce((n, m) => n + (m.count || 0), 0))}
                        {isTax && (() => { const n = due.filter((m) => !m.filed).length; return stat(quarterly ? "Quarters not filed" : "Months not filed", n, n ? "#b91c1c" : "#15803d"); })()}
                        {isTax && stat("Unpaid on returns", money(s.balance), s.balance > 0.009 ? "#b45309" : "#15803d")}
                        {isTax && stat("Not reconciled", s.not_reconciled, s.not_reconciled ? "#b91c1c" : "#15803d")}
                    </div>

                    {/* Sales / Purchases & expenses: per month, no filing columns */}
                    {isFlow && (
                        <section style={card}>
                            <b style={{ display: "block", marginBottom: 8 }}>Per month</b>
                            <div className="table-scroll">
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead><tr>
                                        <th style={th}>Month</th>
                                        <th style={{ ...th, textAlign: "right" }}>{tile.kind === "sales" ? "Invoices" : "Records"}</th>
                                        {tile.kind === "buy" && <><th style={{ ...th, textAlign: "right" }}>Purchases</th><th style={{ ...th, textAlign: "right" }}>Expenses</th></>}
                                        <th style={{ ...th, textAlign: "right" }}>Total</th>
                                    </tr></thead>
                                    <tbody>
                                        {[...months].reverse().filter((m) => m.count || m.books).map((m) => (
                                            <tr key={m.month}>
                                                <td style={{ ...td, fontWeight: 700 }}>{m.label}</td>
                                                <td style={num}>{m.count}</td>
                                                {tile.kind === "buy" && <><td style={num}>{money(m.purchases)}</td><td style={num}>{money(m.expenses)}</td></>}
                                                <td style={{ ...num, fontWeight: 700 }}>{money(m.books)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {/* CURRENT: what still needs action */}
                    {isTax && (
                        <section style={card}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                                <b>Current · needs action</b>
                                <span className="muted small">{info.forms}</span>
                            </div>
                            {current.length ? <MonthTable list={current} /> : (
                                <p style={{ margin: 0, color: "#15803d", fontWeight: 700 }}>✓ Everything in this period is filed, paid and reconciled.</p>
                            )}
                            {openReturns.length > 0 && (
                                <div style={{ marginTop: 12 }}>
                                    <div className="muted small" style={{ marginBottom: 6 }}>Returns to settle / check</div>
                                    <div className="table-scroll">
                                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                            <thead><tr>
                                                <th style={th}>Return</th><th style={th}>Filed on</th>
                                                <th style={{ ...th, textAlign: "right" }}>Return amount</th><th style={{ ...th, textAlign: "right" }}>Books</th>
                                                <th style={{ ...th, textAlign: "right" }}>Difference</th><th style={{ ...th, textAlign: "right" }}>Balance</th><th style={th}>Status</th>
                                            </tr></thead>
                                            <tbody>
                                                {openReturns.map((r) => (
                                                    <tr key={r.filename}>
                                                        <td style={{ ...td, fontWeight: 700 }}>{r.form} · {r.period}</td>
                                                        <td style={td}>{r.filed_date ? fmtDate(r.filed_date) : "—"}</td>
                                                        <td style={num}>{money(r.amount)}</td>
                                                        <td style={num}>{r.books == null ? "—" : money(r.books)}</td>
                                                        <td style={{ ...num, color: r.difference && Math.abs(r.difference) >= 0.01 ? "#b91c1c" : undefined }}>{r.difference == null ? "—" : money(r.difference)}</td>
                                                        <td style={{ ...num, fontWeight: 700 }}>{money(r.balance)}</td>
                                                        <td style={td}>
                                                            {r.status === "paid" ? pill("green", "Paid") : r.status === "partial" ? pill("amber", "Partly paid") : pill("amber", "Unpaid")}{" "}
                                                            {reconPill(r.reconciled)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {/* the transactions behind the tile */}
                    {d.rows.length > 0 && (
                        <section style={card}>
                            <b style={{ display: "block", marginBottom: 8 }}>{info.rowsTitle}</b>
                            <div className="table-scroll" style={{ maxHeight: 320 }}>
                                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                    <thead><tr>
                                        <th style={th}>Date</th><th style={th}>{info.party}</th><th style={th}>Invoice / Document</th>
                                        {isOpen && <th style={{ ...th, textAlign: "right" }}>Days</th>}
                                        <th style={{ ...th, textAlign: "right" }}>Amount</th><th style={th}>Status</th>
                                    </tr></thead>
                                    <tbody>
                                        {d.rows.map((r) => (
                                            <tr key={r.invoice_no}>
                                                <td style={td}>{fmtDate(r.date)}</td>
                                                <td style={{ ...td, fontWeight: 600, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }} title={r.party}>{r.party}</td>
                                                <td style={td}><Link to={r.link} onClick={onClose} className="mono">{r.document_no || r.invoice_no}</Link></td>
                                                {isOpen && <td style={{ ...num, color: r.days > 90 ? "#b91c1c" : r.days > 30 ? "#b45309" : undefined, fontWeight: 700 }}>{r.days ?? "—"}</td>}
                                                <td style={{ ...num, fontWeight: 700 }}>{money(r.amount)}</td>
                                                <td style={td}>{/UNPAID/i.test(r.status) ? pill("amber", r.status) : /PAID/i.test(r.status) ? pill("green", r.status) : pill("gray", r.status || "—")}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                    {isOpen && !d.rows.length && <p style={{ color: "#15803d", fontWeight: 700 }}>✓ Nothing open – everything is {tile.kind === "ar" ? "collected" : "paid"}.</p>}

                    {/* PREVIOUS: already filed & paid – folded */}
                    {isTax && previous.length > 0 && (
                        <section style={{ ...card, marginBottom: 0 }}>
                            <button type="button" onClick={() => setShowPrev((x) => !x)}
                                style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", border: 0, background: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}>
                                <b>Previous periods · {previous.length} {quarterly ? "quarter" : "month"}{previous.length === 1 ? "" : "s"} filed & paid</b>
                                <span className="muted small">{showPrev ? "Hide ▲" : "Show ▼"}</span>
                            </button>
                            {showPrev && <div style={{ marginTop: 10 }}><MonthTable list={previous} /></div>}
                        </section>
                    )}
                </>
            )}
        </Modal>
    );
}