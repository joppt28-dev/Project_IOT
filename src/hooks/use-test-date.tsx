import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = {
  /** The date being used as "today" throughout the app (start-of-day in local time). */
  testDate: Date;
  /** ISO yyyy-mm-dd string for inputs. */
  testDateISO: string;
  /** Whether the user has overridden the real today. */
  isOverridden: boolean;
  setTestDate: (iso: string) => void;
  reset: () => void;
};

const TestDateContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "parkrfid:test-date";

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function realTodayISO() {
  return toISO(new Date());
}

export function TestDateProvider({ children }: { children: ReactNode }) {
  const [iso, setIso] = useState<string>(() => {
    if (typeof window === "undefined") return realTodayISO();
    return window.localStorage.getItem(STORAGE_KEY) ?? realTodayISO();
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (iso === realTodayISO()) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, iso);
  }, [iso]);

  const [y, m, d] = iso.split("-").map(Number);
  const testDate = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);

  const value: Ctx = {
    testDate,
    testDateISO: iso,
    isOverridden: iso !== realTodayISO(),
    setTestDate: setIso,
    reset: () => setIso(realTodayISO()),
  };
  return <TestDateContext.Provider value={value}>{children}</TestDateContext.Provider>;
}

export function useTestDate() {
  const ctx = useContext(TestDateContext);
  if (!ctx) throw new Error("useTestDate must be used within TestDateProvider");
  return ctx;
}

/** Returns a Date set to "now" if the test date is today, otherwise 23:59:59 of the test date. */
export function endOfTestDay(testDate: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (testDate.getTime() === today.getTime()) return new Date();
  const e = new Date(testDate);
  e.setHours(23, 59, 59, 999);
  return e;
}

/** Start of the test day. */
export function startOfTestDay(testDate: Date) {
  const s = new Date(testDate);
  s.setHours(0, 0, 0, 0);
  return s;
}
