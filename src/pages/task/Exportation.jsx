// Exportation list – shared layout in ./trade/TradeList.jsx
import TradeList from "./trade/TradeList";
import { EXPORTATION } from "./trade/tradeConfig";

export default function Exportation() {
  return <TradeList cfg={EXPORTATION} />;
}
