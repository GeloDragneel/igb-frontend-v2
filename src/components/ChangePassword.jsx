// Change password (any login) – old password first, then the new one twice
//   <ChangePasswordButton />            the "Change password" button for the side card of My profile (or the user menu)
//   <ChangePasswordModal onClose={…} /> the popup only
import { useState } from "react";
import Modal from "./Modal";
import { useToast } from "./Toast";
import { apiFetch } from "../context/AuthContext";
import "./ChangePassword.css";

/* ---------- small icons ---------- */
const Svg = ({ children, s = 16 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const LockIcon = (p) => <Svg {...p}><rect x="4" y="10.5" width="16" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></Svg>;
const KeyIcon = (p) => <Svg {...p}><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 20 3M17 6l3 3M15 8l2 2" /></Svg>;
const EyeIcon = ({ off, ...p }) => (
    <Svg {...p}>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
        {off && <path d="M3 3l18 18" />}
    </Svg>
);
const Check = (p) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;

/* ---------- strength ---------- */
const RULES = [
    ["len", "8+ characters", (p) => p.length >= 8],
    ["case", "Upper & lower case", (p) => /[a-z]/.test(p) && /[A-Z]/.test(p)],
    ["num", "A number", (p) => /\d/.test(p)],
    ["sym", "A symbol", (p) => /[^A-Za-z0-9]/.test(p)],
];
const LEVELS = [
    { label: "Too short", tone: "bad" },
    { label: "Weak", tone: "bad" },
    { label: "Fair", tone: "mid" },
    { label: "Good", tone: "ok" },
    { label: "Strong", tone: "great" },
];
function strength(p) {
    if (!p) return null;
    if (p.length < 8) return 0;
    return Math.max(1, RULES.filter(([, , t]) => t(p)).length);
}

/* ---------- one password box with its own show / hide ---------- */
function PwField({ label, value, onChange, error, autoComplete, autoFocus, onEnter, hint }) {
    const [show, setShow] = useState(false);
    return (
        <div className={`cp-field${error ? " has-error" : ""}`}>
            <span className="cp-label">{label}</span>
            <div className="cp-box">
                <LockIcon s={16} />
                <input
                    type={show ? "text" : "password"}
                    value={value}
                    autoComplete={autoComplete}
                    autoFocus={autoFocus}
                    spellCheck={false}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
                    aria-label={label}
                    aria-invalid={!!error}
                />
                <button type="button" className="cp-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide" : "Show"} tabIndex={-1}>
                    <EyeIcon off={show} s={17} />
                </button>
            </div>
            {error ? <span className="cp-error">{error}</span> : hint ? <span className="cp-hint">{hint}</span> : null}
        </div>
    );
}

export function ChangePasswordModal({ onClose }) {
    const notify = useToast();
    const [f, setF] = useState({ current: "", next: "", again: "" });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

    const level = strength(f.next);
    const matches = f.again !== "" && f.again === f.next;

    const submit = async () => {
        const e = {};
        if (!f.current) e.current = "Type your current password.";
        if (f.next.length < 8) e.next = "The new password needs at least 8 characters.";
        else if (f.next === f.current) e.next = "Use a password different from the current one.";
        if (!e.next && f.again !== f.next) e.again = "The new passwords don't match.";
        setErrors(e);
        if (Object.keys(e).length) return;

        setSaving(true);
        try {
            const r = await apiFetch("/me/password", {
                method: "PUT",
                body: JSON.stringify({ current_password: f.current, password: f.next, password_confirmation: f.again }),
            });
            notify(r?.message || "Password changed.");
            onClose();
        } catch (err) {
            const msg = err?.message || "Couldn't change the password.";
            if (/current/i.test(msg)) setErrors({ current: msg });
            else if (/match/i.test(msg)) setErrors({ again: msg });
            else setErrors({ next: msg });
            setSaving(false);
        }
    };

    return (
        <Modal
            title="Change password"
            onClose={() => !saving && onClose()}
            size="sm"
            footer={
                <>
                    <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Update password"}</button>
                </>
            }
        >
            <div className="cp">
                <div className="cp-intro">
                    <span className="cp-intro-icon"><KeyIcon s={20} /></span>
                    <div>
                        <b>Keep your account safe</b>
                        <p>Confirm your current password, then choose a new one. Other devices using this login will be signed out.</p>
                    </div>
                </div>

                <PwField label="Current password" value={f.current} onChange={set("current")} error={errors.current}
                    autoComplete="current-password" autoFocus onEnter={submit} />

                <div className="cp-sep" />

                <PwField label="New password" value={f.next} onChange={set("next")} error={errors.next}
                    autoComplete="new-password" onEnter={submit} />

                {level !== null && (
                    <div className={`cp-meter is-${LEVELS[level].tone}`}>
                        <div className="cp-bars">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= level ? "on" : ""} />)}</div>
                        <span>{LEVELS[level].label}</span>
                    </div>
                )}
                <ul className="cp-rules">
                    {RULES.map(([k, l, test]) => {
                        const ok = test(f.next);
                        return <li key={k} className={ok ? "ok" : ""}><span className="cp-dot">{ok && <Check s={11} />}</span>{l}</li>;
                    })}
                </ul>

                <PwField label="Confirm new password" value={f.again} onChange={set("again")}
                    error={errors.again || (f.again && !matches ? "Doesn't match yet." : "")}
                    hint={matches ? "✓ Passwords match" : ""}
                    autoComplete="new-password" onEnter={submit} />
            </div>
        </Modal>
    );
}

/** the button on the side card of My profile */
export function ChangePasswordButton({ className = "", children }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" className={`cp-open ${className}`} onClick={() => setOpen(true)}>
                <KeyIcon s={16} />
                <span>{children || "Change password"}</span>
            </button>
            {open && <ChangePasswordModal onClose={() => setOpen(false)} />}
        </>
    );
}

export default ChangePasswordButton;