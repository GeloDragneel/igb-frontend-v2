import { useEffect, useRef, useState } from "react";
import Icon from "./Icons";

// "⋮" menu. Uses position: fixed so the table's overflow never clips it.
export default function RowMenu({ onView, onEdit, onDelete, extra = [] }) {
  // extra: [{ label, onClick }]
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const menu = useRef(null);

  const place = () => {
    const r = btn.current.getBoundingClientRect();
    const h = 16 + 38 * (extra.length + [onView, onEdit, onDelete].filter(Boolean).length);
    const up = window.innerHeight - r.bottom < h + 10;
    return { top: up ? r.top - h - 4 : r.bottom + 4, left: Math.max(8, r.right - 180) };
  };

  const isOpen = !!pos;

  useEffect(() => {
    if (!isOpen) return;
    const close = () => setPos(null);
    const onDown = (e) => {
      if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) close();
    };
    const onKey = (e) => e.key === "Escape" && (close(), btn.current?.focus());
    const follow = () => btn.current && setPos(place()); // keep the menu attached to its button
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", close);
    menu.current?.querySelector("button")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", close);
    };
  }, [isOpen]);

  const toggle = () => setPos(pos ? null : place());

  const run = (fn) => () => { setPos(null); fn(); };

  return (
    <>
      <button ref={btn} className="kebab" onClick={toggle} aria-label="Actions" aria-haspopup="menu" aria-expanded={!!pos}>
        <Icon name="dots" size={18} strokeWidth={3} />
      </button>
      {pos && (
        <div ref={menu} className="row-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
          {extra.map((a) => (
            <button key={a.label} role="menuitem" onClick={run(a.onClick)}>{a.label}</button>
          ))}
          {onView && <button role="menuitem" onClick={run(onView)}>View</button>}
          {onEdit && <button role="menuitem" onClick={run(onEdit)}>Edit</button>}
          {onDelete && <button role="menuitem" className="danger" onClick={run(onDelete)}>Delete</button>}
        </div>
      )}
    </>
  );
}