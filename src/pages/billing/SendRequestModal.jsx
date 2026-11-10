// Billing → "Send via" with approval
//   SendRequestModal : pick Email / Viber / Messenger / WeChat / WhatsApp / Telegram → saved to t_send_request (PENDING)
//   ChatSendPanel    : after CONFIRMED – opens each chat app with a 7-day link of the PDF
import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiFetch, apiForm } from "../../context/AuthContext";

export const SEND_APPS = [
    { key: "email", label: "Email", color: "#2563eb" },
    { key: "viber", label: "Viber", color: "#7360f2" },
    { key: "messenger", label: "Messenger", color: "#0084ff" },
    { key: "wechat", label: "WeChat", color: "#07c160" },
    { key: "whatsapp", label: "WhatsApp", color: "#25d366" },
    { key: "telegram", label: "Telegram", color: "#229ed9" },
];
export const appOf = (key) => SEND_APPS.find((a) => a.key === key) || { key, label: key, color: "#64748b" };
const PH = { viber: "09XX XXX XXXX", messenger: "facebook.com/username", wechat: "WeChat ID", whatsapp: "+63 9XX XXX XXXX", telegram: "@username" };
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

const appLink = (key, text, url) => {
    const t = encodeURIComponent(`${text}\n${url}`);
    switch (key) {
        case "viber": return `viber://forward?text=${t}`;
        case "messenger": return isMobile() ? `fb-messenger://share/?link=${encodeURIComponent(url)}` : "https://www.messenger.com/";
        case "wechat": return "weixin://";
        case "whatsapp": return `https://wa.me/?text=${t}`;
        case "telegram": return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        default: return "";
    }
};
const phoneDigits = (v) => {
    let d = String(v || "").replace(/\D/g, "");
    if (d.startsWith("0") && d.length === 11) d = "63" + d.slice(1);
    return d;
};
const contactLink = (key, value, text) => {
    const v = String(value || "").trim();
    const t = encodeURIComponent(text);
    if (key === "whatsapp") return { href: `https://wa.me/${phoneDigits(v)}?text=${t}`, copy: false };
    if (key === "telegram") return /^\+?\d[\d\s-]+$/.test(v) ? { href: `https://t.me/+${phoneDigits(v)}`, copy: true } : { href: `https://t.me/${v.replace(/^@/, "")}`, copy: true };
    if (key === "viber") return { href: `viber://chat?number=%2B${phoneDigits(v)}`, copy: true };
    if (key === "messenger") return { href: /^https?:/i.test(v) ? v.replace(/facebook\.com/i, "m.me").replace(/www\./i, "") : `https://m.me/${v.replace(/^@/, "")}`, copy: true };
    if (key === "wechat") return { href: "weixin://", copy: true };
    return null;
};

export function Glyph({ app, size = 40 }) {
    return (
        <span aria-hidden="true" style={{ width: size, height: size, borderRadius: size > 26 ? 12 : 7, background: app.color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: size * 0.42, flex: "0 0 auto" }}>
            {app.key === "email"
                ? <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                : app.label.slice(0, 1)}
        </span>
    );
}

const box = { border: "1px solid var(--line)", borderRadius: 14, padding: 16, background: "var(--card-2)" };
const Step = ({ n, title, sub }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <span style={{ width: 22, height: 22, borderRadius: 99, background: "var(--brand, #2563eb)", color: "#fff", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center", flex: "0 0 auto" }}>{n}</span>
        <span style={{ fontWeight: 700, color: "var(--ink)" }}>{title}</span>
        {sub && <span className="muted small">{sub}</span>}
    </div>
);
const Chip = ({ text, ok = true, color, onRemove }) => (
    <span style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 600,
        background: ok ? `${color || "#2563eb"}24` : "rgba(220,38,38,.18)", color: ok ? (color || "var(--brand, #2563eb)") : "#ef4444"
    }}>
        {text}
        {onRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove ${text}`}
                style={{ border: 0, background: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit", fontSize: 15 }}>×</button>
        )}
    </span>
);

/* =========================================================
   New request (meta + pdf) or edit / resubmit (request)
   meta: { docType, referenceNo, printType, serviceId, label }   pdf: { blob, name }
   ========================================================= */
export function SendRequestModal({ meta, pdf, request, onClose, onSaved }) {
    const notify = useToast();
    const isEdit = !!request;
    const ref = isEdit ? request.reference_no : meta.referenceNo;
    const label = isEdit ? request.label : meta.label;

    const [party, setParty] = useState(request?.party_name || "");
    const [picked, setPicked] = useState(request?.channels || ["email"]);
    const [emails, setEmails] = useState(request?.emails || []);
    const [typed, setTyped] = useState("");
    const [chatTo, setChatTo] = useState(() => {
        const m = {};
        (request?.contacts || []).forEach((c) => { (m[c.channel] ||= []).push(c.value); });
        return m;
    });
    const [chatTyped, setChatTyped] = useState({});
    const [saved, setSaved] = useState([]);                 // client's Socials
    const [subject, setSubject] = useState(request?.subject ?? `${label || "Statement of Account"} · ${ref}`);
    const [message, setMessage] = useState(request?.message ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // the client's emails + saved Viber / WhatsApp … (Client → Socials)
    useEffect(() => {
        apiFetch(`/send-requests/contacts?trans=${encodeURIComponent(ref)}`).then((r) => {
            setSaved(r.socials || []);
            if (r.party && !party) setParty(r.party);
            if (!isEdit) {
                if (r.emails?.length) setEmails((e) => [...new Set([...e, ...r.emails])]);
                setMessage((m) => m || `Good day${r.party ? ` ${r.party}` : ""},\n\nPlease see the attached ${label || "Statement of Account"} (${ref}).\n\nThank you.`);
            }
        }).catch(() => {
            if (!isEdit) setMessage((m) => m || `Good day,\n\nPlease see the attached ${label || "Statement of Account"} (${ref}).\n\nThank you.`);
        });
    }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps

    const savedFor = (key) => saved.filter((x) => String(x.name).toLowerCase() === key).map((x) => x.value);
    const chats = SEND_APPS.filter((a) => a.key !== "email" && picked.includes(a.key));
    const toggle = (k) => setPicked((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));
    const addEmails = (txt) => {
        const list = String(txt).split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
        if (!list.length) return;
        setEmails((x) => [...new Set([...x, ...list])]);
        setTyped("");
    };
    const toggleTo = (key, v) => setChatTo((m) => {
        const a = m[key] || [];
        return { ...m, [key]: a.includes(v) ? a.filter((x) => x !== v) : [...a, v] };
    });
    const addTo = (key) => {
        const v = String(chatTyped[key] || "").trim();
        if (!v) return;
        setChatTo((m) => ({ ...m, [key]: [...new Set([...(m[key] || []), v])] }));
        setChatTyped((t) => ({ ...t, [key]: "" }));
    };

    const submit = async () => {
        setError("");
        const all = [...new Set([...emails, ...String(typed).split(/[\s,;]+/).filter(Boolean)])];
        if (!picked.length) return setError("Pick at least one: Email, Viber, Messenger, WeChat, WhatsApp or Telegram.");
        if (picked.includes("email")) {
            if (!all.length) return setError("Type at least one email address.");
            const bad = all.find((e) => !validEmail(e));
            if (bad) return setError(`Not a valid email: ${bad}`);
        }
        const payload = {
            channels: picked,
            emails: picked.includes("email") ? all : [],
            contacts: chats.flatMap((a) => (chatTo[a.key] || []).map((value) => ({ channel: a.key, value }))),
            subject, message,
        };
        setBusy(true);
        try {
            let r;
            if (isEdit) {
                r = await apiFetch(`/send-requests/${request.id}`, { method: "PUT", body: JSON.stringify(payload) });
            } else {
                const fd = new FormData();
                fd.append("file", new File([pdf.blob], pdf.name, { type: "application/pdf" }));
                fd.append("payload", JSON.stringify({ ...payload, doc_type: meta.docType || "SOA", reference_no: meta.referenceNo, print_type: meta.printType, service_id: meta.serviceId || null, label: meta.label }));
                r = await apiForm("/send-requests", fd);
            }
            notify(r?.message || "Sent for approval.");
            onSaved?.();
            onClose();
        } catch (e) {
            setError(e.message || "Couldn't save the request.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal title={isEdit ? "Edit & resubmit" : "Send via · for approval"} onClose={() => !busy && onClose()} size="lg"
            footer={<>
                <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
                <button className="btn btn-primary" onClick={submit} disabled={busy || !picked.length}>
                    {busy ? "Saving…" : isEdit ? "Resubmit for approval" : `Submit for approval${picked.length ? ` (${picked.length})` : ""}`}
                </button>
            </>}>
            {/* what is sent */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, background: "var(--card-2)", border: "1px solid var(--line)", marginBottom: 12 }}>
                <span aria-hidden="true" style={{ width: 36, height: 44, borderRadius: 6, background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center" }}>PDF</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label} · {ref}</div>
                    <div className="muted small">{party || "—"}</div>
                </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", borderRadius: 10, background: "rgba(245,158,11,.14)", color: "#d97706", fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
                <span aria-hidden="true">⏳</span>
                Nothing is sent yet. A supervisor confirms it in Billing → Send Requests, then it goes out.
            </div>
            {isEdit && request.remarks && (
                <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(37,99,235,.12)", color: "var(--ink)", fontSize: 13, marginBottom: 16 }}>
                    <b>Supervisor:</b> {request.remarks}
                </div>
            )}

            {error && <div className="alert-error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

            {/* 1. apps */}
            <Step n={1} title="Send via" sub="pick one or more" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
                {SEND_APPS.map((a) => {
                    const on = picked.includes(a.key);
                    return (
                        <button key={a.key} type="button" onClick={() => toggle(a.key)} aria-pressed={on}
                            style={{
                                position: "relative", display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, cursor: "pointer", textAlign: "left",
                                border: `2px solid ${on ? a.color : "var(--line)"}`, background: on ? `${a.color}1f` : "var(--card)",
                                color: "var(--ink)", font: "inherit", transition: "border-color .15s, background .15s, transform .15s",
                                transform: on ? "translateY(-1px)" : "none", boxShadow: on ? `0 6px 16px ${a.color}33` : "none",
                            }}>
                            <Glyph app={a} />
                            <span style={{ fontWeight: 700 }}>{a.label}</span>
                            <span aria-hidden="true" style={{
                                position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: 99, display: "grid", placeItems: "center",
                                fontSize: 11, fontWeight: 900, color: "#fff", background: on ? a.color : "transparent",
                                border: on ? "none" : "1.5px solid var(--line)",
                            }}>{on ? "✓" : ""}</span>
                        </button>
                    );
                })}
            </div>

            {/* 2. email */}
            {picked.includes("email") && (
                <div style={{ ...box, marginBottom: 14 }}>
                    <Step n={2} title="Email" sub="the PDF is attached" />
                    <div style={{ display: "grid", gap: 10 }}>
                        <div>
                            <span className="field-label">To</span>
                            <div className="input" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minHeight: 42, height: "auto", padding: 6 }}>
                                {emails.map((e) => <Chip key={e} text={e} ok={validEmail(e)} onRemove={() => setEmails((x) => x.filter((y) => y !== e))} />)}
                                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={emails.length ? "Add another…" : "name@company.com"}
                                    onKeyDown={(e) => { if (["Enter", ",", ";", " "].includes(e.key)) { e.preventDefault(); addEmails(typed); } else if (e.key === "Backspace" && !typed && emails.length) setEmails((x) => x.slice(0, -1)); }}
                                    onBlur={() => addEmails(typed)} onPaste={(e) => { e.preventDefault(); addEmails(e.clipboardData.getData("text")); }}
                                    style={{ flex: 1, minWidth: 180, border: 0, outline: 0, background: "transparent", font: "inherit", color: "inherit" }} />
                            </div>
                            <span className="muted small">Press Enter or comma after each address.</span>
                        </div>
                        <label><span className="field-label">Subject</span>
                            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></label>
                        <label><span className="field-label">Message</span>
                            <textarea className="input" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} /></label>
                    </div>
                </div>
            )}

            {/* 3. chat apps: who to send to */}
            {chats.length > 0 && (
                <div style={box}>
                    <Step n={picked.includes("email") ? 3 : 2} title="Chat apps" sub="who gets it – a link to the PDF is made after approval" />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
                        {chats.map((a) => {
                            const options = [...new Set([...savedFor(a.key), ...(chatTo[a.key] || [])])];
                            return (
                                <div key={a.key} style={{ display: "grid", gap: 8, alignContent: "start", padding: 10, borderRadius: 12, background: "var(--card)", border: "1px solid var(--line)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <Glyph app={a} size={26} />
                                        <b style={{ color: "var(--ink)" }}>{a.label}</b>
                                    </div>
                                    {options.length > 0 && (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                            {options.map((v) => {
                                                const on = (chatTo[a.key] || []).includes(v);
                                                return (
                                                    <button key={v} type="button" onClick={() => toggleTo(a.key, v)} aria-pressed={on}
                                                        style={{
                                                            border: `1.5px solid ${on ? a.color : "var(--line)"}`, background: on ? `${a.color}24` : "transparent", color: on ? a.color : "var(--ink)",
                                                            borderRadius: 999, padding: "4px 10px", fontSize: 13, fontWeight: 600, cursor: "pointer", font: "inherit"
                                                        }}>
                                                        {on ? "✓ " : ""}{v}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div style={{ display: "flex", gap: 6 }}>
                                        <input className="input" value={chatTyped[a.key] || ""} placeholder={PH[a.key] || ""} maxLength={255}
                                            onChange={(e) => setChatTyped((t) => ({ ...t, [a.key]: e.target.value }))}
                                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTo(a.key); } }}
                                            style={{ flex: 1, minWidth: 0, height: 34 }} aria-label={`${a.label} contact`} />
                                        <button type="button" className="btn btn-sm" onClick={() => addTo(a.key)}>Add</button>
                                    </div>
                                    {!options.length && <span className="muted small">No saved {a.label} – type one, or leave empty to pick in the app.</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </Modal>
    );
}

/* =========================================================
   CONFIRMED → open the chat apps with a link of the PDF
   ========================================================= */
export function ChatSendPanel({ request }) {
    const notify = useToast();
    const [link, setLink] = useState(null);
    const [busy, setBusy] = useState(false);
    const chats = SEND_APPS.filter((a) => a.key !== "email" && (request.channels || []).includes(a.key));
    if (!chats.length) return null;

    const text = `${request.label || "Statement of Account"} ${request.reference_no}${request.party_name ? ` – ${request.party_name}` : ""}`;
    const make = async () => {
        setBusy(true);
        try { setLink(await apiFetch(`/send-requests/${request.id}/link`, { method: "POST" })); }
        catch (e) { notify(e.message || "Couldn't make the link.", "error"); }
        finally { setBusy(false); }
    };
    const copy = async (txt) => {
        try { await navigator.clipboard.writeText(txt); notify("Link copied"); } catch { notify("Couldn't copy – select the link and copy it."); }
    };
    const openApp = async (key) => {
        if (key === "wechat" || (key === "messenger" && !isMobile())) await copy(`${text}\n${link.url}`);
        window.open(appLink(key, text, link.url), "_blank", "noopener");
    };

    return (
        <div style={box}>
            <Step n="✓" title="Send to chat apps" sub={link ? `link valid until ${link.expires}` : "confirmed – open each app to send"} />
            {!link ? (
                <button className="btn btn-primary" onClick={make} disabled={busy}>{busy ? "Preparing…" : "Get link & open apps"}</button>
            ) : (
                <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
                        {chats.map((a) => (
                            <div key={a.key} style={{ display: "grid", gap: 6, alignContent: "start" }}>
                                <button type="button" onClick={() => openApp(a.key)}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: 0, cursor: "pointer",
                                        background: a.color, color: "#fff", font: "inherit", textAlign: "left", boxShadow: `0 6px 16px ${a.color}40`
                                    }}>
                                    <Glyph app={{ ...a, color: "rgba(255,255,255,.22)" }} size={32} />
                                    <b>Open {a.label}</b>
                                </button>
                                {(request.contacts || []).filter((c) => c.channel === a.key).map((c) => {
                                    const l = contactLink(a.key, c.value, `${text}\n${link.url}`);
                                    if (!l) return null;
                                    return (
                                        <button key={c.value} type="button" className="btn btn-sm" title={l.copy ? "The message is copied – paste it in the chat" : "Opens the chat with the message"}
                                            onClick={async () => { if (l.copy) await copy(`${text}\n${link.url}`); window.open(l.href, "_blank", "noopener"); }}
                                            style={{ justifyContent: "flex-start", borderColor: a.color, color: a.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            → {c.value}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input className="input mono" readOnly value={link.url} onFocus={(e) => e.target.select()} style={{ flex: 1, fontSize: 12 }} aria-label="PDF link" />
                        <button type="button" className="btn" onClick={() => copy(`${text}\n${link.url}`)}>Copy link</button>
                    </div>
                </>
            )}
        </div>
    );
}