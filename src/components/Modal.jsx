import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icons";

const ANIM_MS = 250; // same feel as Bootstrap's .fade (0.15s backdrop, 0.3s dialog)

/* Close with animation: play the "leave" animation, then call onClose */
function useAnimatedClose(onClose) {
  const [closing, setClosing] = useState(false);
  const timer = useRef(null);

  const close = useCallback(() => {
    if (closing) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return onClose();
    setClosing(true);
    timer.current = setTimeout(onClose, ANIM_MS);
  }, [closing, onClose]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return [closing, close];
}

/* Esc closes only the top-most dialog; page scroll locked while open; focus restored after */
function useDialogBehaviour(boxRef, close) {
  useEffect(() => {
    const prev = document.activeElement;
    const box = boxRef.current;

    // focus the first field (or the dialog itself)
    const first = box?.querySelector("input:not([type=hidden]), select, textarea, button:not(.icon-btn)");
    (first || box)?.focus();

    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const all = document.querySelectorAll(".modal, .drawer");
      if (all[all.length - 1] === box) close();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      if (document.querySelectorAll(".modal, .drawer").length <= 1) document.body.style.overflow = "";
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/* =========================================================
   Modal (centered popup)
   ========================================================= */
export default function Modal({ title, onClose, footer, size = "md", children }) {
  const box = useRef(null);
  const [closing, close] = useAnimatedClose(onClose);
  useDialogBehaviour(box, close);

  return createPortal(
    <div className={`backdrop ${closing ? "is-leaving" : ""}`} onMouseDown={close}>
      <div
        ref={box}
        className={`modal modal-${size} ${closing ? "is-leaving" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn ghost" onClick={close} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

/* =========================================================
   Drawer (slides in from the right)
   ========================================================= */
export function Drawer({ title, onClose, footer, children }) {
  const box = useRef(null);
  const [closing, close] = useAnimatedClose(onClose);
  useDialogBehaviour(box, close);

  return createPortal(
    <div className={`backdrop backdrop-drawer ${closing ? "is-leaving" : ""}`} onMouseDown={close}>
      <aside
        ref={box}
        className={`drawer ${closing ? "is-leaving" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn ghost" onClick={close} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body
  );
}

/* =========================================================
   Field (label + input + error / hint)
   ========================================================= */
export function Field({ label, error, hint, full, children }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}