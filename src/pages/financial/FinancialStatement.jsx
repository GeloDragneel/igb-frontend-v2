// Financial Report → Financial Statement
// Comparative AFS from the ledger, one statement per tab:
// Financial Position · Income · Changes in Owner's Equity · Cash Flows · Notes
// Downloadable as Excel (live SUM formulas) and PDF.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { acct, downloadExcel, downloadPdf } from "./fsExport";

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 12 }, (_, i) => thisYear - i);
const TABS = [
  ["sfp", "Financial Position"],
  ["si", "Income"],
  ["sce", "Changes in Equity"],
  ["scf", "Cash Flows"],
  ["notes", "Notes"],
];

export default function FinancialStatement() {
  const { user } = useAuth();
  const notify = useToast();
  const [year, setYear] = useState(thisYear - 1);
  const [compare, setCompare] = useState(thisYear - 2);
  const [branch, setBranch] = useState("current");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("sfp");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ year: String(year), branch });
      if (compare) q.set("compare", String(compare));
      setData(await apiFetch(`/reports/financial-statement?${q}`));
    } catch (e) {
      setError(e.message || "Couldn't build the financial statement.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year, compare, branch]);

  useEffect(() => { load(); }, [load, user?.id, user?.caid]);

  const download = async (kind) => {
    if (!data) return;
    setBusy(kind);
    try {
      if (kind === "xlsx") await downloadExcel(data);
      else await downloadPdf(data);
    } catch (e) {
      notify(e?.message?.includes("Failed to fetch dynamically imported module") || e?.message?.includes("Cannot find")
        ? "Install the export packages first: npm i exceljs jspdf jspdf-autotable"
        : e.message || "Couldn't create the file.", "error");
    } finally {
      setBusy("");
    }
  };

  // arrow keys move between tabs
  const onTabKey = (e) => {
    const i = TABS.findIndex(([k]) => k === tab);
    if (e.key === "ArrowRight") setTab(TABS[(i + 1) % TABS.length][0]);
    if (e.key === "ArrowLeft") setTab(TABS[(i - 1 + TABS.length) % TABS.length][0]);
  };

  const problems = (data?.checks || []).filter((c) => Math.abs(c.diff) >= 1);
  const empty = data && data.statements.every((s) => s.lines.every((l) => !l.values || Object.values(l.values).every((v) => !Number(v))));
  const statement = data?.statements.find((s) => s.key === tab);
  const company = data?.company || {};
  const heads = useMemo(() => [
    company.trade_name || company.name,
    company.trade_name && company.name && company.trade_name !== company.name ? company.name : null,
    company.address,
    company.tin ? `TIN ${company.tin}` : null,
  ].filter(Boolean), [company.trade_name, company.name, company.address, company.tin]);

  return (
    <div className="fs">
      {/* ---------- controls ---------- */}
      <section className="card fs-bar">
        <div className="fs-fields">
          <label className="fs-field">
            <span>Year</span>
            <select className="input" value={year} onChange={(e) => { const y = Number(e.target.value); setYear(y); if (compare && compare >= y) setCompare(y - 1); }}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="fs-field">
            <span>Compare with</span>
            <select className="input" value={compare || ""} onChange={(e) => setCompare(e.target.value ? Number(e.target.value) : 0)}>
              <option value="">No comparison</option>
              {YEARS.filter((y) => y < year).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {data?.branches?.length > 1 && (
            <label className="fs-field">
              <span>Branch</span>
              <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="current">This branch</option>
                <option value="all">All branches (consolidated)</option>
                {data.branches.map((b) => <option key={b.id} value={String(b.id)}>{b.label}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="fs-actions">
          <button className="btn" onClick={load} disabled={loading}>{loading ? "Building…" : "Refresh"}</button>
          <button className="btn" onClick={() => download("xlsx")} disabled={!data || loading || !!busy}>{busy === "xlsx" ? "Preparing…" : "Download Excel"}</button>
          <button className="btn btn-primary" onClick={() => download("pdf")} disabled={!data || loading || !!busy}>{busy === "pdf" ? "Preparing…" : "Download PDF"}</button>
        </div>
      </section>

      {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

      {problems.length > 0 && (
        <div className="fs-warn" role="status">
          <strong>These don't tie out yet</strong>
          <ul>{problems.map((p, i) => <li key={i}>{p.year} · {p.label}: off by {acct(p.diff)}</li>)}</ul>
          <span>Usually an unbalanced journal entry or an account in the wrong code range. Check the Trial Balance for {problems[0].year}.</span>
        </div>
      )}

      {/* ---------- statement ---------- */}
      <section className="card fs-doc">
        <div className="fs-tabs" role="tablist" aria-label="Statements" onKeyDown={onTabKey}>
          {TABS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              id={`fs-tab-${k}`}
              aria-selected={tab === k}
              aria-controls="fs-panel"
              tabIndex={tab === k ? 0 : -1}
              className={tab === k ? "is-on" : ""}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="fs-panel" id="fs-panel" role="tabpanel" aria-labelledby={`fs-tab-${tab}`}>
          {loading && <div className="fs-skel" aria-label="Loading"><span /><span /><span /><span /><span /><span /></div>}

          {!loading && empty && (
            <div className="fs-empty">
              <h3>No entries for {year}{compare ? ` or ${compare}` : ""}</h3>
              <p>Post sales, purchases, expenses or journal entries for this year, or pick another year above.</p>
            </div>
          )}

          {!loading && data && !empty && (
            <article className="fs-paper">
              <header className="fs-head">
                <h2>{heads[0]}</h2>
                {heads.slice(1).map((t, i) => <p key={i}>{t}</p>)}
                <h3>{tab === "notes" ? "Notes to Financial Statements" : titleCase(statement?.title)}</h3>
                <p className="fs-period">{tab === "notes" ? data.period_text?.for_years : statement?.period}</p>
                <p className="fs-currency">In Philippine Pesos</p>
              </header>

              {tab !== "notes" && statement && (
                <>
                  <table className="fs-table">
                    <colgroup><col /><col className="fs-c-note" />{data.years.map((y) => <col key={y} className="fs-c-num" />)}</colgroup>
                    <thead>
                      <tr><th /><th className="c">Note</th>{data.years.map((y) => <th key={y} className="n">{y}</th>)}</tr>
                    </thead>
                    <tbody>
                      {statement.lines.map((l) => (
                        <tr key={l.id} className={`k-${l.kind}${l.kind === "total" && l.indent ? " k-subtotal" : ""}`}>
                          <td style={{ paddingLeft: `${0.5 + (l.indent || 0) * 1.25}rem` }}>{cleanLabel(l.label)}</td>
                          <td className="c">
                            {l.note ? <button type="button" className="fs-note-link" onClick={() => setTab("notes")} title="Open the notes">{l.note}</button> : ""}
                          </td>
                          {data.years.map((y) => <td key={y} className="n">{l.values ? acct(l.values[y]) : ""}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="fs-foot">See accompanying Notes to Financial Statements.</p>
                </>
              )}

              {tab === "notes" && (
                <div className="fs-notes">
                  <section className="fs-note">
                    <h4><span>1</span>General information</h4>
                    <p>
                      {company.trade_name || company.name || "The Company"}
                      {company.address ? ` is located at ${company.address}` : ""}
                      {company.tin ? ` with TIN ${company.tin}` : ""}.
                    </p>
                  </section>
                  <section className="fs-note">
                    <h4><span>2</span>Basis of preparation</h4>
                    <p>The financial statements have been prepared in accordance with the Philippine Financial Reporting Standard for Small Entities (PFRS for SEs), on a going concern basis, and are presented in Philippine Pesos.</p>
                  </section>
                  {data.notes.map((n) => (
                    <section key={n.no} className="fs-note">
                      <h4><span>{n.no}</span>{titleCase(n.title)}</h4>
                      <table className="fs-table">
                        <colgroup><col />{data.years.map((y) => <col key={y} className="fs-c-num" />)}</colgroup>
                        <thead><tr><th />{data.years.map((y) => <th key={y} className="n">{y}</th>)}</tr></thead>
                        <tbody>
                          {n.rows.map((a) => (
                            <tr key={a.code}>
                              <td><span className="fs-code">{a.code}</span>{a.label}</td>
                              {data.years.map((y) => <td key={y} className="n">{acct(a.values[y])}</td>)}
                            </tr>
                          ))}
                          <tr className="k-grand"><td>Total</td>{data.years.map((y) => <td key={y} className="n">{acct(n.total[y])}</td>)}</tr>
                        </tbody>
                      </table>
                    </section>
                  ))}
                </div>
              )}
            </article>
          )}
        </div>
      </section>
    </div>
  );
}

// "A S S E T S" → "ASSETS", "L I A B I L I T I E S   A N D …" → "LIABILITIES AND …" (spacing is done by CSS)
function cleanLabel(s = "") {
  const t = String(s);
  if (!/^(\S ){2,}\S/.test(t)) return t;
  return t.split(/\s{2,}/).map((w) => w.replace(/ /g, "")).join(" ");
}

// "STATEMENTS OF FINANCIAL POSITION" → "Statements of Financial Position"
function titleCase(s = "") {
  const small = new Set(["of", "and", "in", "to", "the"]);
  return String(s).toLowerCase().split(" ").map((w, i) => (i && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}