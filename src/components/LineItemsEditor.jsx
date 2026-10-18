import Icon from "./Icons";
import { money, round2 } from "../utils/format";

/*
  items: [{ product, qty, price }]
  priceField: "price" (selling price, for Sales) or "cost" (for Purchases)
  showStock: show available stock next to each product (Sales)
*/
export default function LineItemsEditor({ items, onChange, products, priceField = "price", showStock = false, error }) {
  const byCode = Object.fromEntries(products.map((p) => [p.code, p]));
  const active = products.filter((p) => p.status === "Active" || items.some((i) => i.product === p.code));

  const update = (idx, patch) => onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const pickProduct = (idx, code) => {
    const p = byCode[code];
    update(idx, { product: code, price: p ? p[priceField] : 0 });
  };

  const add = () => onChange([...items, { product: "", qty: 1, price: 0 }]);
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className="line-items">
      <div className="table-scroll">
        <table className="table table-compact">
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Product</th>
              <th className="ta-right" style={{ width: 90 }}>Qty</th>
              <th className="ta-right" style={{ width: 130 }}>{priceField === "cost" ? "Unit cost" : "Unit price"}</th>
              <th className="ta-right" style={{ width: 130 }}>Amount</th>
              <th style={{ width: 44 }}><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const p = byCode[it.product];
              return (
                <tr key={idx}>
                  <td>
                    <select className="input" value={it.product} onChange={(e) => pickProduct(idx, e.target.value)} aria-label={`Product for line ${idx + 1}`}>
                      <option value="">Select product</option>
                      {active.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.code} – {p.name}{showStock ? ` (${p.stock} ${p.unit} left)` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="input ta-right"
                      value={it.qty}
                      onChange={(e) => update(idx, { qty: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)) })}
                      aria-label={`Quantity for line ${idx + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input ta-right"
                      value={it.price}
                      onChange={(e) => update(idx, { price: e.target.value === "" ? "" : Number(e.target.value) })}
                      aria-label={`Price for line ${idx + 1}`}
                    />
                  </td>
                  <td className="ta-right num">
                    {money(round2((Number(it.qty) || 0) * (Number(it.price) || 0)))}
                    {p && <div className="muted small">{p.unit}</div>}
                  </td>
                  <td>
                    <button className="icon-btn ghost" onClick={() => remove(idx)} disabled={items.length === 1} aria-label={`Remove line ${idx + 1}`}>
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <div className="field-error">{error}</div>}
      <button className="btn btn-sm" onClick={add} type="button">
        <Icon name="plus" size={15} /> Add item
      </button>
    </div>
  );
}

// Totals box used in Sales and Purchases forms
export function TotalsBox({ totals, paidLabel }) {
  return (
    <dl className="totals">
      <dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd>
      <dt>VAT (12%)</dt><dd>{money(totals.vat)}</dd>
      <dt>Withholding tax</dt><dd>− {money(totals.wtax)}</dd>
      <dt className="grand">{paidLabel || "Total amount due"}</dt><dd className="grand">{money(totals.total)}</dd>
    </dl>
  );
}
