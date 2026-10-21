// Messenger – like FB Messenger, for employees (Staff + ClientStaff logins = the same employee).
//   header button (unread badge) → chat list (online people, search, new message, new group)
//   chats open as windows docked at the bottom right (max 3) – text, photos, seen, typing, unsend, groups
//   full page: <MessengerPage /> on /messenger (list · chat · info), shares the same live data.
//   The open chat is kept in memory (not in the URL), so the app's tab bar shows ONE "Messenger" tab.
// Real time: Pusher (private-emp.<employee id>) when the server has the keys, else polling.
import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Pusher from "pusher-js";
import { useAuth, apiFetch, apiForm } from "../context/AuthContext";
import { useToast } from "./Toast";
import { Sticker, StickerPicker } from "./Stickers";
import { GifPicker } from "./Gifs";
import "./Messenger.css";

const EMPLOYEE_TYPES = ["Staff", "ClientStaff"];
const MAX_WINDOWS = 3;
const HEARTBEAT_MS = 20000;   // online status + badge
const POLL_MS = 4000;         // only when Pusher is not set up

/* ---------------- instant delivery (Pusher client events) ----------------
   Every chat has its own channel private-conv.<id>. The sender's browser pushes the new message
   straight to the other members over the open socket (~100 ms, no server in between);
   the saved copy from the server follows and replaces it. Needs "Client events" ON in the Pusher app. */
let livePusher = null;
const convChannel = (id) => `private-conv.${id}`;
function liveSend(cid, event, data) {
    const ch = livePusher?.channel(convChannel(cid));
    if (!ch?.subscribed) return false;
    try { return ch.trigger(event, data); } catch { return false; }
}

/* ---------------- small helpers ---------------- */

const TZ = "Asia/Manila";                               // every time is shown in Philippine time
const phDay = (d) => d.toLocaleDateString("en-CA", { timeZone: TZ });   // "2026-10-20"
const toDate = (t) => (t ? new Date(String(t).replace(" ", "T")) : null);
function ago(t) {
    const d = toDate(t);
    if (!d || isNaN(d)) return "";
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return "now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 7 * 86400) return d.toLocaleDateString("en-PH", { weekday: "short", timeZone: TZ });
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: TZ });
}
const activeText = (p) => (p?.online ? "Active now" : p?.last_seen ? `Active ${ago(p.last_seen)} ago`.replace("now ago", "just now") : "");
function stamp(t) {
    const d = toDate(t);
    if (!d || isNaN(d)) return "";
    const today = phDay(new Date()) === phDay(d);
    return today ? d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: TZ })
        : d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ });
}
// chat themes (keys = MessengerController::THEMES): my bubbles + the buttons in that chat
const THEMES = {
    default: { name: "Default", mine: "linear-gradient(180deg, #0a7cff 0%, #0866ff 100%)", accent: "#0866ff" },
    ocean: { name: "Ocean", mine: "linear-gradient(160deg, #00c6ff 0%, #0072ff 100%)", accent: "#0072ff" },
    berry: { name: "Berry", mine: "linear-gradient(160deg, #ff5ea8 0%, #a445ff 100%)", accent: "#c23bff" },
    sunset: { name: "Sunset", mine: "linear-gradient(160deg, #ffb347 0%, #ff5f6d 100%)", accent: "#f2545b" },
    forest: { name: "Forest", mine: "linear-gradient(160deg, #3fbf6f 0%, #12855a 100%)", accent: "#16935f" },
    grape: { name: "Grape", mine: "linear-gradient(160deg, #8f6bff 0%, #5b2bd6 100%)", accent: "#6a3df0" },
    rose: { name: "Rose", mine: "linear-gradient(160deg, #ff8fa3 0%, #e0245e 100%)", accent: "#e0245e" },
    teal: { name: "Teal", mine: "linear-gradient(160deg, #2dd4bf 0%, #0d9488 100%)", accent: "#0d9488" },
    tangerine: { name: "Tangerine", mine: "linear-gradient(160deg, #ffa53a 0%, #f76b1c 100%)", accent: "#f2711c" },
    midnight: { name: "Midnight", mine: "linear-gradient(160deg, #475569 0%, #0f172a 100%)", accent: "#334155" },
    igb: { name: "IGB", mine: "linear-gradient(160deg, #6366f1 0%, #8b5cf6 55%, #d946ef 100%)", accent: "#7c3aed" },
};
// chat backgrounds (keys = MessengerController::BACKGROUNDS); dark ones switch the small labels to light text
const svgBg = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const BACKGROUNDS = {
    none: { name: "None", css: "" },
    sky: { name: "Sky", css: "linear-gradient(180deg, #e0f2ff 0%, #f5fbff 100%)" },
    blush: { name: "Blush", css: "linear-gradient(180deg, #ffe4ec 0%, #fff6f8 100%)" },
    mint: { name: "Mint", css: "linear-gradient(180deg, #dcfce7 0%, #f3fff7 100%)" },
    sand: { name: "Sand", css: "linear-gradient(180deg, #fdf0d5 0%, #fffaf0 100%)" },
    lavender: { name: "Lavender", css: "linear-gradient(180deg, #ede9fe 0%, #faf8ff 100%)" },
    aurora: { name: "Aurora", css: "radial-gradient(at 15% 10%, #c7f9e9 0, transparent 45%), radial-gradient(at 85% 20%, #dbe4ff 0, transparent 45%), radial-gradient(at 50% 95%, #fde2f3 0, transparent 50%), #f8fafc" },
    peach: { name: "Peach", css: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)" },
    dots: { name: "Dots", css: `${svgBg("<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><circle cx='2' cy='2' r='1.6' fill='#c7cdd8'/></svg>")}, #f7f8fa` },
    grid: { name: "Grid", css: `${svgBg("<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26'><path d='M26 0H0V26' fill='none' stroke='#e3e7ee' stroke-width='1'/></svg>")}, #fbfcfe` },
    waves: { name: "Waves", css: `${svgBg("<svg xmlns='http://www.w3.org/2000/svg' width='80' height='40'><path d='M0 20 Q20 0 40 20 T80 20' fill='none' stroke='#d6e4ff' stroke-width='2'/></svg>")}, #f4f8ff` },
    night: { name: "Night", css: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)", dark: true },
    galaxy: { name: "Galaxy", css: `${svgBg("<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><g fill='#ffffff'><circle cx='10' cy='14' r='1'/><circle cx='70' cy='30' r='1.3'/><circle cx='100' cy='90' r='.9'/><circle cx='40' cy='80' r='1.1'/><circle cx='90' cy='8' r='.8'/><circle cx='22' cy='108' r='.9'/></g></svg>")}, radial-gradient(at 30% 20%, #4c1d95 0, transparent 55%), radial-gradient(at 80% 80%, #1e3a8a 0, transparent 55%), #0b1020`, dark: true },
};
const bgOf = (key) => BACKGROUNDS[key] || BACKGROUNDS.none;

const themeOf = (key) => THEMES[key] || THEMES.default;
const themeStyle = (key) => { const t = themeOf(key); return { "--ms-mine": t.mine, "--ms-blue": t.accent }; };

const DOC_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "ppt", "pptx", "zip", "rar", "7z", "odt", "ods", "rtf", "xml", "json"];
const DOC_ACCEPT = DOC_EXT.map((e) => `.${e}`).join(",");
const extOf = (n = "") => (n.split(".").pop() || "").toLowerCase();
const fileSize = (b) => (!b ? "" : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const FILE_COLORS = { pdf: "#e5252a", doc: "#2b579a", docx: "#2b579a", xls: "#217346", xlsx: "#217346", csv: "#217346", ppt: "#d24726", pptx: "#d24726", zip: "#7c5cff", rar: "#7c5cff", "7z": "#7c5cff" };
function FileBadge({ name, size = 36 }) {
    const ext = extOf(name);
    return (
        <span className="ms-filebadge" style={{ width: size, height: size, background: FILE_COLORS[ext] || "#64748b", fontSize: size * 0.27 }} aria-hidden="true">
            {(ext || "file").slice(0, 4).toUpperCase()}
        </span>
    );
}

const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#4f46e5", "#be123c"];
const initials = (n = "") => n.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const colorOf = (n = "") => COLORS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

// links in a message become clickable
function Linkify({ text }) {
    return String(text).split(/(https?:\/\/[^\s]+)/g).map((p, i) =>
        /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : p);
}

// soft "pop" for a new message (no sound file needed)
let audioCtx;
function ping() {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(880, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.08);
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
        o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.26);
    } catch { /* no sound */ }
}

/* ---------------- emoji ---------------- */
const REACTIONS = ["❤️", "😆", "😮", "😢", "😠", "👍"];
const EMOJI = {
    "Smileys": "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 💩 🤡 👻 👽 🤖",
    "Gestures": "👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫶 👀 🧠 🫡",
    "Hearts": "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡ 🎉 🎊",
    "Work": "✅ ☑️ ❌ ⚠️ ❗ ❓ 📌 📎 📝 📄 📑 📊 📈 📉 🗂️ 📁 📅 🗓️ ⏰ ⏳ 💼 🖥️ 💻 ⌨️ 🖨️ 📱 ☎️ 📧 📨 💰 💵 💳 🧾 🏦 🔒 🔑 🔍 💡 🛠️ 🚀 🏆 🎯 ☕ 🍔 🍕 🍰 🎂",
};

function EmojiPicker({ onPick, onClose, className = "" }) {
    const [tab, setTab] = useState(Object.keys(EMOJI)[0]);
    const ref = useRef(null);
    useEffect(() => {
        const onDown = (e) => !ref.current?.contains(e.target) && !e.target.closest?.(".ms-emoji-btn") && onClose();
        const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), onClose());
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey, true);
        return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true); };
    }, [onClose]);
    return (
        <div className={`ms-emoji ${className}`} ref={ref} role="dialog" aria-label="Emoji">
            <div className="ms-emoji-tabs">
                {Object.keys(EMOJI).map((k) => <button key={k} type="button" className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{k}</button>)}
            </div>
            <div className="ms-emoji-grid">
                {EMOJI[tab].split(" ").map((e) => <button key={e} type="button" onClick={() => onPick(e)} aria-label={e}>{e}</button>)}
            </div>
        </div>
    );
}

/* ---------------- icons ---------------- */
const I = {
    chat: <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.3 9.6 9.6 0 0 1-3.6-.7L3 21l1.6-4.4A7.9 7.9 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3.2a8.4 8.4 0 0 1 9 8.3z" /><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" strokeWidth="2.6" /></>,
    compose: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
    group: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    minus: <path d="M5 12h14" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
    send: <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" fill="currentColor" stroke="none" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
    more: <><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></>,
    back: <path d="M15 18l-6-6 6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    plusCircle: <><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" /><path d="M12 7.5v9M7.5 12h9" stroke="#fff" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.6" /></>,
    reply: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
    clip: <path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
    down: <path d="M6 9l6 6 6-6" />,
    download: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
    forward: <><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5V20" /></>,
    copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>,
    gif: <><rect x="2.5" y="5" width="19" height="14" rx="3.5" /><text x="12" y="15.2" textAnchor="middle" fontSize="7.6" fontWeight="800" fontFamily="Arial, Helvetica, sans-serif" fill="currentColor" stroke="none" letterSpacing=".2">GIF</text></>,
    sticker: <><path d="M14 3H7a4 4 0 0 0-4 4v10a4 4 0 0 0 4 4h6l8-8V7a4 4 0 0 0-4-4h-3z" /><path d="M13 21v-4a4 4 0 0 1 4-4h4" /><path d="M8.5 13.5s1.2 1.5 3 1.5" /><path d="M9 9h.01M14 9h.01" strokeWidth="2.6" /></>,
    expand: <><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></>,
    pin: <><path d="M12 17v5" /><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" /></>,
};
const Svg = ({ i, size = 18 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[i]}</svg>
);

function Avatar({ name, photo, size = 36, online = false }) {
    const [bad, setBad] = useState(false);
    return (
        <span className="ms-av" style={{ width: size, height: size, fontSize: size * 0.38 }}>
            {photo && !bad ? <img src={photo} alt="" onError={() => setBad(true)} /> : <span className="ms-av-init" style={{ background: colorOf(name) }}>{initials(name)}</span>}
            {online && <i className="ms-online" style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }} />}
        </span>
    );
}
function ConvAvatar({ c, size = 40 }) {
    if (!c?.is_group) return <Avatar name={c?.other?.name || c?.name} photo={c?.other?.photo} size={size} online={c?.other?.online} />;
    const [a, b] = c.avatars || [];
    return (
        <span className="ms-av-group" style={{ width: size, height: size }}>
            <Avatar name={b?.name || c.name} photo={b?.photo} size={size * 0.68} />
            <Avatar name={a?.name || c.name} photo={a?.photo} size={size * 0.68} />
            {c.online && <i className="ms-online" />}
        </span>
    );
}

/* ================= store (context) ================= */

const Ctx = createContext(null);
const useMs = () => useContext(Ctx);

// the header's live Messenger data, shared with <MessengerPage /> (no provider needed in the app layout)
let shared = null;
const subs = new Set();
const publish = (v) => { shared = v; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
const useShared = () => useSyncExternalStore(subscribe, () => shared);
const isPage = (path) => /^\/messenger(\/|$)/.test(path || "");

export default function Messenger() {
    const { user } = useAuth();
    if (!EMPLOYEE_TYPES.includes(user?.type)) return null;
    return <MessengerInner key={`${user.type}:${user.login_id ?? user.id}`} />;
}

function MessengerInner() {
    const notify = useToast();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const onPage = isPage(pathname);
    const onPageRef = useRef(onPage); onPageRef.current = onPage;
    const [pageChat, setPageChat] = useState(null);      // chat open on the full page
    const pageRef = useRef(pageChat); pageRef.current = pageChat;
    const [me, setMe] = useState(null);
    const [unread, setUnread] = useState(0);
    const [online, setOnline] = useState([]);
    const [rt, setRt] = useState(false);                 // Pusher connected
    const [limits, setLimits] = useState({ post: 0, file: 0 });   // php.ini post_max_size / upload_max_filesize (bytes)
    const [convs, setConvs] = useState(null);            // chat list (loaded on first open)
    const [chats, setChats] = useState({});              // id → { conversation, members, messages, hasMore, typing }
    const [wins, setWins] = useState([]);                // [{ id, min }]
    const [listOpen, setListOpen] = useState(false);
    const [modal, setModal] = useState(null);            // "message" | "group" | { add: conversationId }
    const [lightbox, setLightbox] = useState(null);
    const [forwardMsg, setForwardMsg] = useState(null);  // message being forwarded
    const chatsRef = useRef(chats); chatsRef.current = chats;
    const winsRef = useRef(wins); winsRef.current = wins;
    const meRef = useRef(me); meRef.current = me;
    const pusherCfg = useRef(null);

    /* ---------- summary: badge + online + heartbeat ---------- */
    const loadSummary = useCallback(async () => {
        try {
            const r = await apiFetch("/messenger/summary");
            setMe(r.me); setUnread(r.unread || 0); setOnline(r.online || []);
            if (r.limits) setLimits((cur) => (cur.post === r.limits.post && cur.file === r.limits.file ? cur : r.limits));
            if (r.pusher && !pusherCfg.current) pusherCfg.current = r.pusher;
            return r;
        } catch { return null; }
    }, []);

    const loadConvs = useCallback(async () => {
        try { setConvs(await apiFetch("/messenger/conversations")); } catch { /* keep old list */ }
    }, []);

    const setChat = useCallback((id, fn) => setChats((all) => {
        const cur = all[id];
        const next = typeof fn === "function" ? fn(cur) : fn;
        return next ? { ...all, [id]: next } : all;
    }), []);

    const putPayload = useCallback((r) => {
        const id = r.conversation.id;
        setChat(id, (cur) => ({ typing: {}, ...cur, conversation: r.conversation, members: r.members, messages: r.messages, hasMore: r.has_more, pinned: r.pinned || [] }));
        return id;
    }, [setChat]);

    const loadChat = useCallback(async (id) => {
        try { putPayload(await apiFetch(`/messenger/conversations/${id}`)); return true; }
        catch (e) {
            setWins((w) => w.filter((x) => x.id !== id));      // removed from the group / gone
            if (e?.status !== 404) notify(e.message || "Couldn't open the chat.", "error");
            return false;
        }
    }, [putPayload, notify]);

    /* ---------- windows ---------- */
    const openChat = useCallback((id, { focus = true } = {}) => {
        if (onPageRef.current) {                              // on the Messenger page: show it there
            setPageChat(id);
            if (!chatsRef.current[id]) loadChat(id);
            return;
        }
        setWins((w) => {
            const rest = w.filter((x) => x.id !== id);
            const next = [...rest, { id, min: false, focus: focus ? Date.now() : 0 }];
            return next.slice(-MAX_WINDOWS);
        });
        if (!chatsRef.current[id]) loadChat(id);
    }, [loadChat, navigate]);
    const closeChat = (id) => setWins((w) => w.filter((x) => x.id !== id));
    const toggleMin = (id) => setWins((w) => w.map((x) => (x.id === id ? { ...x, min: !x.min } : x)));

    const openDirect = useCallback(async (employeeId) => {
        try { openChat(putPayload(await apiFetch("/messenger/direct", { method: "POST", body: JSON.stringify({ employee_id: employeeId }) }))); setListOpen(false); }
        catch (e) { notify(e.message || "Couldn't open the chat.", "error"); }
    }, [openChat, putPayload, notify]);

    /* ---------- new messages arriving (Pusher or polling) ---------- */
    const receive = useCallback((cid, msgs, { sound = true, refresh = true } = {}) => {
        if (!msgs?.length) return;
        const meId = meRef.current;
        setChat(cid, (cur) => {
            if (!cur) return cur;
            const have = new Set(cur.messages.map((m) => m.id));
            const fresh = msgs.filter((m) => !have.has(m.id));
            if (!fresh.length) return cur;
            const typing = { ...cur.typing };
            fresh.forEach((m) => delete typing[m.sender_id]);
            return { ...cur, typing, messages: [...cur.messages, ...fresh] };
        });
        const fromOthers = msgs.some((m) => m.sender_id && m.sender_id !== meId);
        if (fromOthers) {
            const open = winsRef.current.find((w) => w.id === cid);
            const onScreen = (open && !open.min) || (onPageRef.current && pageRef.current === cid);
            if (!open && !onPageRef.current) openChat(cid, { focus: false });   // FB pops the chat open (not on the Messenger page)
            if (sound && (document.hidden || !onScreen)) ping();
            if (refresh) { loadSummary(); loadConvs(); }
        }
    }, [setChat, openChat, loadSummary, loadConvs]);

    /* ---------- start: summary, heartbeat, Pusher ---------- */
    useEffect(() => {
        let pusher;
        let alive = true;
        (async () => {
            const r = await loadSummary();
            if (!alive || !r?.pusher) return;
            pusher = new Pusher(r.pusher.key, {
                cluster: r.pusher.cluster,
                channelAuthorization: {
                    customHandler: ({ socketId, channelName }, cb) => {
                        apiFetch("/messenger/pusher-auth", { method: "POST", body: JSON.stringify({ socket_id: socketId, channel_name: channelName }) })
                            .then((d) => cb(null, d)).catch((e) => cb(e, null));
                    },
                },
            });
            livePusher = pusher;
            const ch = pusher.subscribe(`private-emp.${r.me}`);
            ch.bind("pusher:subscription_succeeded", () => setRt(true));
            ch.bind("pusher:subscription_error", () => setRt(false));
            pusher.connection.bind("state_change", ({ current }) => setRt(current === "connected"));
            ch.bind("message", (d) => {
                // the instant copy (client event) is replaced by the saved message
                const had = !!d.client_id && !!chatsRef.current[d.conversation_id]?.messages.some((m) => String(m.id).startsWith(d.client_id));
                if (had) setChat(d.conversation_id, (cur) => cur && ({ ...cur, messages: cur.messages.filter((m) => !String(m.id).startsWith(d.client_id)) }));
                receive(d.conversation_id, d.messages, { sound: !had });   // already pinged for the instant copy
            });
            ch.bind("read", (d) => setChat(d.conversation_id, (cur) => cur && ({
                ...cur, members: cur.members.map((m) => (m.id === d.employee_id ? { ...m, last_read_id: Math.max(m.last_read_id, d.last_read_id) } : m)),
            })));
            ch.bind("unsend", (d) => setChat(d.conversation_id, (cur) => cur && ({
                ...cur, messages: cur.messages.map((m) => (m.id === d.message_id ? { ...m, unsent: true, body: null, image: null } : m)),
            })));
            ch.bind("react", (d) => setChat(d.conversation_id, (cur) => cur && ({
                ...cur, messages: cur.messages.map((m) => (m.id === d.message_id ? { ...m, reactions: d.reactions } : m)),
            })));
            ch.bind("typing", (d) => setChat(d.conversation_id, (cur) => cur && ({ ...cur, typing: { ...cur.typing, [d.employee_id]: { name: d.name, until: Date.now() + 4500 } } })));
            ch.bind("conversation", (d) => { if (chatsRef.current[d.conversation_id]) loadChat(d.conversation_id); loadConvs(); loadSummary(); });
        })();
        const beat = setInterval(() => document.visibilityState === "visible" && loadSummary(), HEARTBEAT_MS);
        return () => { alive = false; clearInterval(beat); if (livePusher === pusher) livePusher = null; pusher?.disconnect(); };
    }, [loadSummary, receive, setChat, loadChat, loadConvs]);

    // one channel per chat (first 100 in the list) for the instant messages + typing
    const convIds = (convs || []).slice(0, 100).map((x) => x.id).join(",");
    const liveSubs = useRef(new Set());
    useEffect(() => {
        if (!rt || !livePusher) return;
        const want = new Set(convIds ? convIds.split(",").map(Number) : []);
        liveSubs.current.forEach((id) => { if (!want.has(id)) { livePusher.unsubscribe(convChannel(id)); liveSubs.current.delete(id); } });
        want.forEach((id) => {
            if (liveSubs.current.has(id)) return;
            liveSubs.current.add(id);
            const ch = livePusher.subscribe(convChannel(id));
            ch.bind("client-message", (d) => d?.message && receive(id, [{ ...d.message, live: true }], { refresh: false }));
            ch.bind("client-typing", (d) => d?.employee_id && setChat(id, (cur) => cur && ({ ...cur, typing: { ...cur.typing, [d.employee_id]: { name: d.name, until: Date.now() + 4500 } } })));
        });
    }, [rt, convIds, receive, setChat]);
    useEffect(() => { if (!rt) liveSubs.current.clear(); }, [rt]);

    // no Pusher → poll the open chats (and the list when the badge changes)
    const pollKey = [...wins.map((w) => w.id), onPage ? pageChat : null].filter(Boolean).join(",");
    useEffect(() => {
        if (rt || !pollKey) return;
        const t = setInterval(async () => {
            if (document.visibilityState !== "visible") return;
            const ids = [...new Set([...winsRef.current.map((w) => w.id), onPageRef.current ? pageRef.current : null].filter(Boolean))];
            for (const id of ids) {
                const w = { id };
                const c = chatsRef.current[w.id];
                if (!c) continue;
                const last = c.messages.filter((m) => !String(m.id).startsWith("t")).slice(-1)[0]?.id || 0;
                try {
                    const r = await apiFetch(`/messenger/conversations/${w.id}?after_id=${last}`);
                    setChat(w.id, (cur) => cur && ({
                        ...cur, conversation: r.conversation, members: r.members, pinned: r.pinned || cur.pinned || [],
                        messages: cur.messages.map((m) => (r.changed || []).find((x) => x.id === m.id) || (r.unsent.includes(m.id) ? { ...m, unsent: true, body: null, image: null } : m)),
                    }));
                    receive(w.id, r.messages);
                } catch { /* next time */ }
            }
        }, POLL_MS);
        return () => clearInterval(t);
    }, [rt, pollKey, setChat, receive]);

    const prevUnread = useRef(0);
    useEffect(() => {
        if (!rt && unread > prevUnread.current) { loadConvs(); ping(); }
        prevUnread.current = unread;
    }, [unread, rt, loadConvs]);

    // typing dots expire
    useEffect(() => {
        const t = setInterval(() => {
            const now = Date.now();
            Object.entries(chatsRef.current).forEach(([id, c]) => {
                if (Object.values(c.typing || {}).some((x) => x.until < now)) {
                    setChat(Number(id), (cur) => cur && ({ ...cur, typing: Object.fromEntries(Object.entries(cur.typing).filter(([, x]) => x.until >= now)) }));
                }
            });
        }, 1500);
        return () => clearInterval(t);
    }, [setChat]);

    // go to the Messenger page (one tab), optionally with a chat open
    const openPage = useCallback((id = null) => {
        if (id) {
            setPageChat(id);
            setWins((w) => w.filter((x) => x.id !== id));   // its docked window isn't needed there
            if (!chatsRef.current[id]) loadChat(id);
        }
        if (!onPageRef.current) navigate("/messenger");
    }, [navigate, loadChat]);

    const togglePin = useCallback(async (id, pinned) => {
        setConvs((list) => list && list.map((c) => (c.id === id ? { ...c, pinned } : c)));
        try { await apiFetch(`/messenger/conversations/${id}/pin`, { method: "POST", body: JSON.stringify({ pinned }) }); }
        catch (e) { notify(e.message || "Couldn't pin the chat.", "error"); }
        loadConvs();
    }, [loadConvs, notify]);

    const value = useMemo(() => ({
        me, unread, online, rt, convs, chats, wins, setChat, loadConvs, loadChat, loadSummary, openChat, closeChat, toggleMin,
        openDirect, putPayload, receive, setModal, setLightbox, setListOpen, notify, togglePin, onPage, pageChat, setPageChat, openPage, navigate, limits, setForwardMsg,
    }), [me, unread, online, rt, convs, chats, wins, setChat, loadConvs, loadChat, loadSummary, openChat, openDirect, putPayload, receive, notify, togglePin, onPage, pageChat, openPage, navigate, limits]);

    useEffect(() => { publish(value); }, [value]);
    useEffect(() => () => publish(null), []);

    return (
        <Ctx.Provider value={value}>
            <HeaderButton open={listOpen} setOpen={setListOpen} />
            {!onPage && createPortal(
                <div className="ms-dock">
                    {wins.map((w) => <ChatWindow key={w.id} win={w} />)}
                </div>,
                document.body
            )}
            {modal && createPortal(<PeopleModal mode={modal} onClose={() => setModal(null)} />, document.body)}
            {forwardMsg && createPortal(<ForwardModal msg={forwardMsg} onClose={() => setForwardMsg(null)} />, document.body)}
            {lightbox && createPortal(
                <div className="ms-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Photo">
                    <img src={lightbox} alt="" />
                    <button className="ms-lightbox-x" aria-label="Close"><Svg i="x" size={22} /></button>
                </div>, document.body)}
        </Ctx.Provider>
    );
}

/* ================= header button + chat list ================= */

function HeaderButton({ open, setOpen }) {
    const { unread, openChat, openPage } = useMs();
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => !ref.current?.contains(e.target) && !e.target.closest?.(".ms-modal") && setOpen(false);
        const onKey = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
    }, [open, setOpen]);

    return (
        <div className="pop-wrap" ref={ref}>
            <button className={`icon-btn round ms-trigger${open ? " is-on" : ""}`} onClick={() => setOpen(!open)}
                aria-label={`Messenger${unread ? ` (${unread} unread)` : ""}`} aria-expanded={open} title="Messenger">
                <Svg i="chat" size={20} />
                {unread > 0 && <span className="count">{unread > 99 ? "99+" : unread}</span>}
            </button>

            {open && (
                <div className="ms-list" role="dialog" aria-label="Chats">
                    <ChatList onPick={(id) => { openChat(id); setOpen(false); }} />
                    <button className="ms-see-all" onClick={() => { setOpen(false); openPage(); }}>See all in Messenger</button>
                </div>
            )}
        </div>
    );
}

/* ================= chat list (header dropdown + Messenger page) ================= */

const FILTERS = [["all", "All"], ["unread", "Unread"], ["people", "People"], ["groups", "Groups"]];

function ChatList({ onPick, selected = null, page = false }) {
    const { convs, loadConvs, openDirect, setModal, togglePin } = useMs();
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState("all");
    const [people, setPeople] = useState([]);

    useEffect(() => {
        loadConvs();
        apiFetch("/messenger/people").then(setPeople).catch(() => { });
    }, [loadConvs]);

    const term = q.trim().toLowerCase();
    const shown = (convs || []).filter((c) => (!term || c.name.toLowerCase().includes(term))
        && (filter === "all" || (filter === "unread" && c.unread > 0) || (filter === "people" && !c.is_group) || (filter === "groups" && c.is_group)))
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));      // pinned on top (stable: keeps newest-first inside)
    const counts = { unread: (convs || []).filter((c) => c.unread > 0).length, groups: (convs || []).filter((c) => c.is_group).length };
    const directIds = new Set((convs || []).filter((c) => !c.is_group).map((c) => c.other?.id));
    const peopleHits = term ? people.filter((p) => p.name.toLowerCase().includes(term) && !directIds.has(p.id)).slice(0, 8) : [];
    const activeNow = people.filter((p) => p.online);

    return (
        <>
            <div className="ms-list-head">
                <h3>Chats</h3>
                <button className="ms-circle" onClick={() => setModal("group")} title="New group" aria-label="New group"><Svg i="group" size={17} /></button>
                <button className="ms-circle" onClick={() => setModal("message")} title="New message" aria-label="New message"><Svg i="compose" size={17} /></button>
            </div>
            <label className="ms-search">
                <Svg i="search" size={16} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Messenger" aria-label="Search Messenger" />
            </label>

            <div className="ms-filters" role="tablist" aria-label="Show">
                {FILTERS.map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? "is-on" : ""} onClick={() => setFilter(k)}>
                        {l}{k === "unread" && counts.unread > 0 && <b>{counts.unread}</b>}
                    </button>
                ))}
            </div>

            {!term && filter !== "groups" && activeNow.length > 0 && (
                <div className="ms-active" aria-label="Active now">
                    {activeNow.map((p) => (
                        <button key={p.id} className="ms-active-p" onClick={() => openDirect(p.id)} title={p.name}>
                            <Avatar name={p.name} photo={p.photo} size={48} online />
                            <span>{p.name.split(" ")[0]}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="ms-convs">
                {convs === null && <div className="ms-empty">Loading…</div>}
                {convs && shown.length === 0 && peopleHits.length === 0 && (
                    <div className="ms-empty">{term ? "No results." : filter === "unread" ? "No unread chats. 🎉" : filter === "groups" ? "No group chats yet. Make one with the group button." : filter === "people" ? "No direct chats yet." : "No chats yet. Start one with the pencil button."}</div>
                )}
                {shown.map((c, i) => (
                    <Fragment key={c.id}>
                        {filter === "all" && !term && (i === 0 || shown[i - 1].pinned !== c.pinned) && (
                            <div className="ms-sub">{c.pinned ? "Pinned" : "Recent"}</div>
                        )}
                        <div role="button" tabIndex={0} aria-current={selected === c.id ? "true" : undefined}
                            className={`ms-conv${c.unread ? " is-unread" : ""}${c.pinned ? " is-pinned" : ""}${selected === c.id ? " is-selected" : ""}`}
                            onClick={() => onPick(c.id)} onKeyDown={(e) => e.key === "Enter" && onPick(c.id)}>
                            <ConvAvatar c={c} size={page ? 56 : 52} />
                            <span className="ms-conv-body">
                                <span className="ms-conv-name">{c.pinned && <span className="ms-pin-mark" title="Pinned"><Svg i="pin" size={12} /></span>}{c.name}</span>
                                <span className="ms-conv-last"><span className="ms-ellipsis">{c.preview || (c.is_group ? `${c.members} members` : "")}</span>{c.time && <span className="ms-conv-time">{"\u00a0· "}{ago(c.time)}</span>}</span>
                            </span>
                            <button className={`ms-pin-btn${c.pinned ? " is-on" : ""}`} onClick={(e) => { e.stopPropagation(); togglePin(c.id, !c.pinned); }}
                                title={c.pinned ? "Unpin chat" : "Pin chat"} aria-label={c.pinned ? `Unpin ${c.name}` : `Pin ${c.name}`}><Svg i="pin" size={15} /></button>
                            {c.unread > 0 && <i className="ms-unread-dot" aria-label={`${c.unread} unread`} />}
                            {c.is_group && <span className="ms-group-tag" title="Group chat">Group</span>}
                        </div>
                    </Fragment>
                ))}
                {peopleHits.length > 0 && <div className="ms-sub">People</div>}
                {peopleHits.map((p) => (
                    <button key={`p${p.id}`} className="ms-conv" onClick={() => openDirect(p.id)}>
                        <Avatar name={p.name} photo={p.photo} size={44} online={p.online} />
                        <span className="ms-conv-body"><span className="ms-conv-name">{p.name}</span><span className="ms-conv-last">{p.role || activeText(p)}</span></span>
                    </button>
                ))}
            </div>
        </>
    );
}

/* ================= one chat window ================= */

function ChatWindow({ win, page = false }) {
    const { me, rt, chats, setChat, closeChat, toggleMin, loadSummary, loadConvs, receive, setLightbox, notify, setModal, putPayload, setPageChat, openPage, limits, setForwardMsg } = useMs();
    const c = chats[win.id];
    const body = useRef(null);
    const input = useRef(null);
    const fileRef = useRef(null);
    const docRef = useRef(null);
    const [text, setText] = useState("");
    const [showTools, setShowTools] = useState(false);   // ⊕ tapped while typing → icons back
    const typingMode = !!text && !showTools;
    useEffect(() => { if (!text) setShowTools(false); }, [text]);   // box empty again → normal icons
    const [files, setFiles] = useState([]);              // [{ file, url }]
    const [info, setInfo] = useState(() => page && window.innerWidth >= 1280);   // page: info panel open on wide screens
    const [loadingOld, setLoadingOld] = useState(false);
    const [replyTo, setReplyTo] = useState(null);        // message being replied to
    const [emojiOpen, setEmojiOpen] = useState(false);   // emoji picker for the text box
    const [stickerOpen, setStickerOpen] = useState(false); // sticker tray
    const [gifOpen, setGifOpen] = useState(false);         // GIF tray
    const [reactFor, setReactFor] = useState(null);      // message id with the reaction bar open
    const [reactMore, setReactMore] = useState(null);    // message id with the full emoji list (react)
    const lastTyping = useRef(0);
    const atBottom = useRef(true);

    const conv = c?.conversation;
    const msgs = c?.messages || [];
    const lastId = msgs.filter((m) => typeof m.id === "number").slice(-1)[0]?.id || 0;
    const mine = (m) => m.sender_id === me;

    // the new message to the other members right away (they see it before the server has saved it)
    const pushLive = (msg) => {
        const meRow = c?.members?.find((m) => m.me);
        liveSend(win.id, "client-message", {
            message: { ...msg, sender_id: me, sender: meRow?.name || "", photo: meRow?.photo || null, mine: false, time: new Date().toISOString() },
        });
    };

    // stick to the bottom on new messages (unless reading older ones)
    useEffect(() => {
        const el = body.current;
        if (el && atBottom.current) el.scrollTop = el.scrollHeight;
    }, [msgs.length, c?.typing, win.min, info]);

    useEffect(() => { if (win.focus) setTimeout(() => input.current?.focus(), 30); }, [win.focus]);

    // seen: when the window is open and visible
    useEffect(() => {
        if (!c || win.min || !lastId) return;
        const myRead = c.members.find((m) => m.me)?.last_read_id || 0;
        if (lastId <= myRead || document.hidden) return;
        setChat(win.id, (cur) => cur && ({ ...cur, members: cur.members.map((m) => (m.me ? { ...m, last_read_id: lastId } : m)) }));
        apiFetch(`/messenger/conversations/${win.id}/read`, { method: "POST", body: JSON.stringify({ message_id: lastId }) })
            .then(() => { loadSummary(); loadConvs(); }).catch(() => { });
    }, [lastId, win.min, win.id, c, setChat, loadSummary, loadConvs]);

    // photos / GIFs get taller when they finish loading → stay at the bottom if we were there
    // message box grows with the text (like Messenger), up to its max height, then scrolls
    useLayoutEffect(() => {
        const el = input.current;
        if (!el) return;
        el.style.height = "auto";
        const max = parseFloat(getComputedStyle(el).maxHeight) || 140;
        el.style.height = `${Math.min(el.scrollHeight, max)}px`;
        el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
    }, [text, win.min]);

    const keepBottom = () => { if (atBottom.current && body.current) body.current.scrollTop = body.current.scrollHeight; };

    const onScroll = async (e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        if (el.scrollTop < 60 && c?.hasMore && !loadingOld) {
            setLoadingOld(true);
            const first = msgs.find((m) => typeof m.id === "number")?.id;
            const h = el.scrollHeight;
            try {
                const r = await apiFetch(`/messenger/conversations/${win.id}?before_id=${first}`);
                setChat(win.id, (cur) => cur && ({ ...cur, messages: [...r.messages, ...cur.messages], hasMore: r.has_more }));
                requestAnimationFrame(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight - h; });
            } catch { /* ignore */ }
            setLoadingOld(false);
        }
    };

    // size limits: our own (photo 10 MB, file 20 MB) and the server's php.ini (one file / everything sent together)
    const MB = 1048576;
    const photoMax = Math.min(10 * MB, limits.file || Infinity);
    const docMax = Math.min(20 * MB, limits.file || Infinity);
    const totalMax = limits.post ? limits.post - 64 * 1024 : Infinity;     // room for the text and form fields
    const mb = (b) => `${(b / MB).toFixed(b < 10 * MB ? 1 : 0)} MB`;
    const [sizeError, setSizeError] = useState("");

    // photos and documents (PDF, Word, Excel…); max 10 at a time
    const addFiles = (list) => {
        const all = [...list];
        const errs = [];
        const ok = [];
        let total = files.reduce((a, f) => a + f.file.size, 0);
        for (const f of all) {
            const isImg = f.type.startsWith("image/");
            if (!isImg && !DOC_EXT.includes(extOf(f.name))) { errs.push(`${f.name}: this file type can't be sent.`); continue; }
            const max = isImg ? photoMax : docMax;
            if (f.size > max) { errs.push(`${f.name} is too big (${mb(f.size)}). Max ${mb(max)} per ${isImg ? "photo" : "file"}.`); continue; }
            if (total + f.size > totalMax) { errs.push(`${f.name} wasn't added: all files together can be up to ${mb(totalMax)} per message. Send it in another message.`); continue; }
            if (files.length + ok.length >= 10) { errs.push("Up to 10 photos or files per message."); break; }
            total += f.size;
            ok.push(f);
        }
        setSizeError(errs.join("\n"));
        if (ok.length) setFiles((cur) => [...cur,
        ...ok.map((file) => (file.type.startsWith("image/")
            ? { file, kind: "image", url: URL.createObjectURL(file) }
            : { file, kind: "file", url: `doc-${file.name}-${file.size}-${Math.random()}` })),
        ]);
    };

    const send = async (override) => {
        const body_ = (override ?? text).trim();
        if (!body_ && !files.length) return;
        const total = files.reduce((a, f) => a + f.file.size, 0);
        if (total > totalMax) { setSizeError(`Too big: ${mb(total)} in this message. Max ${mb(totalMax)} – remove some files and send them separately.`); return; }
        setSizeError("");
        const tempId = `t${me}-${Date.now()}`;
        const reply = replyTo ? { id: replyTo.id, sender_id: replyTo.sender_id, sender: replyTo.sender, type: replyTo.type, body: replyTo.body, image: replyTo.image, file_name: replyTo.file_name } : null;
        const temps = [
            ...files.map((f, i) => (f.kind === "file"
                ? { id: `${tempId}-${i}`, type: "file", file_name: f.file.name, file_size: f.file.size, sender_id: me, pending: true, time: new Date().toISOString() }
                : { id: `${tempId}-${i}`, type: "image", image: f.url, sender_id: me, pending: true, time: new Date().toISOString() })),
            ...(body_ ? [{ id: tempId, type: "text", body: body_, sender_id: me, pending: true, time: new Date().toISOString(), reply }] : []),
        ];
        const sending = files;
        setChat(win.id, (cur) => cur && ({ ...cur, messages: [...cur.messages, ...temps] }));
        // text goes to the others straight away (photos / files wait for the upload)
        if (body_ && !files.length) pushLive({ id: tempId, type: "text", body: body_, reply });
        setText(""); setFiles([]); setReplyTo(null); setEmojiOpen(false);
        atBottom.current = true;
        try {
            let r;
            if (sending.length) {
                const form = new FormData();
                if (body_) form.append("body", body_);
                if (reply) form.append("reply_to_id", reply.id);
                form.append("client_id", tempId);
                sending.forEach((f) => form.append(f.kind === "file" ? "files[]" : "images[]", f.file));
                r = await apiForm(`/messenger/conversations/${win.id}/messages`, form);
            } else {
                r = await apiFetch(`/messenger/conversations/${win.id}/messages`, { method: "POST", body: JSON.stringify({ body: body_, reply_to_id: reply?.id || null, client_id: tempId }) });
            }
            setChat(win.id, (cur) => cur && ({ ...cur, messages: cur.messages.filter((m) => !String(m.id).startsWith(tempId)) }));
            receive(win.id, r.messages, { sound: false });
            loadConvs();
        } catch (e) {
            setChat(win.id, (cur) => cur && ({ ...cur, messages: cur.messages.map((m) => (String(m.id).startsWith(tempId) ? { ...m, pending: false, failed: true } : m)) }));
            // PHP refuses big uploads with a warning page (not JSON) → say it plainly
            const msg = String(e?.message || "");
            const tooBig = e?.status === 413 || /Content-Length|exceeds|too large|Unexpected token|JSON/i.test(msg);
            if (tooBig) setSizeError("Too big for the server. Send fewer or smaller files at a time.");
            notify(tooBig ? "Files too big – not sent." : msg || "Message not sent.", "error");
        } finally {
            sending.forEach((f) => f.kind === "image" && setTimeout(() => URL.revokeObjectURL(f.url), 60000));
        }
    };

    // a sticker / GIF goes out straight away (like FB), on its own
    const sendGif = (url) => sendSticker(url, "gif");
    const sendSticker = async (k, kind = "sticker") => {
        setStickerOpen(false); setGifOpen(false);
        const tempId = `t${me}-${Date.now()}`;
        const reply = replyTo ? { id: replyTo.id, sender_id: replyTo.sender_id, sender: replyTo.sender, type: replyTo.type, body: replyTo.body, image: replyTo.image, file_name: replyTo.file_name } : null;
        setChat(win.id, (cur) => cur && ({ ...cur, messages: [...cur.messages, { id: tempId, type: kind, body: k, sender_id: me, pending: true, time: new Date().toISOString(), reply }] }));
        pushLive({ id: tempId, type: kind, body: k, ...(kind === "gif" ? { image: k } : {}), reply });
        setReplyTo(null);
        atBottom.current = true;
        try {
            const r = await apiFetch(`/messenger/conversations/${win.id}/messages`, { method: "POST", body: JSON.stringify({ [kind]: k, reply_to_id: reply?.id || null, client_id: tempId }) });
            setChat(win.id, (cur) => cur && ({ ...cur, messages: cur.messages.filter((m) => m.id !== tempId) }));
            receive(win.id, r.messages, { sound: false });
            loadConvs();
        } catch (e) {
            setChat(win.id, (cur) => cur && ({ ...cur, messages: cur.messages.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)) }));
            notify(e.message || (kind === "gif" ? "GIF not sent." : "Sticker not sent."), "error");
        }
    };

    const typing = (v) => {
        setText(v);
        if (rt && v && Date.now() - lastTyping.current > 3000) {
            lastTyping.current = Date.now();
            const meRow = c?.members?.find((m) => m.me);
            // straight over the socket; through the server only if that isn't possible
            if (!liveSend(win.id, "client-typing", { employee_id: me, name: meRow?.name || "" })) {
                apiFetch(`/messenger/conversations/${win.id}/typing`, { method: "POST" }).catch(() => { });
            }
        }
    };

    const pinMsg = async (m, on) => {
        try { putPayload(await apiFetch(`/messenger/messages/${m.id}/pin`, { method: "POST", body: JSON.stringify({ pinned: on }) })); notify(on ? "Message pinned" : "Message unpinned"); }
        catch (e) { notify(e.message || "Couldn't pin the message.", "error"); }
    };
    const [pinIdx, setPinIdx] = useState(0);

    const unsend = async (m) => {
        try {
            await apiFetch(`/messenger/messages/${m.id}`, { method: "DELETE" });
            setChat(win.id, (cur) => cur && ({ ...cur, messages: cur.messages.map((x) => (x.id === m.id ? { ...x, unsent: true, body: null, image: null } : x)) }));
            loadConvs();
        } catch (e) { notify(e.message || "Couldn't unsend.", "error"); }
    };

    const react = async (m, emoji) => {
        setReactFor(null); setReactMore(null);
        // show it right away: one reaction per person, the same one again removes it
        const had = (m.reactions || []).find((x) => x.ids.includes(me));
        const remove = had?.emoji === emoji;
        const optimistic = (m.reactions || []).map((x) => ({ ...x, ids: x.ids.filter((i) => i !== me), count: x.ids.filter((i) => i !== me).length }))
            .filter((x) => x.count > 0);
        if (!remove) {
            const at = optimistic.find((x) => x.emoji === emoji);
            if (at) { at.ids = [...at.ids, me]; at.count += 1; } else optimistic.push({ emoji, count: 1, ids: [me], names: ["You"] });
        }
        setChat(win.id, (cur) => cur && ({ ...cur, messages: cur.messages.map((x) => (x.id === m.id ? { ...x, reactions: optimistic } : x)) }));
        try {
            const r = await apiFetch(`/messenger/messages/${m.id}/react`, { method: "POST", body: JSON.stringify({ emoji: remove ? null : emoji }) });
            setChat(win.id, (cur) => cur && ({ ...cur, messages: cur.messages.map((x) => (x.id === m.id ? { ...x, reactions: r.reactions } : x)) }));
        } catch (e) {
            setChat(win.id, (cur) => cur && ({ ...cur, messages: cur.messages.map((x) => (x.id === m.id ? { ...x, reactions: m.reactions } : x)) }));
            notify(e.message || "Couldn't react.", "error");
        }
    };

    const startReply = (m) => { setReplyTo(m); setTimeout(() => input.current?.focus(), 0); };

    // jump to the original message of a reply (when it's loaded)
    const flash = (el) => {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("is-flash");
        setTimeout(() => el.classList.remove("is-flash"), 1600);
    };

    // jump to a message; older ones are loaded page by page until it's there
    const jumpTo = async (id) => {
        const find = () => body.current?.querySelector(`[data-mid="${id}"]`);
        if (find()) return flash(find());
        atBottom.current = false;
        let cur = chats[win.id];
        for (let n = 0; n < 40 && cur?.hasMore && !cur.messages.some((m) => m.id === id); n++) {
            const first = cur.messages.find((m) => typeof m.id === "number")?.id;
            try {
                const r = await apiFetch(`/messenger/conversations/${win.id}?before_id=${first}`);
                cur = { ...cur, messages: [...r.messages, ...cur.messages], hasMore: r.has_more };
            } catch { break; }
        }
        if (cur && cur !== chats[win.id]) setChat(win.id, (x) => x && ({ ...x, messages: cur.messages, hasMore: cur.hasMore }));
        setTimeout(() => (find() ? flash(find()) : notify("Couldn't find that message.")), 80);
    };

    // search in this conversation
    const [searchOpen, setSearchOpen] = useState(false);
    const [sq, setSq] = useState("");
    const [hits, setHits] = useState(null);
    const searchRef = useRef(null);
    useEffect(() => {
        if (!searchOpen) { setSq(""); setHits(null); return; }
        setTimeout(() => searchRef.current?.focus(), 30);
    }, [searchOpen]);
    useEffect(() => {
        const q = sq.trim();
        if (q.length < 2) { setHits(null); return; }
        const t = setTimeout(() => {
            apiFetch(`/messenger/conversations/${win.id}/search?q=${encodeURIComponent(q)}`).then((r) => setHits(r.items)).catch(() => setHits([]));
        }, 300);
        return () => clearTimeout(t);
    }, [sq, win.id]);
    const mark = (text) => {
        const q = sq.trim();
        if (!q) return text;
        const parts = String(text).split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
        return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>));
    };
    const searchBar = searchOpen && (
        <div className="ms-csearch">
            <div className="ms-csearch-bar">
                <Svg i="search" size={16} />
                <input ref={searchRef} value={sq} onChange={(e) => setSq(e.target.value)} placeholder="Search in conversation"
                    onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setSearchOpen(false); } if (e.key === "Enter" && hits?.[0]) jumpTo(hits[0].id); }} />
                {hits && <small>{hits.length >= 50 ? "50+" : hits.length} found</small>}
                <button type="button" className="ms-icon" onClick={() => setSearchOpen(false)} aria-label="Close search"><Svg i="x" size={16} /></button>
            </div>
            {hits && (
                <div className="ms-csearch-list">
                    {hits.length === 0 && <div className="ms-empty">No messages found.</div>}
                    {hits.map((h) => (
                        <button key={h.id} type="button" onClick={() => jumpTo(h.id)}>
                            <span className="ms-csearch-top"><strong>{h.sender}</strong><small>{stamp(h.time)}</small></span>
                            <span className="ms-csearch-text">{h.type === "file" && "📎 "}{mark(h.text)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    const insertEmoji = (e) => {
        const el = input.current;
        if (!el) return setText((t) => t + e);
        const a = el.selectionStart ?? text.length, b = el.selectionEnd ?? text.length;
        const next = text.slice(0, a) + e + text.slice(b);
        setText(next);
        requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + e.length, a + e.length); });
    };

    const firstName = (n) => (n || "").split(" ")[0];
    const replyLabel = (m) => {
        const who = mine(m) ? "You" : firstName(m.sender);
        const to = m.reply.sender_id === me ? (mine(m) ? "yourself" : "you") : (m.reply.sender_id === m.sender_id ? "themself" : firstName(m.reply.sender));
        return `${who} replied to ${to}`;
    };

    // who has seen up to which message (others only)
    const seenAt = useMemo(() => {
        const map = {};
        if (!c) return map;
        const ids = msgs.filter((m) => typeof m.id === "number").map((m) => m.id);
        c.members.filter((m) => !m.me).forEach((p) => {
            const at = [...ids].reverse().find((id) => id <= p.last_read_id);
            if (at) (map[at] = map[at] || []).push(p);
        });
        return map;
    }, [c, msgs]);

    const typers = Object.values(c?.typing || {});
    const title = conv?.name || "…";
    const status = conv ? (conv.is_group ? `${c.members.length} members${c.members.some((m) => !m.me && m.online) ? " · some active" : ""}` : activeText(conv.other)) : "";

    if (win.min) {
        return (
            <button className="ms-bubble" onClick={() => toggleMin(win.id)} title={title} aria-label={`Open chat with ${title}`}>
                {conv ? <ConvAvatar c={{ ...conv, online: conv.is_group ? c.members.some((m) => !m.me && m.online) : conv.other?.online }} size={52} /> : <Avatar name="?" size={52} />}
                <span className="ms-bubble-x" onClick={(e) => { e.stopPropagation(); closeChat(win.id); }} role="button" aria-label="Close"><Svg i="x" size={12} /></span>
            </button>
        );
    }

    const leave = () => (page ? setPageChat(null) : closeChat(win.id));
    const info_ = conv && (
        <ChatInfo c={c} page={page} onBack={() => setInfo(false)} onAdd={() => setModal({ add: win.id })} putPayload={putPayload} closeChat={leave}
            onSearch={() => { if (!page) setInfo(false); setSearchOpen(true); }}
            onJump={(id) => { if (!page) setInfo(false); setTimeout(() => jumpTo(id), 60); }} onUnpin={(id) => pinMsg({ id }, false)} />
    );
    const pins = c?.pinned || [];
    const pin = pins.length ? pins[Math.min(pinIdx, pins.length - 1)] : null;
    const pinBar = pin && (
        <div className="ms-pinbar">
            <span className="ms-pinbar-ico"><Svg i="pin" size={15} /></span>
            <button type="button" className="ms-pinbar-main" title="Go to message"
                onClick={() => { jumpTo(pin.id); setPinIdx((i) => (i + 1) % pins.length); }}>
                <small>Pinned{pins.length > 1 ? ` · ${Math.min(pinIdx, pins.length - 1) + 1} of ${pins.length}` : ""}</small>
                <span>{pin.type === "image" ? "📷 " : pin.type === "file" ? "📎 " : pin.type === "sticker" ? "🧩 " : pin.type === "gif" ? "🎞️ " : ""}<b>{pin.sender.split(" ")[0]}:</b> {pin.text}</span>
            </button>
            {pins.length > 1 && <button type="button" className="ms-pinbar-all" onClick={() => setInfo(true)}>See all</button>}
        </div>
    );
    const main = (
        <>
            {pinBar}
            {searchBar}
            <div className={`ms-win-body${bgOf(conv?.background).dark ? " is-darkbg" : ""}${conv?.background ? " has-bg" : ""}`} ref={body} onScroll={onScroll}
                style={conv?.background ? { background: bgOf(conv.background).css } : undefined}>
                {!c && <div className="ms-empty">Loading…</div>}
                {c && !c.hasMore && conv && (
                    <div className="ms-intro">
                        <ConvAvatar c={conv} size={64} />
                        <strong>{title}</strong>
                        <small>{conv.is_group ? `${c.members.length} members` : "You're connected on IGB Messenger"}</small>
                    </div>
                )}
                {loadingOld && <div className="ms-empty">Loading…</div>}
                {msgs.map((m, i) => {
                    const prev = msgs[i - 1], next = msgs[i + 1];
                    const gap = !prev || (toDate(m.time) - toDate(prev.time)) > 15 * 60000;
                    if (m.type === "system") return <div key={m.id}>{gap && <div className="ms-time">{stamp(m.time)}</div>}<div className="ms-system">{m.body}</div></div>;
                    const own = mine(m);
                    const firstOfRun = gap || !prev || prev.sender_id !== m.sender_id || prev.type === "system";
                    const lastOfRun = !next || next.sender_id !== m.sender_id || next.type === "system" || (toDate(next.time) - toDate(m.time)) > 15 * 60000;
                    return (
                        <div key={m.id}>
                            {gap && <div className="ms-time">{stamp(m.time)}</div>}
                            {conv?.is_group && !own && firstOfRun && <div className="ms-sender">{m.sender?.split(" ")[0]}</div>}
                            {m.reply && !m.unsent && (
                                <div className={`ms-quote-row${own ? " is-me" : ""}`}>
                                    <span className="ms-quote-label"><Svg i="reply" size={11} /> {replyLabel(m)}</span>
                                    <button type="button" className="ms-quote" onClick={() => jumpTo(m.reply.id)}>
                                        {m.reply.unsent ? <em>Message unsent</em> : (m.reply.type === "image" || m.reply.type === "gif") ? (m.reply.image ? <img src={m.reply.image} alt="" /> : m.reply.type === "gif" ? "GIF" : "Photo") : m.reply.type === "file" ? `📎 ${m.reply.file_name || "File"}` : m.reply.type === "sticker" ? <Sticker k={m.reply.body} size={44} animate={false} /> : m.reply.body}
                                    </button>
                                </div>
                            )}
                            <div data-mid={m.id} className={`ms-row${own ? " is-me" : ""}${firstOfRun ? " is-first" : ""}${lastOfRun ? " is-last" : ""}${(m.reactions || []).length ? " has-react" : ""}`}>
                                {!own && <span className="ms-row-av">{lastOfRun && <Avatar name={m.sender} photo={m.photo} size={28} />}</span>}
                                <div className={`ms-bub-wrap${m.pinned ? " is-pinned" : ""}`}>
                                    {m.forwarded && !m.unsent && <span className="ms-fwd"><Svg i="forward" size={11} /> Forwarded</span>}
                                    {m.pinned && <span className="ms-pinned-mark" title="Pinned"><Svg i="pin" size={11} /></span>}
                                    <div className={`ms-msg${m.type === "image" && !m.unsent ? " is-img" : ""}${m.type === "sticker" && !m.unsent ? " is-sticker" : ""}${m.type === "gif" && !m.unsent ? " is-img is-gif" : ""}${m.unsent ? " is-unsent" : ""}${m.pending ? " is-pending" : ""}${m.failed ? " is-failed" : ""}${!m.unsent && /^(\p{Extended_Pictographic}|\uFE0F|\u200D|\s){1,8}$/u.test(m.body || "") && m.type === "text" ? " is-big" : ""}`} title={stamp(m.time)}>
                                        {m.unsent ? (own ? "You unsent a message" : `${firstName(m.sender)} unsent a message`)
                                            : m.type === "image" ? <img src={m.image} alt={m.file_name || "Photo"} onClick={() => setLightbox(m.image)} onLoad={keepBottom} />
                                                : m.type === "sticker" ? <Sticker k={m.body} size={page ? 140 : 112} />
                                                    : m.type === "gif" ? <img className="ms-gifmsg" src={m.body} alt="GIF" onClick={() => setLightbox(m.body)} onLoad={keepBottom} />
                                                        : m.type === "file" ? (
                                                            <a className="ms-filemsg" href={m.file || undefined} target="_blank" rel="noreferrer" download={m.file_name} onClick={(e) => !m.file && e.preventDefault()}>
                                                                <FileBadge name={m.file_name} size={38} />
                                                                <span><strong>{m.file_name}</strong><small>{fileSize(m.file_size)}{m.file ? " · Download" : ""}</small></span>
                                                            </a>
                                                        ) : <Linkify text={m.body} />}
                                    </div>
                                    {(m.reactions || []).length > 0 && (
                                        <button type="button" className="ms-reacts" onClick={() => setReactFor(reactFor === m.id ? null : m.id)}
                                            title={m.reactions.map((x) => `${x.emoji} ${x.names.join(", ")}`).join("\n")}>
                                            {m.reactions.slice(0, 3).map((x) => <span key={x.emoji}>{x.emoji}</span>)}
                                            {m.reactions.reduce((a, x) => a + x.count, 0) > 1 && <b>{m.reactions.reduce((a, x) => a + x.count, 0)}</b>}
                                        </button>
                                    )}
                                    {reactFor === m.id && (
                                        <div className="ms-react-bar" role="dialog" aria-label="React">
                                            {REACTIONS.map((e) => {
                                                const on = (m.reactions || []).some((x) => x.emoji === e && x.ids.includes(me));
                                                return <button key={e} type="button" className={on ? "is-on" : ""} onClick={() => react(m, e)} aria-label={`React ${e}`}>{e}</button>;
                                            })}
                                            <button type="button" className="ms-react-plus ms-emoji-btn" onClick={() => setReactMore(reactMore === m.id ? null : m.id)} aria-label="More emoji"><Svg i="plus" size={16} /></button>
                                        </div>
                                    )}
                                </div>
                                {!m.unsent && !m.pending && typeof m.id === "number" && (
                                    <span className="ms-actions">
                                        <button type="button" className="ms-emoji-btn" onClick={() => { setReactMore(null); setReactFor(reactFor === m.id ? null : m.id); }} title="React" aria-label="React"><Svg i="smile" size={16} /></button>
                                        <button type="button" onClick={() => startReply(m)} title="Reply" aria-label="Reply"><Svg i="reply" size={16} /></button>
                                        <MsgMenu own={own}
                                            items={[
                                                { icon: "pin", label: m.pinned ? "Unpin" : "Pin", run: () => pinMsg(m, !m.pinned) },
                                                { icon: "forward", label: "Forward", run: () => setForwardMsg(m) },
                                                m.type === "text" && { icon: "copy", label: "Copy text", run: () => navigator.clipboard?.writeText(m.body || "").then(() => notify("Copied")) },
                                                own && { icon: "trash", label: "Unsend", danger: true, run: () => unsend(m) },
                                            ].filter(Boolean)} />
                                    </span>
                                )}
                            </div>
                            {m.failed && <div className="ms-fail">Not sent</div>}
                            {seenAt[m.id] && (
                                <div className="ms-seen">
                                    {conv?.is_group || !own
                                        ? seenAt[m.id].slice(0, 6).map((p) => <Avatar key={p.id} name={p.name} photo={p.photo} size={14} />)
                                        : <span>Seen</span>}
                                </div>
                            )}
                        </div>
                    );
                })}
                {typers.length > 0 && (
                    <div className="ms-row">
                        <span className="ms-row-av" />
                        <div className="ms-msg ms-typing" aria-label={`${typers.map((t) => t.name).join(", ")} is typing`}><i /><i /><i /></div>
                    </div>
                )}
            </div>

            {sizeError && (
                <div className="ms-size-error" role="alert">
                    <span>{sizeError}</span>
                    <button type="button" onClick={() => setSizeError("")} aria-label="Dismiss"><Svg i="x" size={14} /></button>
                </div>
            )}
            {files.length > 0 && (
                <div className="ms-files">
                    {files.map((f, i) => (
                        <span key={f.url} className={`ms-file${f.kind === "file" ? " is-doc" : ""}`} title={f.file.name}>
                            {f.kind === "file"
                                ? <><FileBadge name={f.file.name} size={30} /><span className="ms-file-name">{f.file.name}</span></>
                                : <img src={f.url} alt="" />}
                            <button onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${f.file.name}`}><Svg i="x" size={12} /></button>
                        </span>
                    ))}
                    <button className="ms-file-add" onClick={() => docRef.current?.click()} aria-label="Add more"><Svg i="plus" size={18} /></button>
                </div>
            )}

            {reactMore && (
                <EmojiPicker className="is-react" onPick={(e) => { const m = msgs.find((x) => x.id === reactMore); if (m) react(m, e); }}
                    onClose={() => { setReactMore(null); setReactFor(null); }} />
            )}

            {replyTo && (
                <div className="ms-replying">
                    <div>
                        <strong>Replying to {replyTo.sender_id === me ? "yourself" : replyTo.sender}</strong>
                        <span>{replyTo.type === "image" ? "Photo" : replyTo.type === "file" ? `📎 ${replyTo.file_name}` : replyTo.type === "sticker" ? "Sticker" : replyTo.type === "gif" ? "GIF" : replyTo.body}</span>
                    </div>
                    <button type="button" className="ms-icon" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><Svg i="x" size={16} /></button>
                </div>
            )}

            <form className={`ms-win-foot${typingMode ? " is-typing" : ""}`} onSubmit={(e) => { e.preventDefault(); send(); }}>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                <input ref={docRef} type="file" accept={`image/*,${DOC_ACCEPT}`} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                {typingMode ? (
                    // typing: the tools fold into one ⊕ so the box gets the whole width (like Messenger)
                    <button type="button" className="ms-icon is-blue ms-tools-btn" onClick={() => setShowTools(true)} aria-label="Show more actions" title="More">
                        <Svg i="plusCircle" size={22} />
                    </button>
                ) : (
                    <>
                        <button type="button" className="ms-icon is-blue" onClick={() => fileRef.current?.click()} aria-label="Send photos" title="Send photos"><Svg i="image" size={20} /></button>
                        <button type="button" className="ms-icon is-blue" onClick={() => docRef.current?.click()} aria-label="Attach a file" title="Attach a file (PDF, Word, Excel…)"><Svg i="clip" size={19} /></button>
                        <span className="ms-emoji-anchor">
                            <button type="button" className={`ms-icon is-blue ms-gif-btn${gifOpen ? " is-on" : ""}`} onClick={() => { setEmojiOpen(false); setStickerOpen(false); setGifOpen(!gifOpen); }} aria-label="GIFs" title="GIFs"><Svg i="gif" size={20} /></button>
                            {gifOpen && <GifPicker className="is-input" onPick={sendGif} onClose={() => setGifOpen(false)} notify={notify} />}
                        </span>
                        <span className="ms-emoji-anchor">
                            <button type="button" className={`ms-icon is-blue ms-sticker-btn${stickerOpen ? " is-on" : ""}`} onClick={() => { setEmojiOpen(false); setGifOpen(false); setStickerOpen(!stickerOpen); }} aria-label="Stickers" title="Stickers"><Svg i="sticker" size={20} /></button>
                            {stickerOpen && <StickerPicker className="is-input" onPick={sendSticker} onClose={() => setStickerOpen(false)} />}
                        </span>
                    </>
                )}
                {/* the box, with the emoji button inside it on the right */}
                <div className="ms-input-wrap">
                    <textarea
                        ref={input}
                        rows={1}
                        value={text}
                        maxLength={5000}
                        placeholder="Aa"
                        onChange={(e) => { typing(e.target.value); if (!e.target.value) setShowTools(false); }}
                        onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                            if (e.key === "Escape" && replyTo) { e.stopPropagation(); setReplyTo(null); }
                        }}
                        aria-label="Message"
                    />
                    <span className="ms-emoji-anchor ms-emoji-in">
                        <button type="button" className={`ms-icon is-blue ms-emoji-btn${emojiOpen ? " is-on" : ""}`} onClick={() => { setStickerOpen(false); setGifOpen(false); setEmojiOpen(!emojiOpen); }} aria-label="Emoji" title="Emoji"><Svg i="smile" size={20} /></button>
                        {emojiOpen && <EmojiPicker className="is-input" onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
                    </span>
                </div>
                {text.trim() || files.length
                    ? <button type="submit" className="ms-icon is-blue" aria-label="Send"><Svg i="send" size={20} /></button>
                    : <button type="button" className="ms-icon ms-like" onClick={() => send(conv?.emoji || "👍")} aria-label={`Send ${conv?.emoji || "👍"}`}>{conv?.emoji || "👍"}</button>}
            </form>
        </>
    );
    const online_ = conv && (conv.is_group ? c.members.some((m) => !m.me && m.online) : conv.other?.online);

    if (page) {
        return (
            <section className={`ms-pchat${info ? " has-info" : ""}`} aria-label={`Chat with ${title}`}
                onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
                <div className="ms-pchat-main ms-win" style={themeStyle(conv?.theme)}>
                    <header className="ms-win-head ms-pchat-head">
                        <button className="ms-icon ms-page-back" onClick={() => setPageChat(null)} aria-label="Back to chats"><Svg i="back" size={20} /></button>
                        <span className="ms-win-who">
                            {conv && <ConvAvatar c={{ ...conv, online: online_ }} size={42} />}
                            <span className="ms-win-title"><strong>{title}</strong><small>{status}</small></span>
                        </span>
                        <button className={`ms-icon${searchOpen ? " is-on" : ""}`} onClick={() => setSearchOpen(!searchOpen)} aria-label="Search in conversation" title="Search in conversation"><Svg i="search" size={19} /></button>
                        <button className={`ms-icon${info ? " is-on" : ""}`} onClick={() => setInfo(!info)} aria-label="Chat info" title="Chat info" aria-pressed={info}><Svg i="info" size={20} /></button>
                    </header>
                    {main}
                </div>
                {info && <aside className="ms-pchat-info ms-win" style={themeStyle(conv?.theme)}>{info_}</aside>}
            </section>
        );
    }

    return (
        <section className="ms-win" aria-label={`Chat with ${title}`} style={themeStyle(conv?.theme)}
            onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            <header className="ms-win-head">
                <button className="ms-win-who" onClick={() => setInfo(!info)} title="Chat info">
                    {conv && <ConvAvatar c={{ ...conv, online: online_ }} size={34} />}
                    <span className="ms-win-title"><strong>{title}</strong><small>{status}</small></span>
                </button>
                <button className="ms-icon" onClick={() => openPage(win.id)} aria-label="Open in Messenger" title="Open in Messenger"><Svg i="expand" size={16} /></button>
                <button className="ms-icon" onClick={() => { setInfo(false); setSearchOpen(!searchOpen); }} aria-label="Search in conversation" title="Search in conversation"><Svg i="search" size={17} /></button>
                <button className="ms-icon" onClick={() => setInfo(!info)} aria-label="Chat info" title="Chat info"><Svg i="info" size={18} /></button>
                <button className="ms-icon" onClick={() => toggleMin(win.id)} aria-label="Minimize" title="Minimize"><Svg i="minus" size={18} /></button>
                <button className="ms-icon" onClick={() => closeChat(win.id)} aria-label="Close" title="Close"><Svg i="x" size={18} /></button>
            </header>
            {info && conv ? info_ : main}
        </section>
    );
}

/* ================= full page: /messenger and /messenger/:id ================= */

export function MessengerPage() {
    const { user } = useAuth();
    const ms = useShared();
    const { id } = useParams();                      // old links /messenger/4 still work → moved to /messenger
    const navigate = useNavigate();
    const ready = !!ms;
    const cid = ms?.pageChat || null;

    useEffect(() => {
        if (!ready || !id) return;
        ms.openPage(Number(id));
        navigate("/messenger", { replace: true });
    }, [id, ready]); // eslint-disable-line react-hooks/exhaustive-deps

    // open chat missing (removed from the group / deleted) → back to the list
    useEffect(() => {
        if (!ready || !cid || ms.chats[cid]) return;
        ms.loadChat(cid).then((ok) => { if (!ok) ms.setPageChat(null); });
    }, [cid, ready]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!EMPLOYEE_TYPES.includes(user?.type)) return <div className="ms-page-msg">Messenger is for employees only.</div>;
    if (!ms) return <div className="ms-page-msg">Loading Messenger…</div>;

    return (
        <Ctx.Provider value={ms}>
            <div className={`ms-page${cid ? " has-chat" : ""}`}>
                <aside className="ms-page-side ms-list">
                    <ChatList page selected={cid} onPick={(i) => ms.openPage(i)} />
                </aside>
                <main className="ms-page-main">
                    {cid ? <ChatWindow key={cid} page win={{ id: cid, min: false, focus: cid }} /> : (
                        <div className="ms-page-pick ms-win">
                            <span className="ms-page-icon"><Svg i="chat" size={44} /></span>
                            <h3>Your messages</h3>
                            <p>Pick a chat on the left, or start a new one.</p>
                            <div className="ms-page-btns">
                                <button className="ms-btn is-primary" onClick={() => ms.setModal("message")}><Svg i="compose" size={16} /> New message</button>
                                <button className="ms-btn" onClick={() => ms.setModal("group")}><Svg i="group" size={16} /> New group</button>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </Ctx.Provider>
    );
}

/* ================= chat info (members, rename, add, leave) ================= */

function Section({ title, children, open: start = false }) {
    const [open, setOpen] = useState(start);
    return (
        <section className={`ms-sec${open ? " is-open" : ""}`}>
            <button className="ms-sec-head" onClick={() => setOpen(!open)} aria-expanded={open}>
                <span>{title}</span><Svg i="down" size={18} />
            </button>
            {open && <div className="ms-sec-body">{children}</div>}
        </section>
    );
}

// Media / Files / Links shared in this chat
function SharedTabs({ conversationId, refreshKey }) {
    const { setLightbox, notify } = useMs();
    const [kind, setKind] = useState("media");
    const [data, setData] = useState({});           // kind → { items, next, more }
    const [loading, setLoading] = useState(false);

    const load = useCallback(async (k, before = null) => {
        setLoading(true);
        try {
            const r = await apiFetch(`/messenger/conversations/${conversationId}/shared?kind=${k}${before ? `&before_id=${before}` : ""}`);
            setData((d) => ({ ...d, [k]: { items: before ? [...(d[k]?.items || []), ...r.items] : r.items, next: r.next_before, more: r.has_more } }));
        } catch (e) { notify(e.message || "Couldn't load.", "error"); }
        setLoading(false);
    }, [conversationId, notify]);

    useEffect(() => { load(kind); }, [kind, load, refreshKey]);
    const cur = data[kind];

    return (
        <div className="ms-shared">
            <div className="ms-shared-tabs" role="tablist">
                {[["media", "Media"], ["files", "Files"], ["links", "Links"]].map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>{l}</button>
                ))}
            </div>
            {!cur && <div className="ms-empty">Loading…</div>}
            {cur && cur.items.length === 0 && <div className="ms-empty">{kind === "media" ? "No photos yet." : kind === "files" ? "No files yet." : "No links yet."}</div>}
            {cur && kind === "media" && cur.items.length > 0 && (
                <div className="ms-media-grid">
                    {cur.items.map((x) => (
                        <button key={x.message_id} onClick={() => setLightbox(x.url)} title={`${x.sender} · ${stamp(x.time)}`}>
                            <img src={x.url} alt={x.name || "Photo"} loading="lazy" />
                        </button>
                    ))}
                </div>
            )}
            {cur && kind === "files" && cur.items.map((x) => (
                <a key={x.message_id} className="ms-shared-row" href={x.url} target="_blank" rel="noreferrer" download={x.name}>
                    <FileBadge name={x.name} size={36} />
                    <span className="ms-shared-body"><strong>{x.name}</strong><small>{[fileSize(x.size), x.sender, ago(x.time)].filter(Boolean).join(" · ")}</small></span>
                    <Svg i="download" size={17} />
                </a>
            ))}
            {cur && kind === "links" && cur.items.map((x, i) => (
                <a key={`${x.message_id}-${i}`} className="ms-shared-row" href={x.url} target="_blank" rel="noreferrer">
                    <span className="ms-linkbadge"><Svg i="link" size={17} /></span>
                    <span className="ms-shared-body"><strong>{x.host}</strong><small>{x.url}</small></span>
                </a>
            ))}
            {cur?.more && <button className="ms-btn ms-more" disabled={loading} onClick={() => load(kind, cur.next)}>{loading ? "Loading…" : "See more"}</button>}
        </div>
    );
}

// "…" menu on a member (like FB): message, admin, remove
function MemberMenu({ p, canManage, busy, onAdmin, onRemove, onMessage }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
        const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey, true);
        return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true); };
    }, [open]);
    const pick = (fn) => { setOpen(false); fn(); };
    return (
        <span className="ms-mmenu" ref={ref}>
            <button className={`ms-mmenu-btn${open ? " is-on" : ""}`} onClick={() => setOpen(!open)} aria-label={`Options for ${p.name}`} aria-expanded={open} disabled={busy}>
                <Svg i="more" size={18} />
            </button>
            {open && (
                <div className="ms-mmenu-pop" role="menu">
                    <button role="menuitem" onClick={() => pick(onMessage)}><Svg i="chat" size={16} /> Message</button>
                    {canManage && (
                        <button role="menuitem" onClick={() => pick(onAdmin)}><Svg i="group" size={16} /> {p.is_admin ? "Remove as admin" : "Make admin"}</button>
                    )}
                    {canManage && (
                        <button role="menuitem" className="is-red" onClick={() => pick(onRemove)}><Svg i="logout" size={16} /> Remove from group</button>
                    )}
                </div>
            )}
        </span>
    );
}

function ChatInfo({ c, onBack, onAdd, putPayload, closeChat, onSearch, onJump, onUnpin, page = false }) {
    const { notify, loadConvs, convs, togglePin, openDirect } = useMs();
    const [emojiOpen, setEmojiOpen] = useState(false);
    const conv = c.conversation;
    const pinned = !!(convs || []).find((x) => x.id === conv.id)?.pinned;
    useEffect(() => { if (convs === null) loadConvs(); }, [convs, loadConvs]);
    const [name, setName] = useState(conv.has_name ? conv.name : "");
    const [busy, setBusy] = useState(false);
    // new photo / file in the chat → refresh Media & Files
    const sharedKey = useMemo(() => c.messages.filter((m) => (m.type === "image" || m.type === "file" || /https?:\/\//.test(m.body || "")) && typeof m.id === "number").map((m) => m.id).join(","), [c.messages]);

    const run = async (fn) => {
        setBusy(true);
        try { await fn(); } catch (e) { notify(e.message || "Something went wrong.", "error"); }
        setBusy(false);
    };
    const rename = () => run(async () => { putPayload(await apiFetch(`/messenger/conversations/${conv.id}`, { method: "PUT", body: JSON.stringify({ name }) })); loadConvs(); notify("Group name saved"); });
    const remove = (p) => run(async () => {
        const r = await apiFetch(`/messenger/conversations/${conv.id}/members/${p.id}`, { method: "DELETE" });
        if (r.left) { closeChat(); loadConvs(); notify("You left the group"); } else putPayload(r);
    });
    const admin = (p, on) => run(async () => putPayload(await apiFetch(`/messenger/conversations/${conv.id}/members/${p.id}/admin`, { method: "PUT", body: JSON.stringify({ is_admin: on }) })));
    const meRow = c.members.find((m) => m.me);
    const admins = c.members.filter((m) => m.is_admin);
    const customize = (body) => run(async () => { putPayload(await apiFetch(`/messenger/conversations/${conv.id}/customize`, { method: "PUT", body: JSON.stringify(body) })); });

    return (
        <div className="ms-info">
            {page
                ? <button className="ms-info-back ms-info-close" onClick={onBack}><Svg i="x" size={16} /> Close</button>
                : <button className="ms-info-back" onClick={onBack}><Svg i="back" size={18} /> Back to chat</button>}
            <div className="ms-intro">
                <ConvAvatar c={conv} size={72} />
                <strong>{conv.name}</strong>
                <small>{conv.is_group ? `${c.members.length} members` : activeText(conv.other)}</small>
            </div>

            <div className="ms-quick">
                <button className={pinned ? "is-on" : ""} onClick={() => togglePin(conv.id, !pinned)}>
                    <span><Svg i="pin" size={18} /></span>{pinned ? "Unpin" : "Pin"}
                </button>
                {conv.is_group && (
                    <button onClick={onAdd}><span><Svg i="plus" size={18} /></span>Add</button>
                )}
                <button onClick={onSearch}><span><Svg i="search" size={18} /></span>Search</button>
            </div>

            {conv.is_group && (
                <Section title="Chat info">
                    <div className="ms-kv"><span>Admins</span><strong>{admins.map((a) => a.name.split(" ")[0]).join(", ") || "—"}</strong></div>
                    <div className="ms-kv"><span>Members</span><strong>{c.members.length}</strong></div>
                </Section>
            )}

            <Section title="Customize chat">
                {conv.is_group && (
                    <label className="ms-field">
                        <span>Group name</span>
                        <div className="ms-field-row">
                            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Name this group" />
                            <button className="ms-btn" disabled={busy || name === (conv.has_name ? conv.name : "")} onClick={rename}>Save</button>
                        </div>
                    </label>
                )}
                <div className="ms-field"><span>Theme</span></div>
                <div className="ms-themes" role="radiogroup" aria-label="Chat theme">
                    {Object.entries(THEMES).map(([k, t]) => {
                        const on = (conv.theme || "default") === k;
                        return (
                            <button key={k} role="radio" aria-checked={on} className={on ? "is-on" : ""} disabled={busy}
                                onClick={() => !on && customize({ theme: k })} title={t.name}>
                                <span style={{ background: t.mine }} />
                                <small>{t.name}</small>
                            </button>
                        );
                    })}
                </div>
                <div className="ms-field"><span>Background</span></div>
                <div className="ms-bgs" role="radiogroup" aria-label="Chat background">
                    {Object.entries(BACKGROUNDS).map(([k, b]) => {
                        const on = (conv.background || "none") === k;
                        return (
                            <button key={k} role="radio" aria-checked={on} className={on ? "is-on" : ""} disabled={busy}
                                onClick={() => !on && customize({ background: k })} title={b.name}>
                                <span style={{ background: b.css || "var(--ms-bg)" }}>{k === "none" && <Svg i="x" size={14} />}</span>
                                <small>{b.name}</small>
                            </button>
                        );
                    })}
                </div>
                <div className="ms-emoji-row">
                    <span className="ms-field"><span>Quick reaction</span></span>
                    <span className="ms-emoji-anchor ms-emoji-cur">
                        <button className="ms-btn ms-emoji-btn" onClick={() => setEmojiOpen(!emojiOpen)} disabled={busy}>
                            <b>{conv.emoji || "👍"}</b> Change
                        </button>
                        {emojiOpen && <EmojiPicker className="is-info" onPick={(e) => { setEmojiOpen(false); customize({ emoji: e }); }} onClose={() => setEmojiOpen(false)} />}
                    </span>
                </div>
            </Section>

            {conv.is_group && (
                <Section title={`Chat members (${c.members.length})`} open>
                    <ul className="ms-members">
                        {c.members.map((p) => (
                            <li key={p.id}>
                                <Avatar name={p.name} photo={p.photo} size={36} online={p.online} />
                                <span className="ms-member-body">
                                    <strong>{p.name}{p.me && " (You)"}</strong>
                                    <small>{[p.is_admin && "Admin", activeText(p)].filter(Boolean).join(" · ")}</small>
                                </span>
                                {!p.me && (
                                    <MemberMenu p={p} busy={busy} canManage={!!meRow?.is_admin}
                                        onMessage={() => openDirect(p.id)} onAdmin={() => admin(p, !p.is_admin)} onRemove={() => remove(p)} />
                                )}
                            </li>
                        ))}
                    </ul>
                    <button className="ms-btn ms-add-row" onClick={onAdd}><Svg i="plus" size={16} /> Add people</button>
                </Section>
            )}

            {(c.pinned || []).length > 0 && (
                <Section title={`Pinned messages (${c.pinned.length})`} open>
                    {c.pinned.map((p) => (
                        <div key={p.id} className="ms-pinned-row">
                            <button type="button" className="ms-pinned-open" onClick={() => onJump(p.id)} title="Go to message">
                                {p.type === "sticker" && p.sticker ? <Sticker k={p.sticker} size={36} animate={false} /> : (p.type === "image" || p.type === "gif") && p.image ? <img src={p.image} alt="" /> : p.type === "file" ? <FileBadge name={p.text} size={34} /> : <span className="ms-linkbadge"><Svg i="pin" size={15} /></span>}
                                <span className="ms-shared-body">
                                    <strong>{p.sender}</strong>
                                    <small className="ms-pinned-text">{p.text}</small>
                                    <small>Pinned by {p.pinned_by.split(" ")[0]} · {ago(p.pinned_at)}</small>
                                </span>
                            </button>
                            <button type="button" className="ms-icon" onClick={() => onUnpin(p.id)} title="Unpin" aria-label="Unpin message"><Svg i="x" size={15} /></button>
                        </div>
                    ))}
                </Section>
            )}

            <Section title="Media, files and links" open>
                <SharedTabs conversationId={conv.id} refreshKey={sharedKey} />
            </Section>

            {conv.is_group && (
                <Section title="Privacy & support">
                    <button className="ms-btn is-red ms-leave" disabled={busy} onClick={() => remove(meRow)}><Svg i="logout" size={16} /> Leave group</button>
                </Section>
            )}
        </div>
    );
}

/* ================= "…" menu on a message: pin, forward, copy, unsend ================= */

function MsgMenu({ items, own }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);                 // { left, top, vars }
    const ref = useRef(null);
    const popRef = useRef(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => !ref.current?.contains(e.target) && !popRef.current?.contains(e.target) && setOpen(false);
        const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
        const onScroll = (e) => !popRef.current?.contains(e.target) && setOpen(false);   // the chat scrolled → close
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onScroll);
        return () => {
            document.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onScroll);
        };
    }, [open]);

    // the menu is drawn on top of everything (not inside the chat window, which cut it off):
    // above the ⋯ button when there is room, else below; always kept inside the screen
    useLayoutEffect(() => {
        if (!open) { setPos(null); return; }
        const btn = ref.current?.querySelector("button");
        const pop = popRef.current;
        if (!btn || !pop) return;
        const r = btn.getBoundingClientRect();
        const w = pop.offsetWidth, h = pop.offsetHeight, gap = 4, pad = 8;
        let left = own ? r.right - w : r.left;
        left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
        let top = r.top - h - gap;
        if (top < pad) top = Math.min(r.bottom + gap, window.innerHeight - h - pad);
        // keep the chat's colours (theme / dark mode) on the menu
        const cs = getComputedStyle(btn);
        const vars = Object.fromEntries(["--ms-bg", "--ms-text", "--ms-hover", "--ms-muted", "--ms-shadow"].map((k) => [k, cs.getPropertyValue(k)]).filter(([, v]) => v));
        setPos({ left, top, vars });
    }, [open, own]);

    return (
        <span className={`ms-msgmenu${open ? " is-open" : ""}`} ref={ref}>
            <button type="button" className={open ? "is-on" : ""} onClick={() => setOpen(!open)} title="More" aria-label="More" aria-expanded={open}><Svg i="more" size={16} /></button>
            {open && createPortal(
                <div ref={popRef} className="ms-mmenu-pop ms-msgmenu-float" role="menu"
                    style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden", ...(pos?.vars || {}) }}>
                    {items.map((it) => (
                        <button key={it.label} role="menuitem" className={it.danger ? "is-red" : ""} onClick={() => { setOpen(false); it.run(); }}>
                            <Svg i={it.icon} size={16} /> {it.label}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </span>
    );
}

/* ================= forward: pick chats / people, each with its own Send ================= */

function ForwardModal({ msg, onClose }) {
    const { convs, loadConvs, receive, notify } = useMs();
    const [people, setPeople] = useState(null);
    const [q, setQ] = useState("");
    const [sent, setSent] = useState({});                 // "c12" / "p5" → "sending" | "sent"

    useEffect(() => { if (convs === null) loadConvs(); }, [convs, loadConvs]);
    useEffect(() => { apiFetch("/messenger/people").then(setPeople).catch(() => setPeople([])); }, []);
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const term = q.trim().toLowerCase();
    const chatsList = (convs || []).filter((c) => !term || c.name.toLowerCase().includes(term));
    const directIds = new Set((convs || []).filter((c) => !c.is_group).map((c) => c.other?.id));
    const peopleList = (people || []).filter((p) => !directIds.has(p.id) && (!term || p.name.toLowerCase().includes(term)));

    const send = async (key, body) => {
        setSent((s) => ({ ...s, [key]: "sending" }));
        try {
            const r = await apiFetch(`/messenger/messages/${msg.id}/forward`, { method: "POST", body: JSON.stringify(body) });
            setSent((s) => ({ ...s, [key]: "sent" }));
            receive(r.conversation_id, r.messages, { sound: false });   // shows in that chat if it's open
            loadConvs();
        } catch (e) {
            setSent((s) => ({ ...s, [key]: undefined }));
            notify(e.message || "Couldn't forward.", "error");
        }
    };
    const btn = (key, body) => (
        <button className={`ms-btn ms-send-btn${sent[key] === "sent" ? " is-sent" : " is-primary"}`} disabled={!!sent[key]} onClick={() => send(key, body)}>
            {sent[key] === "sent" ? "Sent" : sent[key] === "sending" ? "Sending…" : "Send"}
        </button>
    );
    const preview = msg.type === "image" ? "📷 Photo" : msg.type === "file" ? `📎 ${msg.file_name}` : msg.type === "sticker" ? "Sticker" : msg.type === "gif" ? "GIF" : msg.body;

    return (
        <div className="ms-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="ms-modal" role="dialog" aria-label="Forward">
                <header><h3>Forward</h3><button className="ms-icon" onClick={onClose} aria-label="Close"><Svg i="x" size={18} /></button></header>
                <div className="ms-fwd-preview">{msg.type === "image" && msg.image ? <img src={msg.image} alt="" /> : msg.type === "gif" ? <img src={msg.body} alt="" /> : msg.type === "sticker" ? <Sticker k={msg.body} size={44} animate={false} /> : null}<span>{preview}</span></div>
                <label className="ms-search">
                    <Svg i="search" size={16} />
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for people and groups" />
                </label>
                <div className="ms-pick">
                    {(convs === null || people === null) && <div className="ms-empty">Loading…</div>}
                    {chatsList.length > 0 && <div className="ms-sub">Recent chats</div>}
                    {chatsList.map((c) => (
                        <div key={`c${c.id}`} className="ms-pick-row">
                            <ConvAvatar c={c} size={40} />
                            <span className="ms-conv-body"><span className="ms-conv-name">{c.name}</span><span className="ms-conv-last">{c.is_group ? `${c.members} members` : activeText(c.other)}</span></span>
                            {btn(`c${c.id}`, { conversation_id: c.id })}
                        </div>
                    ))}
                    {peopleList.length > 0 && <div className="ms-sub">People</div>}
                    {peopleList.map((p) => (
                        <div key={`p${p.id}`} className="ms-pick-row">
                            <Avatar name={p.name} photo={p.photo} size={40} online={p.online} />
                            <span className="ms-conv-body"><span className="ms-conv-name">{p.name}</span><span className="ms-conv-last">{p.role || activeText(p)}</span></span>
                            {btn(`p${p.id}`, { employee_id: p.id })}
                        </div>
                    ))}
                    {convs && people && chatsList.length === 0 && peopleList.length === 0 && <div className="ms-empty">No results.</div>}
                </div>
                <footer><button className="ms-btn" onClick={onClose}>Done</button></footer>
            </div>
        </div>
    );
}

/* ================= people picker: new message / new group / add people ================= */

function PeopleModal({ mode, onClose }) {
    const { openDirect, openChat, putPayload, loadConvs, notify, chats } = useMs();
    const adding = typeof mode === "object" ? mode.add : null;
    const isGroup = mode === "group";
    const [people, setPeople] = useState(null);
    const [q, setQ] = useState("");
    const [picked, setPicked] = useState([]);
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const already = useMemo(() => new Set(adding ? (chats[adding]?.members || []).map((m) => m.id) : []), [adding, chats]);

    useEffect(() => { apiFetch("/messenger/people").then(setPeople).catch((e) => notify(e.message || "Couldn't load people.", "error")); }, [notify]);
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const term = q.trim().toLowerCase();
    const list = (people || []).filter((p) => !already.has(p.id) && (!term || p.name.toLowerCase().includes(term) || (p.role || "").toLowerCase().includes(term)));
    const toggle = (p) => setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p]));

    const pick = (p) => (mode === "message" ? (onClose(), openDirect(p.id)) : toggle(p));

    const submit = async () => {
        setBusy(true);
        try {
            if (adding) {
                putPayload(await apiFetch(`/messenger/conversations/${adding}/members`, { method: "POST", body: JSON.stringify({ employee_ids: picked.map((p) => p.id) }) }));
            } else {
                const id = putPayload(await apiFetch("/messenger/groups", { method: "POST", body: JSON.stringify({ name, member_ids: picked.map((p) => p.id) }) }));
                openChat(id);
            }
            loadConvs();
            onClose();
        } catch (e) { notify(e.message || "Something went wrong.", "error"); setBusy(false); }
    };

    const title = adding ? "Add people" : isGroup ? "New group" : "New message";
    return (
        <div className="ms-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="ms-modal" role="dialog" aria-label={title}>
                <header><h3>{title}</h3><button className="ms-icon" onClick={onClose} aria-label="Close"><Svg i="x" size={18} /></button></header>
                {isGroup && (
                    <input className="ms-modal-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Group name (optional)" />
                )}
                <label className="ms-search">
                    <Svg i="search" size={16} />
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employees" />
                </label>
                {picked.length > 0 && (
                    <div className="ms-chips">
                        {picked.map((p) => <button key={p.id} onClick={() => toggle(p)}>{p.name.split(" ")[0]} <Svg i="x" size={12} /></button>)}
                    </div>
                )}
                <div className="ms-pick">
                    {people === null && <div className="ms-empty">Loading…</div>}
                    {people && list.length === 0 && <div className="ms-empty">No employees found.</div>}
                    {list.map((p) => {
                        const on = picked.some((x) => x.id === p.id);
                        return (
                            <button key={p.id} className={`ms-pick-row${on ? " is-on" : ""}`} onClick={() => pick(p)}>
                                <Avatar name={p.name} photo={p.photo} size={40} online={p.online} />
                                <span className="ms-conv-body"><span className="ms-conv-name">{p.name}</span><span className="ms-conv-last">{[p.role, activeText(p)].filter(Boolean).join(" · ")}</span></span>
                                {mode !== "message" && <span className={`ms-check${on ? " is-on" : ""}`} aria-hidden="true" />}
                            </button>
                        );
                    })}
                </div>
                {mode !== "message" && (
                    <footer>
                        <button className="ms-btn is-primary" disabled={busy || (adding ? picked.length < 1 : picked.length < 2)} onClick={submit}>
                            {busy ? "Saving…" : adding ? `Add ${picked.length || ""}`.trim() : `Create group${picked.length ? ` (${picked.length + 1})` : ""}`}
                        </button>
                        {!adding && picked.length < 2 && <small>Pick at least 2 people.</small>}
                    </footer>
                )}
            </div>
        </div>
    );
}