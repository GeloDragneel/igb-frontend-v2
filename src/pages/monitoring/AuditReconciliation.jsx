// Monitoring → Audit Reconciliation (old pages/Monitoring/Audit_Reconciliation)
// Run Diagnose: the server compares every client's eBIRForms save file with the FEMS totals for the month,
// the log then plays client by client. Reconcile saves the fully reconciled clients.
import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./AuditReconciliation.css";

const STEP_MS = 90; // delay per client in the log (old setTimeout(step, 90))
const R = 90;
const CIRC = 2 * Math.PI * R;
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const THIS_MONTH = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

const STATUS = {
  excellent: { label: "Reconciled", color: "#3FD6AC" },
  good: { label: "No Compliance", color: "#A9D65C" },
  attention: { label: "Not Reconciled", color: "#E8A33D" },
  critical: { label: "No Data Found", color: "#E85D4A" },
};
const FILTERS = [
  ["all", "All"],
  ["excellent", "Reconciled"],
  ["good", "No Compliance"],
  ["attention", "Not Reconciled"],
  ["critical", "No Data"],
];
const STATE_LABEL = { missing: "No filing found", checked: "Reconciled", unchecked: "Filed, not reconciled" };

/* feather icons */
const svg = (children) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICON = {
  octagon: svg(<><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>),
  missing: svg(<><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>),
  checked: svg(<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>),
  unchecked: svg(<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
  file: svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>),
  pulse: svg(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
};

export default function AuditReconciliation() {
  const notify = useToast();
  const [type, setType] = useState("EBIR");
  const [month, setMonth] = useState(THIS_MONTH);
  const [phase, setPhase] = useState("idle"); // idle | loading | playing | done
  const [result, setResult] = useState(null); // { month, clients, files_dir, type_note }
  const [shown, setShown] = useState(0);
  const [filter, setFilter] = useState("all");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  const clients = result?.clients || [];
  const total = clients.length;
  const visibleClients = useMemo(() => clients.slice(0, shown), [clients, shown]);

  const counts = useMemo(() => {
    const c = { excellent: 0, good: 0, attention: 0, critical: 0 };
    visibleClients.forEach((x) => { c[x.status] += 1; });
    return c;
  }, [visibleClients]);

  // newest on top, like the old prepend()
  const logRows = useMemo(() => visibleClients.map((c, i) => ({ c, i })).reverse(), [visibleClients]);
  const filteredRows = filter === "all" ? logRows : logRows.filter((r) => r.c.status === filter);

  const payload = useMemo(() => (phase !== "done" ? [] : clients
    .filter((c) => c.status === "excellent")
    .map((c) => ({ client_id: c.client_id, compliance: c.compliance.filter((x) => x.state === "checked").map((x) => x.id) }))),
  [phase, clients]);

  const run = async () => {
    if (phase === "loading" || phase === "playing") return;
    if (!month) return notify("Month is required", "error");
    clearInterval(timer.current);
    setPhase("loading");
    setResult(null);
    setShown(0);
    setFilter("all");
    setSavedOnce(false);
    try {
      const res = await apiFetch(`/monitoring/audit-reconciliation?month=${month}&type=${type}`);
      if (res.files_dir) notify(res.files_dir, "error");
      if (res.type_note) notify(res.type_note, "error");
      setResult(res);
      if (!res.clients?.length) return setPhase("done");
      setPhase("playing");
      let i = 0;
      timer.current = setInterval(() => {
        i += 1;
        setShown(i);
        if (i >= res.clients.length) {
          clearInterval(timer.current);
          setPhase("done");
        }
      }, STEP_MS);
    } catch (e) {
      notify(e.message || "Couldn't run the diagnose.", "error");
      setPhase("idle");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/monitoring/audit-reconciliation", {
        method: "POST",
        body: JSON.stringify({ declared_month: result.month, reconciled: payload }),
      });
      notify(res.message);
      setSavedOnce(true);
      setConfirm(false);
    } catch (e) {
      notify(e.message || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  /* gauge */
  let percent = 0;
  let gaugeColor = "#8A90AC";
  let gaugeLabel = "Awaiting scan";
  if (phase === "loading") gaugeLabel = "Loading clients…";
  if (phase === "playing") {
    percent = Math.round((shown / total) * 100);
    gaugeColor = "#4C5FF0";
    gaugeLabel = `Client ${shown} / ${total}`;
  }
  if (phase === "done") {
    percent = total ? 100 : 0;
    gaugeColor = "#3FD6AC";
    gaugeLabel = total ? `${total} / ${total}` : "No clients to diagnose";
  }
  const offset = CIRC - (Math.min(100, Math.max(0, percent)) / 100) * CIRC;

  const summary = [
    counts.excellent && `${counts.excellent} reconciled`,
    counts.good && `${counts.good} no compliance`,
    counts.attention && `${counts.attention} not reconciled`,
    counts.critical && `${counts.critical} no data`,
  ].filter(Boolean).join(", ");

  const busy = phase === "loading" || phase === "playing";
  const pickFilter = (key) => setFilter((f) => (key !== "all" && f === key ? "all" : key));

  return (
    <div className="diag">
      <section className="card diag-console">
        <div className="diag-console-header">
          <div className="diag-console-title">
            <span className="diag-eyebrow">System Scan</span>
            <h4>Audit Reconciliation</h4>
          </div>
          <div className="diag-header-actions">
            <select className="diag-month-input" value={type} onChange={(e) => setType(e.target.value)} disabled={busy} aria-label="Return type">
              <option value="EBIR">EBIR</option>
              <option value="EFPS">EFPS</option>
            </select>
            <input type="month" className="diag-month-input" value={month} onChange={(e) => setMonth(e.target.value)} disabled={busy} aria-label="Declared month" />
            <button type="button" className={`diag-run-btn${busy ? " scanning" : ""}`} onClick={run} disabled={busy}>
              <span className="diag-run-icon">{ICON.pulse}</span>
              {busy ? "Scanning" : phase === "done" ? "Run Diagnose Again" : "Run Diagnose"}
            </button>
            <button type="button" className="diag-run-btn" onClick={() => setConfirm(true)}
              disabled={phase !== "done" || payload.length === 0 || savedOnce || saving}>
              <span className="diag-run-icon">{ICON.checked}</span>
              Reconcile
            </button>
          </div>
        </div>

        <div className="diag-body-grid">
          {/* left rail: gauge + tiles */}
          <div className="diag-rail">
            <div className="diag-gauge-wrap">
              <svg className="diag-gauge" viewBox="0 0 220 220" aria-hidden="true">
                <circle className="diag-gauge-ticks" cx="110" cy="110" r="104" />
                <circle className="diag-gauge-track" cx="110" cy="110" r={R} />
                <circle className="diag-gauge-fill" cx="110" cy="110" r={R}
                  style={{ strokeDasharray: CIRC, strokeDashoffset: offset, stroke: gaugeColor }} />
              </svg>
              <div className="diag-gauge-readout">
                <span className="diag-gauge-value">{percent}<small>%</small></span>
                <span className="diag-gauge-label">{gaugeLabel}</span>
              </div>
            </div>
            <div className="diag-stats-footnote">
              {phase === "done" && total ? `Scan complete · ${summary}` : `Ready to scan ${total} client account(s)`}
            </div>

            <div className="diag-stat-grid">
              {Object.entries(STATUS).map(([key, s]) => (
                <button type="button" key={key} className={`diag-stat-tile${filter === key ? " is-active" : ""}`}
                  data-status={key} onClick={() => pickFilter(key)}>
                  <span className="diag-stat-tile-name">{s.label}</span>
                  <span className="diag-stat-tile-count">{counts[key]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* right: scan log */}
          <div className="diag-log-panel">
            <div className="diag-log-panel-header">
              <span className="diag-log-panel-title">Scan Log</span>
              <div className="diag-log-filters">
                {FILTERS.map(([key, label]) => (
                  <button type="button" key={key} className={`diag-filter-btn${filter === key ? " is-active" : ""}`}
                    onClick={() => pickFilter(key)}>{label}</button>
                ))}
              </div>
              <span className="diag-log-panel-title">{filteredRows.length} entries</span>
            </div>

            <div className="diag-log">
              {phase === "idle" && (
                <div className="diag-empty-state">
                  <span className="diag-empty-glyph">&#9678;</span>
                  Run a diagnostic to generate a live reconciliation report for every client account.
                </div>
              )}
              {phase === "loading" && (
                <div className="diag-empty-state">
                  <span className="diag-empty-glyph diag-loading-spin">&#9678;</span>
                  Fetching client data…
                </div>
              )}
              {phase === "done" && !total && <div className="diag-empty-state">No clients found for this scan.</div>}

              {filteredRows.map(({ c, i }) => <LogLine key={c.client_id} c={c} index={i} />)}
            </div>
          </div>
        </div>
      </section>

      {confirm && (
        <ConfirmDialog title="Reconcile?"
          message={`Save ${payload.length} reconciled client(s) for ${result?.month}? Are you sure you want to continue?`}
          confirmLabel={saving ? "Saving…" : "Yes"} onCancel={() => !saving && setConfirm(false)} onConfirm={save} />
      )}
    </div>
  );
}

function LogLine({ c, index }) {
  const s = STATUS[c.status];
  const hasTin = c.tin && c.tin !== "N/A" && String(c.tin).trim() !== "";
  const score = c.score;

  return (
    <div className={`diag-log-line status-${c.status}`}>
      <span className="diag-log-index">{String(index + 1).padStart(3, "0")}</span>
      <div className="diag-log-main">
        <span className="diag-log-name">
          {c.name}
          {c.saved && <span className="diag-saved-tag">Saved</span>}
        </span>
        <div className="diag-log-issues">{c.tin}</div>

        {!hasTin ? (
          <div className="diag-status-badge is-critical">
            <span className="diag-compliance-check">{ICON.octagon}</span>
            No Data Found — missing or invalid TIN
          </div>
        ) : !c.compliance.length ? (
          <div className="diag-status-badge is-good">
            <span className="diag-compliance-check">{ICON.file}</span>
            No Compliance required this period
          </div>
        ) : (
          <ul className="diag-compliance-list">
            {c.compliance.map((x) => (
              <li key={x.id} className={`diag-compliance-item is-${x.state}`}>
                <span className="diag-compliance-check">{ICON[x.state]}</span>
                <span>{x.code} — {STATE_LABEL[x.state]}{x.file ? ` (${x.file})` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="diag-log-meter" title={s.label}>
        <span className="diag-log-score">{score === null ? "N/A" : `${score}%`}</span>
        <div className="diag-log-bar"><div className="diag-log-bar-fill" style={{ width: `${score ?? 0}%` }} /></div>
      </div>
    </div>
  );
}
