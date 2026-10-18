import { Link, useLocation } from "react-router-dom";
import Icon from "../components/Icons";
import { ROUTE_META } from "../components/routesMeta";
import { usePeriod } from "../context/PeriodContext";
import { fmtDate } from "../utils/format";

// Placeholder for menu pages that aren't built yet.
export default function ComingSoon() {
  const { pathname } = useLocation();
  const meta = ROUTE_META[pathname];
  const { from, to } = usePeriod();

  return (
    <div className="card not-found">
      <span className="soon-icon"><Icon name="clock" size={30} /></span>
      <h2>{meta?.title || "This page"} is coming soon</h2>
      <p>
        This page is part of <strong>{meta?.crumbs.slice(0, -1).join(" / ")}</strong> and isn't built yet.
        <br />
        Reporting period: {fmtDate(from)} to {fmtDate(to)}
      </p>

      <div className="soon-actions">
        <Link to="/task/sales" className="btn btn-primary">
          <Icon name="receipt" size={16} /> Go to Sales
        </Link>
        <Link to="/task/purchases" className="btn">
          <Icon name="cart" size={16} /> Go to Purchases
        </Link>
        <Link to="/task/expenses" className="btn">
          <Icon name="wallet" size={16} /> Go to Expenses
        </Link>
      </div>
    </div>
  );
}