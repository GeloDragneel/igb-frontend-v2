// Monitoring → VAT Management Dashboard (copy of Reports → VAT Summary)
//   + zero out the Net VAT Payable per client: pick Sales / Purchases / Expenses → the amount to adjust is worked out
//     (or type the amount → the Net VAT Payable follows · or type the Net VAT Payable → the amount follows)
//   – no Status / Remarks / DA Assigned / Auditor Assigned columns
// Reports → VAT Summary (old pages/Reports/VAT_Summary_Report.php)
// VAT clients with sales / purchases / VAT for the period · branch rows · documents behind each amount · remarks
// Client name → E-BIR (2550M/Q) table: original / adjusted view, documents per cell, undeclare / undo, approve, print.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import ColumnFilter, { distinct } from "../../components/ColumnFilter";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiFetch, apiBlob, useAuth } from "../../context/AuthContext";
import "../Reports/VATSummary.css";   // VAT Summary styles (pages/Reports)
import "../Reports/VATSummaryPrint.css";   // VAT Summary styles (pages/Reports)
import "../Reports/VATSummaryAdjust.css";   // VAT Summary styles (pages/Reports)
import "../Reports/VATSummaryBulk.css";   // VAT Summary styles (pages/Reports)
import "./VATManagement.css";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// long client names: first 24 letters + "..." (full name on hover)
const shortName = (v, max = 24) => { const t = String(v || "").trim(); return t.length > max ? `${t.slice(0, max).trimEnd()} . . .` : t; };
const pad = (n) => String(n).padStart(2, "0");
const today = new Date(); // Philippine time on the user's PC
const THIS_MONTH = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
const QUARTER_START = `${today.getFullYear()}-${pad(Math.floor(today.getMonth() / 3) * 3 + 1)}`;

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dash = (v) => (Math.abs(Number(v) || 0) < 0.005 ? "-" : n2(v));
// "2026-11-27 16:04:10" → "November 27, 2026 4:04 PM" (read as written, no timezone shift)
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const stamp = (v) => {
    const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return String(v || "");
    const h = Number(m[4]);
    return `${MONTHS_FULL[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]} ${h % 12 || 12}:${m[5]} ${h < 12 ? "AM" : "PM"}`;
};
const paren = (v) => {
    const x = Number(v) || 0;
    if (Math.abs(x) < 0.005) return "-";
    return x < 0 ? `(${n2(Math.abs(x))})` : n2(x);
};
const monthLabel = (ym) => (ym ? `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : "");
const monthHead = (ym) => `${ym.slice(5, 7)}-${MON[+ym.slice(5, 7) - 1]}`;
const rangeLabel = (a, b) => (a === b ? monthLabel(a) : `${monthLabel(a)} to ${monthLabel(b)}`);
const ebirRange = (a, b) => `${MON[+a.slice(5) - 1]} - ${MON[+b.slice(5) - 1]} ${b.slice(0, 4)}`;
const fullDate = (d) => {
    if (!d) return "";
    const [y, m, day] = String(d).slice(0, 10).split("-");
    return `${MON[+m - 1]} ${+day}, ${y}`;
};
// "2026-11" ± n months
const shiftMonth = (ym, n) => {
    const [y, m] = String(ym || "").split("-").map(Number);
    if (!y || !m) return ym;
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const nextMonth = (ym) => {
    const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/* the 12 amount columns (old table order) */
const COLS = [
    { key: "vatable_sales", label: "VATable Sales", group: "sales" },
    { key: "exempt_sales", label: "Exempt Sales", group: "sales" },
    { key: "zero_rated", label: "Zero Rated", group: "sales" },
    { key: "total_sales", label: "Total Sales", group: "sales", strong: true, main: true },
    { key: "vatable_purchases", label: "VATable Purchases", group: "pe" },
    { key: "vatable_expenses", label: "VATable Expenses", group: "pe" },
    { key: "exempt_purchase_exp", label: "Exempt Purch. / Exp.", group: "pe" },
    { key: "total_purchase_exp", label: "Total Purch. / Exp.", group: "pe", strong: true, main: true },
    { key: "output_vat", label: "Output VAT", group: "vat", tone: "out" },
    { key: "input_vat", label: "Input VAT", group: "vat", tone: "in" },
    { key: "creditable_wt", label: "2307 Creditable WT", group: "vat" },
    { key: "net_vat_payable", label: "Net VAT Payable", group: "vat", tone: "net", noLink: true, main: true },
];
const GROUPS = [["sales", "Sales", 4], ["pe", "Purchases / Expenses", 4], ["vat", "VAT", 4]];

/* ---------- print: rows → POST /print/vat-clients → file (xlsx / pdf) ---------- */
async function printFile(payload) {
    const { token } = await apiFetch("/print/vat-clients", { method: "POST", body: JSON.stringify(payload) });
    return apiBlob(`/print/vat-clients/${token}`);
}
function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/* TOTAL VAT PAYABLE / (EXCESS) of one month = VAT Due − 2307 (VT) of that month
   (the 1st / 2nd month tax paid has no month of its own, so it is only taken off in the Total) */
const payableOfMonth = (d, m) => r2((Number(d?.vat_due?.values?.[m]) || 0) - (Number(d?.vt_2307?.values?.[m]) || 0));

/* "See adjustment": Adjustment = adjusted total − original total of a line.
   key: r|TAG|CODE (account row) · s|TAG (section total) · total_purchase_exp, net_total, output_vat, input_vat, vat_due, vt_2307,
   first_month, second_month, vat_payable.  Returns null in the original view. */
function ebirAdjust(state) {
    if (state?.mode !== "adjusted" || !state.base) return null;
    const b = state.base;
    const totalOf = (key) => {
        const [kind, tag, code] = key.split("|");
        if (kind === "r") return b.sections?.find((s) => s.tag === tag)?.rows?.find((r) => String(r.code) === String(code))?.total;
        if (kind === "s") return b.sections?.find((s) => s.tag === tag)?.subtotal?.total;
        const v = b[key];
        return v && typeof v === "object" ? v.total : v;
    };
    return (key, adjustedTotal) => r2((Number(adjustedTotal) || 0) - (Number(totalOf(key)) || 0));
}

/** remarks are rich text (old Quill editor): keep only simple formatting tags */
const SAFE_TAGS = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "OL", "UL", "LI", "H1", "H2", "DIV", "SPAN"]);
function cleanHtml(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
    const walk = (node) => {
        [...node.children].forEach((el) => {
            if (!SAFE_TAGS.has(el.tagName)) {
                el.replaceWith(...(["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(el.tagName) ? [] : [...el.childNodes]));
                return;
            }
            [...el.attributes].forEach((a) => {
                if (!(a.name === "class" && /^(ql-[\w-]+\s*)+$/.test(a.value))) el.removeAttribute(a.name);
            });
            walk(el);
        });
    };
    walk(doc.body.firstChild);
    return doc.body.firstChild.innerHTML;
}

/* =========================================================
   page
   ========================================================= */
// filters kept per browser tab (survive F5, leaving the page and coming back, switching tabs)
const FKEY = "monitoring.vatmanagement.filters";
const readFilters = () => { try { return JSON.parse(sessionStorage.getItem(FKEY) || "null") || {}; } catch { return {}; } };
const saveFilters = (f) => { try { sessionStorage.setItem(FKEY, JSON.stringify(f)); } catch { /* ignore */ } };
// last client list per From / To / Status / DA, kept while the app is open → shown at once, refreshed quietly
const rowsCache = new Map();
const rowsKey = (f, t, st, da, bs) => `${bs}|${f}|${t}|${st}|${da}`;

/* ---------- zero-out: Net VAT Payable = Output VAT − Input VAT − 2307 ----------
   Sales      +A → VATable Sales +A, Output VAT +12%·A → Net +12%·A
   Purchases  +A → VATable Purchases +A, Input VAT +12%·A → Net −12%·A
   Expenses   +A → VATable Expenses +A, Input VAT +12%·A → Net −12%·A          */
const VAT = 0.12;
const VIA = [["sales", "Sales"], ["purchases", "Purchases"]];
// which one needs the adjustment: Net VAT has to go DOWN → Purchases (more input VAT) · has to go UP → Sales (more output VAT)
const autoVia = (net0, target) => {
    const d = target - net0;
    if (Math.abs(d) >= 0.005) return d < 0 ? "purchases" : "sales";
    return net0 > 0 ? "purchases" : "sales";
};
const sign = (via) => (via === "sales" ? 1 : -1);
// amount to adjust (VATable, net of VAT) so the Net VAT Payable becomes `target`
const amountFor = (net0, via, target) => r2((target - net0) / (VAT * sign(via)));
// Net VAT Payable after adjusting `amount`
const netFor = (net0, via, amount) => r2(net0 + sign(via) * VAT * amount);
// the row with the adjustment applied
function adjustRow(r, adj) {
    if (!adj || !adj.amount) return r;
    const a = adj.amount, v = r2(a * VAT);
    const x = { ...r };
    if (adj.via === "sales") {
        x.vatable_sales = r2(r.vatable_sales + a); x.total_sales = r2(r.total_sales + a); x.output_vat = r2(r.output_vat + v);
    } else {
        const k = adj.via === "purchases" ? "vatable_purchases" : "vatable_expenses";
        x[k] = r2(r[k] + a); x.total_purchase_exp = r2(r.total_purchase_exp + a); x.input_vat = r2(r.input_vat + v);
    }
    x.net_vat_payable = r2(x.output_vat - x.input_vat - x.creditable_wt);
    return x;
}
/* risk: how big the adjustment is next to what is already there
   Sales → % of VATable Sales · Purchases → % of VATable Purchases + Expenses
   up to 10% small · 10–15% medium · above 15% high · nothing to adjust = resolved */
const RISK = {
    ok: { label: "Resolved", tone: "ok" },
    small: { label: "Small risk", tone: "small" },
    medium: { label: "Medium risk", tone: "medium" },
    high: { label: "High risk", tone: "high" },
};
function riskOf(r, adj) {
    const amt = Math.abs(Number(adj?.amount) || 0);
    if (amt < 0.005) return { level: "ok", pct: 0 };
    const base = adj.via === "sales" ? Number(r.vatable_sales) || 0 : (Number(r.vatable_purchases) || 0) + (Number(r.vatable_expenses) || 0);
    const pct = base > 0 ? (amt / base) * 100 : Infinity;
    return { level: pct <= 10 ? "small" : pct <= 15 ? "medium" : "high", pct };
}
const pctText = (p) => (p === Infinity ? "new" : `${p.toFixed(p >= 100 ? 0 : 1)}%`);

const MetricIcon = ({ kind }) => {
    const d = {
        total: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
        concern: "M12 6v8M12 18h.01",
        small: "M4 18l5-5 4 3 7-8",
        medium: "M12 8v4l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z",
        high: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
        ok: "M5 12l5 5 9-10",
        pending: "M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4",
        resolved: "M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9zM8 12l3 3 5-6",
        review: "M9 3h6v3H9zM6 5H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1M9 13l2 2 4-4",
    }[kind];
    return <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
};

const touched = (via) => (via === "sales" ? ["vatable_sales", "total_sales", "output_vat"]
    : [via === "purchases" ? "vatable_purchases" : "vatable_expenses", "total_purchase_exp", "input_vat"]);

/* typed money box: keeps what you type while focused */
function MoneyBox({ value, onChange, label, className = "", disabled = false }) {
    const [draft, setDraft] = useState(null);
    if (disabled) return <input className={`vm-xl vm-in is-final ${className}`} aria-label={label} value={n2(value)} readOnly tabIndex={-1} title="Final (resolved)" />;
    return (
        <input className={`vm-xl vm-in ${className}`} inputMode="decimal" aria-label={label}
            value={draft ?? n2(value)}
            onFocus={(e) => { setDraft(String(Math.round((Number(value) || 0) * 100) / 100)); requestAnimationFrame(() => e.target.select()); }}
            onChange={(e) => {
                let t = e.target.value.replace(/[^\d.-]/g, "").replace(/(?!^)-/g, "").replace(/(\..*)\./g, "$1");
                setDraft(t);
                onChange(Number(t) || 0);
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    );
}

const AUDITOR_DESIGNATIONS = [5, 10];   // m_employee.designation_id: Auditor, Audit supervisor

export default function VATManagement() {
    const notify = useToast();
    const { user } = useAuth();
    const isAuditor = AUDITOR_DESIGNATIONS.includes(Number(user?.designation_id));   // only an auditor can Resolve / Decline
    const [ask, setAsk] = useState(null);   // confirmation in the Manage popup: "save" | "Resolved" | "Declined"
    const [finPick, setFinPick] = useState(null);   // Resolve: the log whose amounts become final
    const saved = useMemo(readFilters, []);
    // one Declared Month only (From = To = that month)
    const [month, setMonth] = useState(saved.month || saved.to || THIS_MONTH);
    const from = month, to = month;
    const [statusId, setStatusId] = useState(saved.statusId || "0");
    // no Data analyst filter on screen any more: all analysts (a data analyst still gets only his clients – the server decides)
    const [daId, setDaId] = useState("0");
    const [query, setQuery] = useState(saved.query || "");
    // DM = declared month (default) · DE = date entry (when it was keyed in)
    const basis = "DM";                                  // always by declared month (no "Filter by")
    // Date entry → whole dates (date added), not months
    const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${pad(new Date(y, m, 0).getDate())}`; };
    const [dFrom, setDFrom] = useState(saved.dFrom || `${saved.from || QUARTER_START}-01`);
    const [dTo, setDTo] = useState(saved.dTo || lastDay(saved.to || THIS_MONTH));
    const qF = basis === "DE" ? dFrom : from;   // what the server is asked for
    const qT = basis === "DE" ? dTo : to;
    const firstHit = rowsCache.get(rowsKey(qF, qT, statusId, daId, basis));
    const [lookups, setLookups] = useState({ statuses: [], analysts: [] });
    // a data analyst can look (See adjustment, Print, History) but can't undeclare / undo / approve
    const canEdit = !lookups.my_da;

    const [rows, setRows] = useState(() => firstHit || []);
    // the filters behind the rows shown · from / to = months (E-BIR etc.) · qFrom / qTo = what was searched (months or dates)
    const [used, setUsed] = useState(() => (firstHit ? { from: qF.slice(0, 7), to: qT.slice(0, 7), qFrom: qF, qTo: qT, basis } : null));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [branches, setBranches] = useState({}); // client_num → rows | "loading"
    // zero-out per client: { via, target } – target (the Net VAT Payable you want) starts at 0
    const [zero, setZero] = useState({});
    // Sales / Purchases-Expenses / VAT: one column by default (Total Sales · Total Purch. / Exp. · Net VAT Payable) · More shows the rest
    const [wide, setWide] = useState({ sales: false, pe: false, vat: false });
    const VIS = COLS.filter((c) => !(c.group in wide) || wide[c.group] || c.main);
    const [vm, setVm] = useState({});   // { client_id: { status, logs, unread, final } } from t_vat_management_*
    // Resolved → the amounts the auditor finalized (from the log picked on Resolve)
    const finalOf = (r) => { const x = vm[r.client_id]; return x?.status === "Resolved" && x.final ? x.final : null; };
    const adjOf = (r) => {
        const f = finalOf(r);
        if (f) return { via: f.trans_type === "Sales" ? "sales" : "purchases", target: Number(f.adjusted) || 0, amount: Number(f.amount) || 0, final: true, logId: f.log_id };
        const z = zero[r.client_num] || {};
        const net0 = Number(r.net_vat_payable) || 0;
        const target = z.target ?? 0;
        const via = autoVia(net0, target);
        return { via, target, amount: amountFor(net0, via, target) };
    };
    const setTarget = (r, target) => !finalOf(r) && setZero((z) => ({ ...z, [r.client_num]: { ...(z[r.client_num] || {}), target } }));
    const setAmount = (r, amount) => {
        const via = adjOf(r).via;
        setTarget(r, netFor(Number(r.net_vat_payable) || 0, via, amount));
    };

    const [amounts, setAmounts] = useState(null); // documents behind one amount
    const [remarks, setRemarks] = useState(null);
    const [ebir, setEbir] = useState(null); // { row, mode, data, loading }
    const [cell, setCell] = useState(null); // documents behind one E-BIR cell
    const [undeclare, setUndeclare] = useState(null);
    const [pending, setPending] = useState(null);          // every undeclared document waiting for approval (From → To month)
    const [history, setHistory] = useState(null);          // approved undeclared documents (one group per Approve)
    const [snap, setSnap] = useState(null);                // one approval → before / after popup
    const [confirm, setConfirm] = useState(null);
    const [printing, setPrinting] = useState(false);
    const [pdf, setPdf] = useState(null);              // { url, name, title } PDF preview
    const [listMenu, setListMenu] = useState(false);   // Print ▾ on the client list
    const [busy, setBusy] = useState(false);
    const seq = useRef(0);

    useEffect(() => {
        apiFetch("/reports/vat-clients/lookups").then((lk) => {
            setLookups(lk);
            // a data analyst only sees the clients assigned to him (the server enforces it too)
            if (lk?.my_da) setDaId(String(lk.my_da));
        }).catch(() => { });
    }, []);

    const load = useCallback(async (f, t, st = statusId, da = daId, bs = basis) => {
        f = f ?? (bs === "DE" ? dFrom : from);
        t = t ?? (bs === "DE" ? dTo : to);
        if (!f || !t) return notify("Pick the From and To dates.", "error");
        if (f > t) return notify("From must be on or before To.", "error");
        const my = ++seq.current;
        const key = rowsKey(f, t, st, da, bs);
        // seen before → show it straight away and refresh quietly (no "Loading…" over the table)
        if (rowsCache.has(key)) {
            setRows(rowsCache.get(key));
            setUsed({ from: f.slice(0, 7), to: t.slice(0, 7), qFrom: f, qTo: t, basis: bs });
        }
        setLoading(true);
        setError("");
        try {
            const r = await apiFetch(`/reports/vat-clients?${new URLSearchParams({ from: f, to: t, status_id: st, da_id: da, basis: bs })}`);
            if (my !== seq.current) return;
            rowsCache.set(key, r.rows || []);
            setRows(r.rows || []);
            setUsed({ from: f.slice(0, 7), to: t.slice(0, 7), qFrom: f, qTo: t, basis: bs });
            setBranches({});
            setZero({});
        } catch (e) {
            if (my === seq.current) setError(e.message || "Couldn't load the VAT summary.");
        } finally {
            if (my === seq.current) setLoading(false);
        }
    }, [from, to, dFrom, dTo, statusId, daId, basis, notify]);

    // remember the filters + search box
    useEffect(() => { saveFilters({ month, statusId, daId, query }); }, [month, statusId, daId, query]);

    // ‹ › → the previous / next month, searched right away
    const goMonth = (n) => {
        const m = shiftMonth(month, n);
        setMonth(m);
        load(m, m);
    };

    // first load + the old page reloaded when Status / Data analyst changed
    useEffect(() => { load(undefined, undefined, statusId, daId, basis); }, [statusId, daId, basis]); // eslint-disable-line react-hooks/exhaustive-deps

    const found = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) => `${r.client_name} ${r.client_num} ${r.status} ${r.da_assigned.join(" ")}`.toLowerCase().includes(q));
    }, [rows, query]);

    // dashboard metrics (from every client found) + click a card to show only those clients
    const [riskPick, setRiskPick] = useState("");   // "" all · concern · small · medium · high · ok
    const risks = useMemo(() => Object.fromEntries(found.map((r) => [r.client_num, riskOf(r, adjOf(r))])), [found, zero, vm]); // eslint-disable-line react-hooks/exhaustive-deps
    // t_vat_management_status / _logs of the month: { client_id: { status, logs } }
    const [vmMonth, setVmMonth] = useState("");
    const loadVm = useCallback(async (m) => {
        if (!m) return;
        try {
            const r = await apiFetch(`/vat-management/state?${new URLSearchParams({ month: m })}`);
            setVm(r.clients || {});
            setVmMonth(m);
        } catch { /* the table still works without it */ }
    }, []);
    useEffect(() => { if (used?.from) loadVm(used.from); }, [used?.from, loadVm]);
    // In Review = has adjustment logs and is not Resolved yet
    const inReview = (r) => { const x = vm[r.client_id]; return !!x && x.logs > 0 && x.status !== "Resolved"; };
    const statusOf = (r) => vm[r.client_id]?.status || "Pending";   // same as the Status column
    // read / unread: logs other users saved that I haven't opened yet
    const unreadOf = (r) => Number(vm[r.client_id]?.unread) || 0;
    const totalUnread = useMemo(() => Object.values(vm).reduce((s, x) => s + (Number(x?.unread) || 0), 0), [vm]);

    const metrics = useMemo(() => {
        const m = { total: found.length, concern: 0, small: 0, medium: 0, high: 0, ok: 0, review: 0, reviewLogs: 0, pending: 0, resolved: 0 };
        found.forEach((r) => {
            const l = risks[r.client_num]?.level || "ok"; m[l] += 1; if (l !== "ok") m.concern += 1;
            if (inReview(r)) { m.review += 1; m.reviewLogs += vm[r.client_id].logs; }
            const st = statusOf(r);
            if (st === "Pending") m.pending += 1; else if (st === "Resolved") m.resolved += 1;
        });
        return m;
    }, [found, risks, vm]); // eslint-disable-line react-hooks/exhaustive-deps
    const shown = useMemo(() => (!riskPick ? found : found.filter((r) => {
        if (riskPick === "review") return inReview(r);
        if (riskPick === "pending") return statusOf(r) === "Pending";
        if (riskPick === "resolved") return statusOf(r) === "Resolved";
        const l = risks[r.client_num]?.level || "ok";
        return riskPick === "concern" ? l !== "ok" : l === riskPick;
    })), [found, risks, riskPick, vm]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ---------- Manage popup: save an adjustment log · Resolve / Decline ---------- */
    const [manage, setManage] = useState(null);   // { row, adj, status, logs, remarks, loading, saving }
    const openManage = async (r0, a) => {
        setManage({ row: r0, adj: a, status: vm[r0.client_id]?.status || "Pending", logs: null, remarks: "", loading: true });
        try {
            const res = await apiFetch(`/vat-management/logs?${new URLSearchParams({ client_id: r0.client_id, month: used.from })}`);
            setManage((m) => m && { ...m, status: res.status?.status || "Pending", statusInfo: res.status, logs: res.logs || [], loading: false });
            // opening the popup reads them → clear this client's badge
            setVm((v) => (v[r0.client_id]?.unread ? { ...v, [r0.client_id]: { ...v[r0.client_id], unread: 0 } } : v));
        } catch (e) {
            setManage((m) => m && { ...m, logs: [], loading: false, error: e.message || "Couldn't load the logs." });
        }
    };
    const refreshManage = async () => {
        if (!manage) return;
        await openManage(manage.row, manage.adj);
        loadVm(used.from);
    };
    const saveLog = async () => {
        const { row, remarks } = manage;
        const adj = adjOf(row);
        if ((manage.status || "Pending") === "Resolved") return notify("Already resolved – no more logs.", "error");
        if (!adj.amount) return notify("Nothing to adjust for this client.", "error");
        setManage((m) => ({ ...m, saving: true }));
        try {
            await apiFetch("/vat-management/logs", {
                method: "POST",
                body: JSON.stringify({
                    client_id: row.client_id, month: used.from, trans_type: adj.via === "sales" ? "Sales" : "Purchase",
                    actual: r2(row.net_vat_payable), adjusted: r2(adj.target), amount: r2(adj.amount), remarks,
                }),
            });
            notify("Adjustment log saved.");
            await refreshManage();
        } catch (e) {
            notify(e.message || "Couldn't save the log.", "error");
            setManage((m) => m && { ...m, saving: false });
        }
    };
    const setStatus = async (status, logId = null) => {
        if (!isAuditor) return;
        setManage((m) => ({ ...m, saving: true }));
        try {
            await apiFetch("/vat-management/status", {
                method: "POST", body: JSON.stringify({ client_id: manage.row.client_id, month: used.from, status, log_id: logId }),
            });
            notify(`${manage.row.client_name}: ${status}.`);
            await refreshManage();
        } catch (e) {
            notify(e.message || "Couldn't update the status.", "error");
            setManage((m) => m && { ...m, saving: false });
        }
    };

    const adjusted = useMemo(() => shown.map((r) => adjustRow(r, adjOf(r))), [shown, zero, vm]); // eslint-disable-line react-hooks/exhaustive-deps
    const totals = useMemo(() => {
        const t = {};
        COLS.forEach((c) => { t[c.key] = adjusted.reduce((s, r) => s + Math.round((Number(r[c.key]) || 0) * 100) / 100, 0); });
        t.adjust = shown.reduce((s, r) => s + adjOf(r).amount, 0);
        return t;
    }, [adjusted]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ---------- branch rows ---------- */
    const toggleBranches = async (r) => {
        if (branches[r.client_num]) {
            setBranches((b) => { const n = { ...b }; delete n[r.client_num]; return n; });
            return;
        }
        setBranches((b) => ({ ...b, [r.client_num]: "loading" }));
        try {
            const res = await apiFetch(`/reports/vat-clients/branches?${new URLSearchParams({ from: used.qFrom || used.from, to: used.qTo || used.to, basis: used.basis || "DM", client_num: r.client_num })}`);
            setBranches((b) => ({ ...b, [r.client_num]: res.rows || [] }));
        } catch (e) {
            setBranches((b) => { const n = { ...b }; delete n[r.client_num]; return n; });
            notify(e.message || "Couldn't load the branch accounts.", "error");
        }
    };

    /* ---------- documents behind an amount ---------- */
    const openAmount = async (r, col) => {
        setAmounts({ title: `${r.client_name} · ${col.label}`, rows: [], loading: true });
        try {
            const list = await apiFetch(`/reports/vat-clients/amounts?${new URLSearchParams({ type: col.key, user_ids: r.user_ids, from: used.qFrom || used.from, to: used.qTo || used.to, basis: used.basis || "DM" })}`);
            setAmounts((a) => a && { ...a, rows: list, loading: false });
        } catch (e) {
            setAmounts((a) => a && { ...a, loading: false, error: e.message || "Couldn't load the documents." });
        }
    };

    /* ---------- remarks ---------- */
    const openRemarks = async (r) => {
        setRemarks({ row: r, html: "", loading: true });
        try {
            const res = await apiFetch(`/reports/vat-clients/remarks?${new URLSearchParams({ client_num: r.client_num, month: used.from })}`);
            setRemarks((x) => x && { ...x, html: cleanHtml(res.remarks), loading: false });
        } catch (e) {
            setRemarks((x) => x && { ...x, loading: false });
            notify(e.message || "Couldn't load the remarks.", "error");
        }
    };
    const saveRemarks = async (html) => {
        setBusy(true);
        try {
            await apiFetch("/reports/vat-clients/remarks", {
                method: "PUT",
                body: JSON.stringify({ client_num: remarks.row.client_num, month: used.from, remarks: cleanHtml(html) }),
            });
            notify("Remarks successfully submitted", "success");
            setRemarks(null);
        } catch (e) {
            notify(e.message || "Couldn't save the remarks.", "error");
        } finally {
            setBusy(false);
        }
    };

    /* ---------- E-BIR ---------- */
    // quiet = refresh after undeclare / undo: keep the table on screen, no loading look
    const loadEbir = useCallback(async (row, mode, quiet = false) => {
        setEbir((x) => quiet && x?.row === row
            ? { ...x, refreshing: true }
            : { row, mode, data: x?.row === row ? x.data : null, base: x?.row === row ? x.base : null, loading: true });
        const get = (m) => apiFetch(`/reports/vat-clients/ebir?${new URLSearchParams({
            user_ids: row.user_ids, client_id: row.client_id, caid: row.caid || "", from: used.from, to: used.to, mode: m,
        })}`);
        try {
            // "See adjustment" also needs the original numbers for the Adjustment column (adjusted − original)
            const [data, base] = mode === "adjusted" ? await Promise.all([get("adjusted"), get("initial")]) : [await get(mode), null];
            setEbir((x) => x && x.row === row ? { ...x, mode, data, base: mode === "adjusted" ? base : data, loading: false, refreshing: false, error: "" } : x);
        } catch (e) {
            setEbir((x) => x && { ...x, loading: false, refreshing: false, error: e.message || "Couldn't load the E-BIR table." });
        }
    }, [used]);

    const switchMode = (mode) => {
        if (!ebir?.data) return;
        if (!ebir.data.pending_count) return notify("No adjustment in this transaction", "error");
        loadEbir(ebir.row, mode);
    };

    const openCell = useCallback(async (spec, quiet = false) => {
        // quiet = refresh after undeclare / undo: keep the rows on screen (the "Loading…" row is for the first load only)
        setCell((c) => (quiet && c ? { ...c, refreshing: true } : { ...spec, rows: [], loading: true }));
        try {
            const list = await apiFetch(`/reports/vat-clients/ebir/details?${new URLSearchParams({
                user_ids: ebir.row.user_ids, month: spec.month, type: spec.type, code: spec.code,
            })}`);
            setCell((c) => c && { ...c, rows: list, loading: false, refreshing: false, error: "" });
        } catch (e) {
            setCell((c) => c && { ...c, loading: false, refreshing: false, error: e.message || "Couldn't load the documents." });
        }
    }, [ebir]);

    // the "Undeclared amount" / "waiting for approval" chips → all undeclared documents of this client in the period
    const openPending = useCallback(async (quiet = false) => {
        if (!ebir || !used) return;
        setPending((p) => (quiet && p ? { ...p, refreshing: true } : { rows: [], total: 0, loading: true }));
        try {
            const r = await apiFetch(`/reports/vat-clients/pending?${new URLSearchParams({ client_id: ebir.row.client_id, from: used.from, to: used.to })}`);
            setPending((p) => p && { ...p, rows: r.rows || [], total: r.total || 0, loading: false, refreshing: false, error: "" });
        } catch (e) {
            setPending((p) => p && { ...p, loading: false, refreshing: false, error: e.message || "Couldn't load the undeclared documents." });
        }
    }, [ebir, used]);

    // approval history of this client (moved out of / into the period)
    const openHistory = useCallback(async () => {
        if (!ebir || !used) return;
        setHistory({ groups: [], loading: true });
        try {
            const r = await apiFetch(`/reports/vat-clients/history?${new URLSearchParams({ client_id: ebir.row.client_id, from: used.from, to: used.to })}`);
            setHistory((h) => h && { ...h, groups: r.groups || [], loading: false, error: "" });
        } catch (e) {
            setHistory((h) => h && { ...h, loading: false, error: e.message || "Couldn't load the history." });
        }
    }, [ebir, used]);

    const afterChange = async () => {
        await Promise.all([
            cell ? openCell(cell, true) : null,
            ebir ? loadEbir(ebir.row, ebir.mode, true) : null,
            pending ? openPending(true) : null,
        ]);
    };

    // run one request per document; returns how many worked + the first error
    const eachDoc = async (items, send) => {
        let ok = 0;
        let firstError = "";
        for (const it of items) {
            try { await send(it); ok += 1; } catch (e) { firstError ||= `${it.reference}: ${e.message || "failed"}`; }
        }
        return { ok, firstError };
    };

    const saveUndeclare = async () => {
        const u = undeclare;
        if (!canEdit) return notify("Data analysts can't undeclare", "error");
        if (!u.newMonth) return notify("Declared Month is required", "error");
        if ((ebir?.data?.locked_months || []).includes(u.newMonth)) return notify("Declared Month is disabled", "error");
        setBusy(true);
        try {
            const { ok, firstError } = await eachDoc(u.items, (it) => apiFetch("/reports/vat-clients/undeclare", {
                method: "POST",
                body: JSON.stringify({
                    reference_no: it.reference, old_declared_month: it.oldMonth, new_declared_month: u.newMonth,
                    // VT / IT month: the one typed in, else each document keeps its own
                    new_wh_declared_month: u.whMonth || it.whMonth || null, client_id: ebir.row.client_id, caid: ebir.row.caid,
                }),
            }));
            if (ok) {
                setUndeclare(null);
                notify(ok === 1 ? "Record successfully undeclared" : `${ok} records successfully undeclared`, "success");
            }
            if (firstError) notify(`${u.items.length - ok} not undeclared — ${firstError}`, "error");
            if (ok) await afterChange();
        } finally {
            setBusy(false);
        }
    };

    const doConfirm = async () => {
        const c = confirm;
        if (!canEdit) { setConfirm(null); return notify("Data analysts can view only", "error"); }
        setBusy(true);
        try {
            if (c.kind === "undo") {
                const { ok, firstError } = await eachDoc(c.items, (it) => apiFetch("/reports/vat-clients/undo", {
                    method: "POST", body: JSON.stringify({ reference_no: it.reference, old_declared_month: it.oldMonth }),
                }));
                if (ok) notify(ok === 1 ? "Record successfully updated" : `${ok} records successfully updated`, "success");
                if (firstError) notify(`${c.items.length - ok} not undone — ${firstError}`, "error");
                setConfirm(null);
                if (ok) await afterChange();
            } else {
                await apiFetch("/reports/vat-clients/approve", {
                    method: "POST",
                    // user_ids + caid → the server saves the E-BIR table before / after for the History
                    body: JSON.stringify({ client_id: ebir.row.client_id, from: used.from, to: used.to, user_ids: ebir.row.user_ids, caid: ebir.row.caid || null }),
                });
                notify("Record successfully approved", "success");
                setConfirm(null);
                await loadEbir(ebir.row, "initial");
                load(used.qFrom || used.from, used.qTo || used.to);
            }
        } catch (e) {
            notify(e.message || "Something went wrong.", "error");
        } finally {
            setBusy(false);
        }
    };

    const askApprove = () => {
        if (!canEdit) return;
        if (!ebir?.data?.pending_count) return notify("No adjustment in this transaction", "error");
        setConfirm({ kind: "approve" });
    };

    /* ---------- printing ---------- */
    useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

    const run = async (fn) => {
        setPrinting(true);
        try { await fn(); } catch (e) { notify(e.message || "Couldn't print.", "error"); } finally { setPrinting(false); }
    };
    const showPdf = (blob, name, title) => setPdf({ url: URL.createObjectURL(new Blob([blob], { type: "application/pdf" })), name, title });

    // client list (old btnPrintExcel / btnPrintPDF)
    const printList = (format) => run(async () => {
        setListMenu(false);
        const head = ["#", "Client", ...COLS.map((c) => c.label), "Adjust in", "Amount to adjust", "Risk"];
        const rowsOut = shown.map((r, i) => {
            const a = adjOf(r), x = adjusted[i];
            return {
                k: "row", c: [i + 1, r.client_name, ...COLS.map((c) => r2(x[c.key])), a.amount ? VIA.find(([v]) => v === a.via)[1] : "", r2(a.amount),
                (() => { const k = riskOf(r, a); return k.level === "ok" ? "" : `${RISK[k.level].label} (${pctText(k.pct)})`; })()]
            };
        });
        rowsOut.push({ k: "total", c: ["", `TOTAL · ${shown.length} client(s)`, ...COLS.map((c) => r2(totals[c.key])), "", r2(totals.adjust), ""] });
        const file = `VAT-Management-${used.from}-to-${used.to}`;
        const blob = await printFile({
            kind: "list", format, file, sheet: "VAT Management",
            title: ["VAT Management Dashboard", rangeLabel(used.from, used.to)],
            head, money: [...COLS.map((_, i) => i + 2), COLS.length + 3], rows: rowsOut,
        });
        if (format === "pdf") showPdf(blob, `${file}.pdf`, "VAT Management Dashboard - Print Preview");
        else saveBlob(blob, `${file}.xlsx`);
    });

    // E-BIR table → EBIR-{UserID}.xlsx (old print_ebir.php + merge.php + EBIR.xlsx)
    const printEbir = () => run(async () => {
        const d = ebir.data;
        const adj = ebirAdjust(ebir);   // null in the original view
        const res = await apiFetch(`/reports/vat-clients/undeclared?${new URLSearchParams({
            client_id: ebir.row.client_id, client_num: ebir.row.client_num, from: used.from, to: used.to, type: "sales",
        })}`);
        const c = res.client || {};
        const m = d.months;
        const blank = m.map(() => "");
        const line = (k, tag, sub, cells, total, key) => ({
            k, c: [tag, sub, ...(cells ? m.map((x) => r2(cells[x])) : blank), total === "" ? "" : r2(total), ...(adj ? [r2(adj(key, total))] : [])],
        });
        const rowsOut = [{ k: "head", c: ["Tag", "Summary Data", ...m.map(monthHead), "Total", ...(adj ? ["Adjustment"] : [])] }];
        d.sections.forEach((s) => {
            s.rows.forEach((r) => rowsOut.push(line("row", s.tag, r.name, r.values, r.total, `r|${s.tag}|${r.code}`)));
            rowsOut.push(line("sub", s.tag, "Total", s.subtotal.values, s.subtotal.total, `s|${s.tag}`));
        });
        rowsOut.push(line("sub", "Total Purchases/Expenses", "", d.total_purchase_exp.values, d.total_purchase_exp.total, "total_purchase_exp"));
        rowsOut.push(line("grand", "Net Total", "", d.net_total.values, d.net_total.total, "net_total"));
        rowsOut.push(line("row", "Output VAT", "", d.output_vat.values, d.output_vat.total, "output_vat"));
        rowsOut.push(line("row", "Input VAT", "", d.input_vat.values, d.input_vat.total, "input_vat"));
        rowsOut.push(line("sub", "VAT Due", "", d.vat_due.values, d.vat_due.total, "vat_due"));
        rowsOut.push(line("less", "Less : Tax Paid", "1ST MONTH", null, d.first_month, "first_month"));
        rowsOut.push(line("less", "", "2ND MONTH", null, d.second_month, "second_month"));
        rowsOut.push(line("less", "", "2307 (VT)", d.vt_2307.values, d.vt_2307.total, "vt_2307"));
        rowsOut.push(line("grand", "TOTAL VAT PAYABLE/EXCESS", "", Object.fromEntries(m.map((x) => [x, payableOfMonth(d, x)])), d.vat_payable, "vat_payable"));
        const userId = Math.max(...String(ebir.row.user_ids || "0").split(",").map(Number).filter((n) => !Number.isNaN(n)));
        const file = `EBIR-${Number.isFinite(userId) ? userId : ebir.row.client_id}`;
        const blob = await printFile({
            kind: "ebir", format: "xlsx", file, adjusted: !!adj,
            company: { name: c.client_name || ebir.row.client_name, tin: c.tin || "", address: c.trade_name ? `${c.trade_name} (MAIN)` : "" },
            range: `${ebirRange(used.from, used.to)}${d.mode === "adjusted" ? " · Adjusted" : ""}`,
            rows: rowsOut,
        });
        saveBlob(blob, `${file}.xlsx`);
    });

    // undeclared Sales / Purchases / Expenses → PDF preview (old ReportToPDF: SalesReport / PurchaseReport / ExpenseReport)
    // approval (from History) → only the documents of that approval
    const printUndeclared = (type, approval = null) => run(async () => {
        const res = await apiFetch(`/reports/vat-clients/undeclared?${new URLSearchParams({
            client_id: ebir.row.client_id, client_num: ebir.row.client_num, from: used.from, to: used.to, type,
            ...(approval?.approval_no ? { approval_no: approval.approval_no } : {}),
        })}`);
        if (!res.rows?.length) { notify(approval ? `No ${type} in this approval` : "No undeclared found", "error"); return; }
        const c = res.client || {};
        const title = { sales: "Sales Report", purchases: "Purchase Report", expenses: "Expense Report" }[type];
        const keys = ["total", "total2", "net_of_vat", "input_vat", "vat_exempt", "zero_rated", "non_vat"];
        const sum = (k) => res.rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
        const rowsOut = res.rows.map((r, i) => ({
            k: "row",
            c: [i + 1, r.branch_code2 || "", r.po_date || "", r.tin || "", r.branch_code || "", r.vendor_name || "", r.document_no || "", r.account_name || "",
            r2(r.total), r.currency || "", r2(r.ex_rate), r2(r.total2), r2(r.net_of_vat), r2(r.input_vat), r2(r.vat_exempt), r2(r.zero_rated), r2(r.non_vat)],
        }));
        rowsOut.push({ k: "total", c: ["", "", "", "", "", "", "", "Total", r2(sum("total")), "", "", ...keys.slice(1).map((k) => r2(sum(k)))] });
        const file = `${title.replace(/\s+/g, "")}-Undeclared-${approval?.approval_no || `${used.from}-to-${used.to}`}`;
        const approvedLine = approval
            ? `Approved ${approval.approved_at ? `${fullDate(approval.approved_at.slice(0, 10))} ${approval.approved_at.slice(11, 16)}` : ""} by ${approval.approved_by || "—"} · ${approval.approval_no}`
            : null;
        const blob = await printFile({
            kind: "undeclared", format: "pdf", file, sheet: title,
            title: [c.trade_name || ebir.row.client_name, c.street || "", `TIN : ${c.tin || ""}${c.branch_code ? `-${c.branch_code}` : ""}`,
            `${title} (Undeclared)`, approvedLine || `For the Period From ${used.from} to ${used.to}`],
            head: ["#", "Branch", "Date", "TIN", "Br. Code", type === "sales" ? "Customer" : "Vendor", "Document", "Account Title", "Amount", "Currency", "Ex Rate",
                "PHP", "Net VAT", type === "sales" ? "Output VAT" : "Input VAT", "VAT Exempt", "Zero Rated", "Non VAT"],
            money: [8, 10, 11, 12, 13, 14, 15, 16],
            rows: rowsOut,
        });
        showPdf(blob, `${file}.pdf`, "Undeclared Transaction - Print Preview");
    });

    const savePdf = () => {
        const a = Object.assign(document.createElement("a"), { href: pdf.url, download: pdf.name });
        document.body.append(a);
        a.click();
        a.remove();
    };

    /* ---------- table rows ---------- */
    const renderRow = (r0, num, child) => {
        const a = child ? null : adjOf(r0);
        const r = child ? r0 : adjustRow(r0, a);
        const hot = a && a.amount ? touched(a.via) : [];
        return (
            <tr key={child ? `b${r.user_ids}` : `c${r.client_num}`} className={child ? "vs-child" : ""}>
                <td className="vs-f0">
                    {!child && r.count_acc > 1 && (
                        <button type="button" className={`vs-expand${branches[r.client_num] ? " is-open" : ""}`} onClick={() => toggleBranches(r)}
                            aria-label={branches[r.client_num] ? "Hide branch accounts" : "Show branch accounts"}>
                            {branches[r.client_num] === "loading" ? "…" : "▸"}
                        </button>
                    )}
                </td>
                <td className="vs-f1">{num}</td>
                <td className="vs-f2">
                    <button type="button" className="vs-client" title={r.client_name} aria-label={`${r.client_name} — open E-BIR`} onClick={() => loadEbir(r, "initial")}>
                        {shortName(r.client_name)}
                    </button>
                </td>
                {VIS.map((c) => {
                    const v = Number(r[c.key]) || 0;
                    const text = c.key === "net_vat_payable" ? paren(v) : dash(v);
                    // Net VAT Payable: type the amount you want (starts at 0) → the adjustment follows
                    if (!child && c.key === "net_vat_payable") {
                        return (
                            <td key={c.key} className="vs-num is-net vm-cell" title={`Before adjustment: ${paren(r0.net_vat_payable)}`}>
                                <MoneyBox value={a.target} label={`Net VAT Payable of ${r.client_name}`} onChange={(t) => setTarget(r0, t)} className={a.target ? "is-set" : ""} disabled={a.final} />
                                <small className="vm-was">{a.final && <b className="vm-final">🔒 Final</b>}was {paren(r0.net_vat_payable)}</small>
                            </td>
                        );
                    }
                    const isHot = hot.includes(c.key);
                    // the links still open the documents behind the ORIGINAL amount
                    const link = !child && !c.noLink && Math.abs(Number(r0[c.key]) || 0) >= 0.005;
                    return (
                        <td key={c.key} className={`vs-num${c.tone ? ` is-${c.tone}` : ""}${c.strong ? " is-strong" : ""}${v < 0 ? " is-neg" : ""}${isHot ? " vm-hot" : ""}`}
                            title={isHot ? `Before adjustment: ${n2(r0[c.key])}` : undefined}>
                            {link ? <button type="button" className="vs-amt" onClick={() => openAmount(r0, c)}>{text}</button> : text}
                        </td>
                    );
                })}
                <td className="vm-via">
                    {child ? "-" : (
                        <span className={`vm-via-t is-${a.via}`}>{a.amount ? VIA.find(([v]) => v === a.via)[1] : "-"}</span>
                    )}
                </td>
                <td className="vs-num vm-cell">
                    {child ? "-" : <MoneyBox value={a.amount} label={`Amount to adjust for ${r.client_name}`} onChange={(x) => setAmount(r0, x)} className={a.amount < 0 ? "is-neg" : ""} disabled={a.final} />}
                </td>
                <td className="vm-risk">
                    {child ? "-" : (() => {
                        const k = riskOf(r0, a);
                        return k.level === "ok" ? "-" : <span className={`vm-pill is-${k.level}`}>{RISK[k.level].label}<em>{pctText(k.pct)}</em></span>;
                    })()}
                </td>
                <td className="vm-stat">
                    {child ? "-" : (() => {
                        const st = vm[r0.client_id]?.status || "Pending";   // Pending by default
                        return <span className={`vm-st is-${st.toLowerCase()}`}>{st}</span>;
                    })()}
                </td>
                <td className="vm-act">
                    {child ? "-" : (
                        <button type="button" className="vm-manage" onClick={() => openManage(r0, a)}
                            title={unreadOf(r0) ? `${unreadOf(r0)} unread adjustment log${unreadOf(r0) === 1 ? "" : "s"}` : undefined}>
                            Manage
                            {unreadOf(r0) > 0 && <span className="vm-unread">{unreadOf(r0)}</span>}
                        </button>
                    )}
                </td>
            </tr>
        );
    };

    const closeAmounts = useCallback(() => setAmounts(null), []);
    const closeRemarks = useCallback(() => setRemarks(null), []);
    const closeEbir = useCallback(() => { setEbir(null); setCell(null); setPending(null); setHistory(null); setSnap(null); }, []);
    const closeHistory = useCallback(() => setHistory(null), []);
    const closePending = useCallback(() => setPending(null), []);
    const closeCell = useCallback(() => setCell(null), []);
    const closeUndeclare = useCallback(() => setUndeclare(null), []);

    return (
        <div className="vs">
            <section className="card vs-bar">
                <div className="vs-field">
                    <span>Declared Month</span>
                    <div className="vm-month">
                        <button type="button" className="vm-month-btn" onClick={() => goMonth(-1)} aria-label="Previous month" title="Previous month">‹</button>
                        <input type="month" className="input" value={month} onChange={(e) => { const m = e.target.value; setMonth(m); if (/^\d{4}-\d{2}$/.test(m)) load(m, m); }} aria-label="Declared month" />
                        <button type="button" className="vm-month-btn" onClick={() => goMonth(1)} aria-label="Next month" title="Next month">›</button>
                    </div>
                </div>
                <label className="vs-field">
                    <span>Status</span>
                    <select className="input" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                        <option value="0">All status</option>
                        {lookups.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </label>
                <label className="vs-field vs-grow">
                    <span>Find</span>
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client" />
                </label>
                <div className="vs-actions">
                    <button type="button" className="btn btn-primary" onClick={() => { load(); loadVm(month); }} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
                    <div className="vs-menu-wrap">
                        <button type="button" className="btn" onClick={() => setListMenu((m) => !m)} disabled={!shown.length || printing} aria-expanded={listMenu}>
                            {printing ? "Printing…" : "Print ▾"}
                        </button>
                        {listMenu && (
                            <div className="vs-menu" role="menu" onMouseLeave={() => setListMenu(false)}>
                                <button type="button" role="menuitem" onClick={() => printList("xlsx")}>Download XLSX</button>
                                <button type="button" role="menuitem" onClick={() => printList("pdf")}>Download PDF</button>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {error && <div className="alert-error vs-error" role="alert">{error} <button className="btn btn-sm" onClick={() => load()}>Try again</button></div>}

            {/* ---------- dashboard metrics ---------- */}
            <section className="vm-metrics" aria-label="VAT risk summary">
                {[
                    ["", "total", "Total Clients", metrics.total, null],
                    ["concern", "concern", "With Concerns", metrics.concern, null],
                    ["small", "small", "Small Risk", metrics.small, "1–10%"],
                    ["medium", "medium", "Medium Risk", metrics.medium, "10–15%"],
                    ["high", "high", "High Risk", metrics.high, "15%+"],
                    ["review", "review", "In Review", metrics.review, `${metrics.reviewLogs} log${metrics.reviewLogs === 1 ? "" : "s"} not resolved`],
                    ["pending", "pending", "Pending", metrics.pending, "status"],
                    ["resolved", "resolved", "Resolved", metrics.resolved, "status"],
                ].map(([pick, kind, label, n, sub]) => (
                    <button key={kind} type="button" className={`vm-metric is-${kind}${riskPick === pick ? " is-on" : ""}`}
                        onClick={() => setRiskPick(riskPick === pick ? "" : pick)} aria-pressed={riskPick === pick}>
                        <span className="vm-metric-ic"><MetricIcon kind={kind} /></span>
                        <span className="vm-metric-txt">
                            <b>{label}</b>
                            <strong>{n}</strong>
                            <small>{kind === "total" ? (riskPick ? "Show all" : "VAT clients") : `${metrics.total ? ((n / metrics.total) * 100).toFixed(1) : "0.0"}% of total${sub ? ` · ${sub}` : ""}`}</small>
                        </span>
                    </button>
                ))}
            </section>

            <section className="card vs-body">
                <div className="vs-scroll">
                    <table className="vs-table">
                        <colgroup>
                            <col className="vs-w0" /><col className="vs-w1" /><col className="vs-w2" />
                            {VIS.map((c) => <col key={c.key} className="vs-wn" />)}
                            <col className="vm-wv" /><col className="vm-wa" /><col className="vm-wr" /><col className="vm-wst" /><col className="vm-wact" />
                        </colgroup>
                        <thead>
                            <tr className="vs-groups">
                                <th className="vs-f0" rowSpan={2} /><th className="vs-f1" rowSpan={2}>#</th><th className="vs-f2 vs-left" rowSpan={2}>Client</th>
                                {GROUPS.map(([k, label]) => (
                                    <th key={k} colSpan={VIS.filter((c) => c.group === k).length} className={`vs-group is-${k}`}>
                                        {label}
                                        {k in wide && (
                                            <button type="button" className="vm-wide" onClick={() => setWide((w) => ({ ...w, [k]: !w[k] }))}
                                                aria-expanded={wide[k]} title={wide[k] ? "Show the total only" : "Show more columns"}>
                                                {wide[k] ? "Less" : "More"}
                                            </button>
                                        )}
                                    </th>
                                ))}
                                <th colSpan={3} className="vs-group vm-group">Zero out the Net VAT Payable</th>
                                <th rowSpan={2} className="vs-left">Status</th>
                                <th rowSpan={2} className="vs-left vm-act-h">Action{totalUnread > 0 && <span className="vm-unread-total" title="Unread adjustment logs">{totalUnread} unread</span>}</th>
                            </tr>
                            <tr className="vs-heads">
                                {VIS.map((c) => <th key={c.key} className={`vs-num${c.tone ? ` is-${c.tone}` : ""}`}>{c.label}</th>)}
                                <th className="vs-left">Adjust in</th><th className="vs-num">Amount to adjust</th><th className="vs-left">Risk</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((r, i) => (
                                <Fragment key={r.client_num}>
                                    {renderRow(r, i + 1, false)}
                                    {Array.isArray(branches[r.client_num]) && branches[r.client_num].map((b, k) => renderRow(b, `${i + 1}.${k + 1}`, true))}
                                </Fragment>
                            ))}
                            {!shown.length && (
                                <tr><td colSpan={VIS.length + 8} className="vs-empty">
                                    {loading ? "Loading…" : used ? "No VAT client found for this period." : "Pick a declared month."}
                                </td></tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr>
                                <th className="vs-f0" /><th className="vs-f1" /><th className="vs-f2 vs-left">Total · {shown.length} client{shown.length === 1 ? "" : "s"}</th>
                                {VIS.map((c) => (
                                    <th key={c.key} className={`vs-num${c.tone ? ` is-${c.tone}` : ""}`}>
                                        {c.key === "net_vat_payable" ? paren(totals[c.key]) : n2(totals[c.key])}
                                    </th>
                                ))}
                                <th />
                                <th className="vs-num">{n2(totals.adjust)}</th>
                                <th />
                                <th />
                                <th />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </section>

            {/* ---------- Manage: adjustment logs + status ---------- */}
            {manage && (() => {
                const row = manage.row;
                const a = adjOf(row);                                   // live: typing here changes the table too
                const k = riskOf(row, a);
                const st = manage.status || "Pending";
                const tt = a.amount ? (a.via === "sales" ? "Sales" : "Purchase") : "";
                return (
                    <>
                        <Modal title={`Manage · ${row.client_name}`} onClose={() => !manage.saving && setManage(null)} size="xlg"
                            footer={(
                                <div className="vs-foot vm-mfoot">
                                    <button type="button" className="btn" onClick={() => setManage(null)} disabled={manage.saving}>Close</button>
                                    <span style={{ flex: 1 }} />
                                    {isAuditor && (
                                        <>
                                            <button type="button" className="btn vm-btn-decline" onClick={() => setAsk("Declined")} disabled={manage.saving || st === "Declined"}>
                                                ✕ Decline
                                            </button>
                                            <button type="button" className="btn vm-btn-resolve" onClick={() => { setFinPick(manage.logs?.[0]?.id ?? null); setAsk("Resolved"); }} disabled={manage.saving || (st === "Resolved" && a.final)}
                                                title={st === "Resolved" && !a.final ? "Resolved before – pick the amounts to finalize" : undefined}>
                                                {st === "Resolved" ? (a.final ? "✓ Resolved" : "✓ Finalize amounts") : "✓ Resolve"}
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}>
                            <div className="vm-m">
                                {/* status strip */}
                                <div className={`vm-m-strip is-${st.toLowerCase()}`}>
                                    <div className="vm-m-who">
                                        <span className="vm-m-avatar">{(row.client_name || "?").slice(0, 1)}</span>
                                        <div>
                                            <b>{row.client_name}</b>
                                            <small>Declared month · {monthLabel(used?.from)}</small>
                                        </div>
                                    </div>
                                    <div className="vm-m-steps" aria-label={`Status: ${st}`}>
                                        <span className={`vm-m-step is-on`}><i>1</i>Pending</span>
                                        <span className="vm-m-line" />
                                        <span className={`vm-m-step ${st === "Resolved" ? "is-ok" : st === "Declined" ? "is-bad" : ""}`}>
                                            <i>{st === "Declined" ? "✕" : "✓"}</i>{st === "Declined" ? "Declined" : "Resolved"}
                                        </span>
                                    </div>
                                    {manage.statusInfo?.employee && (
                                        <small className="vm-m-by">{st} by {manage.statusInfo.employee} · {stamp(manage.statusInfo.timestamp)}</small>
                                    )}
                                </div>

                                {/* before → after */}
                                <div className="vm-m-flow">
                                    <div className="vm-m-card">
                                        <span>Actual Net VAT Payable</span>
                                        <b className={row.net_vat_payable < 0 ? "is-neg" : ""}>{paren(row.net_vat_payable)}</b>
                                        <small>as recorded</small>
                                    </div>
                                    <div className="vm-m-arrow">
                                        <span className={`vm-m-via is-${a.via}`}>{tt ? `${a.amount > 0 ? "+" : "−"} ${tt}` : "No change"}</span>
                                        <svg viewBox="0 0 80 16" aria-hidden="true"><path d="M0 8h74M66 2l8 6-8 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    </div>
                                    <div className="vm-m-card is-edit">
                                        <span>Adjusted Net VAT Payable</span>
                                        <label className="vm-m-field"><i>₱</i><MoneyBox value={a.target} label="Adjusted Net VAT Payable" onChange={(t) => setTarget(row, t)} className="vm-m-big" disabled={a.final} /></label>
                                        <small>{a.final ? "🔒 final – picked on Resolve" : "type the amount you want · Enter ↵"}</small>
                                    </div>
                                    <div className="vm-m-card is-edit is-amt">
                                        <span>Amount to adjust {tt && <em className={`vm-m-tag is-${a.via}`}>{tt}</em>}</span>
                                        <label className="vm-m-field"><i>₱</i><MoneyBox value={a.amount} label="Amount to adjust" onChange={(x) => setAmount(row, x)} className="vm-m-big" disabled={a.final} /></label>
                                        <small>{k.level === "ok" ? "nothing to adjust" : <span className={`vm-pill is-${k.level}`}>{RISK[k.level].label}<em>{pctText(k.pct)}</em></span>}</small>
                                    </div>
                                </div>

                                {/* remarks + save */}
                                <div className="vm-m-note">
                                    <textarea className="input" rows={2} value={manage.remarks} maxLength={2000} disabled={st === "Resolved"}
                                        onChange={(e) => setManage((m) => ({ ...m, remarks: e.target.value }))}
                                        placeholder={st === "Resolved" ? "Resolved – no more adjustment logs." : "Remarks – why is this adjustment needed?"} aria-label="Remarks" />
                                    <button type="button" className="btn btn-primary vm-m-save" onClick={() => setAsk("save")} disabled={manage.saving || !a.amount || st === "Resolved"}
                                        title={st === "Resolved" ? "Already resolved" : undefined}>
                                        {manage.saving ? "Saving…" : st === "Resolved" ? "🔒 Resolved" : "Save log"}
                                    </button>
                                </div>

                                {/* history */}
                                <div className="vm-m-hist">
                                    <div className="vm-m-hist-h">
                                        <b>Adjustment history</b>
                                        <span>{manage.logs ? `${manage.logs.length} log${manage.logs.length === 1 ? "" : "s"}` : ""}</span>
                                    </div>
                                    {manage.error && <div className="alert-error">{manage.error}</div>}
                                    {manage.loading && <div className="vm-m-empty">Loading…</div>}
                                    {!manage.loading && !manage.logs?.length && (
                                        <div className="vm-m-empty">
                                            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8v4l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z" /></svg>
                                            <b>No adjustment saved yet</b>
                                            <small>Set the Adjusted Net VAT Payable, add a remark and press Save log.</small>
                                        </div>
                                    )}
                                    {!!manage.logs?.length && (
                                        <ol className="vm-m-tl">
                                            {manage.logs.map((l) => (
                                                <li key={l.id} className={`${l.is_read === false ? "is-unread" : ""}${a.final && a.logId === l.id ? " is-final" : ""}`}>
                                                    <span className={`vm-m-dot is-${String(l.trans_type).toLowerCase()}`} />
                                                    <div className="vm-m-tl-top">
                                                        <b>{l.employee || (l.employee_id ? `Employee #${l.employee_id}` : "—")}</b>
                                                        <span className={`vm-m-tag is-${l.trans_type === "Sales" ? "sales" : "purchases"}`}>{l.trans_type}</span>
                                                        {a.final && a.logId === l.id && <span className="vm-m-fin">🔒 Final</span>}
                                                        {l.is_read === false && <span className="vm-m-new">New</span>}
                                                        <time>{stamp(l.timestamp)}</time>
                                                    </div>
                                                    <div className="vm-m-tl-grid">
                                                        <div><span>Actual Net VAT Payable</span><b>{Math.abs(Number(l.actual_net_vat_payable) || 0) < 0.005 ? "0.00" : paren(l.actual_net_vat_payable)}</b></div>
                                                        <i>→</i>
                                                        <div><span>Adjusted Net VAT Payable</span><b className="strong">{Math.abs(Number(l.adjusted_net_vat_payable) || 0) < 0.005 ? "0.00" : paren(l.adjusted_net_vat_payable)}</b></div>
                                                        <div><span>Amount to adjust</span><b>{Number(l.amount_to_adjust) < 0 ? "−" : "+"} {n2(Math.abs(Number(l.amount_to_adjust) || 0))} <small>to {l.trans_type}</small></b></div>
                                                        <div><span>Declared month</span><b>{monthLabel(l.declared_month)}</b></div>
                                                    </div>
                                                    {l.remarks && <p>{l.remarks}</p>}
                                                </li>
                                            ))}
                                        </ol>
                                    )}
                                </div>
                            </div>
                        </Modal>
                        {ask === "Resolved" && (
                            <div className="vm-fin-back" role="dialog" aria-modal="true" aria-label="Resolve – finalize the amounts" onClick={(e) => e.target === e.currentTarget && setAsk(null)}>
                                <div className="vm-fin">
                                    <div className="vm-fin-h">
                                        <b>Resolve · finalize the amounts</b>
                                        <small>{row.client_name} · {monthLabel(used?.from)} — pick the adjustment that will show in the table. No more logs can be saved after this.</small>
                                    </div>
                                    {!manage.logs?.length ? (
                                        <div className="vm-m-empty"><b>No adjustment saved yet</b><small>Save a log first, then resolve.</small></div>
                                    ) : (
                                        <div className="vm-fin-list">
                                            {manage.logs.map((l) => (
                                                <label key={l.id} className={`vm-fin-opt${finPick === l.id ? " is-on" : ""}`}>
                                                    <input type="radio" name="vm-fin" checked={finPick === l.id} onChange={() => setFinPick(l.id)} />
                                                    <div className="vm-fin-body">
                                                        <div className="vm-m-tl-top">
                                                            <b>{l.employee || "—"}</b>
                                                            <span className={`vm-m-tag is-${l.trans_type === "Sales" ? "sales" : "purchases"}`}>{l.trans_type}</span>
                                                            <time>{stamp(l.timestamp)}</time>
                                                        </div>
                                                        <div className="vm-m-tl-grid">
                                                            <div><span>Net VAT Payable</span><b>{Math.abs(Number(l.adjusted_net_vat_payable) || 0) < 0.005 ? "0.00" : paren(l.adjusted_net_vat_payable)}</b></div>
                                                            <div><span>Adjust in</span><b>{l.trans_type === "Sales" ? "Sales" : "Purchases"}</b></div>
                                                            <div><span>Amount to adjust</span><b>{n2(l.amount_to_adjust)}</b></div>
                                                        </div>
                                                        {l.remarks && <p>{l.remarks}</p>}
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                    <div className="vm-fin-f">
                                        <button type="button" className="btn" onClick={() => setAsk(null)}>Cancel</button>
                                        <button type="button" className="btn vm-btn-resolve" disabled={!finPick || manage.saving}
                                            onClick={() => { const id = finPick; setAsk(null); setStatus("Resolved", id); }}>
                                            ✓ Resolve &amp; finalize
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {ask && ask !== "Resolved" && (
                            <ConfirmDialog
                                title={ask === "save" ? "Save log" : "Decline"}
                                message={ask === "save"
                                    ? `Are you sure you want to save this adjustment ? Net VAT Payable ${paren(row.net_vat_payable)} → ${Math.abs(a.target) < 0.005 ? "0.00" : paren(a.target)} (${a.amount < 0 ? "−" : "+"} ${n2(Math.abs(a.amount))} to ${tt}).`
                                    : `Are you sure you want to mark ${row.client_name} (${monthLabel(used?.from)}) as ${ask} ?${st === "Resolved" ? " The finalized amounts will be removed." : ""}`}
                                confirmLabel="Yes"
                                onCancel={() => setAsk(null)}
                                onConfirm={() => { const k = ask; setAsk(null); k === "save" ? saveLog() : setStatus(k); }}
                            />
                        )}
                    </>
                );
            })()}

            {/* ---------- documents behind one amount ---------- */}
            {amounts && (
                <Modal title={amounts.title} onClose={closeAmounts} size="lg">
                    <DocList state={amounts} />
                </Modal>
            )}

            {/* ---------- remarks ---------- */}
            {remarks && (
                <RemarksModal state={remarks} period={used ? rangeLabel(used.from, used.to) : ""} busy={busy}
                    onClose={closeRemarks} onSave={saveRemarks} />
            )}

            {/* ---------- E-BIR ---------- */}
            {ebir && (
                <Modal title={`E-BIR : ${ebir.row.client_name}`} onClose={closeEbir} size="xlg">
                    <EbirView state={ebir} range={used ? ebirRange(used.from, used.to) : ""} busy={busy || printing}
                        onMode={switchMode} onCell={openCell} onApprove={askApprove} onPending={() => openPending()}
                        onHistory={openHistory} canEdit={canEdit}
                        onPrintEbir={printEbir} onPrintList={printUndeclared} />
                </Modal>
            )}

            {/* ---------- documents behind one E-BIR cell ---------- */}
            {cell && (
                <Modal title={`Details : ${cell.name}`} onClose={closeCell} size="xlg">
                    <CellList state={cell} busy={busy} canEdit={canEdit}
                        onUndeclare={(docs) => setUndeclare({
                            items: docs.map((d) => ({ reference: d.reference, oldMonth: d.declared_month, whMonth: d.wh_declared_month || "", amount: d.amount })),
                            newMonth: nextMonth(docs[0].declared_month),
                            // one document: start with its own VT / IT month · many: blank = each keeps its own
                            whMonth: docs.length === 1 ? docs[0].wh_declared_month || "" : "",
                        })}
                        onUndo={(docs) => setConfirm({
                            kind: "undo", items: docs.map((d) => ({ reference: d.reference, oldMonth: d.declared_month })),
                        })} />
                </Modal>
            )}

            {/* ---------- all undeclared documents waiting for approval ---------- */}
            {pending && (
                <Modal title={`Undeclared transactions : ${ebir?.row?.client_name || ""}`} onClose={closePending} size="xlg">
                    <PendingList state={pending} busy={busy} canEdit={canEdit} period={used ? rangeLabel(used.from, used.to) : ""}
                        onUndo={(docs) => setConfirm({ kind: "undo", items: docs.map((d) => ({ reference: d.reference, oldMonth: d.old_declared_month })) })} />
                </Modal>
            )}

            {/* ---------- approval history ---------- */}
            {history && (
                <Modal title={`Approval history : ${ebir?.row?.client_name || ""}`} onClose={closeHistory} size="xlg">
                    <HistoryList state={history} period={used ? rangeLabel(used.from, used.to) : ""} onSnap={setSnap} onPrint={printUndeclared} busy={printing} />
                </Modal>
            )}

            {/* ---------- one approval: E-BIR before / after (same look as the E-BIR popup) ---------- */}
            {snap && (
                <Modal title={`Before / After : ${ebir?.row?.client_name || ""}`} onClose={() => setSnap(null)} size="full">
                    <SnapView group={snap} row={ebir?.row} onPrint={printUndeclared} busy={printing} />
                </Modal>
            )}

            {/* ---------- undeclare popup ---------- */}
            {undeclare && (
                <Modal title={undeclare.items.length > 1 ? `Undeclare ${undeclare.items.length} Transactions` : "Undeclare Transaction"} onClose={closeUndeclare}
                    footer={(
                        <div className="vs-foot">
                            <button type="button" className="btn" onClick={closeUndeclare}>Close</button>
                            <button type="button" className="btn btn-primary" onClick={saveUndeclare} disabled={busy}>
                                {busy ? "Saving…" : undeclare.items.length > 1 ? `Save (${undeclare.items.length})` : "Save"}
                            </button>
                        </div>
                    )}>
                    <div className="vs-form">
                        {undeclare.items.length === 1 ? (
                            <div className="vs-ref">Reference <b>{undeclare.items[0].reference}</b> · declared in <b>{monthLabel(undeclare.items[0].oldMonth)}</b></div>
                        ) : (
                            <div className="vs-ref">
                                <b>{undeclare.items.length} documents</b> · total <b>{n2(undeclare.items.reduce((t, it) => t + (Number(it.amount) || 0), 0))}</b>
                                {" "}· declared in <b>{[...new Set(undeclare.items.map((it) => monthLabel(it.oldMonth)))].join(", ")}</b>
                            </div>
                        )}
                        <label className="vs-field">
                            <span>Declared month</span>
                            <input type="month" className="input" value={undeclare.newMonth}
                                onChange={(e) => setUndeclare((u) => ({ ...u, newMonth: e.target.value }))} />
                        </label>
                        {(ebir?.data?.locked_months || []).includes(undeclare.newMonth) && (
                            <div className="vs-warn">{monthLabel(undeclare.newMonth)} is closed for this client — pick another month.</div>
                        )}
                        <label className="vs-field">
                            <span>VT / IT declared month</span>
                            <input type="month" className="input" value={undeclare.whMonth}
                                onChange={(e) => setUndeclare((u) => ({ ...u, whMonth: e.target.value }))} />
                        </label>
                        {undeclare.items.length > 1 && !undeclare.whMonth && (
                            <div className="vs-muted small">Leave VT / IT month blank to keep each document's own.</div>
                        )}
                    </div>
                </Modal>
            )}

            {confirm && (
                <ConfirmDialog
                    title={confirm.kind === "undo" ? "Undo" : "Approve"}
                    message={confirm.kind === "undo"
                        ? (confirm.items.length > 1
                            ? `Are you sure you want to undo these ${confirm.items.length} transactions ?`
                            : "Are you sure you want to undo this transaction ?")
                        : `Are you sure you want to approve this transaction ? ${ebir?.data?.pending_count || 0} undeclared document(s) will move to their new declared month.`}
                    confirmLabel={busy ? "Please wait…" : "Yes"}
                    onCancel={() => !busy && setConfirm(null)}
                    onConfirm={() => !busy && doConfirm()}
                />
            )}

            {pdf && (
                <Modal title={pdf.title} onClose={() => setPdf(null)} size="xlg"
                    footer={(
                        <div className="vs-foot">
                            <button type="button" className="btn" onClick={() => setPdf(null)}>Close</button>
                            <button type="button" className="btn btn-primary" onClick={savePdf}>Download PDF</button>
                        </div>
                    )}>
                    <iframe className="vsp-pdf" src={pdf.url} title={pdf.name} />
                </Modal>
            )}
        </div>
    );
}

/* =========================================================
   documents behind one amount (old modal_ViewAmount_Dtls)
   ========================================================= */
function DocList({ state }) {
    const [q, setQ] = useState("");
    const list = state.rows.filter((r) => `${r.vendor_name} ${r.document_no}`.toLowerCase().includes(q.trim().toLowerCase()));
    const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return (
        <div className="vs-docs">
            <div className="vs-docs-bar">
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or document no." />
                <span className="vs-muted">{list.length} document{list.length === 1 ? "" : "s"}</span>
            </div>
            {state.error && <div className="alert-error" role="alert">{state.error}</div>}
            <div className="vs-docs-scroll">
                <table className="vs-mini">
                    <thead><tr><th>Customer / Vendor name</th><th>Transaction date</th><th>Declared month</th><th>Document no.</th><th className="vs-num">Amount</th></tr></thead>
                    <tbody>
                        {state.loading && <tr><td colSpan={5} className="vs-empty">Loading…</td></tr>}
                        {!state.loading && !list.length && <tr><td colSpan={5} className="vs-empty">No documents.</td></tr>}
                        {list.map((r) => (
                            <tr key={r.id}>
                                <td>{r.vendor_name}</td><td>{fullDate(r.transaction_date)}</td><td>{monthLabel(r.declared_month)}</td>
                                <td className="vs-mono">{r.document_no}</td><td className="vs-num">{n2(r.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot><tr><th colSpan={4}>Total</th><th className="vs-num">{n2(total)}</th></tr></tfoot>
                </table>
            </div>
        </div>
    );
}

/* =========================================================
   remarks (old Quill editor → a small rich-text box)
   ========================================================= */
function RemarksModal({ state, period, busy, onClose, onSave }) {
    const box = useRef(null);
    useEffect(() => {
        if (!state.loading && box.current) box.current.innerHTML = state.html;
    }, [state.loading, state.html]);
    const cmd = (name, value = null) => {
        box.current?.focus();
        document.execCommand(name, false, value);
    };
    const tools = [
        ["bold", "B", "Bold"], ["italic", "I", "Italic"], ["underline", "U", "Underline"], ["strikeThrough", "S", "Strike"],
        ["insertOrderedList", "1.", "Numbered list"], ["insertUnorderedList", "•", "Bullet list"],
    ];
    return (
        <Modal title={`${state.row.client_name} - ${period}`} onClose={onClose} size="lg"
            footer={(
                <div className="vs-foot">
                    <button type="button" className="btn" onClick={onClose}>Close</button>
                    <button type="button" className="btn btn-primary" disabled={busy || state.loading} onClick={() => onSave(box.current?.innerHTML || "")}>
                        {busy ? "Saving…" : "Submit"}
                    </button>
                </div>
            )}>
            <div className="vs-editor">
                <div className="vs-tools" role="toolbar" aria-label="Formatting">
                    <select className="input" onChange={(e) => { cmd("formatBlock", e.target.value); e.target.value = ""; }} defaultValue="" aria-label="Text style">
                        <option value="" disabled>Text style</option>
                        <option value="H1">Heading</option><option value="H2">Subheading</option><option value="P">Normal</option>
                    </select>
                    {tools.map(([c, label, title]) => (
                        <button key={c} type="button" className={`vs-tool is-${c}`} title={title} aria-label={title}
                            onMouseDown={(e) => { e.preventDefault(); cmd(c); }}>{label}</button>
                    ))}
                </div>
                {state.loading
                    ? <div className="vs-area vs-muted">Loading…</div>
                    : <div ref={box} className="vs-area" contentEditable suppressContentEditableWarning aria-label="Remarks" />}
            </div>
        </Modal>
    );
}

/* =========================================================
   E-BIR table (old doGet2550MQ HTML)
   ========================================================= */
function EbirView({ state, range, busy, canEdit, onMode, onCell, onApprove, onPending, onHistory, onPrintEbir, onPrintList }) {
    const [menu, setMenu] = useState(false);
    const d = state.data;
    const months = d?.months || [];
    const adj = ebirAdjust(state);           // "See adjustment" → extra Adjustment column
    const cols = months.length + 3 + (adj ? 1 : 0);
    const adjCell = (key, total) => {
        if (!adj) return null;
        const v = adj(key, total);
        return (
            <td className={`vs-num vs-adj${v < 0 ? " is-neg" : v > 0 ? " is-pos" : ""}`} title="Adjusted − original">
                {Math.abs(v) < 0.005 ? "-" : `${v > 0 ? "+" : ""}${paren(v)}`}
            </td>
        );
    };
    const line = (cells, total, { cls = "", label, sub, click, akey } = {}) => (
        <tr className={cls}>
            <td className="vs-tag">{label}</td>
            <td className="vs-desc">{sub}</td>
            {months.map((m, i) => (
                <td key={m} className={`vs-num${(Number(cells?.[m]) || 0) < 0 ? " is-neg" : ""}`}>
                    {cells == null ? "" : click
                        ? <button type="button" className="vs-amt" onClick={() => click(m)}>{n2(cells[m])}</button>
                        : n2(cells[m])}
                </td>
            ))}
            <td className={`vs-num vs-total${(Number(total) || 0) < 0 ? " is-neg" : ""}`}>{total === "" ? "" : n2(total)}</td>
            {akey ? adjCell(akey, total) : adj ? <td className="vs-num vs-adj" /> : null}
        </tr>
    );
    const gap = (k) => <tr key={k} className="vs-gap"><td colSpan={cols} /></tr>;

    return (
        <div className="vs-ebir">
            <div className="vs-ebir-bar">
                <div className="vs-seg" role="group" aria-label="View">
                    <button type="button" className={state.mode === "initial" ? "is-on" : ""} onClick={() => state.mode !== "initial" && onMode("initial")} disabled={state.loading}>Original</button>
                    <button type="button" className={state.mode === "adjusted" ? "is-on" : ""} onClick={() => state.mode !== "adjusted" && onMode("adjusted")} disabled={state.loading}>See adjustment</button>
                </div>
                <span className="vs-range">{range}</span>
                <button type="button" className="vs-chip vs-chip-btn" onClick={onPending} disabled={!d} title={canEdit ? "See every undeclared document (From → To month) and undo them" : "See every undeclared document (From → To month)"}>
                    Undeclared amount <b>{n2(d?.undeclared_amount)}</b>
                </button>
                {!!d?.pending_count && (
                    <button type="button" className="vs-chip vs-chip-btn is-warn" onClick={onPending} title={canEdit ? "See them and undo" : "See them"}>
                        {d.pending_count} waiting for approval ›
                    </button>
                )}
                <div className="vs-ebir-actions">
                    <button type="button" className="btn vs-hist-btn" onClick={onHistory} disabled={!d} title="Approved undeclared documents">History</button>
                    {canEdit && <button type="button" className="btn btn-primary" onClick={onApprove} disabled={!d || busy}>Approve</button>}
                    <div className="vs-menu-wrap">
                        <button type="button" className="btn" onClick={() => setMenu((m) => !m)} disabled={!d || busy} aria-expanded={menu}>Print ▾</button>
                        {menu && (
                            <div className="vs-menu" role="menu" onMouseLeave={() => setMenu(false)}>
                                <button type="button" role="menuitem" onClick={() => { setMenu(false); onPrintEbir(); }}>E-BIR</button>
                                <button type="button" role="menuitem" onClick={() => { setMenu(false); onPrintList("sales"); }}>Sales (undeclared)</button>
                                <button type="button" role="menuitem" onClick={() => { setMenu(false); onPrintList("purchases"); }}>Purchases (undeclared)</button>
                                <button type="button" role="menuitem" onClick={() => { setMenu(false); onPrintList("expenses"); }}>Expenses (undeclared)</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {state.error && <div className="alert-error" role="alert">{state.error}</div>}
            {!d && <div className="vs-empty vs-ebir-empty">{state.loading ? "Loading the E-BIR table…" : ""}</div>}
            {d && (
                <div className={`vs-ebir-scroll${state.loading && !state.refreshing ? " is-loading" : ""}`}>
                    <table className="vs-ebir-table">
                        <thead>
                            <tr>
                                <th className="vs-tag">Tag</th><th className="vs-desc">Summary data</th>{months.map((m) => <th key={m} className="vs-num">{monthHead(m)}</th>)}<th className="vs-num">Total</th>
                                {adj && <th className="vs-num vs-adj" title="Adjusted total − original total">Adjustment</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {d.sections.map((s) => (
                                <Fragment key={s.tag}>
                                    {s.rows.map((r) => (
                                        <Fragment key={r.code}>
                                            {line(r.values, r.total, {
                                                label: s.tag, sub: r.name, akey: `r|${s.tag}|${r.code}`,
                                                click: (m) => onCell({ type: s.tag, code: r.code, month: m, name: `${s.tag} · ${r.name} · ${monthLabel(m)}` }),
                                            })}
                                        </Fragment>
                                    ))}
                                    <Fragment>{line(s.subtotal.values, s.subtotal.total, { cls: "vs-sub is-section", label: s.tag, sub: "", akey: `s|${s.tag}` })}</Fragment>
                                    {gap(`g-${s.tag}`)}
                                </Fragment>
                            ))}
                            {line(d.total_purchase_exp.values, d.total_purchase_exp.total, { cls: "vs-sub", label: "Total Purchases/Expenses", akey: "total_purchase_exp" })}
                            {gap("g-pe")}
                            {line(d.net_total.values, d.net_total.total, { cls: "vs-sub", label: "Net Total", akey: "net_total" })}
                            {gap("g-net")}
                            {line(d.output_vat.values, d.output_vat.total, {
                                cls: "is-out", label: "Output VAT", akey: "output_vat",
                                click: (m) => onCell({ type: "OutputVAT", code: "OutputVAT", month: m, name: `Output VAT · ${monthLabel(m)}` }),
                            })}
                            {line(d.input_vat.values, d.input_vat.total, { cls: "is-in", label: "Input VAT", akey: "input_vat" })}
                            {line(d.vat_due.values, d.vat_due.total, { cls: "vs-sub", label: "VAT Due", akey: "vat_due" })}
                            <tr className="vs-less"><td className="vs-tag">Less : Tax Paid</td><td colSpan={cols - 1} /></tr>
                            {line(null, d.first_month, { sub: "1st month", akey: "first_month" })}
                            {line(null, d.second_month, { sub: "2nd month", akey: "second_month" })}
                            {line(d.vt_2307.values, d.vt_2307.total, { sub: "2307 (VT)", akey: "vt_2307" })}
                            <tr className="vs-grand">
                                <td className="vs-tag" colSpan={2}>TOTAL VAT PAYABLE / (EXCESS)</td>
                                {months.map((m) => {
                                    const v = payableOfMonth(d, m);
                                    return <td key={m} className={`vs-num${v < 0 ? " is-neg" : ""}`}>{paren(v) === "-" ? "0.00" : paren(v)}</td>;
                                })}
                                <td className={`vs-num vs-total${d.vat_payable < 0 ? " is-neg" : ""}`}>{paren(d.vat_payable) === "-" ? "0.00" : paren(d.vat_payable)}</td>
                                {adjCell("vat_payable", d.vat_payable)}
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
            {d && <p className="vs-hint">{canEdit ? "Click an amount to see its documents and undeclare / undo them." : "Click an amount to see its documents. Data analysts can view only."} {state.mode === "adjusted" ? "Showing the adjusted figures (undeclared documents moved to their new month). Adjustment = adjusted total − original total." : ""}</p>}
        </div>
    );
}

/* =========================================================
   documents behind one E-BIR cell (old modal_View_Details)
   ========================================================= */
// VATSummary.jsx – replace the whole `function CellList(...) { ... }` with this one,
// and add at the top with the other imports:
//   import ColumnFilter, { distinct } from "../../components/ColumnFilter";

function CellList({ state, busy, canEdit, onUndeclare, onUndo }) {
    const [q, setQ] = useState("");
    const [picked, setPicked] = useState([]);            // keys of ticked documents
    const [filters, setFilters] = useState({});          // column → Set of allowed values
    const [sort, setSort] = useState({ col: "", dir: null });
    const keyOf = (r) => `${r.trans_type}|${r.reference}`;
    const sum = (rows) => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    // every column: value (for sort / filter) + what the filter list shows
    const COLS = [
        { k: "date", label: "Date", get: (r) => String(r.transaction_date || "").slice(0, 10), show: (v) => (v ? fullDate(v) : "N/A") },
        { k: "doc", label: "Doc #", get: (r) => String(r.document_no || "") },
        { k: "ref", label: "Reference", get: (r) => String(r.reference || "") },
        { k: "name", label: "Customer / Vendor", get: (r) => r.fullname || "N/A" },
        { k: "module", label: "Module", get: (r) => r.trans_type || "" },
        { k: "itvt", label: "VT / IT", get: (r) => Number(r.itvt_amount) || 0, show: n2, num: true },
        { k: "month", label: "VT / IT declared month", get: (r) => r.wh_declared_month || "", show: (v) => (v ? monthLabel(v) : "N/A") },
        { k: "amount", label: "Amount", get: (r) => Number(r.amount) || 0, show: n2, num: true },
        { k: "status", label: canEdit ? "Action" : "Status", get: (r) => (r.undeclared ? "Undeclared" : "Declared") },
    ];
    const colOf = (k) => COLS.find((c) => c.k === k);

    // search → column filters → sort
    const searched = useMemo(() => {
        const s = q.trim().toLowerCase();
        return state.rows.filter((r) => `${r.fullname} ${r.document_no} ${r.reference}`.toLowerCase().includes(s));
    }, [state.rows, q]);
    const passes = (r, skip) => Object.entries(filters).every(([k, set]) => k === skip || !set || set.has(colOf(k).get(r)));
    const list = useMemo(() => {
        const out = searched.filter((r) => passes(r));
        if (sort.dir) {
            const c = colOf(sort.col);
            const m = sort.dir === "asc" ? 1 : -1;
            out.sort((a, b) => {
                const x = c.get(a), y = c.get(b);
                return m * (c.num ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }));
            });
        }
        return out;
    }, [searched, filters, sort]); // eslint-disable-line react-hooks/exhaustive-deps

    const total = sum(list);
    const undeclaredTotal = sum(list.filter((r) => r.undeclared));

    // after the list reloads (undeclare / undo done) the ticks are cleared
    useEffect(() => { setPicked([]); }, [state.rows]);

    const ticked = list.filter((r) => picked.includes(keyOf(r)));
    const toUndeclare = ticked.filter((r) => !r.undeclared);
    const toUndo = ticked.filter((r) => r.undeclared);
    const allOn = list.length > 0 && list.every((r) => picked.includes(keyOf(r)));
    const toggleAll = () => setPicked(allOn ? picked.filter((k) => !list.some((r) => keyOf(r) === k)) : [...new Set([...picked, ...list.map(keyOf)])]);
    const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

    const filtered = Object.values(filters).some(Boolean) || !!sort.dir;
    const head = (k, cls = "") => {
        const c = colOf(k);
        // the list of one column follows the other filters (like Excel)
        const values = distinct(searched.filter((r) => passes(r, k)), c.get, c.show || ((v) => v));
        return (
            <th className={cls}>
                <ColumnFilter label={c.label} values={values} selected={filters[k] || null} align={c.num ? "right" : "left"}
                    onApply={(set) => setFilters((f) => ({ ...f, [k]: set }))}
                    sort={sort.col === k ? sort.dir : null}
                    onSort={(dir) => setSort({ col: dir ? k : "", dir })} />
            </th>
        );
    };

    return (
        <div className="vs-docs">
            <div className="vs-docs-bar">
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, doc # or reference" />
                {filtered && (
                    <button type="button" className="btn btn-sm" onClick={() => { setFilters({}); setSort({ col: "", dir: null }); }}>Clear filters</button>
                )}
                {canEdit && ticked.length > 0 && (
                    <div className="vs-bulk">
                        <span className="vs-muted">{ticked.length} selected · <b>{n2(sum(ticked))}</b></span>
                        {toUndeclare.length > 0 && (
                            <button type="button" className="btn btn-sm vs-undeclare" disabled={busy} onClick={() => onUndeclare(toUndeclare)}>
                                Undeclare ({toUndeclare.length})
                            </button>
                        )}
                        {toUndo.length > 0 && (
                            <button type="button" className="btn btn-sm vs-undo" disabled={busy} onClick={() => onUndo(toUndo)}>
                                Undo ({toUndo.length})
                            </button>
                        )}
                        <button type="button" className="btn btn-sm" onClick={() => setPicked([])}>Clear</button>
                    </div>
                )}
                <span className="vs-muted vs-docs-count">
                    {list.length}{list.length !== state.rows.length ? ` of ${state.rows.length}` : ""} document{state.rows.length === 1 ? "" : "s"}{state.refreshing ? " · updating…" : ""}
                </span>
            </div>
            {state.error && <div className="alert-error" role="alert">{state.error}</div>}
            <div className="vs-docs-scroll">
                <table className="vs-mini">
                    <thead>
                        <tr>
                            <th className="vs-check">
                                {canEdit && <input type="checkbox" checked={allOn} onChange={toggleAll} disabled={!list.length} aria-label="Select all documents" />}
                            </th>
                            {head("date")}{head("doc")}{head("ref")}{head("name")}{head("module")}
                            {head("itvt", "vs-num")}{head("month")}{head("amount", "vs-num")}{head("status", "vs-c")}
                        </tr>
                    </thead>
                    <tbody>
                        {state.loading && !state.rows.length && <tr><td colSpan={10} className="vs-empty">Loading…</td></tr>}
                        {!state.loading && !list.length && <tr><td colSpan={10} className="vs-empty">No documents.</td></tr>}
                        {list.map((r) => {
                            const k = keyOf(r);
                            return (
                                <tr key={k} className={`${r.undeclared ? "is-undeclared" : ""}${picked.includes(k) ? " is-picked" : ""}`}>
                                    <td className="vs-check">
                                        {canEdit && <input type="checkbox" checked={picked.includes(k)} onChange={() => toggle(k)} aria-label={`Select ${r.reference}`} />}
                                    </td>
                                    <td>{fullDate(r.transaction_date)}</td>
                                    <td className="vs-mono">{r.document_no}</td>
                                    <td className="vs-mono">{r.reference}</td>
                                    <td className="vs-name" title={r.fullname || ""}>{r.fullname || "N/A"}</td>
                                    <td>{r.trans_type}</td>
                                    <td className="vs-num">{n2(r.itvt_amount)}</td>
                                    <td>{r.wh_declared_month ? monthLabel(r.wh_declared_month) : "N/A"}</td>
                                    <td className="vs-num">{n2(r.amount)}</td>
                                    <td className="vs-c">
                                        {!canEdit
                                            ? (r.undeclared ? <span className="vs-tag-pend">Undeclared</span> : <span className="vs-muted">—</span>)
                                            : r.undeclared
                                                ? <button type="button" className="btn btn-sm vs-undo" disabled={busy} onClick={() => onUndo([r])}>Undo</button>
                                                : <button type="button" className="btn btn-sm vs-undeclare" disabled={busy} onClick={() => onUndeclare([r])}>Undeclare</button>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr><th /><th colSpan={7}>Total</th><th className="vs-num">{n2(total)}</th><th /></tr>
                        <tr className="vs-undeclared-total">
                            <th /><th colSpan={7}>Total undeclared</th><th className="vs-num">{n2(undeclaredTotal)}</th><th />
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

/* =========================================================
   every undeclared document of the client in the period (waiting for approval):
   what it is, From (declared month now) → To (where Approve moves it), undo one or many
   ========================================================= */
function PendingList({ state, busy, canEdit, period, onUndo }) {
    const [q, setQ] = useState("");
    const [picked, setPicked] = useState([]);            // ids of ticked rows
    const [mod, setMod] = useState("");                  // module filter
    const modules = [...new Set(state.rows.map((r) => r.module))];
    const list = state.rows.filter((r) =>
        (!mod || r.module === mod) &&
        `${r.fullname} ${r.document_no} ${r.reference}`.toLowerCase().includes(q.trim().toLowerCase()));
    const sum = (rows, k = "amount") => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);

    useEffect(() => { setPicked([]); }, [state.rows]);   // after an undo the list reloads → ticks cleared

    const ticked = list.filter((r) => picked.includes(r.id));
    const cols = canEdit ? 12 : 10;
    const allOn = list.length > 0 && list.every((r) => picked.includes(r.id));
    const toggleAll = () => setPicked(allOn ? picked.filter((id) => !list.some((r) => r.id === id)) : [...new Set([...picked, ...list.map((r) => r.id)])]);
    const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

    return (
        <div className="vs-docs">
            <div className="vs-docs-bar">
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, doc # or reference" />
                {modules.length > 1 && (
                    <select className="input vs-pend-mod" value={mod} onChange={(e) => setMod(e.target.value)} aria-label="Module">
                        <option value="">All modules</option>
                        {modules.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                )}
                {canEdit && ticked.length > 0 && (
                    <div className="vs-bulk">
                        <span className="vs-muted">{ticked.length} selected · net <b>{n2(sum(ticked))}</b></span>
                        <button type="button" className="btn btn-sm vs-undo" disabled={busy} onClick={() => onUndo(ticked)}>Undo ({ticked.length})</button>
                        <button type="button" className="btn btn-sm" onClick={() => setPicked([])}>Clear</button>
                    </div>
                )}
                <span className="vs-muted vs-docs-count">
                    {period} · {list.length} document{list.length === 1 ? "" : "s"}{state.refreshing ? " · updating…" : ""}
                </span>
            </div>
            {state.error && <div className="alert-error" role="alert">{state.error}</div>}
            <div className="vs-docs-scroll">
                <table className="vs-mini">
                    <thead>
                        <tr>
                            {canEdit && (
                                <th className="vs-check">
                                    <input type="checkbox" checked={allOn} onChange={toggleAll} disabled={!list.length} aria-label="Select all" />
                                </th>
                            )}
                            <th>Date</th><th>Doc #</th><th>Reference</th><th>Customer / Vendor</th><th>Module</th>
                            <th>Declared month</th><th>VT / IT month</th><th>Undeclared by</th>
                            <th className="vs-num" title="Net of VAT + VAT exempt + zero rated">Net amount</th><th className="vs-num">VAT</th>
                            {canEdit && <th className="vs-c">Action</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {state.loading && !state.rows.length && <tr><td colSpan={cols} className="vs-empty">Loading…</td></tr>}
                        {!state.loading && !list.length && <tr><td colSpan={cols} className="vs-empty">{state.rows.length ? "Nothing matches." : "No undeclared documents in this period."}</td></tr>}
                        {list.map((r) => (
                            <tr key={r.id} className={`is-undeclared${picked.includes(r.id) ? " is-picked" : ""}`}>
                                {canEdit && (
                                    <td className="vs-check">
                                        <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.reference}`} />
                                    </td>
                                )}
                                <td>{r.transaction_date ? fullDate(r.transaction_date) : "—"}</td>
                                <td className="vs-mono">{r.document_no || "—"}</td>
                                <td className="vs-mono">{r.reference}</td>
                                <td className="vs-name" title={r.fullname || ""}>{r.fullname || "N/A"}</td>
                                <td>{r.module}</td>
                                <td className="vs-move">
                                    <span className="vs-from">{monthLabel(r.old_declared_month)}</span>
                                    <span className="vs-arrow" aria-label="to">→</span>
                                    <span className="vs-to">{monthLabel(r.new_declared_month)}</span>
                                </td>
                                <td>{r.new_wh_declared_month ? monthLabel(r.new_wh_declared_month) : "—"}</td>
                                <td className="vs-who">{r.undeclared_by || "—"}{r.undeclared_at && <small>{r.undeclared_at}</small>}</td>
                                <td className="vs-num">{n2(r.amount)}</td>
                                <td className="vs-num">{n2(r.vat)}</td>
                                {canEdit && (
                                    <td className="vs-c">
                                        <button type="button" className="btn btn-sm vs-undo" disabled={busy} onClick={() => onUndo([r])}>Undo</button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            {canEdit && <th />}
                            <th colSpan={8}>Total{ticked.length ? ` · selected ${n2(sum(ticked))}` : ""}</th>
                            <th className="vs-num">{n2(sum(list))}</th><th className="vs-num">{n2(sum(list, "vat"))}</th>{canEdit && <th />}
                        </tr>
                    </tfoot>
                </table>
            </div>
            <p className="vs-hint">Declared month: where the document is declared now → where Approve will move it.{canEdit ? " Undo takes it back off the list." : ""} Net amount = net of VAT + VAT exempt + zero rated (no VAT).</p>
        </div>
    );
}

/* =========================================================
   approval history: one card per Approve (who / when), its documents From → To
   ========================================================= */
function HistoryList({ state, period, onSnap, onPrint, busy }) {
    const [q, setQ] = useState("");
    const needle = q.trim().toLowerCase();
    const groups = state.groups
        .map((g) => ({ ...g, shown: g.rows.filter((r) => `${r.fullname} ${r.document_no} ${r.reference} ${r.undeclared_by} ${g.approved_by}`.toLowerCase().includes(needle)) }))
        .filter((g) => g.shown.length);
    const when = (ts) => (ts ? `${fullDate(ts.slice(0, 10))} · ${ts.slice(11, 16)}` : "—");
    const [open, setOpen] = useState({});                 // all collapsed on first load
    const isOpen = (g) => !!needle || !!open[g.key];      // a search opens the matching approvals
    const toggle = (g) => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }));

    return (
        <div className="hs">
            <div className="hs-bar">
                <input className="input hs-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, doc #, reference or user" />
                <span className="hs-count">{period} · {state.groups.length} approval{state.groups.length === 1 ? "" : "s"}</span>
            </div>

            {state.error && <div className="alert-error" role="alert">{state.error}</div>}

            <div className="hs-wrap">
                <table className="hs-table">
                    <thead>
                        <tr>
                            <th>Customer / Vendor</th>
                            <th>Document</th>
                            <th>Module</th>
                            <th>Declared month</th>
                            <th>Undeclared by</th>
                            <th className="hs-num">Net amount</th>
                            <th className="hs-num">VAT</th>
                        </tr>
                    </thead>
                    {state.loading && <tbody><tr><td colSpan={7} className="hs-empty">Loading…</td></tr></tbody>}
                    {!state.loading && !groups.length && (
                        <tbody><tr><td colSpan={7} className="hs-empty">{state.groups.length ? "Nothing matches your search." : "No approvals in this period yet."}</td></tr></tbody>
                    )}
                    {groups.map((g) => (
                        <tbody key={g.key} className="hs-group">
                            <tr className={`hs-head${isOpen(g) ? " is-open" : ""}`} onClick={() => toggle(g)}>
                                <td colSpan={5}>
                                    <div className="hs-head-in">
                                        <button type="button" className="hs-caret" aria-expanded={isOpen(g)} aria-label={isOpen(g) ? "Hide documents" : "Show documents"}
                                            onClick={(e) => { e.stopPropagation(); toggle(g); }}>▸</button>
                                        <span className="hs-ok" aria-hidden="true">✓</span>
                                        <b>Approved {when(g.approved_at)}</b>
                                        <span className="hs-by">by {g.approved_by || "—"}</span>
                                        <span className="hs-docs">{g.count} document{g.count === 1 ? "" : "s"}</span>
                                        <span className="hs-tools" onClick={(e) => e.stopPropagation()}>
                                            {g.approval_no && <PrintMenu onPrint={(t) => onPrint(t, g)} busy={busy} />}
                                            {g.snapshot
                                                ? <button type="button" className="btn btn-sm hs-compare" onClick={() => onSnap(g)}>Compare before / after</button>
                                                : <span className="hs-na" title="Approved before the before / after summary was saved">No comparison saved</span>}
                                        </span>
                                    </div>
                                </td>
                                <td className="hs-num"><b>{n2(g.net)}</b></td>
                                <td className="hs-num"><b>{n2(g.vat)}</b></td>
                            </tr>
                            {isOpen(g) && g.shown.map((r) => (
                                <tr key={r.id} className="hs-row">
                                    <td className="hs-name" title={r.fullname || ""}>{r.fullname || "N/A"}</td>
                                    <td>
                                        <div>{r.document_no || "—"}</div>
                                        <small className="hs-ref">{r.reference}</small>
                                    </td>
                                    <td>{r.module}</td>
                                    <td className="hs-move">
                                        <span className="hs-from">{monthLabel(r.old_declared_month)}</span> → <b>{monthLabel(r.new_declared_month)}</b>
                                    </td>
                                    <td>
                                        <div>{r.undeclared_by || "—"}</div>
                                        {r.undeclared_at && <small className="hs-ref">{when(r.undeclared_at)}</small>}
                                    </td>
                                    <td className="hs-num">{n2(r.amount)}</td>
                                    <td className="hs-num">{n2(r.vat)}</td>
                                </tr>
                            ))}
                        </tbody>
                    ))}
                </table>
            </div>
        </div>
    );
}

/* =========================================================
   one approval: 2550-M/Q Summary BEFORE (left) and AFTER · Adjusted (right, + Adjustment)
   same layout as the E-BIR print, saved when it was approved
   ========================================================= */
const snapNum = (v) => (Math.abs(Number(v) || 0) < 0.005 ? "0" : n2(v));

function snapLines(d) {
    const L = [];
    (d.sections || []).forEach((sec) => {
        sec.rows.forEach((r) => L.push({ k: "row", tag: sec.tag, sub: r.name, cells: r.values, total: r.total, key: `r|${sec.tag}|${r.code}` }));
        L.push({ k: "sub", tag: sec.tag, sub: "Total", cells: sec.subtotal?.values, total: sec.subtotal?.total, key: `s|${sec.tag}` });
    });
    const one = (k, tag, sub, o, key) => L.push({ k, tag, sub, cells: o?.values, total: o?.total, key });
    one("sub", "Total Purchases/Expenses", "", d.total_purchase_exp, "total_purchase_exp");
    one("grand", "Net Total", "", d.net_total, "net_total");
    one("row", "Output VAT", "", d.output_vat, "output_vat");
    one("row", "Input VAT", "", d.input_vat, "input_vat");
    one("sub", "VAT Due", "", d.vat_due, "vat_due");
    L.push({ k: "less", tag: "Less : Tax Paid", sub: "1ST MONTH", cells: null, total: d.first_month, key: "first_month" });
    L.push({ k: "less", tag: "", sub: "2ND MONTH", cells: null, total: d.second_month, key: "second_month" });
    one("less", "", "2307 (VT)", d.vt_2307, "vt_2307");
    L.push({
        k: "grand pay", tag: "TOTAL VAT PAYABLE/EXCESS", sub: "",
        cells: Object.fromEntries((d.months || []).map((x) => [x, payableOfMonth(d, x)])), total: d.vat_payable, key: "vat_payable",
    });
    return L;
}

function SnapView({ group, row, onPrint, busy }) {
    const snap = group.snapshot;
    const [client, setClient] = useState(null);
    const period = ebirRange(snap.from, snap.to);
    // both tables share the same months (the server builds them from From to the month the documents moved to)
    const months = [...new Set([...(snap.old.months || []), ...(snap.new.months || [])])].sort();
    const before = snapLines(snap.old);
    const after = Object.fromEntries(snapLines(snap.new).map((l) => [l.key, l]));
    const same = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;
    const adjPill = (v) => (Math.abs(v) < 0.005
        ? <span className="sx2-zero">0</span>
        : <span className={`sx2-pill${v < 0 ? " is-neg" : " is-pos"}`}>{v > 0 ? "+" : "−"}{n2(Math.abs(v))}</span>);


    // company name / TIN / trade name for the header (same source as the E-BIR print)
    useEffect(() => {
        let live = true;
        if (!row) return undefined;
        apiFetch(`/reports/vat-clients/undeclared?${new URLSearchParams({
            client_id: row.client_id, client_num: row.client_num, from: snap.from, to: snap.to, type: "sales",
        })}`).then((r) => { if (live) setClient(r.client || null); }).catch(() => { });
        return () => { live = false; };
    }, [row, snap.from, snap.to]);

    return (
        <div className="sx2">
            <section className="sx2-top">
                <div className="sx2-co">
                    <span className="sx2-form">2550-M/Q Summary · {period}</span>
                    <h2>{client?.client_name || row?.client_name || ""}</h2>
                </div>
                <div className="sx2-meta">
                    <span><small>Approved</small><b>{group.approved_at ? `${fullDate(group.approved_at.slice(0, 10))} · ${group.approved_at.slice(11, 16)}` : "—"}</b></span>
                    <span><small>By</small><b>{group.approved_by || "—"}</b></span>
                    {group.approval_no && <PrintMenu onPrint={(t) => onPrint(t, group)} busy={busy} big />}
                </div>
            </section>


            <section className="sx2-sheet">
                <div className="sx2-scroll">
                    <table className="sx2-table">
                        <thead>
                            <tr>
                                <th rowSpan={2} className="sx2-tag">Tag</th><th rowSpan={2}>Summary Data</th>
                                <th colSpan={months.length + 1} className="sx2-grp sx2-grp-b">Before</th>
                                <th colSpan={months.length + 1} className="sx2-grp sx2-grp-a">After</th>
                                <th colSpan={months.length + 1} className="sx2-grp sx2-grp-adj">Adjustment</th>
                            </tr>
                            <tr>
                                {months.map((m, i) => <th key={`b${m}`} className={`sx2-num sx2-bh${i === 0 ? " is-first" : ""}`}>{monthHead(m)}</th>)}
                                <th className="sx2-num sx2-bh sx2-tot">Total</th>
                                {months.map((m, i) => <th key={`a${m}`} className={`sx2-num sx2-ah${i === 0 ? " is-first" : ""}`}>{monthHead(m)}</th>)}
                                <th className="sx2-num sx2-ah sx2-tot">Total</th>
                                {months.map((m, i) => <th key={`d${m}`} className={`sx2-num sx2-dh${i === 0 ? " is-first" : ""}`}>{monthHead(m)}</th>)}
                                <th className="sx2-num sx2-dh sx2-tot">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {before.map((b, i) => {
                                const a = after[b.key] || {};
                                const adj = r2((Number(a.total) || 0) - (Number(b.total) || 0));
                                const kinds = b.k.split(" ").map((c) => `is-${c}`).join(" ");
                                const sectionEnd = b.k === "sub" && b.key.startsWith("s|");
                                const pay = b.key === "vat_payable";
                                return (
                                    <tr key={i} className={`${kinds}${same(adj, 0) ? "" : " is-changed"}${sectionEnd ? " is-end" : ""}`}>
                                        <td className="sx2-tag">{b.tag}</td>
                                        <td className={b.k === "less" ? "sx2-r" : ""}>{b.sub}</td>
                                        {months.map((m, j) => (
                                            <td key={`b${m}`} className={`sx2-num sx2-b${j === 0 ? " is-first" : ""}`}>{b.cells ? snapNum(b.cells[m]) : ""}</td>
                                        ))}
                                        <td className="sx2-num sx2-b sx2-tot">{snapNum(b.total)}</td>
                                        {months.map((m, j) => (
                                            <td key={`a${m}`} className={`sx2-num sx2-a${j === 0 ? " is-first" : ""}${a.cells && b.cells && !same(b.cells[m], a.cells[m]) ? " is-diff" : ""}`}>
                                                {a.cells ? snapNum(a.cells[m]) : ""}
                                            </td>
                                        ))}
                                        <td className={`sx2-num sx2-a sx2-tot${!same(a.total, b.total) ? " is-diff" : ""}${pay ? " is-pay" : ""}`}>{snapNum(a.total)}</td>
                                        {/* Adjustment = after − before, per month and total (a move inside the period nets to 0 in the Total) */}
                                        {months.map((m, j) => (
                                            <td key={`d${m}`} className={`sx2-num sx2-adj${j === 0 ? " is-first" : ""}`}>
                                                {a.cells && b.cells ? adjPill(r2((Number(a.cells[m]) || 0) - (Number(b.cells[m]) || 0))) : ""}
                                            </td>
                                        ))}
                                        <td className="sx2-num sx2-adj sx2-tot">{adjPill(adj)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
            <p className="sx2-hint">Saved when it was approved. Before = original figures · After = with the undeclared documents moved to their new month · Adjustment = after − before.</p>
        </div>
    );
}

/* Print ▾ → Sales / Purchases / Expenses (undeclared) of one approval — same PDF as the E-BIR Print menu */
function PrintMenu({ onPrint, busy, big = false }) {
    const [open, setOpen] = useState(false);
    const wrap = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const off = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", off);
        return () => document.removeEventListener("mousedown", off);
    }, [open]);
    const pick = (t) => { setOpen(false); onPrint(t); };
    return (
        <div className="vs-menu-wrap pm" ref={wrap}>
            <button type="button" className={`btn ${big ? "" : "btn-sm "}pm-btn`} onClick={() => setOpen((o) => !o)} disabled={busy} aria-expanded={open}>
                {busy ? "Printing…" : "Print ▾"}
            </button>
            {open && (
                <div className="vs-menu pm-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => pick("sales")}>Sales (undeclared)</button>
                    <button type="button" role="menuitem" onClick={() => pick("purchases")}>Purchases (undeclared)</button>
                    <button type="button" role="menuitem" onClick={() => pick("expenses")}>Expenses (undeclared)</button>
                </div>
            )}
        </div>
    );
}