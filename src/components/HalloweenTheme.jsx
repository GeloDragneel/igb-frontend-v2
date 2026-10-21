// Halloween pictures for the header and sidebar – used by SeasonTheme.jsx
import "./HalloweenTheme.css";

/* ---------- little pictures ---------- */
const Bat = ({ w = 34 }) => (
    <svg width={w} height={w * 0.5} viewBox="0 0 64 32" aria-hidden="true">
        <path fill="currentColor" d="M32 10c1.6-3 3-4 3-4l1 4c3-1 6 0 8 2 2-5 8-8 14-7-3 2-4 6-3 9-3-2-7-1-9 2-2-2-5-2-7 0-2 2-4 6-7 8-3-2-5-6-7-8-2-2-5-2-7 0-2-3-6-4-9-2 1-3 0-7-3-9 6-1 12 2 14 7 2-2 5-3 8-2l1-4s1.4 1 3 4z" />
    </svg>
);
export const Pumpkin = ({ w = 34, face = true }) => (
    <svg width={w} height={w} viewBox="0 0 64 64" aria-hidden="true" className="hw-pumpkin">
        <path d="M30 14c0-5 2-9 6-11l3 3c-3 2-4 5-4 8z" fill="#3f6212" />
        <path d="M37 7c4-2 9-1 12 2-4 0-7 1-9 3z" fill="#65a30d" />
        <ellipse cx="20" cy="38" rx="14" ry="20" fill="#ea580c" />
        <ellipse cx="44" cy="38" rx="14" ry="20" fill="#ea580c" />
        <ellipse cx="32" cy="38" rx="15" ry="22" fill="#f97316" />
        <path d="M32 16v44M20 19c-3 7-3 31 0 38M44 19c3 7 3 31 0 38" stroke="#c2410c" strokeWidth="1.6" fill="none" opacity=".6" />
        {face && (
            <g fill="#fde047" className="hw-glow">
                <path d="M19 32l7-6 3 8zM45 32l-7-6-3 8z" />
                <path d="M30 38l2-4 2 4z" />
                <path d="M16 44c6 6 26 6 32 0-2 7-8 10-16 10s-14-3-16-10zm8 3v4h4v-3zm12 0v3h4v-4z" />
            </g>
        )}
    </svg>
);
const Web = ({ w = 90, className = "" }) => (
    <svg width={w} height={w} viewBox="0 0 100 100" aria-hidden="true" className={`hw-web ${className}`}>
        <g fill="none" stroke="currentColor" strokeWidth=".8">
            <path d="M100 0L0 100M100 0L30 100M100 0L0 30M100 0L65 100M100 0L0 65" />
            <path d="M82 0c2 8 10 16 18 18M64 0c1 14 22 34 36 36M44 0c2 22 34 54 56 56M24 0c3 32 44 74 76 76M6 0c4 40 54 92 94 94" />
        </g>
    </svg>
);
/* round spider web (the classic orb), hung on a thread */
const OrbWeb = ({ w = 120, className = "" }) => {
    const rings = [0.18, 0.34, 0.5, 0.66, 0.82, 0.98];
    const spokes = Array.from({ length: 12 }, (_, i) => (i * Math.PI * 2) / 12);
    const pt = (r, a) => `${(50 + Math.cos(a) * 50 * r).toFixed(1)},${(50 + Math.sin(a) * 50 * r).toFixed(1)}`;
    return (
        <svg width={w} height={w} viewBox="0 0 100 100" aria-hidden="true" className={`hw-orb ${className}`}>
            <g fill="none" stroke="currentColor" strokeWidth=".7" strokeLinejoin="round">
                {spokes.map((a) => <path key={a} d={`M50 50L${pt(1, a)}`} />)}
                {rings.map((r) => (
                    // each ring sags a little between spokes, like a real web
                    <path key={r} d={spokes.map((a, i) => {
                        const next = spokes[(i + 1) % spokes.length];
                        const mid = (a + (i === spokes.length - 1 ? next + Math.PI * 2 : next)) / 2;
                        return `${i ? "" : `M${pt(r, a)}`}Q${pt(r * 0.9, mid)} ${pt(r, next)}`;
                    }).join("")} />
                ))}
            </g>
        </svg>
    );
};
const Spider = ({ className = "" }) => (
    <span className={`hw-spider ${className}`} aria-hidden="true">
        <i className="hw-thread" />
        <svg width="22" height="22" viewBox="0 0 32 32">
            <g stroke="#111" strokeWidth="1.6" fill="none" strokeLinecap="round">
                <path d="M12 14L4 9M12 17L3 17M12 20L4 26M20 14l8-5M20 17h9M20 20l8 6" />
            </g>
            <ellipse cx="16" cy="17" rx="6" ry="7" fill="#111" />
            <circle cx="16" cy="10" r="4" fill="#111" />
            <circle cx="14.5" cy="9.5" r="1" fill="#f97316" /><circle cx="17.5" cy="9.5" r="1" fill="#f97316" />
        </svg>
    </span>
);
const Graveyard = () => (
    <svg className="hw-yard" viewBox="0 0 260 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <path d="M0 96c40-10 80-14 130-8s90 4 130-6v38H0z" fill="#0a0612" />
        <g fill="#1d1430">
            <path d="M28 98V70a12 12 0 0 1 24 0v28z" />
            <path d="M196 96V64a14 14 0 0 1 28 0v32z" />
            <path d="M116 90V78h-8v-6h8v-8h6v8h8v6h-8v12z" />
        </g>
        <g fill="#2d2147" opacity=".9">
            <rect x="36" y="76" width="8" height="2" /><rect x="205" y="72" width="10" height="2" />
        </g>
        <path d="M150 96c2-14 6-26 2-40m-2 14l-12-8m14 18l12-10m-10-12l-8-10" stroke="#0a0612" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
);

/* ---------- the decorations inside each part ---------- */
export function HalloweenHeader() {
    return (
        <span className="hw-top" aria-hidden="true">
            <Web w={70} className="hw-web-tl" />
            <span className="hw-bats">
                <span className="hw-bat b1"><Bat w={30} /></span>
                <span className="hw-bat b2"><Bat w={22} /></span>
                <span className="hw-bat b3"><Bat w={18} /></span>
            </span>
            <span className="hw-candy" />
        </span>
    );
}
export function HalloweenSidebar() {
    return (
        <span className="hw-side" aria-hidden="true">
            <span className="hw-moon" />
            <span className="hw-bat s1"><Bat w={26} /></span>
            <span className="hw-bat s2"><Bat w={18} /></span>
            <Web w={110} className="hw-web-tr" />
            <Spider />
            {/* more webs down the empty part of the sidebar */}
            <span className="hw-lower">
                <OrbWeb w={130} className="o1" />
                <OrbWeb w={84} className="o2" />
                <Spider className="sp2" />
                <Web w={210} className="hw-web-bl" />
                <Web w={150} className="hw-web-br" />
                <Web w={90} className="hw-web-ml" />
            </span>
            <span className="hw-bottom">
                <Graveyard />
                <span className="hw-pumpkins"><Pumpkin w={40} /><Pumpkin w={28} /></span>
                <span className="hw-fog" />
            </span>
        </span>
    );
}