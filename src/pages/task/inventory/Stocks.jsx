// Task → Inventory → Stocks (old Inventory_And_Services/Inventory.php)
// Ledger per item: Beg. Inventory · Delivery · Sold · Adjustment · End. Inventory, by day or month
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchCard from "../../../components/SearchCard";
import Modal, { Field } from "../../../components/Modal";
import ConfirmDialog from "../../../components/ConfirmDialog";
import SearchSelect from "../../../components/SearchSelect";
import { useToast } from "../../../components/Toast";
import { useAuth, apiFetch } from "../../../context/AuthContext";
import { INVENTORY_TABS } from "./inventoryMeta";

// Task → Inventory → Stocks (old Inventory_And_Services/Inventory.php)
// Ledger per item: Beg. Inventory · Delivery · Sold · Adjustment · End. Inventory, by day or month

const API = "/inventory/stocks";
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = (d) => d.toISOString().slice(0, 10);
const today = () => ymd(new Date());
const monthStart = () => today().slice(0, 8) + "01";
const thisMonth = () => today().slice(0, 7);
const lastDayOf = (ym) => { const [y, m] = ym.split("-").map(Number); return ymd(new Date(Date.UTC(y, m, 0))); };

const SUB_COLS = [["beginning", "Beg."], ["delivery", "Delivery"], ["sold", "Sold"], ["adjustment", "Adj."], ["ending", "End."]];
const GROUP_LINE = "2px solid var(--border, #d1d5db)";
const ALT_BG = "rgba(127,127,127,.05)";
const ALT_BG_SOLID = "var(--card-alt, #f7f7f8)";
const TOP = { position: "sticky", top: 0, zIndex: 2, whiteSpace: "nowrap" };
const SECOND = { position: "sticky", top: 38, zIndex: 2, whiteSpace: "nowrap", minWidth: 105 };
const STICKY_HEAD = { position: "sticky", left: 0, top: 0, zIndex: 5, background: "var(--card, #fff)", minWidth: 130, verticalAlign: "bottom" };
const STICKY_CELL = { position: "sticky", left: 0, zIndex: 1, background: "var(--card, #fff)", whiteSpace: "nowrap", minWidth: 130, boxShadow: "1px 0 0 var(--border, #e5e7eb)" };
const FOOT = { position: "sticky", bottom: 0, zIndex: 3, background: "var(--card, #fff)", borderTop: GROUP_LINE };

const linkStyle = { background: "none", border: 0, padding: 0, color: "var(--primary, #2563eb)", cursor: "pointer", font: "inherit", textDecoration: "underline" };

export default function Stocks() {
  const { user } = useAuth();
  const notify = useToast();

  const [lk, setLk] = useState(null);
  const [itemIds, setItemIds] = useState([]);
  const [mode, setMode] = useState("DAY");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [onlyAdj, setOnlyAdj] = useState(false);
  const [data, setData] = useState(null);         // { items: [{ item_id, description, rows, opening, closing }] }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(null);   // { itemId, itemName, type, periodKey, label }
  const [adjust, setAdjust] = useState(null);     // adjustment being added / edited

  useEffect(() => {
    apiFetch(`${API}/lookups`)
      .then((d) => { setLk(d); if (d.items.length) setItemIds([String(d.items[0].id)]); })
      .catch((e) => setError(e.message || "Couldn't load items."));
  }, [user?.id, user?.caid]);

  const changeMode = (m) => {
    setMode(m);
    if (m === "MONTH") { setFrom(thisMonth()); setTo(thisMonth()); }
    else { setFrom(monthStart()); setTo(today()); }
  };

  const load = useCallback(async () => {
    if (!itemIds.length) { setData(null); return; }
    const f = mode === "MONTH" ? `${from}-01` : from;
    const t = mode === "MONTH" ? lastDayOf(to) : to;
    if (!f || !t) return setError("Please select the dates.");
    if (f > t) return setError("Date From cannot be later than Date To.");
    setLoading(true);
    setError("");
    try {
      const ids = itemIds.map((id) => `item_ids[]=${id}`).join("&");
      setData(await apiFetch(`${API}/ledger?${ids}&from=${f}&to=${t}&mode=${mode}`));
    } catch (e) {
      setError(e.message || "Couldn't load the ledger.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [itemIds, mode, from, to]);

  // reload when the items or the view change (dates load on SEARCH, like the old page)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [itemIds, mode]);

  // pivot: one row per date, each item is a column group
  const items = data?.items || [];
  const byKey = useMemo(() => items.map((it) => Object.fromEntries(it.rows.map((r) => [r.key, r]))), [items]);
  const dates = useMemo(() => {
    const base = items[0]?.rows || [];
    return onlyAdj ? base.filter((d) => byKey.some((m) => (m[d.key]?.adjustment || 0) !== 0)) : base;
  }, [items, byKey, onlyAdj]);
  const colTotal = (i, k) => dates.reduce((n, d) => n + Number(byKey[i][d.key]?.[k] || 0), 0);

  const openAdd = () => setAdjust({ id: null, transaction_date: today(), declared_month: thisMonth(), item_id: itemIds[0] || "", qty: "", reason_id: "" });

  const cell = (it, r, k) =>
    Number(r[k] || 0) !== 0
      ? <button type="button" style={linkStyle} onClick={() => setDetails({ itemId: it.item_id, itemName: it.description, type: k, periodKey: r.key, label: r.label })}>{n2(r[k])}</button>
      : n2(r[k]);

  return (
    <>
      {/* no search box on Stocks (hidden only on this page) */}
      <style>{`.stocks-bar .pill-search { display: none !important; }`}</style>
      <div className="stocks-bar" style={{ display: "contents" }}>
        <SearchCard
          query=""
          setQuery={() => { }}
          navTabs={INVENTORY_TABS}
          actions={[
            { label: onlyAdj ? "Clear Adjustment" : "See Adjustment", icon: "filter", onClick: () => setOnlyAdj((v) => !v) },
            { label: loading ? "Loading…" : "Search", icon: "refresh", onClick: load, disabled: loading || !itemIds.length },
            { label: "Add Adjustment", icon: "plus", variant: "primary", onClick: openAdd, disabled: !lk },
          ]}
          extra={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <ItemPicker items={lk?.items || []} value={itemIds} onChange={setItemIds} />
              <select className="input" value={mode} onChange={(e) => changeMode(e.target.value)} aria-label="View" style={{ width: 120 }}>
                <option value="DAY">Daily</option>
                <option value="MONTH">Monthly</option>
              </select>
              <input className="input" type={mode === "MONTH" ? "month" : "date"} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Date From" style={{ width: 160 }} />
              <span className="muted">to</span>
              <input className="input" type={mode === "MONTH" ? "month" : "date"} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Date To" style={{ width: 160 }} />
            </div>
          }
          sticky
        />
      </div>

      {error && <div className="alert-error" role="alert">{error}</div>}
      {lk && !lk.items.length && <div className="alert-error" role="alert">No inventory items yet. Add items with Item Class = Inventory in Setup → Products.</div>}

      <section className="card table-card">
        <div className="table-scroll scroll-body" style={{ maxHeight: "calc(100vh - 330px)", overflow: "auto" }}>
          <table className="table stocks-pivot" style={{ minWidth: 150 + Math.max(items.length, 1) * 5 * 115, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={STICKY_HEAD}>Date</th>
                {items.map((it, i) => (
                  <th key={it.item_id} colSpan={5} className="ta-center" title={it.item_code}
                    style={{ ...TOP, borderLeft: GROUP_LINE, background: i % 2 ? ALT_BG : "var(--card, #fff)" }}>
                    <span style={{ display: "block", maxWidth: 520, margin: "0 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.description}
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                {items.map((it, i) => SUB_COLS.map(([k, label], j) => (
                  <th key={`${it.item_id}-${k}`} className="ta-right"
                    style={{ ...SECOND, borderLeft: j === 0 ? GROUP_LINE : undefined, background: i % 2 ? ALT_BG : "var(--card, #fff)" }}>
                    {label}
                  </th>
                )))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, r) => (
                <tr key={r}><td style={STICKY_CELL}><span className="sk sk-cell" style={{ width: 80 }} /></td>
                  {Array.from({ length: Math.max(items.length, 1) * 5 }).map((__, c) => <td key={c}><span className="sk sk-cell" style={{ width: "60%" }} /></td>)}
                </tr>
              ))}
              {!loading && dates.length === 0 && (
                <tr><td colSpan={1 + items.length * 5} className="empty">{itemIds.length ? "No inventory ledger for the selected items and dates." : "Select one or more items."}</td></tr>
              )}
              {!loading && dates.map((d) => (
                <tr key={d.key}>
                  <td style={STICKY_CELL}>{d.label}</td>
                  {items.map((it, i) => {
                    const r = byKey[i][d.key] || {};
                    return SUB_COLS.map(([k], j) => (
                      <td key={`${it.item_id}-${k}`} className={`ta-right mono${k === "ending" ? " strong" : ""}`}
                        style={{ borderLeft: j === 0 ? GROUP_LINE : undefined, background: i % 2 ? ALT_BG : undefined }}>
                        {["delivery", "sold", "adjustment"].includes(k) ? cell(it, { ...r, key: d.key, label: d.label }, k) : n2(r[k])}
                      </td>
                    ));
                  })}
                </tr>
              ))}
            </tbody>
            {!loading && dates.length > 0 && (
              <tfoot>
                <tr>
                  <td className="strong" style={{ ...STICKY_CELL, ...FOOT, zIndex: 4 }}>Total</td>
                  {items.map((it, i) => SUB_COLS.map(([k], j) => (
                    <td key={`${it.item_id}-${k}`} className="ta-right mono strong"
                      style={{ ...FOOT, borderLeft: j === 0 ? GROUP_LINE : undefined, background: i % 2 ? ALT_BG_SOLID : "var(--card, #fff)" }}>
                      {k === "beginning" ? n2(it.opening) : k === "ending" ? n2(it.closing) : n2(colTotal(i, k))}
                    </td>
                  )))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {details && (
        <DetailsModal
          mode={mode}
          {...details}
          onClose={() => setDetails(null)}
          onEdit={(r) => { setDetails(null); setAdjust({ id: r.id, transaction_date: r.date, declared_month: r.declared_month || r.date.slice(0, 7), item_id: String(r.item_id), qty: r.qty, reason_id: String(r.reason_id || "") }); }}
          onDeleted={() => { setDetails(null); notify("Adjustment deleted"); load(); }}
        />
      )}
      {adjust && (
        <AdjustmentModal
          initial={adjust}
          lookups={lk}
          onClose={() => setAdjust(null)}
          onSaved={(msg) => { setAdjust(null); notify(msg); load(); }}
        />
      )}
    </>
  );
}

/* ---------- Item picker: tick one or more items ---------- */
function ItemPicker({ items, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);

  useEffect(() => { if (open) { setDraft(value); setQ(""); } }, [open, value]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const shown = items.filter((i) => `${i.description} ${i.item_code}`.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const apply = () => { onChange(draft); setOpen(false); };

  const label = !value.length ? "Select items"
    : value.length === 1 ? (items.find((i) => String(i.id) === value[0])?.description || "1 item")
      : `${value.length} items selected`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="input" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        style={{ minWidth: 240, textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>{label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="card" role="dialog" aria-label="Select items"
          style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, width: 340, padding: 10, boxShadow: "0 12px 30px rgba(0,0,0,.18)" }}>
          <input className="input" autoFocus placeholder="Search item..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <button type="button" className="btn btn-sm" onClick={() => setDraft([...new Set([...draft, ...shown.map((i) => String(i.id))])])}>Select all{q ? " shown" : ""}</button>
            <button type="button" className="btn btn-sm" onClick={() => setDraft([])}>Clear</button>
            <span className="muted small" style={{ marginLeft: "auto", alignSelf: "center" }}>{draft.length} selected</span>
          </div>
          <div style={{ maxHeight: 260, overflow: "auto", borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 4 }}>
            {shown.length === 0 && <div className="muted small" style={{ padding: 8 }}>No items found.</div>}
            {shown.map((i) => {
              const id = String(i.id);
              return (
                <label key={id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 4px", cursor: "pointer" }}>
                  <input type="checkbox" checked={draft.includes(id)} onChange={() => toggle(id)} />
                  <span style={{ flex: 1 }}>{i.description || i.item_code}</span>
                  <span className="muted small mono">{i.item_code}</span>
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={apply} disabled={!draft.length}>Show {draft.length || ""} item{draft.length === 1 ? "" : "s"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Delivery / Sold / Adjustment popup (old modal_PopupDetails) ---------- */
function DetailsModal({ itemId, itemName, mode, type, periodKey: k, label, onClose, onEdit, onDeleted }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    apiFetch(`${API}/details?item_id=${itemId}&key=${k}&mode=${mode}&type=${type}`)
      .then(setRows)
      .catch((e) => setError(e.message || "Couldn't load."));
  }, [itemId, k, mode, type]);

  const isAdj = type === "adjustment";
  const title = { delivery: "Delivery", sold: "Sold", adjustment: "Adjustment" }[type];
  const totalQty = (rows || []).reduce((n, r) => n + Number(r.qty || 0), 0);
  const totalAmt = (rows || []).reduce((n, r) => n + Number(r.total || 0), 0);

  const remove = async () => {
    try { await apiFetch(`${API}/adjustments/${toDelete.id}`, { method: "DELETE" }); onDeleted(); }
    catch (e) { setError(e.message || "Couldn't delete."); setToDelete(null); }
  };

  return (
    <Modal title={`${title} · ${itemName ? itemName + " · " : ""}${label}`} onClose={onClose} size="lg">
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th className="ta-right">Qty</th>
              {!isAdj && <th className="ta-right">Price</th>}
              {!isAdj && <th className="ta-right">Total</th>}
              <th>{isAdj ? "Reason" : "Reference"}</th>
              {isAdj && <th />}
            </tr>
          </thead>
          <tbody>
            {!rows && !error && <tr><td colSpan={6}><span className="sk sk-cell" style={{ width: "60%" }} /></td></tr>}
            {rows?.length === 0 && <tr><td colSpan={6} className="empty">Nothing here.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td className="ta-right mono">{n2(r.qty)}</td>
                {!isAdj && <td className="ta-right mono">{n2(r.price)}</td>}
                {!isAdj && <td className="ta-right mono">{n2(r.total)}</td>}
                <td className="mono">{r.reference || "—"}</td>
                {isAdj && (
                  <td className="ta-right" style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-sm" onClick={() => onEdit(r)}>Edit</button>{" "}
                    <button className="btn btn-sm btn-danger" onClick={() => setToDelete(r)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {rows?.length > 0 && (
            <tfoot>
              <tr>
                <td />
                <td className="ta-right mono strong">{n2(totalQty)}</td>
                {!isAdj && <td />}
                {!isAdj && <td className="ta-right mono strong">{n2(totalAmt)}</td>}
                <td />
                {isAdj && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {toDelete && (
        <ConfirmDialog title="Delete this adjustment?" message={`${n2(toDelete.qty)} on ${toDelete.date} will be removed from stock.`}
          confirmLabel="Delete" onCancel={() => setToDelete(null)} onConfirm={remove} />
      )}
    </Modal>
  );
}

/* ---------- Inventory Adjustment (old modal_Inventory_Adjustment) ---------- */
function AdjustmentModal({ initial, lookups, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const itemOpts = [{ value: "", label: "— None —" }, ...lookups.items.map((i) => ({ value: String(i.id), label: i.description || i.item_code, hint: i.item_code }))];
  const reasonOpts = [{ value: "", label: "— None —" }, ...lookups.reasons.map((r) => ({ value: String(r.id), label: r.name }))];
  const item = lookups.items.find((i) => String(i.id) === String(f.item_id));

  const submit = async () => {
    if (!f.declared_month) return setError("Declared Month is required.");
    if (!f.item_id) return setError("Item is required.");
    if (!item?.inventory_account || item.inventory_account === "0") return setError("The selected item has no inventory account (GL Inventory Account).");
    if (f.qty === "" || Number(f.qty) === 0) return setError("Qty is required.");
    if (!f.reason_id) return setError("Reason is required.");
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(f.id ? `${API}/adjustments/${f.id}` : `${API}/adjustments`, {
        method: f.id ? "PUT" : "POST",
        body: JSON.stringify({ ...f, item_id: Number(f.item_id), qty: Number(f.qty), reason_id: Number(f.reason_id) }),
      });
      onSaved(res.message || "Record successfully saved");
    } catch (e) {
      setError(e.message || "Couldn't save.");
      setSaving(false);
    }
  };

  return (
    <Modal
      title={f.id ? "Edit Inventory Adjustment" : "Inventory Adjustment"}
      onClose={onClose}
      size="sm"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Submit"}</button></>}
    >
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Date"><input type="date" className="input" value={f.transaction_date} onChange={(e) => set("transaction_date", e.target.value)} /></Field>
        <Field label="Declared Month"><input type="month" className="input" value={f.declared_month} onChange={(e) => set("declared_month", e.target.value)} /></Field>
        <div className="field">
          <span className="field-label">Item</span>
          <SearchSelect value={String(f.item_id || "")} onChange={(v) => set("item_id", v)} options={itemOpts} searchPlaceholder="Search item..." aria-label="Item" />
        </div>
        <Field label="Qty (use minus to remove)">
          <input className="input ta-right" inputMode="decimal" value={f.qty} onChange={(e) => set("qty", e.target.value.replace(/[^\d.-]/g, ""))} placeholder="e.g. 5 or -2" />
        </Field>
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <span className="field-label">Remarks</span>
        <SearchSelect value={String(f.reason_id || "")} onChange={(v) => set("reason_id", v)} options={reasonOpts} searchPlaceholder="Search reason..." aria-label="Reason" />
      </div>
    </Modal>
  );
}