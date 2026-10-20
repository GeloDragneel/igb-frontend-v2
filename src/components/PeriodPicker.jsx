import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icons";
import { usePeriod, monthRange } from "../context/PeriodContext";
import { today } from "../utils/format";
import "./PeriodPicker.css";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-09-01" -> "Sep 01, 2026"
const label = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${SHORT[m - 1]} ${String(d).padStart(2, "0")}, ${y}`;
};

const ym = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

// months between two "YYYY-MM" (inclusive)
const monthsBetween = (a, b) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am) + 1;
};

// quick ranges, counted from today
function presets() {
  const [y, m] = today().split("-").map(Number);
  const q = Math.floor((m - 1) / 3);                       // 0..3
  const lm = m === 1 ? [y - 1, 12] : [y, m - 1];
  const lq = q === 0 ? [y - 1, 3] : [y, q - 1];
  return [
    { key: "tm", label: "This month", from: ym(y, m), to: ym(y, m) },
    { key: "lm", label: "Last month", from: ym(...lm), to: ym(...lm) },
    { key: "tq", label: `Q${q + 1} ${y}`, from: ym(y, q * 3 + 1), to: ym(y, q * 3 + 3) },
    { key: "lq", label: `Q${lq[1] + 1} ${lq[0]}`, from: ym(lq[0], lq[1] * 3 + 1), to: ym(lq[0], lq[1] * 3 + 3) },
    { key: "ty", label: `Year ${y}`, from: ym(y, 1), to: ym(y, 12) },
    { key: "ly", label: `Year ${y - 1}`, from: ym(y - 1, 1), to: ym(y - 1, 12) },
  ];
}

/* ---------- month panel: opens to the RIGHT of the field, arrow pointing back at it ---------- */
function MonthCal({ anchor, edge, value, min, onPick, onClose }) {
  const [year, setYear] = useState(Number((value || today()).slice(0, 4)));
  const [pos, setPos] = useState(null);
  const [nowY, nowM] = today().split("-").map(Number);

  // fixed position from the field (top) and the popover's right edge (left), kept on scroll / resize
  useLayoutEffect(() => {
    const place = () => {
      const f = anchor.current?.getBoundingClientRect();
      const e = edge.current?.getBoundingClientRect();
      if (!f || !e) return;
      const h = 250;
      const top = Math.max(8, Math.min(f.top + f.height / 2 - 42, window.innerHeight - h - 8));
      setPos({ top, left: e.right + 12, arrow: f.top + f.height / 2 - top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor, edge]);

  if (!pos) return null;
  return createPortal(
    <div className="pp-cal" style={{ top: pos.top, left: pos.left, "--arrow": `${pos.arrow}px` }} role="dialog" aria-label="Pick a month">
      <div className="pp-cal-year">
        <button type="button" onClick={() => setYear(year - 1)} aria-label="Previous year">‹</button>
        <strong>{year}</strong>
        <button type="button" onClick={() => setYear(year + 1)} aria-label="Next year">›</button>
      </div>
      <div className="pp-cal-grid">
        {SHORT.map((name, i) => {
          const v = ym(year, i + 1);
          return (
            <button
              type="button"
              key={name}
              disabled={!!min && v < min}
              className={`${v === value ? "is-on" : ""}${year === nowY && i + 1 === nowM ? " is-now" : ""}`}
              onClick={() => { onPick(v); onClose(); }}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div className="pp-cal-foot">
        <button type="button" onClick={() => { const t = ym(nowY, nowM); if (!min || t >= min) { onPick(t); onClose(); } else setYear(nowY); }}>This month</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body
  );
}

/* ---------- one month field: type it (input type="month") or pick it from the panel ---------- */
function MonthField({ id, labelText, value, min, onChange, open, onToggle, onClose, edge }) {
  const box = useRef(null);
  return (
    <div className="pp-field">
      <label className="pp-label" htmlFor={id}>{labelText}</label>
      <div className={`pp-box${open ? " is-open" : ""}`} ref={box}>
        <input
          id={id}
          type="month"
          className="pp-input"
          value={value}
          min={min || undefined}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); onToggle(); } }}
        />
        <button type="button" className="pp-cal-btn" onClick={onToggle} aria-expanded={open} aria-label={`Pick ${labelText} month`}>
          <Icon name="calendar" size={15} />
        </button>
      </div>
      {open && <MonthCal anchor={box} edge={edge} value={value} min={min} onPick={onChange} onClose={onClose} />}
    </div>
  );
}

/* ---------- period picker ---------- */
export default function PeriodPicker() {
  const { from, to, setPeriod } = usePeriod();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: from.slice(0, 7), to: to.slice(0, 7) });
  const [cal, setCal] = useState(null);   // "from" | "to" | null – which month panel is open
  const wrap = useRef(null);
  const pop = useRef(null);
  const btn = useRef(null);
  const [pos, setPos] = useState(null);   // where the popover sits: right of the button

  // fixed to the RIGHT of the period button (outside the sidebar), arrow pointing back at it
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const b = btn.current?.getBoundingClientRect();
      if (!b) return;
      // start after the sidebar's right edge (fallback: the button's)
      const side = btn.current.closest(".sidebar, aside, nav")?.getBoundingClientRect();
      const right = side && side.right > b.right ? side.right : b.right;
      const h = pop.current?.offsetHeight || 380;
      const top = Math.max(8, Math.min(b.top - 8, window.innerHeight - h - 8));
      setPos({ top, left: right + 12, arrow: b.top + b.height / 2 - top });
    };
    place();
    const raf = requestAnimationFrame(place);   // again once the real height is known
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDraft({ from: from.slice(0, 7), to: to.slice(0, 7) });
    setCal(null);
    // the month panel is outside (portal), so clicks in it don't count as "outside"
    const onDown = (e) => {
      if (e.target.closest?.(".pp-cal")) return;
      const inPop = pop.current?.contains(e.target);
      if (!inPop && !wrap.current?.contains(e.target)) setOpen(false);
      else if (inPop && !e.target.closest?.(".pp-box")) setCal(null);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, from, to]);

  // keep To valid: if From goes past To, move To along (and the other way)
  const pickFrom = (v) => setDraft((d) => ({ from: v, to: d.to < v ? v : d.to }));
  const pickTo = (v) => setDraft((d) => ({ ...d, to: v < d.from ? d.from : v }));

  const save = (f, t) => {
    setPeriod({ from: `${f}-01`, to: monthRange(`${t}-01`).to });
    setOpen(false);
  };

  const quick = presets();
  const months = monthsBetween(draft.from, draft.to);
  const changed = draft.from !== from.slice(0, 7) || draft.to !== to.slice(0, 7);

  return (
    <div className="period" ref={wrap}>
      <button ref={btn} className="period-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Change period">
        <Icon name="calendar" size={15} />
        <span>{label(from)} to {label(to)}</span>
      </button>

      {open && createPortal(
        <div className="period-pop pp" ref={pop} role="dialog" aria-label="Choose period"
          style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, "--arrow": `${pos?.arrow ?? 20}px` }}>
          <div className="pp-title">Quick select</div>
          <div className="pp-quick">
            {quick.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`pp-chip${draft.from === p.from && draft.to === p.to ? " is-on" : ""}`}
                onClick={() => save(p.from, p.to)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="pp-title">Custom range</div>
          <div className="pp-range">
            <MonthField id="pf-from" labelText="From" value={draft.from} onChange={pickFrom} edge={pop}
              open={cal === "from"} onToggle={() => setCal(cal === "from" ? null : "from")} onClose={() => setCal(null)} />
            <MonthField id="pf-to" labelText="To" value={draft.to} min={draft.from} onChange={pickTo} edge={pop}
              open={cal === "to"} onToggle={() => setCal(cal === "to" ? null : "to")} onClose={() => setCal(null)} />
          </div>

          <div className="pp-foot">
            <span className="pp-count">{months} month{months > 1 ? "s" : ""}</span>
            <button type="button" className="pp-apply" onClick={() => save(draft.from, draft.to)} disabled={!changed}>Apply</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}