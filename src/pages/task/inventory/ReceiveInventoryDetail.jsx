// Task → Inventory → Receive Inventory form (old modal_ReceiveInventory; same layout as SalesDetail.jsx)
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../../components/Toast";
import Icon from "../../../components/Icons";
import Modal, { Field } from "../../../components/Modal";
import ConfirmDialog from "../../../components/ConfirmDialog";
import SearchSelect from "../../../components/SearchSelect";
import { apiFetch, apiBlob, apiUpload, useAuth } from "../../../context/AuthContext";
import { INVENTORY_PATH, RECEIVE_DETAIL_PATH } from "./inventoryMeta";

const today = () => new Date().toISOString().slice(0, 10);
// Task → Inventory → Receive Inventory form (old modal_ReceiveInventory; same layout as SalesDetail.jsx)

const API = "/inventory/receive";
const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const num4 = (n) => (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const atcRate = (a) => { const r = Number(a?.rate) || 0; return r > 1 ? r / 100 : r; };

const VAT_OPTS = [
  { value: "vatable", label: "VATable" },
  { value: "exempt", label: "VAT Exempt" },
  { value: "nonvat", label: "Non VAT" },
  { value: "zero", label: "Zero Rated" },
];

function lineCalc(l) {
  const total = r4((Number(l.qty) || 0) * (Number(l.price) || 0));
  const amount = r4(total - r4(l.discount));
  const out = { total, inputVat: 0, netOfVat: 0, vatExempt: 0, nonVat: 0, zeroRated: 0 };
  if (l.vatType === "exempt") out.vatExempt = amount;
  else if (l.vatType === "zero") out.zeroRated = amount;
  else if (l.vatType === "nonvat") out.nonVat = amount;
  else { out.inputVat = r4((amount / 1.12) * 0.12); out.netOfVat = r4(amount - out.inputVat); }
  return out;
}

// old CalculateNumber() at the bottom of the page
function totals(f, atc) {
  const c = f.lines.map(lineCalc);
  const s = (k) => r4(c.reduce((n, x) => n + x[k], 0));
  const discount = r4(f.lines.reduce((n, l) => n + (Number(l.discount) || 0), 0));
  const subTotal = r4(s("netOfVat") + s("vatExempt") + s("nonVat") + s("zeroRated"));
  const vt = r4(subTotal * atcRate(atc.find((a) => String(a.id) === String(f.atcVtId))));
  const it = r4(subTotal * atcRate(atc.find((a) => String(a.id) === String(f.atcItId))));
  const gross = r4(c.reduce((n, x) => n + x.total, 0));
  return { calcs: c, inputVat: s("inputVat"), subTotal, vt, it, discount, total: r4(subTotal - (vt + it + discount)), grandTotal: r4(gross - discount - (vt + it)) };
}

/* ---------- lists ---------- */
const cache = {};
function useLookups() {
  const { user } = useAuth();
  const key = user ? `${user.type}-${user.id}-${user.caid ?? 0}` : null;
  const [lk, setLk] = useState(() => (key && cache[key]) || null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!key) return;
    try { const d = await apiFetch(`${API}/lookups`); cache[key] = d; setLk(d); } catch (e) { setError(e.message || "Couldn't load lists."); }
  }, [key]);
  useEffect(() => { if (key && !cache[key]) refresh(); }, [key, refresh]);
  const update = (fn) => setLk((prev) => { const next = fn(prev); if (key) cache[key] = next; return next; });
  return { lookups: lk, setLookups: update, error, refresh };
}

/* =========================================================
   Page
   ========================================================= */
export default function ReceiveInventoryDetail() {
  const { id } = useParams();
  const location = useLocation();
  const no = decodeURIComponent(id || "");
  const isNew = no === "new";
  const { lookups, setLookups, error: lkError, refresh } = useLookups();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (isNew) { setData(null); return; }
    let alive = true;
    setData(null);
    setError("");
    apiFetch(`${API}/record/${encodeURIComponent(no)}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.status === 404 ? "404" : e.message || "Couldn't load."));
    return () => { alive = false; };
  }, [no, isNew, reloadKey]);

  if (error === "404") {
    return (
      <div className="card not-found">
        <div className="nf-code">404</div>
        <h2>{no} not found</h2>
        <Link to={location.state?.from || INVENTORY_PATH} className="btn btn-primary">Back</Link>
      </div>
    );
  }
  if (error || (!lookups && lkError)) {
    return <div className="alert-error" role="alert">{error || lkError} <button className="btn btn-sm" onClick={() => { refresh(); setReloadKey((n) => n + 1); }}>Try again</button></div>;
  }
  const current = isNew ? null : data?.record?.grn_no === no ? data : null;
  if (!lookups || (!isNew && !current)) return <div className="inv-shell" aria-busy="true"><section className="card inv-card"><div className="inv-body"><span className="sk" style={{ display: "block", height: 320 }} /></div></section></div>;

  return <ReceiveForm key={`${no}-${reloadKey}`} lookups={lookups} setLookups={setLookups} data={current} onReload={() => setReloadKey((n) => n + 1)} />;
}

/* =========================================================
   Form
   ========================================================= */
function ReceiveForm({ lookups, setLookups, data, onReload }) {
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useToast();
  const rec = data?.record;
  const saved = !!rec;
  const backTo = location.state?.from || INVENTORY_PATH;
  const navState = { state: { from: backTo } };

  const toLine = (l) => ({
    itemId: l.item_id ? String(l.item_id) : "", itemLabel: [l.item_code, l.description].filter(Boolean).join(" · "),
    accountCode: l.account_code || "", unitTypeId: l.unit_type_id || null,
    qty: l.qty ?? 1, price: l.price ?? 0, discount: l.discount ?? 0, vatType: l.vat_type || "vatable",
    poId: l.po_id || 0, poNumber: l.po_number || null, apInvoiceNo: l.ap_invoice_no || null, left: l.po_id ? l.qty : null,
  });
  const blank = () => toLine({});

  const [f, setF] = useState(() => rec ? {
    id: rec.id, no: rec.grn_no, vendorId: String(rec.vendor_id || ""), date: String(rec.grn_date || today()).slice(0, 10),
    locationId: rec.location_id ? String(rec.location_id) : "", refData: rec.ref_data || "", declaredMonth: rec.declared_month || "",
    atcVtId: rec.atc_vt_id ? String(rec.atc_vt_id) : "", atcItId: rec.atc_it_id ? String(rec.atc_it_id) : "",
    vtMonth: rec["2307_vt_declared_month"] || "", itMonth: rec["2307_it_declared_month"] || "",
    attachment: rec.attachment || "", status: rec.status_name || "RECEIVED",
    lines: data.lines.length ? data.lines.map(toLine) : [blank()],
  } : {
    id: null, no: "", vendorId: "", date: today(), locationId: "", refData: "", declaredMonth: today().slice(0, 7),
    atcVtId: "", atcItId: "", vtMonth: "", itMonth: "", attachment: "", status: "NEW", lines: [blank()],
  });

  const [sources, setSources] = useState([]);
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [newLocation, setNewLocation] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const fileRef = useRef(null);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setLine = (i, p) => setF((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const removeLine = (i) => setF((x) => ({ ...x, lines: x.lines.length > 1 ? x.lines.filter((_, j) => j !== i) : [blank()] }));

  const isVoid = f.status === "VOID";
  const t = totals(f, lookups.atc);
  const vendor = lookups.vendors.find((v) => String(v.id) === String(f.vendorId));

  // Apply PO# list for the vendor
  useEffect(() => {
    if (!f.vendorId) { setSources([]); return; }
    apiFetch(`${API}/sources?vendor_id=${f.vendorId}`).then(setSources).catch(() => setSources([]));
  }, [f.vendorId]);

  const applySource = async (ref) => {
    set("refData", ref);
    if (!ref) return;
    try {
      const res = await apiFetch(`${API}/source/${encodeURIComponent(ref)}`);
      if (!res.lines.length) return notify("Everything on this PO has been received.", "error");
      setF((x) => ({
        ...x, refData: ref,
        atcVtId: res.header.atc_vt_id ? String(res.header.atc_vt_id) : "", atcItId: res.header.atc_it_id ? String(res.header.atc_it_id) : "",
        vtMonth: res.header.vt_month || "", itMonth: res.header.it_month || "",
        lines: res.lines.map(toLine),
      }));
    } catch (e) {
      notify(e.message || "Couldn't load the PO.", "error");
    }
  };

  /* ---------- options ---------- */
  const vendorOpts = [{ value: "", label: "— None —" }, ...lookups.vendors.map((v) => ({ value: String(v.id), label: v.name, hint: v.tin || "" }))];
  const sourceOpts = [{ value: "", label: "— None —" }, ...sources.map((s) => ({ value: s.ref, label: s.label, hint: s.ref }))];
  if (f.refData && !sources.some((s) => s.ref === f.refData)) sourceOpts.push({ value: f.refData, label: f.refData });
  const locationOpts = [{ value: "", label: "— None —" }, ...lookups.locations.map((l) => ({ value: String(l.id), label: l.description }))];
  const accountOpts = lookups.accounts.map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` }));
  const itemOpts = lookups.items.map((i) => ({ value: String(i.id), label: i.description || i.item_code, hint: i.item_code }));
  const atcOpts = [{ value: "", label: "None" }, ...lookups.atc.map((a) => ({ value: String(a.id), label: `${a.name} (${(atcRate(a) * 100).toFixed(2).replace(/\.00$/, "")}%)` }))];

  /* ---------- save ---------- */
  const validate = () => {
    const e = {};
    if (!f.vendorId) e.vendorId = "Vendor is required.";
    if (!f.locationId) e.locationId = "Location is required.";
    if (!f.date) e.date = "Date is required.";
    if (f.declaredMonth && (lookups.locked_months || []).includes(f.declaredMonth)) e.declaredMonth = "Declared Month is disabled.";
    const used = f.lines.filter((l) => l.itemId);
    if (!used.length) e.lines = "Please add item.";
    used.forEach((l, i) => {
      if (!(Number(l.qty) > 0)) e.lines = `Row ${i + 1}: Qty must be more than 0.`;
      if (l.poId && Number(l.qty) > Number(l.left ?? Infinity) + 0.0001 && !saved) e.lines = `Row ${i + 1}: only ${l.left} left to receive on the PO.`;
    });
    setErrors(e);
    return !Object.keys(e).length;
  };

  const body = () => ({
    vendor_id: Number(f.vendorId), grn_date: f.date, location_id: Number(f.locationId), ref_data: f.refData || null,
    declared_month: f.declaredMonth || null,
    atc_vt_id: f.atcVtId ? Number(f.atcVtId) : null, atc_it_id: f.atcItId ? Number(f.atcItId) : null,
    vt_month: f.atcVtId && f.vtMonth ? f.vtMonth : null, it_month: f.atcItId && f.itMonth ? f.itMonth : null,
    sub_total: t.subTotal, "2307_vt": t.vt, "2307_it": t.it, discount_amount: t.discount, total: t.total, grand_total: t.grandTotal,
    lines: f.lines.filter((l) => l.itemId).map((l) => ({
      item_id: Number(l.itemId), account_code: l.accountCode || null, unit_type_id: l.unitTypeId || null,
      qty: Number(l.qty), price: Number(l.price) || 0, discount: Number(l.discount) || 0, vat_type: l.vatType,
      po_id: l.poId || null, po_number: l.poNumber || null, ap_invoice_no: l.apInvoiceNo || null,
    })),
  });

  const save = async () => {
    setSaveError("");
    if (!validate()) return setSaveError("Please fix the highlighted fields.");
    setSaving(true);
    try {
      const res = await apiFetch(saved ? `${API}/${f.id}` : API, { method: saved ? "PUT" : "POST", body: JSON.stringify(body()) });
      if (pendingFile) {
        try { await apiUpload(`${API}/${res.id}/attachment`, pendingFile); } catch (err) { notify(`Saved, but the attachment failed: ${err.message}`, "error"); }
      }
      notify("Receive Inventory successfully saved");
      setPendingFile(null);
      if (saved) onReload();
      else navigate(`${RECEIVE_DETAIL_PATH}/${encodeURIComponent(res.no)}`, { replace: true, ...navState });
    } catch (e) {
      setSaveError(e.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const doVoid = async () => {
    try {
      const res = await apiFetch(`${API}/${f.id}/void`, { method: "POST" });
      notify(res.message);
      setConfirmVoid(false);
      onReload();
    } catch (e) {
      notify(e.message || "Couldn't void.", "error");
      setConfirmVoid(false);
    }
  };

  const viewAttachment = async () => {
    try { window.open(URL.createObjectURL(pendingFile || (await apiBlob(`${API}/${f.id}/attachment`))), "_blank", "noopener"); }
    catch (e) { notify(e.message || "Couldn't open the attachment.", "error"); }
  };

  const err = (k) => (errors[k] ? "bad" : "");
  const attachmentName = pendingFile?.name || f.attachment;

  return (
    <>
      <div className="inv-shell">
        <section className="card inv-card">
          <header className="inv-head">
            <h2>{saved ? "Edit Receive Inventory" : "Add Receive Inventory"}</h2>
            <div className="inv-head-right">
              <button className="icon-btn ghost" onClick={() => navigate(backTo)} aria-label="Close"><Icon name="x" /></button>
            </div>
          </header>

          <div className="inv-body">
            {isVoid && <div className="inv-banner">This transaction is <strong>void</strong> and can't be edited.</div>}
            {saveError && <div className="alert-error inv-alert" role="alert">{saveError}</div>}

            <fieldset className="inv-fields" disabled={isVoid || saving}>
              <div className="inv-top">
                <div className="inv-col">
                  <Row label="Vendor" required error={errors.vendorId}>
                    {saved ? (
                      <input className="input" readOnly value={vendor?.name || ""} aria-label="Vendor" />
                    ) : (
                      <SearchSelect value={f.vendorId} onChange={(v) => setF((x) => ({ ...x, vendorId: v, refData: "" }))} options={vendorOpts}
                        searchPlaceholder="Search vendor..." aria-label="Vendor" />
                    )}
                  </Row>
                  <Row label=""><input className="input" readOnly value={vendor?.address || ""} aria-label="Address" /></Row>
                  <Row label=""><input className="input" readOnly value={vendor?.city_country || ""} aria-label="City / Country" /></Row>
                  <Row label="Apply PO#">
                    {saved || !f.vendorId ? (
                      <input className="input" readOnly value={f.refData || (f.vendorId ? "" : "Select a vendor first")} aria-label="Apply PO#" />
                    ) : (
                      <SearchSelect value={f.refData} onChange={applySource} options={sourceOpts} searchPlaceholder="Search PO or invoice..." aria-label="Apply PO#" />
                    )}
                  </Row>
                </div>

                <div className="inv-col">
                  <Row label="Date" required error={errors.date}>
                    <input type="date" className={`input ${err("date")}`} value={f.date} onChange={(e) => set("date", e.target.value)} />
                  </Row>
                  <Row label="Transaction No"><input className="input" readOnly value={f.no || "(assigned when saved)"} /></Row>
                  <Row label="Invoice Status"><input className="input" readOnly value={String(f.status).toUpperCase()} /></Row>
                </div>

                <div className="inv-col">
                  <Row label="Location" required error={errors.locationId}>
                    <div className={err("locationId")}>
                      <SearchSelect value={f.locationId} onChange={(v) => set("locationId", v)} options={locationOpts}
                        onAddNew={(typed) => setNewLocation(typed)} addNewLabel="New Location" aria-label="Location" />
                    </div>
                  </Row>
                  <Row label="Declared Month" error={errors.declaredMonth}>
                    <input type="month" className={`input ${err("declaredMonth")}`} value={f.declaredMonth} onChange={(e) => set("declaredMonth", e.target.value)} />
                  </Row>
                  <Row label="Attachment" as="div">
                    <div className="inv-file">
                      <button type="button" className="inv-file-btn" onClick={() => fileRef.current?.click()}>Browse</button>
                      {attachmentName
                        ? <button type="button" className="inv-file-name inv-file-link" onClick={viewAttachment}>{attachmentName}</button>
                        : <span className="inv-file-name">No file chosen</span>}
                      {pendingFile && <button type="button" className="inv-icon danger" onClick={() => setPendingFile(null)} aria-label="Remove new file"><Icon name="x" size={16} /></button>}
                      <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) setPendingFile(file); }} />
                    </div>
                  </Row>
                </div>
              </div>

              {/* ---------- lines ---------- */}
              <div className="inv-lines">
                <div className="xl-wrap">
                  <div className="xl-scroll">
                    <table className="xl">
                      <thead>
                        <tr>
                          <th className="xl-rownum">#</th>
                          <th style={{ minWidth: 170 }}>Item <span className="required-mark">*</span></th>
                          <th style={{ minWidth: 190 }}>Accounts</th>
                          <th style={{ minWidth: 110 }}>VAT</th>
                          <th className="ta-right">Qty</th>
                          <th className="ta-right">Price</th>
                          <th className="ta-right">Total</th>
                          <th className="ta-right">Discount</th>
                          <th className="ta-right">Input VAT</th>
                          <th className="ta-right">Net of VAT</th>
                          <th className="ta-right">VAT Exempt</th>
                          <th className="ta-right">Non VAT</th>
                          <th className="ta-right">Zero Rated</th>
                          <th aria-label="Remove" />
                        </tr>
                      </thead>
                      <tbody>
                        {f.lines.map((l, r) => {
                          const c = t.calcs[r];
                          return (
                            <tr key={r}>
                              <td className="xl-rownum">{r + 1}</td>
                              <td title={l.poId ? `From ${l.poNumber} · ${l.left} left to receive` : ""}>
                                {l.poId || l.apInvoiceNo ? (
                                  <span className="xl-ro" style={{ display: "block", textAlign: "left" }}>{l.itemLabel || l.itemId}</span>
                                ) : (
                                  <SearchSelect variant="cell" value={l.itemId} onChange={(v) => setLine(r, { itemId: v })} options={itemOpts}
                                    placeholder="Select item" searchPlaceholder="Search item..." aria-label={`Item row ${r + 1}`} />
                                )}
                              </td>
                              <td>
                                <SearchSelect variant="cell" value={l.accountCode} onChange={(v) => setLine(r, { accountCode: v })} options={accountOpts}
                                  placeholder="Select account" searchPlaceholder="Search account..." aria-label={`Account row ${r + 1}`} />
                              </td>
                              <td>
                                <SearchSelect variant="cell" value={l.vatType} onChange={(v) => setLine(r, { vatType: v })} options={VAT_OPTS} aria-label={`VAT row ${r + 1}`} />
                              </td>
                              {["qty", "price"].map((k) => (
                                <td key={k}><input className="xl-input num" inputMode="decimal" value={l[k]} onChange={(e) => setLine(r, { [k]: cleanNum(e.target.value) })} aria-label={`${k} row ${r + 1}`} /></td>
                              ))}
                              <td className="xl-ro">{num4(c.total)}</td>
                              <td><input className="xl-input num" inputMode="decimal" value={l.discount} onChange={(e) => setLine(r, { discount: cleanNum(e.target.value) })} aria-label={`Discount row ${r + 1}`} /></td>
                              <td className="xl-ro">{num4(c.inputVat)}</td>
                              <td className="xl-ro">{num4(c.netOfVat)}</td>
                              <td className="xl-ro">{num4(c.vatExempt)}</td>
                              <td className="xl-ro">{num4(c.nonVat)}</td>
                              <td className="xl-ro">{num4(c.zeroRated)}</td>
                              <td className="xl-del"><button type="button" tabIndex={-1} onClick={() => removeLine(r)} aria-label={`Remove row ${r + 1}`}><Icon name="x" size={15} /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="xl-rownum">
                            <button type="button" className="icon-btn ghost" onClick={() => setF((x) => ({ ...x, lines: [...x.lines, blank()] }))} aria-label="Add row" title="Add row"><Icon name="plus" size={15} /></button>
                          </td>
                          <td colSpan={3}>{f.lines.filter((l) => l.itemId).length} item(s)</td>
                          <td className="ta-right">{f.lines.reduce((n, l) => n + (Number(l.qty) || 0), 0)}</td>
                          <td />
                          {["total"].map((k) => <td key={k} className="ta-right">{num4(t.calcs.reduce((n, c) => n + c[k], 0))}</td>)}
                          <td className="ta-right">{num4(t.discount)}</td>
                          {["inputVat", "netOfVat", "vatExempt", "nonVat", "zeroRated"].map((k) => <td key={k} className="ta-right">{num4(t.calcs.reduce((n, c) => n + c[k], 0))}</td>)}
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                {errors.lines && <div className="field-error inv-line-errors">{errors.lines}</div>}
              </div>

              {/* ---------- summary (old footer rows) ---------- */}
              <div className="inv-summary">
                <SumRow label="Sub Total"><input className="input ta-right" readOnly value={num4(t.subTotal)} /></SumRow>
                <SumRow label="ATC (VT/PT)"><SearchSelect value={f.atcVtId} onChange={(v) => set("atcVtId", v)} options={atcOpts} aria-label="ATC (VT/PT)" /></SumRow>
                <SumRow label="2307 (VT/PT)"><input className="input ta-right" readOnly value={num4(t.vt)} /></SumRow>
                <SumRow label="2307 (VT/PT) Declared Month"><input type="month" className="input" value={f.vtMonth} onChange={(e) => set("vtMonth", e.target.value)} disabled={!f.atcVtId} /></SumRow>
                <SumRow label="ATC (IT)"><SearchSelect value={f.atcItId} onChange={(v) => set("atcItId", v)} options={atcOpts} aria-label="ATC (IT)" /></SumRow>
                <SumRow label="2307 (IT)"><input className="input ta-right" readOnly value={num4(t.it)} /></SumRow>
                <SumRow label="2307 (IT) Declared Month"><input type="month" className="input" value={f.itMonth} onChange={(e) => set("itMonth", e.target.value)} disabled={!f.atcItId} /></SumRow>
                <SumRow label="Discount Amt"><input className="input ta-right" readOnly value={num4(t.discount)} /></SumRow>
                <SumRow label="Input VAT"><input className="input ta-right" readOnly value={num4(t.inputVat)} /></SumRow>
                <SumRow label="Total"><input className="input ta-right inv-total" readOnly value={num4(t.total)} /></SumRow>
              </div>
            </fieldset>
          </div>
        </section>

        {/* ---------- footer (old: Close · VOID · SAVE) ---------- */}
        <div className="inv-actions">
          <button className="btn btn-primary inv-actions-left" onClick={() => navigate(`${RECEIVE_DETAIL_PATH}/new`, navState)} disabled={!saved}>
            <Icon name="plus" size={16} /> Receive New
          </button>
          <button className="btn" onClick={() => navigate(backTo)}>Close</button>
          <button className="btn btn-warning" disabled={!saved || isVoid} onClick={() => setConfirmVoid(true)}>VOID</button>
          <button className="btn btn-primary" disabled={isVoid || saving} onClick={save}>{saving ? "SAVING…" : "SAVE"}</button>
        </div>
      </div>

      {confirmVoid && (
        <ConfirmDialog
          title={`Void ${f.no}?`}
          message="The received quantities will be taken back from the PO and from stock."
          confirmLabel="Void"
          onCancel={() => setConfirmVoid(false)}
          onConfirm={doVoid}
        />
      )}
      {newLocation !== null && (
        <LocationModal
          defaultName={newLocation}
          onClose={() => setNewLocation(null)}
          onSaved={(loc) => {
            setLookups((lk) => ({ ...lk, locations: [loc, ...lk.locations] }));
            set("locationId", String(loc.id));
            setNewLocation(null);
          }}
        />
      )}
    </>
  );
}

function LocationModal({ defaultName, onClose, onSaved }) {
  const [name, setName] = useState(defaultName || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!name.trim()) return setError("Name is required.");
    setSaving(true);
    try { onSaved(await apiFetch(`${API}/locations`, { method: "POST", body: JSON.stringify({ description: name.trim() }) })); }
    catch (e) { setError(e.message || "Couldn't save."); setSaving(false); }
  };
  return (
    <Modal title="New Location" onClose={onClose} size="sm"
      footer={<><button className="btn" onClick={onClose} disabled={saving}>Close</button><button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</button></>}>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <Field label="Store / Warehouse"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

function Row({ label, error, required = false, children, as = "label" }) {
  const Tag = as;
  return (
    <Tag className="inv-row">
      <span className="inv-label">{label}{required && <span className="required-mark"> *</span>}</span>
      <div>{children}{error && <div className="field-error">{error}</div>}</div>
    </Tag>
  );
}

function SumRow({ label, children }) {
  return (
    <label className="inv-sum-row">
      <span>{label} :</span>
      <div>{children}</div>
    </label>
  );
}
