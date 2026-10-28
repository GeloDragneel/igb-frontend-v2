// Sidebar menu. Every link here gets a route automatically (see App.jsx).
// Pages that are not built yet show a "Coming soon" screen.
export const NAV = [
  {
    section: "Accounting",
    entries: [
      { to: "/", label: "Home", icon: "home" },
      {
        group: "Task",
        icon: "checkSquare",
        items: [
          { to: "/task/sales", label: "Sales" },
          { to: "/task/purchases", label: "Purchases" },
          { to: "/task/expenses", label: "Expenses" },
          { to: "/task/importation", label: "Importation" },
          { to: "/task/exportation", label: "Exportation" },
          { to: "/task/inventory", label: "Inventory" },
          { to: "/task/banking", label: "Banking" },
          { to: "/task/general-journal", label: "General Journal" },
          { to: "/task/fixed-assets", label: "Fixed Asset Management" },
          { to: "/task/loans", label: "Loan Management" },
        ],
      },
      {
        group: "Setup",
        icon: "users",
        items: [
          { to: "/setup/vendors", label: "Vendors" },
          { to: "/setup/customer", label: "Customer" },
          { to: "/setup/product", label: "Products" },
          { to: "/setup/import-engagement", label: "Import Engagement" },
          { to: "/setup/export-engagement", label: "Export Engagement" },
          { to: "/setup/chart-of-accounts", label: "Charts of Account" },
          { to: "/setup/warehouses", label: "Store / Warehouse" },
          { to: "/setup/discounts", label: "Discount List" },
        ],
      },
      {
        group: "BIR & Tax",
        icon: "fileText",
        items: [
          { to: "/bir/returns", label: "BIR Return" },
          { to: "/bir/2307", label: "BIR2307" },
          { to: "/bir/vat-summary", label: "VAT Summary" },
          { to: "/bir/e-sub", label: "E-Sub Report" },
          { to: "/bir/income-tax", label: "Income Tax Summary" },
        ],
      },
      {
        group: "Books & Ledger",
        icon: "book",
        items: [
          { to: "/books/journals", label: "Journals" },
          { to: "/books/reports", label: "Reports" },
          { to: "/books/ledgers", label: "Ledgers" },
          { to: "/books/receivables", label: "Receivables" },
          { to: "/books/payables", label: "Payables" },
        ],
      },
      {
        group: "Financial Reports",
        icon: "barChart",
        items: [
          { to: "/financial/balance-sheet", label: "Balance Sheet" },
          { to: "/financial/cash-flow", label: "Cash Flow" },
          { to: "/financial/retained-earnings", label: "Retained Earnings" },
          { to: "/financial/changes-in-equity", label: "Changes in Equity" },
          { to: "/financial/annual-summary", label: "Annual Summary" },
          { to: "/financial/consolidated-report", label: "Consolidated Report (Detailed)" },
          { to: "/financial/trial-balance", label: "Trial Balance" },
          { to: "/financial/working-trial-balance", label: "Working Trial Balance" },
          { to: "/financial/financial-statement", label: "Financial Statement" },
        ],
      },
      {
        group: "Other Reports",
        icon: "layers",
        items: [
          { to: "/other/report-generator", label: "Report Generator" },
          { to: "/other/transactions", label: "Transactions" },
        ],
      },
    ],
  },
  {
    section: "Admin",
    entries: [
      { to: "/settings", label: "Settings", icon: "settings" },
      { to: "/employees", label: "Employee", icon: "users" },
      { to: "/team", label: "Team", icon: "users" },
    ],
  },
  {
    section: "Staff",
    entries: [
      { to: "/dashboard", label: "Dashboard", icon: "home" },
      {
        group: "Monitoring",
        icon: "barChart",
        items: [
          { to: "/monitoring/reconciliation", label: "Reconciliation" },
          { to: "/monitoring/audit", label: "Audit" },
          { to: "/monitoring/efficiency", label: "Efficiency" },
          { to: "/monitoring/scan", label: "Scan" },
          { to: "/monitoring/collection", label: "Collection" },
          { to: "/monitoring/retainers-fee", label: "Retainers Fee" },
        ],
      },
      {
        group: "Billing",
        icon: "wallet",
        items: [
          { to: "/billing/dashboard", label: "Dashboard" },
          { to: "/billing/collection", label: "Collection" },
          { to: "/billing/deposit", label: "Deposit" },
          { to: "/billing/recurring-service", label: "Recurring Service" },
          { to: "/billing/generate-billing", label: "Generate Billing" },
          { to: "/billing/return-ar", label: "Return AR" },
          { to: "/billing/service-list", label: "Service List" },
        ],
      },
      {
        group: "Reports",
        icon: "fileText",
        items: [
          { to: "/reports/vat-summary", label: "VAT Summary" },
          { to: "/reports/income-summary", label: "Income Summary" },
          { to: "/reports/percentage-tax", label: "Percentage Tax Sum." },
          { to: "/reports/expanded-withholding-tax", label: "Expanded WHT" },
          { to: "/reports/reverted-summary", label: "Reverted Summary" },
          { to: "/reports/bir-return-summary", label: "BIR Return Summary" },
        ],
      },
      {
        group: "Clients",
        icon: "users",
        items: [
          { to: "/client/masterlist", label: "Masterlist" },
          { to: "/client/master-file", label: "Master File" },
          { to: "/client/documents", label: "Document List" },
        ],
      },
      {
        group: "HR Management",
        icon: "calendar",
        items: [
          { to: "/hr/dashboard", label: "Dashboard" },
          { to: "/hr/attendance", label: "Attendance" },
          // { to: "/hr/biometric", label: "Biometric" },
          { to: "/hr/payroll", label: "Payroll" },
          { to: "/hr/employees", label: "Employees" },
          // { to: "/hr/performance", label: "Performance" },
          { to: "/hr/manage-leave", label: "Manage Leave" },
          { to: "/hr/manage-overtime", label: "Manage Overtime" },
          // { to: "/hr/cofe", label: "COFE" },
          // { to: "/hr/advances", label: "Advances" },
          { to: "/hr/lending", label: "Lending" },
          { to: "/hr/settings", label: "Settings" },
        ],
      },
      {
        group: "Administration",
        icon: "settings",
        items: [
          { to: "/administration/user-access", label: "User Access" },
          { to: "/administration/user-logs", label: "User Logs" },
          { to: "/administration/admin-ticket", label: "Ticket" },
          { to: "/administration/database-settings", label: "Database" },
          { to: "/administration/declared-month-settings", label: "Declared Month" },
          { to: "/administration/archive", label: "Archive", icon: "layers" },
        ],
      },
    ],
  },
];

// Pages that have a route but are NOT in the sidebar (opened from the header menu, etc.)
export const EXTRA_PAGES = [
  { to: "/profile", label: "My profile", crumbs: ["Staff", "My profile"] },
];

// Flat list of every page: { to, label, crumbs }
export const ALL_PAGES = [...NAV.flatMap((s) =>
  s.entries.flatMap((e) =>
    e.group
      ? e.items.map((i) => ({
        to: i.to,
        label: i.label,
        crumbs: [s.section, e.group, i.label],
      }))
      : [
        {
          to: e.to,
          label: e.label,
          crumbs: [s.section, e.label],
        },
      ]
  )
), ...EXTRA_PAGES];

// { "/task/sales": { title: "Sales", crumbs: ["Accounting", "Task", "Sales"] }, ... }
export const ROUTE_META = Object.fromEntries(
  ALL_PAGES.map((p) => [
    p.to,
    {
      title: p.label,
      crumbs: p.crumbs,
    },
  ])
);

// Tabs inside a page (each tab is its own page/route)
export const SALES_TABS = [
  { to: "/task/sales", label: "Invoice", end: true },
  // { to: "/task/sales/pos", label: "POS" },
  { to: "/task/sales/scanned-receipts", label: "Scanned Receipts" },
  { to: "/task/sales/invalid", label: "Invalid - Partially Invalid - Cancel" },
  { to: "/task/sales/for-collection", label: "For Collection" },
  // { to: "/task/sales/missing-invoices", label: "Missing invoice monitoring" },
];

export const PURCHASE_TABS = [
  { to: "/task/purchases", label: "Vendor Invoices", end: true },
  { to: "/task/purchases/purchase-orders", label: "Purchase Order" },
  { to: "/task/purchases/scanned-receipts", label: "Scanned Receipts" },
  { to: "/task/purchases/invalid", label: "Invalid - Partially Invalid - Cancel" },
  { to: "/task/purchases/for-payment", label: "For Payment" },
];

export const EXPENSE_TABS = [
  { to: "/task/expenses", label: "Expense Transaction", end: true },
  { to: "/task/expenses/scanned-receipts", label: "Scanned Receipts" },
  { to: "/task/expenses/invalid", label: "Invalid - Partially Invalid - Cancel" },
];

export const INVENTORY_TABS = [
  { to: "/task/inventory", label: "Receive Inventory", end: true },
  { to: "/task/inventory/stocks", label: "Stocks" },
  { to: "/task/inventory/variance", label: "Variance" },
  { to: "/task/inventory/adjustment", label: "Adjustment" },
  { to: "/task/inventory/internal-transfer", label: "Internal Transfer" },
];


export const BANKING_TABS = [
  { to: "/task/banking", label: "Collection", end: true },
  { to: "/task/banking/payment", label: "Payment" },
  { to: "/task/banking/petty-cash", label: "Petty Cash" },
];

// Add sub pages to ROUTE_META so the title and breadcrumbs work
SALES_TABS.slice(1).forEach((t) => {
  ROUTE_META[t.to] = {
    title: `Sales · ${t.label}`,
    crumbs: ["Accounting", "Task", "Sales", t.label],
  };
});

PURCHASE_TABS.slice(1).forEach((t) => {
  ROUTE_META[t.to] = {
    title: `Purchases · ${t.label}`,
    crumbs: ["Accounting", "Task", "Purchases", t.label],
  };
});

EXPENSE_TABS.slice(1).forEach((t) => {
  ROUTE_META[t.to] = {
    title: `Expenses · ${t.label}`,
    crumbs: ["Accounting", "Task", "Expenses", t.label],
  };
});

INVENTORY_TABS.slice(1).forEach((t) => {
  ROUTE_META[t.to] = {
    title: `Inventory · ${t.label}`,
    crumbs: ["Accounting", "Task", "Inventory", t.label],
  };
});

BANKING_TABS.slice(1).forEach((t) => {
  ROUTE_META[t.to] = {
    title: `Banking · ${t.label}`,
    crumbs: ["Accounting", "Task", "Banking", t.label],
  };
});

// Title + breadcrumbs for any path, including detail pages
export function metaFor(pathname) {
  if (ROUTE_META[pathname]) return ROUTE_META[pathname];

  const label = (id, newLabel) => (id === "new" ? newLabel : id);

  // detail pages: [pattern, title, crumbs before the id, label for "new"]
  const DETAILS = [
    [/^\/task\/sales\/([^/]+)$/, "Sales / Invoicing", ["Accounting", "Task", "Sales"], "New Invoice"],
    [/^\/task\/purchases\/purchase-orders\/([^/]+)$/, "Purchase Order", ["Accounting", "Task", "Purchases", "Purchase Order"], "New Purchase Order"],
    [/^\/task\/purchases\/([^/]+)$/, "Purchases / Invoicing", ["Accounting", "Task", "Purchases"], "New Invoice"],
    [/^\/task\/expenses\/([^/]+)$/, "Expenses", ["Accounting", "Task", "Expenses"], "New Expense"],
    [/^\/task\/importation\/importation-detail\/([^/]+)$/, "Importation", ["Accounting", "Task", "Importation"], "New Importation"],
    [/^\/task\/exportation\/exportation-detail\/([^/]+)$/, "Exportation", ["Accounting", "Task", "Exportation"], "New Exportation"],
    [/^\/task\/inventory\/receive\/([^/]+)$/, "Receive Inventory", ["Accounting", "Task", "Inventory", "Receive Inventory"], "New"],
  ];

  for (const [re, title, crumbs, newLabel] of DETAILS) {
    const m = pathname.match(re);
    if (m) {
      const id = decodeURIComponent(m[1]);
      return { title, crumbs: [...crumbs, label(id, newLabel)] };
    }
  }

  return null;
}