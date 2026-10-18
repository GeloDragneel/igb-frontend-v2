import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initialData } from "../data/sampleData";
import { round2 } from "../utils/format";
import { saleSummary, saleStockLines } from "../utils/salesCalc";

const STORAGE_KEY = "bizdesk-data-v1";
const AppDataContext = createContext(null);

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // merge so collections added later (e.g. accounts) still get their sample data
      if (parsed && parsed.products && parsed.sales) return { ...structuredClone(initialData), ...parsed };
    }
  } catch {
    /* ignore broken storage */
  }
  return structuredClone(initialData);
}

/* ---------- stock helpers ---------- */

// Sale takes stock out (void / cancelled invoices don't)
export const isVoided = (s) => s && (s.status === "Void" || s.status === "Cancelled");
const saleEffect = (sale) => {
  const d = {};
  if (!sale || isVoided(sale)) return d;
  saleStockLines(sale).forEach((i) => (d[i.product] = (d[i.product] || 0) - Number(i.qty || 0)));
  return d;
};

// Purchase adds stock only when Received
const purchaseEffect = (p) => {
  const d = {};
  if (p && p.status === "Received") {
    p.items.forEach((i) => (d[i.product] = (d[i.product] || 0) + Number(i.qty || 0)));
  }
  return d;
};

const combine = (...deltas) => {
  const out = {};
  deltas.forEach((d) => Object.entries(d).forEach(([k, v]) => (out[k] = (out[k] || 0) + v)));
  return out;
};
const negate = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, -v]));

// Returns { products } or { error }
function applyStock(products, delta) {
  const next = products.map((p) => (delta[p.code] ? { ...p, stock: p.stock + delta[p.code] } : p));
  const bad = next.find((p) => p.stock < 0);
  if (bad) {
    const had = products.find((p) => p.code === bad.code).stock;
    return { error: `Not enough stock for ${bad.name}. Available: ${had} ${bad.unit}.` };
  }
  return { products: next };
}

/* ---------- derived helpers (exported for pages) ---------- */

export const saleTotals = (s) => saleSummary(s);

export const saleBalance = (s) => {
  if (isVoided(s) || s.status === "Paid") return 0;
  const { total } = saleTotals(s);
  if (s.status === "Partial") return Math.max(0, round2(total - Number(s.paid || 0)));
  return total;
};

export const expenseWtax = (e) => {
  const rates = { WC158: 0.01, WC160: 0.02, WC120: 0.02, WC100: 0.05 };
  return round2(Number(e.amount || 0) * (rates[e.atc] || 0));
};

/* ---------- provider ---------- */

export function AppDataProvider({ children }) {
  const [data, setDataState] = useState(loadData);
  const ref = useRef(data);

  // Updates are computed synchronously from the latest data so we can
  // return { ok } / { error } to the caller right away.
  const commit = useCallback((next) => {
    ref.current = next;
    setDataState(next);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or blocked – app still works in memory */
    }
  }, [data]);

  const api = useMemo(() => {
    const upsert = (list, key, item, originalKey) => {
      const k = originalKey ?? item[key];
      return list.some((r) => r[key] === k) ? list.map((r) => (r[key] === k ? item : r)) : [item, ...list];
    };

    const clash = (list, key, item, originalKey) => {
      const k = originalKey ?? item[key];
      return list.some((r) => r[key] === item[key] && r[key] !== k);
    };

    /* Sales */
    const saveSale = (sale, originalKey) => {
      const d = ref.current;
      if (clash(d.sales, "invoiceNo", sale, originalKey)) return { error: `${sale.invoiceNo} already exists.` };
      const old = originalKey ? d.sales.find((s) => s.invoiceNo === originalKey) : null;
      const res = applyStock(d.products, combine(negate(saleEffect(old)), saleEffect(sale)));
      if (res.error) return { error: res.error };
      commit({ ...d, products: res.products, sales: upsert(d.sales, "invoiceNo", sale, originalKey) });
      return { ok: true };
    };

    const deleteSales = (keys) => {
      const d = ref.current;
      const removed = d.sales.filter((s) => keys.includes(s.invoiceNo));
      const res = applyStock(d.products, combine(...removed.map((s) => negate(saleEffect(s)))));
      commit({ ...d, products: res.products || d.products, sales: d.sales.filter((s) => !keys.includes(s.invoiceNo)) });
      return { ok: true };
    };

    /* Purchases */
    const savePurchase = (po, originalKey) => {
      const d = ref.current;
      if (clash(d.purchases, "poNo", po, originalKey)) return { error: `${po.poNo} already exists.` };
      const old = originalKey ? d.purchases.find((p) => p.poNo === originalKey) : null;
      const res = applyStock(d.products, combine(negate(purchaseEffect(old)), purchaseEffect(po)));
      if (res.error) return { error: res.error + " Some of this stock was already sold." };
      commit({ ...d, products: res.products, purchases: upsert(d.purchases, "poNo", po, originalKey) });
      return { ok: true };
    };

    const deletePurchases = (keys) => {
      const d = ref.current;
      const removed = d.purchases.filter((p) => keys.includes(p.poNo));
      const res = applyStock(d.products, combine(...removed.map((p) => negate(purchaseEffect(p)))));
      if (res.error) return { error: res.error + " Some of this stock was already sold." };
      commit({ ...d, products: res.products, purchases: d.purchases.filter((p) => !keys.includes(p.poNo)) });
      return { ok: true };
    };

    /* Simple collections */
    const simple = (collection, key) => ({
      save: (item, originalKey) => {
        const d = ref.current;
        if (clash(d[collection], key, item, originalKey)) return { error: `${item[key]} already exists.` };
        commit({ ...d, [collection]: upsert(d[collection], key, item, originalKey) });
        return { ok: true };
      },
      remove: (keys) => {
        const d = ref.current;
        commit({ ...d, [collection]: d[collection].filter((r) => !keys.includes(r[key])) });
        return { ok: true };
      },
    });

    const ex = simple("expenses", "refNo");
    const pr = simple("products", "code");
    const cu = simple("customers", "code");
    const ac = simple("accounts", "code");

    return {
      saveSale, deleteSales,
      savePurchase, deletePurchases,
      saveExpense: ex.save, deleteExpenses: ex.remove,
      saveProduct: pr.save, deleteProducts: pr.remove,
      saveCustomer: cu.save, deleteCustomers: cu.remove,
      saveAccount: ac.save, deleteAccounts: ac.remove,
      resetData: () => commit(structuredClone(initialData)),
    };
  }, [commit]);

  const value = useMemo(() => ({ ...data, ...api }), [data, api]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used inside <AppDataProvider>");
  return ctx;
}