// shared helpers for the RECEIVE MONEY / PAY BILL popups
export const n2 = (v) => (Number(v) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const cleanNum = (v) => String(v).replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")} ${y}`;
};

/** account list → options; cash / bank / petty cash accounts first */
export function cashAccountOptions(accounts = []) {
  const opt = (a) => ({ value: a.account_code, label: `${a.account_code} - ${a.account_name}` });
  const cash = accounts.filter((a) => /cash|bank|petty/i.test(a.account_name || ""));
  const rest = accounts.filter((a) => !/cash|bank|petty/i.test(a.account_name || ""));
  return [{ value: "", label: "— Select —" }, ...cash.map(opt), ...rest.map(opt)];
}

/** same rules as the backend (App\Support\PaymentAccounts) */
const nameOf = (accounts, code) => (accounts.find((a) => a.account_code === code)?.account_name || "").toLowerCase();
export const isReceivableAccount = (accounts, code) => nameOf(accounts, code).includes("receivable");
export const isPayableAccount = (accounts, code) => nameOf(accounts, code).includes("payable");

/** FormData from a plain object (empty values are left out) + optional file */
export function toForm(fields, file) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== "") fd.append(k, v); });
  if (file) fd.append("attachment", file);
  return fd;
}

export const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx";
export const MAX_FILE_MB = 10;