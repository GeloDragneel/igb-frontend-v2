// Holiday look for the top header (.topbar) and the sidebar (.sidebar). Pages are not touched.
//
//   New Year          Dec 28 – Jan 5
//   Chinese New Year  3 days before – 7 days after the lunar new year (date table below)
//   Valentine's       Feb 10 – Feb 14
//   Holy Week/Easter  Palm Sunday – Easter Monday (worked out every year)
//   Summer            Mar 20 – May 31 (outside Holy Week)
//   Independence Day  Jun 9 – Jun 13 (Philippines, June 12)
//   Rainy Season      Jul 1 – Aug 31
//   Halloween         Oct 19 – Nov 16   (2 weeks before and after Nov 2)
//   Christmas         Dec 1 – Dec 27
//
// The title in the middle of the header is a button: pick Auto (by date), any theme to preview it, or Off.
// The choice is kept in this browser (localStorage "igb-season").
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { HalloweenHeader, HalloweenSidebar, Pumpkin } from "./HalloweenTheme";
import "./SeasonTheme.css";

const KEY = "igb-season";

/* lunar new year (Chinese New Year) dates – add a line for later years */
const CNY = { 2025: "01-29", 2026: "02-17", 2027: "02-06", 2028: "01-26", 2029: "02-13", 2030: "02-03", 2031: "01-23", 2032: "02-11", 2033: "01-31", 2034: "02-19", 2035: "02-08" };
const ZODIAC = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"];
const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const cnyDate = (y) => (CNY[y] ? new Date(`${y}-${CNY[y]}T00:00:00`) : null);
const zodiacOf = (y) => ZODIAC[(((y - 4) % 12) + 12) % 12];
/** Easter Sunday (Gregorian, "anonymous" algorithm) */
function easterDate(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
}
const inRange = (d, a, b) => d >= a && d <= b;

/** which theme the date asks for (null = none) */
export function seasonFor(d = new Date()) {
    const t = dayOnly(d), y = t.getFullYear();
    const m = t.getMonth() + 1, day = t.getDate();
    const md = m * 100 + day;                                   // 1019 = Oct 19
    if (md >= 1019 && md <= 1116) return "halloween";
    if (md >= 1201 && md <= 1227) return "christmas";
    if (md >= 1228 || md <= 105) return "newyear";
    if (md >= 210 && md <= 214) return "valentines";
    const cny = cnyDate(y);
    if (cny && inRange(t, addDays(cny, -3), addDays(cny, 7))) return "cny";
    const easter = easterDate(y);
    if (inRange(t, addDays(easter, -7), addDays(easter, 1))) return "easter";
    if (md >= 609 && md <= 613) return "independence";
    if (md >= 320 && md <= 531) return "summer";
    if (md >= 701 && md <= 831) return "rainy";
    return null;
}
// the Chinese New Year being shown: this year's, or next year's once this year's has passed (for a preview later in the year)
const cnyYear = (d = new Date()) => { const c = cnyDate(d.getFullYear()); return c && dayOnly(d) > addDays(c, 7) ? d.getFullYear() + 1 : d.getFullYear(); };
// the year being welcomed: Jul–Dec → next year (so a preview in October already says the right year), Jan–Jun → this year
const nyYear = (d = new Date()) => (d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear());

/* ---------------- small pictures ---------------- */
const Tree = ({ w = 90 }) => (
    <svg width={w} height={w * 1.25} viewBox="0 0 80 100" aria-hidden="true" className="sn-tree">
        <path d="M40 4l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#fde047" className="sn-star" />
        <path d="M40 18L22 44h9L14 66h11L4 90h72L55 66h11L49 44h9z" fill="#15803d" />
        <path d="M40 18L22 44h9L14 66h11L4 90h36z" fill="#166534" />
        <rect x="35" y="90" width="10" height="9" fill="#78350f" />
        <g className="sn-balls">
            <circle cx="33" cy="40" r="2.6" fill="#ef4444" /><circle cx="47" cy="50" r="2.6" fill="#facc15" />
            <circle cx="27" cy="60" r="2.8" fill="#3b82f6" /><circle cx="52" cy="66" r="2.8" fill="#ef4444" />
            <circle cx="20" cy="82" r="3" fill="#facc15" /><circle cx="40" cy="76" r="3" fill="#f472b6" />
            <circle cx="60" cy="84" r="3" fill="#3b82f6" />
        </g>
        <path d="M25 52c8 4 20 4 28-2M17 74c14 6 34 6 46-2" stroke="#fef3c7" strokeWidth="1.2" fill="none" opacity=".7" />
    </svg>
);
const Gift = ({ w = 30, c = "#ef4444", r = "#fde047" }) => (
    <svg width={w} height={w} viewBox="0 0 32 32" aria-hidden="true">
        <rect x="3" y="12" width="26" height="18" rx="2" fill={c} />
        <rect x="1" y="8" width="30" height="6" rx="2" fill={c} />
        <rect x="14" y="8" width="4" height="22" fill={r} />
        <path d="M16 8c-3-6-10-6-9-1 1 3 6 2 9 1zm0 0c3-6 10-6 9-1-1 3-6 2-9 1z" fill={r} />
    </svg>
);
const CandyCane = ({ w = 22 }) => (
    <svg width={w} height={w * 1.6} viewBox="0 0 20 32" aria-hidden="true">
        <defs><pattern id="sn-cane" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="#ef4444" /></pattern></defs>
        <path d="M6 31V10a5 5 0 0 1 10 0v2" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M6 31V10a5 5 0 0 1 10 0v2" stroke="url(#sn-cane)" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
);
const Heart = ({ w = 20, c = "#f43f5e" }) => (
    <svg width={w} height={w} viewBox="0 0 24 24" aria-hidden="true"><path fill={c} d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.5 1.1 5.4 3 1.9-1.9 3.3-3 5.4-3 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z" /></svg>
);
const Rose = ({ w = 34 }) => (
    <svg width={w} height={w * 2} viewBox="0 0 30 60" aria-hidden="true">
        <path d="M15 22c1 12-2 24 0 36" stroke="#15803d" strokeWidth="2.4" fill="none" />
        <path d="M15 38c-7-6-12-3-12 0 5 1 8 2 12 0zM15 46c7-6 12-3 12 0-5 1-8 2-12 0z" fill="#16a34a" />
        <path d="M6 12c0-6 5-10 9-10s9 4 9 10c0 7-4 11-9 11S6 19 6 12z" fill="#e11d48" />
        <path d="M10 10c2-4 8-4 10 0-2 3-8 3-10 0zM9 14c3 4 9 4 12 0" stroke="#9f1239" strokeWidth="1.4" fill="none" />
    </svg>
);
const Glass = ({ w = 30, flip }) => (
    <svg width={w} height={w * 1.7} viewBox="0 0 30 52" aria-hidden="true" style={flip ? { transform: "scaleX(-1) rotate(-10deg)" } : { transform: "rotate(-10deg)" }}>
        <path d="M6 2h18l-2 18a7 7 0 0 1-14 0z" fill="rgba(253,224,71,.85)" stroke="#fde68a" strokeWidth="1.2" />
        <path d="M6 2h18l-1 7H7z" fill="rgba(255,255,255,.55)" />
        <circle cx="12" cy="13" r="1" fill="#fff" /><circle cx="17" cy="16" r=".8" fill="#fff" />
        <path d="M15 27v19M8 48h14" stroke="#fde68a" strokeWidth="2" strokeLinecap="round" />
    </svg>
);
const Burst = ({ w = 90, c = "#fde047" }) => (
    <svg width={w} height={w} viewBox="0 0 100 100" aria-hidden="true" className="sn-burst">
        <g stroke={c} strokeWidth="2.4" strokeLinecap="round">
            {Array.from({ length: 16 }, (_, i) => {
                const a = (i * Math.PI) / 8;
                return <path key={i} d={`M${50 + Math.cos(a) * 14} ${50 + Math.sin(a) * 14}L${50 + Math.cos(a) * 44} ${50 + Math.sin(a) * 44}`} />;
            })}
        </g>
        {Array.from({ length: 16 }, (_, i) => {
            const a = (i * Math.PI) / 8 + 0.2;
            return <circle key={i} cx={50 + Math.cos(a) * 48} cy={50 + Math.sin(a) * 48} r="2" fill={c} />;
        })}
    </svg>
);

const Lantern = ({ w = 34 }) => (
    <svg width={w} height={w * 1.6} viewBox="0 0 40 64" aria-hidden="true" className="sn-lantern">
        <path d="M20 0v7" stroke="#facc15" strokeWidth="1.6" />
        <rect x="12" y="6" width="16" height="4" rx="1" fill="#facc15" />
        <ellipse cx="20" cy="25" rx="17" ry="15" fill="#dc2626" />
        <path d="M20 10c-6 4-6 26 0 30M20 10c6 4 6 26 0 30M8 14c-3 7-3 15 0 22M32 14c3 7 3 15 0 22" stroke="#991b1b" strokeWidth="1.2" fill="none" />
        <rect x="12" y="39" width="16" height="4" rx="1" fill="#facc15" />
        <path d="M17 43v14M20 43v17M23 43v14" stroke="#facc15" strokeWidth="1.4" />
        <text x="20" y="30" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fde68a">福</text>
    </svg>
);
const Egg = ({ w = 26, c = "#c4b5fd", s = "#fff" }) => (
    <svg width={w} height={w * 1.3} viewBox="0 0 30 40" aria-hidden="true">
        <path d="M15 1C7 1 1 15 1 25c0 8 6 14 14 14s14-6 14-14C29 15 23 1 15 1z" fill={c} />
        <path d="M2 21l4-3 4 3 5-3 5 3 4-3 4 3" stroke={s} strokeWidth="2" fill="none" />
        <path d="M2 29h26" stroke={s} strokeWidth="1.6" strokeDasharray="2 3" />
        <circle cx="10" cy="11" r="1.6" fill={s} /><circle cx="19" cy="9" r="1.6" fill={s} />
    </svg>
);
const Lily = ({ w = 30 }) => (
    <svg width={w} height={w * 2} viewBox="0 0 30 60" aria-hidden="true">
        <path d="M15 22c0 14 1 24 0 36" stroke="#16a34a" strokeWidth="2.2" fill="none" />
        <path d="M15 40c-8-7-12-3-12 0 5 1 8 2 12 0z" fill="#22c55e" />
        <path d="M15 4c-3 6-11 9-13 16 6 0 10-2 13-6 3 4 7 6 13 6-2-7-10-10-13-16z" fill="#fefce8" stroke="#e5e7eb" strokeWidth=".8" />
        <path d="M15 14v8" stroke="#facc15" strokeWidth="1.6" />
    </svg>
);
const Sun = ({ w = 60, rays = 12, c = "#fbbf24", core = "#fde047", className = "" }) => (
    <svg width={w} height={w} viewBox="0 0 100 100" aria-hidden="true" className={`sn-sun ${className}`}>
        <g fill={c}>
            {Array.from({ length: rays }, (_, i) => (
                <path key={i} transform={`rotate(${(360 / rays) * i} 50 50)`} d="M46 4h8l-4 22z" />
            ))}
        </g>
        <circle cx="50" cy="50" r="22" fill={core} />
    </svg>
);
const Star5 = ({ w = 14, c = "#facc15" }) => (
    <svg width={w} height={w} viewBox="0 0 24 24" aria-hidden="true"><path fill={c} d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" /></svg>
);
const Palm = ({ w = 90 }) => (
    <svg width={w} height={w * 1.3} viewBox="0 0 80 104" aria-hidden="true" className="sn-palm">
        <path d="M44 34c-2 22 0 46 6 68h-8c-6-22-8-46-4-68z" fill="#92400e" />
        <path d="M42 34C30 22 14 22 4 30c12-2 24 0 38 6zM42 34c4-16 18-26 34-24-12 4-22 12-34 24zM42 34c-14-6-26-20-26-32 6 12 16 20 26 32zM42 34c14-4 28 0 36 10-12-4-24-6-36-10zM42 34c0-14 6-26 16-32-6 10-10 20-16 32z" fill="#16a34a" />
        <circle cx="44" cy="36" r="3" fill="#78350f" /><circle cx="48" cy="38" r="3" fill="#78350f" />
    </svg>
);
const Umbrella = ({ w = 60 }) => (
    <svg width={w} height={w} viewBox="0 0 64 64" aria-hidden="true" className="sn-umbrella">
        <path d="M4 30C6 14 18 4 32 4s26 10 28 26c-4-4-8-4-12 0-4-4-8-4-12 0-4-4-8-4-12 0-4-4-8-4-12 0-4-4-8-4-12 0z" fill="#f59e0b" />
        <path d="M32 4c-6 6-8 16-8 26M32 4c6 6 8 16 8 26" stroke="#b45309" strokeWidth="1.2" fill="none" />
        <path d="M32 30v24a5 5 0 0 1-10 0" stroke="#1e293b" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
);
const Cloud = ({ w = 90, c = "#94a3b8" }) => (
    <svg width={w} height={w * 0.55} viewBox="0 0 100 55" aria-hidden="true" className="sn-cloud">
        <path fill={c} d="M22 52C10 52 2 45 2 36s8-15 18-15c3-11 13-19 25-19 13 0 23 9 25 21 2-1 4-1 6-1 11 0 20 8 20 18s-9 12-20 12z" />
    </svg>
);

/* falling (or rising) bits: snow, confetti, hearts, rain, petals, gold. Fixed positions so they don't jump on re-render. */
function Particles({ n = 22, kind = "snow" }) {
    return (
        <span className={`sn-fall is-${kind}`} aria-hidden="true">
            {Array.from({ length: n }, (_, i) => {
                const style = {
                    left: `${(i * 37 + 11) % 100}%`,
                    animationDelay: `${-((i * 1.7) % 12).toFixed(1)}s`,
                    animationDuration: `${9 + ((i * 7) % 8)}s`,
                    "--sn-size": `${kind === "heart" ? 10 + (i % 4) * 3 : 3 + (i % 4)}px`,
                    "--sn-drift": `${(i % 2 ? 1 : -1) * (10 + (i * 3) % 18)}px`,
                };
                if (kind === "confetti") style.background = ["#fde047", "#f472b6", "#60a5fa", "#34d399", "#f97316"][i % 5];
                if (kind === "gold") style.background = ["#fde047", "#f59e0b", "#ef4444", "#facc15"][i % 4];
                if (kind === "petal") style.background = ["#fbcfe8", "#ddd6fe", "#fef9c3", "#bbf7d0", "#fecdd3"][i % 5];
                if (kind === "rain") style.animationDuration = `${(1 + ((i * 7) % 9) / 10).toFixed(1)}s`;
                return <i key={i} style={style}>{kind === "heart" && <Heart w={20} c={i % 3 ? "#fb7185" : "#fda4af"} />}</i>;
            })}
        </span>
    );
}

/* ---------------- each theme: header + sidebar ---------------- */
const THEMES = {
    halloween: {
        label: "Halloween", title: "Happy Halloween",
        icon: <Pumpkin w={26} />,
        header: () => <HalloweenHeader />,
        sidebar: () => <HalloweenSidebar />,
    },
    christmas: {
        label: "Christmas", title: "Merry Christmas",
        icon: <Tree w={20} />,
        header: () => (
            <span className="hw-top" aria-hidden="true">
                <Particles n={26} kind="snow" />
                <Lights />
            </span>
        ),
        sidebar: () => (
            <span className="hw-side" aria-hidden="true">
                <Particles n={30} kind="snow" />
                <span className="sn-bigstar">★</span>
                <span className="hw-bottom sn-ground">
                    <svg className="sn-hills" viewBox="0 0 260 120" preserveAspectRatio="none"><path d="M0 80c50-20 90-18 140-6s90 6 120-6v52H0z" fill="#e0f2fe" /><path d="M0 96c60-14 120-10 170 0s70 2 90-4v28H0z" fill="#f8fafc" /></svg>
                    <span className="sn-tree-wrap"><Tree w={86} /></span>
                    <span className="sn-gifts"><Gift w={30} /><Gift w={24} c="#16a34a" r="#fef08a" /><Gift w={20} c="#2563eb" r="#fca5a5" /></span>
                </span>
            </span>
        ),
    },
    newyear: {
        label: "New Year", title: () => `Happy New Year ${nyYear()}`,
        icon: <Glass w={14} />,
        header: () => (
            <span className="hw-top" aria-hidden="true">
                <span className="sn-bursts"><Burst w={46} /><Burst w={36} c="#f472b6" /><Burst w={40} c="#60a5fa" /></span>
                <Particles n={20} kind="confetti" />
                <span className="sn-gold" />
            </span>
        ),
        sidebar: () => (
            <span className="hw-side" aria-hidden="true">
                <span className="sn-sky-bursts"><Burst w={110} /><Burst w={80} c="#f472b6" /><Burst w={90} c="#60a5fa" /><Burst w={70} c="#34d399" /></span>
                <Particles n={28} kind="confetti" />
                <span className="hw-bottom sn-city">
                    <svg className="sn-skyline" viewBox="0 0 260 120" preserveAspectRatio="none">
                        <path fill="#161c3a" d="M0 120V84h14V64h12v20h10V50h16v34h8V70h14v14h10V40l8-8 8 8v44h12V60h18v24h8V72h12v12h10V54h14v30h12V66h16v54z" />
                        <g fill="#fde68a" opacity=".7">{Array.from({ length: 22 }, (_, i) => <rect key={i} x={6 + ((i * 23) % 245)} y={70 + ((i * 7) % 36)} width="3" height="3" />)}</g>
                    </svg>
                    <span className="sn-year">{nyYear()}</span>
                    <span className="sn-glasses"><Glass w={28} /><Glass w={28} flip /></span>
                </span>
            </span>
        ),
    },
    valentines: {
        label: "Valentine's", title: "Happy Valentine's Day",
        icon: <Heart w={20} />,
        header: () => (
            <span className="hw-top" aria-hidden="true">
                <Particles n={14} kind="heart" />
                <span className="sn-hearts-line" />
            </span>
        ),
        sidebar: () => (
            <span className="hw-side" aria-hidden="true">
                <span className="sn-bigheart"><Heart w={64} c="#fb7185" /></span>
                <Particles n={20} kind="heart" />
                <span className="hw-bottom sn-love">
                    <svg className="sn-hills" viewBox="0 0 260 120" preserveAspectRatio="none"><path d="M0 84c50-18 100-16 150-4s80 4 110-6v46H0z" fill="#4c0519" /><path d="M0 100c60-12 120-8 170 2s70 0 90-6v24H0z" fill="#3b0414" /></svg>
                    <span className="sn-roses"><Rose w={30} /><Rose w={36} /><Rose w={28} /></span>
                    <span className="sn-balloon"><Heart w={46} c="#f43f5e" /><i /></span>
                </span>
            </span>
        ),
    },
    cny: {
        label: "Chinese New Year", title: () => `Gong Xi Fa Cai ${cnyYear()}`,
        icon: <Lantern w={14} />,
        header: () => (
            <span className="hw-top" aria-hidden="true">
                <span className="sn-lanterns"><Lantern w={20} /><Lantern w={16} /><Lantern w={20} /><Lantern w={16} /><Lantern w={20} /></span>
                <Particles n={16} kind="gold" />
                <span className="sn-redgold" />
            </span>
        ),
        sidebar: () => (
            <span className="hw-side" aria-hidden="true">
                <span className="sn-biglantern"><Lantern w={58} /></span>
                <Particles n={22} kind="gold" />
                <span className="hw-bottom sn-cny">
                    <svg className="sn-hills" viewBox="0 0 260 120" preserveAspectRatio="none"><path d="M0 86c50-16 100-16 150-4s80 4 110-6v44H0z" fill="#450a0a" /><path d="M0 102c60-10 120-8 170 2s70 0 90-6v22H0z" fill="#2d0606" /></svg>
                    <span className="sn-zodiac"><b>{cnyYear()}</b><small>Year of the {zodiacOf(cnyYear())}</small></span>
                    <span className="sn-fu">福</span>
                </span>
            </span>
        ),
    },
    easter: {
        label: "Holy Week & Easter", title: "Happy Easter",
        icon: <Egg w={14} />,
        header: () => (
            <span className="hw-top" aria-hidden="true">
                <span className="sn-eggs-line">
                    {["#c4b5fd", "#f9a8d4", "#86efac", "#fde68a", "#93c5fd", "#c4b5fd", "#f9a8d4"].map((c, i) => <Egg key={i} w={13} c={c} />)}
                </span>
                <Particles n={14} kind="petal" />
            </span>
        ),
        sidebar: () => (
            <span className="hw-side" aria-hidden="true">
                <span className="sn-dawn" />
                <Particles n={18} kind="petal" />
                <span className="hw-bottom sn-easter">
                    <svg className="sn-hills" viewBox="0 0 260 120" preserveAspectRatio="none"><path d="M0 84c50-18 100-16 150-4s80 4 110-6v46H0z" fill="#166534" /><path d="M0 100c60-12 120-8 170 2s70 0 90-6v24H0z" fill="#14532d" /></svg>
                    <span className="sn-lilies"><Lily w={28} /><Lily w={34} /><Lily w={26} /></span>
                    <span className="sn-egg-basket"><Egg w={26} c="#f9a8d4" /><Egg w={30} c="#c4b5fd" /><Egg w={24} c="#fde68a" /></span>
                </span>
            </span>
        ),
    },
    summer: {
        label: "Summer", title: "Summer Vibes",
        icon: <Sun w={18} />,
        header: () => (
            <span className="hw-top" aria-hidden="true">
                <span className="sn-head-sun"><Sun w={40} /></span>
                <span className="sn-wave-line" />
            </span>
        ),
        sidebar: () => (
            <span className="hw-side" aria-hidden="true">
                <span className="sn-bigsun"><Sun w={86} /></span>
                <span className="sn-birds"><i /><i /><i /></span>
                <span className="hw-bottom sn-beach">
                    <span className="sn-waves"><i /><i /></span>
                    <svg className="sn-hills" viewBox="0 0 260 120" preserveAspectRatio="none"><path d="M0 104c60-10 130-12 180-4s60 4 80 0v20H0z" fill="#fcd34d" /></svg>
                    <span className="sn-palm-wrap"><Palm w={84} /></span>
                </span>
            </span>
        ),
    },
    independence: {
        label: "Independence Day", title: "Happy Independence Day",
        icon: <Sun w={18} rays={8} c="#facc15" core="#facc15" />,
        header: () => (
            <span className="hw-top" aria-hidden="true">
                <span className="sn-head-sun"><Sun w={34} rays={8} c="#facc15" core="#facc15" /></span>
                <Particles n={16} kind="confetti" />
                <span className="sn-flag-line" />
            </span>
        ),
        sidebar: () => (
            <span className="hw-side" aria-hidden="true">
                <span className="sn-flag-tri">
                    <span className="sn-ph-sun"><Sun w={70} rays={8} c="#facc15" core="#facc15" /></span>
                    <span className="sn-ph-star s1"><Star5 w={16} /></span>
                    <span className="sn-ph-star s2"><Star5 w={16} /></span>
                    <span className="sn-ph-star s3"><Star5 w={16} /></span>
                </span>
                <span className="hw-bottom sn-ph">
                    <span className="sn-flag-wave"><i className="b" /><i className="r" /></span>
                    <span className="sn-mabuhay">Mabuhay! <small>June 12</small></span>
                </span>
            </span>
        ),
    },
    rainy: {
        label: "Rainy Season", title: "Stay Dry",
        icon: <Umbrella w={18} />,
        header: () => (
            <span className="hw-top" aria-hidden="true">
                <span className="sn-head-clouds"><Cloud w={60} c="#cbd5e1" /><Cloud w={44} c="#e2e8f0" /></span>
                <Particles n={30} kind="rain" />
            </span>
        ),
        sidebar: () => (
            <span className="hw-side" aria-hidden="true">
                <span className="sn-side-clouds"><Cloud w={120} c="#475569" /><Cloud w={90} c="#334155" /></span>
                <Particles n={40} kind="rain" />
                <span className="hw-bottom sn-rain">
                    <svg className="sn-hills" viewBox="0 0 260 120" preserveAspectRatio="none"><path d="M0 100c60-8 130-10 180-4s60 4 80 0v24H0z" fill="#1e293b" /><ellipse cx="90" cy="108" rx="60" ry="6" fill="#38bdf8" opacity=".35" /></svg>
                    <span className="sn-umbrella-wrap"><Umbrella w={70} /></span>
                </span>
            </span>
        ),
    },
};
const titleOf = (k) => (typeof THEMES[k]?.title === "function" ? THEMES[k].title() : THEMES[k]?.title);

/* header: a row of blinking Christmas lights */
const LIGHT = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#f472b6"];
function Lights() {
    return (
        <span className="sn-lights">
            <svg width="100%" height="22" preserveAspectRatio="none" viewBox="0 0 100 22"><path d="M0 4 Q2.5 12 5 4 T10 4 T15 4 T20 4 T25 4 T30 4 T35 4 T40 4 T45 4 T50 4 T55 4 T60 4 T65 4 T70 4 T75 4 T80 4 T85 4 T90 4 T95 4 T100 4" stroke="#14532d" strokeWidth=".6" fill="none" vectorEffect="non-scaling-stroke" /></svg>
            {Array.from({ length: 20 }, (_, i) => (
                <i key={i} style={{ left: `${i * 5 + 2.5}%`, background: LIGHT[i % 5], color: LIGHT[i % 5], animationDelay: `${(i % 4) * 0.4}s` }} />
            ))}
        </span>
    );
}

/* ---------------- runtime ---------------- */
/** the header and sidebar are rendered by other components: find them and put the pictures inside */
function useHost(selector) {
    const [el, setEl] = useState(null);
    useEffect(() => {
        let cur = null;
        const find = () => {
            const n = document.querySelector(selector);
            if (n === cur) return;
            cur = n;
            if (n && getComputedStyle(n).position === "static") n.style.position = "relative";
            setEl(n);
        };
        // a light check every second instead of watching every DOM change on the page
        // (a page-wide MutationObserver ran on every row a big page like Billing rendered)
        find();
        const t = setInterval(find, 1000);
        return () => clearInterval(t);
    }, [selector]);
    return el;
}

const readChoice = () => {
    try {
        const v = localStorage.getItem(KEY);
        return v && (v === "auto" || v === "off" || THEMES[v]) ? v : "auto";
    } catch { return "auto"; }
};

/* ---------------- full-height grid pages: NO theme there at all ----------------
   Billing, Reconciliation, Audit, Efficiency, Scan, Collection, Retainers Fee, VAT Summary, Reports…
   ("the page never scrolls, only the grid does"). With the theme on, those pages hung – even with the theme standing
   still – and they were fine as soon as the theme was not there. So on those pages the theme removes itself
   completely (nothing added, nothing changed – exactly like having no <SeasonTheme /> in Layout) and comes back on
   every other page. Nothing in the pages' CSS is touched. */
let lockSels = [], sheetsSeen = -1;
function lockSelectors() {                                          // read-only: html:has(X) { overflow: hidden } rules
    if (sheetsSeen === document.styleSheets.length) return lockSels;
    sheetsSeen = document.styleSheets.length;
    const out = new Set();
    const walk = (rules) => [...rules].forEach((r) => {
        if (r.cssRules && !r.selectorText) { walk(r.cssRules); return; }
        if (!r.selectorText || !r.style || !/hidden|clip/.test(`${r.style.overflow} ${r.style.overflowY}`)) return;
        r.selectorText.split(",").map((x) => x.trim()).forEach((x) => {
            const m = /^(?:html|body)\s*:has\((.+)\)\s*$/.exec(x);
            if (m) out.add(m[1]);
        });
    });
    [...document.styleSheets].forEach((sh) => { try { walk(sh.cssRules); } catch { /* other-origin sheet */ } });
    return (lockSels = [...out]);
}
function visibleBigGrid() {
    const page = document.querySelector(".ka-page:not([data-hidden])") || document.querySelector("main.content, .content");
    if (!page) return false;
    // only pages whose CSS still has the "html:has(...) { overflow: hidden }" rule – a page whose CSS no longer has it
    // (Billing, Collection, Reconciliation, Audit… once updated) gets the theme like every other page
    return lockSelectors().some((sel) => { try { return !!page.querySelector(sel); } catch { return false; } });
}

export default function SeasonTheme() {
    const { pathname } = useLocation();
    const [grid, setGrid] = useState(false);
    useEffect(() => {
        const check = () => setGrid(visibleBigGrid());
        check();
        const t1 = setTimeout(check, 0), t2 = setTimeout(check, 250);
        const t = setInterval(check, 700);
        return () => { clearTimeout(t1); clearTimeout(t2); clearInterval(t); };
    }, [pathname]);
    return grid ? null : <SeasonThemeOn />;
}

function SeasonThemeOn() {
    const [choice, setChoice] = useState(readChoice);
    const [today, setToday] = useState(() => seasonFor());
    useEffect(() => {                                                 // date may change while the app stays open
        const t = setInterval(() => setToday(seasonFor()), 60 * 60 * 1000);
        return () => clearInterval(t);
    }, []);
    const active = choice === "auto" ? today : choice === "off" ? null : choice;

    useEffect(() => {
        try { localStorage.setItem(KEY, choice); } catch { /* ignore */ }
    }, [choice]);
    const top = useHost(".topbar");
    const side = useHost(".sidebar");

    // The theme classes go on the header and the sidebar themselves – NOT on <html>.
    // Pages like Billing use "html:has(.bd) { overflow: hidden }": every hover / change inside the page makes the browser
    // re-check <html>, and with theme rules hanging off <html> it had to restyle the whole app each time → Billing hung.
    const classes = useMemo(() => (active ? ["sx-season", `sx-${active}`] : []), [active]);
    useEffect(() => {
        const els = [top, side].filter(Boolean);
        // add only the classes that are MISSING: classList.add() of a class that is already there still counts as a
        // class change for the browser – every second on the header + sidebar, and on pages with html:has(...) rules
        // each one made the browser restyle the whole app (that was the hang)
        const put = () => els.forEach((el) => classes.forEach((c) => { if (!el.classList.contains(c)) el.classList.add(c); }));
        put();
        const t = setInterval(put, 1000);        // the sidebar re-sets its className when opened / collapsed
        return () => { clearInterval(t); els.forEach((el) => classes.length && el.classList.remove(...classes)); };
    }, [top, side, classes]);
    const t = active ? THEMES[active] : null;

    return (
        <>
            {top && createPortal(
                <>
                    {t && <t.header key={active} />}
                    <Switcher active={active} choice={choice} today={today} onPick={setChoice} />
                </>, top)}
            {side && t && createPortal(<SidePin side={side}><t.sidebar key={active} /></SidePin>, side)}
            <SettingsDock choice={choice} today={today} onPick={setChoice} classes={classes} />
        </>
    );
}

/* the title in the middle of the header = the theme switch */
function Switcher({ active, choice, today, onPick }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const btn = useRef(null);
    const pop = useRef(null);

    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const r = btn.current?.getBoundingClientRect();
            if (r) setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(window.innerWidth - 268, r.left + r.width / 2 - 130)) });
        };
        place();
        const off = (e) => !pop.current?.contains(e.target) && !btn.current?.contains(e.target) && setOpen(false);
        const esc = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", off);
        document.addEventListener("keydown", esc);
        window.addEventListener("resize", place);
        return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); window.removeEventListener("resize", place); };
    }, [open]);

    const pick = (v) => { onPick(v); setOpen(false); };
    const t = active ? THEMES[active] : null;

    return (
        <>
            <button ref={btn} type="button" className={`sn-switch${t ? "" : " is-plain"}`} onClick={() => setOpen(!open)}
                aria-haspopup="menu" aria-expanded={open} title="Change the holiday theme">
                {t ? (
                    <>
                        <span className="sn-ico">{t.icon}</span>
                        <b className={`sn-title is-${active}`}>{titleOf(active)}</b>
                        <span className="sn-ico">{t.icon}</span>
                    </>
                ) : (
                    <><span className="sn-ico sn-palette">🎨</span><b className="sn-title-plain">Theme</b></>
                )}
                <svg className="sn-caret" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" /></svg>
            </button>
            {open && pos && createPortal(
                <div ref={pop} className="sn-menu" role="menu" style={pos}>
                    <div className="sn-menu-head">Holiday theme</div>
                    <ThemeOptions choice={choice} today={today} onPick={pick} />
                    <p className="sn-menu-note">Only changes this browser.</p>
                </div>, document.body)}
        </>
    );
}
// the menu lists the themes in calendar order
const ORDER = ["newyear", "cny", "valentines", "easter", "summer", "independence", "rainy", "halloween", "christmas"];
/** Auto + every theme + Off (used by the header menu and the settings panel) */
function ThemeOptions({ choice, today, onPick }) {
    const opts = [
        ["auto", "📅", "Auto (by date)", today ? `Today: ${THEMES[today].label}` : "No holiday today"],
        ...ORDER.map((k) => [k, THEMES[k].icon, THEMES[k].label, RANGES[k]]),
        ["off", "⛔", "Off", "Normal look"],
    ];
    return opts.map(([k, icon, label, sub]) => (
        <button key={k} type="button" role="menuitemradio" aria-checked={choice === k} className={`sn-opt is-${k}${choice === k ? " is-on" : ""}`} onClick={() => onPick(k)}>
            <span className="sn-mi">{icon}</span>
            <span><b>{label}</b><small>{sub}</small></span>
        </button>
    ));
}

/* ---------- floating settings button (right edge): open the theme panel any time ---------- */
function SettingsDock({ choice, today, onPick, classes = [] }) {
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
        if (!open) return;
        const off = (e) => !box.current?.contains(e.target) && setOpen(false);
        const esc = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", off);
        document.addEventListener("keydown", esc);
        return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
    }, [open]);
    return createPortal(
        <div ref={box} className={`sn-dock${open ? " is-open" : ""} ${classes.join(" ")}`}>
            <button type="button" className="sn-dock-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Theme settings" title="Theme settings">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                </svg>
            </button>
            {open && (
                <div className="sn-panel" role="dialog" aria-label="Theme settings">
                    <header>
                        <b>Theme settings</b>
                        <button type="button" onClick={() => setOpen(false)} aria-label="Close">✕</button>
                    </header>
                    <div className="sn-menu-head">Holiday theme</div>
                    <div role="menu" className="sn-panel-list">
                        <ThemeOptions choice={choice} today={today} onPick={onPick} />
                    </div>
                    <p className="sn-menu-note">Only changes this browser. Auto follows the calendar.</p>
                </div>
            )}
        </div>,
        document.body
    );
}

const fmtDay = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const RANGES = (() => {
    const y = new Date().getFullYear(), cy = cnyYear(), c = cnyDate(cy), e = easterDate(y >= 0 && dayOnly(new Date()) > addDays(easterDate(y), 1) ? y + 1 : y);
    return {
        halloween: "Oct 19 – Nov 16", christmas: "Dec 1 – 27", newyear: "Dec 28 – Jan 5", valentines: "Feb 10 – 14",
        cny: c ? `${fmtDay(addDays(c, -3))} – ${fmtDay(addDays(c, 7))}, ${cy}` : "Lunar New Year",
        easter: `${fmtDay(addDays(e, -7))} – ${fmtDay(addDays(e, 1))}, ${e.getFullYear()}`,
        summer: "Mar 20 – May 31", independence: "Jun 9 – 13", rainy: "Jul 1 – Aug 31",
    };
})();

/* Sidebar pictures pinned to what you SEE of the sidebar: the sidebar scrolls (long menus), and pictures placed
   "at the bottom" used to scroll up with the menu. A sticky 0-height pin at the end of the sidebar stays at the
   bottom of the visible sidebar; the pictures hang from it, as tall and wide as the visible sidebar. */
function SidePin({ side, children }) {
    const pin = useRef(null);
    useLayoutEffect(() => {
        const fit = () => {
            const p = pin.current;
            if (!p || !side) return;
            const sr = side.getBoundingClientRect(), pr = p.getBoundingClientRect();
            const cs = getComputedStyle(side);
            const bl = parseFloat(cs.borderLeftWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
            const next = {
                "--sx-h": `${side.clientHeight}px`,
                "--sx-w": `${side.clientWidth}px`,
                "--sx-l": `${Math.round(pr.left - sr.left - bl)}px`,
                "--sx-b": `${Math.round(sr.bottom - bb - pr.bottom)}px`,      // gap under the pin (sidebar padding)
            };
            // write only what changed – a style change every few seconds made pages with html:has(...) rules re-check everything
            Object.entries(next).forEach(([k, v]) => { if (p.style.getPropertyValue(k) !== v) p.style.setProperty(k, v); });
        };
        fit();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
        ro?.observe(side);
        window.addEventListener("resize", fit);
        const t = setInterval(fit, 1500);
        return () => { ro?.disconnect(); window.removeEventListener("resize", fit); clearInterval(t); };
    }, [side]);
    return <span ref={pin} className="sx-pin" aria-hidden="true">{children}</span>;
}