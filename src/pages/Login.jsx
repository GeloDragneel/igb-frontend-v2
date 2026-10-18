import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth, TEMP_USERS } from "../context/AuthContext";
import Icon from "../components/Icons";
import "./Login.css";

export default function Login() {
    const { user, login } = useAuth();
    const navigate = useNavigate();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [remember, setRemember] = useState(true);
    const [showPw, setShowPw] = useState(false);
    const [capsOn, setCapsOn] = useState(false);
    const [error, setError] = useState("");
    const [shake, setShake] = useState(0);
    const [busy, setBusy] = useState(false);

    // Already logged in -> go to Home
    if (user) return <Navigate to="/" replace />;

    const fail = (msg) => {
        setError(msg);
        setShake((n) => n + 1); // re-trigger the shake animation
    };

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (!username.trim() || !password) {
            fail("Enter your username and password.");
            return;
        }
        setBusy(true);
        const res = await login(username, password, remember);
        setBusy(false);
        if (res.error) {
            fail(res.error);
            return;
        }
        navigate("/", { replace: true });
    };

    const fill = (u) => {
        setUsername(u.username);
        setPassword(u.password);
        setError("");
    };

    const checkCaps = (e) => setCapsOn(!!e.getModifierState?.("CapsLock"));

    return (
        <div className="lg-page">
            <div className="lg-blob lg-blob-a" aria-hidden="true" />
            <div className="lg-blob lg-blob-b" aria-hidden="true" />
            <div className="lg-shell">
                {/* ================= Showcase ================= */}
                <aside className="lg-show">
                    <div className="lg-brand">
                        <span className="lg-logo">IGB</span>
                        <span className="lg-brand-name">IGB Accounting</span>
                        <span className="lg-version">v2.0</span>
                    </div>
                    <div className="lg-copy">
                        <h1>
                            Your books, <span>always balanced.</span>
                        </h1>
                        <p>Invoicing, BIR forms, ledgers and reports for Philippine businesses, all in one place.</p>
                    </div>
                    {/* Decorative product preview */}
                    <div className="lg-preview" aria-hidden="true">
                        <div className="lg-card lg-card-main">
                            <div className="lg-card-top">
                                <span>Sales this month</span>
                                <span className="lg-up">▲ 12.4%</span>
                            </div>
                            <strong>₱1,284,500.00</strong>
                            <div className="lg-bars">
                                {[38, 52, 44, 66, 58, 74, 62, 88, 70, 96].map((h, i) => (
                                    <span key={i} style={{ height: `${h}%` }} />
                                ))}
                            </div>
                        </div>

                        <div className="lg-card lg-card-chip lg-chip-a">
                            <span className="lg-dot green"><Icon name="check" size={13} /></span>
                            <div>
                                <b>BIR 2307 ready</b>
                                <small>September 2026</small>
                            </div>
                        </div>

                        <div className="lg-card lg-card-chip lg-chip-b">
                            <span className="lg-dot blue"><Icon name="receipt" size={13} /></span>
                            <div>
                                <b>INV-0142 paid</b>
                                <small>₱16,983.00 received</small>
                            </div>
                        </div>
                    </div>

                    <ul className="lg-points">
                        <li><Icon name="check" size={15} /> VAT &amp; withholding computed for you</li>
                        <li><Icon name="check" size={15} /> Excel-style invoice entry</li>
                        <li><Icon name="check" size={15} /> Tree-view chart of accounts</li>
                    </ul>
                </aside>

                {/* ================= Form ================= */}
                <main className="lg-main">
                    <form key={shake} className={`lg-form ${shake ? "lg-shake" : ""}`} onSubmit={submit} noValidate>
                        <div className="lg-mobile-brand">
                            <span className="lg-logo">IGB</span>
                            <span className="lg-brand-name">IGB Accounting</span>
                        </div>

                        <header className="lg-head">
                            <h2>Welcome back</h2>
                            <p>Sign in to your account to continue.</p>
                        </header>

                        {/* Google sign-in – button only, no function yet */}
                        <button type="button" className="lg-google" disabled={busy}>
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                                <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.23a4.47 4.47 0 0 1-1.94 2.93v2.43h3.14c1.84-1.69 2.92-4.18 2.92-7.39z" />
                                <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.14-2.43c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.51A9.75 9.75 0 0 0 12 21.75z" />
                                <path fill="#FBBC05" d="M6.54 13.85A5.86 5.86 0 0 1 6.23 12c0-.64.11-1.26.31-1.85V7.64H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.36l3.24-2.51z" />
                                <path fill="#EA4335" d="M12 6.12c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.17 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.7 5.39l3.24 2.51C7.31 7.84 9.46 6.12 12 6.12z" />
                            </svg>
                            Continue with Google
                        </button>
                        <button type="button" className="lg-facebook" disabled={busy}>
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                                <path fill="#1877F2" d="M24 12.07C24 5.43 18.63 0 12 0S0 5.43 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.43H7.08v-3.5h3.05V9.41c0-3.04 1.79-4.73 4.57-4.73 1.32 0 2.7.24 2.7.24v2.99h-1.52c-1.5 0-1.97.94-1.97 1.9v2.26h3.35l-.54 3.5h-2.81V24C19.61 23.08 24 18.09 24 12.07z" />
                            </svg>
                            Continue with Facebook
                        </button>
                        <div className="lg-divider"><span>or sign in with username</span></div>

                        {error && (
                            <div className="lg-error" role="alert">
                                <Icon name="alert" size={16} />
                                {error}
                            </div>
                        )}

                        <div className="lg-field">
                            <Icon name="user" size={17} className="lg-field-icon" />
                            <input
                                id="lg-user"
                                autoFocus
                                autoComplete="username"
                                placeholder=" "
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                aria-invalid={!!error && !username.trim()}
                            />
                            <label htmlFor="lg-user">Username</label>
                        </div>

                        <div className="lg-field">
                            <Icon name="lock" size={17} className="lg-field-icon" />
                            <input
                                id="lg-pass"
                                type={showPw ? "text" : "password"}
                                autoComplete="current-password"
                                placeholder=" "
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyUp={checkCaps}
                                onKeyDown={checkCaps}
                                onBlur={() => setCapsOn(false)}
                                aria-invalid={!!error && !password}
                            />
                            <label htmlFor="lg-pass">Password</label>
                            <button
                                type="button"
                                className="lg-eye"
                                onClick={() => setShowPw(!showPw)}
                                aria-label={showPw ? "Hide password" : "Show password"}
                            >
                                {showPw ? "Hide" : "Show"}
                            </button>
                        </div>
                        {capsOn && <div className="lg-caps"><Icon name="alert" size={14} /> Caps Lock is on</div>}

                        <div className="lg-row">
                            <label className="lg-check">
                                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                                <span className="lg-box" aria-hidden="true"><Icon name="check" size={12} strokeWidth={3} /></span>
                                Keep me signed in
                            </label>
                            {/* no function yet */}
                            <button type="button" className="lg-link">Forgot password?</button>
                        </div>

                        <button className="lg-submit" disabled={busy}>
                            {busy ? (
                                <>
                                    <span className="lg-spinner" aria-hidden="true" /> Signing in…
                                </>
                            ) : (
                                <>
                                    Sign in <Icon name="chevron" size={17} strokeWidth={2.5} />
                                </>
                            )}
                        </button>
                    </form>

                    <p className="lg-foot">© {new Date().getFullYear()} IGB. All rights reserved.</p>
                </main>
            </div>
        </div>
    );
}