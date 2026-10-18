// Monitoring → Reconciliation Monitoring (old pages/Monitoring/Reconciliation_Monitoring)
// One row per client, 12 months × LOCKED / PRINTED / STATUS. ▸ opens the client's branch accounts.
// LOCKED = declared month settings row for the account (unlock needs a supervisor) · PRINTED needs LOCKED first
// STATUS = compliances ticked for the month (only the audit supervisor can tick)
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal, { Field } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./Reconciliation.css";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const NO_DATA = { description: "No data in the system", color_code: "#e8eaed" };
const TICKED = "#0a53a8";
const THIS_YEAR = new Date().getFullYear();
const mm = (i) => String(i + 1).padStart(2, "0");
const textOn = (hex) => (String(hex).toLowerCase() === "#e8eaed" ? "#000" : "#fff");

export default function Reconciliation() {
  const notify = useToast();
  const [year, setYear] = useState(THIS_YEAR);
  const [data, setData] = useState(null); // { rows, colors, can_status, can_lock, years }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [children, setChildren] = useState({}); // clientNum → rows | "loading"
  const [busy, setBusy] = useState(() => new Set()); // "ca:month:field"
  const [popover, setPopover] = useState(null); // { row, month, rect, items|null }
  const [override, setOverride] = useState(null); // pending unlock { row, month }
  const reqId = useRef(0);

  const load = useCallback(async (y) => {
    const id = ++reqId.current;
    setLoading(true);
    setError("");
    setChildren({});
    setPopover(null);
    try {
      const res = await apiFetch(`/monitoring/reconciliation?year=${y}`);
      if (id === reqId.current) setData(res);
    } catch (e) {
      if (id === reqId.current) { setError(e.message || "Couldn't load the monitoring list."); setData(null); }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(year); }, [year, load]);

  const colorById = useMemo(() => {
    const m = {};
    (data?.colors || []).forEach((c) => { m[c.id] = c; });
    return m;
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data?.rows || [];
    return q ? list.filter((r) => `${r.client_num} ${r.name}`.toLowerCase().includes(q)) : list;
  }, [data, query]);

  // footer: checked boxes per month across every row on screen (clients + opened branch accounts)
  const totals = useMemo(() => {
    const t = MONTHS.map(() => ({ locked: 0, printed: 0 }));
    const add = (r) => r.months.forEach((m, i) => { if (m.locked) t[i].locked += 1; if (m.printed) t[i].printed += 1; });
    rows.forEach((r) => {
      add(r);
      if (Array.isArray(children[r.client_num])) children[r.client_num].forEach(add);
    });
    return t;
  }, [rows, children]);

  /* ---------- state updates (client rows + their branch rows) ---------- */
  const patchMonth = (pred, i, patch) => {
    const fix = (r) => (pred(r) ? { ...r, months: r.months.map((m, k) => (k === i ? { ...m, ...patch } : m)) } : r);
    setData((d) => (d ? { ...d, rows: d.rows.map(fix) } : d));
    setChildren((c) => {
      const out = {};
      Object.entries(c).forEach(([k, v]) => { out[k] = Array.isArray(v) ? v.map(fix) : v; });
      return out;
    });
  };
  // printed + status belong to the client, locked to the account
  const byClient = (cid) => (r) => r.client_id === cid;
  const byAccount = (caid) => (r) => r.ca_id === caid;

  const toggleChildren = async (r) => {
    if (r.count_acc <= 1) return;
    if (children[r.client_num]) {
      setChildren((c) => { const n = { ...c }; delete n[r.client_num]; return n; });
      return;
    }
    setChildren((c) => ({ ...c, [r.client_num]: "loading" }));
    try {
      const res = await apiFetch(`/monitoring/reconciliation/${encodeURIComponent(r.client_num)}/accounts?year=${year}`);
      const list = res.rows.map((a) => ({ ...a, client_id: r.client_id, client_num: r.client_num, compliance_ids: r.compliance_ids, child: true }));
      setChildren((c) => ({ ...c, [r.client_num]: list }));
    } catch (e) {
      notify(e.message || "Couldn't load the branch accounts.", "error");
      setChildren((c) => { const n = { ...c }; delete n[r.client_num]; return n; });
    }
  };

  /* ---------- locked / printed ---------- */
  const sendFlag = async (row, i, field, value, creds = {}) => {
    const key = `${row.ca_id}:${i}:${field}`;
    setBusy((b) => new Set(b).add(key));
    const pred = field === "locked" ? byAccount(row.ca_id) : byClient(row.client_id);
    const before = row.months[i][field];
    patchMonth(pred, i, { [field]: value });
    try {
      await apiFetch("/monitoring/reconciliation/flag", {
        method: "PUT",
        body: JSON.stringify({ client_id: row.client_id, ca_id: row.ca_id, month: `${year}-${mm(i)}`, field, value, ...creds }),
      });
      // unlocking the client's own row also clears printed (printed needs locked)
      if (field === "locked" && !value && !row.child) patchMonth(byClient(row.client_id), i, { printed: false });
      return true;
    } catch (e) {
      patchMonth(pred, i, { [field]: before });
      notify(e.message || "Failed to update status. Please try again.", "error");
      return false;
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(key); return n; });
    }
  };

  const onLocked = (row, i) => {
    if (!data.can_lock) return;
    const cur = row.months[i].locked;
    if (cur) return setOverride({ row, i }); // unlocking needs a supervisor
    sendFlag(row, i, "locked", true);
  };

  const onPrinted = (row, i) => {
    const m = row.months[i];
    if (!m.printed && !m.locked) return notify("Please lock this month first before marking it as printed.", "error");
    sendFlag(row, i, "printed", !m.printed);
  };

  /* ---------- status popover ---------- */
  const openStatus = async (e, row, i) => {
    e.stopPropagation();
    const el = e.currentTarget;
    if (popover && popover.row === row && popover.i === i) return setPopover(null);
    setPopover({ row, i, el, rect: el.getBoundingClientRect(), items: null });
    try {
      const res = await apiFetch(`/monitoring/reconciliation/compliance?client_id=${row.client_id}&month=${year}-${mm(i)}`);
      setPopover((p) => (p && p.row === row && p.i === i ? { ...p, items: res.items } : p));
    } catch (err) {
      notify(err.message || "Couldn't load the compliance list.", "error");
      setPopover(null);
    }
  };

  const tick = async (item) => {
    if (!data.can_status || !popover) return;
    const { row, i } = popover;
    try {
      const res = await apiFetch("/monitoring/reconciliation/compliance", {
        method: "PUT",
        body: JSON.stringify({ client_id: row.client_id, month: `${year}-${mm(i)}`, compliance_id: item.id }),
      });
      setPopover((p) => (p ? { ...p, items: p.items.map((x) => (x.id === item.id ? { ...x, checked: res.checked } : x)) } : p));
      patchMonth(byClient(row.client_id), i, { color_code_id: res.color_code_id });
    } catch (err) {
      notify(err.message || "Failed to update status.", "error");
    }
  };

  const popOpen = Boolean(popover);
  useEffect(() => {
    if (!popOpen) return undefined;
    const close = (e) => { if (!e.target.closest?.(".rcm-pop, .rcm-status")) setPopover(null); };
    const esc = (e) => { if (e.key === "Escape") setPopover(null); };
    // keep it next to its cell while the grid scrolls; close when the cell is gone
    const follow = () => setPopover((p) => (p && p.el.isConnected ? { ...p, rect: p.el.getBoundingClientRect() } : null));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("scroll", follow, true);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", follow);
    };
  }, [popOpen]);

  const years = data?.years || Array.from({ length: 6 }, (_, k) => THIS_YEAR - k);

  const renderRow = (r, num) => (
    <tr key={r.child ? `c${r.ca_id}` : `p${r.client_id}`} className={r.child ? "rcm-child" : ""}>
      <td className="rcm-f0">
        {!r.child && r.count_acc > 1 && (
          <button type="button" className={`rcm-expand${children[r.client_num] ? " is-open" : ""}`}
            onClick={() => toggleChildren(r)} aria-label={children[r.client_num] ? "Hide branch accounts" : "Show branch accounts"}>
            {children[r.client_num] === "loading" ? "…" : "▸"}
          </button>
        )}
      </td>
      <td className="rcm-f1">{num}</td>
      <td className="rcm-f2" title={r.name}>{r.name}</td>
      {r.months.map((m, i) => {
        const color = m.color_code_id ? colorById[m.color_code_id] : null;
        const shown = color || (r.child ? null : NO_DATA);
        return (
          <Fragment key={i}>
            <td className="rcm-c">
              <input type="checkbox" className="rcm-chk" checked={m.locked} disabled={!data.can_lock || busy.has(`${r.ca_id}:${i}:locked`)}
                onChange={() => onLocked(r, i)} aria-label={`${MONTHS[i]} locked`} />
            </td>
            <td className="rcm-c">
              <input type="checkbox" className="rcm-chk" checked={m.printed} disabled={busy.has(`${r.ca_id}:${i}:printed`)}
                onChange={() => onPrinted(r, i)} aria-label={`${MONTHS[i]} printed`} />
            </td>
            <td className="rcm-status-cell">
              <button type="button" className="rcm-status"
                style={shown ? { background: shown.color_code, color: textOn(shown.color_code) } : undefined}
                onClick={(e) => openStatus(e, r, i)}>
                {shown?.description || ""}
              </button>
            </td>
          </Fragment>
        );
      })}
    </tr>
  );

  return (
    <div className="rcm">
      <section className="card rcm-bar">
        <div className="rcm-title">
          <h4>Reconciliation Monitoring</h4>
          <span>Reporting Period : {data?.year ?? year}</span>
        </div>
        <label className="rcm-field">
          <span className="field-label">Period</span>
          <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="rcm-field rcm-grow">
          <span className="field-label">Client</span>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search client # or name" />
        </label>
        <button type="button" className="btn btn-primary" onClick={() => load(year)} disabled={loading}>
          {loading ? "Loading…" : "Search"}
        </button>
      </section>

      <section className="card rcm-body">
        {error && <div className="alert-error" role="alert">{error}</div>}
        <div className="rcm-scroll">
          <table className="rcm-table">
            <colgroup>
              <col className="rcm-w0" /><col className="rcm-w1" /><col className="rcm-w2" />
              {MONTHS.map((m) => (
                <Fragment key={m}><col className="rcm-wl" /><col className="rcm-wp" /><col className="rcm-ws" /></Fragment>
              ))}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} className="rcm-f0" />
                <th rowSpan={2} className="rcm-f1">#</th>
                <th rowSpan={2} className="rcm-f2">Client</th>
                {MONTHS.map((m) => <th key={m} colSpan={3} className="rcm-month">{m}</th>)}
              </tr>
              <tr>
                {MONTHS.map((m) => (
                  <Fragment key={m}><th>LOCKED</th><th>PRINTED</th><th>STATUS</th></Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }, (_, k) => (
                <tr key={`sk${k}`} className="rcm-sk">
                  <td className="rcm-f0" /><td className="rcm-f1"><span className="sk" /></td><td className="rcm-f2"><span className="sk" /></td>
                  {Array.from({ length: 36 }, (_, j) => <td key={j}><span className="sk" /></td>)}
                </tr>
              ))}
              {!loading && !rows.length && (
                <tr><td className="rcm-empty" colSpan={39}>{query ? "No client matches your search." : "No clients found."}</td></tr>
              )}
              {!loading && rows.map((r, k) => (
                <Fragment key={r.client_id}>
                  {renderRow(r, k + 1)}
                  {Array.isArray(children[r.client_num]) && children[r.client_num].map((c, j) => renderRow(c, `${k + 1}.${j + 1}`))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="rcm-f0">-</th>
                <th className="rcm-f1">-</th>
                <th className="rcm-f2">TOTAL LOCKED / PRINTED</th>
                {totals.map((t, i) => (
                  <Fragment key={i}><th>{t.locked}</th><th>{t.printed}</th><th>-</th></Fragment>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {popover && <StatusPopover popover={popover} canEdit={data?.can_status} onPick={tick} />}

      {override && (
        <OverrideModal
          label={`${MONTHS[override.i]} ${year} · ${override.row.name}`}
          onClose={() => setOverride(null)}
          onSubmit={async (creds) => {
            const ok = await sendFlag(override.row, override.i, "locked", false, creds);
            if (ok) setOverride(null);
            return ok;
          }} />
      )}
    </div>
  );
}

/* compliances due that month — sits left of the STATUS cell, flips right near the edge (old .status-popover) */
function StatusPopover({ popover, canEdit, onPick }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const { rect, items } = popover;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = rect.left - w - 10;
    let side = "left";
    if (left < 10) { left = rect.right + 10; side = "right"; }
    const top = Math.min(Math.max(10, rect.top + rect.height / 2 - h / 2), window.innerHeight - h - 10);
    setPos({ left, top, side });
  }, [rect, items]);

  return (
    <div ref={ref} className={`rcm-pop${pos?.side === "right" ? " is-right" : ""}`}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }} role="dialog" aria-label="Compliance status">
      {!items && <div className="rcm-pop-item is-muted">Loading…</div>}
      {items && !items.length && <div className="rcm-pop-item is-muted">No Compliance</div>}
      {items && items.map((c) => (
        <button type="button" key={c.id} className={`rcm-pop-item${c.checked ? " is-on" : ""}`}
          onClick={() => onPick(c)} disabled={!canEdit} title={canEdit ? "Tick / untick" : "Only the audit supervisor can change this"}>
          <span className="rcm-swatch" style={c.checked ? { background: TICKED } : undefined} />
          {c.code}
        </button>
      ))}
    </div>
  );
}

function OverrideModal({ label, onClose, onSubmit }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!username || !password) return setError("Username and password are required.");
    setSaving(true);
    setError("");
    const ok = await onSubmit({ username, password });
    if (!ok) { setSaving(false); setError("Override failed."); }
  };

  return (
    <Modal title="Supervisor override" onClose={() => !saving && onClose()} size="sm"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Checking…" : "Submit"}</button></>}>
      <p className="rcm-note">Unlock {label}</p>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <Field label="Username"><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus /></Field>
      <Field label="Password">
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
      </Field>
    </Modal>
  );
}
