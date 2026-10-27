// Reports → BIR Return Summary  (the "SUMMARY OF RETURNS" + "AUDIT" Excel, one client + year)
// Amounts the system has (SLSP, 1601-EQ, 2307, filed returns) fill in by themselves – grey = from the system.
// Type over any of them; ↺ puts the system amount back. Save keeps it per client + year.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import {
  QUARTERS, Q_LABEL, MONTHS, MONTH_NAME, NON_QTR_MONTHS, num, compute, systemValue,
  defaultSummary, defaultAudit, loadSummary, loadAudit,
} from "./birSummaryCalc";
import "./BirReturnSummary.css";

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const show = (v) => (Math.abs(Number(v) || 0) < 0.005 ? "-" : n2(v));
const pctText = (v) => `${(Math.round((Number(v) || 0) * 10000) / 100).toLocaleString("en-PH", { maximumFractionDigits: 2 })}%`;
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => THIS_YEAR - i);
const KEEP = "brs:last";
const remember = (v) => { try { localStorage.setItem(KEEP, JSON.stringify(v)); } catch { /* private window */ } };
const recall = () => { try { return JSON.parse(localStorage.getItem(KEEP) || "null"); } catch { return null; } };

/* ---------- Excel-like keyboard: Enter / ↓ next row · ↑ previous row · ← → next cell (when not editing) ---------- */
function visualCol(td) {
  let c = 0;
  for (let x = td.previousElementSibling; x; x = x.previousElementSibling) c += x.colSpan || 1;
  return c;
}
function cellInput(tr, col) {
  let c = 0;
  for (const td of tr.children) {
    const span = td.colSpan || 1;
    if (col >= c && col < c + span) return td.querySelector("input.brs-in:not(.brs-in-label):not(.brs-in-group)");
    c += span;
  }
  return null;
}
function moveFrom(input, dr, dc) {
  const td = input.closest("td");
  const tr = td?.parentElement;
  if (!tr) return false;
  if (dc) {
    const all = [...tr.querySelectorAll("input.brs-in:not(.brs-in-label):not(.brs-in-group)")];
    const next = all[all.indexOf(input) + dc];
    if (next) { next.focus(); return true; }
    return false;
  }
  const col = visualCol(td);
  const rows = [...tr.closest("table").querySelectorAll("tbody tr")];
  for (let k = rows.indexOf(tr) + dr; k >= 0 && k < rows.length; k += dr) {
    const next = cellInput(rows[k], col);
    if (next) { next.focus(); return true; }
  }
  return false;
}

/* ---------- one amount cell (like an Excel cell): shows the typed value, else the system value ---------- */
function Amt({ value, auto, onChange, pct = false, title }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const start = useRef("");
  const dirtyRef = useRef(false);
  const typed = value !== undefined && value !== null && value !== "";
  const hasAuto = auto !== undefined && auto !== null;
  const current = typed ? value : hasAuto ? auto : "";
  // edit text = the plain number (no commas), like Excel's formula bar
  const raw = (v) => (v === "" || v === null || v === undefined ? "" : pct ? String(Math.round(num(v) * 1000000) / 10000) : String(Math.round(num(v) * 100) / 100));
  const shown = editing ? text : current === "" ? "" : pct ? pctText(current) : show(current);

  const commit = () => {
    setEditing(false);
    if (!dirtyRef.current) return;                       // nothing typed → keep as it was
    dirtyRef.current = false;
    const t = text.replace(/[,%\s]/g, "");
    if (t === "" || t === "-") return onChange("");      // cleared → back to the system amount (or blank)
    const n = Number(t);
    if (!Number.isFinite(n)) return;
    const v = pct ? n / 100 : Math.round(n * 100) / 100;
    if (!typed && hasAuto && Math.abs(v - num(auto)) < 0.0000001) return;   // same as the system → stays automatic
    onChange(String(v));
  };

  return (
    <span className={`brs-amt${typed ? " is-typed" : hasAuto ? " is-auto" : ""}`}>
      <input
        className="brs-in"
        inputMode="decimal"
        value={shown}
        title={title || (typed && hasAuto ? `Typed · system: ${pct ? pctText(auto) : n2(auto)}` : hasAuto ? "From the system – type to change" : "")}
        onFocus={(e) => {
          const r = raw(current);
          start.current = r;
          dirtyRef.current = false;
          setText(r);
          setEditing(true);
          const el = e.target;
          requestAnimationFrame(() => el.select());
        }}
        onChange={(e) => { dirtyRef.current = true; setText(e.target.value.replace(/[^\d.,%\s-]/g, "")); }}
        onBlur={commit}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          const whole = el.selectionStart === 0 && el.selectionEnd === el.value.length;
          if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); if (!moveFrom(el, e.shiftKey && e.key === "Enter" ? -1 : 1, 0)) el.blur(); }
          else if (e.key === "ArrowUp") { e.preventDefault(); moveFrom(el, -1, 0); }
          else if (e.key === "ArrowRight" && (whole || el.selectionStart === el.value.length) && !dirtyRef.current) { if (moveFrom(el, 0, 1)) e.preventDefault(); }
          else if (e.key === "ArrowLeft" && (whole || el.selectionEnd === 0) && !dirtyRef.current) { if (moveFrom(el, 0, -1)) e.preventDefault(); }
          else if (e.key === "Escape") { dirtyRef.current = false; setText(start.current); el.blur(); }
        }}
      />
      {typed && hasAuto && Math.abs(num(value) - num(auto)) > 0.004 && (
        <button type="button" tabIndex={-1} className="brs-reset no-print" title={`Use the system amount again (${pct ? pctText(auto) : n2(auto)})`} onClick={() => onChange("")}>↺</button>
      )}
    </span>
  );
}

const Tot = ({ v, pct, strong }) => <span className={`brs-tot${strong ? " is-strong" : ""}${(Number(v) || 0) < -0.004 ? " is-neg" : ""}`}>{pct ? pctText(v) : show(v)}</span>;

function Section({ title, sub, children, right }) {
  return (
    <section className="card brs-sec">
      <header className="brs-sec-head">
        <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
        {right && <div className="brs-sec-right no-print">{right}</div>}
      </header>
      <div className="brs-scroll">{children}</div>
    </section>
  );
}

/* =========================================================================== */
export default function BirReturnSummary() {
  const notify = useToast();
  const last = useMemo(() => recall() || {}, []);
  const [clients, setClients] = useState([]);
  const [clientNum, setClientNum] = useState(last.client || "");
  const [year, setYear] = useState(last.year || THIS_YEAR - 1);
  const [tab, setTab] = useState(last.tab || "summary");
  const [data, setData] = useState(null);         // { client, system, saved }
  const [S, setS] = useState(defaultSummary());
  const [A, setA] = useState(defaultAudit());
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    apiFetch("/reports/bir-return-summary/clients").then((c) => setClients(c || [])).catch((e) => setError(e.message || "Couldn't load the clients."));
  }, []);
  useEffect(() => { remember({ client: clientNum, year, tab }); }, [clientNum, year, tab]);

  const load = useCallback(async () => {
    if (!clientNum) { setData(null); return; }
    const my = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch(`/reports/bir-return-summary?${new URLSearchParams({ client_num: clientNum, year: String(year) })}`);
      if (my !== seq.current) return;
      setData(r);
      setS(loadSummary(r.saved?.summary));
      setA(loadAudit(r.saved?.audit));
      setDirty(false);
    } catch (e) {
      if (my === seq.current) { setError(e.message || "Couldn't load."); setData(null); }
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [clientNum, year]);
  useEffect(() => { load(); }, [load]);

  const sys = data?.system || null;
  const c = useMemo(() => compute(S, A, sys), [S, A, sys]);
  const a = c.a;

  /* ---------- edits ---------- */
  const touch = () => setDirty(true);
  const setSv = (k, v) => { setS((s) => { const nv = { ...s.v }; if (v === "") delete nv[k]; else nv[k] = v; return { ...s, v: nv }; }); touch(); };
  const setAv = (k, v) => { setA((s) => { const nv = { ...s.v }; if (v === "") delete nv[k]; else nv[k] = v; return { ...s, v: nv }; }); touch(); };
  const sv = (k, auto) => ({ value: S.v[k], auto: auto !== undefined ? auto : systemValue(sys, k), onChange: (v) => setSv(k, v) });
  const av = (k, extra = {}) => ({ value: A.v[k], auto: a.def[k], onChange: (v) => setAv(k, v), ...extra });

  const setRows = (key, fn) => { setS((s) => ({ ...s, [key]: fn(s[key]) })); touch(); };
  const setEq = (q, fn) => { setS((s) => ({ ...s, eq: { ...s.eq, [q]: fn(c.eq[q].lines.map(({ base, rate }) => ({ base, rate }))) } })); touch(); };
  const resetEq = (q) => { setS((s) => { const eq = { ...s.eq }; delete eq[q]; return { ...s, eq }; }); touch(); };
  const setDis = (fn) => { setA((s) => ({ ...s, disallowed: fn(a.disRows.map(({ label, aitr, subst }) => ({ label, aitr, subst }))) })); touch(); };
  const setEwt = (fn) => { setA((s) => ({ ...s, ewt: fn(s.ewt || []) })); touch(); };

  const save = async () => {
    if (!clientNum) return;
    setSaving(true);
    try {
      const r = await apiFetch("/reports/bir-return-summary", { method: "PUT", body: JSON.stringify({ client_num: clientNum, year, summary: S, audit: A }) });
      setData((d) => ({ ...d, saved: { ...(d?.saved || {}), updated_at: r.updated_at, updated_by: r.updated_by } }));
      setClients((list) => list.map((x) => (x.client_num === clientNum && !x.saved.includes(+year) ? { ...x, saved: [+year, ...x.saved] } : x)));
      setDirty(false);
      notify("Saved");
    } catch (e) {
      notify(e.message || "Couldn't save.", "error");
    } finally {
      setSaving(false);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveRef.current(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clearAll = () => {
    if (!window.confirm("Clear everything typed for this client and year? (system amounts stay)")) return;
    setS(defaultSummary()); setA(defaultAudit()); touch();
  };

  const exportExcel = async () => {
    try {
      const { exportBirSummary } = await import("./birSummaryExport");
      await exportBirSummary({ client: data.client, year, S, A, c });
    } catch (e) {
      notify(e.message || "Couldn't make the Excel file (npm i exceljs).", "error");
    }
  };

  const clientOpts = useMemo(() => [{ value: "", label: "— Select client —" }, ...clients.map((x) => ({
    value: x.client_num,
    label: x.name,
    hint: [x.client_num, x.person, x.branches > 1 ? `${x.branches} branches` : null, x.saved?.length ? `saved ${x.saved.join(", ")}` : null].filter(Boolean).join(" · "),
  }))], [clients]);

  const name = data?.client?.trade_name || data?.client?.name || "";

  /* ---------- an editable list of AFS / ITR lines ---------- */
  const lines = (k) => S[k].map((r, i) => (
    <tr key={`${k}${i}`}>
      <td className="brs-label">
        <input className="brs-in brs-in-label" value={r.label} onChange={(e) => setRows(k, (rows) => rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
        <button type="button" className="brs-x no-print" title="Remove line" onClick={() => setRows(k, (rows) => rows.filter((_, j) => j !== i))}>×</button>
      </td>
      <td><Amt value={r.afs} onChange={(v) => setRows(k, (rows) => rows.map((x, j) => (j === i ? { ...x, afs: v } : x)))} /></td>
      <td><Amt value={r.itr} onChange={(v) => setRows(k, (rows) => rows.map((x, j) => (j === i ? { ...x, itr: v } : x)))} /></td>
    </tr>
  ));
  const addLine = (k, text) => (
    <tr key={`${k}add`} className="no-print"><td colSpan={3}><button type="button" className="brs-add" onClick={() => setRows(k, (rows) => [...rows, { label: "", afs: "", itr: "" }])}>+ {text}</button></td></tr>
  );
  const totRow = (label, afs, itr, opt = {}) => (
    <tr key={label} className={`brs-total${opt.strong ? " is-strong" : ""}`}><td className="brs-label">{label}</td><td><Tot v={afs} pct={opt.pct} /></td><td><Tot v={itr} pct={opt.pct} /></td></tr>
  );
  const head = (text) => <tr key={text} className="brs-group"><td colSpan={3}>{text}</td></tr>;

  /* =========================== render =========================== */
  return (
    <div className="brs">
      <section className="card brs-bar no-print">
        <div className="brs-title"><span>BIR Return Summary</span><b>{name ? `${name} · ${year}` : "Pick a client"}</b></div>
        <label className="brs-field brs-grow"><span>Client</span>
          <SearchSelect value={clientNum} onChange={setClientNum} options={clientOpts} searchPlaceholder="Search client…" aria-label="Client" />
        </label>
        <label className="brs-field"><span>Year</span>
          <select className="input" value={year} onChange={(e) => setYear(+e.target.value)}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <div className="brs-actions">
          <button type="button" className="btn" onClick={load} disabled={!clientNum || loading}>{loading ? "Loading…" : "Refresh"}</button>
          <button type="button" className="btn" onClick={exportExcel} disabled={!data}>Excel</button>
          <button type="button" className="btn" onClick={() => window.print()} disabled={!data}>Print</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!data || saving || !dirty}>{saving ? "Saving…" : dirty ? "Save" : "Saved"}</button>
        </div>
      </section>

      {error && <div className="alert-error brs-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}
      {data && data.migrated === false && <div className="alert-error brs-error">Run <code>php artisan migrate</code> (t_bir_return_summary) – saving is off until then.</div>}

      {!data && !loading && !error && (
        <section className="card brs-empty">
          <h3>Pick a client and year</h3>
          <p>Sales, purchases, 1601-EQ, 2307 and the filed returns fill in from the system. Type the AFS and ITR amounts and anything else – it's saved per client and year.</p>
        </section>
      )}
      {loading && !data && <section className="card brs-empty"><p>Loading…</p></section>}

      {data && (
        <>
          <div className="brs-tabs no-print" role="tablist">
            {[["summary", "Summary of Returns"], ["audit", "Audit"]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{l}</button>
            ))}
            <span className="brs-meta">
              <i className="brs-key is-auto" /> grey = from the system <i className="brs-key is-typed" /> blue corner = typed · Enter / ↓ next row
              {data.saved?.updated_at && <> · saved {String(data.saved.updated_at).slice(0, 16)}{data.saved.updated_by ? ` by ${data.saved.updated_by}` : ""}</>}
              {dirty && <b className="brs-dirty"> · unsaved changes</b>}
              <button type="button" className="brs-link" onClick={clearAll}>Clear typed</button>
            </span>
          </div>

          <div className="brs-print-head">
            <h2>{name}</h2>
            <p>{tab === "summary" ? `SUMMARY OF RETURNS ${year}` : `AUDIT ${year}`}{data.client?.tin ? ` · TIN ${data.client.tin}` : ""}</p>
          </div>

          {/* =================================== SUMMARY =================================== */}
          {tab === "summary" && (
            <div className="brs-grid">
              <Section title="Annual" sub="Based on the AFS and the ITR – type the amounts">
                <table className="brs-table brs-annual">
                  <colgroup><col /><col className="brs-wa" /><col className="brs-wa" /></colgroup>
                  <thead><tr><th>Annual</th><th>Based on AFS</th><th>Based on ITR</th></tr></thead>
                  <tbody>
                    {head("Sales")}
                    {lines("sales")}
                    {addLine("sales", "Add sales line")}
                    {totRow("Total Sales", c.salesAfs, c.salesItr, { strong: true })}

                    {head("Cost of sales")}
                    {lines("cos")}
                    {addLine("cos", "Add cost line")}
                    {totRow("Total goods available for sale", c.goodsAfs, c.goodsItr)}
                    <tr><td className="brs-label">Less: Merchandise, Ending</td><td><Amt {...sv("end.afs", null)} /></td><td><Amt {...sv("end.itr", null)} /></td></tr>
                    {totRow("Total Cost of merchandise", c.cogmAfs, c.cogmItr)}
                    <tr><td className="brs-label">Cost of sales - Other Items</td><td><Amt {...sv("cos_other.afs", null)} /></td><td><Amt {...sv("cos_other.itr", null)} /></td></tr>
                    {totRow("Total cost of sales", c.cosAfs, c.cosItr, { strong: true })}
                    {totRow("Gross Income", c.grossAfs, c.grossItr, { strong: true })}
                    {totRow("Gross profit ratio", c.gpAfs, c.gpItr, { pct: true })}

                    {head("Operating expenses")}
                    {lines("opex")}
                    {addLine("opex", "Add expense line")}
                    {totRow("Total Expenses", c.opexAfs, c.opexItr, { strong: true })}
                    {totRow("Net Income before Tax", c.nibtAfs, c.nibtItr, { strong: true })}

                    {head("Income tax")}
                    <tr><td className="brs-label">Less: exempt / deduction before the rate</td><td colSpan={2}><Amt {...sv("it.less", null)} /></td></tr>
                    <tr><td className="brs-label">Income tax rate</td><td colSpan={2}><Amt {...sv("it.rate", 0.2)} pct /></td></tr>
                    {totRow("Total Income Tax", c.taxAfs, c.taxItr, { strong: true })}
                    {totRow("Net Income after Tax", c.niatAfs, c.niatItr)}

                    {head("Taxable income – payments")}
                    {QUARTERS.slice(0, 3).map((q, i) => (
                      <tr key={q}><td className="brs-label">1701-Q / 1702-Q {Q_LABEL[q].replace(" QTR", "")}</td>
                        <td><Amt {...sv(`paid.${q}.afs`, c.q1701.tax[q])} /></td><td><Amt {...sv(`paid.${q}.itr`, c.q1701.tax[q])} /></td></tr>
                    ))}
                    {totRow("Total Payable (quarterly)", c.qPaidAfsTotal, c.qPaidItrTotal)}
                    <tr><td className="brs-label">Less: Withholding 2307 (1st–4th QTR)</td><td><Amt {...sv("wh2307.afs")} /></td><td><Amt {...sv("wh2307.itr")} /></td></tr>
                    {totRow("Total Annual Payable", c.payableAfs, c.payableItr, { strong: true })}
                  </tbody>
                </table>
              </Section>

              <div className="brs-col">
                <Section title="Based return – 1701-Q / 1702-Q" sub="Books by declared month · tax paid from the filed returns">
                  <table className="brs-table">
                    <thead><tr><th /><th>Sales</th><th>Purchases</th><th>Itemized deduction</th><th>Tax paid</th></tr></thead>
                    <tbody>
                      {QUARTERS.slice(0, 3).map((q) => (
                        <tr key={q}><td className="brs-label">{Q_LABEL[q]}</td>
                          {["sales", "purchases", "itemized", "tax"].map((k) => <td key={k}><Amt {...sv(`q1701.${q}.${k}`)} /></td>)}</tr>
                      ))}
                      <tr className="brs-total is-strong"><td className="brs-label">Total</td>{["sales", "purchases", "itemized", "tax"].map((k) => <td key={k}><Tot v={c.q1701[k].total} /></td>)}</tr>
                    </tbody>
                  </table>
                </Section>

                <Section title="Based return – 2550-Q" sub="Gov't sales = invoices with 2307 VT · tax paid from the filed returns">
                  <table className="brs-table">
                    <thead><tr><th /><th>Regular sales</th><th>Sales to Gov't</th><th>Total sales</th><th>Purchases – vatable</th><th>Exempt – purchases</th><th>Total purchases</th><th>Tax paid</th></tr></thead>
                    <tbody>
                      {QUARTERS.map((q) => (
                        <tr key={q}><td className="brs-label">{Q_LABEL[q]}</td>
                          <td><Amt {...sv(`q2550.${q}.regular`)} /></td><td><Amt {...sv(`q2550.${q}.gov`)} /></td><td><Tot v={c.q2550[q].sales} /></td>
                          <td><Amt {...sv(`q2550.${q}.vat_purch`)} /></td><td><Amt {...sv(`q2550.${q}.exempt_purch`)} /></td><td><Tot v={c.q2550[q].purch} /></td>
                          <td><Amt {...sv(`q2550.${q}.tax`)} /></td></tr>
                      ))}
                      <tr className="brs-total is-strong"><td className="brs-label">Total</td>
                        {["regular", "gov", "sales", "vat_purch", "exempt_purch", "purch", "tax"].map((k) => <td key={k}><Tot v={c.q2550.total[k]} /></td>)}</tr>
                      <tr className="brs-total"><td className="brs-label">12% of total sales</td><td /><td /><td><Tot v={c.q2550Vat} /></td><td colSpan={4} /></tr>
                    </tbody>
                  </table>
                </Section>

                <Section title="Based return – 0605-VT / 2550M" sub="2307 = 2307 VT on sales · amount due from the filed returns">
                  <table className="brs-table brs-narrow">
                    <thead><tr><th /><th>2307</th><th>Amount due</th></tr></thead>
                    <tbody>
                      {NON_QTR_MONTHS.map((m) => (
                        <tr key={m}><td className="brs-label">{MONTH_NAME[m]}</td><td><Amt {...sv(`m2550.${m}.w2307`)} /></td><td><Amt {...sv(`m2550.${m}.due`)} /></td></tr>
                      ))}
                      <tr className="brs-total is-strong"><td className="brs-label">Total</td><td><Tot v={c.m2550.total.w2307} /></td><td><Tot v={c.m2550.total.due} /></td></tr>
                    </tbody>
                  </table>
                </Section>

                <Section title="Based SLSP" sub="Summary list of sales and purchases from the books (exempt includes zero rated)">
                  <table className="brs-table">
                    <thead><tr><th /><th>Vatable</th><th>Exempt – sales</th><th>Total sales</th><th>Purchases – vatable</th><th>Exempt – purchases</th><th>Total purchases</th></tr></thead>
                    <tbody>
                      {QUARTERS.map((q) => (
                        <tr key={q}><td className="brs-label">{Q_LABEL[q]}</td>
                          <td><Amt {...sv(`slsp.${q}.vatable`)} /></td><td><Amt {...sv(`slsp.${q}.exempt`)} /></td><td><Tot v={c.slsp[q].sales} /></td>
                          <td><Amt {...sv(`slsp.${q}.vat_purch`)} /></td><td><Amt {...sv(`slsp.${q}.exempt_purch`)} /></td><td><Tot v={c.slsp[q].purch} /></td></tr>
                      ))}
                      <tr className="brs-total is-strong"><td className="brs-label">Total</td>
                        {["vatable", "exempt", "sales", "vat_purch", "exempt_purch", "purch"].map((k) => <td key={k}><Tot v={c.slsp.total[k]} /></td>)}</tr>
                      <tr className="brs-total brs-diff"><td className="brs-label">Difference (2550-Q − SLSP)</td><td /><td /><td><Tot v={c.diffSales} /></td><td /><td /><td><Tot v={c.diffPurch} /></td></tr>
                    </tbody>
                  </table>
                </Section>

                <Section title="Based 1601-EQ" sub="2307 IT withheld on purchases & expenses, by ATC rate">
                  <table className="brs-table brs-narrow">
                    <thead><tr><th /><th>Basic tax</th><th>Tax rate</th><th>Withholding expanded</th><th className="no-print" /></tr></thead>
                    <tbody>
                      {QUARTERS.map((q) => {
                        const e = c.eq[q];
                        const lines = e.lines.length ? e.lines : [null];
                        return lines.map((l, i) => (
                          <tr key={`${q}${i}`} className={i === 0 ? "brs-qstart" : ""}>
                            <td className="brs-label">{i === 0 ? Q_LABEL[q] : ""}{i === 0 && e.edited && <button type="button" className="brs-link no-print" onClick={() => resetEq(q)} title="Use the system lines again">↺ system</button>}</td>
                            {l ? <>
                              <td><Amt value={l.sys ? undefined : l.base} auto={l.sys ? num(l.base) : undefined} onChange={(v) => setEq(q, (ls) => ls.map((x, j) => (j === i ? { ...x, base: v } : x)))} /></td>
                              <td><Amt value={l.sys ? undefined : l.rate} auto={l.sys ? num(l.rate) : undefined} pct onChange={(v) => setEq(q, (ls) => ls.map((x, j) => (j === i ? { ...x, rate: v } : x)))} /></td>
                              <td><Tot v={l.tax} /></td>
                              <td className="no-print"><button type="button" className="brs-x is-inline" title="Remove line" onClick={() => setEq(q, (ls) => ls.filter((_, j) => j !== i))}>×</button></td>
                            </> : <><td className="brs-muted" colSpan={3}>none</td><td className="no-print" /></>}
                          </tr>
                        )).concat(
                          <tr key={`${q}add`} className="no-print"><td /><td colSpan={4}><button type="button" className="brs-add" onClick={() => setEq(q, (ls) => [...ls, { base: "", rate: "0.01" }])}>+ Add {Q_LABEL[q]} line</button></td></tr>
                        );
                      })}
                      <tr className="brs-total is-strong"><td className="brs-label">Total</td><td><Tot v={c.eq.total.base} /></td><td /><td><Tot v={c.eq.total.tax} /></td><td className="no-print" /></tr>
                    </tbody>
                  </table>
                </Section>

                <Section title="Based return – 0619-E" sub="Filed returns – the books' 2307 IT when none was filed">
                  <table className="brs-table brs-narrow">
                    <thead><tr><th /><th>Amount due</th></tr></thead>
                    <tbody>
                      {NON_QTR_MONTHS.map((m) => <tr key={m}><td className="brs-label">{MONTH_NAME[m]}</td><td><Amt {...sv(`e0619.${m}.due`)} /></td></tr>)}
                      <tr className="brs-total is-strong"><td className="brs-label">Total</td><td><Tot v={c.e0619.total} /></td></tr>
                    </tbody>
                  </table>
                </Section>

                <Section title="Based return – 1601-C" sub="Type the compensation · amount due from the filed returns">
                  <table className="brs-table brs-narrow">
                    <thead><tr><th /><th>Total compensation</th><th>Amount due</th></tr></thead>
                    <tbody>
                      {MONTHS.map((m) => <tr key={m}><td className="brs-label">{MONTH_NAME[m]}</td><td><Amt {...sv(`c1601.${m}.comp`)} /></td><td><Amt {...sv(`c1601.${m}.due`)} /></td></tr>)}
                      <tr className="brs-total is-strong"><td className="brs-label">Total</td><td><Tot v={c.c1601.total.comp} /></td><td><Tot v={c.c1601.total.due} /></td></tr>
                    </tbody>
                  </table>
                </Section>
              </div>
            </div>
          )}

          {/* =================================== AUDIT =================================== */}
          {tab === "audit" && (
            <div className="brs-audit">
              <Section title="Income Tax" right={<RateBar a={a} av={av} />}>
                <table className="brs-table brs-au">
                  <colgroup><col /><col className="brs-wa" /><col className="brs-wa" /></colgroup>
                  <tbody>
                    <tr className="brs-total"><td className="brs-label">Income / (Loss) per Return</td><td /><td><Amt {...av("income")} /></td></tr>
                    <tr className="brs-group"><td colSpan={3}>Add / (Less): Adjustments per Audit Investigation</td></tr>
                    <tr className="brs-sub"><td colSpan={3}>A. Discrepancy on Sales per AITR vs Submitted SLS vs AITED</td></tr>
                    <AuRow l="Sales per SLP AITED"><Amt {...av("sales_aited")} /></AuRow>
                    <AuRow l="Sales per submitted SLS"><Amt {...av("sales_sls")} /></AuRow>
                    <AuRow l="Sales per AITR"><Amt {...av("sales_aitr")} /></AuRow>
                    <AuRow l="Undeclared Sales"><Tot v={a.undSales} /></AuRow>
                    <AuRow l="Multiply by GP Ratio"><Amt {...av("gp", { pct: true })} /></AuRow>
                    <AuRow l="Undeclared Income" total={a.undSalesInc} />

                    <tr className="brs-sub"><td colSpan={3}>B. Discrepancy on Purchases per AITR vs Submitted SLP vs AITED</td></tr>
                    <AuRow l="Purchases per SLP AITED"><Amt {...av("purch_aited")} /></AuRow>
                    <AuRow l="Purchases per submitted SLP"><Amt {...av("purch_slp")} /></AuRow>
                    <AuRow l="Purchases per AITR"><Amt {...av("purch_aitr")} /></AuRow>
                    <AuRow l="Undeclared Purchases"><Tot v={a.undPurch} /></AuRow>
                    <AuRow l="Divided by COS Ratio"><Amt {...av("cos_ratio", { pct: true })} /></AuRow>
                    <AuRow l="Gross-up Undeclared Purchases"><Tot v={a.undPurchGross} /></AuRow>
                    <AuRow l="Multiply by GP Ratio"><Tot v={a.gp} pct /></AuRow>
                    <AuRow l="Undeclared Income" total={a.undPurchInc} />

                    <tr className="brs-sub"><td colSpan={3}>Undeclared Salaries and wages tantamount</td></tr>
                    <AuRow l="Salaries and Wages – per Alphalist of Employees (1604-C)"><Amt {...av("sal_1604c")} /></AuRow>
                    <AuRow l="Salaries and Wages – per FS"><Amt {...av("sal_fs")} /></AuRow>
                    <AuRow l="Undeclared Salaries" total={a.undSal} />

                    <tr className="brs-sub"><td colSpan={3}>C. Disallowance of Purchases for failure to substantiate with invoices
                      <label className="brs-check no-print"><input type="checkbox" checked={!!a.purchOn} onChange={(e) => setAv("purch_on", e.target.checked ? "" : "0")} /> include</label></td></tr>
                    <AuRow l="Purchases per VAT return"><Amt {...av("purch_vat")} /></AuRow>
                    <AuRow l="Disallowed Purchases" total={a.purchDis} />

                    <tr className="brs-sub"><td colSpan={3}>D. Disallowance of Expenses for failure to substantiate with invoices
                      {A.disallowed && <button type="button" className="brs-link no-print" onClick={() => { setA((s) => ({ ...s, disallowed: null })); touch(); }}>↺ from the Summary</button>}</td></tr>
                    <tr className="brs-mini-head"><td /><td>Per AITR · Substantiated</td><td>Unsubstantiated</td></tr>
                    {a.disRows.map((r, i) => (
                      <tr key={i}>
                        <td className="brs-label brs-indent">
                          <input className="brs-in brs-in-label" value={r.label} onChange={(e) => setDis((rs) => rs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                          <button type="button" className="brs-x no-print" onClick={() => setDis((rs) => rs.filter((_, j) => j !== i))}>×</button>
                        </td>
                        <td><span className="brs-pair">
                          <Amt value={r.aitr} onChange={(v) => setDis((rs) => rs.map((x, j) => (j === i ? { ...x, aitr: v } : x)))} />
                          <Amt value={r.subst} onChange={(v) => setDis((rs) => rs.map((x, j) => (j === i ? { ...x, subst: v } : x)))} />
                        </span></td>
                        <td><Tot v={r.unsub} /></td>
                      </tr>
                    ))}
                    <tr className="no-print"><td colSpan={3}><button type="button" className="brs-add" onClick={() => setDis((rs) => [...rs, { label: "", aitr: "", subst: "" }])}>+ Add expense</button></td></tr>
                    <AuRow l="Total unsubstantiated" total={a.disTotal} />

                    <tr className="brs-total is-strong"><td className="brs-label">Taxable Income per Audit Investigation</td><td /><td><Tot v={a.taxable} strong /></td></tr>
                    <AuRow l="Income tax rate"><Amt {...av("it_rate", { pct: true })} /></AuRow>
                    <tr className="brs-total"><td className="brs-label">Total Basic Income Tax Due</td><td /><td><Tot v={a.itDue} /></td></tr>
                    <tr className="brs-group"><td colSpan={3}>Less: Tax Payments / Tax Credits</td></tr>
                    <AuRow l="BIR Form No. 2307"><Amt {...av("cr_2307")} /></AuRow>
                    <AuRow l="Quarterly Income Payments"><Amt {...av("cr_q")} /></AuRow>
                    <AuRow l="Annual Income Payments"><Amt {...av("cr_annual")} /></AuRow>
                    <AuRow l="Total credits" total={a.itCredits} />
                    <tr className="brs-total"><td className="brs-label">Basic Income Tax Deficiency</td><td /><td><Tot v={a.itDef} /></td></tr>
                    <Increments inc={a.itInc} a={a} av={av} k="it_comp" />
                    <tr className="brs-total is-grand"><td className="brs-label">Total Income Tax still due and payable</td><td /><td><Tot v={a.itTotal} strong /></td></tr>
                  </tbody>
                </table>
              </Section>

              <Section title="Value-Added Tax">
                <table className="brs-table brs-au">
                  <colgroup><col /><col className="brs-wa" /><col className="brs-wa" /></colgroup>
                  <tbody>
                    <tr className="brs-total"><td className="brs-label">Vatable Sales per Returns</td><td /><td><Amt {...av("vat_sales")} /></td></tr>
                    <tr className="brs-group"><td colSpan={3}>Add / (Less): Adjustments per Audit Investigation</td></tr>
                    <tr><td className="brs-label brs-indent">Undeclared Sales per reconciliation of Sales per RELIEF data vs Summary List of Sales</td><td /><td><Tot v={a.vatUndSales} /></td></tr>
                    <tr><td className="brs-label brs-indent">Undeclared Purchases per reconciliation of Purchases per RELIEF data vs Summary List of Purchases</td><td /><td><Tot v={a.vatUndPurch} /></td></tr>
                    <tr className="brs-total"><td className="brs-label">Total VATable Sales / Receipts per Audit Investigation</td><td /><td><Tot v={a.vatBase} /></td></tr>
                    <AuRow l="Multiply by: VAT rate"><Amt {...av("vat_rate", { pct: true })} /></AuRow>
                    <tr className="brs-total"><td className="brs-label">Output Tax</td><td /><td><Tot v={a.output} /></td></tr>
                    <AuRow l="Less: Input Tax per Returns"><Amt {...av("input")} /></AuRow>
                    <tr className="brs-total"><td className="brs-label">Basic VAT Due</td><td /><td><Tot v={a.vatDue} /></td></tr>
                    <tr className="brs-group"><td colSpan={3}>Less: Tax Payments / Tax Credits</td></tr>
                    <AuRow l="VAT Payments (2550-Q + 2550M / 0605)"><Amt {...av("vat_pay")} /></AuRow>
                    <AuRow l="BIR Form No. 2307 5%"><Amt {...av("vat_2307")} /></AuRow>
                    <AuRow l="Total credits" total={a.vatCredits} />
                    <tr className="brs-total"><td className="brs-label">Basic VAT Deficiency</td><td /><td><Tot v={a.vatDef} /></td></tr>
                    <Increments inc={a.vatInc} a={a} av={av} k="vat_comp" />
                    <tr className="brs-total is-grand"><td className="brs-label">Total VAT still due and payable</td><td /><td><Tot v={a.vatTotal} strong /></td></tr>
                  </tbody>
                </table>
              </Section>

              <Section title="Expanded Withholding Tax">
                <table className="brs-table brs-au">
                  <colgroup><col /><col className="brs-wa" /><col className="brs-wa" /></colgroup>
                  <tbody>
                    <tr className="brs-mini-head"><td /><td>Tax base · Tax rate</td><td>Tax due</td></tr>
                    {a.ewtRows.map((r, i) => (
                      <tr key={i}>
                        <td className="brs-label">
                          <input className="brs-in brs-in-group" value={r.group || ""} placeholder="Group" onChange={(e) => setEwt((rs) => rs.map((x, j) => (j === i ? { ...x, group: e.target.value } : x)))} />
                          <input className="brs-in brs-in-label" value={r.label} onChange={(e) => setEwt((rs) => rs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                          <button type="button" className="brs-x no-print" onClick={() => setEwt((rs) => rs.filter((_, j) => j !== i))}>×</button>
                        </td>
                        <td><span className="brs-pair">
                          <Amt value={r.base} onChange={(v) => setEwt((rs) => rs.map((x, j) => (j === i ? { ...x, base: v } : x)))} />
                          <Amt value={r.rate} pct onChange={(v) => setEwt((rs) => rs.map((x, j) => (j === i ? { ...x, rate: v } : x)))} />
                        </span></td>
                        <td><Tot v={r.due} /></td>
                      </tr>
                    ))}
                    <tr className="no-print"><td colSpan={3}><button type="button" className="brs-add" onClick={() => setEwt((rs) => [...rs, { group: "", label: "", base: "", rate: "0.01" }])}>+ Add line</button></td></tr>
                    <tr className="brs-total"><td className="brs-label">Expanded Withholding Tax Due</td><td /><td><Tot v={a.ewtDue} /></td></tr>
                    <AuRow l="Less: Withholding Tax Paid (1601-EQ)"><Amt {...av("ewt_paid")} /></AuRow>
                    <tr className="brs-total"><td className="brs-label">Basic EWT Deficiency</td><td /><td><Tot v={a.ewtDef} /></td></tr>
                    <Increments inc={a.ewtInc} a={a} av={av} k="ewt_comp" />
                    <tr className="brs-total is-grand"><td className="brs-label">Total EWT still due and payable</td><td /><td><Tot v={a.ewtTotal} strong /></td></tr>
                  </tbody>
                </table>
              </Section>

              <Section title="Withholding Tax on Compensation">
                <table className="brs-table brs-au">
                  <colgroup><col /><col className="brs-wa" /><col className="brs-wa" /></colgroup>
                  <tbody>
                    <AuRow l="Gross Taxable Compensation Income (1601-C)"><Amt {...av("comp_gross")} /></AuRow>
                    <AuRow l="Tax to be Withheld and remitted (graduated rates)"><Amt {...av("comp_tax")} /></AuRow>
                    <AuRow l="Less: Withholding Tax on Compensation payments"><Amt {...av("comp_paid")} /></AuRow>
                    <tr className="brs-total"><td className="brs-label">Withholding Tax on Compensation still due</td><td /><td><Tot v={a.compDef} /></td></tr>
                    <Increments inc={a.compInc} a={a} av={av} k="comp_comp" />
                    <tr className="brs-total is-grand"><td className="brs-label">Total Compensation Tax still due and payable</td><td /><td><Tot v={a.compTotal} strong /></td></tr>
                  </tbody>
                </table>
              </Section>

              <Section title="Summary of Tax Deficiencies">
                <table className="brs-table brs-au">
                  <colgroup><col /><col className="brs-wa" /><col className="brs-wa" /></colgroup>
                  <tbody>
                    <tr><td className="brs-label">Income Tax</td><td /><td><Tot v={a.itTotal} /></td></tr>
                    <tr><td className="brs-label">Value-Added Tax</td><td /><td><Tot v={a.vatTotal} /></td></tr>
                    <tr><td className="brs-label">Expanded Withholding Tax</td><td /><td><Tot v={a.ewtTotal} /></td></tr>
                    <tr><td className="brs-label">Withholding Tax on Compensation</td><td /><td><Tot v={a.compTotal} /></td></tr>
                    <tr className="brs-total is-grand"><td className="brs-label">TOTAL DEFICIENCY TAX STILL DUE AND PAYABLE</td><td /><td><Tot v={a.grand} strong /></td></tr>
                  </tbody>
                </table>
              </Section>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- audit helpers ---------- */
function AuRow({ l, children, total }) {
  return (
    <tr className={total !== undefined ? "brs-total" : ""}>
      <td className="brs-label brs-indent">{l}</td>
      <td>{total === undefined ? children : null}</td>
      <td>{total !== undefined ? <Tot v={total} /> : null}</td>
    </tr>
  );
}

function Increments({ inc, a, av, k }) {
  return (
    <>
      <tr className="brs-group"><td colSpan={3}>Add: Legal Increments</td></tr>
      <tr><td className="brs-label brs-indent">Surcharge @ {pctText(a.sur)}</td><td><Tot v={inc.s} /></td><td /></tr>
      <tr><td className="brs-label brs-indent">Interest @ {pctText(a.int)} per annum{a.years !== 1 ? ` × ${a.years} yr` : ""}</td><td><Tot v={inc.i} /></td><td /></tr>
      <tr><td className="brs-label brs-indent">Compromise Penalty</td><td><Amt {...av(k)} /></td><td /></tr>
      <tr className="brs-total"><td className="brs-label brs-indent">Total increments</td><td /><td><Tot v={inc.total} /></td></tr>
    </>
  );
}

function RateBar({ a, av }) {
  return (
    <div className="brs-rates">
      <label>Surcharge <Amt {...av("sur", { pct: true })} /></label>
      <label>Interest p.a. <Amt {...av("int", { pct: true })} /></label>
      <label>Years <Amt {...av("years")} title="Years of interest (e.g. 1.96 for 01/15/2025 – 12/31/2026)" /></label>
    </div>
  );
}