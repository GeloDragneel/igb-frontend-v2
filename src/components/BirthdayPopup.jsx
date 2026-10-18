// After login: a celebration popup when someone has a birthday today (staff logins only, once per day per login)
//   it's your birthday → a personal greeting · someone else's → "say happy birthday to …"
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, useAuth } from "../context/AuthContext";
import PersonAvatar from "./PersonAvatar";
import "./BirthdayPopup.css";

const titleCase = (v = "") => String(v).toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
const first = (p) => titleCase((p.first_name || String(p.name).split(",")[1]?.trim() || p.name).split(" ")[0]);
const joinNames = (list) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);
// who is logged in: every login has its own "seen" mark (id + username + name, so two staff never share one)
const whoIs = (user) => [user?.type, user?.id, user?.username, user?.email, user?.name].filter((v) => v !== undefined && v !== null && v !== "").join("|") || "user";
// seen = closed in THIS browser tab session for THIS login today; a new login (or a new tab) shows it again
const seenKey = (user, date) => `bday-popup:${whoIs(user)}:${date}`;
const wasSeen = (k) => { try { return sessionStorage.getItem(k) === "1"; } catch { return false; } };
const markSeen = (k) => { try { sessionStorage.setItem(k, "1"); } catch { /* storage blocked: it just shows again */ } };

export default function BirthdayPopup() {
    const { user } = useAuth();
    const [data, setData] = useState(null); // today's birthdays (the header cake shows while there are any)
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!user) return undefined; // the backend decides who sees it (staff logins)
        let alive = true;
        setData(null);
        setOpen(false);
        apiFetch("/hr/birthdays-today")
            .then((r) => {
                if (!alive) return;
                if (!r?.people?.length) { console.info("[birthday] no birthday today for this login", r); return; }
                setData(r);
                // pops up by itself once after login · the cake in the header opens it again anytime
                if (!wasSeen(seenKey(user, r.date))) setOpen(true);
            })
            .catch((e) => console.warn("[birthday] /hr/birthdays-today failed:", e?.message || e));
        return () => { alive = false; };
    }, [whoIs(user)]); // eslint-disable-line react-hooks/exhaustive-deps

    const close = () => { if (data) markSeen(seenKey(user, data.date)); setOpen(false); };
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => e.key === "Escape" && close();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }); // eslint-disable-line react-hooks/exhaustive-deps

    if (!data) return null;
    const me = data.people.find((p) => p.is_me);
    const others = data.people.filter((p) => !p.is_me);

    // the cake button in the header (before the dark mode button)
    const button = (
        <button type="button" className="icon-btn round bp-btn" onClick={() => setOpen(true)}
            aria-label={`Birthday today: ${data.people.map((p) => titleCase(p.name)).join(", ")}`} title="Birthday today!">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2.5" y="13" width="19" height="8.5" rx="2.2" className="b-base" />
                <rect x="5" y="8.5" width="14" height="5.5" rx="1.8" className="b-top" />
                <path d="M5 11q1.75 1.8 3.5 0t3.5 0 3.5 0 3.5 0V9.5H5z" className="b-icing" />
                <path d="M2.5 16q2.4 2 4.75 0t4.75 0 4.75 0 4.75 0V14.5h-19z" className="b-icing" />
                <rect x="11.1" y="4.2" width="1.8" height="4.5" rx=".7" className="b-candle" />
                <ellipse cx="12" cy="2.8" rx="1.3" ry="1.9" className="b-flame" />
            </svg>
            {data.people.length > 1 && <span className="bp-count">{data.people.length}</span>}
            <span className="bp-spark is-1" /><span className="bp-spark is-2" /><span className="bp-spark is-3" />
        </button>
    );
    if (!open) return button;

    // the popup is rendered on <body>: inside the header (blur / sticky) a fixed popup would be clipped to the header
    return (<>{button}{createPortal((
        <div className="bp-overlay" role="dialog" aria-modal="true" aria-label="Birthday" onMouseDown={(e) => e.target === e.currentTarget && close()}>
            <div className="bp-card">
                <div className="bp-confetti" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} />)}</div>
                <button type="button" className="bp-x" onClick={close} aria-label="Close">×</button>

                <svg className="bp-cake" viewBox="0 0 120 120" aria-hidden="true">
                    <rect x="18" y="70" width="84" height="34" rx="8" className="c-base" />
                    <rect x="26" y="46" width="68" height="28" rx="7" className="c-top" />
                    <path d="M26 58 q8 8 17 0 t17 0 t17 0 t17 0 v-5 h-68z" className="c-icing" />
                    <path d="M18 84 q10 9 21 0 t21 0 t21 0 t21 0 v-6 h-84z" className="c-icing" />
                    <rect x="44" y="28" width="6" height="18" rx="2" className="c-candle" />
                    <rect x="57" y="24" width="6" height="22" rx="2" className="c-candle is-2" />
                    <rect x="70" y="28" width="6" height="18" rx="2" className="c-candle" />
                    <ellipse cx="47" cy="22" rx="3.5" ry="6" className="c-flame" />
                    <ellipse cx="60" cy="18" rx="3.5" ry="6" className="c-flame" />
                    <ellipse cx="73" cy="22" rx="3.5" ry="6" className="c-flame" />
                </svg>

                {me ? (
                    <>
                        <small className="bp-kicker">It's your day!</small>
                        <h2>Happy birthday, {first(me)}!</h2>
                        <p>Wishing you a wonderful {me.age}th year. Thank you for everything you do for the team.</p>
                    </>
                ) : (
                    <>
                        <small className="bp-kicker">Today we celebrate</small>
                        <h2>Happy birthday, {joinNames(others.map(first))}!</h2>
                        <p>Don't forget to greet {others.length > 1 ? "them" : first(others[0])} today.</p>
                    </>
                )}

                <div className="bp-people">
                    {data.people.map((p) => (
                        <div key={p.id} className={`bp-person${p.is_me ? " is-me" : ""}`}>
                            <PersonAvatar className="bp-face" photo={p.photo_url} gender={p.gender} />
                            <b>{p.is_me ? "You" : titleCase(p.name)}</b>
                            <span>turns {p.age}</span>
                        </div>
                    ))}
                </div>

                <button type="button" className="bp-ok" onClick={close}>{me ? "Thank you!" : "Got it"}</button>
            </div>
        </div>
    ), document.body)}</>);
}