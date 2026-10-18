// Reports → Payables: Account Payable (as of month) and Aged Payable tabs
import AgingReport from "./AgingReport";

export default function Payables() {
  return <AgingReport type="ap" mode="asof" />;
}

export function AgedPayables() {
  return <AgingReport type="ap" mode="aged" />;
}
