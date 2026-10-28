// Sign-in methods: link / unlink Google and Facebook to this login
//   <SocialLinks />  (My profile for staff, Settings → Sign-in for clients)
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "./Toast";
import { apiFetch } from "../context/AuthContext";
import "./SocialLinks.css";

const NAME = { google: "Google", facebook: "Facebook" };
const ERR = {
    taken: (p) => `That ${p} account is already linked to another FEMS login.`,
    cancelled: (p) => `${p} linking was cancelled.`,
    expired: () => "Linking took too long. Try again.",
    failed: (p) => `Couldn't link ${p}. Try again.`,
};
const Logo = ({ p }) => (p === "google" ? (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.23a4.47 4.47 0 0 1-1.94 2.93v2.43h3.14c1.84-1.69 2.92-4.18 2.92-7.39z" />
        <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.14-2.43c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.51A9.75 9.75 0 0 0 12 21.75z" />
        <path fill="#FBBC05" d="M6.54 13.85A5.86 5.86 0 0 1 6.23 12c0-.64.11-1.26.31-1.85V7.64H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.36l3.24-2.51z" />
        <path fill="#EA4335" d="M12 6.12c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.17 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.7 5.39l3.24 2.51C7.31 7.84 9.46 6.12 12 6.12z" />
    </svg>
) : (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#1877F2" d="M24 12.07C24 5.43 18.63 0 12 0S0 5.43 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.43H7.08v-3.5h3.05V9.41c0-3.04 1.79-4.73 4.57-4.73 1.32 0 2.7.24 2.7.24v2.99h-1.52c-1.5 0-1.97.94-1.97 1.9v2.26h3.35l-.54 3.5h-2.81V24C19.61 23.08 24 18.09 24 12.07z" />
    </svg>
));

export default function SocialLinks({ compact = false }) {
    const notify = useToast();
    const location = useLocation();
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    const [busy, setBusy] = useState("");

    const load = useCallback(() => apiFetch("/auth/social").then(setRows).catch(() => setRows([])), []);
    useEffect(() => { load(); }, [load]);

    // back from Google / Facebook
    useEffect(() => {
        const q = new URLSearchParams(location.search);
        const ok = q.get("social_linked"), err = q.get("social_error");
        if (!ok && !err) return;
        const p = NAME[ok || q.get("provider")] || "Google / Facebook";
        if (ok) notify(`${p} linked. You can now sign in with ${p}.`);
        else notify((ERR[err] || ERR.failed)(p), "error");
        ["social_linked", "social_error", "provider"].forEach((k) => q.delete(k));
        navigate({ pathname: location.pathname, search: q.toString() ? `?${q}` : "" }, { replace: true });
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const link = async (p) => {
        setBusy(p);
        try {
            const { url } = await apiFetch(`/auth/${p}/link-url?${new URLSearchParams({ back: location.pathname })}`);
            window.location.assign(url);
        } catch (e) {
            setBusy("");
            notify(e.message || `Couldn't start ${NAME[p]} linking.`, "error");
        }
    };
    const unlink = async (p) => {
        setBusy(p);
        try {
            const r = await apiFetch(`/auth/social/${p}`, { method: "DELETE" });
            notify(r.message || `${NAME[p]} unlinked.`);
            load();
        } catch (e) {
            notify(e.message || "Couldn't unlink.", "error");
        } finally {
            setBusy("");
        }
    };

    return (
        <div className={`sl${compact ? " is-compact" : ""}`}>
            {!compact && (
                <div className="sl-head">
                    <b>Sign-in methods</b>
                    <span>Link Google or Facebook, then use it on the login page instead of your password.</span>
                </div>
            )}
            {!rows && <div className="sl-row"><span className="sk sk-cell" style={{ width: "60%" }} /></div>}
            {rows?.map((r) => (
                <div key={r.provider} className={`sl-row${r.linked ? " is-linked" : ""}`}>
                    <span className="sl-logo"><Logo p={r.provider} /></span>
                    <div className="sl-main">
                        <b>{NAME[r.provider]}</b>
                        <small>{r.linked ? (r.email || r.name || "Linked") : r.enabled ? "Not linked" : "Not set up on the server yet"}</small>
                    </div>
                    {r.linked
                        ? <button type="button" className="btn btn-sm" onClick={() => unlink(r.provider)} disabled={!!busy}>{busy === r.provider ? "…" : "Unlink"}</button>
                        : <button type="button" className="btn btn-sm btn-primary" onClick={() => link(r.provider)} disabled={!!busy || !r.enabled}>{busy === r.provider ? "Opening…" : "Link"}</button>}
                </div>
            ))}
        </div>
    );
}
