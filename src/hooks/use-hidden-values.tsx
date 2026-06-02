import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

const STORAGE_KEY = "hide-values:v1";

type Ctx = { hidden: boolean; toggle: () => void; setHidden: (v: boolean) => void };

const HiddenValuesContext = createContext<Ctx | null>(null);

export function HiddenValuesProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
  }, [hidden]);

  const toggle = useCallback(() => setHidden((v) => !v), []);

  return (
    <HiddenValuesContext.Provider value={{ hidden, toggle, setHidden }}>
      {children}
    </HiddenValuesContext.Provider>
  );
}

export function useHiddenValues(): Ctx {
  const ctx = useContext(HiddenValuesContext);
  if (!ctx) return { hidden: false, toggle: () => {}, setHidden: () => {} };
  return ctx;
}

/** Botão de alternância pronto para uso em headers de página. */
export function HideValuesToggle({ className }: { className?: string }) {
  const { hidden, toggle } = useHiddenValues();
  return (
    <button
      type="button"
      onClick={toggle}
      title={hidden ? "Mostrar valores" : "Esconder valores"}
      className={className ?? "btn-secondary"}
    >
      {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      <span className="hidden sm:inline">{hidden ? "Mostrar" : "Esconder"}</span>
    </button>
  );
}
