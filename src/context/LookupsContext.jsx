import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth, apiFetch } from "./AuthContext";

/*
  Dropdown lists (customers, items, accounts, ATC, document types, invoice statuses).
  Loaded once after login, saved in localStorage, reused on every page.
  - Shows the saved copy immediately
  - Refreshes quietly in the background if older than MAX_AGE
  - Reloads when the user switches branch
*/

const PREFIX = "igb-lookups:";
const MAX_AGE = 10 * 60 * 1000; // 10 minutes

const LookupsContext = createContext(null);

const read = (key) => {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const write = (key, data) => {
    try {
        // keep only the current account's copy
        Object.keys(localStorage)
            .filter((k) => k.startsWith(PREFIX) && k !== PREFIX + key)
            .forEach((k) => localStorage.removeItem(k));
        localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
    } catch {
        /* storage full – still works from memory */
    }
};

export function LookupsProvider({ children }) {
    const { user } = useAuth();
    const key = user ? `${user.type}-${user.id}-${user.caid ?? 0}` : null;

    const [lookups, setLookupsState] = useState(() => (key ? read(key)?.data : null) || null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const refresh = useCallback(async () => {
        if (!key) return null;
        setLoading(true);
        setError("");
        try {
            const data = await apiFetch("/sales/lookups");
            write(key, data);
            setLookupsState(data);
            return data;
        } catch (e) {
            setError(e.message || "Couldn't load lists.");
            return null;
        } finally {
            setLoading(false);
        }
    }, [key]);

    // On login / branch switch: use the saved copy, refresh if old or missing
    useEffect(() => {
        if (!key) {
            setLookupsState(null);
            return;
        }
        const saved = read(key);
        setLookupsState(saved?.data || null);
        if (!saved || Date.now() - saved.at > MAX_AGE) refresh();
    }, [key, refresh]);

    // Update the list after adding a customer / item (and save it)
    const setLookups = useCallback(
        (updater) => {
            setLookupsState((prev) => {
                const next = typeof updater === "function" ? updater(prev) : updater;
                if (key && next) write(key, next);
                return next;
            });
        },
        [key]
    );

    const value = useMemo(
        () => ({ lookups, ready: !!lookups, loading, error, refresh, setLookups }),
        [lookups, loading, error, refresh, setLookups]
    );

    return <LookupsContext.Provider value={value}>{children}</LookupsContext.Provider>;
}

export const useLookups = () => useContext(LookupsContext);

// Call on logout
export function clearLookups() {
    try {
        Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
}