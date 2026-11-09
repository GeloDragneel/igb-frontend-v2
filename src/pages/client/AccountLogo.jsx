// Business account logo (S3 Company_logo/) — shown on the Information tab of the account popup.
// Used on printed forms (Purchase Order …).
import { useEffect, useRef, useState } from "react";
import { useToast } from "../../components/Toast";
import { apiBlob, apiFetch, apiUpload } from "../../context/AuthContext";

export default function AccountLogo({ accountId, logo, onChange }) {
    const notify = useToast();
    const fileRef = useRef(null);
    const [name, setName] = useState(logo || "");
    const [url, setUrl] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // load the saved logo
    useEffect(() => {
        let alive = true;
        let made = null;
        setUrl(null);
        if (!accountId || !name) return undefined;
        apiBlob(`/client-accounts/${accountId}/logo?v=${encodeURIComponent(name)}`)
            .then((b) => { if (alive) { made = URL.createObjectURL(b); setUrl(made); } })
            .catch(() => alive && setUrl(null));
        return () => { alive = false; if (made) URL.revokeObjectURL(made); };
    }, [accountId, name]);

    const pick = async (file) => {
        if (!file) return;
        setError("");
        if (!/^image\/(png|jpe?g)$/i.test(file.type)) return setError("Logo must be PNG or JPG.");
        if (file.size > 2 * 1024 * 1024) return setError("Logo is too big (2 MB max).");
        setBusy(true);
        try {
            const r = await apiUpload(`/client-accounts/${accountId}/logo`, file);
            setName(r.logo);
            onChange?.(r.logo);
            notify(r.message || "Logo saved.");
        } catch (e) {
            setError(e.message || "Couldn't upload the logo.");
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const remove = async () => {
        setBusy(true);
        setError("");
        try {
            const r = await apiFetch(`/client-accounts/${accountId}/logo`, { method: "DELETE" });
            setName("");
            onChange?.("");
            notify(r.message || "Logo removed.");
        } catch (e) {
            setError(e.message || "Couldn't remove the logo.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Logo</span>
            {!accountId ? (
                <p className="muted small" style={{ margin: 0 }}>Save the account first, then upload its logo.</p>
            ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div
                        style={{
                            width: 220, height: 80, borderRadius: 10, border: "1px dashed var(--border, #cbd5e1)",
                            display: "grid", placeItems: "center", overflow: "hidden", background: "var(--surface-2, #f8fafc)",
                        }}
                    >
                        {url
                            ? <img src={url} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                            : <span className="muted small">{name ? "Loading…" : "No logo"}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => pick(e.target.files?.[0])} />
                        <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                            {busy ? "Saving…" : name ? "Change logo" : "Upload logo"}
                        </button>
                        {name && <button type="button" className="btn" onClick={remove} disabled={busy}>Remove</button>}
                    </div>
                    <span className="muted small" style={{ flexBasis: "100%" }}>PNG or JPG, 2 MB max. Printed on the Purchase Order.</span>
                </div>
            )}
            {error && <div className="alert-error" role="alert" style={{ marginTop: 8 }}>{error}</div>}
        </div>
    );
}