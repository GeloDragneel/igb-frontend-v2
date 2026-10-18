import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, apiFetch } from "../context/AuthContext";
import { usePeriod } from "../context/PeriodContext";
import Icon from "../components/Icons";
import { fmtDate, money } from "../utils/format";

/* =========================================================
   BIR filing calendar (Philippines)
   Weekend due dates move to Monday; holidays and BIR extensions are not applied.
========================================================= */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();            // m = 0-based
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nextWorkday = (d) => {
    const x = new Date(d);
    if (x.getDay() === 6) x.setDate(x.getDate() + 2);
    if (x.getDay() === 0) x.setDate(x.getDate() + 1);
    return x;
};
const at = (y, m, day) => nextWorkday(new Date(y, m, Math.min(day, lastDay(y, m))));

function birDeadlines(today, { vat, corp }) {
    const out = [];
    const add = (form, title, due, period, tag) => out.push({ form, title, due: nextWorkday(due), period, tag });
    const y0 = today.getFullYear();

    for (let y = y0 - 1; y <= y0 + 1; y++) {
        for (let m = 0; m < 12; m++) {
            const label = `${MONTHS[m]} ${y}`;
            const ny = m === 11 ? y + 1 : y;
            const nm = (m + 1) % 12;
            const quarterEnd = m % 3 === 2;

            // monthly withholding
            add("1601-C", "Withholding Tax on Compensation", m === 11 ? at(ny, 0, 15) : at(ny, nm, 10), label, "Monthly");
            if (!quarterEnd) add("0619-E", "Expanded Withholding Tax remittance", at(ny, nm, 10), label, "Monthly");

            if (quarterEnd) {
                const q = Math.floor(m / 3) + 1;
                const ql = `Q${q} ${y}`;
                add("1601-EQ", "Quarterly Expanded Withholding Tax + QAP", at(ny, nm, 31), ql, "Quarterly");
                if (vat) {
                    add("2550Q", "Quarterly VAT Return + SAWT", at(ny, nm, 25), ql, "Quarterly");
                    add("SLSP", "Summary List of Sales & Purchases", at(ny, nm, 25), ql, "Quarterly");
                } else {
                    add("2551Q", "Quarterly Percentage Tax", at(ny, nm, 25), ql, "Quarterly");
                }
                if (q <= 3) {
                    if (corp) {
                        const d = new Date(y, m + 1, 0); // quarter end
                        d.setDate(d.getDate() + 60);// within 60 days
                        add("1702Q", "Quarterly Income Tax (Corporation)", d, ql, "Quarterly");
                    } else {
                        add("1701Q", "Quarterly Income Tax (Individual)", at(y, [4, 7, 10][q - 1], 15), ql, "Quarterly");
                    }
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
        .filter((x) => x.days >= -5 && x.days <= 120)
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

    const deadlines = useMemo(() => birDeadlines(new Date(), { vat, corp }), [vat, corp]);
    const upcoming = deadlines.filter((d) => d.days >= -5).slice(0, 6);
    const next = deadlines.find((d) => d.days >= 0);

    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const name = (user?.name || user?.fullname || user?.username || "").split(" ")[0] || "there";

    const trend = data?.trend || [];
    const costs = data ? data.buy.purchases + data.buy.expenses : 0;
    const net = data ? data.sales.total - costs : 0;
    const vatPay = data?.vat_payable ?? 0;

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
        { label: "Sales", value: data?.sales.total, sub: data ? `${data.sales.count} invoices` : "", icon: "receipt", g: "hd-g1", spark: trend.map((t) => t.sales), to: "/task/sales" },
        { label: "Purchases & expenses", value: costs, sub: data ? `${data.buy.count} records` : "", icon: "cart", g: "hd-g2", spark: trend.map((t) => t.costs), to: "/task/purchases" },
        { label: net >= 0 ? "Net (sales − costs)" : "Net loss", value: net, sub: data && data.sales.total ? `${Math.round((net / data.sales.total) * 100)}% of sales` : "", icon: "barChart", g: net >= 0 ? "hd-g3" : "hd-g5", spark: trend.map((t) => t.sales - t.costs), to: "/financial/trial-balance" },
        { label: vatPay >= 0 ? "VAT payable" : "Excess input VAT", value: Math.abs(vatPay), sub: "Output − Input VAT", icon: "fileText", g: "hd-g4", spark: null, to: "/bir/vat-summary" },
    ];

    const topMax = Math.max(1, ...(data?.top_customers || []).map((c) => c.total));

    return (
        <div className="hd">
            {/* ---------- hero ---------- */}
            <section className="hd-hero">
                <div className="hd-hero-text">
                    <span className="hd-eyebrow">{fmtDate(from)} – {fmtDate(to)}</span>
                    <h1>{greet}, {name} <span aria-hidden="true">👋</span></h1>
                    <p>{data ? <>You made <b>{money(data.sales.total)}</b> in sales and spent <b>{money(costs)}</b> this period.</> : "Loading your numbers…"}</p>
                    <div className="hd-hero-actions">
                        <Link to="/task/sales/new" className="hd-btn hd-btn-light"><Icon name="plus" size={16} /> New invoice</Link>
                        <Link to="/task/expenses/new" className="hd-btn hd-btn-ghost">New expense</Link>
                        <Link to="/task/general-journal" className="hd-btn hd-btn-ghost">Journal entry</Link>
                    </div>
                </div>
                {next && (
                    <div className={`hd-count hd-${urgency(next.days)}`}>
                        <span className="hd-count-label">Next BIR deadline</span>
                        <span className="hd-count-num">{next.days}<small>{next.days === 1 ? "day" : "days"}</small></span>
                        <span className="hd-count-form">{next.form} · {next.period}</span>
                        <span className="hd-count-date">{fmtDate(ymd(next.due))}</span>
                    </div>
                )}
            </section>

            {error && <div className="alert-error" role="alert">{error}</div>}

            {/* ---------- KPI tiles ---------- */}
            <section className="hd-tiles">
                {tiles.map((t) => (
                    <Link key={t.label} to={t.to} className={`hd-tile ${t.g}`}>
                        <div className="hd-tile-top">
                            <span className="hd-tile-icon"><Icon name={t.icon} size={18} /></span>
                            <span className="hd-tile-label">{t.label}</span>
                        </div>
                        <div className="hd-tile-value">{data ? money(t.value) : <span className="hd-sk" />}</div>
                        <div className="hd-tile-bottom">
                            <span>{t.sub}</span>
                            {t.spark && t.spark.length > 1 && <Sparkline values={t.spark} />}
                        </div>
                    </Link>
                ))}
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
                    <header className="hd-card-head"><h3>VAT this period</h3></header>
                    {data ? (
                        <>
                            <div className="hd-ring">
                                <Ring a={data.sales.vat} b={data.buy.vat} />
                                <div className="hd-ring-center">
                                    <span>{vatPay >= 0 ? "Payable" : "Excess"}</span>
                                    <b>{short(Math.abs(vatPay))}</b>
                                </div>
                            </div>
                            <ul className="hd-vat-list">
                                <li><i className="hd-dot-a" />Output VAT<b>{money(data.sales.vat)}</b></li>
                                <li><i className="hd-dot-b" />Input VAT<b>{money(data.buy.vat)}</b></li>
                            </ul>
                            <Link to="/bir/vat-summary" className="hd-link">Open VAT Summary →</Link>
                        </>
                    ) : <div className="hd-sk hd-sk-chart" />}
                </div>
            </section>

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