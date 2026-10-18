// Reports → Receivables: Account Receivable (as of month) and Aged Receivable tabs
import AgingReport from "./AgingReport";

export default function Receivables() {
  return <AgingReport type="ar" mode="asof" />;
}

export function AgedReceivables() {
  return <AgingReport type="ar" mode="aged" />;
}
