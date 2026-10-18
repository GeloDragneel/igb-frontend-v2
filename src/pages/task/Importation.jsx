// Importation list – shared layout in ./trade/TradeList.jsx
import TradeList from "./trade/TradeList";
import { IMPORTATION } from "./trade/tradeConfig";

export default function Importation() {
  return <TradeList cfg={IMPORTATION} />;
}
