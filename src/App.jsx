import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { RequireAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import { ALL_PAGES } from "./components/routesMeta";
import Product from "./pages/setup/Product";
import Customer from "./pages/setup/Customer";
import Vendor from "./pages/setup/Vendor";
import ChartOfAccounts from "./pages/setup/ChartOfAccounts";
import ComingSoon from "./pages/ComingSoon";

import Sales from "./pages/task/Sales";
import SalesDetail from "./pages/task/sales/SalesDetail";
import ScannedReceipts from "./pages/task/sales/ScannedReceipts";
import InvalidSales from "./pages/task/sales/InvalidSales";
import ForCollection from "./pages/task/sales/ForCollection";
import MissingInvoices from "./pages/task/sales/Missinginvoices";
import SalesComingSoon from "./pages/task/sales/Salescomingsoon";

import Purchases from "./pages/task/Purchases";
import PurchaseDetail from "./pages/task/purchases/PurchaseDetail";
import PurchaseOrders from "./pages/task/purchases/PurchaseOrders";
import PurchaseOrderDetail from "./pages/task/purchases/PurchaseOrderDetail";
import PurchaseScanned from "./pages/task/purchases/ScannedReceipts";
import InvalidPurchases from "./pages/task/purchases/InvalidPurchases";
import PurchaseForPayment from "./pages/task/purchases/ForPayment";

import Expenses from "./pages/task/Expenses";
import ExpenseDetail from "./pages/task/expenses/ExpenseDetail";
import ExpenseScanned from "./pages/task/expenses/ScannedReceipts";
import InvalidExpenses from "./pages/task/expenses/InvalidExpenses";

import Importation from "./pages/task/Importation";
import ImportationDetail from "./pages/task/importation/ImportationDetail";

import Exportation from "./pages/task/Exportation";
import ExportationDetail from "./pages/task/exportation/ExportationDetail";

import Inventory from "./pages/task/Inventory";
import ReceiveInventoryDetail from "./pages/task/inventory/ReceiveInventoryDetail";
import {
  InventoryStocks, InventoryVariance, InventoryAdjustment, InventoryInternalTransfer,
  InventoryAdjustmentDetail
} from "./pages/task/inventory/InventoryTabs";

import GeneralJournal from "./pages/task/GeneralJournal";
import FixedAssets from "./pages/task/FixedAssets";

import NotFound from "./pages/NotFound";
import Journals from "./pages/books/Journals";
import Reports from "./pages/books/Reports";
import Ledgers from "./pages/books/Ledgers";
import TrialBalance from "./pages/financial/TrialBalance";
import BalanceSheet from "./pages/financial/BalanceSheet";
import WorkingTrialBalance from "./pages/financial/WorkingTrialBalance";
import ConsolidatedReport from "./pages/financial/ConsolidatedReport";
import AnnualSummary from "./pages/financial/AnnualSummary";
import CashFlow from "./pages/financial/CashFlow";
import RetainedEarnings from "./pages/financial/RetainedEarnings";
import ChangesInEquity from "./pages/financial/ChangesInEquity";
import FinancialStatement from "./pages/financial/FinancialStatement";
import BirReturn from "./pages/bir/BirReturn";
import Bir2307 from "./pages/bir/Bir2307";
import VatSummary from "./pages/bir/VatSummary";
import EsubReport from "./pages/bir/EsubReport";
import IncomeTaxSummary from "./pages/bir/IncomeTaxSummary";
import ReportGenerator from "./pages/other/ReportGenerator";
import Transactions from "./pages/other/Transactions";
import Team from "./pages/Team";
import Settings from "./pages/Settings";

import ImportEngagement from "./pages/setup/ImportEngagement";
import ExportEngagement from "./pages/setup/ExportEngagement";
import DiscountList from "./pages/setup/DiscountList";
import StoreWarehouse from "./pages/setup/StoreWarehouse";

import Banking from "./pages/task/Banking";
import BankingPayment from "./pages/task/banking/Payment";
import PettyCash from "./pages/task/banking/PettyCash";
import LoanManagement from "./pages/task/LoanManagement";

import Receivables, { AgedReceivables } from "./pages/books/Receivables";
import Payables, { AgedPayables } from "./pages/books/Payables";

import BillingDashboard from "./pages/billing/BillingDashboard";
import ServiceList from "./pages/billing/ServiceList";
import RecurringService from "./pages/billing/RecurringService";
import GenerateBilling from "./pages/billing/GenerateBilling";
import Collection from "./pages/billing/Collection";
import Deposit from "./pages/billing/Deposit";
import ReturnAr from "./pages/billing/ReturnAr";

import ClientMasterlist from "./pages/client/ClientMasterlist";
import ClientMasterFile from "./pages/client/ClientMasterFile";

import AuditMonitoring from "./pages/monitoring/AuditMonitoring";
import Reconciliation from "./pages/monitoring/reconciliation";
import EfficiencyMonitoring from "./pages/monitoring/EfficiencyMonitoring";
import ScanMonitoring from "./pages/monitoring/ScanMonitoring";
import CollectionMonitoring from "./pages/monitoring/CollectionMonitoring";
import Retainersfee from "./pages/monitoring/Retainersfee";

import HRSettings from "./pages/hr/HRSettings";
import EmployeeHR from "./pages/hr/EmployeeHR";
import Attendance from "./pages/hr/Attendance";
import { ManageLeave, ManageOvertime } from "./pages/hr/Requests";
import Payroll from "./pages/hr/Payroll";
import Lending from "./pages/hr/Lending";
import Profile from "./pages/MyProfile";
import HRDashboard from "./pages/hr/HrDashboard";

import VATSummaryReport from "./pages/reports/VATSummary";
import IncomeSummary from "./pages/reports/IncomeSummary";
import PercentageTax from "./pages/reports/PercentageTax";
import ExpandedWithholdingTax from "./pages/reports/ExpandedWithholdingTax";
import RevertedSummary from "./pages/reports/RevertedSummary";
import BirReturnSummary from "./pages/reports/BirReturnSummary";

import Ticket from "./pages/administration/Ticket";
import DeclaredMonthSettings from "./pages/administration/DeclaredMonthSettings";
import UserLogs from "./pages/administration/UserLogs";
import UserAccess from "./pages/administration/UserAccess";
import DatabaseSettings from "./pages/administration/DatabaseSettings";
import Archive from "./pages/administration/Archive";
import { MessengerPage } from "./components/Messenger";
import Notifications from "./pages/Notifications";
import HelpSupport from "./pages/HelpSupport";
import BranchEmployees from "./pages/BranchEmployees";
// Built pages. Add new ones here as you make them;
// everything else in the sidebar shows "Coming soon".
const PAGES = {
  "/": Home,
  "/dashboard": Dashboard,
  "/profile": Profile,
  "/hr/dashboard": HRDashboard,
  "/setup/product": Product,
  "/setup/customer": Customer,
  "/setup/vendors": Vendor,
  "/setup/chart-of-accounts": ChartOfAccounts,
  "/setup/import-engagement": ImportEngagement,
  "/setup/export-engagement": ExportEngagement,
  "/setup/discounts": DiscountList,
  "/setup/warehouses": StoreWarehouse,

  "/bir/returns": BirReturn,
  "/bir/2307": Bir2307,
  "/bir/vat-summary": VatSummary,
  "/bir/e-sub": EsubReport,
  "/bir/income-tax": IncomeTaxSummary,

  // Sales tabs
  "/task/sales": Sales,
  "/task/sales/pos": SalesComingSoon,
  "/task/sales/scanned-receipts": ScannedReceipts,
  "/task/sales/invalid": InvalidSales,
  "/task/sales/for-collection": ForCollection,
  "/task/sales/missing-invoices": MissingInvoices,

  // Purchase tabs
  "/task/purchases": Purchases,
  "/task/purchases/purchase-orders": PurchaseOrders,
  "/task/purchases/purchase-orders/:id": PurchaseOrderDetail,
  "/task/purchases/scanned-receipts": PurchaseScanned,
  "/task/purchases/invalid": InvalidPurchases,
  "/task/purchases/for-payment": PurchaseForPayment,
  "/task/purchases/:id": PurchaseDetail,

  // Expense
  "/task/expenses": Expenses,
  "/task/expenses/scanned-receipts": ExpenseScanned,
  "/task/expenses/invalid": InvalidExpenses,
  "/task/expenses/:id": ExpenseDetail,

  // Importation and Exportation
  "/task/importation": Importation,
  "/task/importation/importation-detail/:id": ImportationDetail,
  "/task/exportation": Exportation,
  "/task/exportation/exportation-detail/:id": ExportationDetail,

  "/task/inventory": Inventory,
  "/task/inventory/receive/:id": ReceiveInventoryDetail,
  "/task/inventory/stocks": InventoryStocks,
  "/task/inventory/variance": InventoryVariance,
  "/task/inventory/adjustment": InventoryAdjustment,
  "/task/inventory/internal-transfer": InventoryInternalTransfer,
  "/task/inventory/adjustment/:id": InventoryAdjustmentDetail,

  "/task/general-journal": GeneralJournal,
  "/task/fixed-assets": FixedAssets,

  "/task/banking": Banking,
  "/task/banking/payment": BankingPayment,
  "/task/banking/petty-cash": PettyCash,

  "/task/loans": LoanManagement,

  // Books & Ledger
  "/books/journals": Journals,
  "/books/reports": Reports,
  "/books/ledgers": Ledgers,

  "/financial/balance-sheet": BalanceSheet,
  "/financial/trial-balance": TrialBalance,
  "/financial/working-trial-balance": WorkingTrialBalance,
  "/financial/consolidated-report": ConsolidatedReport,
  "/financial/annual-summary": AnnualSummary,
  "/financial/cash-flow": CashFlow,
  "/financial/retained-earnings": RetainedEarnings,
  "/financial/changes-in-equity": ChangesInEquity,
  "/financial/financial-statement": FinancialStatement,

  "/other/report-generator": ReportGenerator,
  "/other/transactions": Transactions,

  "/team": Team,
  "/employees": BranchEmployees,
  "/settings": Settings,

  "/books/receivables": Receivables,
  "/books/receivables/aged": AgedReceivables,
  "/books/payables": Payables,
  "/books/payables/aged": AgedPayables,

  "/billing/dashboard": BillingDashboard,
  "/billing/service-list": ServiceList,
  "/billing/recurring-service": RecurringService,
  "/billing/generate-billing": GenerateBilling,
  "/billing/collection": Collection,
  "/billing/deposit": Deposit,
  "/billing/return-ar": ReturnAr,

  "/client/masterlist": ClientMasterlist,
  "/client/master-file": ClientMasterFile,

  "/monitoring/reconciliation": Reconciliation,
  "/monitoring/audit": AuditMonitoring,
  "/monitoring/efficiency": EfficiencyMonitoring,
  "/monitoring/scan": ScanMonitoring,
  "/monitoring/collection": CollectionMonitoring,
  "/monitoring/retainers-fee": Retainersfee,

  "/hr/attendance": Attendance,
  "/hr/payroll": Payroll,
  "/hr/employees": EmployeeHR,
  "/hr/manage-leave": ManageLeave,
  "/hr/manage-overtime": ManageOvertime,
  "/hr/lending": Lending,
  "/hr/settings": HRSettings,

  "/reports/vat-summary": VATSummaryReport,
  "/reports/income-summary": IncomeSummary,
  "/reports/percentage-tax": PercentageTax,
  "/reports/expanded-withholding-tax": ExpandedWithholdingTax,
  "/reports/reverted-summary": RevertedSummary,
  "/reports/bir-return-summary": BirReturnSummary,

  "/administration/admin-ticket": Ticket,
  "/administration/declared-month-settings": DeclaredMonthSettings,
  "/administration/user-logs": UserLogs,
  "/administration/user-access": UserAccess,
  "/administration/database-settings": DatabaseSettings,
  "/administration/archive": Archive,

  "/notifications": Notifications,
  "/help": HelpSupport,
};

// Routes that are not in the sidebar (page tabs)
const EXTRA_ROUTES = Object.keys(PAGES).filter((to) => !ALL_PAGES.some((p) => p.to === to));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Everything else needs a login */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        {ALL_PAGES.map(({ to }) => {
          const Page = PAGES[to] || ComingSoon;
          return <Route key={to} path={to} element={<Page />} />;
        })}
        {EXTRA_ROUTES.map((to) => {
          const Page = PAGES[to];
          return <Route key={to} path={to} element={<Page />} />;
        })}
        {/* Invoice page: /task/sales/new and /task/sales/INV-0001 */}
        <Route path="/task/sales/:id" element={<SalesDetail />} />
        <Route path="*" element={<NotFound />} />
        <Route path="/messenger" element={<MessengerPage />} />
      </Route>
    </Routes>
  );
}