import { createContext, useContext, useState, ReactNode } from 'react';

interface ViewAsContextValue {
  viewAsEmail: string | null;
  setViewAsEmail: (email: string | null) => void;
}

const ViewAsContext = createContext<ViewAsContextValue | undefined>(undefined);

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [viewAsEmail, setViewAsEmail] = useState<string | null>(null);

  return (
    <ViewAsContext.Provider value={{ viewAsEmail, setViewAsEmail }}>
      {children}
    </ViewAsContext.Provider>
  );
}

export function useViewAs() {
  const ctx = useContext(ViewAsContext);
  if (!ctx) {
    throw new Error('useViewAs must be used within a ViewAsProvider');
  }
  return ctx;
}

