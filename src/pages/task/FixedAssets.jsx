// Task → Fixed Asset Management
// Asset register · straight-line depreciation schedule · Post Depreciation (writes the entry to General Journal)
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Badge from "../../components/Badge";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";

const API = "/fixed-assets";
const ROUTE = "/task/fixed-assets";
const TABLE_HEIGHT = "calc(100vh - 375px)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => today().slice(0, 7);
const lastDayOf = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
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

export default function FixedAssets() {
  const { user } = useAuth();
  const notify = useToast();

  const [rows, setRows] = useState([]);
  const [accounts, setAccounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [edit, setEdit] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [dispose, setDispose] = useState(null);
  const [post, setPost] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await apiFetch(API));
    } catch (e) {
      setError(e.message || "Couldn't load assets.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, user?.id, user?.caid]);
  useEffect(() => { apiFetch(`${API}/accounts`).then(setAccounts).catch(() => setAccounts([])); }, [user?.id, user?.caid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      (!status || r.status === status) &&
      (!q || [r.asset_no, r.name, r.category, r.location, r.serial_no].join(" ").toLowerCase().includes(q))
    );
  }, [rows, query, status]);

  const totals = useMemo(() => ({
    cost: filtered.reduce((n, r) => n + Number(r.cost), 0),
    acc: filtered.reduce((n, r) => n + Number(r.accumulated), 0),
    book: filtered.reduce((n, r) => n + Number(r.book_value), 0),
    due: filtered.reduce((n, r) => n + (r.status === "active" ? Number(r.due_this_month) : 0), 0),
  }), [filtered]);

  const openNew = () => setEdit({
    id: null, name: "", category: "", description: "", location: "", serial_no: "",
    acquisition_date: today(), depreciation_start: thisMonth(), cost: "", salvage_value: "0", useful_life_months: "60",
    asset_account: "", accum_dep_account: "", dep_expense_account: "", remarks: "", locked: false,
  });
  const openEdit = (r) => setEdit({
    ...r, cost: String(r.cost), salvage_value: String(r.salvage_value), useful_life_months: String(r.useful_life_months),
    locked: !!r.last_posted,
  });

  const remove = async () => {
    try {
      const res = await apiFetch(`${API}/${toDelete.id}`, { method: "DELETE" });
      notify(res.message);
      setToDelete(null);
      load();
    } catch (e) {
      notify(e.message || "Couldn't delete.", "error");
      setToDelete(null);
    }
  };

  const restore = async (r) => {
    try { const res = await apiFetch(`${API}/${r.id}/restore`, { method: "POST" }); notify(res.message); load(); }
    catch (e) { notify(e.message || "Couldn't restore.", "error"); }
  };

  const columns = [
    { key: "asset_no", label: "Asset No", render: (r) => <span className="mono">{r.asset_no}</span> },
    {
      key: "name", label: "Asset", render: (r) => (
        <div>
          <div className="strong">{r.name}</div>
          <div className="muted small">{[r.category, r.location].filter(Boolean).join(" · ")}</div>
        </div>
      )
    },
    { key: "acquisition_date", label: "Acquired", render: (r) => fmtDay(r.acquisition_date) },
    { key: "cost", label: "Cost", align: "right", value: (r) => Number(r.cost), render: (r) => <span className="mono">{n2(r.cost)}</span> },
    { key: "life", label: "Life", align: "right", value: (r) => Number(r.useful_life_months), render: (r) => `${r.useful_life_months} mo` },
    { key: "monthly", label: "Monthly", align: "right", value: (r) => Number(r.monthly), render: (r) => <span className="mono">{n2(r.monthly)}</span> },
    { key: "accumulated", label: "Accum. Dep.", align: "right", value: (r) => Number(r.accumulated), render: (r) => <span className="mono">{n2(r.accumulated)}</span> },
    { key: "book_value", label: "Book Value", align: "right", value: (r) => Number(r.book_value), render: (r) => <span className="mono strong">{n2(r.book_value)}</span> },
    { key: "last_posted", label: "Posted Until", render: (r) => (r.last_posted ? fmtMonth(r.last_posted) : "—") },
    { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "active" ? "green" : "gray"}>{r.status === "active" ? "Active" : "Disposed"}</Badge> },
  ];

  const rowActions = (r) => [
    { label: "Schedule", onClick: () => setSchedule(r) },
    { label: "Edit", onClick: () => openEdit(r) },
    r.status === "active"
      ? { label: "Dispose", onClick: () => setDispose({ id: r.id, name: r.name, disposed_date: today(), disposal_amount: "", remarks: "" }) }
      : { label: "Restore (undo disposal)", onClick: () => restore(r) },
    { label: "Delete", onClick: () => setToDelete(r) },
  ];

  return (
    <>
      <SearchCard
        query={query}
        setQuery={setQuery}
        placeholder="Search asset no, name, category, location..."
        actions={[
          { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
          { label: "Post Depreciation", icon: "calendar", onClick: () => setPost(true) },
          { label: "Add Asset", icon: "plus", variant: "primary", onClick: openNew, disabled: !accounts },
        ]}
        extra={
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" style={{ width: 140 }}>
            <option value="active">Active</option>
            <option value="disposed">Disposed</option>
            <option value="">All</option>
          </select>
        }
        sticky
      />

      {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: "8px 28px", padding: "10px 16px", marginBottom: 10, fontSize: 13.5 }}>
        <span><b>{filtered.length}</b> asset{filtered.length === 1 ? "" : "s"}</span>
        <span>Cost <b className="mono">{n2(totals.cost)}</b></span>
        <span>Accumulated <b className="mono">{n2(totals.acc)}</b></span>
        <span>Book value <b className="mono">{n2(totals.book)}</b></span>
        <span>Due {fmtMonth(thisMonth())} <b className="mono">{n2(totals.due)}</b></span>
      </div>

      <div className="sales-table">
        <DataTable
          bodyHeight={TABLE_HEIGHT}
          columns={columns}
          rows={loading ? [] : filtered}
          rowKey="id"
          exportName="fixed-assets"
          showToolbar={false}
          emptyText={loading ? "Loading…" : "No fixed assets yet. Click Add Asset."}
          onRowClick={(r) => setSchedule(r)}
          rowActions={rowActions}
        />
      </div>

      {edit && accounts && <AssetModal initial={edit} accounts={accounts} onClose={() => setEdit(null)} onSaved={(m) => { setEdit(null); notify(m); load(); }} />}
      {schedule && <ScheduleModal asset={schedule} onClose={() => setSchedule(null)} />}
      {dispose && <DisposeModal initial={dispose} onClose={() => setDispose(null)} onSaved={(m) => { setDispose(null); notify(m); load(); }} />}
      {post && <PostModal onClose={() => setPost(false)} onPosted={(m) => { setPost(false); notify(m); load(); }} />}
      {toDelete && (
        <ConfirmDialog title={`Delete ${toDelete.name}?`} message="Only assets without posted depreciation can be deleted."
          confirmLabel="Delete" onCancel={() => setToDelete(null)} onConfirm={remove} />
      )}
    </>
  );
}

/* ---------- Add / Edit asset ---------- */
function AssetModal({ initial, accounts, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const opts = (pred) => [{ value: "", label: "— Select —" }, ...accounts.filter(pred).map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` }))];
  const allOpts = opts(() => true);
  const accumOpts = opts((a) => /accum|depreciation/i.test(a.account_name)).length > 1 ? opts((a) => /accum|depreciation/i.test(a.account_name)) : allOpts;
  const expOpts = opts((a) => /deprec/i.test(a.account_name)).length > 1 ? opts((a) => /deprec/i.test(a.account_name)) : allOpts;

  const cost = Number(f.cost) || 0;
  const salvage = Number(f.salvage_value) || 0;
  const life = Number(f.useful_life_months) || 0;
  const monthly = life > 0 ? Math.round(((cost - salvage) / life) * 100) / 100 : 0;

  const submit = async () => {
    setError("");
    if (!f.name.trim()) return setError("Asset name is required.");
    if (!(cost > 0)) return setError("Cost is required.");
    if (salvage > cost) return setError("Salvage value can't be more than the cost.");
    if (!(life >= 1)) return setError("Useful life (months) is required.");
    if (!f.asset_account || !f.accum_dep_account || !f.dep_expense_account) return setError("Pick the asset, accumulated depreciation and depreciation expense accounts.");
    setSaving(true);
    try {
      const body = {
        name: f.name.trim(), category: f.category || null, description: f.description || null, location: f.location || null,
        serial_no: f.serial_no || null, acquisition_date: f.acquisition_date, depreciation_start: f.depreciation_start,
        cost, salvage_value: salvage, useful_life_months: life,
        asset_account: f.asset_account, accum_dep_account: f.accum_dep_account, dep_expense_account: f.dep_expense_account, remarks: f.remarks || null,
      };
      const res = await apiFetch(f.id ? `${API}/${f.id}` : API, { method: f.id ? "PUT" : "POST", body: JSON.stringify(body) });
      onSaved(res.message || "Asset saved");
    } catch (e) {
      setError(e.message || "Couldn't save.");
      setSaving(false);
    }
  };

  return (
    <Modal
      title={f.id ? `Edit ${f.asset_no}` : "Add Fixed Asset"}
      onClose={() => !saving && onClose()}
      size="lg"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}
    >
      {error && <div className="alert-error" role="alert">{error}</div>}
      {f.locked && <div className="inv-banner" style={{ marginBottom: 10 }}>Depreciation is already posted, so cost, salvage, life, start month and depreciation accounts are locked.</div>}

      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Field label="Asset name *"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
        <Field label="Category"><input className="input" placeholder="e.g. Office Equipment" value={f.category || ""} onChange={(e) => set("category", e.target.value)} /></Field>
        <Field label="Location"><input className="input" value={f.location || ""} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Serial No"><input className="input" value={f.serial_no || ""} onChange={(e) => set("serial_no", e.target.value)} /></Field>
        <Field label="Acquisition date *"><input type="date" className="input" value={f.acquisition_date} onChange={(e) => set("acquisition_date", e.target.value)} /></Field>
        <Field label="Depreciation starts *"><input type="month" className="input" value={f.depreciation_start} disabled={f.locked} onChange={(e) => set("depreciation_start", e.target.value)} /></Field>
        <Field label="Cost *"><input className="input ta-right" inputMode="decimal" value={f.cost} disabled={f.locked} onChange={(e) => set("cost", cleanNum(e.target.value))} /></Field>
        <Field label="Salvage value"><input className="input ta-right" inputMode="decimal" value={f.salvage_value} disabled={f.locked} onChange={(e) => set("salvage_value", cleanNum(e.target.value))} /></Field>
        <Field label="Useful life (months) *"><input className="input ta-right" inputMode="numeric" value={f.useful_life_months} disabled={f.locked} onChange={(e) => set("useful_life_months", e.target.value.replace(/\D/g, ""))} /></Field>
      </div>

      <p className="muted small" style={{ margin: "4px 0 10px" }}>
        Straight-line: ({n2(cost)} − {n2(salvage)}) ÷ {life || 0} months = <b>{n2(monthly)}</b> per month
        {life ? ` (${(life / 12).toFixed(life % 12 ? 1 : 0)} years)` : ""}
      </p>

      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="field"><span className="field-label">Asset account *</span>
          <SearchSelect value={f.asset_account || ""} onChange={(v) => set("asset_account", v)} options={allOpts} searchPlaceholder="Search account..." aria-label="Asset account" /></div>
        <div className="field"><span className="field-label">Accumulated depreciation *</span>
          {f.locked ? <input className="input" readOnly value={f.accum_dep_account} /> :
            <SearchSelect value={f.accum_dep_account || ""} onChange={(v) => set("accum_dep_account", v)} options={allOpts} searchPlaceholder="Search account..." aria-label="Accumulated depreciation account" />}</div>
        <div className="field"><span className="field-label">Depreciation expense *</span>
          {f.locked ? <input className="input" readOnly value={f.dep_expense_account} /> :
            <SearchSelect value={f.dep_expense_account || ""} onChange={(v) => set("dep_expense_account", v)} options={expOpts} searchPlaceholder="Search account..." aria-label="Depreciation expense account" />}</div>
      </div>
      <Field label="Remarks"><input className="input" value={f.remarks || ""} onChange={(e) => set("remarks", e.target.value)} /></Field>
    </Modal>
  );
}

/* ---------- Depreciation schedule ---------- */
function ScheduleModal({ asset, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch(`${API}/${asset.id}/schedule`).then(setData).catch((e) => setError(e.message || "Couldn't load the schedule."));
  }, [asset.id]);
  const now = thisMonth();

  return (
    <Modal title={`Depreciation Schedule · ${asset.name}`} onClose={onClose} size="lg">
      <p className="muted small" style={{ marginTop: 0 }}>
        {asset.asset_no} · Cost {n2(asset.cost)} · Salvage {n2(asset.salvage_value)} · {asset.useful_life_months} months from {fmtMonth(asset.depreciation_start)}
      </p>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="table-scroll" style={{ maxHeight: "60vh" }}>
        <table className="table">
          <thead>
            <tr><th>Month</th><th className="ta-right">Depreciation</th><th className="ta-right">Accumulated</th><th className="ta-right">Book Value</th><th>Posted</th></tr>
          </thead>
          <tbody>
            {!data && !error && <tr><td colSpan={5}><span className="sk sk-cell" style={{ width: "60%" }} /></td></tr>}
            {data?.rows.map((r) => (
              <tr key={r.period} style={r.period === now ? { background: "rgba(37,99,235,.06)" } : undefined}>
                <td>{r.label}</td>
                <td className="ta-right mono">{n2(r.amount)}</td>
                <td className="ta-right mono">{n2(r.accumulated)}</td>
                <td className="ta-right mono strong">{n2(r.book_value)}</td>
                <td>{r.posted ? <Badge tone="green">{r.jv_no}</Badge> : r.period <= now && r.amount > 0 ? <Badge tone="orange">Not posted</Badge> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ---------- Post Depreciation for a month ---------- */
function PostModal({ onClose, onPosted }) {
  const [period, setPeriod] = useState(thisMonth());
  const [date, setDate] = useState(lastDayOf(thisMonth()));
  const [run, setRun] = useState(null);
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!period) return;
    setRun(null);
    setError("");
    setDate(lastDayOf(period));
    apiFetch(`${API}/depreciation/preview?period=${period}`).then(setRun).catch((e) => setError(e.message || "Couldn't load."));
  }, [period]);

  const submit = async () => {
    setPosting(true);
    setError("");
    try {
      const res = await apiFetch(`${API}/depreciation/post`, { method: "POST", body: JSON.stringify({ period, transaction_date: date }) });
      onPosted(res.message);
    } catch (e) {
      setError(e.message || "Couldn't post.");
      setPosting(false);
    }
  };

  const dr = (run?.lines || []).reduce((n, l) => n + l.debit, 0);
  const cr = (run?.lines || []).reduce((n, l) => n + l.credit, 0);

  return (
    <Modal
      title="Post Depreciation"
      onClose={() => !posting && onClose()}
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={posting}>Close</button>
          <button className="btn btn-primary" onClick={submit} disabled={posting || !run?.items.length}>
            {posting ? "Posting…" : `Post ${n2(run?.total || 0)}`}
          </button>
        </>
      }
    >
      <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Month"><input type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
        <Field label="Journal date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {error && <div className="alert-error" role="alert">{error}</div>}
      {!run && !error && <span className="sk" style={{ display: "block", height: 120, borderRadius: 10 }} />}
      {run && (
        <>
          {run.already_posted > 0 && <p className="muted small">{run.already_posted} asset(s) were already posted for {fmtMonth(period)} and are skipped.</p>}
          {run.items.length === 0 ? (
            <div className="card" style={{ padding: 20, textAlign: "center" }}>Nothing to post for {fmtMonth(period)}.</div>
          ) : (
            <>
              <h4 style={{ margin: "10px 0 6px" }}>Assets ({run.items.length})</h4>
              <div className="table-scroll" style={{ maxHeight: 220 }}>
                <table className="table">
                  <thead><tr><th>Asset No</th><th>Asset</th><th className="ta-right">Amount</th></tr></thead>
                  <tbody>
                    {run.items.map((it) => (
                      <tr key={it.asset_id}><td className="mono">{it.asset_no}</td><td>{it.name}</td><td className="ta-right mono">{n2(it.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4 style={{ margin: "14px 0 6px" }}>General Journal entry · {run.jv_no}</h4>
              <table className="table journal-table">
                <thead><tr><th>Account</th><th className="ta-right">Debit</th><th className="ta-right">Credit</th></tr></thead>
                <tbody>
                  {run.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.account_code} - {l.account_name}</td>
                      <td className="ta-right mono">{l.debit ? n2(l.debit) : ""}</td>
                      <td className="ta-right mono">{l.credit ? n2(l.credit) : ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td /><td className="ta-right mono strong">{n2(dr)}</td><td className="ta-right mono strong">{n2(cr)}</td></tr></tfoot>
              </table>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

/* ---------- Dispose ---------- */
function DisposeModal({ initial, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`${API}/${f.id}/dispose`, {
        method: "POST",
        body: JSON.stringify({ disposed_date: f.disposed_date, disposal_amount: Number(f.disposal_amount) || 0, remarks: f.remarks || null }),
      });
      onSaved(res.message);
    } catch (e) {
      setError(e.message || "Couldn't save.");
      setSaving(false);
    }
  };
  return (
    <Modal
      title={`Dispose · ${f.name}`}
      onClose={onClose}
      size="sm"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Dispose"}</button></>}
    >
      {error && <div className="alert-error" role="alert">{error}</div>}
      <p className="muted small" style={{ marginTop: 0 }}>No more depreciation after the disposal month.</p>
      <Field label="Disposal date"><input type="date" className="input" value={f.disposed_date} onChange={(e) => setF({ ...f, disposed_date: e.target.value })} /></Field>
      <Field label="Proceeds (if sold)"><input className="input ta-right" inputMode="decimal" value={f.disposal_amount} onChange={(e) => setF({ ...f, disposal_amount: cleanNum(e.target.value) })} /></Field>
      <Field label="Remarks"><input className="input" value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
    </Modal>
  );
}
