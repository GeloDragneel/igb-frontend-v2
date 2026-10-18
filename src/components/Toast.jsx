import { createContext, useCallback, useContext, useRef, useState } from "react";
import Icon from "./Icons";

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const id = useRef(0);

  const notify = useCallback((message, type = "success") => {
    const t = { id: ++id.current, message, type };
    setToasts((list) => [...list, t]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Icon name={t.type === "error" ? "alert" : "check"} size={16} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
