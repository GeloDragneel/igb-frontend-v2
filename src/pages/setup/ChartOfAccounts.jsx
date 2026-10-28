import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../../components/Toast";
import SearchCard from "../../components/SearchCard";
import Modal, { Field } from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import SearchSelect from "../../components/SearchSelect";
import RowMenu from "../../components/RowMenu";
import Icon from "../../components/Icons";
import { ACCOUNT_TYPES } from "../../data/sampleData";
import { apiFetch, useAuth } from "../../context/AuthContext";
import { useLookups } from "../../context/LookupsContext";

// Debit-normal types; the rest are credit-normal
const DEBIT_TYPES = ["Asset", "Expense", "Cost of Sales"];
const normalBalance = (type) => (DEBIT_TYPES.some((t) => String(type).toLowerCase().includes(t.toLowerCase())) ? "Debit" : "Credit");

const TYPE_TONE = {
    Asset: "blue", Liability: "orange", Equity: "purple", Revenue: "green", "Cost of Sales": "red", Expense: "red",
};

const EXPANDED_KEY = "bizdesk-coa-expanded";
const byNum = (x, y) => x.code.localeCompare(y.code, undefined, { numeric: true });

/* =========================================================
   Page: /setup/chart-of-accounts
   ========================================================= */
export default function ChartOfAccounts() {
    const { user } = useAuth();
    const { refresh: refreshLookups } = useLookups();
    const notify = useToast();

    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [query, setQuery] = useState("");
    const [type, setType] = useState("");
    const [form, setForm] = useState(null); // { record } or { parent }
    const [confirm, setConfirm] = useState(null); // account to delete

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            setAccounts(await apiFetch("/accounts"));
        } catch (e) {
            setLoadError(e.message || "Couldn't load the chart of accounts.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load, user?.id, user?.caid]);

    /* ---------- tree structure ---------- */
    const byCode = useMemo(() => Object.fromEntries(accounts.map((a) => [a.code, a])), [accounts]);

    const children = useMemo(() => {
        const map = {};
        accounts.forEach((a) => {
            const key = a.parent && byCode[a.parent] ? a.parent : "__root";
            (map[key] ??= []).push(a);
        });
        Object.values(map).forEach((list) => list.sort(byNum));
        return map;
    }, [accounts, byCode]);

    const descendants = (code) => {
        const out = [];
        const walk = (c) => (children[c] || []).forEach((k) => { out.push(k.code); walk(k.code); });
        walk(code);
        return out;
    };

    // type filter options: the standard list + whatever is in the data
    const typeOptions = useMemo(() => {
        const set = new Set([...ACCOUNT_TYPES, ...accounts.map((a) => a.type).filter(Boolean)]);
        return [...set];
    }, [accounts]);

    /* ---------- expand / collapse (remembered) ---------- */
    const [expanded, setExpanded] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(EXPANDED_KEY));
            if (Array.isArray(saved)) return new Set(saved);
        } catch { /* ignore */ }
        return new Set();
    });

    useEffect(() => {
        try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded])); } catch { /* ignore */ }
    }, [expanded]);

    const toggle = (code) =>
        setExpanded((s) => {
            const n = new Set(s);
            n.has(code) ? n.delete(code) : n.add(code);
            return n;
        });

    /* ---------- search / filter ---------- */
    const q = query.trim().toLowerCase();
    const filtering = !!(q || type);

    const visibleSet = useMemo(() => {
        if (!filtering) return null;
        const set = new Set();
        accounts.forEach((a) => {
            const hit =
                (!q || `${a.code} ${a.name} ${a.description || ""}`.toLowerCase().includes(q)) &&
                (!type || a.type === type);
            if (!hit) return;
            let cur = a;
            const seen = new Set();
            while (cur && !seen.has(cur.code)) {
                seen.add(cur.code);
                set.add(cur.code);
                cur = cur.parent ? byCode[cur.parent] : null;
            }
        });
        return set;
    }, [accounts, byCode, q, type, filtering]);

    const rows = useMemo(() => {
        const out = [];
        const walk = (parentKey, level, guides) => {
            const list = (children[parentKey] || []).filter((a) => !visibleSet || visibleSet.has(a.code));
            list.forEach((a, i) => {
                const last = i === list.length - 1;
                const kids = (children[a.code] || []).filter((k) => !visibleSet || visibleSet.has(k.code));
                const isOpen = filtering ? true : expanded.has(a.code);
                out.push({ a, level, last, guides, hasKids: kids.length > 0, isOpen });
                if (kids.length && isOpen && level < 20) walk(a.code, level + 1, [...guides, !last]);
            });
        };
        walk("__root", 0, []);
        return out;
    }, [children, expanded, visibleSet, filtering]);

    const matches = (a) => q && `${a.code} ${a.name}`.toLowerCase().includes(q);

    /* ---------- delete ---------- */
    const askDelete = (a) => {
        if ((children[a.code] || []).length) {
            notify(`${a.code} has sub-accounts. Move or delete them first.`, "error");
            return;
        }
        setConfirm(a);
    };

    const doDelete = async () => {
        try {
            const res = await apiFetch(`/accounts/${encodeURIComponent(confirm.code)}`, { method: "DELETE" });
            notify(res.message);
            setConfirm(null);
            load();
            refreshLookups?.();
        } catch (e) {
            notify(e.message || "Couldn't delete the account.", "error");
            setConfirm(null);
        }
    };

    /* ---------- counts ---------- */
    const counts = useMemo(() => {
        const c = { total: accounts.length, posting: 0, groups: 0 };
        accounts.forEach((a) => (a.isGroup ? c.groups++ : c.posting++));
        return c;
    }, [accounts]);

    /* ---------- Export Excel: the tree as it is (search / type filter applied), headers bold, sub-accounts indented ---------- */
    const [exporting, setExporting] = useState(false);
    const exportExcel = async () => {
        if (!accounts.length) return notify("No accounts to export.", "error");
        setExporting(true);
        try {
            const ExcelJS = (await import("exceljs")).default;
            const wb = new ExcelJS.Workbook();
            wb.creator = "IGB";
            wb.created = new Date();
            const ws = wb.addWorksheet("Chart of Accounts", {
                views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
                pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" },
            });
            ws.columns = [
                { key: "code", width: 12 }, { key: "name", width: 46 }, { key: "type", width: 16 }, { key: "normal", width: 15 },
                { key: "kind", width: 11 }, { key: "parent", width: 12 }, { key: "used", width: 26 }, { key: "description", width: 40 },
            ];

            // title
            const company = user?.business_name || user?.trade_name || "";
            ws.mergeCells("A1:H1");
            ws.getCell("A1").value = company ? `${company} – Chart of Accounts` : "Chart of Accounts";
            ws.getCell("A1").font = { bold: true, size: 14 };
            ws.mergeCells("A2:H2");
            ws.getCell("A2").value = `${counts.total} accounts · ${counts.groups} headers · ${counts.posting} posting accounts`
                + (filtering ? ` · filtered${q ? ` "${query.trim()}"` : ""}${type ? ` · ${type}` : ""}` : "")
                + ` · exported ${new Date().toLocaleString("en-PH")}`;
            ws.getCell("A2").font = { size: 10, color: { argb: "FF64748B" } };

            // header row
            const head = ws.getRow(4);
            head.values = ["Code", "Account Name", "Type", "Normal Balance", "Kind", "Parent", "Used in", "Description"];
            head.height = 20;
            head.eachCell((c) => {
                c.font = { bold: true, color: { argb: "FFFFFFFF" } };
                c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
                c.alignment = { vertical: "middle" };
                c.border = { bottom: { style: "thin", color: { argb: "FF1E3A8A" } } };
            });

            // rows: walk the tree (only what the search / filter shows)
            let r = 5;
            const walk = (key, level) => (children[key] || []).filter((a) => !visibleSet || visibleSet.has(a.code)).forEach((a) => {
                const used = [a.is_sales && "Sales", a.is_purchases && "Purchases", a.is_expenses && "Expenses", a.is_for_paid && "Payments"].filter(Boolean).join(", ");
                const row = ws.getRow(r++);
                row.values = [a.code, a.name, a.type || "", normalBalance(a.type), a.isGroup ? "Header" : "Posting", a.parent || "", used, a.description || ""];
                row.getCell(1).alignment = { horizontal: "left" };
                row.getCell(2).alignment = { indent: Math.min(level * 2, 15) };
                if (a.isGroup) {
                    row.font = { bold: true };
                    if (level === 0) row.eachCell({ includeEmpty: true }, (c, n) => {
                        if (n <= 8) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
                    });
                }
                row.eachCell({ includeEmpty: true }, (c, n) => {
                    if (n <= 8) c.border = { bottom: { style: "hair", color: { argb: "FFCBD5E1" } } };
                });
                walk(a.code, level + 1);
            });
            walk("__root", 0);
            ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, r - 1), column: 8 } };

            const buf = await wb.xlsx.writeBuffer();
            const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
            const name = `Chart-of-Accounts${company ? `-${company.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}` : ""}.xlsx`;
            const link = Object.assign(document.createElement("a"), { href: url, download: name });
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            notify(`Downloaded ${name}`);
        } catch (e) {
            notify(e.message || "Couldn't make the Excel file.", "error");
        } finally {
            setExporting(false);
        }
    };

    return (
        <>
            <SearchCard
                query={query} setQuery={setQuery} placeholder="Search code or account name..."
                extra={
                    <div style={{ width: 190 }}>
                        <SearchSelect
                            value={type}
                            onChange={setType}
                            options={[{ value: "", label: "All types" }, ...typeOptions.map((t) => ({ value: t, label: t }))]}
                            aria-label="Filter by type"
                        />
                    </div>
                }
                actions={[
                    { label: exporting ? "Exporting…" : "Export Excel", icon: "download", onClick: exportExcel, disabled: exporting || loading },
                    { label: "Add Account", icon: "plus", variant: "primary", onClick: () => setForm({ parent: null }) },
                ]}
                sticky
            />

            {loadError && (
                <div className="alert-error" role="alert">
                    {loadError} <button className="btn btn-sm" onClick={load}>Try again</button>
                </div>
            )}

            <section className="card coa-card">
                <div className="coa-summary">
                    <span><strong>{counts.total}</strong> accounts</span>
                    <span><strong>{counts.groups}</strong> headers</span>
                    <span><strong>{counts.posting}</strong> posting accounts</span>
                    {filtering && <span className="coa-filter-note">Showing matches and their parent accounts</span>}
                </div>

                <div className="table-scroll">
                    <table className="coa-table" role="treegrid" aria-label="Chart of accounts">
                        <thead>
                            <tr>
                                <th>Account</th>
                                <th>Type</th>
                                <th>Normal Balance</th>
                                <th>Kind</th>
                                <th>Used in</th>
                                <th className="ta-center">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading &&
                                Array.from({ length: 8 }).map((_, i) => (
                                    <tr key={i}>
                                        {Array.from({ length: 6 }).map((__, c) => (
                                            <td key={c}><span className="sk sk-cell" style={{ width: c === 0 ? "70%" : "50%" }} /></td>
                                        ))}
                                    </tr>
                                ))}

                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="empty">
                                        <div>{accounts.length ? "No accounts match your search." : "No accounts yet."}</div>
                                        {filtering && (
                                            <button className="btn btn-sm" onClick={() => { setQuery(""); setType(""); }}>
                                                Clear search and filters
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )}

                            {!loading && rows.map(({ a, level, last, guides, hasKids, isOpen }) => (
                                <tr
                                    key={a.code}
                                    aria-level={level + 1}
                                    aria-expanded={hasKids ? isOpen : undefined}
                                    className={`coa-row lvl-${Math.min(level, 3)} ${a.isGroup ? "is-group" : ""} ${matches(a) ? "is-match" : ""}`}
                                >
                                    <td className="coa-name-cell">
                                        <div className="coa-name">
                                            {guides.map((g, i) => <span key={i} className={`tree-guide ${g ? "line" : ""}`} />)}
                                            {level > 0 && <span className={`tree-elbow ${last ? "last" : ""}`} />}

                                            {hasKids ? (
                                                <button
                                                    className="tree-toggle"
                                                    onClick={() => toggle(a.code)}
                                                    disabled={filtering}
                                                    aria-label={`${isOpen ? "Collapse" : "Expand"} ${a.name}`}
                                                >
                                                    <Icon name={isOpen ? "down" : "chevron"} size={14} />
                                                </button>
                                            ) : (
                                                <span className="tree-toggle placeholder" />
                                            )}

                                            <span className={`coa-icon ${a.isGroup ? "group" : ""}`}>
                                                <Icon name={a.isGroup ? "folder" : "fileText"} size={15} />
                                            </span>
                                            <span className="coa-code">{a.code}</span>
                                            <button
                                                className="coa-title"
                                                onClick={() => (hasKids && !filtering ? toggle(a.code) : setForm({ record: a }))}
                                                title={a.description || undefined}
                                            >
                                                {a.name}
                                            </button>
                                            {hasKids && <span className="coa-count">{(children[a.code] || []).length}</span>}
                                        </div>
                                    </td>
                                    <td><span className={`badge badge-${TYPE_TONE[a.type] || "gray"}`}>{a.type || "—"}</span></td>
                                    <td className={normalBalance(a.type) === "Debit" ? "dr" : "cr"}>{normalBalance(a.type)}</td>
                                    <td className="muted">{a.isGroup ? "Header" : "Posting"}</td>
                                    <td className="coa-flags">
                                        {a.is_sales && <span className="badge badge-green">Sales</span>}
                                        {a.is_purchases && <span className="badge badge-blue">Purchases</span>}
                                        {a.is_expenses && <span className="badge badge-orange">Expenses</span>}
                                        {a.is_for_paid && <span className="badge badge-teal">Paid</span>}
                                    </td>
                                    <td className="ta-center">
                                        <RowMenu
                                            extra={[{ label: "Add sub-account", onClick: () => setForm({ parent: a.code }) }]}
                                            onEdit={() => setForm({ record: a })}
                                            onDelete={() => askDelete(a)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {form && (
                <AccountForm
                    record={form.record}
                    defaultParent={form.parent}
                    accounts={accounts}
                    byCode={byCode}
                    typeOptions={typeOptions}
                    childrenOf={(code) => children[code] || []}
                    descendants={descendants}
                    onClose={() => setForm(null)}
                    onSave={async (acc) => {
                        const res = form.record
                            ? await apiFetch(`/accounts/${encodeURIComponent(form.record.code)}`, { method: "PUT", body: JSON.stringify(acc) })
                            : await apiFetch("/accounts", { method: "POST", body: JSON.stringify(acc) });
                        if (acc.parent) setExpanded((s) => new Set(s).add(acc.parent)); // show the new account
                        notify(res.message);
                        setForm(null);
                        load();
                        refreshLookups?.(); // invoice dropdowns pick up the change
                    }}
                />
            )}

            {confirm && (
                <ConfirmDialog
                    title={`Delete ${confirm.code} – ${confirm.name}?`}
                    message="You can't undo this."
                    onCancel={() => setConfirm(null)}
                    onConfirm={doDelete}
                />
            )}
        </>
    );
}

/* =========================================================
   Add / edit form  (also used by BIR Return → File & submit → "+ New account")
   ========================================================= */
export function AccountForm({ record, defaultParent, defaultName = "", accounts, byCode, typeOptions, childrenOf, descendants, onClose, onSave }) {
    const parentAcc = defaultParent ? byCode[defaultParent] : null;

    const [f, setF] = useState(() =>
        record
            ? {
                code: record.code,
                name: record.name || "",
                type: record.type || "Asset",
                parent: record.parent || "",
                description: record.description || "",
                is_sales: !!record.is_sales,
                is_purchases: !!record.is_purchases,
                is_expenses: !!record.is_expenses,
                is_for_paid: !!record.is_for_paid,
            }
            : {
                code: suggestCode(defaultParent, accounts, childrenOf),
                name: defaultName,
                type: parentAcc?.type || "Asset",
                parent: defaultParent || "",
                description: "",
                is_sales: !!parentAcc?.is_sales,
                is_purchases: !!parentAcc?.is_purchases,
                is_expenses: !!parentAcc?.is_expenses,
                is_for_paid: false,
            }
    );
    const [errors, setErrors] = useState({});
    const [saveError, setSaveError] = useState("");
    const [saving, setSaving] = useState(false);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

    // Parent choices: any account except itself and its own sub-accounts
    const blocked = record ? new Set([record.code, ...descendants(record.code)]) : new Set();
    const parentOptions = [
        { value: "", label: "— None (top level) —" },
        ...accounts
            .filter((a) => !blocked.has(a.code))
            .sort(byNum)
            .map((a) => ({ value: a.code, label: `${a.code} - ${a.name}`, hint: a.type })),
    ];

    const pickParent = (code) => {
        const p = byCode[code];
        setF((x) => ({ ...x, parent: code, type: p ? p.type : x.type })); // sub-accounts inherit the type
    };

    const submit = async () => {
        const e = {};
        const code = String(f.code).trim();
        if (!code) e.code = "Enter an account code.";
        else if (!/^[0-9A-Za-z.-]+$/.test(code)) e.code = "Use numbers, letters, dots or dashes only.";
        else if (!record && byCode[code]) e.code = `${code} already exists.`;
        if (!f.name.trim()) e.name = "Enter the account name.";
        if (!f.type) e.type = "Choose a type.";
        setErrors(e);
        if (Object.keys(e).length) return;

        setSaving(true);
        setSaveError("");
        try {
            await onSave({
                ...f,
                code,
                name: f.name.trim(),
                parent: f.parent || null,
                description: f.description.trim() || null,
            });
        } catch (err) {
            setSaveError(err.message || "Couldn't save the account.");
            setSaving(false);
        }
    };

    const willBeHeader = !f.parent || (record && childrenOf(record.code).length > 0);

    return (
        <Modal
            title={record ? `Edit ${record.code}` : parentAcc ? `Add sub-account under ${parentAcc.code}` : "Add Account"}
            onClose={onClose}
            footer={
                <>
                    <button className="btn" onClick={onClose} disabled={saving}>Close</button>
                    <button className="btn btn-primary" onClick={submit} disabled={saving}>
                        {saving ? "Saving…" : record ? "Save changes" : "Add account"}
                    </button>
                </>
            }
        >
            {saveError && <div className="alert-error" role="alert">{saveError}</div>}
            <div className="form-grid">
                <Field label="Account code" error={errors.code} hint={record ? "The code can't be changed after it's created." : undefined}>
                    <input className="input" value={f.code} onChange={(e) => set("code", e.target.value)} readOnly={!!record} />
                </Field>
                <div className="field">
                    <span className="field-label">Kind</span>
                    <input className="input" readOnly value={willBeHeader ? "Header" : "Posting"} />
                    <div className="field-hint">Top-level accounts and accounts with sub-accounts are headers.</div>
                </div>

                <Field label="Account name" error={errors.name} full>
                    <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Cash in Bank - BDO" />
                </Field>

                <div className="field full">
                    <span className="field-label">Parent account</span>
                    <SearchSelect value={f.parent} onChange={pickParent} options={parentOptions} searchPlaceholder="Search accounts..." aria-label="Parent account" />
                </div>

                <div className="field">
                    <span className="field-label">Type</span>
                    <SearchSelect
                        value={f.type}
                        onChange={(v) => set("type", v)}
                        options={typeOptions.map((t) => ({ value: t, label: t, hint: `Normal balance: ${normalBalance(t)}` }))}
                        aria-label="Type"
                    />
                    {errors.type && <div className="field-error">{errors.type}</div>}
                </div>
                <div className="field">
                    <span className="field-label">Normal balance</span>
                    <input className="input" readOnly value={normalBalance(f.type)} />
                </div>
                <Field label="Description" full>
                    <textarea className="input" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Optional" />
                </Field>
            </div>
        </Modal>
    );
}

// Next free code under a parent, e.g. 12103 -> 12104
function suggestCode(parent, accounts, childrenOf) {
    const kids = parent ? childrenOf(parent) : [];
    const nums = kids.map((k) => Number(k.code)).filter((n) => !isNaN(n));
    const taken = new Set(accounts.map((a) => a.code));
    if (nums.length) {
        let n = Math.max(...nums) + 1;
        while (taken.has(String(n))) n++;
        return String(n);
    }
    if (parent && /^\d+$/.test(parent)) {
        let n = Number(parent) + 1;
        while (taken.has(String(n))) n++;
        return String(n);
    }
    return "";
}