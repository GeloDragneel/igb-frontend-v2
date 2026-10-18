import { useEffect, useRef, useState } from "react";
import Icon from "./Icons";
import { usePeriod, monthRange } from "../context/PeriodContext";
import { today } from "../utils/format";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-09-01" -> "Sep 01, 2026"
const label = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${SHORT[m - 1]} ${String(d).padStart(2, "0")}, ${y}`;
};

// "2026-09" -> "September 2026"
const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return `${LONG[m - 1]} ${y}`;
};

const ym = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

/* ---------- one month field with its own grid ---------- */
function MonthField({ id, labelText, value, min, open, onToggle, onChange }) {
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const [nowY, nowM] = today().split("-").map(Number);

  useEffect(() => {
    if (open) setYear(Number(value.slice(0, 4)));
  }, [open, value]);

  return (
    <div className="mf">
      <span className="mf-label" id={`${id}-label`}>{labelText}</span>
      <button
        type="button"
        className={`mf-input ${open ? "open" : ""}`}
        onClick={onToggle}
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
      >
        <span>{monthLabel(value)}</span>
        <Icon name="calendar" size={15} />
      </button>

      {open && (
        <div className="mf-grid-wrap">
          <div className="mf-year">
            <button type="button" onClick={() => setYear(year - 1)} aria-label="Previous year">
              <Icon name="chevron" size={14} style={{ transform: "rotate(180deg)" }} />
            </button>
            <strong>{year}</strong>
            <button type="button" onClick={() => setYear(year + 1)} aria-label="Next year">
              <Icon name="chevron" size={14} />
            </button>
          </div>

          <div className="mf-grid">
            {SHORT.map((name, i) => {
              const v = ym(year, i + 1);
              const disabled = min && v < min;
              return (
                <button
                  type="button"
                  key={name}
                  disabled={disabled}
                  className={`${v === value ? "on" : ""} ${year === nowY && i + 1 === nowM ? "now" : ""}`}
                  onClick={() => onChange(v)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- period picker ---------- */
export default function PeriodPicker() {
  const { from, to, setPeriod } = usePeriod();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState(null); // "from" | "to" | null
  const [draft, setDraft] = useState({ from: from.slice(0, 7), to: to.slice(0, 7) });
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return;
    setDraft({ from: from.slice(0, 7), to: to.slice(0, 7) });
    setField(null);
    const onDown = (e) => !wrap.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, from, to]);

  const pickFrom = (v) => {
    // keep To valid: if From goes past To, move To along
    setDraft((d) => ({ from: v, to: d.to < v ? v : d.to }));
    setField(null);
  };

  const pickTo = (v) => {
    setDraft((d) => ({ ...d, to: v }));
    setField(null);
  };

  const apply = () => {
    setPeriod({ from: `${draft.from}-01`, to: monthRange(`${draft.to}-01`).to });
    setOpen(false);
  };

  const thisMonth = () => {
    const [y, m] = today().split("-").map(Number);
    setDraft({ from: ym(y, m), to: ym(y, m) });
    setField(null);
  };

  return (
    <div className="period" ref={wrap}>
      <button className="period-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Change period">
        <Icon name="calendar" size={15} />
        <span>{label(from)} to {label(to)}</span>
      </button>

      {open && (
        <div className="period-pop" role="dialog" aria-label="Choose period">
          <MonthField
            id="pf-from"
            labelText="From"
            value={draft.from}
            open={field === "from"}
            onToggle={() => setField(field === "from" ? null : "from")}
            onChange={pickFrom}
          />
          <MonthField
            id="pf-to"
            labelText="To"
            value={draft.to}
            min={draft.from}
            open={field === "to"}
            onToggle={() => setField(field === "to" ? null : "to")}
            onChange={pickTo}
          />

          <div className="period-actions">
            <button type="button" className="period-link" onClick={thisMonth}>This month</button>
            <button type="button" className="period-apply" onClick={apply}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}