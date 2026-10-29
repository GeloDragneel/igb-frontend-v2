// Settings → Billing & plans (clients who signed up with Google / Facebook)
// Prices and features are placeholders for now – change PLANS below.
import { useEffect, useState } from "react";
import { apiFetch } from "../context/AuthContext";
import "./PricingPlans.css";

const PLANS = [
    {
        key: "basic", name: "Basic", tag: "For small stores starting out", monthly: 499,
        features: ["1 business account (MAIN)", "1 user login", "Sales, purchases & expenses", "Chart of accounts", "VAT & percentage tax summary", "BIR 2550M / 2551Q forms", "Email support"],
    },
    {
        key: "pro", name: "Pro", tag: "Most businesses pick this", monthly: 999, popular: true,
        features: ["Everything in Basic", "Up to 3 branches", "Up to 5 user logins", "All BIR returns (0619E, 1601-EQ, 2550Q, 1701Q, 1702Q…)", "Books & ledgers, trial balance", "2307 certificates", "Excel & PDF reports", "Chat support"],
    },
    {
        key: "advance", name: "Advance", tag: "Growing, multi-branch", monthly: 1999,
        features: ["Everything in Pro", "Up to 10 branches", "Up to 15 user logins", "Financial statements", "Inventory & fixed assets", "HR & payroll (up to 25 employees)", "Bank reconciliation", "Priority support"],
    },
    {
        key: "enterprise", name: "Enterprise", tag: "Big companies & groups", monthly: null,
        features: ["Everything in Advance", "Unlimited branches & users", "Unlimited employees", "Dedicated IGB accountant", "Data migration from your old system", "Custom reports", "On-site training", "Phone support & SLA"],
    },
];

const peso = (n) => `₱${Number(n).toLocaleString("en-PH")}`;
const Check = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

export default function PricingPlans() {
    const [yearly, setYearly] = useState(false);
    const [trial, setTrial] = useState(null);
    const [picked, setPicked] = useState(null);

    useEffect(() => { apiFetch("/trial").then(setTrial).catch(() => setTrial(null)); }, []);

    const price = (p) => (p.monthly === null ? null : yearly ? p.monthly * 10 : p.monthly);   // yearly = 2 months free

    return (
        <div className="pp">
            {/* current plan */}
            <div className={`pp-now${trial?.expired ? " is-ended" : ""}`}>
                <div>
                    <small>Current plan</small>
                    <b>{trial?.trial ? "Free trial" : "Active account"}</b>
                    <span>
                        {trial?.trial
                            ? trial.expired ? "Your free trial has ended. Pick a plan to keep using IGB." : `${trial.days_left} day${trial.days_left === 1 ? "" : "s"} left · all Pro features while on trial`
                            : "Your account is active."}
                    </span>
                </div>
                {trial?.trial && !trial.expired && (
                    <div className="pp-days"><b>{trial.days_left}</b><span>days<br />left</span></div>
                )}
            </div>

            {/* monthly / yearly */}
            <div className="pp-switch" role="radiogroup" aria-label="Billing period">
                <button type="button" role="radio" aria-checked={!yearly} className={!yearly ? "is-on" : ""} onClick={() => setYearly(false)}>Monthly</button>
                <button type="button" role="radio" aria-checked={yearly} className={yearly ? "is-on" : ""} onClick={() => setYearly(true)}>
                    Yearly <em>2 months free</em>
                </button>
            </div>

            <div className="pp-grid">
                {PLANS.map((p) => {
                    const amount = price(p);
                    return (
                        <article key={p.key} className={`pp-card${p.popular ? " is-popular" : ""}${picked === p.key ? " is-picked" : ""}`}>
                            {p.popular && <span className="pp-ribbon">Most popular</span>}
                            <h3>{p.name}</h3>
                            <p className="pp-tag">{p.tag}</p>
                            <div className="pp-price">
                                {amount === null ? <b>Let's talk</b> : <><b>{peso(amount)}</b><span>/{yearly ? "year" : "month"}</span></>}
                            </div>
                            <p className="pp-note">{amount === null ? "Custom price for your company" : yearly ? `${peso(p.monthly)}/month billed yearly` : "VAT inclusive · cancel anytime"}</p>
                            <button type="button" className={`btn ${p.popular ? "btn-primary" : ""} pp-cta`} onClick={() => setPicked(p.key)}>
                                {amount === null ? "Contact us" : `Choose ${p.name}`}
                            </button>
                            <ul>
                                {p.features.map((f) => <li key={f}><span className="pp-ck"><Check /></span>{f}</li>)}
                            </ul>
                        </article>
                    );
                })}
            </div>

            {picked && (
                <div className="pp-picked" role="status">
                    <b>{PLANS.find((x) => x.key === picked).name} plan</b> – IGB Accounting will contact you to activate it.
                    Online payment is coming soon; for now, message or call IGB Accounting to pay and activate.
                    <button type="button" className="pp-x" onClick={() => setPicked(null)} aria-label="Close">×</button>
                </div>
            )}
        </div>
    );
}