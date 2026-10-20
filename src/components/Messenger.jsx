// Messenger – like FB Messenger, for employees (Staff + ClientStaff logins = the same employee).
//   header button (unread badge) → chat list (online people, search, new message, new group)
//   chats open as windows docked at the bottom right (max 3) – text, photos, seen, typing, unsend, groups
//   full page: <MessengerPage /> on /messenger (list · chat · info), shares the same live data.
//   The open chat is kept in memory (not in the URL), so the app's tab bar shows ONE "Messenger" tab.
// Real time: Pusher (private-emp.<employee id>) when the server has the keys, else polling.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Pusher from "pusher-js";
import { useAuth, apiFetch, apiForm } from "../context/AuthContext";
import { useToast } from "./Toast";
import "./Messenger.css";

const EMPLOYEE_TYPES = ["Staff", "ClientStaff"];
const MAX_WINDOWS = 3;
const HEARTBEAT_MS = 20000;   // online status + badge
const POLL_MS = 4000;         // only when Pusher is not set up

/* ---------------- small helpers ---------------- */

const toDate = (t) => (t ? new Date(String(t).replace(" ", "T")) : null);
function ago(t) {
    const d = toDate(t);
    if (!d || isNaN(d)) return "";
    const s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return "now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 7 * 86400) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
const activeText = (p) => (p?.online ? "Active now" : p?.last_seen ? `Active ${ago(p.last_seen)} ago`.replace("now ago", "just now") : "");
function stamp(t) {
    const d = toDate(t);
    if (!d || isNaN(d)) return "";
    const today = new Date().toDateString() === d.toDateString();
    return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
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
    chat: <path d="M12 3C6.8 3 3 6.7 3 11.3c0 2.5 1.1 4.7 3 6.2V21l3.2-1.8c.9.3 1.8.4 2.8.4 5.2 0 9-3.7 9-8.3S17.2 3 12 3zm1 11-2.3-2.4L6.5 14l4.6-4.9 2.3 2.4 4.2-2.4L13 14z" fill="currentColor" stroke="none" />,
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
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.6" /></>,
    reply: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
    clip: <path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
    down: <path d="M6 9l6 6 6-6" />,
    download: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
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
    const [convs, setConvs] = useState(null);            // chat list (loaded on first open)
    const [chats, setChats] = useState({});              // id → { conversation, members, messages, hasMore, typing }
    const [wins, setWins] = useState([]);                // [{ id, min }]
    const [listOpen, setListOpen] = useState(false);
    const [modal, setModal] = useState(null);            // "message" | "group" | { add: conversationId }
    const [lightbox, setLightbox] = useState(null);
    const chatsRef = useRef(chats); chatsRef.current = chats;
    const winsRef = useRef(wins); winsRef.current = wins;
    const meRef = useRef(me); meRef.current = me;
    const pusherCfg = useRef(null);

    /* ---------- summary: badge + online + heartbeat ---------- */
    const loadSummary = useCallback(async () => {
        try {
            const r = await apiFetch("/messenger/summary");
            setMe(r.me); setUnread(r.unread || 0); setOnline(r.online || []);
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
        setChat(id, (cur) => ({ typing: {}, ...cur, conversation: r.conversation, members: r.members, messages: r.messages, hasMore: r.has_more }));
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
    const receive = useCallback((cid, msgs, { sound = true } = {}) => {
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
            loadSummary(); loadConvs();
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
            const ch = pusher.subscribe(`private-emp.${r.me}`);
            ch.bind("pusher:subscription_succeeded", () => setRt(true));
            ch.bind("pusher:subscription_error", () => setRt(false));
            pusher.connection.bind("state_change", ({ current }) => setRt(current === "connected"));
            ch.bind("message", (d) => receive(d.conversation_id, d.messages));
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
        return () => { alive = false; clearInterval(beat); pusher?.disconnect(); };
    }, [loadSummary, receive, setChat, loadChat, loadConvs]);

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
                        ...cur, conversation: r.conversation, members: r.members,
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
        openDirect, putPayload, receive, setModal, setLightbox, setListOpen, notify, togglePin, onPage, pageChat, setPageChat, openPage, navigate,
    }), [me, unread, online, rt, convs, chats, wins, setChat, loadConvs, loadChat, loadSummary, openChat, openDirect, putPayload, receive, notify, togglePin, onPage, pageChat, openPage, navigate]);

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

function ChatList({ onPick, selected = null, page = false }) {
    const { convs, loadConvs, openDirect, setModal, togglePin } = useMs();
    const [q, setQ] = useState("");
    const [people, setPeople] = useState([]);

    useEffect(() => {
        loadConvs();
        apiFetch("/messenger/people").then(setPeople).catch(() => { });
    }, [loadConvs]);

    const term = q.trim().toLowerCase();
    const shown = (convs || []).filter((c) => !term || c.name.toLowerCase().includes(term));
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

            {!term && activeNow.length > 0 && (
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
                    <div className="ms-empty">{term ? "No results." : "No chats yet. Start one with the pencil button."}</div>
                )}
                {shown.map((c) => (
                    <div key={c.id} role="button" tabIndex={0} aria-current={selected === c.id ? "true" : undefined}
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
                    </div>
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
    const { me, rt, chats, setChat, closeChat, toggleMin, loadSummary, loadConvs, receive, setLightbox, notify, setModal, putPayload, setPageChat, openPage } = useMs();
    const c = chats[win.id];
    const body = useRef(null);
    const input = useRef(null);
    const fileRef = useRef(null);
    const docRef = useRef(null);
    const [text, setText] = useState("");
    const [files, setFiles] = useState([]);              // [{ file, url }]
    const [info, setInfo] = useState(() => page && window.innerWidth >= 1280);   // page: info panel open on wide screens
    const [loadingOld, setLoadingOld] = useState(false);
    const [replyTo, setReplyTo] = useState(null);        // message being replied to
    const [emojiOpen, setEmojiOpen] = useState(false);   // emoji picker for the text box
    const [reactFor, setReactFor] = useState(null);      // message id with the reaction bar open
    const [reactMore, setReactMore] = useState(null);    // message id with the full emoji list (react)
    const lastTyping = useRef(0);
    const atBottom = useRef(true);

    const conv = c?.conversation;
    const msgs = c?.messages || [];
    const lastId = msgs.filter((m) => typeof m.id === "number").slice(-1)[0]?.id || 0;
    const mine = (m) => m.sender_id === me;

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

    // photos (≤ 10 MB) and documents (PDF, Word, Excel… ≤ 20 MB); max 10 at a time
    const addFiles = (list) => {
        const all = [...list];
        const imgs = all.filter((f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024);
        const docs = all.filter((f) => !f.type.startsWith("image/") && DOC_EXT.includes(extOf(f.name)) && f.size <= 20 * 1024 * 1024);
        const skipped = all.length - imgs.length - docs.length;
        if (skipped) notify(`${skipped} file(s) skipped: photos up to 10 MB; PDF, Word, Excel, CSV, PowerPoint, TXT or ZIP up to 20 MB.`, "error");
        setFiles((cur) => [...cur,
        ...imgs.map((file) => ({ file, kind: "image", url: URL.createObjectURL(file) })),
        ...docs.map((file) => ({ file, kind: "file", url: `doc-${file.name}-${file.size}-${Math.random()}` })),
        ].slice(0, 10));
    };

    const send = async (override) => {
        const body_ = (override ?? text).trim();
        if (!body_ && !files.length) return;
        const tempId = `t${Date.now()}`;
        const reply = replyTo ? { id: replyTo.id, sender_id: replyTo.sender_id, sender: replyTo.sender, type: replyTo.type, body: replyTo.body, image: replyTo.image, file_name: replyTo.file_name } : null;
        const temps = [
            ...files.map((f, i) => (f.kind === "file"
                ? { id: `${tempId}-${i}`, type: "file", file_name: f.file.name, file_size: f.file.size, sender_id: me, pending: true, time: new Date().toISOString() }
                : { id: `${tempId}-${i}`, type: "image", image: f.url, sender_id: me, pending: true, time: new Date().toISOString() })),
            ...(body_ ? [{ id: tempId, type: "text", body: body_, sender_id: me, pending: true, time: new Date().toISOString(), reply }] : []),
        ];
        const sending = files;
        setChat(win.id, (cur) => cur && ({ ...cur, messages: [...cur.messages, ...temps] }));
        setText(""); setFiles([]); setReplyTo(null); setEmojiOpen(false);
        atBottom.current = true;
        try {
            let r;
            if (sending.length) {
                const form = new FormData();
                if (body_) form.append("body", body_);
                if (reply) form.append("reply_to_id", reply.id);
                sending.forEach((f) => form.append(f.kind === "file" ? "files[]" : "images[]", f.file));
                r = await apiForm(`/messenger/conversations/${win.id}/messages`, form);
            } else {
                r = await apiFetch(`/messenger/conversations/${win.id}/messages`, { method: "POST", body: JSON.stringify({ body: body_, reply_to_id: reply?.id || null }) });
            }
            setChat(win.id, (cur) => cur && ({ ...cur, messages: cur.messages.filter((m) => !String(m.id).startsWith(tempId)) }));
            receive(win.id, r.messages, { sound: false });
            loadConvs();
        } catch (e) {
            setChat(win.id, (cur) => cur && ({ ...cur, messages: cur.messages.map((m) => (String(m.id).startsWith(tempId) ? { ...m, pending: false, failed: true } : m)) }));
            notify(e.message || "Message not sent.", "error");
        } finally {
            sending.forEach((f) => f.kind === "image" && setTimeout(() => URL.revokeObjectURL(f.url), 60000));
        }
    };

    const typing = (v) => {
        setText(v);
        if (rt && v && Date.now() - lastTyping.current > 3000) {
            lastTyping.current = Date.now();
            apiFetch(`/messenger/conversations/${win.id}/typing`, { method: "POST" }).catch(() => { });
        }
    };

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
    const jumpTo = (id) => {
        const el = body.current?.querySelector(`[data-mid="${id}"]`);
        if (!el) return notify("That message is further up. Scroll up to load it.");
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("is-flash");
        setTimeout(() => el.classList.remove("is-flash"), 1400);
    };

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
        <ChatInfo c={c} page={page} onBack={() => setInfo(false)} onAdd={() => setModal({ add: win.id })} putPayload={putPayload} closeChat={leave} />
    );
    const main = (
        <>
            <div className="ms-win-body" ref={body} onScroll={onScroll}>
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
                                        {m.reply.unsent ? <em>Message unsent</em> : m.reply.type === "image" ? (m.reply.image ? <img src={m.reply.image} alt="" /> : "Photo") : m.reply.type === "file" ? `📎 ${m.reply.file_name || "File"}` : m.reply.body}
                                    </button>
                                </div>
                            )}
                            <div data-mid={m.id} className={`ms-row${own ? " is-me" : ""}${firstOfRun ? " is-first" : ""}${lastOfRun ? " is-last" : ""}${(m.reactions || []).length ? " has-react" : ""}`}>
                                {!own && <span className="ms-row-av">{lastOfRun && <Avatar name={m.sender} photo={m.photo} size={28} />}</span>}
                                <div className="ms-bub-wrap">
                                    <div className={`ms-msg${m.type === "image" && !m.unsent ? " is-img" : ""}${m.unsent ? " is-unsent" : ""}${m.pending ? " is-pending" : ""}${m.failed ? " is-failed" : ""}${!m.unsent && /^(\p{Extended_Pictographic}|\uFE0F|\u200D|\s){1,8}$/u.test(m.body || "") && m.type === "text" ? " is-big" : ""}`} title={stamp(m.time)}>
                                        {m.unsent ? (own ? "You unsent a message" : `${firstName(m.sender)} unsent a message`)
                                            : m.type === "image" ? <img src={m.image} alt={m.file_name || "Photo"} onClick={() => setLightbox(m.image)} loading="lazy" />
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
                                        {own && <button type="button" onClick={() => unsend(m)} title="Unsend" aria-label="Unsend message"><Svg i="more" size={16} /></button>}
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
                        <span>{replyTo.type === "image" ? "Photo" : replyTo.type === "file" ? `📎 ${replyTo.file_name}` : replyTo.body}</span>
                    </div>
                    <button type="button" className="ms-icon" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><Svg i="x" size={16} /></button>
                </div>
            )}

            <form className="ms-win-foot" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <button type="button" className="ms-icon is-blue" onClick={() => fileRef.current?.click()} aria-label="Send photos" title="Send photos"><Svg i="image" size={20} /></button>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                <button type="button" className="ms-icon is-blue" onClick={() => docRef.current?.click()} aria-label="Attach a file" title="Attach a file (PDF, Word, Excel…)"><Svg i="clip" size={19} /></button>
                <input ref={docRef} type="file" accept={`image/*,${DOC_ACCEPT}`} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
                <textarea
                    ref={input}
                    rows={1}
                    value={text}
                    maxLength={5000}
                    placeholder="Aa"
                    onChange={(e) => typing(e.target.value)}
                    onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                        if (e.key === "Escape" && replyTo) { e.stopPropagation(); setReplyTo(null); }
                    }}
                    aria-label="Message"
                />
                <span className="ms-emoji-anchor">
                    <button type="button" className={`ms-icon is-blue ms-emoji-btn${emojiOpen ? " is-on" : ""}`} onClick={() => setEmojiOpen(!emojiOpen)} aria-label="Emoji" title="Emoji"><Svg i="smile" size={20} /></button>
                    {emojiOpen && <EmojiPicker className="is-input" onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
                </span>
                {text.trim() || files.length
                    ? <button type="submit" className="ms-icon is-blue" aria-label="Send"><Svg i="send" size={20} /></button>
                    : <button type="button" className="ms-icon ms-like" onClick={() => send("👍")} aria-label="Send a like">👍</button>}
            </form>
        </>
    );
    const online_ = conv && (conv.is_group ? c.members.some((m) => !m.me && m.online) : conv.other?.online);

    if (page) {
        return (
            <section className={`ms-pchat${info ? " has-info" : ""}`} aria-label={`Chat with ${title}`}
                onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
                <div className="ms-pchat-main ms-win">
                    <header className="ms-win-head ms-pchat-head">
                        <button className="ms-icon ms-page-back" onClick={() => setPageChat(null)} aria-label="Back to chats"><Svg i="back" size={20} /></button>
                        <span className="ms-win-who">
                            {conv && <ConvAvatar c={{ ...conv, online: online_ }} size={42} />}
                            <span className="ms-win-title"><strong>{title}</strong><small>{status}</small></span>
                        </span>
                        <button className={`ms-icon${info ? " is-on" : ""}`} onClick={() => setInfo(!info)} aria-label="Chat info" title="Chat info" aria-pressed={info}><Svg i="info" size={20} /></button>
                    </header>
                    {main}
                </div>
                {info && <aside className="ms-pchat-info ms-win">{info_}</aside>}
            </section>
        );
    }

    return (
        <section className="ms-win" aria-label={`Chat with ${title}`}
            onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            <header className="ms-win-head">
                <button className="ms-win-who" onClick={() => setInfo(!info)} title="Chat info">
                    {conv && <ConvAvatar c={{ ...conv, online: online_ }} size={34} />}
                    <span className="ms-win-title"><strong>{title}</strong><small>{status}</small></span>
                </button>
                <button className="ms-icon" onClick={() => openPage(win.id)} aria-label="Open in Messenger" title="Open in Messenger"><Svg i="expand" size={16} /></button>
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

function ChatInfo({ c, onBack, onAdd, putPayload, closeChat, page = false }) {
    const { notify, loadConvs, convs, togglePin } = useMs();
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
            </div>

            {conv.is_group && (
                <Section title="Chat info">
                    <div className="ms-kv"><span>Admins</span><strong>{admins.map((a) => a.name.split(" ")[0]).join(", ") || "—"}</strong></div>
                    <div className="ms-kv"><span>Members</span><strong>{c.members.length}</strong></div>
                </Section>
            )}

            {conv.is_group && (
                <Section title="Customize chat">
                    <label className="ms-field">
                        <span>Group name</span>
                        <div className="ms-field-row">
                            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Name this group" />
                            <button className="ms-btn" disabled={busy || name === (conv.has_name ? conv.name : "")} onClick={rename}>Save</button>
                        </div>
                    </label>
                </Section>
            )}

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
                                {!p.me && meRow?.is_admin && (
                                    <span className="ms-member-act">
                                        <button className="ms-link" disabled={busy} onClick={() => admin(p, !p.is_admin)}>{p.is_admin ? "Remove admin" : "Make admin"}</button>
                                        <button className="ms-link is-red" disabled={busy} onClick={() => remove(p)}>Remove</button>
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                    <button className="ms-btn ms-add-row" onClick={onAdd}><Svg i="plus" size={16} /> Add people</button>
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