// Task → Inventory → Settings (vertical tabs; only "Inventory Method" for now)
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../../components/SearchCard";
import { useAuth, apiFetch } from "../../../context/AuthContext";
import { INVENTORY_TABS } from "./inventoryMeta";
import "./InventorySettings.css";

const METHODS = [
  {
    value: "FIFO",
    label: "FIFO (First-In, First-Out)",
    text: "The oldest stock is sold first, so cost of goods sold uses the earliest purchase costs.",
  },
  {
    value: "WAC",
    label: "Weighted Average Cost (WAC)",
    text: "Every unit carries the same average cost, recomputed each time new stock is received.",
  },
  {
    value: "SPECIFIC",
    label: "Specific Identification",
    text: "Each item keeps its own actual cost. Best for unique or serialized items.",
  },
];
const DEFAULT = { inventory_method: "FIFO" };

// add more sections here later; each one is a vertical tab
const SECTIONS = [
  { key: "method", label: "Inventory Method", hint: "How stock is costed" },
];

export default function InventorySettings() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("method");
  const [saved, setSaved] = useState(DEFAULT);
  const [form, setForm] = useState(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const s = { ...DEFAULT, ...(await apiFetch("/inventory/settings")) };
      setSaved(s);
      setForm(s);
    } catch (e) {
      setError(e.message || "Couldn't load the inventory settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, user?.id, user?.caid]);

  const dirty = form.inventory_method !== saved.inventory_method;

  const save = async () => {
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const s = await apiFetch("/inventory/settings", { method: "PUT", body: JSON.stringify(form) });
      const next = { ...DEFAULT, ...s };
      setSaved(next);
      setForm(next);
      setMsg("Settings saved.");
    } catch (e) {
      setError(e.message || "Couldn't save the settings.");
    } finally {
      setSaving(false);
    }
  };

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => `${s.label} ${s.hint} ${METHODS.map((m) => m.label).join(" ")}`.toLowerCase().includes(q));
  }, [query]);

  const actions = [
    { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading || saving },
  ];

  return (
    <>
      <SearchCard query={query} setQuery={setQuery} placeholder="Search settings..." navTabs={INVENTORY_TABS} actions={actions} sticky />

      {error && (
        <div className="alert-error" role="alert">
          {error} <button className="btn btn-sm" onClick={load}>Try again</button>
        </div>
      )}

      <div className="inv-set">
        {/* vertical tabs */}
        <nav className="inv-set-nav" aria-label="Inventory settings">
          {sections.map((s) => (
            <button key={s.key} type="button" className={`inv-set-tab ${active === s.key ? "active" : ""}`} onClick={() => setActive(s.key)}>
              <span>{s.label}</span>
              <small>{s.hint}</small>
            </button>
          ))}
          {sections.length === 0 && <p className="muted small inv-set-empty">No settings match "{query}".</p>}
        </nav>

        {/* panel */}
        <section className="inv-set-panel">
          {active === "method" && (
            <>
              <header className="inv-set-head">
                <h3>Inventory Method</h3>
                <p className="muted">Choose how the cost of your stock and cost of goods sold are computed. Default is FIFO.</p>
              </header>

              <div className="inv-set-options" role="radiogroup" aria-label="Inventory method">
                {METHODS.map((m) => {
                  const on = form.inventory_method === m.value;
                  return (
                    <label key={m.value} className={`inv-set-opt ${on ? "on" : ""} ${loading ? "is-loading" : ""}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={loading || saving}
                        onChange={() => setForm((f) => ({ ...f, inventory_method: m.value }))}   // one only: checking one unchecks the others
                      />
                      <span className="inv-set-box" aria-hidden="true" />
                      <span className="inv-set-txt">
                        <b>{m.label}{m.value === "FIFO" && <em>Default</em>}</b>
                        <small>{m.text}</small>
                      </span>
                    </label>
                  );
                })}
              </div>

              <footer className="inv-set-foot">
                {msg && !dirty && <span className="inv-set-ok">{msg}</span>}
                {dirty && <span className="muted small">You have unsaved changes.</span>}
                <span className="inv-set-sp" />
                <button type="button" className="btn" onClick={() => setForm(saved)} disabled={!dirty || saving}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving || loading}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </footer>
            </>
          )}
        </section>
      </div>
    </>
  );
}
