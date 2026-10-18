// Setup → Discount List (old Discount_List.php): Description · Value (%)
import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";

const API = "/discount-list";
const ROUTE = "/setup/discount-list";
const TABLE_HEIGHT = "calc(100vh - 330px)";
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const pct = (v) => `${Number(v || 0).toLocaleString("en-PH", { maximumFractionDigits: 4 })} %`;

export default function DiscountList() {
  const { user } = useAuth();
  const notify = useToast();
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
    try { setRows(await apiFetch(API)); }
    catch (e) { setError(e.message || "Couldn't load discounts."); setRows([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, user?.id, user?.caid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.description} ${r.value}`.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const open = (r) => { setFormError(""); setForm(r ? { id: r.id, description: r.description, value: String(r.value) } : { id: null, description: "", value: "" }); };

  const save = async () => {
    if (!form.description.trim()) return setFormError("Description is required.");
    if (Number(form.value) > 100) return setFormError("Value is a percent (0–100).");
    setSaving(true);
    setFormError("");
    try {
      const res = await apiFetch(form.id ? `${API}/${form.id}` : API, {
        method: form.id ? "PUT" : "POST",
        body: JSON.stringify({ description: form.description.trim(), value: Number(form.value) || 0 }),
      });
      notify(res.message || "Discount successfully saved");
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
      notify(res.message || "Discount successfully deleted");
      setForm(null);
      load();
    } catch (e) {
      notify(e.message || "Couldn't delete.", "error");
    }
  };

  const columns = [
    { key: "description", label: "Description", render: (r) => <span className="strong">{r.description}</span> },
    { key: "value", label: "Value", align: "right", value: (r) => Number(r.value), render: (r) => <span className="mono">{pct(r.value)}</span> },
    { key: "used", label: "Used in invoices", align: "right", value: (r) => r.used },
  ];

  return (
    <>
      <SearchCard
        query={query}
        setQuery={setQuery}
        placeholder="Search discount..."
        actions={[
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
          exportName="discount-list"
          emptyText={loading ? "Loading…" : "No discounts yet. Click Add New."}
          onRowClick={open}
          rowActions={(r) => [{ label: "Edit", onClick: () => open(r) }, { label: "Delete", onClick: () => setToDelete(r) }]}
        />
      </div>

      {form && (
        <Modal
          title={form.id ? "Edit Discount" : "Add Discount"}
          onClose={() => !saving && setForm(null)}
          size="sm"
          footer={
            <>
              {form.id && <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => setToDelete(rows.find((r) => r.id === form.id))} disabled={saving}>Delete</button>}
              <button className="btn" onClick={() => setForm(null)} disabled={saving}>Close</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : form.id ? "Update" : "Add"}</button>
            </>
          }
        >
          {formError && <div className="alert-error" role="alert">{formError}</div>}
          <Field label="Description *">
            <input className="input" value={form.description} maxLength={150} autoFocus onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Value (%)">
            <input className="input ta-right" inputMode="decimal" placeholder="e.g. 20" value={form.value} onChange={(e) => setForm({ ...form, value: cleanNum(e.target.value) })} />
          </Field>
        </Modal>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.description}?`}
          message={toDelete.used ? `This discount is used in ${toDelete.used} invoice(s), so it can't be deleted.` : "You can't undo this."}
          confirmLabel="Delete"
          onCancel={() => setToDelete(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
