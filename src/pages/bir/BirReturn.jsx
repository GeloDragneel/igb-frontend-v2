import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { useAuth, apiFetch } from "../../context/AuthContext";
import BirFormModal, { BirFilingModal } from "./BirFormModal";
import PayBillModal from "../../components/payments/PayBillModal";
import { FORMS, blank, fromFile, fromProfile } from "./birForms";
import "./BirReturn.css";

const STATUS = { not_filed: "Not filed", unpaid: "Filed · Unpaid", partial: "Filed · Partly paid", paid: "Filed · Paid" };
const peso = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// what each form is, in plain words
const META = {
    "0605": { code: "0605", name: "Payment Form", freq: "As needed", tone: "gray" },
    "0619E": { code: "0619-E", name: "Monthly Remittance – Expanded Withholding", freq: "Monthly", tone: "blue" },
    "1601C": { code: "1601-C", name: "Withholding Tax on Compensation", freq: "Monthly", tone: "blue" },
    "1601EQ": { code: "1601-EQ", name: "Quarterly Remittance – Expanded Withholding", freq: "Quarterly", tone: "violet" },
    "2550M": { code: "2550-M", name: "Monthly VAT Declaration", freq: "Monthly", tone: "blue" },
    "2550Qv2024": { code: "2550-Q", name: "Quarterly VAT Return", freq: "Quarterly", tone: "violet" },
    "2551Qv2018": { code: "2551-Q", name: "Quarterly Percentage Tax Return", freq: "Quarterly", tone: "violet" },
};

const PER_OPTIONS = [10, 25, 50, 0];          // 0 = All
/* 1 … 4 5 [6] 7 8 … 20 */
const pageNums = (page, pages) => {
    const out = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - page) <= 2) out.push(i);
        else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
};

const fmtTin = (t) => (t ? t.replace(/(\d{3})(\d{3})(\d{3})(\d{3})/, "$1-$2-$3-$4") : "");

function FileIcon() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
            <path d="M9 13h6M9 17h4" />
        </svg>
    );
}

/* =========================================================
   BIR & Tax → BIR Return
   ========================================================= */
export default function BirReturn() {
    const { user } = useAuth();
    const notify = useToast();

    const [formId, setFormId] = useState(FORMS[0].id);
    const [info, setInfo] = useState(null);
    const [lookups, setLookups] = useState({ atc2551q: [] });
    const [lists, setLists] = useState({}); // { [formId]: { files, missing, path, loading, error } }
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(null); // { form, initial, autofill }
    const [opening, setOpening] = useState("");    // file name being opened
    const [toDelete, setToDelete] = useState(null);
    const [formQuery, setFormQuery] = useState("");
    const [per, setPer] = useState(10); // 5 | 25 | 50 | 0 (All)
    const [filingFor, setFilingFor] = useState(null);  // file being filed & submitted
    const [payFor, setPayFor] = useState(null);        // { invoiceNo, accounts }
    const [payLoading, setPayLoading] = useState("");
    const [page, setPage] = useState(1);

    const form = FORMS.find((x) => x.id === formId);
    const meta = META[formId];
    const list = lists[formId] || { files: [], loading: true };

    useEffect(() => {
        apiFetch("/bir/profile").then(setInfo).catch(() => setInfo(null));
        apiFetch("/bir/atc-2551q").then((r) => setLookups({ atc2551q: r })).catch(() => { });
    }, [user?.id, user?.caid]);

    const loadOne = useCallback(async (fm) => {
        setLists((s) => ({ ...s, [fm.id]: { ...(s[fm.id] || { files: [] }), loading: true, error: "" } }));
        try {
            const r = await apiFetch(`/bir/files?form=${encodeURIComponent(fm.file)}`);
            setLists((s) => ({ ...s, [fm.id]: { ...r, loading: false, error: "" } }));
        } catch (e) {
            setLists((s) => ({ ...s, [fm.id]: { files: [], loading: false, error: e.message || "Couldn't load the saved files." } }));
        }
    }, []);

    // load every form once, so each item on the left can show its count
    useEffect(() => {
        FORMS.forEach(loadOne);
    }, [loadOne, user?.id, user?.caid]);

    const files = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (list.files || []).filter(
            (x) => !q || x.filename.toLowerCase().includes(q) || String(x.return_period).toLowerCase().includes(q)
        );
    }, [list.files, query]);

    // pagination of the saved files (5 / 25 / 50 / All)
    const pages = per ? Math.max(1, Math.ceil(files.length / per)) : 1;
    const curPage = Math.min(page, pages);
    const shownFiles = per ? files.slice((curPage - 1) * per, curPage * per) : files;
    useEffect(() => { setPage(1); }, [formId, query, per]);

    // search on the left list (code, name, frequency; dashes ignored)
    const shownForms = useMemo(() => {
        const norm = (s) => String(s).toLowerCase().replace(/[\s-]/g, "");
        const q = norm(formQuery);
        if (!q) return FORMS;
        return FORMS.filter((fm) => {
            const m = META[fm.id];
            return [m.code, fm.id, m.name, m.freq].some((x) => norm(x).includes(q));
        });
    }, [formQuery]);

    const pickForm = (id) => {
        setFormId(id);
        setQuery("");
    };

    const missingFolder = Object.values(lists).find((l) => l?.missing)?.path;

    /* ---------- actions ---------- */
    const newReturn = () => {
        let v = blank(form);
        v = { ...v, ...(form.defaults?.(new Date(), lookups) || {}) };
        v = { ...v, ...fromProfile(form, info?.profile) };
        v = { ...v, ...(form.compute?.(v) || {}) };
        setOpen({ form, initial: v, autofill: true });
    };

    const openFile = async (name) => {
        setOpening(name);
        try {
            const r = await apiFetch(`/bir/files/${encodeURIComponent(name)}`);
            setOpen({ form, initial: fromFile(form, r.data), autofill: false });
        } catch (e) {
            notify(e.message || "Couldn't open the file.", "error");
        } finally {
            setOpening("");
        }
    };

    // "Save As" window: the user picks the folder and file name (Chrome / Edge).
    // Other browsers: normal download (asks for a location only if the browser is set to ask).
    const download = async (name) => {
        let handle = null;
        if (window.showSaveFilePicker) {
            try {
                handle = await window.showSaveFilePicker({
                    suggestedName: name,
                    types: [{ description: "eBIRForms file", accept: { "application/xml": [".xml"] } }],
                });
            } catch (e) {
                if (e?.name === "AbortError") return;          // user pressed Cancel
                handle = null;                                  // picker not allowed → fall back below
            }
        }
        try {
            const r = await apiFetch(`/bir/files/${encodeURIComponent(name)}`);
            const blob = new Blob([r.content], { type: "application/xml" });
            if (handle) {
                const w = await handle.createWritable();
                await w.write(blob);
                await w.close();
                notify(`Saved ${handle.name}`);
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement("a"), { href: url, download: name });
            document.body.append(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            notify(e.message || "Couldn't download the file.", "error");
        }
    };

    // PAY → Pay Bill on the Expenses bill made when the return was filed
    const pay = async (x) => {
        setPayLoading(x.filename);
        try {
            const r = await apiFetch(`/bir/filing/${encodeURIComponent(x.filename)}`);
            setPayFor({ invoiceNo: x.filing.invoice_no, accounts: r.accounts || [] });
        } catch (e) {
            notify(e.message || "Couldn't open the bill.", "error");
        } finally {
            setPayLoading("");
        }
    };

    const tally = useMemo(() => (list.files || []).reduce((t, x) => ({ ...t, [x.status || "not_filed"]: (t[x.status || "not_filed"] || 0) + 1 }), {}), [list.files]);

    const remove = async () => {
        const name = toDelete;
        setToDelete(null);
        try {
            await apiFetch(`/bir/files/${encodeURIComponent(name)}`, { method: "DELETE" });
            notify("File deleted.");
            loadOne(form);
        } catch (e) {
            notify(e.message || "Couldn't delete the file.", "error");
        }
    };

    return (
        <section className="br-page">
            {/* ---------- taxpayer ---------- */}
            <header className="card br-taxpayer">
                <div>
                    <div className="br-eyebrow">BIR Return</div>
                    <h2 className="br-name">{info?.name || "\u00a0"}</h2>
                    <div className="br-sub">
                        {info?.tin && <span className="mono">TIN {fmtTin(info.tin)}</span>}
                        {info?.address && <span>{info.address}</span>}
                    </div>
                </div>
                {info?.source === "client" && (
                    <p className="br-hint">
                        No eBIRForms profile was found for this TIN, so details come from the client account. Check the RDO and ZIP code before saving.
                    </p>
                )}
            </header>

            {missingFolder && (
                <div className="alert-error" role="alert">
                    The eBIRForms folder wasn't found at {missingFolder}. It will be created when you save your first return.
                </div>
            )}

            <div className="br-layout">
                {/* ---------- left: forms ---------- */}
                <nav className="card br-side" aria-label="BIR returns">
                    <div className="br-side-head">Returns</div>

                    <div className="br-side-search">
                        <svg className="br-side-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m20 20-3.5-3.5" />
                        </svg>
                        <input
                            className="input"
                            type="text"
                            placeholder="Search returns"
                            value={formQuery}
                            onChange={(e) => setFormQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && shownForms[0]) pickForm(shownForms[0].id);
                                if (e.key === "Escape") setFormQuery("");
                            }}
                            aria-label="Search returns"
                        />
                        {formQuery && (
                            <button type="button" className="br-side-clear" onClick={() => setFormQuery("")} aria-label="Clear search">×</button>
                        )}
                    </div>

                    {shownForms.length === 0 ? (
                        <p className="br-side-empty">No return matches “{formQuery}”.</p>
                    ) : (
                        <ul className="br-side-list" role="tablist" aria-orientation="vertical">
                            {shownForms.map((fm) => {
                                const m = META[fm.id];
                                const l = lists[fm.id];
                                const count = l?.files?.length ?? 0;
                                const active = fm.id === formId;
                                return (
                                    <li key={fm.id}>
                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={active}
                                            className={`br-side-item ${active ? "is-active" : ""}`}
                                            onClick={() => pickForm(fm.id)}
                                        >
                                            <span className="br-side-top">
                                                <span className="br-side-code">{m.code}</span>
                                                <span className={`br-count ${count ? "" : "is-zero"}`}>{l?.loading ? "…" : count}</span>
                                            </span>
                                            <span className="br-side-name">{m.name}</span>
                                            <span className={`br-freq br-${m.tone}`}>{m.freq}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </nav>

                {/* ---------- right: saved files ---------- */}
                <div className="card br-panel">
                    <div className="br-panel-head">
                        <div>
                            <h3 className="br-panel-title">{meta.code} · {meta.name}</h3>
                            <p className="br-panel-sub">Saved returns open in the eBIRForms app too.</p>
                            {list.files?.length > 0 && (
                                <div className="br-tally">
                                    {Object.keys(STATUS).filter((k) => tally[k]).map((k) => (
                                        <span key={k} className={`br-status is-${k}`}>{STATUS[k]} · {tally[k]}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="br-panel-tools">
                            {list.files?.length > 3 && (
                                <input
                                    className="input br-search"
                                    type="search"
                                    placeholder="Search period or file name"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    aria-label="Search saved returns"
                                />
                            )}
                            <button className="btn btn-primary" onClick={newReturn}>+ New {meta.code}</button>
                        </div>
                    </div>

                    {list.error && (
                        <div className="alert-error" role="alert">
                            {list.error} <button className="btn btn-sm" onClick={() => loadOne(form)}>Try again</button>
                        </div>
                    )}

                    {list.loading && (
                        <div className="br-files">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="br-file">
                                    <span className="sk" style={{ width: 40, height: 40, borderRadius: 10 }} />
                                    <div className="br-file-main">
                                        <span className="sk sk-cell" style={{ width: "40%" }} />
                                        <span className="sk sk-cell" style={{ width: "65%" }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!list.loading && !list.error && files.length === 0 && (
                        <div className="br-empty">
                            <div className="br-empty-icon"><FileIcon /></div>
                            {query ? (
                                <p>No saved {meta.code} matches “{query}”.</p>
                            ) : (
                                <>
                                    <p className="br-empty-title">No {meta.code} returns yet</p>
                                    <p className="br-empty-sub">Start one and the amounts will be filled in from your books.</p>
                                    <button className="btn btn-primary" onClick={newReturn}>+ New {meta.code}</button>
                                </>
                            )}
                        </div>
                    )}

                    {!list.loading && files.length > 0 && (
                        <>
                            <ul className="br-files br-files-scroll">
                                {shownFiles.map((x) => (
                                    <li key={x.filename} className="br-file">
                                        <span className="br-file-icon"><FileIcon /></span>
                                        <div className="br-file-main">
                                            <span className="br-file-period">{x.return_period || "—"}</span>
                                            <span className="br-file-name mono" title={x.filename}>{x.filename}</span>
                                        </div>
                                        <div className="br-file-meta">
                                            <span className="br-chips">
                                                <span className={`br-status is-${x.status || "not_filed"}`}>{STATUS[x.status] || STATUS.not_filed}</span>
                                                {x.filing && x.filing.reconciled !== null && x.filing.reconciled !== undefined && (
                                                    <span className={`br-status ${x.filing.reconciled ? "is-paid" : "is-unpaid"}`}
                                                        title="Return amounts compared with the books when it was filed">
                                                        {x.filing.reconciled ? "Reconciled" : "Not reconciled"}
                                                    </span>
                                                )}
                                            </span>
                                            {x.filing
                                                ? <small>Filed {x.filing.filed_date} · ₱{peso(x.filing.amount)}{x.filing.balance > 0 ? ` · balance ₱${peso(x.filing.balance)}` : ""}</small>
                                                : <small>Saved {x.created}</small>}
                                        </div>
                                        <div className="br-file-actions">
                                            {!x.filing && (
                                                <button className="btn btn-sm btn-info" onClick={() => setFilingFor(x)}>File &amp; submit</button>
                                            )}
                                            {x.filing && x.status !== "paid" && (
                                                <button className="btn btn-sm btn-info" onClick={() => pay(x)} disabled={payLoading === x.filename}>
                                                    {payLoading === x.filename ? "Opening…" : "Pay"}
                                                </button>
                                            )}
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={() => openFile(x.filename)}
                                                disabled={opening === x.filename}
                                            >
                                                {opening === x.filename ? "Opening…" : "Open"}
                                            </button>
                                            <button className="btn btn-sm" onClick={() => download(x.filename)}>Download</button>
                                            <button
                                                className="btn btn-sm br-danger"
                                                onClick={() => setToDelete(x.filename)}
                                                disabled={!!x.filing}
                                                title={x.filing ? "Filed & submitted returns can't be deleted" : undefined}
                                                aria-label={`Delete ${x.filename}`}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>

                            <footer className="br-pager">
                                <span className="br-pager-info">
                                    {per ? `${(curPage - 1) * per + 1}–${Math.min(files.length, curPage * per)} of ${files.length}` : `${files.length}`} return(s)
                                </span>
                                <nav className="br-pager-nav" aria-label="Pagination">
                                    <label className="br-pager-per">
                                        Rows
                                        <select className="input" value={per} onChange={(e) => setPer(+e.target.value)} aria-label="Rows per page">
                                            {PER_OPTIONS.map((n) => <option key={n} value={n}>{n || "All"}</option>)}
                                        </select>
                                    </label>
                                    {per > 0 && (
                                        <>
                                            <button type="button" className="br-pg" onClick={() => setPage(curPage - 1)} disabled={curPage <= 1} aria-label="Previous page">‹</button>
                                            {pageNums(curPage, pages).map((n, i) => (n === "…"
                                                ? <span key={`g${i}`} className="br-pg-gap">…</span>
                                                : <button type="button" key={n} className={`br-pg${n === curPage ? " is-on" : ""}`} onClick={() => setPage(n)}
                                                    aria-current={n === curPage ? "page" : undefined}>{n}</button>))}
                                            <button type="button" className="br-pg" onClick={() => setPage(curPage + 1)} disabled={curPage >= pages} aria-label="Next page">›</button>
                                        </>
                                    )}
                                </nav>
                            </footer>
                        </>
                    )}
                </div>
            </div>

            {open && (
                <BirFormModal
                    form={open.form}
                    initial={open.initial}
                    autofill={open.autofill}
                    lookups={lookups}
                    onClose={() => setOpen(null)}
                    onSaved={() => { setOpen(null); loadOne(open.form); }}
                />
            )}

            {filingFor && (
                <BirFilingModal
                    filename={filingFor.filename}
                    title={`${meta.code} · ${filingFor.return_period || filingFor.filename}`}
                    onClose={() => setFilingFor(null)}
                    onDone={() => { setFilingFor(null); loadOne(form); }}
                />
            )}

            {payFor && (
                <PayBillModal type="expenses" invoiceNo={payFor.invoiceNo} accounts={payFor.accounts}
                    onClose={() => { setPayFor(null); loadOne(form); }} onDone={() => loadOne(form)} />
            )}

            {toDelete && (
                <ConfirmDialog
                    title="Delete this return?"
                    message={`"${toDelete}" will be removed from the eBIRForms save folder. You can't undo this.`}
                    confirmLabel="Delete file"
                    onCancel={() => setToDelete(null)}
                    onConfirm={remove}
                />
            )}
        </section>
    );
}