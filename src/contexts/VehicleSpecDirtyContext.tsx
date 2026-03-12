import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';

const MSG =
  'יש שינויים שלא נשמרו. הנתונים לא יתעדכנו בלי ללחוץ "אישור שינויים". לצאת בכל זאת?';

export const DIRTY_SOURCE_SPEC = 'spec';
export const DIRTY_SOURCE_MAINTENANCE = 'maintenance';

type VehicleSpecDirtyContextValue = {
  isDirty: boolean;
  setDirty: (sourceId: string, dirty: boolean) => void;
  tryNavigate: (to: string) => void;
  /** סינכרוני — לשימוש ב-onClick לפני ש-state הספיק להתעדכן */
  getIsDirty: () => boolean;
  /** רק מקור מסוים (למשל maintenance) — לפני מעבר לשונית */
  getSourceDirty: (sourceId: string) => boolean;
};

const defaultValue: VehicleSpecDirtyContextValue = {
  isDirty: false,
  setDirty: () => {},
  tryNavigate: () => {},
  getIsDirty: () => false,
  getSourceDirty: () => false,
};

const VehicleSpecDirtyContext = createContext<VehicleSpecDirtyContextValue>(defaultValue);

export function VehicleSpecDirtyProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  /** מקור אמת סינכרוני — מתעדכן מיד ב-setDirty */
  const sourcesRef = useRef<Record<string, true>>({});

  const setDirty = useCallback((sourceId: string, dirty: boolean) => {
    if (dirty) sourcesRef.current[sourceId] = true;
    else delete sourcesRef.current[sourceId];
    setVersion((v) => v + 1);
  }, []);

  const isDirty = Object.keys(sourcesRef.current).length > 0;

  const tryNavigate = useCallback((to: string) => {
    if (Object.keys(sourcesRef.current).length === 0) {
      navigate(to);
      return;
    }
    if (window.confirm(MSG)) {
      sourcesRef.current = {};
      setVersion((v) => v + 1);
      navigate(to);
    }
  }, [navigate]);

  const getIsDirty = useCallback(() => Object.keys(sourcesRef.current).length > 0, []);

  const getSourceDirty = useCallback((sourceId: string) => !!sourcesRef.current[sourceId], []);

  const value = useMemo(
    () => ({ isDirty, setDirty, tryNavigate, getIsDirty, getSourceDirty }),
    [isDirty, setDirty, tryNavigate, getIsDirty, getSourceDirty, version]
  );

  return (
    <VehicleSpecDirtyContext.Provider value={value}>
      {children}
    </VehicleSpecDirtyContext.Provider>
  );
}

export function useVehicleSpecDirty() {
  return useContext(VehicleSpecDirtyContext);
}

export { MSG as VEHICLE_SPEC_UNSAVED_MSG };
