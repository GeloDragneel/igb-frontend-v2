// Reports → VAT Summary (old pages/Reports/VAT_Summary_Report.php)
// VAT clients with sales / purchases / VAT for the period · branch rows · documents behind each amount · remarks
// Client name → E-BIR (2550M/Q) table: original / adjusted view, documents per cell, undeclare / undo, approve, print.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { apiFetch, apiBlob } from "../../context/AuthContext";
import "./VATSummary.css";
import "./VATSummaryPrint.css";
import "./VATSummaryAdjust.css";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const today = new Date(); // Philippine time on the user's PC
const THIS_MONTH = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
const QUARTER_START = `${today.getFullYear()}-${pad(Math.floor(today.getMonth() / 3) * 3 + 1)}`;

const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dash = (v) => (Math.abs(Number(v) || 0) < 0.005 ? "-" : n2(v));
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
const nextMonth = (ym) => {
  const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/* the 12 amount columns (old table order) */
const COLS = [
  { key: "vatable_sales", label: "VATable Sales", group: "sales" },
  { key: "exempt_sales", label: "Exempt Sales", group: "sales" },
  { key: "zero_rated", label: "Zero Rated", group: "sales" },
  { key: "total_sales", label: "Total Sales", group: "sales", strong: true },
  { key: "vatable_purchases", label: "VATable Purchases", group: "pe" },
  { key: "vatable_expenses", label: "VATable Expenses", group: "pe" },
  { key: "exempt_purchase_exp", label: "Exempt Purch. / Exp.", group: "pe" },
  { key: "total_purchase_exp", label: "Total Purch. / Exp.", group: "pe", strong: true },
  { key: "output_vat", label: "Output VAT", group: "vat", tone: "out" },
  { key: "input_vat", label: "Input VAT", group: "vat", tone: "in" },
  { key: "creditable_wt", label: "2307 Creditable WT", group: "vat" },
  { key: "net_vat_payable", label: "Net VAT Payable", group: "vat", tone: "net", noLink: true },
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
export default function VATSummary() {
  const notify = useToast();
  const [from, setFrom] = useState(QUARTER_START);
  const [to, setTo] = useState(THIS_MONTH);
  const [statusId, setStatusId] = useState("0");
  const [daId, setDaId] = useState("0");
  const [query, setQuery] = useState("");
  const [lookups, setLookups] = useState({ statuses: [], analysts: [] });

  const [rows, setRows] = useState([]);
  const [used, setUsed] = useState(null); // the filters behind the rows shown
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [branches, setBranches] = useState({}); // client_num → rows | "loading"

  const [amounts, setAmounts] = useState(null); // documents behind one amount
  const [remarks, setRemarks] = useState(null);
  const [ebir, setEbir] = useState(null); // { row, mode, data, loading }
  const [cell, setCell] = useState(null); // documents behind one E-BIR cell
  const [undeclare, setUndeclare] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [pdf, setPdf] = useState(null);              // { url, name, title } PDF preview
  const [listMenu, setListMenu] = useState(false);   // Print ▾ on the client list
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    apiFetch("/reports/vat-clients/lookups").then(setLookups).catch(() => { });
  }, []);

  const load = useCallback(async (f = from, t = to, st = statusId, da = daId) => {
    if (!f || !t) return notify("Pick the From and To months.", "error");
    if (f > t) return notify("From must be on or before To.", "error");
    const my = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch(`/reports/vat-clients?${new URLSearchParams({ from: f, to: t, status_id: st, da_id: da })}`);
      if (my !== seq.current) return;
      setRows(r.rows || []);
      setUsed({ from: f, to: t });
      setBranches({});
    } catch (e) {
      if (my === seq.current) setError(e.message || "Couldn't load the VAT summary.");
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [from, to, statusId, daId, notify]);

  // first load + the old page reloaded when Status / Data analyst changed
  useEffect(() => { load(from, to, statusId, daId); }, [statusId, daId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.client_name} ${r.client_num} ${r.status} ${r.da_assigned.join(" ")}`.toLowerCase().includes(q));
  }, [rows, query]);

  const totals = useMemo(() => {
    const t = {};
    COLS.forEach((c) => { t[c.key] = shown.reduce((s, r) => s + Math.round((Number(r[c.key]) || 0) * 100) / 100, 0); });
    return t;
  }, [shown]);

  /* ---------- branch rows ---------- */
  const toggleBranches = async (r) => {
    if (branches[r.client_num]) {
      setBranches((b) => { const n = { ...b }; delete n[r.client_num]; return n; });
      return;
    }
    setBranches((b) => ({ ...b, [r.client_num]: "loading" }));
    try {
      const res = await apiFetch(`/reports/vat-clients/branches?${new URLSearchParams({ from: used.from, to: used.to, client_num: r.client_num })}`);
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
      const list = await apiFetch(`/reports/vat-clients/amounts?${new URLSearchParams({ type: col.key, user_ids: r.user_ids, from: used.from, to: used.to })}`);
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
  const loadEbir = useCallback(async (row, mode) => {
    setEbir((x) => ({ row, mode, data: x?.row === row ? x.data : null, base: x?.row === row ? x.base : null, loading: true }));
    const get = (m) => apiFetch(`/reports/vat-clients/ebir?${new URLSearchParams({
      user_ids: row.user_ids, client_id: row.client_id, caid: row.caid || "", from: used.from, to: used.to, mode: m,
    })}`);
    try {
      // "See adjustment" also needs the original numbers for the Adjustment column (adjusted − original)
      const [data, base] = mode === "adjusted" ? await Promise.all([get("adjusted"), get("initial")]) : [await get(mode), null];
      setEbir((x) => x && x.row === row ? { ...x, mode, data, base: mode === "adjusted" ? base : data, loading: false } : x);
    } catch (e) {
      setEbir((x) => x && { ...x, loading: false, error: e.message || "Couldn't load the E-BIR table." });
    }
  }, [used]);

  const switchMode = (mode) => {
    if (!ebir?.data) return;
    if (!ebir.data.pending_count) return notify("No adjustment in this transaction", "error");
    loadEbir(ebir.row, mode);
  };

  const openCell = useCallback(async (spec) => {
    setCell({ ...spec, rows: [], loading: true });
    try {
      const list = await apiFetch(`/reports/vat-clients/ebir/details?${new URLSearchParams({
        user_ids: ebir.row.user_ids, month: spec.month, type: spec.type, code: spec.code,
      })}`);
      setCell((c) => c && { ...c, rows: list, loading: false });
    } catch (e) {
      setCell((c) => c && { ...c, loading: false, error: e.message || "Couldn't load the documents." });
    }
  }, [ebir]);

  const afterChange = async () => {
    if (cell) await openCell(cell);
    if (ebir) await loadEbir(ebir.row, ebir.mode);
  };

  const saveUndeclare = async () => {
    const u = undeclare;
    if (!u.newMonth) return notify("Declared Month is required", "error");
    if ((ebir?.data?.locked_months || []).includes(u.newMonth)) return notify("Declared Month is disabled", "error");
    setBusy(true);
    try {
      await apiFetch("/reports/vat-clients/undeclare", {
        method: "POST",
        body: JSON.stringify({
          reference_no: u.reference, old_declared_month: u.oldMonth, new_declared_month: u.newMonth,
          new_wh_declared_month: u.whMonth || null, client_id: ebir.row.client_id, caid: ebir.row.caid,
        }),
      });
      setUndeclare(null);
      notify("Record successfully undeclared", "success");
      await afterChange();
    } catch (e) {
      notify(e.message || "Couldn't undeclare the transaction.", "error");
    } finally {
      setBusy(false);
    }
  };

  const doConfirm = async () => {
    const c = confirm;
    setBusy(true);
    try {
      if (c.kind === "undo") {
        const r = await apiFetch("/reports/vat-clients/undo", {
          method: "POST", body: JSON.stringify({ reference_no: c.reference, old_declared_month: c.oldMonth }),
        });
        if (r.deleted > 0) notify("Record successfully updated", "success");
        setConfirm(null);
        await afterChange();
      } else {
        await apiFetch("/reports/vat-clients/approve", {
          method: "POST", body: JSON.stringify({ client_id: ebir.row.client_id, from: used.from, to: used.to }),
        });
        notify("Record successfully approved", "success");
        setConfirm(null);
        await loadEbir(ebir.row, "initial");
        load(used.from, used.to);
      }
    } catch (e) {
      notify(e.message || "Something went wrong.", "error");
    } finally {
      setBusy(false);
    }
  };

  const askApprove = () => {
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
    const head = ["#", "Client", ...COLS.map((c) => c.label), "Status", "DA Assigned", "Auditor Assigned"];
    const rowsOut = shown.map((r, i) => ({
      k: "row",
      c: [i + 1, r.client_name, ...COLS.map((c) => r2(r[c.key])), r.status || "", (r.da_assigned || []).join(", "), (r.auditor_assigned || []).join(", ")],
    }));
    rowsOut.push({ k: "total", c: ["", `TOTAL · ${shown.length} client(s)`, ...COLS.map((c) => r2(totals[c.key])), "", "", ""] });
    const file = `VAT-Summary-${used.from}-to-${used.to}`;
    const blob = await printFile({
      kind: "list", format, file, sheet: "VAT Summary",
      title: ["VAT Summary", rangeLabel(used.from, used.to)],
      head, money: COLS.map((_, i) => i + 2), rows: rowsOut,
    });
    if (format === "pdf") showPdf(blob, `${file}.pdf`, "VAT Summary - Print Preview");
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
    rowsOut.push(line("grand", "TOTAL VAT PAYABLE/EXCESS", "", null, d.vat_payable, "vat_payable"));
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
  const printUndeclared = (type) => run(async () => {
    const res = await apiFetch(`/reports/vat-clients/undeclared?${new URLSearchParams({
      client_id: ebir.row.client_id, client_num: ebir.row.client_num, from: used.from, to: used.to, type,
    })}`);
    if (!res.rows?.length) { notify("No undeclared found", "error"); return; }
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
    const file = `${title.replace(/\s+/g, "")}-Undeclared-${used.from}-to-${used.to}`;
    const blob = await printFile({
      kind: "undeclared", format: "pdf", file, sheet: title,
      title: [c.trade_name || ebir.row.client_name, c.street || "", `TIN : ${c.tin || ""}${c.branch_code ? `-${c.branch_code}` : ""}`,
      `${title} (Undeclared)`, `For the Period From ${used.from} to ${used.to}`],
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
  const renderRow = (r, num, child) => (
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
        <button type="button" className="vs-client" title={`${r.client_name} — open E-BIR`} onClick={() => loadEbir(r, "initial")}>
          {r.client_name}
        </button>
      </td>
      {COLS.map((c) => {
        const v = Number(r[c.key]) || 0;
        const text = c.key === "net_vat_payable" ? paren(v) : dash(v);
        const link = !child && !c.noLink && Math.abs(v) >= 0.005;
        return (
          <td key={c.key} className={`vs-num${c.tone ? ` is-${c.tone}` : ""}${c.strong ? " is-strong" : ""}${v < 0 ? " is-neg" : ""}`}>
            {link ? <button type="button" className="vs-amt" onClick={() => openAmount(r, c)}>{text}</button> : text}
          </td>
        );
      })}
      <td className="vs-status">{r.status && <span className="vs-pill">{r.status}</span>}</td>
      <td className="vs-c">
        {child ? "-" : <button type="button" className="vs-note" onClick={() => openRemarks(r)} aria-label={`Remarks for ${r.client_name}`}>•••</button>}
      </td>
      <td className="vs-people">{(r.da_assigned || []).map((n) => <div key={n}>{n}</div>)}</td>
      <td className="vs-people">{(r.auditor_assigned || []).map((n) => <div key={n}>{n}</div>)}</td>
    </tr>
  );

  const closeAmounts = useCallback(() => setAmounts(null), []);
  const closeRemarks = useCallback(() => setRemarks(null), []);
  const closeEbir = useCallback(() => { setEbir(null); setCell(null); }, []);
  const closeCell = useCallback(() => setCell(null), []);
  const closeUndeclare = useCallback(() => setUndeclare(null), []);

  return (
    <div className="vs">
      <section className="card vs-bar">
        <label className="vs-field">
          <span>From</span>
          <input type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="vs-field">
          <span>To</span>
          <input type="month" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="vs-field">
          <span>Status</span>
          <select className="input" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            <option value="0">All status</option>
            {lookups.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="vs-field">
          <span>Data analyst</span>
          <select className="input" value={daId} onChange={(e) => setDaId(e.target.value)}>
            <option value="0">All</option>
            {lookups.analysts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="vs-field vs-grow">
          <span>Find</span>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client, status or DA" />
        </label>
        <div className="vs-actions">
          <button type="button" className="btn btn-primary" onClick={() => load()} disabled={loading}>{loading ? "Loading…" : "Search"}</button>
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

      <section className="card vs-body">
        <div className="vs-scroll">
          <table className="vs-table">
            <colgroup>
              <col className="vs-w0" /><col className="vs-w1" /><col className="vs-w2" />
              {COLS.map((c) => <col key={c.key} className="vs-wn" />)}
              <col className="vs-ws" /><col className="vs-wr" /><col className="vs-wp" /><col className="vs-wp" />
            </colgroup>
            <thead>
              <tr className="vs-groups">
                <th className="vs-f0" rowSpan={2} /><th className="vs-f1" rowSpan={2}>#</th><th className="vs-f2 vs-left" rowSpan={2}>Client</th>
                {GROUPS.map(([k, label, span]) => <th key={k} colSpan={span} className={`vs-group is-${k}`}>{label}</th>)}
                <th rowSpan={2} className="vs-left">Status</th><th rowSpan={2}>Remarks</th>
                <th rowSpan={2} className="vs-left">DA Assigned</th><th rowSpan={2} className="vs-left">Auditor Assigned</th>
              </tr>
              <tr className="vs-heads">
                {COLS.map((c) => <th key={c.key} className={`vs-num${c.tone ? ` is-${c.tone}` : ""}`}>{c.label}</th>)}
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
                <tr><td colSpan={COLS.length + 7} className="vs-empty">
                  {loading ? "Loading…" : used ? "No VAT client found for this period." : "Pick a period and press Search."}
                </td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th className="vs-f0" /><th className="vs-f1" /><th className="vs-f2 vs-left">Total · {shown.length} client{shown.length === 1 ? "" : "s"}</th>
                {COLS.map((c) => (
                  <th key={c.key} className={`vs-num${c.tone ? ` is-${c.tone}` : ""}`}>
                    {c.key === "net_vat_payable" ? paren(totals[c.key]) : n2(totals[c.key])}
                  </th>
                ))}
                <th colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

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
            onMode={switchMode} onCell={openCell} onApprove={askApprove}
            onPrintEbir={printEbir} onPrintList={printUndeclared} />
        </Modal>
      )}

      {/* ---------- documents behind one E-BIR cell ---------- */}
      {cell && (
        <Modal title={`Details : ${cell.name}`} onClose={closeCell} size="xlg">
          <CellList state={cell} busy={busy}
            onUndeclare={(d) => setUndeclare({
              reference: d.reference, oldMonth: d.declared_month, newMonth: nextMonth(d.declared_month), whMonth: d.wh_declared_month || "",
            })}
            onUndo={(d) => setConfirm({ kind: "undo", reference: d.reference, oldMonth: d.declared_month })} />
        </Modal>
      )}

      {/* ---------- undeclare popup ---------- */}
      {undeclare && (
        <Modal title="Undeclare Transaction" onClose={closeUndeclare}
          footer={(
            <div className="vs-foot">
              <button type="button" className="btn" onClick={closeUndeclare}>Close</button>
              <button type="button" className="btn btn-primary" onClick={saveUndeclare} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          )}>
          <div className="vs-form">
            <div className="vs-ref">Reference <b>{undeclare.reference}</b> · declared in <b>{monthLabel(undeclare.oldMonth)}</b></div>
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
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "undo" ? "Undo" : "Approve"}
          message={confirm.kind === "undo"
            ? "Are you sure you want to undo this transaction ?"
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
function EbirView({ state, range, busy, onMode, onCell, onApprove, onPrintEbir, onPrintList }) {
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
        <span className="vs-chip">Undeclared amount <b>{n2(d?.undeclared_amount)}</b></span>
        {!!d?.pending_count && <span className="vs-chip is-warn">{d.pending_count} waiting for approval</span>}
        <div className="vs-ebir-actions">
          <button type="button" className="btn btn-primary" onClick={onApprove} disabled={!d || busy}>Approve</button>
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
        <div className={`vs-ebir-scroll${state.loading ? " is-loading" : ""}`}>
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
                {months.map((m) => <td key={m} />)}
                <td className={`vs-num vs-total${d.vat_payable < 0 ? " is-neg" : ""}`}>{paren(d.vat_payable) === "-" ? "0.00" : paren(d.vat_payable)}</td>
                {adjCell("vat_payable", d.vat_payable)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {d && <p className="vs-hint">Click an amount to see its documents and undeclare / undo them. {state.mode === "adjusted" ? "Showing the adjusted figures (undeclared documents moved to their new month). Adjustment = adjusted total − original total." : ""}</p>}
    </div>
  );
}

/* =========================================================
   documents behind one E-BIR cell (old modal_View_Details)
   ========================================================= */
function CellList({ state, busy, onUndeclare, onUndo }) {
  const [q, setQ] = useState("");
  const list = state.rows.filter((r) => `${r.fullname} ${r.document_no} ${r.reference}`.toLowerCase().includes(q.trim().toLowerCase()));
  const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return (
    <div className="vs-docs">
      <div className="vs-docs-bar">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, doc # or reference" />
        <span className="vs-muted">{list.length} document{list.length === 1 ? "" : "s"}</span>
      </div>
      {state.error && <div className="alert-error" role="alert">{state.error}</div>}
      <div className="vs-docs-scroll">
        <table className="vs-mini">
          <thead>
            <tr><th>Date</th><th>Doc #</th><th>Reference</th><th>Customer / Vendor</th><th>Module</th>
              <th className="vs-num">VT / IT</th><th>VT / IT declared month</th><th className="vs-num">Amount</th><th className="vs-c">Action</th></tr>
          </thead>
          <tbody>
            {state.loading && !state.rows.length && <tr><td colSpan={9} className="vs-empty">Loading…</td></tr>}
            {!state.loading && !list.length && <tr><td colSpan={9} className="vs-empty">No documents.</td></tr>}
            {list.map((r) => (
              <tr key={`${r.trans_type}|${r.reference}`} className={r.undeclared ? "is-undeclared" : ""}>
                <td>{fullDate(r.transaction_date)}</td>
                <td className="vs-mono">{r.document_no}</td>
                <td className="vs-mono">{r.reference}</td>
                <td className="vs-name" title={r.fullname || ""}>{r.fullname || "N/A"}</td>
                <td>{r.trans_type}</td>
                <td className="vs-num">{n2(r.itvt_amount)}</td>
                <td>{r.wh_declared_month ? monthLabel(r.wh_declared_month) : "N/A"}</td>
                <td className="vs-num">{n2(r.amount)}</td>
                <td className="vs-c">
                  {r.undeclared
                    ? <button type="button" className="btn btn-sm vs-undo" disabled={busy} onClick={() => onUndo(r)}>Undo</button>
                    : <button type="button" className="btn btn-sm vs-undeclare" disabled={busy} onClick={() => onUndeclare(r)}>Undeclare</button>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th colSpan={7}>Total</th><th className="vs-num">{n2(total)}</th><th /></tr></tfoot>
        </table>
      </div>
    </div>
  );
}