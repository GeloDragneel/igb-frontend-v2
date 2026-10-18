// Importation / Exportation form (same layout as SalesDetail.jsx: inv-* card, xl grid, fixed footer)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../../components/Toast";
import Icon from "../../../components/Icons";
import Modal, { Field } from "../../../components/Modal";
import SearchSelect from "../../../components/SearchSelect";
import { apiFetch, apiBlob, apiForm, apiUpload, useAuth } from "../../../context/AuthContext";
import { COUNTRY_OPTS, countryName } from "./tradeConfig";

const CURRENCY_OPTS = ["PHP", "USD", "EUR", "JPY", "CNY", "HKD", "SGD", "KRW", "AUD", "GBP"].map((c) => ({ value: c, label: c }));
const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const num4 = (n) => (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const n2 = (n) => (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- lists (sellers / buyers, items, accounts …), kept 10 minutes per account ---------- */
const cache = {};
function useTradeLookups(api) {
  const { user } = useAuth();
  const key = user ? `${api}-${user.type}-${user.id}-${user.caid ?? 0}` : null;
  const fresh = () => cache[key] && Date.now() - cache[key].at < 10 * 60 * 1000;
  const [lookups, setL] = useState(() => (key && fresh() ? cache[key].data : null));
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!key) return;
    setError("");
    try {
      const data = await apiFetch(`${api}/lookups`);
      cache[key] = { at: Date.now(), data };
      setL(data);
    } catch (e) {
      setError(e.message || "Couldn't load lists.");
    }
  }, [api, key]);

  useEffect(() => {
    if (!key) return;
    if (fresh()) setL(cache[key].data);
    else refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refresh]);

  const setLookups = useCallback((fn) => setL((prev) => {
    const next = typeof fn === "function" ? fn(prev) : fn;
    if (key) cache[key] = { at: Date.now(), data: next };
    return next;
  }), [key]);

  return { lookups, setLookups, ready: !!lookups, error, refresh };
}

/* =========================================================
   Page
   ========================================================= */
export default function TradeDetail({ cfg }) {
  const { id } = useParams();
  const location = useLocation();
  const no = decodeURIComponent(id || "");
  const isNew = no === "new";
  const { lookups, setLookups, ready, error: lkError, refresh } = useTradeLookups(cfg.api);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (isNew) { setData(null); return; }
    let alive = true;
    setError("");
    setData(null);
    apiFetch(`${cfg.api}/record/${encodeURIComponent(no)}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.status === 404 ? "404" : e.message || "Couldn't load the record."));
    return () => { alive = false; };
  }, [cfg.api, no, isNew, reloadKey]);

  const current = isNew ? null : data?.record?.no === no ? data : null;

  if (error === "404") {
    return (
      <div className="card not-found">
        <div className="nf-code">404</div>
        <h2>{cfg.title} {no} not found</h2>
        <p>It may have been deleted, or it belongs to another account.</p>
        <Link to={location.state?.from || cfg.detailRoute} className="btn btn-primary">Back</Link>
      </div>
    );
  }
  if (error || (!ready && lkError)) {
    return (
      <div className="alert-error" role="alert">
        {error || lkError}{" "}
        <button className="btn btn-sm" onClick={() => { refresh(); setReloadKey((n) => n + 1); }}>Try again</button>
      </div>
    );
  }
  if (!ready || (!isNew && !current)) return <FormSkeleton />;

  return (
    <TradeForm
      key={`${no}-${reloadKey}`}
      cfg={cfg}
      lookups={lookups}
      setLookups={setLookups}
      data={current}
      onReload={() => setReloadKey((n) => n + 1)}
    />
  );
}

/* =========================================================
   Form
   ========================================================= */
function TradeForm({ cfg, lookups, setLookups, data, onReload }) {
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useToast();

  const rec = data?.record;
  const saved = !!rec;
  const pendingTicket = data?.ticket || null;
  const backTo = location.state?.from || cfg.detailRoute;
  const navState = { state: { from: backTo } };

  const blankLine = () => ({ itemId: "", accountCode: "", ...Object.fromEntries(cfg.cols.filter((c) => c.input).map((c) => [c.key, ""])) });

  const [f, setF] = useState(() =>
    rec
      ? {
        id: rec.id, no: rec.no, partyId: rec.party_id ? String(rec.party_id) : "",
        date: rec.date || today(), invoiceNo: rec.invoice_no || "", entryNo: rec.entry_no || "", country: rec.country || "",
        payDate: rec.pay_date || "", currency: rec.currency || cfg.defaultCurrency, exRate: Number(rec.ex_rate) || 1,
        remarks: rec.remarks || "", documentTypeId: rec.document_type_id ? String(rec.document_type_id) : "",
        declaredMonth: rec.declared_month || today().slice(0, 7), accountCode: rec.account_code || "",
        attachment: rec.attachment || "", status: rec.status || "ACTIVE",
        lines: data.lines.length
          ? data.lines.map((l) => ({
            itemId: l.item_id ? String(l.item_id) : "", accountCode: l.account_code || "",
            ...Object.fromEntries(cfg.cols.filter((c) => c.input).map((c) => [c.key, l[c.key] ?? ""])),
          }))
          : [blankLine()],
      }
      : {
        id: null, no: "", partyId: "", date: today(), invoiceNo: "", entryNo: "", country: "", payDate: today(),
        currency: cfg.defaultCurrency, exRate: 1, remarks: "", documentTypeId: "", declaredMonth: today().slice(0, 7),
        accountCode: "", attachment: "", status: "NEW", lines: [blankLine()],
      }
  );

  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [showTicket, setShowTicket] = useState(false);
  const [newParty, setNewParty] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const fileRef = useRef(null);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setLine = (i, patch) => setF((x) => ({ ...x, lines: x.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const addLine = () => setF((x) => ({ ...x, lines: [...x.lines, blankLine()] }));
  const removeLine = (i) => setF((x) => ({ ...x, lines: x.lines.length > 1 ? x.lines.filter((_, idx) => idx !== i) : [blankLine()] }));

  const locked = f.status === "VOID" || !!pendingTicket;
  const used = f.lines.filter((l) => l.accountCode);
  const calcs = f.lines.map((l) => cfg.calc(l, f.exRate));
  const sum = (k) => r4(calcs.reduce((n, c) => n + (c[k] || 0), 0));

  const party = lookups.parties.find((p) => String(p.id) === String(f.partyId));
  const accName = (code) => lookups.accounts.find((a) => a.account_code === code)?.account_name || "";
  const vatAcc = lookups.accounts.find((a) => /input\s*vat/i.test(a.account_name));

  /* ---------- options ---------- */
  const partyOpts = [{ value: "", label: "— None —" }, ...lookups.parties.map((p) => ({ value: String(p.id), label: p.name, hint: p.tin || "" }))];
  const itemOpts = [{ value: "", label: "— None —" }, ...lookups.items.map((i) => ({ value: String(i.id), label: i.description || i.item_code, hint: i.item_code }))];
  const accountOpts = lookups.accounts.map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` }));
  const docOpts = [{ value: "", label: "— None —" }, ...lookups.document_types.map((d) => ({ value: String(d.id), label: d.name }))];

  /* ---------- save ---------- */
  const validate = () => {
    const e = {};
    if (!f.partyId) e.partyId = `Please select ${cfg.party.toLowerCase()}.`;
    if (!f.date) e.date = `${cfg.dateLabel} is required.`;
    if (!String(f.invoiceNo).trim()) e.invoiceNo = "Please input invoice #.";
    if (String(f.invoiceNo).includes("'")) e.invoiceNo = "Invoice # can't contain an apostrophe.";
    if (!/^\d{4}-\d{2}$/.test(f.declaredMonth)) e.declaredMonth = "Declared Month is required.";
    else if ((lookups.locked_months || []).includes(f.declaredMonth)) e.declaredMonth = "Declared Month is disabled.";
    if (!f.accountCode) e.accountCode = "Accounts is required.";
    if (!(Number(f.exRate) > 0)) e.exRate = "Exchange rate must be greater than 0.";
    if (used.length === 0) e.lines = "Please add item (each line needs an account).";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildBody = () => ({
    party_id: Number(f.partyId), date: f.date, invoice_no: f.invoiceNo.trim(), entry_no: f.entryNo || null,
    country: f.country || null, pay_date: f.payDate || null, currency: f.currency, ex_rate: Number(f.exRate),
    remarks: f.remarks || null, document_type_id: f.documentTypeId ? Number(f.documentTypeId) : null,
    declared_month: f.declaredMonth, account_code: f.accountCode,
    lines: used.map((l) => ({
      item_id: l.itemId ? Number(l.itemId) : null, account_code: l.accountCode,
      ...Object.fromEntries(cfg.cols.filter((c) => c.input).map((c) => [c.key, Number(l[c.key]) || 0])),
    })),
  });

  const save = () => {
    setSaveError("");
    if (!validate()) return setSaveError("Please fix the highlighted fields.");
    if (saved) setTicket({ ...buildBody(), action: "EDIT" });
    else setReview(buildBody());
  };

  const submitNew = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(cfg.api, { method: "POST", body: JSON.stringify(review) });
      if (pendingFile) {
        try { await apiUpload(`${cfg.api}/${res.id}/attachment`, pendingFile); }
        catch (err) { notify(`Saved, but the attachment failed: ${err.message}`, "error"); }
      }
      notify(`${res.no} saved`);
      setReview(null);
      setPendingFile(null);
      navigate(`${cfg.detailRoute}/${encodeURIComponent(res.no)}`, { replace: true, ...navState });
    } catch (e) {
      setSaveError(e.message || "Couldn't save.");
      setReview(null);
    } finally {
      setSaving(false);
    }
  };

  const submitTicket = async (remarks) => {
    const form = new FormData();
    form.append("data", JSON.stringify({ ...ticket, ticket_remarks: remarks }));
    if (pendingFile) form.append("attachment", pendingFile);
    const res = await apiForm(`${cfg.api}/${f.id}/ticket`, form);
    notify(`${res.message} (${res.ticket_no}) – waiting for admin approval`);
    setTicket(null);
    setPendingFile(null);
    onReload();
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return notify("File is too big (max 10 MB).", "error");
    setPendingFile(file);
  };

  const viewAttachment = async () => {
    try {
      const blob = pendingFile || (await apiBlob(`${cfg.api}/${f.id}/attachment`));
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } catch (e) {
      notify(e.message || "Couldn't open the attachment.", "error");
    }
  };

  const err = (k) => (errors[k] ? "bad" : "");
  const attachmentName = pendingFile?.name || f.attachment || "";

  return (
    <>
      <div className="inv-shell">
        <section className="card inv-card">
          <header className="inv-head">
            <h2>{cfg.title}</h2>
            <div className="inv-head-right">
              <button className="icon-btn ghost" onClick={() => navigate(backTo)} aria-label="Close"><Icon name="x" /></button>
            </div>
          </header>

          <div className="inv-body">
            {pendingTicket ? (
              <div className="inv-banner ticket-banner">
                <span>Ticket <strong>{pendingTicket.ticket_no}</strong> is pending admin approval. This record can't be edited until it's approved.</span>
                <button type="button" className="btn btn-sm" onClick={() => setShowTicket(true)}>View ticket</button>
              </div>
            ) : f.status === "VOID" && (
              <div className="inv-banner">This record is <strong>void</strong> and can't be edited.</div>
            )}
            {saveError && <div className="alert-error inv-alert" role="alert">{saveError}</div>}

            <fieldset className="inv-fields" disabled={locked || saving}>
              <div className="inv-top">
                {/* col 1: party · address · remarks · date */}
                <div className="inv-col">
                  <Row label={cfg.party} required error={errors.partyId}>
                    <SearchSelect
                      value={f.partyId}
                      onChange={(v) => set("partyId", v)}
                      options={partyOpts}
                      onAddNew={(typed) => setNewParty(typed)}
                      addNewLabel={`New ${cfg.party}`}
                      searchPlaceholder="Search name..."
                      aria-label={cfg.party}
                    />
                  </Row>
                  <Row label=""><input className="input" readOnly value={party?.address || ""} aria-label="Address" /></Row>
                  <Row label="Remarks"><input className="input" maxLength={255} value={f.remarks} onChange={(e) => set("remarks", e.target.value)} /></Row>
                  <Row label={cfg.dateLabel} required error={errors.date}>
                    <input type="date" className={`input ${err("date")}`} value={f.date} onChange={(e) => set("date", e.target.value)} />
                  </Row>
                  <Row label={cfg.noLabel}><input className="input" readOnly value={f.no || "(assigned when saved)"} /></Row>
                </div>

                {/* col 2: country · currency · ex rate · entry no · document type */}
                <div className="inv-col">
                  <Row label={cfg.countryLabel}>
                    <SearchSelect
                      value={f.country}
                      onChange={(v) => set("country", v)}
                      options={f.country && !COUNTRY_OPTS.some((o) => o.value === f.country)
                        ? [...COUNTRY_OPTS, { value: f.country, label: countryName(f.country) }] : COUNTRY_OPTS}
                      searchPlaceholder="Search country..."
                      aria-label={cfg.countryLabel}
                    />
                  </Row>
                  <Row label="Currency"><SearchSelect value={f.currency} onChange={(v) => set("currency", v)} options={CURRENCY_OPTS} aria-label="Currency" /></Row>
                  <Row label="Exchange Rate" error={errors.exRate}>
                    <input type="number" step="0.0001" min="0" className={`input ta-right ${err("exRate")}`} value={f.exRate} onChange={(e) => set("exRate", e.target.value)} />
                  </Row>
                  <Row label={cfg.entryLabel}><input className="input" maxLength={100} value={f.entryNo} onChange={(e) => set("entryNo", e.target.value)} /></Row>
                  <Row label="Document Type"><SearchSelect value={f.documentTypeId} onChange={(v) => set("documentTypeId", v)} options={docOpts} aria-label="Document Type" /></Row>
                </div>

                {/* col 3: payment date · invoice no · declared month · accounts · attachment */}
                <div className="inv-col">
                  <Row label={cfg.payLabel}><input type="date" className="input" value={f.payDate} onChange={(e) => set("payDate", e.target.value)} /></Row>
                  <Row label="Invoice Number" required error={errors.invoiceNo}>
                    <input className={`input ${err("invoiceNo")}`} maxLength={100} value={f.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} />
                  </Row>
                  <Row label="Declared Month" required error={errors.declaredMonth}>
                    <input type="month" className={`input ${err("declaredMonth")}`} value={f.declaredMonth} onChange={(e) => set("declaredMonth", e.target.value)} />
                  </Row>
                  <Row label="Accounts" required error={errors.accountCode}>
                    <div className={err("accountCode")}>
                      <SearchSelect value={f.accountCode} onChange={(v) => set("accountCode", v)} options={[{ value: "", label: "— None —" }, ...accountOpts]} aria-label="Accounts" />
                    </div>
                  </Row>
                  <Row label="Attachment" as="div">
                    <div className="inv-file">
                      <button type="button" className="inv-file-btn" onClick={() => fileRef.current?.click()}>Browse</button>
                      {attachmentName ? (
                        <button type="button" className="inv-file-name inv-file-link" onClick={viewAttachment} title="View attachment">{attachmentName}</button>
                      ) : (
                        <span className="inv-file-name">No file chosen</span>
                      )}
                      {pendingFile && (
                        <button type="button" className="inv-icon danger" onClick={() => setPendingFile(null)} aria-label="Remove new file"><Icon name="x" size={16} /></button>
                      )}
                      <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={onPickFile} />
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
                          <th style={{ minWidth: 180 }}>Item</th>
                          <th style={{ minWidth: 200 }}>Account <span className="required-mark">*</span></th>
                          {cfg.cols.map((c) => <th key={c.key} className="ta-right" title={c.label}>{c.label}</th>)}
                          <th aria-label="Remove" />
                        </tr>
                      </thead>
                      <tbody>
                        {f.lines.map((l, r) => (
                          <tr key={r}>
                            <td className="xl-rownum">{r + 1}</td>
                            <td>
                              <SearchSelect variant="cell" value={l.itemId} onChange={(v) => setLine(r, { itemId: v })} options={itemOpts}
                                placeholder="Select item" searchPlaceholder="Search item..." aria-label={`Item row ${r + 1}`} />
                            </td>
                            <td>
                              <SearchSelect variant="cell" value={l.accountCode} onChange={(v) => setLine(r, { accountCode: v })} options={accountOpts}
                                placeholder="Select account" searchPlaceholder="Search account..." aria-label={`Account row ${r + 1}`} />
                            </td>
                            {cfg.cols.map((c) =>
                              c.input ? (
                                <td key={c.key}>
                                  <input className="xl-input num" inputMode="decimal" value={l[c.key] ?? ""}
                                    onChange={(e) => setLine(r, { [c.key]: cleanNum(e.target.value) })} aria-label={`${c.label} row ${r + 1}`} />
                                </td>
                              ) : (
                                <td key={c.key} className="xl-ro">{num4(calcs[r][c.key])}</td>
                              )
                            )}
                            <td className="xl-del">
                              <button type="button" tabIndex={-1} onClick={() => removeLine(r)} aria-label={`Remove row ${r + 1}`}><Icon name="x" size={15} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="xl-rownum">
                            <button type="button" className="icon-btn ghost" onClick={addLine} aria-label="Add row" title="Add row"><Icon name="plus" size={15} /></button>
                          </td>
                          <td>{used.length} line(s)</td>
                          <td />
                          {cfg.cols.map((c) => <td key={c.key} className="ta-right">{num4(sum(c.key))}</td>)}
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                {errors.lines && <div className="field-error inv-line-errors">{errors.lines}</div>}
              </div>
            </fieldset>
          </div>
        </section>

        {/* ---------- fixed footer (old: Close · VOID · ADD ITEM · SAVE) ---------- */}
        <div className="inv-actions">
          <button
            className="btn btn-primary inv-actions-left"
            onClick={() => navigate(`${cfg.detailRoute}/new`, navState)}
            disabled={!saved}
            title={saved ? `Start a new ${cfg.title.toLowerCase()}` : "You're already on a new record"}
          >
            <Icon name="plus" size={16} /> Add New {cfg.title}
          </button>
          <button className="btn" onClick={() => navigate(backTo)}>Close</button>
          <button className="btn btn-warning" disabled={!saved || locked} onClick={() => validate() && setTicket({ ...buildBody(), action: "VOID" })}>VOID</button>
          <button className="btn btn-info" onClick={addLine} disabled={locked || saving}>ADD ITEM</button>
          <button className="btn btn-primary" disabled={locked || saving} onClick={save}>{saving ? "SAVING…" : "SAVE"}</button>
        </div>
      </div>

      {/* ---------- dialogs ---------- */}
      {review && (
        <ReviewModal
          cfg={cfg}
          f={f}
          party={party}
          calcs={calcs.filter((_, i) => f.lines[i].accountCode)}
          lines={used}
          accName={accName}
          vatAcc={vatAcc}
          docName={lookups.document_types.find((d) => String(d.id) === String(f.documentTypeId))?.name}
          saving={saving}
          onClose={() => setReview(null)}
          onSubmit={submitNew}
        />
      )}
      {ticket && <TicketModal action={ticket.action} onClose={() => setTicket(null)} onSubmit={submitTicket} />}
      {showTicket && pendingTicket && <TradeTicketModal cfg={cfg} ticketNo={pendingTicket.ticket_no} onClose={() => setShowTicket(false)} />}
      {newParty !== null && (
        <PartyModal
          cfg={cfg}
          defaultName={newParty}
          onClose={() => setNewParty(null)}
          onSaved={(p) => {
            setLookups((lk) => ({ ...lk, parties: [...lk.parties, p].sort((a, b) => a.name.localeCompare(b.name)) }));
            set("partyId", String(p.id));
            notify(`${p.name} added`);
            setNewParty(null);
          }}
        />
      )}
    </>
  );
}

/* =========================================================
   Review before saving a new record (old "Information" popup)
   ========================================================= */
function ReviewModal({ cfg, f, party, calcs, lines, accName, vatAcc, docName, saving, onClose, onSubmit }) {
  const rowsIn = lines.map((l, i) => ({ ...calcs[i], account_code: l.accountCode }));
  const je = cfg.journal(f.accountCode, rowsIn, accName, vatAcc);
  const dr = r4(je.reduce((n, r) => n + r.dr, 0));
  const cr = r4(je.reduce((n, r) => n + r.cr, 0));
  const balanced = Math.abs(dr - cr) < 0.01;

  return (
    <Modal
      title="Review before saving"
      onClose={() => !saving && onClose()}
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>Close</button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : "Submit"}</button>
        </>
      }
    >
      <div className="tv-cols">
        <section className="tv-card">
          <h4>Details</h4>
          <dl className="tv-dl">
            <dt>{cfg.party}</dt><dd>{party?.name || "—"}</dd>
            <dt>Address</dt><dd>{party?.address || "—"}</dd>
            <dt>{cfg.dateLabel}</dt><dd>{f.date}</dd>
            <dt>{cfg.countryLabel}</dt><dd>{countryName(f.country) || "—"}</dd>
            <dt>Currency</dt><dd>{f.currency} @ {f.exRate}</dd>
          </dl>
        </section>
        <section className="tv-card">
          <h4>&nbsp;</h4>
          <dl className="tv-dl">
            <dt>Invoice Number</dt><dd>{f.invoiceNo}</dd>
            <dt>{cfg.entryLabel}</dt><dd>{f.entryNo || "—"}</dd>
            <dt>{cfg.payLabel}</dt><dd>{f.payDate || "—"}</dd>
            <dt>Document Type</dt><dd>{docName || "—"}</dd>
            <dt>Declared Month</dt><dd>{f.declaredMonth}</dd>
          </dl>
        </section>
      </div>

      <section className="tv-card tv-lines" style={{ marginTop: 12 }}>
        <h4>Journal Entry</h4>
        <div className="table-scroll">
          <table className="tv-table">
            <thead><tr><th>Account</th><th className="ta-right">Debit</th><th className="ta-right">Credit</th></tr></thead>
            <tbody>
              {je.map((r, i) => (
                <tr key={i}>
                  <td>{r.code} - {r.name}</td>
                  <td className="ta-right mono">{r.dr ? n2(r.dr) : "-"}</td>
                  <td className="ta-right mono">{r.cr ? n2(r.cr) : "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td>Total</td><td className="ta-right mono">{n2(dr)}</td><td className="ta-right mono">{n2(cr)}</td></tr></tfoot>
          </table>
        </div>
        {!balanced && <p className="rv-warn">Not balanced: difference of {n2(Math.abs(dr - cr))}</p>}
      </section>
    </Modal>
  );
}

/* =========================================================
   Request Ticket (EDIT / VOID)
   ========================================================= */
function TicketModal({ action, onClose, onSubmit }) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!remarks.trim()) return setError("Please input remarks.");
    setSaving(true);
    try { await onSubmit(remarks.trim()); }
    catch (e) { setError(e.message || "Couldn't submit the ticket."); setSaving(false); }
  };
  return (
    <Modal
      title={`Request Ticket – ${action}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>Close</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Submitting…" : "Submit"}</button>
        </>
      }
    >
      {error && <div className="alert-error" role="alert">{error}</div>}
      <Field label="Remarks / Reason">
        <textarea className="input" rows={4} maxLength={1000} value={remarks} onChange={(e) => setRemarks(e.target.value)} autoFocus />
      </Field>
      <p className="ticket-note">For admin approval</p>
    </Modal>
  );
}

/* View a pending ticket */
export function TradeTicketModal({ cfg, ticketNo, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch(`${cfg.api}/ticket/${encodeURIComponent(ticketNo)}`).then(setData).catch((e) => setError(e.message || "Couldn't load the ticket."));
  }, [cfg.api, ticketNo]);

  const t = data?.ticket || {};
  const m = data?.master || {};
  const lines = data?.details || [];
  return (
    <Modal title="Ticket details" onClose={onClose} size="lg">
      {error && <div className="alert-error" role="alert">{error}</div>}
      {!data && !error && <span className="sk" style={{ display: "block", height: 160, borderRadius: 12 }} />}
      {data && (
        <div className="tv">
          <div className="tv-head">
            <div className="tv-head-main">
              <span className="tv-no">{t.ticket_no}</span>
              <span className="tv-sub">For <b>{t.reference_no}</b> · Requested {String(t.created_at || "").replace("T", " ").slice(0, 16)}</span>
            </div>
            <div className="tv-pills">
              <span className="tv-pill tv-pill-action">{t.action}</span>
              <span className="tv-pill tv-pill-pending"><span className="tv-dot" /> Pending approval</span>
            </div>
          </div>
          {t.remarks && <div className="tv-note"><span className="tv-note-label">Reason</span><p>{t.remarks}</p></div>}
          <section className="tv-card tv-lines">
            <h4>Lines <span className="tv-count">{lines.length}</span></h4>
            <div className="table-scroll">
              <table className="tv-table">
                <thead><tr><th>Account</th>{cfg.cols.map((c) => <th key={c.key} className="ta-right">{c.label}</th>)}</tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.account_code}</td>
                      {cfg.cols.map((c) => <td key={c.key} className="ta-right mono">{num4(l[c.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {m.invoice_no && <p className="muted small">Invoice # {m.invoice_no} · Declared {m.declared_month}</p>}
        </div>
      )}
    </Modal>
  );
}

/* Quick add seller / buyer */
function PartyModal({ cfg, defaultName, onClose, onSaved }) {
  const [p, setP] = useState({ name: defaultName || "", address: "", tin: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!p.name.trim()) return setError("Name is required.");
    setSaving(true);
    try { onSaved(await apiFetch(`${cfg.api}/parties`, { method: "POST", body: JSON.stringify({ ...p, name: p.name.trim() }) })); }
    catch (e) { setError(e.message || "Couldn't save."); setSaving(false); }
  };
  return (
    <Modal
      title={`New ${cfg.party}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>Close</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </>
      }
    >
      {error && <div className="alert-error" role="alert">{error}</div>}
      <Field label="Name"><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} autoFocus /></Field>
      <Field label="Address"><input className="input" value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} /></Field>
      <Field label="TIN"><input className="input" value={p.tin} onChange={(e) => setP({ ...p, tin: e.target.value })} /></Field>
    </Modal>
  );
}

/* ---------- small helpers ---------- */
function Row({ label, error, required = false, children, as = "label" }) {
  const Tag = as;
  return (
    <Tag className="inv-row">
      <span className="inv-label">{label}{required && <span className="required-mark"> *</span>}</span>
      <div>{children}{error && <div className="field-error">{error}</div>}</div>
    </Tag>
  );
}

function FormSkeleton() {
  return (
    <div className="inv-shell" aria-busy="true" aria-label="Loading">
      <section className="card inv-card">
        <header className="inv-head"><span className="sk sk-title" /></header>
        <div className="inv-body">
          <div className="inv-top">
            {[5, 5, 5].map((n, c) => (
              <div className="inv-col" key={c}>
                {Array.from({ length: n }).map((_, i) => (
                  <div className="sk-row" key={i}><span className="sk sk-label" /><span className="sk sk-input" /></div>
                ))}
              </div>
            ))}
          </div>
          <div className="inv-lines"><div className="sk-table"><span className="sk sk-thead" /><span className="sk sk-trow" /><span className="sk sk-trow" /></div></div>
        </div>
      </section>
      <div className="inv-actions">{Array.from({ length: 5 }).map((_, i) => <span key={i} className="sk sk-action" />)}</div>
    </div>
  );
}
