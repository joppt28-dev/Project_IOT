import { createClient } from "@supabase/supabase-js";

// Connects to the user's existing Supabase project.
// Anon (publishable) key is safe to ship in client code.
const SUPABASE_URL = "https://imatshddhwpjhxvcwyru.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltYXRzaGRkaHdwamh4dmN3eXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTExOTQsImV4cCI6MjA5OTEyNzE5NH0.fHiz5E2r0w4ZThG4tcGVpp0aJrDIiwGw8KQcvZLB3iA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

// ----- Domain types (derived from live schema introspection) -----

export type SessionStatus = "inside" | "pending_payment" | "paid" | "completed";

export interface RfidTag {
  id: string;
  rfid_code: string;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
}

export interface ParkingSession {
  id: string;
  rfid_id: string;
  entry_reader_code: string | null;
  exit_reader_code: string | null;
  entry_time: string;
  last_exit_attempt_at: string | null;
  exit_time: string | null;
  status: SessionStatus;
  hourly_rate: number;
  amount_due: number;
  amount_paid: number;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OccupancyRow {
  max_capacity: number;
  hourly_rate: number;
  currency: string;
  occupied_spaces: number;
  free_spaces: number;
  is_full: boolean;
}

export interface ActiveSessionRow {
  session_id: string;
  rfid: string;
  entry_time: string;
  last_exit_attempt_at: string | null;
  exit_time: string | null;
  paid_at: string | null;
  status: SessionStatus;
  hourly_rate: number;
  calculation_time: string;
  stay_time: string;
  stay_minutes: number;
  charged_hours: number;
  estimated_amount: number;
  amount_due: number;
  amount_paid: number;
  exit_attempt_count: number;
}

export interface ParkingReportRow extends ActiveSessionRow {
  entry_date: string;
  payment_date: string | null;
  exit_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyReportRow {
  report_date: string;
  total_sessions: number;
  completed_sessions: number;
  inside_sessions: number;
  pending_payment_sessions: number;
  paid_not_exited_sessions: number;
  total_revenue: number;
  pending_amount: number;
  avg_stay_minutes: number;
}

export interface ExitAttemptRow {
  attempt_id: string;
  session_id: string;
  rfid: string;
  reader_code: string;
  attempt_time: string;
  charged_hours: number;
  amount_due: number;
  result: string;
  message: string;
  created_at: string;
}

