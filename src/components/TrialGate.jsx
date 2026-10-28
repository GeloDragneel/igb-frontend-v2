// 15-day free trial (clients who signed up with Google / Facebook)
//   days left → a thin banner on top · ended → a full-screen lock (only Sign out works)
//   Put <TrialGate /> once inside the signed-in layout (e.g. Layout.jsx, right after the Header).
import { useCallback, useEffect, useState } from "react";
import { useAuth, apiFetch } from "../context/AuthContext";
import "./TrialGate.css";

const fmt = (s) => {
    const d = new Date(String(s).replace(" ", "T"));
    return isNaN(d) ? s : d.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
};

export default function TrialGate() {
    const { user, logout } = useAuth();
    const [t, setT] = useState(null);           // { trial, ends_at, days_left, expired }
    const [hidden, setHidden] = useState(false);

    const check = useCallback(() => {
        if (!user || user.type === "Staff") { setT(null); return; }
        apiFetch("/trial").then(setT).catch(() => { });
    }, [user]);

    useEffect(() => {
        check();
        const id = setInterval(check, 10 * 60 * 1000);               // every 10 minutes
        const onExpired = (e) => setT((x) => ({ ...(x || {}), trial: true, expired: true, ends_at: e.detail?.ends_at || x?.ends_at }));
        window.addEventListener("igb-trial-expired", onExpired);
        return () => { clearInterval(id); window.removeEventListener("igb-trial-expired", onExpired); };
    }, [check]);

    if (!t?.trial) return null;

    if (t.expired) {
        return (
            <div className="tg-lock" role="alertdialog" aria-modal="true" aria-labelledby="tg-title">
                <div className="tg-card">
                    <div className="tg-icon" aria-hidden="true">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="4" y="10.5" width="16" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                        </svg>
                    </div>
                    <h2 id="tg-title">Your free trial has ended</h2>
                    <p>Your 15-day trial ended on <b>{fmt(t.ends_at)}</b>. Your data is safe — contact IGB Accounting to activate your account and continue.</p>
                    <div className="tg-contact">
                        <span>IGB Accounting and Business Consultancy</span>
                    </div>
                    <div className="tg-actions">
                        <button className="btn" onClick={check}>I'm activated – check again</button>
                        <button className="btn btn-primary" onClick={logout}>Sign out</button>
                    </div>
                </div>
            </div>
        );
    }

    if (hidden) return null;
    const urgent = t.days_left <= 3;
    return (
        <div className={`tg-banner${urgent ? " is-urgent" : ""}`} role="status">
            <span className="tg-pill">Free trial</span>
            <span>
                <b>{t.days_left} day{t.days_left === 1 ? "" : "s"} left</b> · until {fmt(t.ends_at)}. Contact IGB Accounting to activate your account.
            </span>
            <button type="button" className="tg-x" onClick={() => setHidden(true)} aria-label="Hide">×</button>
        </div>
    );
}
