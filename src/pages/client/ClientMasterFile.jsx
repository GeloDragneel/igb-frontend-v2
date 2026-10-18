// Client → Master File (old pages/Client/Master_File)
// Business ownership, sub business ownership, compliance, classification, industry, documents
// + the Masterlist dropdowns that had no screen of their own (civil status, account status, nature of business, branch type, tax registration)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import "./ClientMasterFile.css";
import "./ClientMasterFile.pager.css";
import "./NatureCoa.css";

const plain = (html) => {
    const d = document.createElement("div");
    d.innerHTML = html || "";
    return (d.textContent || "").replace(/\s+/g, " ").trim();
};

export default function ClientMasterFile() {
    const notify = useToast();
    const [files, setFiles] = useState([]);
    const [active, setActive] = useState("bot");
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [per, setPer] = useState(15);
    const [res, setRes] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [form, setForm] = useState(null);        // { id, values }
    const [coaFor, setCoaFor] = useState(null);    // Nature of Business → { id, name } (id 0 = general chart)

    const loadFiles = useCallback(() => apiFetch("/client-master-files").then(setFiles).catch((e) => setError(e.message || "Couldn't load the master files.")), []);
    useEffect(() => { loadFiles(); }, [loadFiles]);

    useEffect(() => {
        const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [q]);

    const file = files.find((f) => f.key === active);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setRes(await apiFetch(`/client-master-files/${active}?${new URLSearchParams({ q: query, page, per_page: per })}`));
        } catch (e) {
            setError(e.message || "Couldn't load the list.");
            setRes(null);
        } finally {
            setLoading(false);
        }
    }, [active, query, page, per]);
    useEffect(() => { load(); }, [load]);

    const pick = (key) => { setActive(key); setQ(""); setQuery(""); setPage(1); setRes(null); };
    const groups = useMemo(() => files.reduce((g, f) => ({ ...g, [f.group]: [...(g[f.group] || []), f] }), {}), [files]);
    const cols = file?.fields || [];
    const rows = res?.data || [];
    const last = res?.last_page || 1;

    const addNew = () => setForm({ id: null, values: Object.fromEntries(cols.map((c) => [c.key, ""])) });
    const edit = (r) => setForm({ id: r.id, values: Object.fromEntries(cols.map((c) => [c.key, r[c.key] ?? ""])) });
    const afterSave = (m) => { setForm(null); notify(m); load(); loadFiles(); };

    return (
        <div className="cmf">
            {/* ---------- files ---------- */}
            <aside className="card cmf-files">
                {Object.entries(groups).map(([g, list]) => (
                    <div key={g} className="cmf-group">
                        <div className="cmf-group-label">{g}</div>
                        {list.map((f) => (
                            <button key={f.key} className={`cmf-file ${active === f.key ? "is-on" : ""}`} onClick={() => pick(f.key)}>
                                <span>{f.label}</span>
                                <span className="cmf-count">{f.ready ? f.count : "—"}</span>
                            </button>
                        ))}
                    </div>
                ))}
                {!files.length && !error && <p className="cmf-empty">Loading…</p>}
            </aside>

            {/* ---------- list ---------- */}
            <section className="card cmf-body">
                <header className="cmf-head">
                    <h3>{file?.label || "Master file"}</h3>
                    <input className="input cmf-search" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
                    {active === "nature" && <button className="btn" onClick={() => setCoaFor({ id: 0, name: "General chart" })} title="Used by natures without their own chart">General chart</button>}
                    <button className="btn btn-primary" onClick={addNew} disabled={!file?.ready}>+ Add new</button>
                </header>

                {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}
                {file && !file.ready && <div className="alert-error" role="alert">{file.label}: table not found. Run the migration in SETUP.md.</div>}

                <div className="cmf-scroll">
                    <table className="cmf-table">
                        <thead>
                            <tr>
                                <th className="cmf-no">#</th>
                                {cols.map((c) => <th key={c.key}>{c.label}</th>)}
                                {active === "nature" && <th className="cmf-act">Charts of account</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading && !rows.length && <tr><td colSpan={cols.length + 1 + (active === "nature" ? 1 : 0)} className="cmf-empty">Loading…</td></tr>}
                            {!loading && !rows.length && <tr><td colSpan={cols.length + 1 + (active === "nature" ? 1 : 0)} className="cmf-empty">{query ? `Nothing matches “${query}”.` : "No records yet. Click + Add new."}</td></tr>}
                            {rows.map((r, i) => (
                                <tr key={r.id} className="cmf-row" onClick={() => edit(r)}>
                                    <td className="cmf-no">{(res.page - 1) * res.per_page + i + 1}</td>
                                    {cols.map((c) => (
                                        <td key={c.key} className={c.type === "text" || c.type === "select" ? "cmf-strong" : "cmf-wrap"}>
                                            {c.type === "select" ? (r[`${c.key}_label`] || "—") : c.type === "rich" ? (plain(r[c.key]) || "—") : (r[c.key] || "—")}
                                        </td>
                                    ))}
                                    {active === "nature" && (
                                        <td className="cmf-act" onClick={(e) => e.stopPropagation()}>
                                            <button className="btn btn-sm" onClick={() => setCoaFor({ id: r.id, name: r.name })}>View / edit</button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="cmf-pager">
                    <span className="cmf-muted">{res?.total ? `Showing ${(res.page - 1) * res.per_page + 1}–${Math.min(res.page * res.per_page, res.total)} of ${res.total}` : "0 records"}</span>
                    <div className="cmf-pager-nav">
                        <label className="cmf-per">Results
                            <select className="input" value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(1); }}>
                                {[15, 30, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <Pager page={res?.page || page} last={last} onPage={setPage} disabled={loading} />
                    </div>
                </div>
            </section>

            {coaFor && <NatureCoaModal nature={coaFor} onClose={() => setCoaFor(null)} />}
            {form && file && <MasterFileForm file={file} form={form} onClose={() => setForm(null)} onDone={afterSave} />}
        </div>
    );
}

/* ---------- Nature of Business → its default Charts of Account (m_nature_coa_template) ---------- */
const COA_TONE = { Asset: "blue", Liability: "orange", Equity: "purple", Revenue: "green", "Cost of Sales": "red", Expense: "red", "Other Income": "green", "Other Expense": "red" };
const COA_FLAGS = [["is_sales", "Sales"], ["is_purchases", "Purchases"], ["is_expenses", "Expenses"], ["is_for_paid", "Paid"]];

function NatureCoaModal({ nature, onClose }) {
    const notify = useToast();
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [edit, setEdit] = useState(null);          // { code|null, values }
    const [busy, setBusy] = useState(false);
    const [del, setDel] = useState(null);

    const load = useCallback(() => {
        setError("");
        apiFetch(`/nature-coa/${nature.id}`).then(setData).catch((e) => setError(e.message || "Couldn't load the chart of accounts."));
    }, [nature.id]);
    useEffect(() => { load(); }, [load]);

    const rows = data?.rows || [];
    const byCode = useMemo(() => Object.fromEntries(rows.map((r) => [r.code, r])), [rows]);
    const kids = useMemo(() => rows.reduce((k, r) => ({ ...k, [r.parent || ""]: [...(k[r.parent || ""] || []), r] }), {}), [rows]);
    const term = q.trim().toLowerCase();
    const hit = (r) => !term || r.code.includes(term) || r.name.toLowerCase().includes(term);
    const lines = [];
    const walk = (key, level) => (kids[key] || []).forEach((r) => {
        const under = (c) => (kids[c] || []).some((k) => hit(k) || under(k.code));
        if (hit(r) || under(r.code)) lines.push({ r, level, head: !!kids[r.code]?.length });
        walk(r.code, level + 1);
    });
    walk("", 0);

    const apply = (res, msg) => { setData((d) => ({ ...d, rows: res.rows, own: res.own })); notify(msg || res.message); };
    const copyGeneral = async () => {
        setBusy(true);
        try { apply(await apiFetch(`/nature-coa/${nature.id}/copy-general`, { method: "POST" })); } catch (e) { notify(e.message || "Couldn't copy.", "error"); }
        setBusy(false);
    };
    const remove = async () => {
        setBusy(true);
        try { apply(await apiFetch(`/nature-coa/${nature.id}/${encodeURIComponent(del.code)}`, { method: "DELETE" })); } catch (e) { notify(e.message || "Couldn't delete.", "error"); }
        setDel(null);
        setBusy(false);
    };
    const blank = (parent = "") => ({ code: "", name: "", type: byCode[parent]?.type || "Expense", parent, description: "", is_sales: false, is_purchases: false, is_expenses: false, is_for_paid: false });

    return (
        <>
            <Modal title={`Charts of account · ${data?.nature || nature.name || ""}`} onClose={onClose} size="xxlg"
                footer={<button className="btn btn-dark" onClick={onClose}>Close</button>}>
                {error && <div className="alert-error" role="alert">{error} <button className="btn btn-sm" onClick={load}>Try again</button></div>}
                {!data && !error && <p className="cmf-empty">Loading…</p>}
                {data && (
                    <div className="ncoa">
                        {!data.own && (
                            <div className="ncoa-note">
                                This nature has no chart of its own yet, so new business accounts get the <b>general chart</b> ({data.general_count} accounts).
                                <button className="btn btn-sm btn-primary" onClick={copyGeneral} disabled={busy}>Create its own chart</button>
                            </div>
                        )}
                        <div className="ncoa-bar">
                            <input className="input" placeholder="Search code or account…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search accounts" />
                            <span className="cmf-muted">{rows.length} accounts</span>
                            {(data.own || nature.id === 0) && <button className="btn btn-primary" onClick={() => setEdit({ code: null, values: blank() })}>+ Add account</button>}
                        </div>
                        <div className="ncoa-list">
                            <table className="cmf-table">
                                <thead><tr><th>Account</th><th>Type</th><th>Used in</th><th className="cmf-act">Action</th></tr></thead>
                                <tbody>
                                    {!lines.length && <tr><td colSpan={4} className="cmf-empty">{rows.length ? "Nothing matches the search." : "No accounts yet."}</td></tr>}
                                    {lines.map(({ r, level, head }) => (
                                        <tr key={r.code} className={head ? "ncoa-head" : ""}>
                                            <td style={{ paddingLeft: 12 + level * 22 }}>
                                                <span className="mono ncoa-code">{r.code}</span> <span className={head ? "cmf-strong" : ""}>{r.name}</span>
                                            </td>
                                            <td><span className={`badge badge-${COA_TONE[r.type] || "gray"}`}>{r.type || "—"}</span></td>
                                            <td>{COA_FLAGS.filter(([k]) => r[k]).map(([, l]) => <span key={l} className="badge badge-gray ncoa-flag">{l}</span>)}</td>
                                            <td className="cmf-act">
                                                {(data.own || nature.id === 0) ? (
                                                    <span className="ncoa-actions">
                                                        <button className="btn btn-sm" onClick={() => setEdit({ code: null, values: blank(r.code) })} title="Add sub-account">+ Sub</button>
                                                        <button className="btn btn-sm" onClick={() => setEdit({ code: r.code, values: { ...blank(), ...r, parent: r.parent || "" } })}>Edit</button>
                                                        <button className="btn btn-sm btn-danger" onClick={() => setDel(r)} disabled={head} title={head ? "Has sub-accounts" : "Delete"}>Delete</button>
                                                    </span>
                                                ) : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </Modal>
            {edit && <NatureCoaForm nob={nature.id} edit={edit} rows={rows} types={data?.types || Object.keys(COA_TONE)}
                onClose={() => setEdit(null)} onSaved={(res) => { apply(res); setEdit(null); }} />}
            {del && (
                <ConfirmDialog title={`Delete ${del.code} ${del.name}?`} message="It is removed from this nature's default chart. Charts of account already created for clients are not changed."
                    confirmLabel="Delete" onCancel={() => setDel(null)} onConfirm={remove} />
            )}
        </>
    );
}

function NatureCoaForm({ nob, edit, rows, types, onClose, onSaved }) {
    const notify = useToast();
    const [v, setV] = useState(edit.values);
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const set = (k, x) => { setV((o) => ({ ...o, [k]: x })); setErrors((o) => ({ ...o, [k]: undefined })); };

    const save = async (e) => {
        e.preventDefault();
        const miss = {};
        if (!/^\d{3,10}$/.test(String(v.code).trim())) miss.code = "Numbers only (e.g. 61500).";
        if (!String(v.name).trim()) miss.name = "Enter the account name.";
        if (Object.keys(miss).length) return setErrors(miss);
        setBusy(true);
        try {
            const res = await apiFetch(edit.code ? `/nature-coa/${nob}/${encodeURIComponent(edit.code)}` : `/nature-coa/${nob}`, {
                method: edit.code ? "PUT" : "POST", body: JSON.stringify({ ...v, code: String(v.code).trim(), name: String(v.name).trim() }),
            });
            onSaved(res);
        } catch (err) {
            if (err.errors) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, m]) => [k, Array.isArray(m) ? m[0] : m])));
            notify(err.message || "Couldn't save.", "error");
            setBusy(false);
        }
    };

    return (
        <Modal title={edit.code ? `Edit ${edit.code}` : v.parent ? `Add sub-account under ${v.parent}` : "Add account"} onClose={busy ? () => { } : onClose} size="md"
            footer={<>
                <button className="btn btn-dark" onClick={onClose} disabled={busy}>Close</button>
                <button className="btn btn-primary" type="submit" form="ncoa-form" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </>}>
            <form id="ncoa-form" className="cmf-form" onSubmit={save}>
                <Field label="Account code *" error={errors.code} full><input className="input mono" value={v.code} onChange={(e) => set("code", e.target.value)} autoFocus /></Field>
                <Field label="Account name *" error={errors.name} full><input className="input" value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={255} /></Field>
                <Field label="Type *" error={errors.type} full>
                    <select className="input" value={v.type} onChange={(e) => set("type", e.target.value)}>{types.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                </Field>
                <Field label="Parent account" error={errors.parent} full>
                    <select className="input" value={v.parent || ""} onChange={(e) => set("parent", e.target.value)}>
                        <option value="">— None (top level) —</option>
                        {rows.filter((r) => r.code !== edit.code).map((r) => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}
                    </select>
                </Field>
                <Field label="Used in" full>
                    <div className="ncoa-flags">
                        {COA_FLAGS.map(([k, l]) => (
                            <label key={k}><input type="checkbox" checked={!!v[k]} onChange={(e) => set(k, e.target.checked)} /> {l}</label>
                        ))}
                    </div>
                </Field>
            </form>
        </Modal>
    );
}

/* ---------- numbered pages: Previous 1 … 4 5 6 … 19 Next (the server returns one page at a time) ---------- */
function pageList(page, last) {
    const set = new Set([1, last, page - 1, page, page + 1]);
    if (page <= 3) [2, 3, 4].forEach((n) => set.add(n));
    if (page >= last - 2) [last - 1, last - 2, last - 3].forEach((n) => set.add(n));
    const nums = [...set].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
    const out = [];
    nums.forEach((n, i) => {
        if (i && n - nums[i - 1] > 1) out.push(n - nums[i - 1] === 2 ? n - 1 : `gap${n}`);
        out.push(n);
    });
    return out;
}

function Pager({ page, last, onPage, disabled }) {
    const go = (n) => { if (n >= 1 && n <= last && n !== page) onPage(n); };
    return (
        <nav className="cmf-pages" aria-label="Pagination">
            <button className="cmf-pg cmf-pg-wide" onClick={() => go(page - 1)} disabled={disabled || page <= 1}>Previous</button>
            {pageList(page, last).map((n) => (typeof n === "string"
                ? <span key={n} className="cmf-gap" aria-hidden="true">…</span>
                : <button key={n} className={`cmf-pg${n === page ? " is-on" : ""}`} onClick={() => go(n)} disabled={disabled && n !== page}
                    aria-current={n === page ? "page" : undefined}>{n}</button>))}
            <button className="cmf-pg cmf-pg-wide" onClick={() => go(page + 1)} disabled={disabled || page >= last}>Next</button>
        </nav>
    );
}

/* ---------- add / edit / delete (old modal_* + doSaveComplex / doDeleteMasterFile) ---------- */
function MasterFileForm({ file, form, onClose, onDone }) {
    const notify = useToast();
    const [values, setValues] = useState(form.values);
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const set = (k, v) => { setValues((x) => ({ ...x, [k]: v })); setErrors((x) => ({ ...x, [k]: undefined })); };

    const save = async (e) => {
        e.preventDefault();
        const miss = Object.fromEntries(file.fields.filter((f) => f.required && !String(values[f.key] ?? "").trim()).map((f) => [f.key, `${f.label} is required.`]));
        if (Object.keys(miss).length) return setErrors(miss);
        setBusy(true);
        try {
            const r = await apiFetch(form.id ? `/client-master-files/${file.key}/${form.id}` : `/client-master-files/${file.key}`, {
                method: form.id ? "PUT" : "POST",
                body: JSON.stringify(values),
            });
            onDone(r.message || "Saved successfully");
        } catch (err) {
            if (err.errors) setErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
            notify(err.message || "Couldn't save.", "error");
            setBusy(false);
        }
    };

    const remove = async () => {
        setBusy(true);
        try {
            const r = await apiFetch(`/client-master-files/${file.key}/${form.id}`, { method: "DELETE" });
            onDone(r.message || "Deleted successfully");
        } catch (err) {
            notify(err.message || "Couldn't delete.", "error");
            setConfirm(false);
            setBusy(false);
        }
    };

    const hasRich = file.fields.some((f) => f.type === "rich");

    return (
        <>
            <Modal title={`${form.id ? "Edit" : "Add"} ${file.label.toLowerCase()}`} onClose={busy ? () => { } : onClose} size={hasRich ? "lg" : "md"}
                footer={<>
                    {form.id && <button className="btn btn-danger cmf-del" onClick={() => setConfirm(true)} disabled={busy}>Delete</button>}
                    <button className="btn btn-dark" onClick={onClose} disabled={busy}>Close</button>
                    <button className="btn btn-primary" type="submit" form="cmf-form" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
                </>}>
                <form id="cmf-form" className="cmf-form" onSubmit={save}>
                    {file.fields.map((f) => (
                        <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} error={errors[f.key]} full>
                            {f.type === "select" ? (
                                <select className="input" value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                                    <option value="">— Select —</option>
                                    {(f.options || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                            ) : f.type === "textarea" ? (
                                <textarea className="input" rows={6} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                            ) : f.type === "rich" ? (
                                <RichText value={values[f.key] ?? ""} onChange={(v) => set(f.key, v)} label={f.label} />
                            ) : (
                                <input className="input" value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} maxLength={255} autoFocus={f === file.fields.find((x) => x.type === "text")} />
                            )}
                        </Field>
                    ))}
                </form>
            </Modal>
            {confirm && (
                <ConfirmDialog title={`Delete this ${file.label.toLowerCase()}?`} message="Are you sure you want to delete this record? You can't undo this."
                    confirmLabel="Delete" onCancel={() => setConfirm(false)} onConfirm={remove} />
            )}
        </>
    );
}

/* small rich-text box (old Quill: heading, bold, italic, underline, strike, lists, align) — no extra package */
const TOOLS = [
    ["formatBlock", "h2", "H"], ["formatBlock", "p", "¶"], null,
    ["bold", null, "B"], ["italic", null, "I"], ["underline", null, "U"], ["strikeThrough", null, "S"], null,
    ["insertOrderedList", null, "1."], ["insertUnorderedList", null, "•"], null,
    ["justifyLeft", null, "⇤"], ["justifyCenter", null, "↔"], ["justifyRight", null, "⇥"],
];
function RichText({ value, onChange, label }) {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || "";
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const run = (cmd, arg) => {
        ref.current?.focus();
        document.execCommand(cmd, false, arg);
        onChange(ref.current?.innerHTML || "");
    };
    return (
        <div className="cmf-rich">
            <div className="cmf-rich-bar" role="toolbar" aria-label={`${label} formatting`}>
                {TOOLS.map((t, i) => t
                    ? <button key={i} type="button" className="cmf-rich-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => run(t[0], t[1])} title={t[0]}>{t[2]}</button>
                    : <span key={i} className="cmf-rich-sep" />)}
            </div>
            <div ref={ref} className="cmf-rich-area" contentEditable suppressContentEditableWarning aria-label={label}
                onInput={(e) => onChange(e.currentTarget.innerHTML)} />
        </div>
    );
}