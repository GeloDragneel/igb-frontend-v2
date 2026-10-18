// Setup → Store / Warehouse (old Store_Warehouse.php): Code · Store / Warehouse · Type
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Badge from "../../components/Badge";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";

const API = "/store-warehouse";
const ROUTE = "/setup/store-warehouse";
const TABLE_HEIGHT = "calc(100vh - 330px)";
const EMPTY = { id: null, type: "", code: "", description: "" };

export default function StoreWarehouse() {
  const { user } = useAuth();
  const notify = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setRows(await apiFetch(`${API}${showInactive ? "?inactive=1" : ""}`)); }
    catch (e) { setError(e.message || "Couldn't load stores / warehouses."); setRows([]); }
    finally { setLoading(false); }
  }, [showInactive]);
  useEffect(() => { load(); }, [load, user?.id, user?.caid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.code || ""} ${r.description} ${r.type || ""}`.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const open = (r) => { setFormError(""); setForm(r ? { ...EMPTY, ...r, code: r.code || "", type: r.type || "" } : { ...EMPTY }); };

  const save = async () => {
    if (!form.type) return setFormError("Type is required.");
    if (!form.description.trim()) return setFormError("Description is required.");
    setSaving(true);
    setFormError("");
    try {
      const res = await apiFetch(form.id ? `${API}/${form.id}` : API, {
        method: form.id ? "PUT" : "POST",
        body: JSON.stringify({ type: form.type, code: form.code.trim() || null, description: form.description.trim() }),
      });
      notify(res.message || "Store / Warehouse successfully saved");
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
      notify(res.message || "Store / Warehouse successfully deleted");
      setForm(null);
      load();
    } catch (e) {
      notify(e.message || "Couldn't delete.", "error");
    }
  };

  const restore = async (r) => {
    try { const res = await apiFetch(`${API}/${r.id}/restore`, { method: "POST" }); notify(res.message); load(); }
    catch (e) { notify(e.message || "Couldn't restore.", "error"); }
  };

  const columns = [
    { key: "code", label: "Code", render: (r) => (r.code ? <span className="mono">{r.code}</span> : <span className="muted">—</span>) },
    { key: "description", label: "Store / Warehouse", render: (r) => <span className="strong">{r.description}</span> },
    { key: "type", label: "Type", render: (r) => (r.type ? <Badge tone={r.type === "Store" ? "blue" : "orange"}>{r.type}</Badge> : <span className="muted">—</span>) },
    ...(showInactive ? [{ key: "is_active", label: "Status", render: (r) => <Badge tone={r.is_active ? "green" : "gray"}>{r.is_active ? "Active" : "Deleted"}</Badge> }] : []),
  ];

  return (
    <>
      <SearchCard
        query={query}
        setQuery={setQuery}
        placeholder="Search code, name or type..."
        actions={[
          { label: showInactive ? "Hide deleted" : "Show deleted", icon: "filter", onClick: () => setShowInactive((v) => !v) },
          { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
          { label: "Add New", icon: "plus", variant: "primary", onClick: () => open(null) },
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
          exportName="store-warehouse"
          emptyText={loading ? "Loading…" : "No stores or warehouses yet. Click Add New."}
          onRowClick={(r) => (r.is_active ? open(r) : null)}
          rowActions={(r) => (r.is_active
            ? [{ label: "Edit", onClick: () => open(r) }, { label: "Delete", onClick: () => setToDelete(r) }]
            : [{ label: "Restore", onClick: () => restore(r) }])}
        />
      </div>

      {form && (
        <Modal
          title={form.id ? "Edit Store / Warehouse" : "Add Store / Warehouse"}
          onClose={() => !saving && setForm(null)}
          size="sm"
          footer={
            <>
              {form.id && <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => setToDelete(form)} disabled={saving}>Delete</button>}
              <button className="btn" onClick={() => setForm(null)} disabled={saving}>Close</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : form.id ? "Update" : "Add"}</button>
            </>
          }
        >
          {formError && <div className="alert-error" role="alert">{formError}</div>}
          <Field label="Type *">
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} autoFocus>
              <option value="">—</option>
              <option value="Store">Store</option>
              <option value="Warehouse">Warehouse</option>
            </select>
          </Field>
          <Field label="Code">
            <input className="input mono" value={form.code} maxLength={30} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </Field>
          <Field label="Description *">
            <input className="input" value={form.description} maxLength={150} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </Modal>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.description}?`}
          message="It will be hidden from lists. Old receipts and transfers keep it. You can restore it from Show deleted."
          confirmLabel="Delete"
          onCancel={() => setToDelete(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
