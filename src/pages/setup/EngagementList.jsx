// Shared list for Setup → Import Engagement (sellers) and Export Engagement (buyers)
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";

const TABLE_HEIGHT = "calc(100vh - 330px)";
const EMPTY = { id: null, name: "", address: "", tin: "" };

// 000-000-000-00000 while typing
const fmtTin = (v) => {
  const d = String(v || "").replace(/\D/g, "").slice(0, 14);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)].filter(Boolean).join("-");
};

/**
 * type   "import" | "export"
 * label  "Seller" | "Buyer"
 * title  tab label
 * usedIn "importation" | "exportation"
 */
export default function EngagementList({ type, label, title, usedIn }) {
  const { user } = useAuth();
  const notify = useToast();
  const API = `/engagements/${type}`;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await apiFetch(API));
    } catch (e) {
      setError(e.message || `Couldn't load ${label.toLowerCase()}s.`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [API, label]);

  useEffect(() => { load(); }, [load, user?.id, user?.caid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.address, r.tin].join(" ").toLowerCase().includes(q));
  }, [rows, query]);

  const open = (r) => { setFormError(""); setForm(r ? { ...EMPTY, ...r, address: r.address || "", tin: r.tin || "" } : { ...EMPTY }); };

  const save = async () => {
    if (!form.name.trim()) return setFormError(`${label} name is required.`);
    setSaving(true);
    setFormError("");
    try {
      const res = await apiFetch(form.id ? `${API}/${form.id}` : API, {
        method: form.id ? "PUT" : "POST",
        body: JSON.stringify({ name: form.name.trim(), address: form.address || null, tin: form.tin || null }),
      });
      notify(res.message || `${label} saved`);
      setForm(null);
      load();
    } catch (e) {
      setFormError(e.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const r = toDelete;
    setToDelete(null);
    try {
      const res = await apiFetch(`${API}/${r.id}`, { method: "DELETE" });
      notify(res.message || `${label} deleted`);
      load();
    } catch (e) {
      notify(e.message || "Couldn't delete.", "error");
    }
  };

  const columns = [
    { key: "name", label: `${label} Name`, render: (r) => <span className="strong">{r.name}</span> },
    { key: "address", label: "Address", render: (r) => r.address || <span className="muted">—</span> },
    { key: "tin", label: "TIN", render: (r) => (r.tin ? <span className="mono">{r.tin}</span> : <span className="muted">—</span>) },
    { key: "used", label: `Used in ${usedIn}s`, align: "right", value: (r) => r.used },
  ];

  return (
    <>
      <SearchCard
        query={query}
        setQuery={setQuery}
        placeholder={`Search ${label.toLowerCase()} name, address or TIN...`}
        actions={[
          { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
          { label: `Add ${label}`, icon: "plus", variant: "primary", onClick: () => open(null) },
        ]}
        sticky
      />

      {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}

      <div className="sales-table">
        <DataTable
          bodyHeight={TABLE_HEIGHT}
          columns={columns}
          rows={loading ? [] : filtered}
          rowKey="id"
          exportName={`${type}-engagement`}
          emptyText={loading ? "Loading…" : `No ${label.toLowerCase()}s yet. Click Add ${label}.`}
          onRowClick={open}
          rowActions={(r) => [
            { label: "Edit", onClick: () => open(r) },
            { label: "Delete", onClick: () => setToDelete(r) },
          ]}
        />
      </div>

      {form && (
        <Modal
          title={form.id ? `Edit ${label}` : `Add ${label}`}
          onClose={() => !saving && setForm(null)}
          size="sm"
          footer={
            <>
              <button className="btn" onClick={() => setForm(null)} disabled={saving}>Close</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </>
          }
        >
          {formError && <div className="alert-error" role="alert">{formError}</div>}
          <Field label={`${label} name *`}>
            <input className="input" value={form.name} maxLength={150} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Address">
            <input className="input" value={form.address} maxLength={255} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="TIN">
            <input className="input mono" value={form.tin} placeholder="000-000-000-00000" inputMode="numeric"
              onChange={(e) => setForm({ ...form, tin: fmtTin(e.target.value) })} />
          </Field>
        </Modal>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.name}?`}
          message={toDelete.used ? `This ${label.toLowerCase()} is used in ${toDelete.used} ${usedIn}(s), so it can't be deleted.` : "You can't undo this."}
          confirmLabel="Delete"
          onCancel={() => setToDelete(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
