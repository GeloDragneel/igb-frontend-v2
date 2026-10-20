// Header → AI Assistant: a button beside the theme toggle that opens a messenger-style chat (bottom right).
// Talks to /ai/messages (AiAssistantController) – the API key stays on the server.
import { Fragment, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth, apiFetch } from "../context/AuthContext";
import { usePeriod } from "../context/PeriodContext";
import "./AiAssistant.css";

const SUGGESTIONS = [
    "How do I record a purchase with VAT?",
    "When is the 2550Q deadline?",
    "Explain input VAT vs output VAT",
    "How do I fix a reverted invoice?",
];

const Spark = ({ size = 18 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
);

const time = (t) => {
    const d = t ? new Date(String(t).replace(" ", "T")) : new Date();
    return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

/* **bold**, `code`, "- " / "1. " lists, blank lines – no HTML from the AI is ever injected */
function inline(text) {
    return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
        return <Fragment key={i}>{part}</Fragment>;
    });
}
function Rich({ text }) {
    const blocks = [];
    let list = null;
    String(text).split("\n").forEach((raw, i) => {
        const line = raw.replace(/^#{1,6}\s+/, "");          // headings → plain bold-ish line
        const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
        if (m) {
            const ordered = /^\s*\d/.test(line);
            if (!list || list.ordered !== ordered) { list = { ordered, items: [] }; blocks.push(list); }
            list.items.push(m[1]);
            return;
        }
        list = null;
        if (line.trim()) blocks.push({ p: line, heading: raw !== line, key: i });
    });
    return blocks.map((b, i) => b.items
        ? (b.ordered ? <ol key={i}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>
            : <ul key={i}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>)
        : <p key={i} className={b.heading ? "ai-h" : ""}>{inline(b.p)}</p>);
}

export default function AiAssistant() {
    const { user } = useAuth();
    const period = usePeriod();
    const { pathname } = useLocation();
    const [open, setOpen] = useState(false);
    const [msgs, setMsgs] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [ready, setReady] = useState(true);
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [unread, setUnread] = useState(false);
    const body = useRef(null);
    const input = useRef(null);

    // first open → the saved conversation
    useEffect(() => {
        if (!open || loaded) return;
        apiFetch("/ai/messages")
            .then((r) => { setMsgs(r.messages || []); setReady(r.ready !== false); })
            .catch((e) => setError(e.message || "Couldn't load the chat."))
            .finally(() => setLoaded(true));
    }, [open, loaded]);

    // new login → fresh chat
    useEffect(() => { setMsgs([]); setLoaded(false); setOpen(false); }, [user?.login_id, user?.type]);

    // stay at the newest message
    useEffect(() => {
        if (body.current) body.current.scrollTop = body.current.scrollHeight;
    }, [msgs, busy, open]);

    useEffect(() => {
        if (open) { setUnread(false); setTimeout(() => input.current?.focus(), 50); }
    }, [open]);

    // tell the Messenger dock to move left while this window is open
    useEffect(() => {
        document.body.classList.toggle("ai-chat-open", open);
        return () => document.body.classList.remove("ai-chat-open");
    }, [open]);

    // Esc closes
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === "Escape" && setOpen(false);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const send = async (msg = text) => {
        const m = msg.trim();
        if (!m || busy) return;
        setError("");
        setText("");
        const temp = { id: `t${Date.now()}`, role: "user", content: m, created_at: null, pending: true };
        setMsgs((list) => [...list, temp]);
        setBusy(true);
        try {
            const r = await apiFetch("/ai/messages", {
                method: "POST",
                body: JSON.stringify({
                    message: m,
                    context: {
                        page: pathname,
                        branch: [user?.branch_code, user?.business_name].filter(Boolean).join(" "),
                        period: period?.from && period?.to ? `${period.from} to ${period.to}` : "",
                        role: user?.role || "",
                    },
                }),
            });
            setMsgs((list) => [...list.filter((x) => x.id !== temp.id), r.user, r.reply]);
            if (!open) setUnread(true);
        } catch (e) {
            setMsgs((list) => list.filter((x) => x.id !== temp.id));
            setText(m);                                            // give the text back to resend
            setError(e.message || "The assistant couldn't answer.");
        } finally {
            setBusy(false);
            input.current?.focus();
        }
    };

    const clear = async () => {
        if (!msgs.length) return;
        try { await apiFetch("/ai/messages", { method: "DELETE" }); setMsgs([]); setError(""); }
        catch (e) { setError(e.message || "Couldn't clear the chat."); }
    };

    const first = (user?.name || "").split(" ").slice(-1)[0] || "there";

    return (
        <>
            <button className={`icon-btn round ai-trigger${open ? " is-on" : ""}`} onClick={() => setOpen(!open)}
                aria-label="AI Assistant" aria-expanded={open} title="AI Assistant">
                <Spark />
                {unread && <span className="ai-dot" aria-hidden="true" />}
            </button>

            {open && (
                <section className="ai-chat" role="dialog" aria-label="AI Assistant">
                    <header className="ai-head">
                        <span className="ai-avatar"><Spark size={17} /></span>
                        <div className="ai-title">
                            <strong>IGB Assistant</strong>
                            <small>{busy ? "Typing…" : ready ? "Online · AI can make mistakes" : "Not set up"}</small>
                        </div>
                        <button className="ai-head-btn" onClick={clear} disabled={!msgs.length || busy} title="New conversation" aria-label="New conversation">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                        </button>
                        <button className="ai-head-btn" onClick={() => setOpen(false)} title="Close" aria-label="Close">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                    </header>

                    <div className="ai-body" ref={body}>
                        {!loaded && <div className="ai-empty">Loading…</div>}

                        {loaded && msgs.length === 0 && (
                            <div className="ai-welcome">
                                <span className="ai-avatar is-big"><Spark size={26} /></span>
                                <h4>Hi {first}! How can I help?</h4>
                                <p>Ask about using IGB, bookkeeping, or BIR tax.</p>
                                <div className="ai-suggest">
                                    {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} disabled={busy || !ready}>{s}</button>)}
                                </div>
                            </div>
                        )}

                        {msgs.map((m) => (
                            <div key={m.id} className={`ai-msg is-${m.role}${m.pending ? " is-pending" : ""}`}>
                                {m.role === "assistant" && <span className="ai-avatar is-sm"><Spark size={13} /></span>}
                                <div className="ai-bubble">
                                    {m.role === "assistant" ? <Rich text={m.content} /> : <p>{m.content}</p>}
                                    <time>{m.pending ? "Sending…" : time(m.created_at)}</time>
                                </div>
                            </div>
                        ))}

                        {busy && (
                            <div className="ai-msg is-assistant">
                                <span className="ai-avatar is-sm"><Spark size={13} /></span>
                                <div className="ai-bubble ai-typing" aria-label="Typing"><i /><i /><i /></div>
                            </div>
                        )}
                    </div>

                    {error && <div className="ai-error" role="alert">{error}</div>}
                    {!ready && loaded && <div className="ai-error">AI_API_KEY is not set on the server yet.</div>}

                    <form className="ai-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
                        <textarea
                            ref={input}
                            rows={1}
                            value={text}
                            maxLength={4000}
                            placeholder="Type a message…"
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                            aria-label="Message"
                        />
                        <button type="submit" disabled={!text.trim() || busy || !ready} aria-label="Send">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
                        </button>
                    </form>
                </section>
            )}
        </>
    );
}