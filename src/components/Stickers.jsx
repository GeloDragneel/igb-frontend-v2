// IGB Messenger stickers – an original set (not Facebook's): drawn in code, no image files.
//   pip:*  "Pip", a round little mascot with expressions
//   txt:*  office word stickers
//   emo:*  big animated emoji
// A sticker message stores only its key (e.g. "pip:happy"); this file draws it.
import { useEffect, useRef, useState } from "react";

/* ---------------- Pip ---------------- */

const PIP = {
    hi: { name: "Hi!", color: "#FFC93C", eyes: "dot", mouth: "smile", extra: "wave", anim: "wave" },
    happy: { name: "Happy", color: "#FFC93C", eyes: "happy", mouth: "open", anim: "bounce" },
    love: { name: "Love", color: "#FF8FB1", eyes: "heart", mouth: "smile", extra: "hearts", anim: "pulse" },
    laugh: { name: "Haha", color: "#FFC93C", eyes: "laugh", mouth: "laugh", extra: "tears", anim: "shake" },
    wow: { name: "Wow", color: "#8EC5FF", eyes: "big", mouth: "o", extra: "sparkle", anim: "pop" },
    sad: { name: "Sad", color: "#9DB7F5", eyes: "sad", mouth: "frown", extra: "tear", anim: "droop" },
    angry: { name: "Grr", color: "#FF7B6B", eyes: "angry", mouth: "frown", extra: "steam", anim: "shake" },
    thumbs: { name: "Nice", color: "#7ED6A5", eyes: "happy", mouth: "smile", extra: "thumb", anim: "bounce" },
    coffee: { name: "Coffee", color: "#C9A27E", eyes: "happy", mouth: "smile", extra: "coffee", anim: "sway" },
    sleepy: { name: "Sleepy", color: "#B9A6F2", eyes: "sleep", mouth: "o", extra: "zzz", anim: "breathe" },
    party: { name: "Party", color: "#FFC93C", eyes: "happy", mouth: "open", extra: "party", anim: "bounce" },
    think: { name: "Hmm", color: "#8EC5FF", eyes: "side", mouth: "flat", extra: "question", anim: "sway" },
    thanks: { name: "Thanks", color: "#FF8FB1", eyes: "happy", mouth: "smile", extra: "holdheart", anim: "pulse" },
    done: { name: "Done", color: "#7ED6A5", eyes: "happy", mouth: "open", extra: "check", anim: "pop" },
    stress: { name: "Stress", color: "#FFB067", eyes: "spiral", mouth: "wave", extra: "sweat", anim: "shake" },
    wink: { name: "Wink", color: "#FFC93C", eyes: "wink", mouth: "tongue", anim: "bounce" },
};

const INK = "#3b2f2f";

function Eyes({ kind }) {
    const L = 46, R = 74, Y = 58;
    const arcUp = (x) => `M${x - 7} ${Y + 2} Q${x} ${Y - 7} ${x + 7} ${Y + 2}`;
    switch (kind) {
        case "happy": return <g fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round"><path d={arcUp(L)} /><path d={arcUp(R)} /></g>;
        case "laugh": return <g fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d={`M${L - 7} ${Y - 5} L${L + 5} ${Y} L${L - 7} ${Y + 5}`} /><path d={`M${R + 7} ${Y - 5} L${R - 5} ${Y} L${R + 7} ${Y + 5}`} /></g>;
        case "heart": return <g fill="#E8335C">{[L, R].map((x) => <path key={x} d={`M${x} ${Y + 7} C${x - 12} ${Y - 1} ${x - 7} ${Y - 10} ${x} ${Y - 4} C${x + 7} ${Y - 10} ${x + 12} ${Y - 1} ${x} ${Y + 7}Z`} />)}</g>;
        case "big": return <g>{[L, R].map((x) => <g key={x}><ellipse cx={x} cy={Y} rx="8" ry="9.5" fill="#fff" stroke={INK} strokeWidth="2.5" /><circle cx={x} cy={Y + 1} r="4.5" fill={INK} /></g>)}</g>;
        case "sad": return <g><g fill={INK}><ellipse cx={L} cy={Y + 2} rx="4.5" ry="5.5" /><ellipse cx={R} cy={Y + 2} rx="4.5" ry="5.5" /></g><g stroke={INK} strokeWidth="3.5" strokeLinecap="round"><path d={`M${L - 8} ${Y - 9} L${L + 4} ${Y - 12}`} /><path d={`M${R + 8} ${Y - 9} L${R - 4} ${Y - 12}`} /></g></g>;
        case "angry": return <g><g fill={INK}><ellipse cx={L} cy={Y + 2} rx="4.5" ry="5" /><ellipse cx={R} cy={Y + 2} rx="4.5" ry="5" /></g><g stroke={INK} strokeWidth="4" strokeLinecap="round"><path d={`M${L - 8} ${Y - 12} L${L + 6} ${Y - 6}`} /><path d={`M${R + 8} ${Y - 12} L${R - 6} ${Y - 6}`} /></g></g>;
        case "sleep": return <g fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round"><path d={`M${L - 7} ${Y} Q${L} ${Y + 6} ${L + 7} ${Y}`} /><path d={`M${R - 7} ${Y} Q${R} ${Y + 6} ${R + 7} ${Y}`} /></g>;
        case "side": return <g>{[L, R].map((x) => <g key={x}><ellipse cx={x} cy={Y} rx="7" ry="8" fill="#fff" stroke={INK} strokeWidth="2.5" /><circle cx={x + 3} cy={Y - 2} r="3.8" fill={INK} /></g>)}</g>;
        case "wink": return <g><ellipse cx={L} cy={Y} rx="4.5" ry="6" fill={INK} /><path d={arcUp(R)} fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" /></g>;
        case "spiral": return <g fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round">{[L, R].map((x) => <path key={x} d={`M${x} ${Y} m-1 0 a1.5 1.5 0 1 1 3 0 a3.5 3.5 0 1 1 -7 0 a5.5 5.5 0 1 1 11 0 a7 7 0 1 1 -14 0`} />)}</g>;
        default: return <g fill={INK}><ellipse cx={L} cy={Y} rx="4.8" ry="6" /><ellipse cx={R} cy={Y} rx="4.8" ry="6" /><circle cx={L + 1.6} cy={Y - 2} r="1.6" fill="#fff" /><circle cx={R + 1.6} cy={Y - 2} r="1.6" fill="#fff" /></g>;
    }
}

function Mouth({ kind }) {
    switch (kind) {
        case "open": return <path d="M47 72 Q60 92 73 72 Z" fill="#7a2e2e" stroke={INK} strokeWidth="3" strokeLinejoin="round" />;
        case "laugh": return <g><path d="M44 70 Q60 98 76 70 Z" fill="#7a2e2e" stroke={INK} strokeWidth="3" strokeLinejoin="round" /><path d="M52 83 Q60 90 68 83" fill="#ff8a8a" /></g>;
        case "frown": return <path d="M50 81 Q60 72 70 81" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />;
        case "o": return <ellipse cx="60" cy="78" rx="6" ry="7.5" fill="#7a2e2e" stroke={INK} strokeWidth="3" />;
        case "flat": return <path d="M52 78 L68 76" stroke={INK} strokeWidth="4" strokeLinecap="round" />;
        case "wave": return <path d="M48 79 q4 -5 8 0 t8 0 t8 0" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />;
        case "tongue": return <g><path d="M48 73 Q60 86 72 73" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" /><path d="M58 79 q4 9 9 1" fill="#ff7a8a" stroke={INK} strokeWidth="2.2" /></g>;
        default: return <path d="M48 73 Q60 85 72 73" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />;
    }
}

function Extra({ kind }) {
    switch (kind) {
        case "wave": return <g className="stk-part-wave"><ellipse cx="103" cy="52" rx="10" ry="12" fill="#FFC93C" stroke={INK} strokeWidth="3" /><path d="M96 42 l-3 -9 M103 40 l0 -10 M110 42 l3 -9" stroke={INK} strokeWidth="3" strokeLinecap="round" /></g>;
        case "hearts": return <g className="stk-part-float" fill="#E8335C">
            <path d="M100 26 c-6 -6 -14 2 0 12 c14 -10 6 -18 0 -12z" /><path d="M18 34 c-4 -4 -10 1 0 9 c10 -8 4 -13 0 -9z" opacity=".8" /></g>;
        case "tears": return <g fill="#5CC8FF" className="stk-part-drip"><path d="M30 60 q-6 10 0 14 q6 -4 0 -14z" /><path d="M90 60 q-6 10 0 14 q6 -4 0 -14z" /></g>;
        case "tear": return <path className="stk-part-drip" d="M44 68 q-6 11 0 15 q6 -4 0 -15z" fill="#5CC8FF" />;
        case "sparkle": return <g fill="#FFD43B" className="stk-part-twinkle"><path d="M100 22 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" /><path d="M20 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" /></g>;
        case "steam": return <g fill="none" stroke="#9aa3ad" strokeWidth="4" strokeLinecap="round" className="stk-part-float"><path d="M24 26 q-6 -6 0 -12" /><path d="M96 26 q6 -6 0 -12" /></g>;
        case "thumb": return <g transform="translate(86 62)"><rect x="0" y="12" width="26" height="22" rx="6" fill="#FFC93C" stroke={INK} strokeWidth="3" /><path d="M5 13 q0 -14 9 -14 q5 0 4 7 l-2 7" fill="#FFC93C" stroke={INK} strokeWidth="3" strokeLinejoin="round" /></g>;
        case "coffee": return <g transform="translate(78 70)" className="stk-part-steam"><path d="M2 6 h24 l-3 22 h-18z" fill="#fff" stroke={INK} strokeWidth="3" strokeLinejoin="round" /><path d="M26 10 q9 1 6 9 q-2 5 -8 4" fill="none" stroke={INK} strokeWidth="3" /><path d="M5 9 h18" stroke="#7b4a2a" strokeWidth="4" /><path className="stk-steam" d="M10 0 q-3 -5 0 -9 M17 0 q-3 -5 0 -9" stroke="#9aa3ad" strokeWidth="2.5" fill="none" strokeLinecap="round" /></g>;
        case "zzz": return <g fill={INK} fontFamily="Arial, sans-serif" fontWeight="900" className="stk-part-float"><text x="88" y="34" fontSize="18">Z</text><text x="102" y="20" fontSize="13">z</text><text x="111" y="10" fontSize="9">z</text></g>;
        case "party": return <g><path d="M48 24 L62 -2 L74 24 Z" transform="translate(-2 2) rotate(-8 60 20)" fill="#7B61FF" stroke={INK} strokeWidth="3" strokeLinejoin="round" /><circle cx="58" cy="0" r="5" fill="#FF5C8A" stroke={INK} strokeWidth="2" />
            <g className="stk-part-twinkle"><rect x="14" y="30" width="6" height="6" fill="#FF5C8A" transform="rotate(20 17 33)" /><rect x="100" y="36" width="6" height="6" fill="#31C48D" transform="rotate(-20 103 39)" /><circle cx="22" cy="92" r="3.5" fill="#3B82F6" /><circle cx="104" cy="90" r="3.5" fill="#FFB020" /></g></g>;
        case "question": return <text x="94" y="38" fontSize="30" fontWeight="900" fontFamily="Arial, sans-serif" fill="#3B82F6" className="stk-part-float">?</text>;
        case "holdheart": return <g transform="translate(46 80)"><g className="stk-part-pulse"><path d="M14 22 C-6 8 2 -6 14 4 C26 -6 34 8 14 22Z" fill="#E8335C" stroke={INK} strokeWidth="3" strokeLinejoin="round" /></g></g>;
        case "check": return <g transform="translate(84 18)" className="stk-part-pop"><circle cx="14" cy="14" r="14" fill="#16A34A" stroke="#fff" strokeWidth="3" /><path d="M7 14 l5 5 9 -10" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></g>;
        case "sweat": return <path className="stk-part-drip" d="M92 30 q-7 12 0 16 q7 -4 0 -16z" fill="#5CC8FF" />;
        default: return null;
    }
}

function Pip({ s }) {
    return (
        <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
            <ellipse cx="60" cy="112" rx="30" ry="5" fill="rgba(0,0,0,.12)" />
            <g className="stk-body">
                <ellipse cx="44" cy="104" rx="9" ry="6" fill={s.color} stroke={INK} strokeWidth="3" />
                <ellipse cx="76" cy="104" rx="9" ry="6" fill={s.color} stroke={INK} strokeWidth="3" />
                <circle cx="60" cy="64" r="42" fill={s.color} stroke={INK} strokeWidth="3.5" />
                <ellipse cx="44" cy="40" rx="12" ry="7" fill="#fff" opacity=".45" transform="rotate(-25 44 40)" />
                <ellipse cx="36" cy="72" rx="7" ry="4.5" fill="#ff6b8b" opacity=".35" />
                <ellipse cx="84" cy="72" rx="7" ry="4.5" fill="#ff6b8b" opacity=".35" />
                <Eyes kind={s.eyes} />
                <Mouth kind={s.mouth} />
            </g>
            <Extra kind={s.extra} />
        </svg>
    );
}

/* ---------------- office word stickers ---------------- */

const TXT = {
    thanks: { text: "Thank you!", icon: "🙏", bg: "linear-gradient(135deg,#ff9a9e,#fad0c4)", ink: "#7a1f3d" },
    onit: { text: "On it!", icon: "🚀", bg: "linear-gradient(135deg,#4facfe,#00f2fe)", ink: "#06325a" },
    done: { text: "Done!", icon: "✅", bg: "linear-gradient(135deg,#43e97b,#38f9d7)", ink: "#064d2e" },
    noted: { text: "Noted", icon: "📝", bg: "linear-gradient(135deg,#fddb92,#d1fdff)", ink: "#4a3b00" },
    approved: { text: "APPROVED", icon: "", stamp: "#d62839" },
    audited: { text: "AUDITED", icon: "", stamp: "#1d4ed8" },
    morning: { text: "Good morning!", icon: "☀️", bg: "linear-gradient(135deg,#f6d365,#fda085)", ink: "#6b2e00" },
    deadline: { text: "Deadline!", icon: "⏰", bg: "linear-gradient(135deg,#ff416c,#ff4b2b)", ink: "#fff" },
    checking: { text: "Checking…", icon: "🔍", bg: "linear-gradient(135deg,#a1c4fd,#c2e9fb)", ink: "#1e3a6b" },
    welldone: { text: "Well done!", icon: "👏", bg: "linear-gradient(135deg,#fbc2eb,#a6c1ee)", ink: "#4b1d6b" },
    lunch: { text: "Lunch?", icon: "🍜", bg: "linear-gradient(135deg,#ffecd2,#fcb69f)", ink: "#6b2e00" },
    ot: { text: "Overtime…", icon: "😮‍💨", bg: "linear-gradient(135deg,#434343,#000000)", ink: "#fff" },
    sorry: { text: "Sorry po!", icon: "🙇", bg: "linear-gradient(135deg,#e0c3fc,#8ec5fc)", ink: "#2d1b69" },
    salamat: { text: "Salamat!", icon: "💛", bg: "linear-gradient(135deg,#ffe259,#ffa751)", ink: "#5a3200" },
};

function TextSticker({ s }) {
    if (s.stamp) {
        return (
            <span className="stk-stamp" style={{ color: s.stamp, borderColor: s.stamp }}>
                <span>{s.text}</span>
            </span>
        );
    }
    return (
        <span className="stk-pill" style={{ background: s.bg, color: s.ink }}>
            {s.icon && <span className="stk-pill-icon">{s.icon}</span>}
            <span>{s.text}</span>
        </span>
    );
}

/* ---------------- big emoji ---------------- */

const EMO = ["😂", "🥰", "😍", "😭", "😡", "😱", "🤔", "😎", "😴", "🥳", "👍", "👏", "🙏", "💪", "🎉", "🔥", "💯", "❤️", "✅", "☕"];
const EMO_ANIM = { "😂": "shake", "😭": "droop", "😡": "shake", "😱": "pop", "🥳": "bounce", "🎉": "pop", "❤️": "pulse", "🥰": "pulse", "😍": "pulse", "🔥": "sway", "👏": "wave", "👍": "bounce", "😴": "breathe", "🤔": "sway" };

/* ---------------- public API ---------------- */

export const STICKER_PACKS = [
    { key: "pip", name: "Pip", icon: "pip:happy", items: Object.keys(PIP).map((k) => `pip:${k}`) },
    { key: "txt", name: "Office", icon: "txt:onit", items: Object.keys(TXT).map((k) => `txt:${k}`) },
    { key: "emo", name: "Emoji", icon: "emo:😂", items: EMO.map((e) => `emo:${e}`) },
];

export function stickerLabel(key = "") {
    const [pack, id] = [key.slice(0, 3), key.slice(4)];
    if (pack === "pip") return PIP[id]?.name || "Sticker";
    if (pack === "txt") return TXT[id]?.text || "Sticker";
    if (pack === "emo") return id;
    return "Sticker";
}

/** draws a sticker by key; `animate` plays its little animation (once on show, again on hover) */
export function Sticker({ k, size = 120, animate = true }) {
    const pack = String(k || "").slice(0, 3);
    const id = String(k || "").slice(4);
    let inner = null;
    let anim = "bounce";
    if (pack === "pip" && PIP[id]) { inner = <Pip s={PIP[id]} />; anim = PIP[id].anim; }
    else if (pack === "txt" && TXT[id]) { inner = <TextSticker s={TXT[id]} />; anim = TXT[id].stamp ? "stamp" : "pop"; }
    else if (pack === "emo" && id) { inner = <span className="stk-emo" style={{ fontSize: size * 0.72 }}>{id}</span>; anim = EMO_ANIM[id] || "bounce"; }
    else inner = <span className="stk-emo" style={{ fontSize: size * 0.5 }}>🧩</span>;
    return (
        <span className={`stk stk-${pack}${animate ? ` stk-anim-${anim}` : ""}`} style={{ width: pack === "txt" ? "auto" : size, height: size, "--stk": `${size}px` }} title={stickerLabel(k)}>
            {inner}
        </span>
    );
}

/** the sticker tray (tabs = packs); remembers recently used ones in this browser */
export function StickerPicker({ onPick, onClose, className = "" }) {
    const [tab, setTab] = useState(() => {
        try { return localStorage.getItem("ms-sticker-tab") || "recent"; } catch { return "pip"; }
    });
    const [recent, setRecent] = useState(() => {
        try { return JSON.parse(localStorage.getItem("ms-sticker-recent") || "[]"); } catch { return []; }
    });
    const ref = useRef(null);
    useEffect(() => {
        const onDown = (e) => !ref.current?.contains(e.target) && !e.target.closest?.(".ms-sticker-btn") && onClose();
        const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), onClose());
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey, true);
        return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true); };
    }, [onClose]);
    useEffect(() => { try { localStorage.setItem("ms-sticker-tab", tab); } catch { /* ignore */ } }, [tab]);

    const pick = (k) => {
        const next = [k, ...recent.filter((x) => x !== k)].slice(0, 16);
        setRecent(next);
        try { localStorage.setItem("ms-sticker-recent", JSON.stringify(next)); } catch { /* ignore */ }
        onPick(k);
    };
    const items = tab === "recent" ? recent : STICKER_PACKS.find((p) => p.key === tab)?.items || [];
    const showTab = tab === "recent" && !recent.length ? "pip" : tab;
    const list = showTab === tab ? items : STICKER_PACKS[0].items;

    return (
        <div className={`ms-stickers ${className}`} ref={ref} role="dialog" aria-label="Stickers">
            <div className="ms-stickers-tabs" role="tablist">
                {recent.length > 0 && (
                    <button role="tab" aria-selected={showTab === "recent"} className={showTab === "recent" ? "is-on" : ""} onClick={() => setTab("recent")} title="Recent">🕘</button>
                )}
                {STICKER_PACKS.map((p) => (
                    <button key={p.key} role="tab" aria-selected={showTab === p.key} className={showTab === p.key ? "is-on" : ""} onClick={() => setTab(p.key)} title={p.name}>
                        <Sticker k={p.icon} size={26} animate={false} />
                    </button>
                ))}
            </div>
            <div className={`ms-stickers-grid${showTab === "txt" ? " is-txt" : ""}`}>
                {list.map((k) => (
                    <button key={k} type="button" onClick={() => pick(k)} aria-label={`Send sticker ${stickerLabel(k)}`} title={stickerLabel(k)}>
                        <Sticker k={k} size={k.startsWith("txt:") ? 44 : 64} animate={false} />
                    </button>
                ))}
            </div>
        </div>
    );
}