// Money: ₱12,500.00
export const money = (n) =>
  "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// "2026-09-01" -> "1 Sep 2026"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const isThisMonth = (iso) => !!iso && iso.slice(0, 7) === today().slice(0, 7);

// Formats while typing: 123456789 -> 123-456-789, up to 000-000-000-00000
export const formatTIN = (value) => {
  const d = String(value || "").replace(/\D/g, "").slice(0, 14);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 14)].filter(Boolean);
  return parts.join("-");
};

export const isValidTIN = (tin) => /^\d{3}-\d{3}-\d{3}(-\d{3,5})?$/.test(tin || "");

export const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || "");

// nextId(sales, "invoiceNo", "INV-") -> "INV-0013"
export const nextId = (list, field, prefix, pad = 4) => {
  const max = list.reduce((m, r) => {
    const n = parseInt(String(r[field] || "").replace(/\D/g, ""), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return prefix + String(max + 1).padStart(pad, "0");
};

// Withholding tax codes (ATC)
export const ATC_LIST = [
  { code: "", label: "None", rate: 0 },
  { code: "WC158", label: "WC158 – Goods (1%)", rate: 0.01 },
  { code: "WC160", label: "WC160 – Services (2%)", rate: 0.02 },
  { code: "WC120", label: "WC120 – Contractors (2%)", rate: 0.02 },
  { code: "WC100", label: "WC100 – Rentals (5%)", rate: 0.05 },
];

export const atcRate = (code) => (ATC_LIST.find((a) => a.code === code) || ATC_LIST[0]).rate;

export const VAT_RATE = 0.12;

// items: [{ qty, price }] – amounts are VAT-exclusive
export const computeTotals = (items, withVat, atc) => {
  const subtotal = round2(items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0));
  const vat = withVat ? round2(subtotal * VAT_RATE) : 0;
  const wtax = round2(subtotal * atcRate(atc));
  const total = round2(subtotal + vat - wtax);
  return { subtotal, vat, wtax, total };
};

export const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const AVATAR_COLORS = ["#2f5bea", "#0e7490", "#c2410c", "#7c3aed", "#be185d", "#15803d", "#b45309", "#1d4ed8"];
export const colorFor = (name) => {
  let h = 0;
  for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

// CSV download
export const downloadCSV = (filename, headers, rows) => {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const inRange = (iso, from, to) => (!from || iso >= from) && (!to || iso <= to);
