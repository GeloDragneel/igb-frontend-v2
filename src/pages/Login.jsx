import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth, apiFetch } from "../context/AuthContext";
import Icon from "../components/Icons";
import "./Login.css";
import "./LoginSignup.css";

// Google / Facebook: the server sends the browser back to /login?social=<one-time code> (or ?social_error=…)
const SOCIAL_USER = "__social__";
const REMEMBER_KEY = "igb-social-remember";
const PROVIDER_NAME = { google: "Google", facebook: "Facebook" };
const SOCIAL_ERRORS = {
    not_linked: (p) => `This ${p} account isn't linked to a FEMS login yet. Sign in with your username first, then link ${p} in My profile (or Settings).`,
    inactive: () => "Your FEMS login is inactive or has no web access. Ask your administrator.",
    cancelled: (p) => `${p} sign-in was cancelled.`,
    expired: () => "The sign-in took too long. Try again.",
    failed: (p) => `Couldn't sign in with ${p}. Try again.`,
    provider: () => "Unknown sign-in method.",
};

export default function Login() {
    const { user, login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [remember, setRemember] = useState(true);
    const [showPw, setShowPw] = useState(false);
    const [capsOn, setCapsOn] = useState(false);
    const [error, setError] = useState("");
    const [shake, setShake] = useState(0);
    const [busy, setBusy] = useState(false);
    const [social, setSocial] = useState("");   // "google" | "facebook" | "code" while working
    // sign up (new client): Google / Facebook account that isn't linked yet
    const [signup, setSignup] = useState(null);  // { token, provider, email, name, avatar } · null = normal login
    const [su, setSu] = useState({ trade_name: "", last_name: "", first_name: "", middle_name: "", phone: "" });

    const fail = (msg) => {
        setError(msg);
        setShake((n) => n + 1); // re-trigger the shake animation
    };

    // back from Google / Facebook
    const handled = useRef(false);
    useEffect(() => {
        if (handled.current) return;
        const q = new URLSearchParams(location.search);
        const code = q.get("social");
        const err = q.get("social_error");
        const signupToken = q.get("social_signup");
        if (signupToken) {
            handled.current = true;
            navigate("/login", { replace: true });
            setSocial("code");
            apiFetch(`/auth/signup/${encodeURIComponent(signupToken)}`)
                .then((r) => {
                    setSignup({ token: signupToken, ...r });
                    setSu((x) => ({ ...x, last_name: r.last_name || "", first_name: r.first_name || "" }));
                })
                .catch((e) => fail(e.message || "Couldn't start the sign-up. Try again."))
                .finally(() => setSocial(""));
            return;
        }
        if (!code && !err) return;
        handled.current = true;
        navigate("/login", { replace: true });            // clean the URL (the code works once)
        if (err) {
            const name = PROVIDER_NAME[q.get("provider")] || "Google / Facebook";
            const why = q.get("reason");   // only sent when APP_DEBUG=true
            fail((SOCIAL_ERRORS[err] || SOCIAL_ERRORS.failed)(name) + (why ? ` (${why})` : ""));
            return;
        }
        let keep = true;
        try { keep = sessionStorage.getItem(REMEMBER_KEY) !== "0"; sessionStorage.removeItem(REMEMBER_KEY); } catch { /* blocked */ }
        setSocial("code");
        login(SOCIAL_USER, code, keep).then((res) => {
            setSocial("");
            if (res.error) { fail(res.error); return; }
            navigate("/", { replace: true });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Already logged in -> go to Home
    if (user) return <Navigate to="/" replace />;

    const startSocial = async (provider) => {
        setError("");
        setSocial(provider);
        try {
            try { sessionStorage.setItem(REMEMBER_KEY, remember ? "1" : "0"); } catch { /* blocked */ }
            const { url } = await apiFetch(`/auth/${provider}/url`);
            window.location.assign(url);                   // off to Google / Facebook
        } catch (e) {
            setSocial("");
            fail(e.message || `Couldn't start ${PROVIDER_NAME[provider]} sign-in.`);
        }
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

    // new client: create the account, sign in, then fill up the rest in Settings
    const createAccount = async (e) => {
        e.preventDefault();
        setError("");
        if (!su.trade_name.trim()) return fail("Enter your business (trade) name.");
        if (!su.last_name.trim() || !su.first_name.trim()) return fail("Enter your last and first name.");
        setBusy(true);
        try {
            const r = await apiFetch("/auth/signup", { method: "POST", body: JSON.stringify({ token: signup.token, ...su }) });
            const res = await login(SOCIAL_USER, r.code, remember);
            if (res.error) { setBusy(false); fail(res.error); return; }
            navigate("/settings?welcome=1", { replace: true });
        } catch (err) {
            setBusy(false);
            fail(err.message || "Couldn't create the account.");
        }
    };
    const setSuField = (k) => (e) => setSu((x) => ({ ...x, [k]: e.target.value }));

    const checkCaps = (e) => setCapsOn(!!e.getModifierState?.("CapsLock"));
    const locked = busy || !!social;

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
                    {signup ? (
                        <form key={`su${shake}`} className={`lg-form ${shake ? "lg-shake" : ""}`} onSubmit={createAccount} noValidate>
                            <header className="lg-head">
                                <h2>Create your account</h2>
                                <p>Start your <b>15-day free trial</b>. You can fill up the rest of your business details next.</p>
                            </header>

                            <div className="lg-su-who">
                                {signup.avatar ? <img src={signup.avatar} alt="" referrerPolicy="no-referrer" /> : <span>{(signup.name || "?")[0]}</span>}
                                <div>
                                    <b>{signup.name || signup.email}</b>
                                    <small>{signup.email || "No email from " + PROVIDER_NAME[signup.provider]} · {PROVIDER_NAME[signup.provider]}</small>
                                </div>
                            </div>

                            {error && <div className="lg-error" role="alert"><Icon name="alert" size={16} />{error}</div>}

                            <div className="lg-field lg-field-plain">
                                <input id="su-trade" autoFocus placeholder=" " value={su.trade_name} onChange={setSuField("trade_name")} maxLength={255} />
                                <label htmlFor="su-trade">Business / trade name</label>
                            </div>
                            <div className="lg-su-two">
                                <div className="lg-field lg-field-plain">
                                    <input id="su-last" placeholder=" " value={su.last_name} onChange={setSuField("last_name")} maxLength={100} />
                                    <label htmlFor="su-last">Last name</label>
                                </div>
                                <div className="lg-field lg-field-plain">
                                    <input id="su-first" placeholder=" " value={su.first_name} onChange={setSuField("first_name")} maxLength={100} />
                                    <label htmlFor="su-first">First name</label>
                                </div>
                            </div>
                            <div className="lg-su-two">
                                <div className="lg-field lg-field-plain">
                                    <input id="su-mid" placeholder=" " value={su.middle_name} onChange={setSuField("middle_name")} maxLength={100} />
                                    <label htmlFor="su-mid">Middle name (optional)</label>
                                </div>
                                <div className="lg-field lg-field-plain">
                                    <input id="su-phone" placeholder=" " inputMode="tel" value={su.phone} onChange={setSuField("phone")} maxLength={50} />
                                    <label htmlFor="su-phone">Mobile no. (optional)</label>
                                </div>
                            </div>

                            <ul className="lg-su-points">
                                <li><Icon name="check" size={14} /> 15 days free, no payment needed</li>
                                <li><Icon name="check" size={14} /> Next: Profile, Address, Compliance, Valid IDs, Business Accounts</li>
                                <li><Icon name="check" size={14} /> Sign in anytime with {PROVIDER_NAME[signup.provider]}</li>
                            </ul>

                            <button className="lg-submit" disabled={busy}>
                                {busy ? <><span className="lg-spinner" aria-hidden="true" /> Creating your account…</>
                                    : <>Create account &amp; start trial <Icon name="chevron" size={17} strokeWidth={2.5} /></>}
                            </button>
                            <button type="button" className="lg-link lg-su-back" disabled={busy}
                                onClick={() => { setSignup(null); setError(""); }}>
                                I already have an account – back to sign in
                            </button>
                        </form>
                    ) : (
                        <form key={shake} className={`lg-form ${shake ? "lg-shake" : ""}`} onSubmit={submit} noValidate>
                            <div className="lg-mobile-brand">
                                <span className="lg-logo">IGB</span>
                                <span className="lg-brand-name">IGB Accounting</span>
                            </div>

                            <header className="lg-head">
                                <h2>Welcome back</h2>
                                <p>Sign in to your account to continue.</p>
                            </header>

                            {/* Google / Facebook – only accounts linked in My profile / Settings */}
                            <button type="button" className="lg-google" disabled={locked} onClick={() => startSocial("google")}>
                                {social === "google" ? <span className="lg-spinner lg-spinner-dark" aria-hidden="true" /> : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                                        <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.23a4.47 4.47 0 0 1-1.94 2.93v2.43h3.14c1.84-1.69 2.92-4.18 2.92-7.39z" />
                                        <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.14-2.43c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.51A9.75 9.75 0 0 0 12 21.75z" />
                                        <path fill="#FBBC05" d="M6.54 13.85A5.86 5.86 0 0 1 6.23 12c0-.64.11-1.26.31-1.85V7.64H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.36l3.24-2.51z" />
                                        <path fill="#EA4335" d="M12 6.12c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.17 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.7 5.39l3.24 2.51C7.31 7.84 9.46 6.12 12 6.12z" />
                                    </svg>
                                )}
                                {social === "google" ? "Opening Google…" : "Continue with Google"}
                            </button>
                            <button type="button" className="lg-facebook" disabled={locked} onClick={() => startSocial("facebook")}>
                                {social === "facebook" ? <span className="lg-spinner lg-spinner-dark" aria-hidden="true" /> : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                                        <path fill="#1877F2" d="M24 12.07C24 5.43 18.63 0 12 0S0 5.43 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.43H7.08v-3.5h3.05V9.41c0-3.04 1.79-4.73 4.57-4.73 1.32 0 2.7.24 2.7.24v2.99h-1.52c-1.5 0-1.97.94-1.97 1.9v2.26h3.35l-.54 3.5h-2.81V24C19.61 23.08 24 18.09 24 12.07z" />
                                    </svg>
                                )}
                                {social === "facebook" ? "Opening Facebook…" : "Continue with Facebook"}
                            </button>
                            <p className="lg-su-hint">New client? Continue with Google or Facebook to start a <b>15-day free trial</b>.</p>
                            <div className="lg-divider"><span>or sign in with username</span></div>

                            {social === "code" && (
                                <div className="lg-caps" role="status"><span className="lg-spinner lg-spinner-dark" aria-hidden="true" /> Signing you in…</div>
                            )}

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

                            <button className="lg-submit" disabled={locked}>
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
                    )}

                    <p className="lg-foot">© {new Date().getFullYear()} IGB. All rights reserved.</p>
                </main>
            </div>
        </div>
    );
}