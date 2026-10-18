import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { today } from "../utils/format";

// Global reporting period shown at the top of the sidebar.
// Use it in any page with: const { from, to } = usePeriod();

const PeriodContext = createContext(null);
const KEY = "bizdesk-period";

export const monthRange = (iso = today(), offset = 0) => {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const f = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: f(d), to: f(last) };
};

export function PeriodProvider({ children }) {
  const [period, setPeriod] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved?.from && saved?.to) return saved;
    } catch { /* ignore */ }
    return monthRange();
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(period)); } catch { /* ignore */ }
  }, [period]);

  const value = useMemo(() => ({ ...period, setPeriod }), [period]);
  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export const usePeriod = () => useContext(PeriodContext);
