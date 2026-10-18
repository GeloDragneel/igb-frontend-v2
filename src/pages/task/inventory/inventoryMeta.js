// Inventory tabs (old: RECEIVE INVENTORY · STOCKS · VARIANCE · ADJUSTMENT · INTERNAL TRANSFER)
export const INVENTORY_PATH = "/task/inventory";
export const RECEIVE_DETAIL_PATH = "/task/inventory/receive"; // + "/new" or "/GRN-…"

export const INVENTORY_TABS = [
  { to: INVENTORY_PATH, label: "Receive Inventory", end: true },
  { to: `${INVENTORY_PATH}/stocks`, label: "Stocks" },
  { to: `${INVENTORY_PATH}/variance`, label: "Variance" },
  { to: `${INVENTORY_PATH}/adjustment`, label: "Adjustment" },
  { to: `${INVENTORY_PATH}/internal-transfer`, label: "Internal Transfer" },
];
