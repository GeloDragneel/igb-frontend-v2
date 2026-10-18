// Sample data – replace with API calls later.
// Product stock values already reflect the sales and received purchases below.

export const PRODUCT_CATEGORIES = ["Office Supplies", "Electronics", "Furniture", "Grocery"];
export const UNITS = ["pc", "box", "kg", "L"];
export const EXPENSE_CATEGORIES = ["Utilities", "Rent", "Salaries", "Supplies", "Transportation", "Others"];

export const products = [
  { code: "P-001", name: "Bond Paper A4 (500s)", category: "Office Supplies", unit: "box", cost: 1450, price: 1850, stock: 42, reorder: 10, status: "Active" },
  { code: "P-002", name: "Ballpen Black (50s)", category: "Office Supplies", unit: "box", cost: 320, price: 450, stock: 6, reorder: 8, status: "Active" },
  { code: "P-003", name: "Printer Ink Black", category: "Electronics", unit: "pc", cost: 380, price: 520, stock: 25, reorder: 10, status: "Active" },
  { code: "P-004", name: "USB Flash Drive 32GB", category: "Electronics", unit: "pc", cost: 280, price: 399, stock: 0, reorder: 5, status: "Active" },
  { code: "P-005", name: "Ergonomic Office Chair", category: "Furniture", unit: "pc", cost: 4200, price: 5800, stock: 9, reorder: 3, status: "Active" },
  { code: "P-006", name: "Premium Rice", category: "Grocery", unit: "kg", cost: 48, price: 58, stock: 380, reorder: 100, status: "Active" },
  { code: "P-007", name: "Cooking Oil", category: "Grocery", unit: "L", cost: 95, price: 120, stock: 64, reorder: 30, status: "Active" },
  { code: "P-008", name: "Laptop Stand Aluminum", category: "Electronics", unit: "pc", cost: 650, price: 990, stock: 3, reorder: 4, status: "Inactive" },
];

export const customers = [
  { code: "CUS-0001", name: "Northmin Trading Corp.", tin: "123-456-789-00000", street: "Corrales Ave., Brgy. 25, Cagayan de Oro City", zip: "9000", contact: "0917 555 1201", email: "accounts@northmin.ph", status: "Active", createdAt: "2026-01-12" },
  { code: "CUS-0002", name: "Dela Cruz, Juan Santos", tin: "234-567-891-00000", street: "Purok 4, Brgy. 20, Gingoog City", zip: "9014", contact: "0918 222 3344", email: "juan.delacruz@mail.com", status: "Active", createdAt: "2026-03-02" },
  { code: "CUS-0003", name: "Mindanao Fresh Mart", tin: "345-678-912-00000", street: "Limketkai Drive, Lapasan, Cagayan de Oro City", zip: "9000", contact: "088 857 1122", email: "purchasing@mfmart.ph", status: "Active", createdAt: "2026-04-18" },
  { code: "CUS-0004", name: "Reyes, Maria Lourdes", tin: "456-789-123-00000", street: "Brgy. Poblacion, El Salvador City", zip: "9017", contact: "0920 111 7788", email: "mlreyes@mail.com", status: "Active", createdAt: "2026-05-09" },
  { code: "CUS-0005", name: "Iligan Steelworks Inc.", tin: "567-891-234-00000", street: "Brgy. Tambo, Iligan City", zip: "9200", contact: "063 221 4455", email: "finance@iligansteel.ph", status: "Active", createdAt: "2026-06-21" },
  { code: "CUS-0006", name: "Valencia Agri Supply", tin: "678-912-345-00000", street: "Sayre Highway, Poblacion, Valencia City", zip: "8709", contact: "0935 444 9090", email: "sales@valenciaagri.ph", status: "Inactive", createdAt: "2026-02-14" },
  { code: "CUS-0007", name: "Bautista, Carlo Miguel", tin: "789-123-456-00000", street: "Macasandig, Cagayan de Oro City", zip: "9000", contact: "0927 888 1212", email: "carlo.bautista@mail.com", status: "Active", createdAt: "2026-09-03" },
  { code: "CUS-0008", name: "Xavier Heights Dental Clinic", tin: "891-234-567-00000", street: "Xavier Estates, Balulang, Cagayan de Oro City", zip: "9000", contact: "0916 303 5566", email: "admin@xhdental.ph", status: "Active", createdAt: "2026-09-10" },
];

// line items: { product, qty, price }
export const sales = [
  { invoiceNo: "INV-0001", date: "2026-07-03", customer: "CUS-0001", items: [{ product: "P-001", qty: 10, price: 1850 }, { product: "P-003", qty: 5, price: 520 }], withVat: true, atc: "WC158", status: "Paid", paid: 0, notes: "" },
  { invoiceNo: "INV-0002", date: "2026-07-08", customer: "CUS-0003", items: [{ product: "P-006", qty: 200, price: 58 }, { product: "P-007", qty: 40, price: 120 }], withVat: true, atc: "WC158", status: "Paid", paid: 0, notes: "" },
  { invoiceNo: "INV-0003", date: "2026-07-15", customer: "CUS-0002", items: [{ product: "P-002", qty: 4, price: 450 }], withVat: false, atc: "", status: "Paid", paid: 0, notes: "" },
  { invoiceNo: "INV-0004", date: "2026-07-22", customer: "CUS-0005", items: [{ product: "P-005", qty: 3, price: 5800 }], withVat: true, atc: "WC158", status: "Unpaid", paid: 0, notes: "Deliver to plant office" },
  { invoiceNo: "INV-0005", date: "2026-08-02", customer: "CUS-0004", items: [{ product: "P-004", qty: 6, price: 399 }], withVat: true, atc: "", status: "Paid", paid: 0, notes: "" },
  { invoiceNo: "INV-0006", date: "2026-08-09", customer: "CUS-0001", items: [{ product: "P-001", qty: 8, price: 1850 }], withVat: true, atc: "WC158", status: "Partial", paid: 8000, notes: "" },
  { invoiceNo: "INV-0007", date: "2026-08-17", customer: "CUS-0003", items: [{ product: "P-006", qty: 150, price: 58 }], withVat: true, atc: "WC158", status: "Paid", paid: 0, notes: "" },
  { invoiceNo: "INV-0008", date: "2026-08-25", customer: "CUS-0007", items: [{ product: "P-003", qty: 2, price: 520 }, { product: "P-002", qty: 1, price: 450 }], withVat: false, atc: "", status: "Paid", paid: 0, notes: "" },
  { invoiceNo: "INV-0009", date: "2026-09-02", customer: "CUS-0005", items: [{ product: "P-008", qty: 2, price: 990 }], withVat: true, atc: "WC158", status: "Unpaid", paid: 0, notes: "" },
  { invoiceNo: "INV-0010", date: "2026-09-08", customer: "CUS-0008", items: [{ product: "P-005", qty: 2, price: 5800 }, { product: "P-001", qty: 2, price: 1850 }], withVat: true, atc: "WC158", status: "Unpaid", paid: 0, notes: "" },
  { invoiceNo: "INV-0011", date: "2026-09-14", customer: "CUS-0002", items: [{ product: "P-007", qty: 10, price: 120 }], withVat: false, atc: "", status: "Paid", paid: 0, notes: "" },
  { invoiceNo: "INV-0012", date: "2026-09-19", customer: "CUS-0003", items: [{ product: "P-006", qty: 120, price: 58 }, { product: "P-007", qty: 20, price: 120 }], withVat: true, atc: "WC158", status: "Partial", paid: 5000, notes: "" },
];

export const expenses = [
  { refNo: "EXP-0001", date: "2026-07-01", payee: "Cagayan Electric Power & Light Co.", tin: "000-111-222-00000", category: "Utilities", description: "Electricity – June", amount: 18450, atc: "", status: "Approved" },
  { refNo: "EXP-0002", date: "2026-07-05", payee: "Rosario Realty Holdings", tin: "111-222-333-00000", category: "Rent", description: "Office rent – July", amount: 45000, atc: "WC100", status: "Approved" },
  { refNo: "EXP-0003", date: "2026-07-15", payee: "Payroll – Staff", tin: "", category: "Salaries", description: "Payroll 1st half July", amount: 86500, atc: "", status: "Approved" },
  { refNo: "EXP-0004", date: "2026-07-20", payee: "JRS Express", tin: "222-333-444-00000", category: "Transportation", description: "Courier – documents", amount: 1250, atc: "WC160", status: "Approved" },
  { refNo: "EXP-0005", date: "2026-08-01", payee: "Cagayan de Oro Water District", tin: "333-444-555-00000", category: "Utilities", description: "Water – July", amount: 2380, atc: "", status: "Approved" },
  { refNo: "EXP-0006", date: "2026-08-05", payee: "Rosario Realty Holdings", tin: "111-222-333-00000", category: "Rent", description: "Office rent – August", amount: 45000, atc: "WC100", status: "Approved" },
  { refNo: "EXP-0007", date: "2026-08-12", payee: "Office Warehouse CDO", tin: "444-555-666-00000", category: "Supplies", description: "Pantry and cleaning supplies", amount: 3890, atc: "WC158", status: "Approved" },
  { refNo: "EXP-0008", date: "2026-08-28", payee: "Metro Aircon Services", tin: "555-666-777-00000", category: "Others", description: "Aircon cleaning – 4 units", amount: 6000, atc: "WC120", status: "Rejected" },
  { refNo: "EXP-0009", date: "2026-09-01", payee: "Cagayan Electric Power & Light Co.", tin: "000-111-222-00000", category: "Utilities", description: "Electricity – August", amount: 19870, atc: "", status: "Approved" },
  { refNo: "EXP-0010", date: "2026-09-05", payee: "Rosario Realty Holdings", tin: "111-222-333-00000", category: "Rent", description: "Office rent – September", amount: 45000, atc: "WC100", status: "Approved" },
  { refNo: "EXP-0011", date: "2026-09-15", payee: "Payroll – Staff", tin: "", category: "Salaries", description: "Payroll 1st half September", amount: 88200, atc: "", status: "Pending" },
  { refNo: "EXP-0012", date: "2026-09-18", payee: "Petron – Kauswagan", tin: "666-777-888-00000", category: "Transportation", description: "Fuel – delivery van", amount: 4500, atc: "", status: "Pending" },
];

export const purchases = [
  { poNo: "PO-0001", date: "2026-07-02", supplier: "Paper Plus Distributors", tin: "901-234-567-00000", items: [{ product: "P-001", qty: 30, price: 1450 }], withVat: true, atc: "WC158", status: "Received" },
  { poNo: "PO-0002", date: "2026-07-10", supplier: "Mindanao Grains Trading", tin: "912-345-678-00000", items: [{ product: "P-006", qty: 500, price: 48 }], withVat: false, atc: "WC158", status: "Received" },
  { poNo: "PO-0003", date: "2026-07-18", supplier: "TechHub Davao", tin: "923-456-789-00000", items: [{ product: "P-003", qty: 20, price: 380 }, { product: "P-004", qty: 6, price: 280 }], withVat: true, atc: "WC158", status: "Received" },
  { poNo: "PO-0004", date: "2026-07-26", supplier: "Comfort Seating Co.", tin: "934-567-891-00000", items: [{ product: "P-005", qty: 8, price: 4200 }], withVat: true, atc: "WC158", status: "Received" },
  { poNo: "PO-0005", date: "2026-08-04", supplier: "Golden Harvest Oils", tin: "945-678-912-00000", items: [{ product: "P-007", qty: 60, price: 95 }], withVat: true, atc: "WC158", status: "Received" },
  { poNo: "PO-0006", date: "2026-08-19", supplier: "Paper Plus Distributors", tin: "901-234-567-00000", items: [{ product: "P-002", qty: 10, price: 320 }], withVat: true, atc: "WC158", status: "Received" },
  { poNo: "PO-0007", date: "2026-08-30", supplier: "TechHub Davao", tin: "923-456-789-00000", items: [{ product: "P-008", qty: 5, price: 650 }], withVat: true, atc: "", status: "Cancelled" },
  { poNo: "PO-0008", date: "2026-09-06", supplier: "Mindanao Grains Trading", tin: "912-345-678-00000", items: [{ product: "P-006", qty: 300, price: 48 }], withVat: false, atc: "WC158", status: "Ordered" },
  { poNo: "PO-0009", date: "2026-09-12", supplier: "TechHub Davao", tin: "923-456-789-00000", items: [{ product: "P-004", qty: 20, price: 280 }], withVat: true, atc: "WC158", status: "Ordered" },
  { poNo: "PO-0010", date: "2026-09-20", supplier: "Paper Plus Distributors", tin: "901-234-567-00000", items: [{ product: "P-002", qty: 15, price: 320 }, { product: "P-001", qty: 20, price: 1450 }], withVat: true, atc: "WC158", status: "Ordered" },
];

// Chart of accounts. isGroup = header account (holds sub-accounts, no posting).
export const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Cost of Sales", "Expense"];

const A = (code, name, type, parent, isGroup = false, description = "") =>
  ({ code, name, type, parent, isGroup, description, status: "Active" });

export const accounts = [
  A("1000", "ASSETS", "Asset", null, true),
  A("1100", "Current Assets", "Asset", "1000", true),
  A("12100", "Cash and Cash Equivalents", "Asset", "1100", true),
  A("12101", "Petty Cash Fund", "Asset", "12100"),
  A("12102", "Cash", "Asset", "12100", false, "Cash on hand from daily collections"),
  A("12103", "Cash in Bank", "Asset", "12100"),
  A("11300", "Receivables", "Asset", "1100", true),
  A("11301", "Accounts Receivable - Trade", "Asset", "11300"),
  A("11302", "Allowance for Doubtful Accounts", "Asset", "11300", false, "Contra-asset account"),
  A("11400", "Merchandise Inventory", "Asset", "1100"),
  A("11500", "Input VAT", "Asset", "1100"),
  A("11600", "Creditable Withholding Tax", "Asset", "1100", false, "From BIR Form 2307 received"),
  A("1500", "Non-Current Assets", "Asset", "1000", true),
  A("15100", "Property and Equipment", "Asset", "1500", true),
  A("15101", "Office Equipment", "Asset", "15100"),
  A("15102", "Furniture and Fixtures", "Asset", "15100"),
  A("15103", "Transportation Equipment", "Asset", "15100"),
  A("15200", "Accumulated Depreciation", "Asset", "1500", false, "Contra-asset account"),

  A("2000", "LIABILITIES", "Liability", null, true),
  A("2100", "Current Liabilities", "Liability", "2000", true),
  A("21100", "Accounts Payable - Trade", "Liability", "2100"),
  A("21200", "Output VAT Payable", "Liability", "2100"),
  A("21300", "Withholding Tax Payable - Expanded", "Liability", "2100"),
  A("21400", "SSS / PhilHealth / Pag-IBIG Payable", "Liability", "2100"),
  A("2500", "Non-Current Liabilities", "Liability", "2000", true),
  A("25100", "Loans Payable - Long Term", "Liability", "2500"),

  A("3000", "EQUITY", "Equity", null, true),
  A("31000", "Owner's Capital", "Equity", "3000"),
  A("32000", "Retained Earnings", "Equity", "3000"),
  A("33000", "Owner's Drawings", "Equity", "3000"),

  A("4000", "REVENUE", "Revenue", null, true),
  A("4200", "Sales", "Revenue", "4000", true),
  A("42100", "Cash Sales - Vatable (Regular)", "Revenue", "4200"),
  A("42110", "Charge Sales - Vatable (Regular)", "Revenue", "4200"),
  A("42200", "Sales - VAT Exempt", "Revenue", "4200"),
  A("42300", "Sales - Zero Rated", "Revenue", "4200"),
  A("42400", "Sales - Non VAT", "Revenue", "4200"),
  A("42900", "Sales Returns and Discounts", "Revenue", "4200", false, "Contra-revenue account"),
  A("4800", "Other Income", "Revenue", "4000", true),
  A("48100", "Interest Income", "Revenue", "4800"),

  A("5000", "COST OF SALES", "Cost of Sales", null, true),
  A("51000", "Cost of Goods Sold", "Cost of Sales", "5000"),
  A("52000", "Freight In", "Cost of Sales", "5000"),

  A("6000", "OPERATING EXPENSES", "Expense", null, true),
  A("61000", "Salaries and Wages", "Expense", "6000"),
  A("62000", "Rent Expense", "Expense", "6000"),
  A("63000", "Utilities Expense", "Expense", "6000"),
  A("64000", "Office Supplies Expense", "Expense", "6000"),
  A("65000", "Transportation and Travel", "Expense", "6000"),
  A("66000", "Depreciation Expense", "Expense", "6000"),
  A("67000", "Taxes and Licenses", "Expense", "6000"),
  A("69000", "Miscellaneous Expense", "Expense", "6000"),
];

export const initialData = { products, customers, sales, expenses, purchases, accounts };