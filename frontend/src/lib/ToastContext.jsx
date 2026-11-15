import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (type, title, message) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((list) => [...list.slice(-3), { id, type, title, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 5200)
      );
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      push,
      success: (title, message) => push('success', title, message),
      error: (title, message) => push('error', title, message),
      info: (title, message) => push('info', title, message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type] || Info;
          return (
            <div key={toast.id} className={`toast toast--${toast.type}`}>
              <span className="toast__icon">
                <Icon size={18} />
              </span>
              <div className="toast__body">
                <strong>{toast.title}</strong>
                {toast.message ? <p>{toast.message}</p> : null}
              </div>
              <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Fermer">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
