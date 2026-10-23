import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./HelpSupport.css";

/* =========================================================
   Help & Support  (Admin → Team → Help & Support, and the header user menu)
   Frontend only. Change the contact details here.
   ========================================================= */
const SUPPORT = {
    team: "IGB IT Support",
    email: "support@igb-fems.com",          // ← change to your real support email
    phone: "",                              // e.g. "(082) 123 4567" — leave "" to hide
    mobile: "",                             // e.g. "0917 123 4567" (Viber / SMS) — leave "" to hide
    hours: "Monday – Friday · 8:00 AM – 5:00 PM",
    response: "We usually reply within the same working day.",
};

const CATEGORIES = ["Login / account", "Sales / Purchases / Expenses", "VAT Summary / E-BIR", "BIR forms / E-Sub", "Reports / printing", "Billing", "Something else"];

const FAQ = [
    {
        group: "Getting started",
        items: [
            ["How do I switch to another client?", "Click the client name at the top left of the header (under “Good morning”). Pick the client and branch — every page then shows that client's data."],
            ["How do I change the period I'm looking at?", "Use the date range in the sidebar (e.g. “Jan 01, 2026 to Dec 31, 2026”). Most lists and reports follow it."],
            ["How do I turn dark mode or a theme on?", "Open your name at the top right → Dark mode. Themes (holidays, seasons and more) are under the Theme picker in the header."],
        ],
    },
    {
        group: "Sales, Purchases & Expenses",
        items: [
            ["Why can't I save — “Declared Month is disabled”?", "That month is already closed for the client (Administration → Declared Month). Pick an open month, or ask your supervisor to open it."],
            ["It says the document no. already exists.", "Another invoice has the same document no. A supervisor can approve it with the override login that pops up, or change the document no."],
            ["Where do I find invalid or reverted invoices?", "Sales → Invalid Sales for invalid ones. Reverted invoices from the audit are in Reports → Reverted Summary."],
        ],
    },
    {
        group: "VAT Summary & E-BIR",
        items: [
            ["How do I move a document to another month (undeclare)?", "Reports → VAT Summary → open the client's E-BIR → click an amount → Undeclare, then pick the new declared month. It waits for approval until someone clicks Approve."],
            ["What does “See adjustment” show?", "The E-BIR figures as if the undeclared documents were already in their new month. The Adjustment column is adjusted − original."],
            ["Where can I see what was approved before?", "In the E-BIR popup click History. Each approval shows who approved it, its documents, Compare before / after and Print."],
            ["I'm a data analyst — why can't I undeclare or approve?", "Data analysts can view only (See adjustment, Print, History). Ask your supervisor or auditor to undeclare / approve."],
        ],
    },
    {
        group: "BIR forms & E-Sub",
        items: [
            ["The DAT file won't download.", "The E-Sub check found problems (e.g. invalid TIN or missing address). Open the check list above the table, fix the customer / vendor, then download again."],
            ["E-Sub total doesn't match the VAT Summary.", "Non-VAT lines are not included in the DAT file. Check that the period and the client are the same on both pages."],
            ["When are the BIR returns due?", "See the Deadlines card on the Dashboard and the BIR calendar on Home — they follow the BIR return deadlines."],
        ],
    },
    {
        group: "Account & security",
        items: [
            ["I forgot my password.", "Ask your administrator to reset it (Administration → User Access). You can change it after you log in from My profile."],
            ["Can I share my login?", "No. Every change is saved under your name in the logs and history — always use your own login."],
        ],
    },
];

const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default function HelpSupport() {
    const { user } = useAuth();
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(null);                    // "group|question"
    const [form, setForm] = useState({ category: CATEGORIES[0], subject: "", message: "" });
    const [sent, setSent] = useState(false);
    const [copied, setCopied] = useState("");

    const name = user?.name || user?.fullname || user?.username || "";
    const needle = q.trim().toLowerCase();
    const groups = useMemo(() => FAQ
        .map((g) => ({ ...g, items: g.items.filter(([a, b]) => !needle || `${a} ${b}`.toLowerCase().includes(needle)) }))
        .filter((g) => g.items.length), [needle]);
    const hits = groups.reduce((t, g) => t + g.items.length, 0);

    const system = [
        ["User", name || "—"],
        ["Username", user?.username || "—"],
        ["Account type", user?.type || "—"],
        ["Page", typeof window !== "undefined" ? window.location.pathname : ""],
        ["Browser", typeof navigator !== "undefined" ? navigator.userAgent.replace(/^Mozilla\/5\.0 /, "") : ""],
    ];

    const copy = async (text, key) => {
        try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); } catch { /* ignore */ }
    };

    // frontend only: opens the user's mail app with everything filled in
    const send = (e) => {
        e.preventDefault();
        if (!form.subject.trim() || !form.message.trim()) return;
        const body = [
            form.message.trim(),
            "",
            "— — —",
            `Category: ${form.category}`,
            ...system.map(([k, v]) => `${k}: ${v}`),
        ].join("\n");
        window.location.href = `mailto:${SUPPORT.email}?subject=${encodeURIComponent(`[${form.category}] ${form.subject.trim()}`)}&body=${encodeURIComponent(body)}`;
        setSent(true);
    };

    return (
        <div className="hp">
            {/* ---------- hero ---------- */}
            <section className="hp-hero">
                <div className="hp-hero-text">
                    <span className="hp-kicker">Help &amp; Support</span>
                    <h1>Hi{name ? `, ${name}` : ""}! How can we help?</h1>
                    <p>Search the common questions below, or send the {SUPPORT.team} a message.</p>
                </div>
                <label className="hp-search">
                    <span aria-hidden="true">⌕</span>
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions — e.g. undeclare, DAT file, password" aria-label="Search help" />
                    {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search">×</button>}
                </label>
            </section>

            {/* ---------- contact cards ---------- */}
            <section className="hp-contacts">
                <a className="hp-contact" href={`mailto:${SUPPORT.email}`}>
                    <span className="hp-ic is-mail" aria-hidden="true">✉</span>
                    <span><small>Email</small><b>{SUPPORT.email}</b></span>
                </a>
                {SUPPORT.phone && (
                    <a className="hp-contact" href={`tel:${SUPPORT.phone.replace(/[^\d+]/g, "")}`}>
                        <span className="hp-ic is-phone" aria-hidden="true">☎</span>
                        <span><small>Phone</small><b>{SUPPORT.phone}</b></span>
                    </a>
                )}
                {SUPPORT.mobile && (
                    <a className="hp-contact" href={`tel:${SUPPORT.mobile.replace(/[^\d+]/g, "")}`}>
                        <span className="hp-ic is-mobile" aria-hidden="true">📱</span>
                        <span><small>Mobile / Viber</small><b>{SUPPORT.mobile}</b></span>
                    </a>
                )}
                <div className="hp-contact">
                    <span className="hp-ic is-time" aria-hidden="true">🕘</span>
                    <span><small>Office hours</small><b>{SUPPORT.hours}</b></span>
                </div>
            </section>

            <div className="hp-grid">
                {/* ---------- FAQ ---------- */}
                <section className="hp-card hp-faq">
                    <header className="hp-card-head">
                        <h2>Frequently asked questions</h2>
                        {needle && <span className="hp-pill">{hits} result{hits === 1 ? "" : "s"}</span>}
                    </header>
                    {!groups.length && (
                        <div className="hp-empty">
                            <b>No answer found for “{q}”.</b>
                            <span>Send us a message — we'll help you directly.</span>
                        </div>
                    )}
                    {groups.map((g) => (
                        <div key={g.group} className="hp-group">
                            <h3>{g.group}</h3>
                            {g.items.map(([question, answer]) => {
                                const k = `${g.group}|${question}`;
                                const on = open === k || !!needle;
                                return (
                                    <div key={k} className={`hp-q${on ? " is-open" : ""}`}>
                                        <button type="button" onClick={() => setOpen(open === k ? null : k)} aria-expanded={on}>
                                            <span>{question}</span>
                                            <i aria-hidden="true">+</i>
                                        </button>
                                        {on && <p>{answer}</p>}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </section>

                <aside className="hp-side">
                    {/* ---------- message ---------- */}
                    <section className="hp-card">
                        <header className="hp-card-head"><h2>Send us a message</h2></header>
                        {sent ? (
                            <div className="hp-sent">
                                <span aria-hidden="true">✓</span>
                                <b>Your mail app should be open now.</b>
                                <p>Press Send there to reach the {SUPPORT.team}. {SUPPORT.response}</p>
                                <button type="button" className="btn btn-sm" onClick={() => { setSent(false); setForm({ category: CATEGORIES[0], subject: "", message: "" }); }}>Write another</button>
                            </div>
                        ) : (
                            <form className="hp-form" onSubmit={send}>
                                <label>
                                    <span>Topic</span>
                                    <select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                                    </select>
                                </label>
                                <label>
                                    <span>Subject</span>
                                    <input className="input" value={form.subject} maxLength={120} required
                                        onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Short summary of the problem" />
                                </label>
                                <label>
                                    <span>Message</span>
                                    <textarea className="input" rows={5} value={form.message} required
                                        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                                        placeholder="What were you doing, what happened, and the client / document no. if any" />
                                </label>
                                <button type="submit" className="btn btn-primary" disabled={!form.subject.trim() || !form.message.trim()}>Send message</button>
                                <small className="hp-muted">Opens your email app with your user details attached. {SUPPORT.response}</small>
                            </form>
                        )}
                    </section>

                    {/* ---------- details for support ---------- */}
                    <section className="hp-card">
                        <header className="hp-card-head">
                            <h2>Your details</h2>
                            <button type="button" className="btn btn-sm" onClick={() => copy(system.map(([k, v]) => `${k}: ${v}`).join("\n"), "sys")}>
                                {copied === "sys" ? "Copied ✓" : "Copy"}
                            </button>
                        </header>
                        <div className="hp-me">
                            <span className="hp-avatar" aria-hidden="true">{initials(name)}</span>
                            <span><b>{name || "—"}</b><small>@{user?.username || "—"}</small></span>
                        </div>
                        <dl className="hp-sys">
                            {system.slice(2).map(([k, v]) => (
                                <div key={k}><dt>{k}</dt><dd title={v}>{v}</dd></div>
                            ))}
                        </dl>
                        <small className="hp-muted">Include these when you report a problem so we can find it faster.</small>
                    </section>
                </aside>
            </div>
        </div>
    );
}