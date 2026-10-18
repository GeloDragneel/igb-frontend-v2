import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { clearLookups } from "./LookupsContext";
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
const KEY = "igb-auth";
const AuthContext = createContext(null);

function readSession() {
    try {
        const raw = localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

// Save to whichever storage the session is already in (remember me / this tab only)
function writeSession(next) {
    const store = localStorage.getItem(KEY) ? localStorage : sessionStorage;
    store.setItem(KEY, JSON.stringify(next));
}

// fetch with the login token; use this for all API calls
export async function apiFetch(path, options = {}) {
    const session = readSession();
    const res = await fetch(`${API}${path}`, {
        ...options,
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
            ...options.headers,
        },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = body.message || Object.values(body.errors || {})[0]?.[0] || `Request failed (${res.status})`;
        throw Object.assign(new Error(msg), { status: res.status });
    }
    return body;
}

export function AuthProvider({ children }) {
    const [session, setSession] = useState(readSession);

    // Returns { ok } or { error }
    const login = useCallback(async (username, password, remember) => {
        try {
            const data = await apiFetch("/login", {
                method: "POST",
                body: JSON.stringify({ username: username.trim(), password }),
            });
            const s = { token: data.token, user: data.user, branch: null };
            (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s));
            (remember ? sessionStorage : localStorage).removeItem(KEY);
            setSession(s);
            return { ok: true };
        } catch (e) {
            if (e.status === 429) return { error: "Too many attempts. Wait a minute and try again." };
            if (e.status) return { error: e.message };
            return { error: "Can't reach the server. Check that the backend is running." };
        }
    }, []);

    const logout = useCallback(async () => {
        try { await apiFetch("/logout", { method: "POST" }); } catch { /* token may already be gone */ }
        localStorage.removeItem(KEY);
        sessionStorage.removeItem(KEY);
        clearLookups();
        setSession(null);
    }, []);

    // Staff: remember the selected client branch
    const selectBranch = useCallback(async (caid) => {
        try {
            const data = await apiFetch("/switch-branch", {
                method: "POST",
                body: JSON.stringify({ caid: Number(caid) }),
            });
            setSession(() => {
                const next = { token: data.token, user: data.user, branch: data.branch };
                writeSession(next);
                return next;
            });
            return { ok: true, branch: data.branch };
        } catch (e) {
            return { error: e.message || "Couldn't switch branch." };
        }
    }, []);

    const value = useMemo(
        () => ({
            user: session?.user || null,
            token: session?.token || null,
            branch: session?.branch || null,
            login,
            logout,
            selectBranch,
        }),
        [session, login, logout, selectBranch]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function RequireAuth({ children }) {
    const { user } = useAuth();
    const location = useLocation();
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    return children;
}

export const TEMP_USERS = [];

// Download a file with the login token (for previews)
export async function apiBlob(path) {
    const session = readSession();
    const res = await fetch(`${API}${path}`, {
        headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.message || `Request failed (${res.status})`), { status: res.status });
    }
    return res.blob();
}

// Upload a file (multipart) with the login token
export async function apiUpload(path, file, field = "file") {
    const session = readSession();
    const form = new FormData();
    form.append(field, file);
    const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: {
            Accept: "application/json",
            ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = body.message || Object.values(body.errors || {})[0]?.[0] || `Upload failed (${res.status})`;
        throw Object.assign(new Error(msg), { status: res.status });
    }
    return body;
}
// POST FormData (fields + files) with the login token
export async function apiForm(path, formData) {
    const session = readSession();
    const res = await fetch(`${API}${path}`, {
        method: "POST",
        headers: {
            Accept: "application/json",
            ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: formData,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = body.message || Object.values(body.errors || {})[0]?.[0] || `Request failed (${res.status})`;
        throw Object.assign(new Error(msg), { status: res.status });
    }
    return body;
}