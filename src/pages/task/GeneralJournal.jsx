// Task → General Journal (old General_Journal.php)
// List: Txn No · Transaction Date · Declared Month · Debit · Credit.  ADD NEW / edit opens the GL entry grid.
// Saves to your t_general_journal (jv_no, account_code, subsidiary, debit, credit, remarks, transaction_date, declared_month, added_by, employee_id).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Badge from "../../components/Badge";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import "./GeneralJournalTypes.css";

const API = "/general-journal";
const ROUTE = "/task/general-journal";
const TABLE_HEIGHT = "calc(100vh - 375px)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const today = () => new Date().toISOString().slice(0, 10);
const fmtDay = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};
const fmtMonth = (ym) => {
  if (!ym || !/^\d{4}-\d{2}/.test(ym)) return ym || "—";
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const blankLine = () => ({ account_code: "", remarks: "", debit: "", credit: "", subsidiary: null });
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/* entry types: Normal → every report · Adjusting → GL, Trial Balance, Working Trial Balance (Adjusting Entries) · Closing → GL only */
const TYPE_TABS = [
  { key: "ALL", label: "All" },
  { key: "NORMAL", label: "Normal Entry" },
  { key: "ADJUSTING", label: "Adjusting Entry" },
  { key: "CLOSING", label: "Closing Entry" },
];
const TYPE_BADGE = { NORMAL: ["gray", "Normal"], ADJUSTING: ["orange", "Adjusting"], CLOSING: ["purple", "Closing"] };
const TYPE_NOTE = {
  NORMAL: "Shows in the General Ledger, Trial Balance, Working Trial Balance (Data) and every report.",
  ADJUSTING: "Shows in the General Ledger, Trial Balance and the Working Trial Balance → Adjusting Entries.",
};

/* ---------- Closing Entry: close every Income Statement account to Retained Earnings ----------
   Saved as CE-YYYY. Reports leave CE- entries out (General Ledger only), so the Working Trial Balance
   still shows the year's figures; one closing entry per year (an existing CE-YYYY opens for edit). 
   Uses the Working Trial Balance (final closing = beg + data + adjusting, debit − credit).
   Debit balance (expenses, cost) → Credit it · Credit balance (revenue, other income) → Debit it.
   The difference (net income / loss) goes to Retained Earnings (or Income Summary). */
const findClosingAccount = (accounts) => {
  const by = (re) => accounts.find((a) => re.test(a.account_name || ""));
  return (by(/retained\s*earnings?/i) || by(/income\s*summary/i) || by(/accumulated\s*(profit|earnings)/i))?.account_code || "";
};

async function buildClosing(year, accounts) {
  const res = await apiFetch(`/reports/working-trial-balance?${new URLSearchParams({ year: String(year), branch: "current" })}`);
  const lines = [];
  let dr = 0;
  let cr = 0;
  (res.rows || [])
    .filter((r) => r.statement === "IS")
    .forEach((r) => {
      const fclose = r2((r.beg_debit + r.data_debit + r.adj_debit) - (r.beg_credit + r.data_credit + r.adj_credit));
      if (!fclose) return;
      const remarks = `To close ${r.account_name} (${year})`;
      if (fclose > 0) { lines.push({ ...blankLine(), account_code: r.account_code, remarks, credit: String(fclose) }); cr += fclose; }
      else { lines.push({ ...blankLine(), account_code: r.account_code, remarks, debit: String(-fclose) }); dr += -fclose; }
    });

  const net = r2(dr - cr);                 // > 0 net income → credit Retained Earnings · < 0 net loss → debit it
  if (lines.length && net) {
    lines.push({
      ...blankLine(),
      account_code: findClosingAccount(accounts),
      remarks: `${net > 0 ? "Net Income" : "Net Loss"} ${year} to Retained Earnings`,
      debit: net < 0 ? String(-net) : "",
      credit: net > 0 ? String(net) : "",
      closingTarget: true,
    });
  }
  return { lines, net, count: lines.length };
}

export default function GeneralJournal() {
  const { user } = useAuth();
  const { from, to } = usePeriod();
  const notify = useToast();
  // ?type=ADJUSTING&from=2026-01&to=2026-12&account=61000 (link from the Working Trial Balance)
  const [params, setParams] = useSearchParams();
  const linkFrom = /^\d{4}-\d{2}$/.test(params.get("from") || "") ? params.get("from") : null;
  const linkTo = /^\d{4}-\d{2}$/.test(params.get("to") || "") ? params.get("to") : null;
  const account = params.get("account") || "";
  const [type, setTypeState] = useState(() => (TYPE_TABS.some((t) => t.key === String(params.get("type") || "").toUpperCase()) ? String(params.get("type")).toUpperCase() : "ALL"));
  const setType = (t) => {
    setTypeState(t);
    const next = new URLSearchParams(params);
    if (t === "ALL") next.delete("type"); else next.set("type", t);
    setParams(next, { replace: true });
  };
  const clearLink = () => setParams(type === "ALL" ? {} : { type }, { replace: true });

  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [entry, setEntry] = useState(null);       // form being edited
  const [closingBusy, setClosingBusy] = useState(false);
  const fromMonth = linkFrom || from.slice(0, 7);
  const toMonth = linkTo || to.slice(0, 7);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await apiFetch(`${API}?${new URLSearchParams({ from: fromMonth, to: toMonth, ...(account ? { account_code: account } : {}) })}`));
    } catch (e) {
      setError(e.message || "Couldn't load journal entries.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromMonth, toMonth, account]);

  useEffect(() => { load(); }, [load, user?.id, user?.caid]);
  useEffect(() => {
    apiFetch(`${API}/accounts`).then(setAccounts).catch(() => setAccounts([]));
  }, [user?.id, user?.caid]);

  const counts = useMemo(() => rows.reduce((c, r) => ({ ...c, [r.entry_type || "NORMAL"]: (c[r.entry_type || "NORMAL"] || 0) + 1 }), {}), [rows]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => type === "ALL" || (r.entry_type || "NORMAL") === type)
      .filter((r) => !q || [r.jv_no, r.transaction_date, r.declared_month, r.entry_type].join(" ").toLowerCase().includes(q));
  }, [rows, query, type]);

  const openNew = () => setEntry({
    original: null, jv_no: "", transaction_date: today(), declared_month: today().slice(0, 7),
    entry_type: type === "ADJUSTING" ? "ADJUSTING" : "NORMAL",
    lines: Array.from({ length: 10 }, blankLine), isDepreciation: false,
  });

  // Closing Entry → new journal popup filled with the closing lines of the year
  const openClosing = async (year = Number(to.slice(0, 4)) || new Date().getFullYear()) => {
    setClosingBusy(true);
    try {
      // already closed? → open that entry instead of making a second one
      const existing = await apiFetch(`${API}/entry/${encodeURIComponent(`CE-${year}`)}`).catch(() => null);
      if (existing?.lines?.length) {          // already closed → open it for edit / delete
        openEdit({ jv_no: `CE-${year}` }, existing);
        return;
      }
      const c = await buildClosing(year, accounts || []);
      setEntry({
        original: null, closing: true, year,
        jv_no: `CE-${year}`, transaction_date: `${year}-12-31`, declared_month: `${year}-12`,
        lines: [...c.lines, ...Array.from({ length: 3 }, blankLine)], isDepreciation: false,
        net: c.net, empty: c.count === 0,
      });
    } catch (e) {
      notify(e.message || "Couldn't build the closing entry.", "error");
    } finally {
      setClosingBusy(false);
    }
  };

  // the lines of a fresh closing (used by "Recompute" on a saved CE-YYYY)
  const rebuildClosing = async (year) => {
    const c = await buildClosing(year, accounts || []);
    return { lines: [...c.lines, ...Array.from({ length: 3 }, blankLine)], net: c.net, empty: c.count === 0 };
  };

  const openEdit = async (r, loaded = null) => {
    try {
      const d = loaded || await apiFetch(`${API}/entry/${encodeURIComponent(r.jv_no)}`);
      const ce = /^CE-(\d{4})$/i.exec(d.jv_no || "");   // a saved closing entry → keep the Year picker
      setEntry({
        original: d.jv_no, jv_no: d.jv_no, transaction_date: d.transaction_date, declared_month: d.declared_month || d.transaction_date.slice(0, 7),
        isDepreciation: !!d.is_depreciation,
        entry_type: d.entry_type || (d.is_depreciation ? "ADJUSTING" : "NORMAL"),
        ...(ce ? { closing: true, year: Number(ce[1]) } : {}),
        lines: [
          ...d.lines.map((l) => ({ account_code: l.account_code, remarks: l.remarks || "", debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "", subsidiary: l.subsidiary ?? null })),
          ...Array.from({ length: 5 }, blankLine),   // room to add lines, like the old page
        ],
      });
    } catch (e) {
      notify(e.message || "Unable to load journal details", "error");
    }
  };

  const columns = [
    {
      key: "jv_no", label: "Txn No", render: (r) => (
        <span className="inv-no-cell">
          <span className="mono strong">{r.jv_no}</span>
          {r.is_depreciation && <Badge tone="blue">Depreciation</Badge>}
        </span>
      )
    },
    {
      key: "entry_type", label: "Type", value: (r) => r.entry_type || "NORMAL",
      render: (r) => { const [tone, label] = TYPE_BADGE[r.entry_type] || TYPE_BADGE.NORMAL; return <Badge tone={tone}>{label}</Badge>; },
    },
    { key: "transaction_date", label: "Transaction Date", render: (r) => fmtDay(r.transaction_date) },
    { key: "declared_month", label: "Declared Month", render: (r) => fmtMonth(r.declared_month) },
    { key: "lines_count", label: "Lines", align: "right", value: (r) => Number(r.lines_count) },
    { key: "debit", label: "Debit", align: "right", value: (r) => Number(r.debit), render: (r) => <span className="mono">{n2(r.debit)}</span> },
    { key: "credit", label: "Credit", align: "right", value: (r) => Number(r.credit), render: (r) => <span className="mono">{n2(r.credit)}</span> },
  ];

  return (
    <>
      <SearchCard
        query={query}
        setQuery={setQuery}
        placeholder="Search txn no or date..."
        actions={[
          { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
          { label: closingBusy ? "Preparing…" : "Closing Entry", onClick: () => openClosing(), disabled: !accounts || closingBusy },
          { label: "Add New", icon: "plus", variant: "primary", onClick: openNew, disabled: !accounts },
        ]}
        sticky
      />

      <div className="gj-tabs" role="tablist" aria-label="Entry type">
        {TYPE_TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={type === t.key} className={`gj-tab${type === t.key ? " is-on" : ""}`} onClick={() => setType(t.key)}>
            {t.label}
            <span className="gj-tab-count">{t.key === "ALL" ? rows.length : counts[t.key] || 0}</span>
          </button>
        ))}
      </div>

      {(linkFrom || account) && (
        <div className="inv-banner gj-link-note">
          Showing {account ? <>entries with account <b className="mono">{account}</b></> : "entries"} from {fmtMonth(fromMonth)} to {fmtMonth(toMonth)} (from the Working Trial Balance).
          <button type="button" className="btn btn-sm" onClick={clearLink}>Show the whole period</button>
        </div>
      )}

      {error && (
        <div className="alert-error" role="alert">
          {error} <button className="btn btn-sm" onClick={load}>Try again</button>
        </div>
      )}

      <div className="sales-table">
        <DataTable
          bodyHeight={TABLE_HEIGHT}
          columns={columns}
          rows={loading ? [] : filtered}
          rowKey="jv_no"
          exportName={`general-journal-${fromMonth}-to-${toMonth}`}
          showToolbar={false}
          emptyText={loading ? "Loading…" : "No journal entries for this period."}
          onRowClick={openEdit}
          rowActions={(r) => [{ label: "Edit", onClick: () => openEdit(r) }]}
        />
      </div>

      {entry && accounts && (
        <EntryModal
          key={entry.closing ? `closing-${entry.year}-${entry.original || "new"}` : `entry-${entry.original || "new"}`}
          initial={entry}
          accounts={accounts}
          onYear={openClosing}
          onRebuild={rebuildClosing}
          closedYears={rows.map((r) => /^CE-(\d{4})$/i.exec(r.jv_no || "")?.[1]).filter(Boolean).map(Number)}
          onClose={() => setEntry(null)}
          onSaved={(msg) => { setEntry(null); notify(msg); load(); }}
        />
      )}
    </>
  );
}

/* ---------- GL Journal Entry popup (old modal_Journal) ---------- */
function EntryModal({ initial, accounts, onClose, onSaved, onYear, onRebuild, closedYears = [] }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const savedClosing = f.closing && !!f.original;     // CE-YYYY already saved → edit / delete / recompute

  // years to pick: the last 10 + any year that already has a CE-YYYY
  const thisYear = new Date().getFullYear();
  const yearOptions = [...new Set([...Array.from({ length: 10 }, (_, i) => thisYear - i), ...closedYears, f.year].filter(Boolean))].sort((a, b) => b - a);

  const recompute = async () => {
    setRebuilding(true);
    setError("");
    try {
      const c = await onRebuild(f.year);
      setF((x) => ({ ...x, ...c }));
    } catch (e) {
      setError(e.message || "Couldn't recompute the closing.");
    } finally {
      setRebuilding(false);
    }
  };

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setLine = (i, p) => setF((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const addLines = () => setF((x) => ({ ...x, lines: [...x.lines, ...Array.from({ length: 5 }, blankLine)] }));

  const accountOpts = [{ value: "", label: "—" }, ...accounts.map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` }))];
  const used = f.lines.filter((l) => l.account_code);
  const dr = used.reduce((n, l) => n + (Number(l.debit) || 0), 0);
  const cr = used.reduce((n, l) => n + (Number(l.credit) || 0), 0);
  const diff = Math.round((dr - cr) * 100) / 100;

  const save = async () => {
    setError("");
    if (!f.jv_no.trim()) return setError("Please input reference no.");
    if (!f.closing && !/^CE-/i.test(f.original || "") && /^CE-/i.test(f.jv_no.trim())) return setError("References starting with CE- are for Closing Entry only.");
    if (!f.declared_month) return setError("Declared Month is required.");
    if (f.closing) {
      const noAcct = f.lines.findIndex((l) => !l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0));
      if (noAcct >= 0) return setError(`Line ${noAcct + 1}: choose the Retained Earnings account for the net ${f.net >= 0 ? "income" : "loss"}.`);
    }
    if (used.length < 2) return setError("Add at least two lines (a debit and a credit).");
    const both = used.findIndex((l) => Number(l.debit) > 0 && Number(l.credit) > 0);
    if (both >= 0) return setError(`Line ${both + 1}: put the amount in Debit or Credit, not both.`);
    if (dr <= 0) return setError("Enter the amounts.");
    if (diff !== 0) return setError(`Not balanced: difference of ${n2(Math.abs(diff))}.`);

    setSaving(true);
    try {
      const res = await apiFetch(API, {
        method: "POST",
        body: JSON.stringify({
          original_jv_no: f.original, jv_no: f.jv_no.trim(), transaction_date: f.transaction_date, declared_month: f.declared_month,
          ...(f.closing ? {} : { entry_type: f.isDepreciation ? "ADJUSTING" : f.entry_type || "NORMAL" }),
          lines: used.map((l) => ({ account_code: l.account_code, remarks: l.remarks || null, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, subsidiary: l.subsidiary ?? null })),
        }),
      });
      onSaved(res.message || "Record successfully saved");
    } catch (e) {
      setError(e.message || "Couldn't save.");
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      const res = await apiFetch(`${API}/entry/${encodeURIComponent(f.original)}`, { method: "DELETE" });
      onSaved(res.message || "Journal entry deleted");
    } catch (e) {
      setError(e.message || "Couldn't delete.");
      setConfirmDelete(false);
    }
  };

  return (
    <Modal
      title={savedClosing ? `Closing Entry · ${f.year} · saved as ${f.original}` : f.original ? `Edit Journal · ${f.original}` : f.closing ? `Closing Entry · ${f.year}` : f.entry_type === "ADJUSTING" ? "ADD : Adjusting Entry" : "ADD : GL Journal Entry"}
      onClose={() => !saving && onClose()}
      size="lg"
      footer={
        <>
          {f.original && <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => setConfirmDelete(true)} disabled={saving}>Delete</button>}
          <button className="btn" onClick={onClose} disabled={saving}>Close</button>
          {savedClosing && (
            <button className="btn" onClick={recompute} disabled={saving || rebuilding} title="Replace the lines with a fresh closing from the Working Trial Balance">
              {rebuilding ? "Recomputing…" : "Recompute"}
            </button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={saving || rebuilding || (f.closing && f.empty)}>
            {saving ? "Saving…" : f.closing && !f.original ? "Submit" : "SAVE"}
          </button>
        </>
      }
    >
      {error && <div className="alert-error" role="alert">{error}</div>}
      {f.isDepreciation && (
        <div className="inv-banner" style={{ marginBottom: 10 }}>This entry was posted by Fixed Asset Management. Deleting it lets you post that month again.</div>
      )}

      {f.closing && (
        <div className="inv-banner" style={{ marginBottom: 10 }}>
          {savedClosing && !f.net && f.net !== 0
            ? <>{f.year} is already closed ({f.original}). Change the lines and SAVE, press <b>Recompute</b> to rebuild it from the Working Trial Balance, or <b>Delete</b> it. Pick another year above to open that year.</>
            : f.empty
              ? `Nothing to close for ${f.year}: every Income Statement account is already zero (closed, or no entries).`
              : <>Closes every Income Statement account (revenue, cost of sales, expenses, other income/expense) for {f.year}.
                {" "}{f.net >= 0 ? "Net income" : "Net loss"} of <b>{n2(Math.abs(f.net))}</b> goes to Retained Earnings. Check the lines, then Submit.</>}
        </div>
      )}

      {!f.closing && (
        <div className="gj-type-pick" role="radiogroup" aria-label="Entry type">
          {["NORMAL", "ADJUSTING"].map((t) => (
            <label key={t} className={`gj-type-opt${(f.entry_type || "NORMAL") === t ? " is-on" : ""}${f.isDepreciation && t === "NORMAL" ? " is-off" : ""}`}>
              <input type="radio" name="gj-entry-type" value={t} checked={(f.entry_type || "NORMAL") === t}
                disabled={f.isDepreciation} onChange={() => set("entry_type", t)} />
              <span><b>{t === "NORMAL" ? "Normal Entry" : "Adjusting Entry"}</b><small>{TYPE_NOTE[t]}</small></span>
            </label>
          ))}
        </div>
      )}

      <div className="form-grid" style={{ gridTemplateColumns: f.closing ? "0.6fr 1fr 1fr 1fr" : "1fr 1fr 1fr" }}>
        {f.closing && (
          <Field label="Year" hint={closedYears.includes(f.year) ? "Closed · saved" : "Not closed yet"}>
            <select className="input" value={f.year} onChange={(e) => onYear?.(Number(e.target.value))} disabled={saving || rebuilding}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}{closedYears.includes(y) ? " · closed" : ""}</option>)}
            </select>
          </Field>
        )}
        <Field label="Date"><input type="date" className="input" value={f.transaction_date} onChange={(e) => set("transaction_date", e.target.value)} /></Field>
        <Field label="Declared Month"><input type="month" className="input" value={f.declared_month} onChange={(e) => set("declared_month", e.target.value)} /></Field>
        <Field label="Reference">
          <input className="input" maxLength={60} value={f.jv_no} onChange={(e) => set("jv_no", e.target.value)} autoFocus={!f.original && !f.closing}
            readOnly={f.closing || /^CE-/i.test(f.original || "")} title={f.closing ? "Closing entries keep the CE- reference (General Ledger only)" : undefined} />
        </Field>
      </div>

      <div className="xl-wrap" style={{ marginTop: 12 }}>
        <div className="xl-scroll" style={{ maxHeight: "50vh" }}>
          <table className="xl">
            <colgroup>
              <col style={{ width: "4%" }} /><col style={{ width: "34%" }} /><col style={{ width: "34%" }} />
              <col style={{ width: "14%" }} /><col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="xl-rownum">#</th>
                <th>GL Account</th>
                <th>Description</th>
                <th className="ta-right">Debit</th>
                <th className="ta-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {f.lines.map((l, i) => (
                <tr key={i}>
                  <td className="xl-rownum">{i + 1}</td>
                  <td>
                    <SearchSelect variant="cell" value={l.account_code} onChange={(v) => setLine(i, { account_code: v })} options={accountOpts}
                      placeholder="Select account" searchPlaceholder="Search account..." aria-label={`GL Account row ${i + 1}`} />
                  </td>
                  <td><input className="xl-input" value={l.remarks} onChange={(e) => setLine(i, { remarks: e.target.value })} aria-label={`Description row ${i + 1}`} /></td>
                  <td>
                    <input className="xl-input num" inputMode="decimal" placeholder="0.00" value={l.debit}
                      onChange={(e) => setLine(i, { debit: cleanNum(e.target.value), credit: e.target.value ? "" : l.credit })} aria-label={`Debit row ${i + 1}`} />
                  </td>
                  <td>
                    <input className="xl-input num" inputMode="decimal" placeholder="0.00" value={l.credit}
                      onChange={(e) => setLine(i, { credit: cleanNum(e.target.value), debit: e.target.value ? "" : l.debit })} aria-label={`Credit row ${i + 1}`} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="xl-rownum">
                  <button type="button" className="icon-btn ghost" onClick={addLines} aria-label="Add rows" title="Add 5 rows">+</button>
                </td>
                <td>{used.length} line(s)</td>
                <td className="ta-right" style={{ color: diff === 0 ? undefined : "var(--danger, #dc2626)" }}>
                  {used.length ? (diff === 0 ? "Balanced" : `Difference ${n2(Math.abs(diff))}`) : ""}
                </td>
                <td className="ta-right mono strong">{n2(dr)}</td>
                <td className="ta-right mono strong">{n2(cr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${f.original}?`}
          message="All lines of this journal entry will be removed."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </Modal>
  );
}