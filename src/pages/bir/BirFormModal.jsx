import { useEffect, useMemo, useState } from "react";
import Modal from "../../components/Modal";
import SearchSelect from "../../components/SearchSelect";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../context/AuthContext";
import { buildXml } from "./birForms";
import { BirCtx, LAYOUTS } from "./birLayouts";
import { AccountForm } from "../setup/ChartOfAccounts";
import { ACCOUNT_TYPES } from "../../data/sampleData";
import { useLookups } from "../../context/LookupsContext";
import "./BirFiling.css";

export default function BirFormModal({ form, initial, autofill, lookups, onClose, onSaved }) {
    const notify = useToast();
    const [vals, setVals] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [filling, setFilling] = useState(false);
    const [page, setPage] = useState(0);

    const pages = LAYOUTS[form.id] || [];
    const Page = pages[page];

    // change → form rules → recompute totals
    const apply = (patch) =>
        setVals((v) => {
            let n = { ...v, ...patch };
            if (form.onChange) n = { ...n, ...form.onChange(patch, n) };
            return { ...n, ...(form.compute ? form.compute(n) : {}) };
        });

    const af = (type, params) => apiFetch(`/bir/autofill?${new URLSearchParams({ type, ...params })}`);

    const fill = async (current) => {
        if (!form.autofill) return;
        setFilling(true);
        try {
            const patch = await form.autofill(current, af);
            if (patch) apply(patch);
        } catch (e) {
            notify(e.message || "Couldn't get the amounts from the books.", "error");
        } finally {
            setFilling(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (autofill) fill(initial); }, []);

    const save = async () => {
        const err = form.validate?.(vals);
        if (err) return notify(err, "error");
        setSaving(true);
        try {
            const res = await apiFetch("/bir/files", {
                method: "POST",
                body: JSON.stringify({ filename: form.filename(vals), content: buildXml(form, vals) }),
            });
            notify(`Saved ${res.filename}`);
            onSaved(res.filename);
        } catch (e) {
            notify(e.message || "Couldn't save the file.", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            title={form.title.toUpperCase()}
            onClose={onClose}
            size="xxlg"
            footer={
                <div className="bf-footer">
                    <div className="bf-pager">
                        {pages.length > 1 && (
                            <>
                                <button className="btn btn-sm" onClick={() => setPage((x) => Math.max(0, x - 1))} disabled={page === 0}>Prev</button>
                                <span className="bf-page">{page + 1} / {pages.length}</span>
                                <button className="btn btn-sm" onClick={() => setPage((x) => Math.min(pages.length - 1, x + 1))} disabled={page === pages.length - 1}>Next</button>
                            </>
                        )}
                    </div>
                    <div className="bf-actions">
                        <button className="btn" onClick={onClose}>Close</button>
                        {form.autofill && (
                            <button className="btn" onClick={() => fill(vals)} disabled={filling}>
                                {filling ? "Getting amounts…" : "Get amounts from books"}
                            </button>
                        )}
                        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                    </div>
                </div>
            }
        >
            <BirCtx.Provider value={{ vals, apply, lookups }}>
                <div className="bf-wrap">{Page ? <Page /> : <p>No layout for this form.</p>}</div>
            </BirCtx.Provider>
        </Modal>
    );
}

/* =====================================================================
   FILE & SUBMITTED (ENTRY FOR BIR RETURN) → Expenses bill, paid later with Pay Bill
   Amounts are automatic (from the saved return); only the accounts can be picked.
   An account the chart doesn't have can be added on the spot ("Add new").
   The tax payable line is the bill: debit − other credits, so the entry always balances.
   ===================================================================== */
const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SOURCE = {
    file: { tone: "ok", text: "From the saved return" },
    books: { tone: "warn", text: "From your books (return is empty)" },
    none: { tone: "bad", text: "No amounts found" },
};
const RECON = {
    reconciled: { tone: "ok", text: "Reconciled", sub: "Return amounts are the same as the books" },
    not_reconciled: { tone: "bad", text: "Not reconciled", sub: "Return amounts are different from the books" },
    no_books: { tone: "warn", text: "No books amount", sub: "This return has nothing to compare in the books" },
};
let lineKey = 0;

export function BirFilingModal({ filename, title, onClose, onDone }) {
    const notify = useToast();
    const [data, setData] = useState(null);
    const [lines, setLines] = useState([]);
    const [f, setF] = useState({ date: "", declared_month: "", remarks: "", item_id: "" });
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [adding, setAdding] = useState(null);   // { key, name, kind } → Charts of Account "Add Account" popup
    const [coa, setCoa] = useState(null);         // /accounts (same list as Setup → Charts of Account)
    const lookups = useLookups?.() || {};

    useEffect(() => {
        let alive = true;
        apiFetch(`/bir/filing/${encodeURIComponent(filename)}`)
            .then((d) => {
                if (!alive) return;
                setData(d);
                setLines(d.lines.map((l) => ({ ...l, key: ++lineKey })));
                setF({ date: d.date, declared_month: d.declared_month, remarks: "", item_id: d.item_id ? String(d.item_id) : "" });
            })
            .catch((e) => alive && setError(e.message || "Couldn't load the entry."));
        return () => { alive = false; };
    }, [filename]);

    const itemOpts = useMemo(() => [{ value: "", label: "— Select item —" },
    ...(data?.items || []).map((i) => ({ value: String(i.id), label: i.name || `Item ${i.id}`, hint: `#${i.id}` }))], [data]);
    const noDefaultItem = data && !data.item_id;

    const accOpts = useMemo(() => [{ value: "", label: "— Select account —" },
    ...(data?.accounts || []).map((a) => ({ value: a.account_code, label: a.account_name, hint: a.account_code }))], [data]);

    const set = (key, k, v) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));

    // "+ New account" → the same Add Account popup as Setup → Charts of Account
    const openNew = async (l) => {
        try {
            const list = coa || await apiFetch("/accounts");
            setCoa(list);
            setAdding({ key: l.key, name: l.label, kind: l.kind || 1 });
        } catch (e) {
            notify(e.message || "Couldn't load the chart of accounts.", "error");
        }
    };
    const coaTree = useMemo(() => {
        const list = coa || [];
        const byCode = Object.fromEntries(list.map((a) => [a.code, a]));
        const kids = {};
        list.forEach((a) => { if (a.parent && byCode[a.parent]) (kids[a.parent] ??= []).push(a); });
        const descendants = (code) => {
            const out = [];
            const walk = (c) => (kids[c] || []).forEach((k) => { out.push(k.code); walk(k.code); });
            walk(code);
            return out;
        };
        const typeOptions = [...new Set([...ACCOUNT_TYPES, ...list.map((a) => a.type).filter(Boolean)])];
        return { byCode, childrenOf: (c) => kids[c] || [], descendants, typeOptions };
    }, [coa]);
    // parent for the new account: the parent of the most similar existing account of the same kind (1 asset · 2 liability · 6 expense)
    const suggestParent = (name, kind) => {
        const words = String(name).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
        let best = null, score = 0;
        (coa || []).filter((a) => !a.isGroup && a.parent && String(a.code).startsWith(String(kind))).forEach((a) => {
            const n = String(a.name).toLowerCase();
            const sc = words.filter((w) => n.includes(w)).length;
            if (sc > score) { best = a; score = sc; }
        });
        return best?.parent || "";
    };
    const saveNewAccount = async (acc) => {
        const res = await apiFetch("/accounts", { method: "POST", body: JSON.stringify(acc) });
        setCoa((list) => [...(list || []), { ...acc, isGroup: false }]);
        setData((d) => ({
            ...d, accounts: d.accounts.some((a) => a.account_code === acc.code) ? d.accounts
                : [...d.accounts, { account_code: acc.code, account_name: acc.name }]
        }));
        set(adding.key, "account_code", acc.code);
        notify(res.message || `${acc.code} – ${acc.name} added`);
        lookups.refresh?.();
        setAdding(null);
    };

    const amt = (l) => Number(l.amount) || 0;
    const debits = lines.filter((l) => l.side === "dr");
    const credits = lines.filter((l) => l.side === "cr");
    const dr = debits.reduce((s, l) => s + amt(l), 0);
    const otherCr = credits.filter((l) => !l.bill).reduce((s, l) => s + amt(l), 0);
    const toPay = Math.round((dr - otherCr) * 100) / 100;          // the bill always balances the entry
    const billLine = credits.find((l) => l.bill);
    const ready = dr > 0 && toPay > 0;

    const save = async () => {
        setError("");
        if (!(dr > 0)) return setError("The return has no amount. Open it, fill it in and Save, then File & submit.");
        if (toPay <= 0) return setError("Credits are more than the debit, so there is nothing to pay.");
        const used = lines.filter((l) => l.bill || amt(l) > 0);
        if (used.some((l) => !l.account_code)) return setError("Pick or add an account on every line.");
        if (!f.item_id) return setError("Pick the item to use on the Expenses lines.");
        setSaving(true);
        try {
            const r = await apiFetch(`/bir/filing/${encodeURIComponent(filename)}`, {
                method: "POST",
                body: JSON.stringify({
                    ...f,
                    item_id: Number(f.item_id),
                    lines: used.map((l) => ({ side: l.side, account_code: l.account_code, amount: l.bill ? toPay : amt(l), bill: !!l.bill })),
                }),
            });
            notify(r.message || "Filed & submitted.");
            onDone?.();
        } catch (e) {
            setError(e.message || "Couldn't save.");
            setSaving(false);
        }
    };

    const missing = lines.filter((l) => (l.bill || amt(l) > 0) && !l.account_code).length;
    const noAmount = !(dr > 0);
    const blocked = noAmount || toPay <= 0 || missing > 0 || !f.item_id;

    const row = (l) => {
        const isMissing = !l.account_code;
        const value = l.bill ? Math.max(0, toPay) : amt(l);
        return (
            <tr key={l.key} className={`${l.bill ? "is-bill" : ""}${isMissing ? " is-missing" : ""}`}>
                <td className="bfl-c-side"><span className={`bfl-side is-${l.side}`}>{l.side === "dr" ? "DR" : "CR"}</span></td>
                <td className="bfl-c-what">
                    <b>{l.label || "—"}</b>
                    {l.bill && <em className="bfl-tag">To pay</em>}
                </td>
                <td className="bfl-c-acc">
                    <div className="bfl-pick">
                        <SearchSelect value={l.account_code} onChange={(v) => set(l.key, "account_code", v)} options={accOpts}
                            searchPlaceholder="Search account…" aria-label={`${l.label || "Line"} account`} />
                        {isMissing && (
                            <button type="button" className="btn btn-sm bfl-addnew" onClick={() => openNew(l)}
                                title={`Create “${l.label}” in Charts of Account`}>+ New account</button>
                        )}
                    </div>
                </td>
                <td className="bfl-c-amt"><span className={`bfl-amt${l.bill ? " is-auto" : ""}`}>{n2(value)}</span></td>
                <td className="bfl-c-books">
                    {l.books === null || l.books === undefined ? <span className="bfl-dim">—</span>
                        : <span className={`bfl-books ${l.match ? "is-ok" : "is-bad"}`}>{l.match ? "✓" : "≠"} {n2(l.books)}</span>}
                </td>
            </tr>
        );
    };

    const src = SOURCE[data?.source] || null;
    const recon = RECON[data?.reconcile?.status] || null;

    return (
        <Modal title={`File & submit · ${title}`} onClose={saving ? () => { } : onClose} size="xlg"
            footer={
                <div className="bfl-footbar">
                    <span className="bfl-footmsg">
                        {data && (noAmount ? <span className="bfl-src is-bad">The return has no amount — open it, fill it in and Save first</span>
                            : toPay <= 0 ? <span className="bfl-src is-bad">Credits are more than the debit — nothing to pay</span>
                                : missing > 0 ? <span className="bfl-src is-warn">{missing} line{missing === 1 ? "" : "s"} still need{missing === 1 ? "s" : ""} an account</span>
                                    : !f.item_id ? <span className="bfl-src is-warn">Pick the item</span>
                                        : <span className="bfl-src is-ok">Ready to file · entry is balanced</span>)}
                    </span>
                    <span className="bfl-footbtns">
                        <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
                        <button className="btn btn-primary" onClick={save} disabled={!data || saving || blocked}>
                            {saving ? "Saving…" : `File & submit${toPay > 0 ? ` · ₱${n2(toPay)}` : ""}`}
                        </button>
                    </span>
                </div>
            }>
            {!data && !error && <p className="bfl-muted">Loading…</p>}
            {error && <div className="alert-error" role="alert">{error}</div>}
            {data && (
                <div className="bfl">
                    {/* summary */}
                    <section className="bfl-summary">
                        <div className="bfl-sum-item">
                            <small>Return</small>
                            <b>{data.return_period}</b>
                            <span className="bfl-file" title={data.filename}>{data.filename}</span>
                        </div>
                        <div className="bfl-sum-item">
                            <small>Amounts</small>
                            {src ? <span className={`bfl-src is-${src.tone}`}>{src.text}</span> : <span className="bfl-dim">—</span>}
                        </div>
                        <div className="bfl-sum-item">
                            <small>Books check</small>
                            {recon ? (
                                <span className={`bfl-src is-${recon.tone}`} title={recon.sub}>
                                    {recon.text}{data.reconcile.status === "not_reconciled" ? ` · ₱${n2(data.reconcile.difference)} off` : ""}
                                </span>
                            ) : <span className="bfl-dim">—</span>}
                        </div>
                        <div className="bfl-sum-pay">
                            <small>Amount to pay</small>
                            <b>₱{n2(Math.max(0, toPay))}</b>
                        </div>
                    </section>

                    <div className="bfl-fields">
                        <label><span className="field-label">Date filed</span>
                            <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
                        <label><span className="field-label">Declared month</span>
                            <input type="month" className="input" value={f.declared_month} onChange={(e) => setF({ ...f, declared_month: e.target.value })} /></label>
                        <div className={`bfl-item${noDefaultItem && !f.item_id ? " is-missing" : ""}`}>
                            <span className="field-label">Item (Expenses lines)</span>
                            <SearchSelect value={f.item_id} onChange={(v) => setF({ ...f, item_id: v })} options={itemOpts}
                                searchPlaceholder="Search item…" aria-label="Item for the Expenses lines" />
                            {noDefaultItem && !f.item_id && <span className="bfl-hint is-missing">No “Various Expenses - VAT” item — pick one</span>}
                        </div>
                        <label><span className="field-label">Remarks</span>
                            <input className="input" maxLength={255} placeholder="FILE & SUBMITTED" value={f.remarks}
                                onChange={(e) => setF({ ...f, remarks: e.target.value })} /></label>
                    </div>

                    {/* entry */}
                    <section className="bfl-entry">
                        <table className="bfl-table">
                            <thead>
                                <tr><th /><th>Line</th><th>Account</th><th className="n">Amount</th><th className="n">Books</th></tr>
                            </thead>
                            <tbody>
                                {debits.map(row)}
                                {credits.map(row)}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={3}><span className="bfl-muted">Saved in Expenses as an unpaid bill · pay it later with <b>Pay</b> (Pay Bill)</span></td>
                                    <td className="n" colSpan={2}><span className="bfl-tot">DR {n2(dr)} · CR {n2(otherCr + Math.max(0, toPay))}</span></td>
                                </tr>
                            </tfoot>
                        </table>
                    </section>
                </div>
            )}
            {adding && coa && (
                <AccountForm
                    defaultParent={suggestParent(adding.name, adding.kind) || null}
                    defaultName={adding.name}
                    accounts={coa}
                    byCode={coaTree.byCode}
                    typeOptions={coaTree.typeOptions}
                    childrenOf={coaTree.childrenOf}
                    descendants={coaTree.descendants}
                    onClose={() => setAdding(null)}
                    onSave={saveNewAccount}
                />
            )}
        </Modal>
    );

}