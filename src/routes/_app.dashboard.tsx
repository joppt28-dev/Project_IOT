import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Car,
  CircleDollarSign,
  Activity,
  ParkingSquare,
  TrendingUp,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase, type ActiveSessionRow, type OccupancyRow, type ParkingReportRow } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTestDate, endOfTestDay, startOfTestDay } from "@/hooks/use-test-date";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

async function fetchOccupancy(): Promise<OccupancyRow> {
  const { data, error } = await supabase.from("occupancy_view").select("*").single();
  if (error) throw error;
  return data as OccupancyRow;
}

async function fetchActiveSessions(): Promise<ActiveSessionRow[]> {
  const { data, error } = await supabase.from("active_sessions_view").select("*").order("entry_time", { ascending: false });
  if (error) throw error;
  return (data as ActiveSessionRow[]) ?? [];
}

async function fetchDayReport(dayISO: string): Promise<ParkingReportRow[]> {
  const [y, m, d] = dayISO.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
  const { data, error } = await supabase
    .from("parking_report_view")
    .select("*")
    .gte("entry_time", start.toISOString())
    .lte("entry_time", end.toISOString());
  if (error) throw error;
  return (data as ParkingReportRow[]) ?? [];
}

function DashboardPage() {
  const { testDate, testDateISO, isOverridden } = useTestDate();
  const occ = useQuery({ queryKey: ["occupancy"], queryFn: fetchOccupancy, refetchInterval: 15_000 });
  const active = useQuery({ queryKey: ["active-sessions"], queryFn: fetchActiveSessions, refetchInterval: 15_000 });
  const today = useQuery({
    queryKey: ["day-report", testDateISO],
    queryFn: () => fetchDayReport(testDateISO),
    refetchInterval: 30_000,
  });

  const occupancy = occ.data;
  const currency = occupancy?.currency ?? "PEN";
  const totalRevenue = (today.data ?? []).reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const occupancyPct =
    occupancy && occupancy.max_capacity > 0
      ? Math.round((occupancy.occupied_spaces / occupancy.max_capacity) * 100)
      : 0;

  // Hourly revenue across the selected day (24 hourly buckets)
  const dayStart = startOfTestDay(testDate);
  const hourlyRevenue = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(dayStart);
    d.setHours(i, 0, 0, 0);
    return { hour: `${String(i).padStart(2, "0")}:00`, ts: d.getTime(), revenue: 0 };
  });
  (today.data ?? []).forEach((r) => {
    if (!r.paid_at) return;
    const t = new Date(r.paid_at).getTime();
    const slot = hourlyRevenue.find((h) => t >= h.ts && t < h.ts + 3600_000);
    if (slot) slot.revenue += Number(r.amount_paid || 0);
  });

  // Occupancy timeline last 12h relative to test date "now"
  const refNow = endOfTestDay(testDate);
  const occupancyTimeline = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(refNow);
    d.setHours(refNow.getHours() - (11 - i), 0, 0, 0);
    const ts = d.getTime();
    const count = (active.data ?? []).filter((s) => new Date(s.entry_time).getTime() <= ts + 3600_000).length;
    return { hour: `${String(d.getHours()).padStart(2, "0")}:00`, count };
  });

  const status: "ok" | "warn" | "critical" = !occupancy
    ? "warn"
    : occupancy.is_full
    ? "critical"
    : occupancyPct > 80
    ? "warn"
    : "ok";

  const statusMeta = {
    ok: { label: "Sistema operativo", icon: CheckCircle2, class: "text-success bg-success/10 border-success/30" },
    warn: { label: "Capacidad alta", icon: AlertTriangle, class: "text-warning bg-warning/10 border-warning/30" },
    critical: { label: "Estacionamiento lleno", icon: XCircle, class: "text-destructive bg-destructive/10 border-destructive/30" },
  }[status];

  const StatusIcon = statusMeta.icon;

  return (
    <div className="space-y-6">
      {isOverridden && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 text-warning px-4 py-2.5 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>
            Mostrando datos del <strong>{testDate.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}</strong> (modo prueba).
          </span>
        </div>
      )}
      {/* Status banner */}
      <div className={cn("rounded-xl border px-4 py-3 flex items-center gap-3", statusMeta.class)}>
        <StatusIcon className="w-5 h-5" />
        <span className="font-medium">{statusMeta.label}</span>
        <span className="ml-auto text-xs opacity-80">
          Actualizado: {new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Ocupación actual"
          value={occupancy ? `${occupancy.occupied_spaces} / ${occupancy.max_capacity}` : "—"}
          subtitle={`${occupancy?.free_spaces ?? 0} libres`}
          icon={ParkingSquare}
          tone="primary"
          loading={occ.isLoading}
        />
        <StatCard
          title={isOverridden ? `Ingresos ${testDate.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" })}` : "Ingresos del día"}
          value={formatMoney(totalRevenue, currency)}
          subtitle={`${(today.data ?? []).filter((r) => r.paid_at).length} pagos`}
          icon={CircleDollarSign}
          tone="success"
          loading={today.isLoading}
        />
        <StatCard
          title="Sesiones activas"
          value={String((active.data ?? []).filter((s) => s.status !== "paid").length)}
          subtitle={`${(active.data ?? []).filter((s) => s.status === "pending_payment").length} pendientes`}
          icon={Activity}
          tone="info"
          loading={active.isLoading}
        />
        <OccupancyDonut percentage={occupancyPct} loading={occ.isLoading} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-primary" />
              Ingresos por hora (24h)
            </CardTitle>
            <span className="text-sm font-semibold">{formatMoney(totalRevenue, currency)}</span>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" interval={2} />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-popover-foreground)",
                    }}
                    formatter={(v: unknown) => formatMoney(Number(v), currency)}
                  />
                  <Bar dataKey="revenue" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="w-4 h-4 text-info" />
              Ocupación últimas 12 horas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={occupancyTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-popover-foreground)",
                    }}
                  />
                  <Line type="monotone" dataKey="count" stroke="var(--color-info)" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone,
  loading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "success" | "info" | "warning";
  loading?: boolean;
}) {
  const tones = {
    primary: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
    info: "bg-info/15 text-info",
    warning: "bg-warning/15 text-warning",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            {loading ? (
              <Loader2 className="w-5 h-5 mt-2 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-2xl font-bold mt-1 truncate">{value}</p>
            )}
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", tones[tone])}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OccupancyDonut({ percentage, loading }: { percentage: number; loading?: boolean }) {
  const data = [
    { name: "Ocupado", value: percentage },
    { name: "Libre", value: Math.max(0, 100 - percentage) },
  ];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className="relative w-24 h-24 shrink-0">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data} dataKey="value" innerRadius={32} outerRadius={44} startAngle={90} endAngle={-270} stroke="none">
                      <Cell fill="var(--color-primary)" />
                      <Cell fill="var(--color-muted)" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">{percentage}%</div>
              </>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Ocupación</p>
            <p className="text-2xl font-bold">{percentage}%</p>
            <p className="text-xs text-muted-foreground">de la capacidad total</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
