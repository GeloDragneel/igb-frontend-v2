// Chart-of-account lists used by the invoice page.
// Replace with data from your Charts of Account setup later.

// Revenue accounts for invoice lines. vat decides which VAT column the line goes to.
export const REVENUE_ACCOUNTS = [
    { code: "42100", name: "Cash Sales - Vatable (Regular)", vat: "vatable" },
    { code: "42110", name: "Charge Sales - Vatable (Regular)", vat: "vatable" },
    { code: "42200", name: "Sales - VAT Exempt", vat: "exempt" },
    { code: "42300", name: "Sales - Zero Rated", vat: "zero" },
    { code: "42400", name: "Sales - Non VAT", vat: "nonvat" },
];

// Debit side of the invoice
export const DEBIT_ACCOUNTS = [
    { code: "12102", name: "Cash" },
    { code: "12103", name: "Cash in Bank" },
    { code: "11301", name: "Accounts Receivable - Trade" },
];

export const DOC_TYPES = ["Cash Sales Invoice", "Charge Sales Invoice", "Service Invoice", "Official Receipt"];

export const CURRENCIES = ["PHP", "USD", "EUR", "JPY"];

// Withholding of business tax (VAT / percentage tax) – 2307 (VT/PT)
export const ATC_VT = [
    { code: "", label: "None", rate: 0 },
    { code: "WV010", label: "WV010 – VAT on goods (5%)", rate: 0.05 },
    { code: "WV020", label: "WV020 – VAT on services (5%)", rate: 0.05 },
    { code: "WB080", label: "WB080 – Percentage tax (3%)", rate: 0.03 },
];

// Expanded withholding income tax – 2307 (IT)
export const ATC_IT = [
    { code: "", label: "None", rate: 0 },
    { code: "WC158", label: "WC158 – Goods (1%)", rate: 0.01 },
    { code: "WC160", label: "WC160 – Services (2%)", rate: 0.02 },
    { code: "WC120", label: "WC120 – Contractors (2%)", rate: 0.02 },
    { code: "WC100", label: "WC100 – Rentals (5%)", rate: 0.05 },
];

export const DISCOUNT_TYPES = ["", "Senior Citizen", "PWD", "Promo", "Volume", "Others"];

export const accountLabel = (list, code) => {
    const a = list.find((x) => x.code === code);
    return a ? `${a.code} - ${a.name}` : code || "";
};