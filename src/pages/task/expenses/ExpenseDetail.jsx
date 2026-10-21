// Expenses / Expense Transaction page – same layout and flow as SalesDetail.jsx.
// The API returns the same field names as Sales (customers, sales_accounts, customer_id …),
// where "customer" means the vendor and "sales account" means the expense account.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ContactForm } from "../../setup/Contacts";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { useToast } from "../../../components/Toast";
import Icon from "../../../components/Icons";
import Modal, { Field } from "../../../components/Modal";
import Badge from "../../../components/Badge";
import SearchSelect from "../../../components/SearchSelect";
import { apiFetch, apiBlob, apiForm, apiUpload, useAuth } from "../../../context/AuthContext";
import { usePeriod } from "../../../context/PeriodContext";
import { auditTone } from "../Expenses";
import { ProductForm } from "../../setup/Product";
import PayBillModal from "../../../components/payments/PayBillModal";
import { isPayableAccount } from "../../../components/payments/paymentUtils";
import DuplicateDocModal from "../../../components/invoice/DuplicateDocModal";
/* =========================================================
   Lists for this page (vendors, items, expense accounts, ATC ...)
   Same shape as the Sales lookups. Kept 10 minutes per account.
   ========================================================= */
const LK_MAX_AGE = 10 * 60 * 1000;
const lkCache = { key: null, at: 0, data: null };

function useLookups() {
    const { user } = useAuth();
    const key = user ? `${user.type}-${user.id}-${user.caid ?? 0}` : null;
    const fresh = () => lkCache.key === key && lkCache.data && Date.now() - lkCache.at < LK_MAX_AGE;

    const [lookups, setL] = useState(() => (fresh() ? lkCache.data : null));
    const [error, setError] = useState("");

    const refresh = useCallback(async () => {
        if (!key) return;
        setError("");
        try {
            const data = await apiFetch("/expenses/lookups");
            Object.assign(lkCache, { key, at: Date.now(), data });
            setL(data);
        } catch (e) {
            setError(e.message || "Couldn't load lists.");
        }
    }, [key]);

    useEffect(() => {
        if (!key) return;
        if (fresh()) setL(lkCache.data);
        else refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, refresh]);

    const setLookups = useCallback((updater) => {
        setL((prev) => {
            const next = typeof updater === "function" ? updater(prev) : updater;
            Object.assign(lkCache, { key, at: Date.now(), data: next });
            return next;
        });
    }, [key]);

    return { lookups, setLookups, ready: !!lookups, error, refresh };
}
/* =========================================================
   Helpers
   ========================================================= */

const CURRENCY_OPTS = ["PHP", "USD", "EUR", "JPY"].map((c) => ({ value: c, label: c }));
const AUDITOR_DESIGNATIONS = [5, 10];
const FOR_PAYMENT_PATH = "/task/expenses/for-payment"; // change if your route is different

const AUDIT_CHOICES = [
    { id: 2, name: "AUDITED" },
    { id: 3, name: "REVERTED" },
];

const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const num4 = (n) => (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const today = () => new Date().toISOString().slice(0, 10);

const vatTypeOf = (taxName) => {
    const t = String(taxName || "").toLowerCase();
    if (t.includes("exempt")) return "exempt";
    if (t.includes("zero")) return "zero";
    if (t.includes("non")) return "nonvat";
    return "vatable";
};

const vatTypeOfLine = (l) =>
    Number(l.vat_exempt) > 0 ? "exempt" : Number(l.zero_rated) > 0 ? "zero" : Number(l.non_vat) > 0 ? "nonvat" : "vatable";

const vatTypeOfAccount = (name) => {
    const t = String(name || "").toLowerCase();
    if (t.includes("exempt")) return "exempt";
    if (t.includes("zero")) return "zero";
    if (t.includes("non vat") || t.includes("non-vat") || t.includes("nonvat")) return "nonvat";
    return "vatable";
};

// VAT type of a line: an account that says Exempt / Zero / Non-VAT decides;
// otherwise the item's own Tax Type (NonVAT item → Non VAT column, not VATable)
const lineVatType = (item, accountName) => {
    const byAccount = accountName ? vatTypeOfAccount(accountName) : "vatable";
    if (byAccount !== "vatable") return byAccount;
    return item ? vatTypeOf(item.tax_type) : "vatable";
};

const blankLine = () => ({ itemId: "", unitTypeId: null, qty: 1, price: 0, discount: 0, vatType: "vatable", accountCode: "" });

function lineCalc(l) {
    const gross = r4((Number(l.qty) || 0) * (Number(l.price) || 0));
    const amount = r4(gross - r4(l.discount));
    const out = { total: gross, outputVat: 0, netOfVat: 0, vatExempt: 0, nonVat: 0, zeroRated: 0 };
    if (l.vatType === "exempt") out.vatExempt = amount;
    else if (l.vatType === "zero") out.zeroRated = amount;
    else if (l.vatType === "nonvat") out.nonVat = amount;
    else {
        out.outputVat = r4((amount / 1.12) * 0.12);
        out.netOfVat = r4(amount - out.outputVat);
    }
    return out;
}

const atcRate = (atc) => {
    const r = Number(atc?.rate) || 0;
    return r > 1 ? r / 100 : r;
};

function invoiceCalc(f, atcList) {
    const used = f.lines.filter((l) => l.itemId);
    const c = used.map(lineCalc);
    const s = (k) => r4(c.reduce((n, x) => n + x[k], 0));
    const exRate = Number(f.exRate) || 1;

    const discount = r4(used.reduce((n, l) => n + (Number(l.discount) || 0), 0));
    const subTotal = r4((s("netOfVat") + s("vatExempt") + s("nonVat") + s("zeroRated")) * exRate);
    const vt = r4(subTotal * atcRate(atcList.find((a) => String(a.id) === String(f.atcVtId))));
    const it = r4(subTotal * atcRate(atcList.find((a) => String(a.id) === String(f.atcItId))));
    const total = r4(subTotal - (vt + it + discount));
    const linesNet = used.reduce((n, l) => n + (lineCalc(l).total - (Number(l.discount) || 0)), 0);
    const grandTotal = r4(linesNet * exRate - (vt + it));

    return { outputVat: s("outputVat"), subTotal, wtaxVT: vt, wtaxIT: it, discount, total, grandTotal };
}

const GRID_COLS = [
    { key: "itemId", label: "Item ID", width: "13%", type: "item", required: true },
    { key: "accountCode", label: "Accounts", width: "16%", type: "select", required: true },
    { key: "qty", label: "Qty", width: "5%", type: "num" },
    { key: "price", label: "Price", width: "8%", type: "num", required: true },
    { key: "total", label: "Total", width: "8%", type: "calc" },
    { key: "discount", label: "Discount", width: "7%", type: "num" },
    { key: "outputVat", label: "Input VAT", width: "7%", type: "calc" },
    { key: "netOfVat", label: "Net of VAT", width: "7.5%", type: "calc" },
    { key: "vatExempt", label: "VAT Exempt", width: "7%", type: "calc" },
    { key: "nonVat", label: "Non VAT", width: "7%", type: "calc" },
    { key: "zeroRated", label: "Zero Rated", width: "7%", type: "calc" },
];
const EDITABLE = GRID_COLS.map((c, i) => (c.type === "calc" || c.type === "ro" ? null : i)).filter((i) => i !== null);

/* =========================================================
   Page
   ========================================================= */
export default function ExpenseDetail() {
    const { id } = useParams();
    const location = useLocation();
    const invoiceNo = decodeURIComponent(id || "");
    const isNew = invoiceNo === "new";
    const { lookups, setLookups, ready, error: lkError, refresh } = useLookups();

    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (isNew) {
            setData(null);
            return;
        }
        let alive = true;
        setError("");
        setData(null);
        apiFetch(`/expenses/invoice/${encodeURIComponent(invoiceNo)}`)
            .then((inv) => alive && setData(inv))
            .catch((e) => alive && setError(e.status === 404 ? "404" : e.message || "Couldn't load the invoice."));
        return () => { alive = false; };
    }, [invoiceNo, isNew, reloadKey]);

    const lk = useMemo(() => {
        if (!lookups) return null;
        const c = !isNew && data?.invoice?.invoice_no === invoiceNo ? data?.customer : null;
        if (c && !lookups.customers.some((x) => x.id === c.id)) {
            return { ...lookups, customers: [...lookups.customers, c].sort((a, b) => a.name.localeCompare(b.name)) };
        }
        return lookups;
    }, [lookups, data, isNew, invoiceNo]);

    const current = isNew ? null : data?.invoice?.invoice_no === invoiceNo ? data : null;

    if (error === "404") {
        return (
            <div className="card not-found">
                <div className="nf-code">404</div>
                <h2>Invoice {invoiceNo} not found</h2>
                <p>It may have been deleted, or it belongs to another account.</p>
                <Link to={location.state?.from || "/task/expenses"} className="btn btn-primary">Back</Link>
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
    if (!ready || (!isNew && !current)) {
        return <InvoiceSkeleton />;
    }

    return (
        <InvoiceForm
            key={`${invoiceNo}-${reloadKey}-${location.state?.scan?.scan_id || ""}`}
            lookups={lk}
            setLookups={setLookups}
            data={current}
            onReload={() => setReloadKey((n) => n + 1)}
        />
    );
}

/* =========================================================
   Form
   ========================================================= */
function InvoiceForm({ lookups, setLookups, data, onReload }) {
    const navigate = useNavigate();
    const location = useLocation();
    const notify = useToast();
    const { user } = useAuth();
    const { from, to } = usePeriod();

    const inv = data?.invoice;
    const saved = !!inv;
    const pendingTicket = data?.ticket || null;
    const isBilling = String(inv?.trans_type || "").toLowerCase() === "billing";
    const isAuditor = AUDITOR_DESIGNATIONS.includes(Number(user?.designation_id));

    const backTo = location.state?.from || (isBilling ? FOR_PAYMENT_PATH : "/task/expenses");
    const navState = { state: { from: backTo } };

    // data from a scanned receipt (only for a new invoice)
    const scan = !saved ? location.state?.scan || null : null;
    // scanned receipt opened again (from Scanned Receipts / For Collection)
    const scanRec = saved && location.state?.fromScan ? data?.scan || null : null;
    const scanStatus = scan ? 0 : scanRec ? Number(scanRec.trans_status) : null; // same as old TransStatus
    const scanMode = scanStatus !== null;
    // split layout (fields left, file right): scanned receipts, and auditors (5 / 10) on saved invoices
    const splitView = scanMode || (isAuditor && saved);
    const scanFileId = scan?.scan_id || scanRec?.id || null;
    const scanFileName = scan?.filename || scanRec?.filename || "";
    const SCAN_LABEL = { 1: "confirmed", 2: "invalid", 3: "partially invalid" };
    // first line for a scanned receipt: the default item + its GL sales account
    const scanLine = () => {
        const item = lookups.items.find((i) => String(i.id) === String(scan?.default_item_id));
        if (!item) return blankLine();
        const accountCode = item.gl_sales_account || "";
        const acc = (lookups.sales_accounts || []).find((a) => a.account_code === accountCode);
        return {
            ...blankLine(),
            itemId: String(item.id),
            unitTypeId: item.unit_type_id,
            accountCode,
            vatType: lineVatType(item, acc?.account_name),
        };
    };
    // new expense default: Accounts = Cash / Cash on Hand (the item stays empty)
    const defaultCashAccount = () => {
        const list = lookups.accounts || [];
        const name = (a) => String(a.account_name || "").trim();
        const hit = list.find((a) => /^cash on hand$/i.test(name(a)))
            || list.find((a) => /^cash$/i.test(name(a)))
            || list.find((a) => /cash on hand/i.test(name(a)))
            || list.find((a) => /^cash\b/i.test(name(a)) && !/bank|receivable|payable|advance/i.test(name(a)));
        return hit?.account_code || "";
    };
    const [f, setF] = useState(() =>
        inv
            ? {
                id: inv.id,
                invoiceNo: inv.invoice_no,
                documentNo: inv.document_no || "",
                date: String(inv.transaction_date || today()).slice(0, 10),
                declaredMonth: inv.declared_month_ym || String(inv.transaction_date || today()).slice(0, 7),
                customerId: inv.customer_id ? String(inv.customer_id) : "",
                currency: inv.currency || "PHP",
                exRate: Number(inv.ex_rate) || 1,
                status: inv.status_name || "UNPAID",
                auditStatus: inv.audit_status_name || "",
                remarks: inv.remarks || "",
                documentTypeId: inv.document_type_id ? String(inv.document_type_id) : "",
                accountCode: inv.account_code || "",
                attachment: inv.attachment || "",
                atcVtId: inv.atc_vt_id ? String(inv.atc_vt_id) : "",
                atcVtMonth: inv.vt_month_ym || "",
                atcItId: inv.atc_it_id ? String(inv.atc_it_id) : "",
                atcItMonth: inv.it_month_ym || "",
                discountTypeId: inv.discount_type_id ? String(inv.discount_type_id) : "",
                discountAmt: Number(inv.discount_amount) || 0,
                lines: data.lines.length
                    ? data.lines.map((l) => ({
                        itemId: l.item_id ? String(l.item_id) : "",
                        unitTypeId: l.unit_type_id,
                        qty: Number(l.quantity) || 0,
                        price: Number(l.unit_price) || 0,
                        discount: Number(l.discount_amount) || 0,
                        vatType: vatTypeOfLine(l),
                        accountCode: l.account_code || "",
                    }))
                    : [blankLine()],
            }
            : {
                id: null,
                invoiceNo: "",
                documentNo: scan?.document_no || "",
                date: today(),
                declaredMonth: today().slice(0, 7),
                customerId: scan?.customer_id ? String(scan.customer_id) : "",
                currency: "PHP",
                exRate: 1,
                status: "NEW",
                auditStatus: "",
                remarks: "",
                documentTypeId: "",
                accountCode: scan ? "12102" : defaultCashAccount(),
                attachment: scan?.filename || "",
                atcVtId: "", atcVtMonth: "",
                atcItId: "", atcItMonth: "",
                discountTypeId: "",
                discountAmt: 0,
                lines: [scan ? scanLine() : blankLine()],
            }
    );
    const previewSrc = scanMode
        ? `/expenses/scanned/${scanFileId}/file`
        : f.attachment ? `/expenses/${f.id}/attachment` : "/expenses/blank-attachment"; // empty → blank.pdf
    const previewName = scanMode ? scanFileName : f.attachment;
    const [errors, setErrors] = useState({});
    const [saveError, setSaveError] = useState("");
    const [saving, setSaving] = useState(false);
    const [newCustomer, setNewCustomer] = useState(null);
    const [newItem, setNewItem] = useState(null);
    const [showAudit, setShowAudit] = useState(false);
    const [showAttachment, setShowAttachment] = useState(false);
    const [showTicket, setShowTicket] = useState(false);
    const [pendingFile, setPendingFile] = useState(null);
    const [review, setReview] = useState(null);
    const [ticket, setTicket] = useState(null);
    const [payOpen, setPayOpen] = useState(false);
    const [reasonFor, setReasonFor] = useState(null);
    const [confirmPost, setConfirmPost] = useState(false);
    const [atcVTOpen, setAtcVTOpen] = useState(() => !!f.atcVtId);
    const [atcITOpen, setAtcITOpen] = useState(() => !!f.atcItId);
    const fileRef = useRef(null);

    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
    const setLine = (i, patch) => setF((x) => ({ ...x, lines: x.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));

    const locked = /VOID|CANCEL/i.test(f.status) || !!pendingTicket || (scanMode && scanStatus !== 0 && scanStatus !== 4);
    const calc = invoiceCalc(f, lookups.atc);

    const itemsById = useMemo(() => Object.fromEntries(lookups.items.map((i) => [String(i.id), i])), [lookups.items]);
    const salesAccounts = lookups.sales_accounts || [];
    const cust = lookups.customers.find((c) => String(c.id) === String(f.customerId));
    const selectedAccount = (lookups.accounts || []).find((a) => a.account_code === f.accountCode);
    const isPayable = /payable/i.test(selectedAccount?.account_name || "");
    const attachmentName = pendingFile?.name || f.attachment || "";
    const hasAttachment = !!attachmentName;

    /* ---------- previous / next invoice (auditors only) ---------- */
    const [nav, setNav] = useState({ prev: null, next: null });
    useEffect(() => {
        if (!isAuditor || !inv?.invoice_no) return;
        apiFetch(`/expenses/invoice/${encodeURIComponent(inv.invoice_no)}/neighbors?from=${from.slice(0, 7)}&to=${to.slice(0, 7)}`)
            .then(setNav)
            .catch(() => setNav({ prev: null, next: null }));
    }, [isAuditor, inv?.invoice_no, from, to]);
    const goTo = (no) => no && navigate(`/task/expenses/${encodeURIComponent(no)}`, navState);

    /* ---------- dropdown options ---------- */
    const customerOpts = [
        { value: "", label: "— None —" },
        ...lookups.customers.map((c) => ({ value: String(c.id), label: c.name, hint: [c.tin, c.branch_code].filter(Boolean).join(" · ") })),
    ];
    const itemOpts = lookups.items.map((i) => ({ value: String(i.id), label: `${i.description}` }));
    const accountOpts = salesAccounts.map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` }));
    const debitOpts = [
        { value: "", label: "— None —" },
        ...lookups.accounts.map((a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` })),
    ];
    const docOpts = [{ value: "", label: "— None —" }, ...lookups.document_types.map((d) => ({ value: String(d.id), label: d.name }))];
    const atcOpts = [
        { value: "", label: "None" },
        ...lookups.atc.map((a) => ({
            value: String(a.id),
            label: `${a.name} (${(atcRate(a) * 100).toFixed(2).replace(/\.00$/, "")}%)`,
        })),
    ];
    const discountOpts = [
        { value: "", label: "None" },
        { value: "1", label: "Senior Citizen" },
        { value: "2", label: "PWD" },
        { value: "3", label: "Others" },
    ];

    /* ---------- lines ---------- */
    const vatTypeForAccount = (code, item) => {
        const acc = salesAccounts.find((a) => a.account_code === code);
        return lineVatType(item, acc?.account_name);
    };

    const applyItem = (i, item) => {
        const accountCode = item.gl_sales_account || f.lines[i]?.accountCode || accountOpts[0]?.value || "";
        setLine(i, {
            itemId: String(item.id),
            unitTypeId: item.unit_type_id,
            price: Number(item.price) || 0,
            accountCode,
            vatType: vatTypeForAccount(accountCode, item),
        });
    };

    const pickItem = (i, id) => {
        setErrors((e) => ({ ...e, [`line${i}`]: undefined }));
        const item = itemsById[id];
        if (item) applyItem(i, item);
    };

    const changeLine = (i, patch) => {
        if ("accountCode" in patch) {
            patch = { ...patch, vatType: vatTypeForAccount(patch.accountCode, itemsById[f.lines[i]?.itemId]) };
        }
        setLine(i, patch);
    };

    const addItem = () => setF((x) => ({ ...x, lines: [...x.lines, blankLine()] }));
    const removeItem = (i) => setF((x) => ({ ...x, lines: x.lines.length > 1 ? x.lines.filter((_, idx) => idx !== i) : [blankLine()] }));

    const onPickFile = (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) return notify("File is too big (max 10 MB).", "error");
        setPendingFile(file);
    };

    /* ---------- save ---------- */
    const validate = ({ allowZeroPrice = false } = {}) => {
        const e = {};
        if (!f.customerId) e.customerId = "Vendor is required.";
        if (!f.date) e.date = "Invoice Date is required.";
        if (!/^\d{4}-\d{2}$/.test(f.declaredMonth)) e.declaredMonth = "Declared Month is required.";
        if (!String(f.documentNo || "").trim()) e.documentNo = "Document # is required.";
        if (!String(f.accountCode || "").trim()) e.accountCode = "Accounts is required.";

        const lockedMonths = lookups.locked_months || [];
        if (
            lockedMonths.includes(f.declaredMonth) ||
            (f.atcVtId && lockedMonths.includes(f.atcVtMonth)) ||
            (f.atcItId && lockedMonths.includes(f.atcItMonth))
        ) {
            e.declaredMonth = "Declared Month is disabled.";
        }

        if (f.lines.filter((l) => l.itemId).length === 0) e.lines = "At least one item is required.";
        f.lines.forEach((l, i) => {
            if (!l.itemId) return;
            if (!allowZeroPrice && !(Number(l.price) > 0)) e[`line${i}`] = "Price must be greater than 0.";
        });

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const buildBody = () => ({
        customer_id: f.customerId ? Number(f.customerId) : null,
        transaction_date: f.date,
        declared_month: f.declaredMonth,
        document_no: f.documentNo || null,
        document_type_id: f.documentTypeId ? Number(f.documentTypeId) : null,
        account_code: f.accountCode || null,
        currency: f.currency,
        ex_rate: Number(f.exRate),
        remarks: f.remarks || null,
        mobile_transaction_id: scan?.scan_id || null,
        attachment: scan?.filename || null,
        atc_vt_id: f.atcVtId ? Number(f.atcVtId) : null,
        atc_it_id: f.atcItId ? Number(f.atcItId) : null,
        vt_month: f.atcVtId && f.atcVtMonth ? f.atcVtMonth : null,
        it_month: f.atcItId && f.atcItMonth ? f.atcItMonth : null,
        discount_type_id: f.discountTypeId ? Number(f.discountTypeId) : null,
        sub_total: calc.subTotal,
        "2307_vt": calc.wtaxVT,
        "2307_it": calc.wtaxIT,
        discount_amount: calc.discount,
        total: calc.total,
        grand_total: calc.grandTotal,
        lines: f.lines.filter((l) => l.itemId).map((l) => ({
            item_id: Number(l.itemId),
            unit_type_id: l.unitTypeId || null,
            qty: Number(l.qty),
            price: Number(l.price),
            discount: Number(l.discount) || 0,
            vat_type: l.vatType,
            account_code: l.accountCode || null,
        })),
    });

    // Document No. already used (123 vs 123-155-125 …) → popup with the matches + supervisor override, before the review
    const [dupFor, setDupFor] = useState(null);   // { body, matches }
    const openReview = async (body) => {
        if (body.document_no && !body.scan_action && !body.doc_override_token) {
            try {
                const r = await apiFetch(`/expenses/document-check?document_no=${encodeURIComponent(body.document_no)}`);
                if (r.matches?.length) { setDupFor({ body, matches: r.matches }); return; }
            } catch { /* the server checks again on save */ }
        }
        setReview(body);
    };

    const save = () => {
        setSaveError("");
        if (!validate()) return setSaveError("Please fix the highlighted fields.");
        if (saved) setTicket({ ...buildBody(), action: "EDIT" });
        else openReview(buildBody());
    };

    const submitNew = async () => {
        setSaving(true);
        try {
            const res = await apiFetch("/expenses", { method: "POST", body: JSON.stringify(review) });
            if (pendingFile) {
                try {
                    await apiUpload(`/expenses/${res.id}/attachment`, pendingFile);
                } catch (err) {
                    notify(`Invoice saved, but the attachment failed: ${err.message}`, "error");
                }
            }
            notify(`${res.invoice_no} created`);
            setReview(null);
            setPendingFile(null);
            navigate(`/task/expenses/${encodeURIComponent(res.invoice_no)}`, { replace: true, ...navState });
        } catch (e) {
            setSaveError(e.message || "Couldn't save the invoice.");
            setReview(null);
        } finally {
            setSaving(false);
        }
    };

    const submitTicket = async (remarks) => {
        const form = new FormData();
        form.append("data", JSON.stringify({ ...ticket, ticket_remarks: remarks }));
        if (pendingFile) form.append("attachment", pendingFile);

        const res = await apiForm(`/expenses/${f.id}/ticket`, form);
        notify(`${res.message} (${res.ticket_no}) – waiting for admin approval`);
        setTicket(null);
        setPendingFile(null);
        onReload();
    };

    // FOR PAYMENT (scan): same review + save, but listed under For Payment
    const forPayment = () => {
        setSaveError("");
        if (!validate()) return setSaveError("Please fix the highlighted fields.");
        openReview({ ...buildBody(), trans_type: "billing" });
    };
    // INVALID / PARTIAL INVALID (reason popup) and CANCEL (no price needed)
    const markInvalid = (action) => {
        setSaveError("");
        if (!validate({ allowZeroPrice: action === "cancel" })) return setSaveError("Please fix the highlighted fields.");
        if (action === "cancel") {
            setReview({ ...buildBody(), trans_type: "invalid", scan_action: "cancel" });
        } else {
            setReasonFor(action); // ask for the reason first
        }
    };

    const submitReason = (reason) => {
        setReview({ ...buildBody(), trans_type: "invalid", scan_action: reasonFor, invalid_reason: reason });
        setReasonFor(null);
    };
    // POST (Partially Invalid → posted)
    const postInvoice = async () => {
        setSaving(true);
        try {
            const res = await apiFetch(`/expenses/${f.id}/post`, { method: "POST" });
            notify(res.message);
            setConfirmPost(false);
            navigate(backTo);
        } catch (e) {
            notify(e.message || "Couldn't post the invoice.", "error");
            setConfirmPost(false);
        } finally {
            setSaving(false);
        }
    };
    // Transfer (scan): move the receipt to Sales or Purchase
    const transfer = async (type) => {
        try {
            await apiFetch(`/expenses/scanned/${scan.scan_id}/transfer`, {
                method: "POST",
                body: JSON.stringify({ trans_type: type }),
            });
            notify(`Receipt moved to ${{ "sales": "Sales", "purchases": "Purchase" }[type] || type}`);
            navigate(backTo);
        } catch (e) {
            notify(e.message || "Couldn't transfer the receipt.", "error");
        }
    };

    const err = (k) => (errors[k] ? "bad" : "");

    return (
        <>
            <div className="inv-shell">
                <section className="card inv-card">
                    {/* ---------- fixed header ---------- */}
                    <header className="inv-head">
                        <h2>Expenses / Expense Transaction</h2>
                        {isAuditor && f.auditStatus && <Badge tone={auditTone(f.auditStatus)}>{f.auditStatus}</Badge>}
                        <div className="inv-head-right">
                            {!isBilling && isAuditor && saved && (
                                <>
                                    <button type="button" className="btn btn-audit btn-sm inv-head-audit" onClick={() => setShowAudit(true)}>
                                        <Icon name="check" size={15} /> Audit
                                    </button>
                                    <div className="inv-nav" role="group" aria-label="Browse invoices">
                                        <button
                                            type="button"
                                            className="icon-btn"
                                            onClick={() => goTo(nav.prev)}
                                            disabled={!nav.prev}
                                            aria-label="Previous invoice"
                                            title={nav.prev ? `Previous: ${nav.prev}` : "No previous invoice"}
                                        >
                                            <Icon name="chevron" size={18} style={{ transform: "rotate(180deg)" }} />
                                        </button>
                                        <button
                                            type="button"
                                            className="icon-btn"
                                            onClick={() => goTo(nav.next)}
                                            disabled={!nav.next}
                                            aria-label="Next invoice"
                                            title={nav.next ? `Next: ${nav.next}` : "No next invoice"}
                                        >
                                            <Icon name="chevron" size={18} />
                                        </button>
                                    </div>
                                </>
                            )}
                            <button className="icon-btn ghost" onClick={() => navigate(backTo)} aria-label="Close">
                                <Icon name="x" />
                            </button>
                        </div>
                    </header>

                    {/* ---------- scrollable body ---------- */}
                    <div className="inv-body">
                        {pendingTicket ? (
                            <div className="inv-banner ticket-banner">
                                <span>
                                    Ticket <strong>{pendingTicket.ticket_no}</strong> is pending admin approval. This invoice can't be edited until it's approved.
                                </span>
                                <button type="button" className="btn btn-sm" onClick={() => setShowTicket(true)}>View ticket</button>
                            </div>
                        ) : scanMode && SCAN_LABEL[scanStatus] ? (
                            <div className="inv-banner">This receipt is <strong>{SCAN_LABEL[scanStatus]}</strong> and can't be edited.</div>
                        ) : locked && (
                            <div className="inv-banner">
                                This invoice is <strong>{f.status.toLowerCase()}</strong> and can't be edited.
                            </div>
                        )}
                        {saveError && <div className="alert-error inv-alert" role="alert">{saveError}</div>}

                        <fieldset className="inv-fields" disabled={locked || saving}>
                            {/* scan: fields on the left, receipt on the right */}
                            <div className={splitView ? "inv-top inv-top-scan" : "inv-top"}>
                                {splitView && <ScanFrame src={previewSrc} name={previewName} />}
                                <div className="inv-col">
                                    <Row label="Vendor" required error={errors.customerId}>
                                        <SearchSelect
                                            value={f.customerId}
                                            onChange={(v) => set("customerId", v)}
                                            options={customerOpts}
                                            onAddNew={(typed) => setNewCustomer(typed)}
                                            addNewLabel="New Vendor"
                                            searchPlaceholder="Search name or TIN..."
                                            aria-label="Vendor"
                                        />
                                    </Row>
                                    <Row label=""><input className="input" readOnly value={cust?.address || ""} aria-label="Address" /></Row>
                                    <Row label=""><input className="input" readOnly value={cust?.city_country || ""} aria-label="City / Country" /></Row>
                                    <Row label="TIN"><input className="input" readOnly value={cust?.tin || ""} /></Row>
                                    <Row label="Branch Code"><input className="input" readOnly value={cust?.branch_code || ""} /></Row>
                                </div>

                                <div className="inv-col">
                                    <Row label="Invoice Date" required error={errors.date}>
                                        <input type="date" className={`input ${err("date")}`} value={f.date} onChange={(e) => set("date", e.target.value)} />
                                    </Row>
                                    <Row label="Currency">
                                        <SearchSelect value={f.currency} onChange={(v) => set("currency", v)} options={CURRENCY_OPTS} aria-label="Currency" />
                                    </Row>
                                    <Row label="Exchange Rate" error={errors.exRate}>
                                        <input type="number" step="0.0001" min="0" className={`input ta-right ${err("exRate")}`} value={f.exRate} onChange={(e) => set("exRate", e.target.value)} />
                                    </Row>
                                    <Row label="Invoice Status">
                                        <input className="input" readOnly value={String(f.status).toUpperCase()} />
                                    </Row>
                                    <Row label="Remarks">
                                        <input className="input" maxLength={255} value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
                                    </Row>
                                </div>

                                <div className="inv-col">
                                    <Row label="Declared Month" required error={errors.declaredMonth}>
                                        <input type="month" className={`input ${err("declaredMonth")}`} value={f.declaredMonth} onChange={(e) => set("declaredMonth", e.target.value)} />
                                    </Row>
                                    <Row label="Invoice No">
                                        <input className="input" readOnly value={f.invoiceNo || "(assigned when saved)"} />
                                    </Row>
                                    <Row label="Document #" required error={errors.documentNo}>
                                        <input className={`input ${err("documentNo")}`} maxLength={100} value={f.documentNo} onChange={(e) => set("documentNo", e.target.value)} />
                                    </Row>
                                    <Row label="Document Type">
                                        <SearchSelect value={f.documentTypeId} onChange={(v) => set("documentTypeId", v)} options={docOpts} aria-label="Document Type" />
                                    </Row>
                                    <Row label="Accounts" required error={errors.accountCode}>
                                        <div className={err("accountCode")}>
                                            <SearchSelect value={f.accountCode} onChange={(v) => set("accountCode", v)} options={debitOpts} aria-label="Accounts" />
                                        </div>
                                    </Row>
                                    <Row label="Attachment" as="div">
                                        <div className="inv-file">
                                            {!scan && (
                                                <button type="button" className="inv-file-btn" onClick={() => fileRef.current?.click()}>Browse</button>
                                            )}
                                            {hasAttachment ? (
                                                <button type="button" className="inv-file-name inv-file-link" onClick={() => setShowAttachment(true)} title="View attachment">
                                                    {attachmentName}
                                                </button>
                                            ) : (
                                                <span className="inv-file-name">No file chosen</span>
                                            )}
                                            {pendingFile && (
                                                <button type="button" className="inv-icon danger" onClick={() => setPendingFile(null)} aria-label="Remove new file">
                                                    <Icon name="x" size={16} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="inv-icon"
                                                onClick={() => setShowAttachment(true)}
                                                disabled={!hasAttachment}
                                                aria-label="View attachment"
                                                title={hasAttachment ? "View attachment" : "No attachment"}
                                            >
                                                <Icon name="fileText" size={16} />
                                            </button>
                                            <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={onPickFile} />
                                        </div>
                                    </Row>
                                </div>
                            </div>

                            <div className="inv-lines">
                                <InvoiceGrid
                                    lines={f.lines}
                                    errors={errors}
                                    itemsById={itemsById}
                                    itemOpts={itemOpts}
                                    accountOpts={accountOpts}
                                    onChange={changeLine}
                                    onAddRow={addItem}
                                    onRemove={removeItem}
                                    onItemPick={pickItem}
                                    onNewItem={(row, typed) => setNewItem({ row, name: typed })}
                                />
                                {(errors.lines || Object.keys(errors).some((k) => k.startsWith("line") && errors[k])) && (
                                    <div className="field-error inv-line-errors">
                                        {errors.lines ||
                                            Object.entries(errors)
                                                .filter(([k, v]) => k.startsWith("line") && v)
                                                .map(([k, v]) => `Row ${Number(k.slice(4)) + 1}: ${v}`)
                                                .join("  ·  ")}
                                    </div>
                                )}
                            </div>

                            <div className="inv-summary">
                                <SumRow label="Sub Total"><input className="input ta-right" readOnly value={num4(calc.subTotal)} /></SumRow>

                                {!atcVTOpen ? (
                                    <div className="inv-sum-row">
                                        <span></span>
                                        <button type="button" className="inv-apply-atc" onClick={() => setAtcVTOpen(true)}>+ Apply ATC (VT/PT)</button>
                                    </div>
                                ) : (
                                    <>
                                        <SumRow label="ATC (VT/PT)">
                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                <SearchSelect value={f.atcVtId} onChange={(v) => set("atcVtId", v)} options={atcOpts} aria-label="ATC (VT/PT)" />
                                                <button
                                                    type="button"
                                                    className="inv-icon danger"
                                                    onClick={() => { setAtcVTOpen(false); set("atcVtId", ""); set("atcVtMonth", ""); }}
                                                    aria-label="Remove ATC (VT/PT)"
                                                >
                                                    <Icon name="x" size={16} />
                                                </button>
                                            </div>
                                        </SumRow>
                                        <SumRow label="2307 (VT/PT)"><input className="input ta-right" readOnly value={num4(calc.wtaxVT)} /></SumRow>
                                        <SumRow label="2307 (VT/PT) Declared Month">
                                            <input type="month" className="input" value={f.atcVtMonth} onChange={(e) => set("atcVtMonth", e.target.value)} disabled={!f.atcVtId} />
                                        </SumRow>
                                    </>
                                )}

                                {!atcITOpen ? (
                                    <div className="inv-sum-row">
                                        <span></span>
                                        <button type="button" className="inv-apply-atc" onClick={() => setAtcITOpen(true)}>+ Apply ATC (IT)</button>
                                    </div>
                                ) : (
                                    <>
                                        <SumRow label="ATC (IT)">
                                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                <SearchSelect value={f.atcItId} onChange={(v) => set("atcItId", v)} options={atcOpts} aria-label="ATC (IT)" />
                                                <button
                                                    type="button"
                                                    className="inv-icon danger"
                                                    onClick={() => { setAtcITOpen(false); set("atcItId", ""); set("atcItMonth", ""); }}
                                                    aria-label="Remove ATC (IT)"
                                                >
                                                    <Icon name="x" size={16} />
                                                </button>
                                            </div>
                                        </SumRow>
                                        <SumRow label="2307 (IT)"><input className="input ta-right" readOnly value={num4(calc.wtaxIT)} /></SumRow>
                                        <SumRow label="2307 (IT) Declared Month">
                                            <input type="month" className="input" value={f.atcItMonth} onChange={(e) => set("atcItMonth", e.target.value)} disabled={!f.atcItId} />
                                        </SumRow>
                                    </>
                                )}
                                <SumRow label="Discount Type">
                                    <SearchSelect value={f.discountTypeId} onChange={(v) => set("discountTypeId", v)} options={discountOpts} aria-label="Discount Type" />
                                </SumRow>
                                <SumRow label="Discount Amt" error={errors.discountAmt}>
                                    <input className="input ta-right" readOnly value={num4(calc.discount)} />
                                </SumRow>
                                <SumRow label="Input VAT"><input className="input ta-right" readOnly value={num4(calc.outputVat)} /></SumRow>
                                <SumRow label="Total"><input className="input ta-right inv-total" readOnly value={num4(calc.total)} /></SumRow>
                            </div>
                        </fieldset>
                    </div>
                </section>

                {/* ---------- fixed footer ---------- */}
                {/* ---------- fixed footer ---------- */}
                <div className="inv-actions">
                    {scanMode ? (
                        /* same as old ButtonScanAttribute(TransStatus) */
                        <>
                            {scanStatus === 0 && <TransferMenu onPick={transfer} disabled={saving} />}
                            <button className="btn" onClick={() => navigate(backTo)}>Close</button>
                            {scanStatus === 3 && (
                                <button className="btn btn-primary" onClick={() => setConfirmPost(true)} disabled={saving}>
                                    {saving ? "POSTING…" : "POST"}
                                </button>
                            )}
                            {(scanStatus === 0 || scanStatus === 4) && (
                                <>
                                    <button className="btn btn-info" onClick={() => setNewCustomer("")} disabled={saving}>ADD VENDOR</button>
                                    <button className="btn btn-info" onClick={addItem} disabled={saving}>ADD ITEM</button>
                                </>
                            )}

                            {scanStatus === 0 && (
                                <>
                                    <button className="btn btn-info" onClick={() => markInvalid("invalid")} disabled={saving}>INVALID</button>
                                    <button className="btn btn-info" onClick={() => markInvalid("partial_invalid")} disabled={saving}>PARTIAL INVALID</button>
                                    <button className="btn btn-info" onClick={() => markInvalid("cancel")} disabled={saving}>CANCEL</button>
                                    <button className="btn btn-info" onClick={forPayment} disabled={saving}>FOR PAYMENT</button>
                                    {isPayable && (
                                        <button
                                            className="btn btn-info"
                                            disabled={!saved || /VOID|CANCEL/i.test(f.status) || !isPayableAccount(lookups.accounts || [], f.accountCode)}
                                            title={isPayableAccount(lookups.accounts || [], f.accountCode) ? "" : "Only for Accounts Payable invoices"}
                                            onClick={() => setPayOpen(true)}
                                        >
                                            PAY BILL
                                        </button>
                                    )}
                                </>
                            )}

                            {(scanStatus === 0 || scanStatus === 4) && (
                                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "SAVING…" : "SAVE"}</button>
                            )}
                        </>
                    ) : (
                        /* normal expense */
                        <>
                            <button className="btn" onClick={() => navigate(backTo)}>Close</button>
                            {isBilling && saved && isPayableAccount(lookups.accounts || [], f.accountCode) && (
                                <button className="btn btn-primary" onClick={() => setPayOpen(true)}>PAY BILL</button>
                            )}
                            {!isBilling && (
                                <>
                                    <button className="btn btn-warning" disabled={!saved || locked} onClick={() => setTicket({ ...buildBody(), action: "VOID" })}>VOID</button>
                                    <button className="btn btn-danger" disabled={!saved || locked} onClick={() => setTicket({ ...buildBody(), action: "CANCEL" })}>CANCEL</button>
                                    {isPayable && (
                                        <button
                                            className="btn btn-info"
                                            disabled={!saved || /VOID|CANCEL/i.test(f.status) || !isPayableAccount(lookups.accounts || [], f.accountCode)}
                                            title={isPayableAccount(lookups.accounts || [], f.accountCode) ? "" : "Only for Accounts Payable invoices"}
                                            onClick={() => setPayOpen(true)}
                                        >
                                            PAY BILL
                                        </button>
                                    )}
                                    <button className="btn btn-info" onClick={() => window.print()}>PRINT</button>
                                    <button
                                        className="btn btn-primary inv-actions-left"
                                        onClick={() => navigate("/task/expenses/new", navState)}
                                        disabled={!saved}
                                        title={saved ? "Start a new expense" : "You're already on a new invoice"}
                                    >
                                        <Icon name="plus" size={16} /> Add New Expense
                                    </button>
                                    <button className="btn btn-primary" disabled={locked || saving} onClick={save}>{saving ? "SAVING…" : "SAVE"}</button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ---------- dialogs ---------- */}
            {showAudit && (
                <AuditModal
                    invoiceId={f.id}
                    invoiceNo={f.invoiceNo}
                    statuses={lookups.audit_statuses || []}
                    current={inv?.audit_status_id}
                    currentRemarks={inv?.audit_remarks || ""}
                    onClose={() => setShowAudit(false)}
                    onSaved={() => {
                        setShowAudit(false);
                        notify(`${f.invoiceNo} audit saved`);
                        onReload();
                    }}
                />
            )}

            {newCustomer !== null && (
                <ContactForm
                    userType="Vendor"
                    record={null}
                    defaultName={newCustomer}
                    onClose={() => setNewCustomer(null)}
                    onSave={async (body) => {
                        const res = await apiFetch("/contacts/vendor", { method: "POST", body: JSON.stringify(body) });
                        const c = {
                            id: res.id,
                            name: body.name,
                            tin: body.tin,
                            branch_code: body.branch_code,
                            address: body.address,
                            city_country: body.city_country,
                        };
                        setLookups((lk) => ({ ...lk, customers: [...lk.customers, c].sort((a, b) => a.name.localeCompare(b.name)) }));
                        set("customerId", String(res.id));
                        notify(res.message);
                        setNewCustomer(null);
                    }}
                />
            )}

            {newItem && (
                <ProductForm
                    record={null}
                    defaultName={newItem.name}
                    accounts={lookups.accounts || []}
                    onClose={() => setNewItem(null)}
                    onSaved={(res, data) => {
                        if (res.image_error) notify(res.image_error, "error");
                        const first = data.units?.[0];
                        const item = {
                            id: res.id,
                            item_code: data.item_code,
                            description: data.description,
                            price: first?.price || 0,
                            unit_type_id: first?.unit_type_id || null,
                            gl_sales_account: data.gl_cost_of_sales_account || data.gl_sales_account || "", // purchase / expense account
                            tax_type: data.tax_type,
                        };
                        setLookups((lk) => ({ ...lk, items: [...lk.items, item] }));
                        applyItem(newItem.row, item);
                        notify(`${item.item_code} added`);
                        setNewItem(null);
                    }}
                />
            )}

            {showAttachment && hasAttachment && (
                <AttachmentPanel
                    invoiceId={saved ? f.id : null}
                    scanId={scan?.scan_id || null}
                    localFile={pendingFile}
                    name={attachmentName}
                    title={f.documentNo ? `#${f.documentNo}` : f.invoiceNo || "Attachment"}
                    onClose={() => setShowAttachment(false)}
                />
            )}

            {dupFor && (
                <DuplicateDocModal
                    module="expenses"
                    docNo={dupFor.body.document_no}
                    matches={dupFor.matches}
                    partyLabel="Vendor"
                    onCancel={() => setDupFor(null)}
                    onApproved={(token) => { const body = { ...dupFor.body, doc_override_token: token }; setDupFor(null); setReview(body); }}
                />
            )}
            {review && (
                <ReviewPanel
                    title={f.documentNo ? `#${f.documentNo}` : "New invoice"}
                    f={f}
                    calc={calc}
                    lookups={lookups}
                    saving={saving}
                    onClose={() => setReview(null)}
                    onSubmit={submitNew}
                />
            )}
            {payOpen && inv && (
                <PayBillModal
                    type="expenses"
                    invoiceNo={inv.invoice_no}
                    accounts={lookups.accounts || []}
                    onClose={() => setPayOpen(false)}
                    onDone={onReload}
                />
            )}
            {ticket && <TicketModal action={ticket.action} onClose={() => setTicket(null)} onSubmit={submitTicket} />}
            {reasonFor && (
                <ReasonModal
                    title={reasonFor === "invalid" ? "Reason – Invalid" : "Reason – Partial Invalid"}
                    onClose={() => setReasonFor(null)}
                    onSubmit={submitReason}
                />
            )}
            {showTicket && pendingTicket && (
                <TicketViewModal ticketNo={pendingTicket.ticket_no} onClose={() => setShowTicket(false)} />
            )}
            {confirmPost && (
                <ConfirmDialog
                    title={`Post ${f.invoiceNo}?`}
                    message="This Partially Invalid record will be posted and will show in Expenses."
                    confirmLabel="Post"
                    onCancel={() => setConfirmPost(false)}
                    onConfirm={postInvoice}
                />
            )}
        </>
    );
}

/* =========================================================
   Spreadsheet grid
   ========================================================= */
function InvoiceGrid({ lines, errors, itemsById, itemOpts, accountOpts, onChange, onAddRow, onRemove, onItemPick, onNewItem }) {
    const wrap = useRef(null);

    const focusCell = (r, c) =>
        setTimeout(() => {
            const el = wrap.current?.querySelector(`[data-r="${r}"][data-c="${c}"]`);
            if (el) {
                el.focus();
                el.select?.();
            }
        }, 0);

    const onKeyDown = (e, r, c) => {
        const el = e.target;
        const isSelect = el.tagName === "SELECT" || el.tagName === "BUTTON";
        const pos = EDITABLE.indexOf(c);
        const atStart = isSelect || (el.selectionStart === 0 && el.selectionEnd === 0);
        const atEnd = isSelect || el.selectionEnd === el.value.length;

        if (e.key === "Enter" || e.key === "ArrowDown") {
            e.preventDefault();
            if (r < lines.length - 1) focusCell(r + 1, c);
            else if (lines[r]?.itemId) {
                onAddRow();
                focusCell(r + 1, EDITABLE[0]);
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (r > 0) focusCell(r - 1, c);
        } else if (e.key === "ArrowLeft" && atStart) {
            e.preventDefault();
            if (pos > 0) focusCell(r, EDITABLE[pos - 1]);
        } else if (e.key === "ArrowRight" && atEnd) {
            e.preventDefault();
            if (pos < EDITABLE.length - 1) focusCell(r, EDITABLE[pos + 1]);
        } else if (e.key === "Delete" && e.ctrlKey) {
            e.preventDefault();
            onRemove(r);
            focusCell(Math.max(0, r - 1), c);
        }
    };

    const calcs = lines.map(lineCalc);
    const sum = (k) => calcs.reduce((n, x) => n + (x[k] || 0), 0);
    const qtyTotal = lines.reduce((n, l) => n + (Number(l.qty) || 0), 0);

    const cellProps = (r, c) => ({
        "data-r": r,
        "data-c": c,
        onKeyDown: (e) => onKeyDown(e, r, c),
        "aria-label": `${GRID_COLS[c].label} row ${r + 1}`,
    });

    return (
        <div className="xl-wrap" ref={wrap}>
            <div className="xl-scroll">
                <table className="xl">
                    <colgroup>
                        <col style={{ width: "3%" }} />
                        {GRID_COLS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
                        <col style={{ width: "3.5%" }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="xl-rownum">#</th>
                            {GRID_COLS.map((c) => (
                                <th key={c.key} className={c.type === "num" || c.type === "calc" ? "ta-right" : ""} title={c.label}>
                                    {c.label}
                                    {c.required && <span className="required-mark"> *</span>}
                                </th>
                            ))}
                            <th aria-label="Remove" />
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l, r) => {
                            const calc = calcs[r];
                            const item = itemsById[l.itemId];
                            const accountLabel = accountOpts.find((o) => o.value === l.accountCode)?.label || "";
                            return (
                                <tr key={r} className={errors[`line${r}`] ? "bad-row" : ""}>
                                    <td className="xl-rownum">{r + 1}</td>
                                    {GRID_COLS.map((col, c) => {
                                        if (col.type === "calc") {
                                            return <td key={col.key} className="xl-ro">{num4(calc[col.key])}</td>;
                                        }
                                        if (col.type === "item") {
                                            return (
                                                <td key={col.key} title={item?.description || ""}>
                                                    <SearchSelect
                                                        variant="cell"
                                                        value={l.itemId}
                                                        onChange={(v) => onItemPick(r, v)}
                                                        options={itemOpts}
                                                        placeholder="Select item"
                                                        searchPlaceholder="Search item ID or name..."
                                                        onAddNew={(typed) => onNewItem(r, typed)}
                                                        addNewLabel="New Product"
                                                        {...cellProps(r, c)}
                                                    />
                                                </td>
                                            );
                                        }
                                        if (col.type === "select") {
                                            return (
                                                <td key={col.key} title={accountLabel}>
                                                    <SearchSelect
                                                        variant="cell"
                                                        value={l.accountCode}
                                                        onChange={(v) => onChange(r, { accountCode: v })}
                                                        options={accountOpts}
                                                        placeholder="Select account"
                                                        searchPlaceholder="Search account..."
                                                        {...cellProps(r, c)}
                                                    />
                                                </td>
                                            );
                                        }
                                        return (
                                            <td key={col.key}>
                                                <input
                                                    className="xl-input num"
                                                    inputMode="decimal"
                                                    value={l[col.key] ?? ""}
                                                    onChange={(e) => onChange(r, { [col.key]: cleanNum(e.target.value) })}
                                                    {...cellProps(r, c)}
                                                />
                                            </td>
                                        );
                                    })}
                                    <td className="xl-del">
                                        <button type="button" tabIndex={-1} onClick={() => onRemove(r)} aria-label={`Remove row ${r + 1}`}>
                                            <Icon name="x" size={15} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td className="xl-rownum">
                                <button type="button" className="icon-btn ghost" onClick={onAddRow} aria-label="Add row" title="Add row">
                                    <Icon name="plus" size={15} />
                                </button>
                            </td>
                            {GRID_COLS.map((col) => {
                                let v = "";
                                if (col.key === "itemId") v = `${lines.filter((l) => l.itemId).length} item(s)`;
                                else if (col.key === "qty") v = qtyTotal;
                                else if (col.key === "discount") v = num4(sum("discount"));
                                else if (col.type === "calc") v = num4(sum(col.key));
                                return (
                                    <td key={col.key} className={col.type === "num" || col.type === "calc" ? "ta-right" : ""}>{v}</td>
                                );
                            })}
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div className="xl-hint">
                <kbd>Enter</kbd> / <kbd>↓</kbd> next row (adds a row at the end) · <kbd>←</kbd> <kbd>→</kbd> move between cells ·
                <kbd>Ctrl</kbd>+<kbd>Delete</kbd> removes the row
            </div>
        </div>
    );
}

/* =========================================================
   Audit popup
   ========================================================= */
function AuditModal({ invoiceId, invoiceNo, statuses, current, currentRemarks, onClose, onSaved }) {
    const [statusId, setStatusId] = useState(
        AUDIT_CHOICES.some((c) => c.id === Number(current)) ? String(current) : ""
    );
    const [remarks, setRemarks] = useState(currentRemarks);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!statusId) return setError("Choose an audit status.");
        setSaving(true);
        try {
            await apiFetch(`/expenses/${invoiceId}/audit`, {
                method: "POST",
                body: JSON.stringify({ audit_status_id: Number(statusId), audit_remarks: remarks || null }),
            });
            onSaved();
        } catch (e) {
            setError(e.message || "Couldn't save the audit.");
            setSaving(false);
        }
    };

    return (
        <Modal
            title={`Audit ${invoiceNo}`}
            onClose={onClose}
            size="sm"
            footer={
                <>
                    <button className="btn" onClick={onClose} disabled={saving}>Close</button>
                    <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save audit"}</button>
                </>
            }
        >
            {error && <div className="alert-error" role="alert">{error}</div>}
            <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="field">
                    <span className="field-label">Audit Status</span>
                    <SearchSelect
                        value={statusId}
                        onChange={setStatusId}
                        options={AUDIT_CHOICES.map((c) => ({
                            value: String(c.id),
                            label: statuses.find((s) => Number(s.id) === c.id)?.name || c.name,
                        }))}
                        placeholder="Select status"
                        aria-label="Audit Status"
                    />
                </div>
                <Field label="Audit Remarks">
                    <textarea className="input" rows={3} maxLength={255} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </Field>
            </div>
        </Modal>
    );
}

/* =========================================================
   Attachment preview: slides in from the left
   ========================================================= */
function AttachmentPanel({ invoiceId, scanId, localFile, name, title, onClose }) {
    const panelRef = useRef(null);
    const [url, setUrl] = useState("");
    const [type, setType] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let objectUrl = "";
        let alive = true;
        (async () => {
            try {
                const blob = localFile || (await apiBlob(scanId ? `/expenses/scanned/${scanId}/file` : `/expenses/${invoiceId}/attachment`));
                if (!alive) return;

                if (blob.type === "application/json") {
                    const { url: link } = JSON.parse(await blob.text());
                    setType("link");
                    setUrl(link);
                    return;
                }

                objectUrl = URL.createObjectURL(blob);
                setType(blob.type || "");
                setUrl(objectUrl);
            } catch (e) {
                if (alive) setError(e.message || "Couldn't load the file.");
            }
        })();
        return () => {
            alive = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [invoiceId, scanId, localFile]);

    useEffect(() => {
        const prev = document.activeElement;
        panelRef.current?.focus();
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = overflow;
            prev?.focus?.();
        };
    }, [onClose]);

    const isImage = type.startsWith("image/");
    const isPdf = type === "application/pdf" || /\.pdf$/i.test(name);

    return (
        <div className="att-backdrop" onMouseDown={onClose}>
            <aside
                ref={panelRef}
                className="att-panel"
                role="dialog"
                aria-modal="true"
                aria-label={`Attachment ${name}`}
                tabIndex={-1}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <header className="att-head">
                    <div className="att-title">
                        <strong>{title}</strong>
                        <span title={name}>{name}</span>
                    </div>
                    {url && (
                        <>
                            <a className="btn btn-sm" href={url} target="_blank" rel="noopener noreferrer">Open in new tab</a>
                            <a className="btn btn-sm" href={url} download={name}>Download</a>
                        </>
                    )}
                    <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Close attachment">
                        <Icon name="x" />
                    </button>
                </header>

                <div className="att-body">
                    {error ? (
                        <div className="att-msg">{error}</div>
                    ) : !url ? (
                        <div className="att-loading"><span className="sk att-sk" /></div>
                    ) : type === "link" ? (
                        <div className="att-msg">
                            <div>
                                <p>This attachment is a link.</p>
                                <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">Open link</a>
                            </div>
                        </div>
                    ) : isImage ? (
                        <div className="att-img"><img src={url} alt={name} /></div>
                    ) : isPdf ? (
                        <iframe src={url} title={`Attachment ${name}`} />
                    ) : (
                        <div className="att-msg">
                            This file type can't be previewed. Use <strong>Download</strong>.
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
}

/* =========================================================
   Split layout: file preview on the right
   (scanned receipt, or the invoice attachment for auditors)
   ========================================================= */
function ScanFrame({ src, name }) {
    const [url, setUrl] = useState("");
    const [type, setType] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        setUrl("");
        setType("");
        setError("");
        if (!src) return;

        let objectUrl = "";
        let alive = true;
        (async () => {
            try {
                const blob = await apiBlob(src);
                if (!alive) return;

                // attachment saved as a link → { url }
                if (blob.type === "application/json") {
                    const { url: link } = JSON.parse(await blob.text());
                    setType("link");
                    setUrl(link);
                    return;
                }

                objectUrl = URL.createObjectURL(blob);
                setType(blob.type || "");
                setUrl(objectUrl);
            } catch (e) {
                if (alive) setError(e.message || "Couldn't load the file.");
            }
        })();
        return () => {
            alive = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src]);

    return (
        <div className="scan-frame">
            {error ? (
                <iframe src="about:blank" title="No attachment" />
            ) : !url ? (
                <span className="sk scan-frame-sk" />
            ) : type === "link" ? (
                <div className="att-msg">
                    <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">Open link</a>
                </div>
            ) : type.startsWith("image/") ? (
                <img src={url} alt={name} />
            ) : (
                <iframe src={url} title={name || "Attachment"} />
            )}
        </div>
    );
}

/* Transfer ▴ (Sales / Purchase) */
function TransferMenu({ onPick, disabled }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open]);

    const pick = (type) => {
        setOpen(false);
        onPick(type);
    };

    return (
        <div className="dropup inv-actions-left" ref={ref}>
            <button type="button" className="btn btn-info" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-expanded={open}>
                Transfer <Icon name="chevron" size={14} style={{ transform: "rotate(-90deg)" }} />
            </button>
            {open && (
                <div className="dropup-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => pick("sales")}>Sales</button>
                    <button type="button" role="menuitem" onClick={() => pick("purchases")}>Purchase</button>
                </div>
            )}
        </div>
    );
}

/* =========================================================
   Loading placeholder
   ========================================================= */
function InvoiceSkeleton() {
    const SkField = () => (
        <div className="sk-row">
            <span className="sk sk-label" />
            <span className="sk sk-input" />
        </div>
    );

    return (
        <div className="inv-shell" aria-busy="true" aria-label="Loading invoice">
            <section className="card inv-card">
                <header className="inv-head">
                    <span className="sk sk-title" />
                    <span className="sk sk-badge" />
                    <div className="inv-head-right">
                        <span className="sk sk-btn" />
                        <span className="sk sk-btn" />
                    </div>
                </header>

                <div className="inv-body">
                    <div className="inv-top">
                        {[5, 5, 6].map((n, c) => (
                            <div className="inv-col" key={c}>
                                {Array.from({ length: n }).map((_, i) => <SkField key={i} />)}
                            </div>
                        ))}
                    </div>

                    <div className="inv-lines">
                        <div className="sk-table">
                            <span className="sk sk-thead" />
                            {Array.from({ length: 3 }).map((_, i) => <span key={i} className="sk sk-trow" />)}
                        </div>
                    </div>

                    <div className="inv-summary">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div className="sk-sum" key={i}>
                                <span className="sk sk-label" />
                                <span className="sk sk-input sk-sum-input" />
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <div className="inv-actions">
                {Array.from({ length: 6 }).map((_, i) => <span key={i} className="sk sk-action" />)}
            </div>
        </div>
    );
}

/* =========================================================
   Small layout helpers
   ========================================================= */
function Row({ label, error, required = false, children, as = "label" }) {
    const Tag = as;
    return (
        <Tag className="inv-row">
            <span className="inv-label">
                {label}
                {required && <span className="required-mark"> *</span>}
            </span>
            <div>
                {children}
                {error && <div className="field-error">{error}</div>}
            </div>
        </Tag>
    );
}

function SumRow({ label, error, children }) {
    return (
        <label className="inv-sum-row">
            <span>{label} :</span>
            <div>
                {children}
                {error && <div className="field-error">{error}</div>}
            </div>
        </label>
    );
}

/* =========================================================
   Review panel before saving a NEW invoice
   ========================================================= */
function ReviewPanel({ title, f, calc, lookups, saving, onClose, onSubmit }) {
    const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const allAccounts = [...(lookups.accounts || []), ...(lookups.sales_accounts || [])];
    const accName = (code) => allAccounts.find((a) => a.account_code === code)?.account_name || "";
    const inputVatAcc = allAccounts.find((a) => /input\s*(vat|tax)/i.test(a.account_name));
    const exRate = Number(f.exRate) || 1;

    const rows = [];
    // Debit: purchase / expense account per line
    const byAccount = {};
    f.lines.filter((l) => l.itemId).forEach((l) => {
        const c = lineCalc(l);
        const amt = c.netOfVat + c.vatExempt + c.nonVat + c.zeroRated;
        byAccount[l.accountCode] = (byAccount[l.accountCode] || 0) + amt;
    });
    Object.entries(byAccount).forEach(([code, amt]) => rows.push({ code, name: accName(code), dr: r4(amt * exRate), cr: 0 }));
    // Debit: input VAT
    if (calc.outputVat) rows.push({ code: inputVatAcc?.account_code || "—", name: inputVatAcc?.account_name || "Input VAT", dr: r4(calc.outputVat * exRate), cr: 0 });
    // Credit: payable / cash account, then withholding taxes
    rows.push({ code: f.accountCode || "—", name: accName(f.accountCode) || "No account selected", dr: 0, cr: calc.grandTotal });
    if (calc.wtaxIT) rows.push({ code: "21910", name: "Withholding Tax (IT)", dr: 0, cr: calc.wtaxIT });
    if (calc.wtaxVT) rows.push({ code: "21910", name: "Withholding Tax (VAT)", dr: 0, cr: calc.wtaxVT });

    const totalDr = r4(rows.reduce((n, r) => n + r.dr, 0));
    const totalCr = r4(rows.reduce((n, r) => n + r.cr, 0));
    const balanced = Math.abs(totalDr - totalCr) < 0.01;
    const gross = r4(f.lines.filter((l) => l.itemId).reduce((n, l) => n + lineCalc(l).total, 0));

    const customer = lookups.customers.find((c) => String(c.id) === String(f.customerId))?.name || "—";
    const docType = lookups.document_types.find((d) => String(d.id) === String(f.documentTypeId))?.name || "—";

    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && !saving && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, saving]);

    return (
        <div className="rv-backdrop" onMouseDown={() => !saving && onClose()}>
            <aside className="rv-panel" role="dialog" aria-modal="true" aria-label="Review before saving" onMouseDown={(e) => e.stopPropagation()}>
                <header className="rv-head"><h3>{title}</h3></header>

                <div className="rv-body">
                    <section>
                        <h4>Journal Entry</h4>
                        <div className="rv-grid rv-je">
                            <span className="rv-th">Account</span><span className="rv-th ta-right">Debit</span><span className="rv-th ta-right">Credit</span>
                            {rows.map((r, i) => (
                                <FragmentRow key={i} label={`${r.code} - ${r.name}`} dr={r.dr ? n2(r.dr) : "-"} cr={r.cr ? n2(r.cr) : "-"} />
                            ))}
                            <FragmentRow label="Balance" dr={n2(totalDr)} cr={n2(totalCr)} className={balanced ? "rv-ok" : "rv-bad"} />
                        </div>
                        {!balanced && <p className="rv-warn">Not balanced: difference of {n2(Math.abs(totalDr - totalCr))}</p>}
                    </section>

                    <section>
                        <h4>Tax Treatment</h4>
                        <ul className="rv-list">
                            <li><span>Gross</span><b>{n2(gross)}</b></li>
                            <li><span>Net</span><b>{n2(calc.subTotal)}</b></li>
                            <li><span>VAT amount</span><b>{n2(calc.outputVat)}</b></li>
                            <li><span>CWT (income)</span><b>{n2(calc.wtaxIT)}</b></li>
                            <li><span>CWT (VAT)</span><b>{n2(calc.wtaxVT)}</b></li>
                        </ul>
                    </section>

                    <section>
                        <h4>Inputs</h4>
                        <ul className="rv-list">
                            <li><span>Vendor</span><b>{customer}</b></li>
                            <li><span>Invoice Date</span><b>{f.date}</b></li>
                            <li><span>Declared Month</span><b>{f.declaredMonth}</b></li>
                            <li><span>Doc Type</span><b>{docType}</b></li>
                        </ul>
                    </section>
                </div>

                {saving && <div className="rv-progress" aria-hidden="true"><span /></div>}

                <footer className="rv-foot">
                    <button className="btn" onClick={onClose} disabled={saving}>Close</button>
                    <button className="btn btn-primary" onClick={onSubmit} disabled={saving || !balanced}>
                        {saving ? "Saving…" : "Submit"}
                    </button>
                </footer>
            </aside>
        </div>
    );
}

function FragmentRow({ label, dr, cr, className = "" }) {
    return (
        <>
            <span className={`rv-acc ${className}`}>• {label}</span>
            <span className={`ta-right mono ${className}`}>{dr}</span>
            <span className={`ta-right mono ${className}`}>{cr}</span>
        </>
    );
}

/* =========================================================
   Request Ticket (EDIT / VOID / CANCEL)
   ========================================================= */
function TicketModal({ action = "EDIT", onClose, onSubmit }) {
    const [remarks, setRemarks] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!remarks.trim()) return setError("Remarks / Reason is required.");
        setSaving(true);
        try {
            await onSubmit(remarks.trim());
        } catch (e) {
            setError(e.message || "Couldn't submit the ticket.");
            setSaving(false);
        }
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

/* =========================================================
   View a pending ticket
   ========================================================= */
export function TicketViewModal({ ticketNo, onClose }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        apiFetch(`/expenses/ticket/${encodeURIComponent(ticketNo)}`)
            .then(setData)
            .catch((e) => setError(e.message || "Couldn't load the ticket."));
    }, [ticketNo]);

    const m = data?.master || {};
    const t = data?.ticket || {};
    const lines = data?.details || [];
    const n = (v) => num4(v);
    const sum = (k) => lines.reduce((s, l) => s + (Number(l[k]) || 0), 0);
    const requested = String(t.created_at || "").replace("T", " ").slice(0, 16);

    return (
        <Modal title="Ticket details" onClose={onClose} size="lg">
            {error && <div className="alert-error" role="alert">{error}</div>}

            {!data && !error && (
                <div className="tv-skel">
                    <span className="sk" style={{ height: 64 }} />
                    <span className="sk" style={{ height: 160 }} />
                    <span className="sk" style={{ height: 120 }} />
                </div>
            )}

            {data && (
                <div className="tv">
                    <div className="tv-head">
                        <div className="tv-head-main">
                            <span className="tv-no">{t.ticket_no}</span>
                            <span className="tv-sub">
                                For invoice <b>{t.reference_no}</b> · Requested {requested}
                            </span>
                        </div>
                        <div className="tv-pills">
                            <span className="tv-pill tv-pill-action">{t.action}</span>
                            <span className="tv-pill tv-pill-pending">
                                <span className="tv-dot" /> Pending approval
                            </span>
                        </div>
                    </div>

                    {t.remarks && (
                        <div className="tv-note">
                            <span className="tv-note-label">Reason</span>
                            <p>{t.remarks}</p>
                        </div>
                    )}

                    <div className="tv-cols">
                        <section className="tv-card">
                            <h4>Invoice details</h4>
                            <dl className="tv-dl">
                                <dt>Vendor</dt><dd>{m.customer_name}</dd>
                                <dt>Invoice Date</dt><dd>{m.transaction_date}</dd>
                                <dt>Declared Month</dt><dd>{m.declared_month}</dd>
                                <dt>Document #</dt><dd>{m.document_no || "—"}</dd>
                                <dt>Accounts</dt><dd>{m.account_code ? `${m.account_code} - ${m.account_name}` : "—"}</dd>
                                <dt>Attachment</dt><dd className="tv-ellipsis" title={m.attachment || ""}>{m.attachment || "—"}</dd>
                                {m.remarks && (<><dt>Remarks</dt><dd>{m.remarks}</dd></>)}
                            </dl>
                        </section>

                        <section className="tv-card">
                            <h4>Amounts</h4>
                            <dl className="tv-dl tv-amounts">
                                <dt>Sub Total</dt><dd>{n(m.sub_total)}</dd>
                                <dt>Discount</dt><dd>{n(m.discount_amount)}</dd>
                                <dt>2307 (VT/PT)</dt><dd>{n(m["2307_vt"])}</dd>
                                <dt>2307 (IT)</dt><dd>{n(m["2307_it"])}</dd>
                                <dt>Total</dt><dd>{n(m.total)}</dd>
                            </dl>
                            <div className="tv-grand">
                                <span>Grand Total</span>
                                <b>{n(m.grand_total)}</b>
                            </div>
                        </section>
                    </div>

                    <section className="tv-card tv-lines">
                        <h4>Lines <span className="tv-count">{lines.length}</span></h4>
                        <div className="table-scroll">
                            <table className="tv-table">
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th>Accounts</th>
                                        <th className="ta-right">Qty</th>
                                        <th className="ta-right">Price</th>
                                        <th className="ta-right">Total</th>
                                        <th className="ta-right">Discount</th>
                                        <th className="ta-right">Input VAT</th>
                                        <th className="ta-right">Net of VAT</th>
                                        <th className="ta-right">VAT Exempt</th>
                                        <th className="ta-right">Non VAT</th>
                                        <th className="ta-right">Zero Rated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map((l, i) => (
                                        <tr key={i}>
                                            <td><div className="tv-item-sub">{l.description}</div></td>
                                            <td>{l.account_code ? `${l.account_code} - ${l.account_name}` : "—"}</td>
                                            <td className="ta-right mono">{l.quantity}</td>
                                            <td className="ta-right mono">{n(l.unit_price)}</td>
                                            <td className="ta-right mono">{n(l.amount)}</td>
                                            <td className="ta-right mono">{n(l.discount_amount)}</td>
                                            <td className="ta-right mono">{n(l.input_vat)}</td>
                                            <td className="ta-right mono">{n(l.net_of_vat)}</td>
                                            <td className="ta-right mono">{n(l.vat_exempt)}</td>
                                            <td className="ta-right mono">{n(l.non_vat)}</td>
                                            <td className="ta-right mono">{n(l.zero_rated)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={2}>Total</td>
                                        <td className="ta-right mono">{sum("quantity")}</td>
                                        <td />
                                        <td className="ta-right mono">{n(sum("amount"))}</td>
                                        <td className="ta-right mono">{n(sum("discount_amount"))}</td>
                                        <td className="ta-right mono">{n(sum("input_vat"))}</td>
                                        <td className="ta-right mono">{n(sum("net_of_vat"))}</td>
                                        <td className="ta-right mono">{n(sum("vat_exempt"))}</td>
                                        <td className="ta-right mono">{n(sum("non_vat"))}</td>
                                        <td className="ta-right mono">{n(sum("zero_rated"))}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </section>
                </div>
            )}
        </Modal>
    );
}
/* =========================================================
   Reason popup (INVALID / PARTIAL INVALID)
   ========================================================= */
function ReasonModal({ title, onClose, onSubmit }) {
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");

    const submit = () => {
        if (!reason.trim()) return setError("Please input reason.");
        onSubmit(reason.trim());
    };

    return (
        <Modal
            title={title}
            onClose={onClose}
            size="sm"
            footer={
                <>
                    <button className="btn" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" onClick={submit}>Submit</button>
                </>
            }
        >
            {error && <div className="alert-error" role="alert">{error}</div>}
            <Field label="Reason">
                <textarea className="input" rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </Field>
        </Modal>
    );
}