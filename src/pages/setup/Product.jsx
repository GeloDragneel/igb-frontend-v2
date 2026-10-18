import { useCallback, useEffect, useMemo, useState } from "react";
import SearchCard from "../../components/SearchCard";
import DataTable from "../../components/DataTable";
import TableSkeleton from "../../components/TableSkeleton";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import SearchSelect from "../../components/SearchSelect";
import Icon from "../../components/Icons";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch, apiBlob, apiForm } from "../../context/AuthContext";
import { useLookups } from "../../context/LookupsContext";
import { usePeriod } from "../../context/PeriodContext";

const TABLE_HEIGHT = "calc(100vh - 330px)";
const num = (n, d = 2) => (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: d, maximumFractionDigits: d });
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDateTime = (v) => {
  if (!v) return "—";
  const [d, t = "00:00"] = String(v).split(" ");
  const [y, m, day] = d.split("-").map(Number);
  let [h, min] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${MONTHS[m - 1]} ${String(day).padStart(2, "0")} ${y} ${h}:${String(min).padStart(2, "0")}${ap}`;
};

/* =========================================================
   Setup → Products
   ========================================================= */
export default function Products() {
  const { user } = useAuth();
  const { lookups, refresh: refreshLookups } = useLookups();
  const notify = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [opts, setOpts] = useState({ item_classes: [], tax_types: [], unit_types: [] });
  const [form, setForm] = useState(null);       // null | {} | row
  const [confirm, setConfirm] = useState(null); // row to delete
  const [history, setHistory] = useState(null); // row for price history
  const [showBeg, setShowBeg] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await apiFetch("/products"));
    } catch (e) {
      setError(e.message || "Couldn't load products.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, user?.id, user?.caid]);
  useEffect(() => { apiFetch("/products-lookups").then(setOpts).catch(() => { }); }, [user?.id, user?.caid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.item_code, r.description, r.item_class, r.tax_type, r.upc_sku].join(" ").toLowerCase().includes(q));
  }, [rows, query]);

  const doDelete = async () => {
    try {
      const res = await apiFetch(`/products/${confirm.id}`, { method: "DELETE" });
      notify(res.message);
      load();
      refreshLookups?.();
    } catch (e) {
      notify(e.message || "Couldn't delete the product.", "error");
    } finally {
      setConfirm(null);
    }
  };

  const columns = [
    { key: "item_code", label: "Item ID", render: (r) => <span className="mono strong">{r.item_code}</span> },
    { key: "description", label: "Description", render: (r) => <span className="cell-trunc" style={{ maxWidth: 320 }} title={r.description}>{r.description}</span> },
    { key: "item_class", label: "Item Class", render: (r) => r.item_class || "—" },
    { key: "price", label: "Price", align: "right", value: (r) => r.price, render: (r) => <span className="mono">{num(r.price, 4)}</span> },
    { key: "last_unit_cost", label: "Last Unit Cost", align: "right", value: (r) => r.last_unit_cost, render: (r) => <span className="mono">{num(r.last_unit_cost, 4)}</span> },
    { key: "tax_type", label: "Tax Type", render: (r) => r.tax_type || "—" },
  ];

  const actions = [
    { label: "Beginning Balances", icon: "calendar", onClick: () => setShowBeg(true) },
    { label: loading ? "Loading…" : "Refresh", icon: "refresh", onClick: load, disabled: loading },
    { label: "Add New Product", icon: "plus", variant: "primary", onClick: () => setForm({}) },
  ];

  return (
    <>
      <SearchCard query={query} setQuery={setQuery} placeholder="Search item ID, description or class..." actions={actions} sticky />

      {error && (
        <div className="alert-error" role="alert">
          {error} <button className="btn btn-sm" onClick={load}>Try again</button>
        </div>
      )}

      {loading ? (
        <TableSkeleton columns={columns} bodyHeight={TABLE_HEIGHT} label="Loading products" />
      ) : (
        <div className="sales-table">
          <DataTable
            bodyHeight={TABLE_HEIGHT}
            columns={columns}
            rows={filtered}
            rowKey="id"
            exportName="products"
            showToolbar={false}
            emptyText="No products yet."
            onRowClick={(r) => setForm(r)}
            rowActions={(r) => [
              { label: "Edit", onClick: () => setForm(r) },
              { label: "Price History", onClick: () => setHistory(r) },
              { label: "Delete", onClick: () => setConfirm(r) },
            ]}
          />
        </div>
      )}

      {form && (
        <ProductForm
          record={form.id ? form : null}
          opts={opts}
          accounts={lookups?.accounts || []}
          onClose={() => setForm(null)}
          onSaved={(res) => {
            notify(res.message);
            if (res.image_error) notify(res.image_error, "error");
            setForm(null);
            load();
            refreshLookups?.(); // invoice item dropdowns pick up the change
          }}
        />
      )}

      {history && <PriceHistoryModal product={history} onClose={() => setHistory(null)} />}
      {showBeg && <BegBalanceModal onClose={() => setShowBeg(false)} />}

      {confirm && (
        <ConfirmDialog
          title={`Delete ${confirm.item_code}?`}
          message="You can't undo this."
          confirmLabel="Delete"
          onCancel={() => setConfirm(null)}
          onConfirm={doDelete}
        />
      )}
    </>
  );
}

/* =========================================================
   Add / Update Product popup
   ========================================================= */
let unitKey = 0;
const newUnit = () => ({ key: `n${unitKey++}`, id: null, unit_type_id: "", value: "", price: "", cost: "" });

export function ProductForm({ record, opts: optsProp, accounts, defaultName = "", onClose, onSaved }) {
  // dropdowns: passed in (Products page) or loaded here (invoice page)
  const [opts, setOpts] = useState(optsProp || { item_classes: [], tax_types: [], unit_types: [] });
  useEffect(() => {
    if (optsProp) {
      setOpts(optsProp);
      return;
    }
    apiFetch("/products-lookups").then(setOpts).catch(() => { });
  }, [optsProp]);

  const [f, setF] = useState(() => ({
    item_code: record?.item_code || "",
    description: record?.description || defaultName || "",
    upc_sku: record?.upc_sku || "",
    item_class_id: record?.item_class_id ? String(record.item_class_id) : "",
    tax_type_id: record?.tax_type_id ? String(record.tax_type_id) : "",
    equivalent_conversion: record?.equivalent_conversion ?? "",
    gl_sales_account: record?.gl_sales_account || "",
    gl_inventory_account: record?.gl_inventory_account || "",
    gl_cost_of_sales_account: record?.gl_cost_of_sales_account || "",
    input_vat_account: record?.input_vat_account || "",
    output_vat_account: record?.output_vat_account || "",
    minimum_stock: record?.minimum_stock ?? 0,
    reorder_quantity: record?.reorder_quantity ?? 0,
  }));
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(!!record);
  const [image, setImage] = useState(null);     // new File
  const [preview, setPreview] = useState("");   // object URL
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  // existing units + image
  useEffect(() => {
    if (!record) return;
    apiFetch(`/products/${record.id}/units`)
      .then((list) =>
        setUnits(list.map((u) => ({
          key: `o${u.id}`,
          id: u.id,
          unit_type_id: u.unit_type_id ? String(u.unit_type_id) : "",
          value: u.description ?? "",
          price: u.price ?? "",
          cost: u.cost ?? "",
        })))
      )
      .catch(() => { })
      .finally(() => setUnitsLoading(false));

    let url = "";
    apiBlob(`/products/${record.id}/image`)
      .then((blob) => {
        if (blob.type.startsWith("image/")) {
          url = URL.createObjectURL(blob);
          setPreview(url);
        }
      })
      .catch(() => { });
    return () => url && URL.revokeObjectURL(url);
  }, [record]);

  const pickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setSaveError("Choose an image file.");
    if (file.size > 5 * 1024 * 1024) return setSaveError("Image is too big (max 5 MB).");
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const setUnit = (key, k, v) => setUnits((list) => list.map((u) => (u.key === key ? { ...u, [k]: v } : u)));
  const removeUnit = (key) => setUnits((list) => list.filter((u) => u.key !== key));

  // posting accounts only (old: Root_Name != 0), filtered by first digit
  const acctOpts = (prefix) => [
    { value: "", label: "— None —" },
    ...accounts
      .filter((a) => String(a.account_code).startsWith(prefix) && a.root_name && String(a.root_name) !== "0")
      .map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` })),
  ];

  const submit = async () => {
    const e = {};
    if (!f.item_code.trim()) e.item_code = "Item ID is required";
    if (!f.description.trim()) e.description = "Description is required";
    if (!f.item_class_id) e.item_class_id = "Item Class is required";
    if (units.some((u) => !u.unit_type_id)) e.units = "Choose a unit for every unit row.";
    setErrors(e);
    if (Object.keys(e).length) return;

    const data = {
      ...f,
      item_code: f.item_code.trim(),
      description: f.description.trim(),
      upc_sku: f.upc_sku.trim() || null,
      item_class_id: Number(f.item_class_id),
      tax_type_id: f.tax_type_id ? Number(f.tax_type_id) : null,
      equivalent_conversion: f.equivalent_conversion === "" ? null : Number(f.equivalent_conversion),
      minimum_stock: Number(f.minimum_stock) || 0,
      reorder_quantity: Number(f.reorder_quantity) || 0,
      units: units.map((u) => ({
        id: u.id,
        unit_type_id: Number(u.unit_type_id),
        value: u.value === "" ? null : Number(u.value),
        price: Number(u.price) || 0,
        cost: Number(u.cost) || 0,
      })),
    };

    const form = new FormData();
    form.append("data", JSON.stringify(data));
    if (image) form.append("image", image);

    setSaving(true);
    setSaveError("");
    try {
      const res = await apiForm(record ? `/products/${record.id}` : "/products", form);
      const taxName = opts.tax_types.find((t) => String(t.id) === String(f.tax_type_id))?.name || "";
      onSaved(res, { ...data, tax_type: taxName });
    } catch (err) {
      setSaveError(err.message || "Couldn't save the product.");
      setSaving(false);
    }
  };

  return (
    <Modal
      title={record ? "Update Product" : "Add Product"}
      onClose={onClose}
      size="xlg"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>Close</button>
          <button className="btn btn-info" onClick={() => setUnits((l) => [...l, newUnit()])} disabled={saving}>ADD UNIT</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : record ? "UPDATE" : "SAVE"}</button>
        </>
      }
    >
      {saveError && <div className="alert-error" role="alert">{saveError}</div>}

      <div className="prod-form">
        {/* ---------- left ---------- */}
        <div className="prod-left">
          <fieldset className="prod-box">
            <legend>Product Information</legend>
            <div className="prod-info">
              <div className="prod-img">
                <div className="prod-img-view">
                  {preview ? <img src={preview} alt="Product" /> : <Icon name="fileText" size={40} />}
                </div>
                <label className="btn btn-info btn-sm prod-img-btn">
                  Upload Image
                  <input type="file" accept="image/*" hidden onChange={pickImage} />
                </label>
              </div>

              <div className="prod-fields">
                <Field label="Item ID" error={errors.item_code}>
                  <input className="input" value={f.item_code} onChange={(e) => set("item_code", e.target.value)} autoFocus />
                </Field>
                <Field label="Description" error={errors.description}>
                  <input className="input" value={f.description} onChange={(e) => set("description", e.target.value)} />
                </Field>
                <div className="">
                  <Field label="UPC">
                    <input className="input" value={f.upc_sku} onChange={(e) => set("upc_sku", e.target.value)} />
                  </Field>
                  <div className="field">
                    <span className="field-label">Item Class</span>
                    <SearchSelect
                      value={f.item_class_id}
                      onChange={(v) => set("item_class_id", v)}
                      options={[{ value: "", label: "— Select —" }, ...opts.item_classes.map((c) => ({ value: String(c.id), label: c.name }))]}
                      aria-label="Item Class"
                    />
                    {errors.item_class_id && <div className="field-error">{errors.item_class_id}</div>}
                  </div>
                  <div className="field">
                    <span className="field-label">Tax Type</span>
                    <SearchSelect
                      value={f.tax_type_id}
                      onChange={(v) => set("tax_type_id", v)}
                      options={[{ value: "", label: "— None —" }, ...opts.tax_types.map((t) => ({ value: String(t.id), label: t.name }))]}
                      aria-label="Tax Type"
                    />
                  </div>
                  <Field label="Equivalent Conversion">
                    <input className="input ta-right" inputMode="decimal" value={f.equivalent_conversion} onChange={(e) => set("equivalent_conversion", cleanNum(e.target.value))} />
                  </Field>
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="prod-box">
            <legend>Unit List</legend>
            {errors.units && <div className="field-error" style={{ marginBottom: 8 }}>{errors.units}</div>}
            <table className="prod-units">
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>Unit</th>
                  <th style={{ width: "18%" }} className="ta-right">Value</th>
                  <th style={{ width: "22%" }} className="ta-right">Price</th>
                  <th style={{ width: "22%" }} className="ta-right">Cost</th>
                  <th style={{ width: "8%" }} />
                </tr>
              </thead>
              <tbody>
                {unitsLoading && (
                  <tr><td colSpan={5}><span className="sk sk-cell" style={{ width: "100%" }} /></td></tr>
                )}
                {!unitsLoading && units.length === 0 && (
                  <tr><td colSpan={5} className="muted ta-center">No units. Click <strong>ADD UNIT</strong>.</td></tr>
                )}
                {units.map((u) => (
                  <tr key={u.key}>
                    <td>
                      <SearchSelect
                        value={u.unit_type_id}
                        onChange={(v) => setUnit(u.key, "unit_type_id", v)}
                        options={[{ value: "", label: "— Select —" }, ...opts.unit_types.map((t) => ({ value: String(t.id), label: t.name }))]}
                        aria-label="Unit"
                      />
                    </td>
                    <td><input className="input ta-right" inputMode="decimal" value={u.value} onChange={(e) => setUnit(u.key, "value", cleanNum(e.target.value))} aria-label="Value" /></td>
                    <td><input className="input ta-right" inputMode="decimal" value={u.price} onChange={(e) => setUnit(u.key, "price", cleanNum(e.target.value))} aria-label="Price" /></td>
                    <td><input className="input ta-right" inputMode="decimal" value={u.cost} onChange={(e) => setUnit(u.key, "cost", cleanNum(e.target.value))} aria-label="Cost" /></td>
                    <td className="ta-center">
                      <button type="button" className="inv-icon danger" onClick={() => removeUnit(u.key)} aria-label="Remove unit">
                        <Icon name="x" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="field-hint" style={{ marginTop: 8 }}>The first unit is the default unit and price on invoices.</p>
          </fieldset>
        </div>

        {/* ---------- right ---------- */}
        <div className="prod-right">
          <fieldset className="prod-box">
            <legend>Accounting Settings</legend>
            {[
              ["gl_sales_account", "GL Sales Acct.", "4"],
              ["gl_inventory_account", "GL Inventory Acct.", "1"],
              ["gl_cost_of_sales_account", "GL Cost of Sales Acct.", "5"],
              ["input_vat_account", "Input VAT Acct.", "1"],
              ["output_vat_account", "Output VAT Acct.", "2"],
            ].map(([key, label, prefix]) => (
              <div className="field" key={key}>
                <span className="field-label">{label}</span>
                <SearchSelect value={f[key]} onChange={(v) => set(key, v)} options={acctOpts(prefix)} searchPlaceholder="Search account..." aria-label={label} />
              </div>
            ))}
          </fieldset>

          <fieldset className="prod-box">
            <legend>Inventory Settings</legend>
            <div className="">
              <Field label="Minimum Stock">
                <input className="input ta-right" inputMode="decimal" value={f.minimum_stock} onChange={(e) => set("minimum_stock", cleanNum(e.target.value))} />
              </Field>
              <Field label="Reorder Quantity">
                <input className="input ta-right" inputMode="decimal" value={f.reorder_quantity} onChange={(e) => set("reorder_quantity", cleanNum(e.target.value))} />
              </Field>
            </div>
          </fieldset>
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================
   Price History
   ========================================================= */
function PriceHistoryModal({ product, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/products/${product.id}/price-history`)
      .then(setRows)
      .catch((e) => setError(e.message || "Couldn't load the price history."));
  }, [product.id]);

  return (
    <Modal title={`Price History · ${product.item_code}`} onClose={onClose} size="sm" footer={<button className="btn" onClick={onClose}>Close</button>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <table className="table">
        <thead>
          <tr>
            <th>Date Added</th>
            <th className="ta-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {!rows && !error && Array.from({ length: 3 }).map((_, i) => (
            <tr key={i}><td colSpan={2}><span className="sk sk-cell" style={{ width: "100%" }} /></td></tr>
          ))}
          {rows && rows.length === 0 && <tr><td colSpan={2} className="empty">No price changes yet.</td></tr>}
          {rows?.map((r, i) => (
            <tr key={i}>
              <td>{fmtDateTime(r.date)}</td>
              <td className="ta-right mono">{num(r.price, 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

/* =========================================================
   Inventory Beginning Balances
   ========================================================= */
function BegBalanceModal({ onClose }) {
  const { from, to } = usePeriod();
  const notify = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [sel, setSel] = useState(null); // { item_id, item_code, description, quantity, unit_cost }
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiFetch(`/products/beginning?from=${from}&to=${to}`)
      .then(setRows)
      .catch((e) => setError(e.message || "Couldn't load beginning balances."));
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const total = sel ? (Number(sel.quantity) || 0) * (Number(sel.unit_cost) || 0) : 0;

  const save = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      const res = await apiFetch("/products/beginning", {
        method: "POST",
        body: JSON.stringify({ item_id: sel.item_id, quantity: Number(sel.quantity) || 0, unit_cost: Number(sel.unit_cost) || 0, from, to }),
      });
      notify(res.message);
      load();
    } catch (e) {
      notify(e.message || "Couldn't save.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Inventory Beginning Balances"
      onClose={onClose}
      size="xlg"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>Close</button>
          <button className="btn btn-primary" onClick={save} disabled={!sel || saving}>{saving ? "Saving…" : "SAVE"}</button>
        </>
      }
    >
      {error && <div className="alert-error" role="alert">{error}</div>}

      <div className="beg-edit">
        <Field label="Item ID"><input className="input" readOnly value={sel?.item_code || ""} placeholder="Click a product below" /></Field>
        <Field label="Description"><input className="input" readOnly value={sel?.description || ""} /></Field>
        <Field label="Quantity">
          <input className="input ta-right" inputMode="decimal" disabled={!sel} value={sel?.quantity ?? ""} onChange={(e) => setSel((s) => ({ ...s, quantity: cleanNum(e.target.value) }))} />
        </Field>
        <Field label="Unit Cost">
          <input className="input ta-right" inputMode="decimal" disabled={!sel} value={sel?.unit_cost ?? ""} onChange={(e) => setSel((s) => ({ ...s, unit_cost: cleanNum(e.target.value) }))} />
        </Field>
        <Field label="Total Cost"><input className="input ta-right" readOnly value={sel ? num(total, 4) : ""} /></Field>
      </div>

      <div className="table-scroll beg-list">
        <table className="table">
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Description</th>
              <th className="ta-right">Quantity</th>
              <th className="ta-right">Unit Cost</th>
              <th className="ta-right">Total Cost</th>
            </tr>
          </thead>
          <tbody>
            {!rows && !error && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}><td colSpan={5}><span className="sk sk-cell" style={{ width: "100%" }} /></td></tr>
            ))}
            {rows && rows.length === 0 && <tr><td colSpan={5} className="empty">No products.</td></tr>}
            {rows?.map((r) => (
              <tr
                key={r.item_id}
                className={`beg-row ${sel?.item_id === r.item_id ? "is-selected" : ""}`}
                onClick={() => setSel({ ...r })}
              >
                <td className="mono">{r.item_code}</td>
                <td>{r.description}</td>
                <td className="ta-right mono">{num(r.quantity, 2)}</td>
                <td className="ta-right mono">{num(r.unit_cost, 4)}</td>
                <td className="ta-right mono">{num(r.total_cost, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}