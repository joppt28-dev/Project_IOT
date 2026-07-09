import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Download, FileText, Printer, BarChart3, PieChart as PieIcon, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase, type DailyReportRow, type ParkingReportRow } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/format";
import { exportToExcel, exportToPdf } from "@/lib/export";
import { cn } from "@/lib/utils";
import { useTestDate, endOfTestDay } from "@/hooks/use-test-date";

export const Route = createFileRoute("/_app/reportes")({
  component: ReportsPage,
});

async function fetchDaily(): Promise<DailyReportRow[]> {
  const { data, error } = await supabase
    .from("daily_report_view")
    .select("*")
    .order("report_date", { ascending: false })
    .limit(90);
  if (error) throw error;
  return (data as DailyReportRow[]) ?? [];
}

async function fetchAllSessions(): Promise<ParkingReportRow[]> {
  const { data, error } = await supabase
    .from("parking_report_view")
    .select("*")
    .order("entry_time", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data as ParkingReportRow[]) ?? [];
}

function ReportsPage() {
  const { testDate, testDateISO, isOverridden } = useTestDate();
  const daily = useQuery({ queryKey: ["daily-report"], queryFn: fetchDaily });
  const all = useQuery({ queryKey: ["all-sessions"], queryFn: fetchAllSessions });
  const [rfidSearch, setRfidSearch] = useState("");

  // Filter daily and session data by test date
  const filteredDaily = useMemo(() => {
    return daily.data ?? [];
  }, [daily.data]);

  const filteredAll = useMemo(() => {
    const list = all.data ?? [];
    if (!isOverridden) return list;
    const endLimit = endOfTestDay(testDate).getTime();
    return list.filter((r) => new Date(r.entry_time).getTime() <= endLimit);
  }, [all.data, testDate, isOverridden]);

  const dailyAsc = useMemo(() => [...filteredDaily].reverse(), [filteredDaily]);

  // Monthly aggregation
  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; sessions: number }>();
    dailyAsc.forEach((d) => {
      const m = d.report_date.slice(0, 7);
      const cur = map.get(m) ?? { month: m, revenue: 0, sessions: 0 };
      cur.revenue += Number(d.total_revenue || 0);
      cur.sessions += Number(d.total_sessions || 0);
      map.set(m, cur);
    });
    return Array.from(map.values()).slice(-12);
  }, [dailyAsc]);

  // Status distribution
  const statusDist = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAll.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredAll]);

  // Peak hours
  const peakHours = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, "0")}:00`, entries: 0 }));
    filteredAll.forEach((r) => {
      const h = new Date(r.entry_time).getHours();
      buckets[h].entries += 1;
    });
    return buckets;
  }, [filteredAll]);

  // RFID search
  const rfidRows = useMemo(() => {
    if (!rfidSearch) return [];
    return filteredAll.filter((r) => r.rfid.toLowerCase().includes(rfidSearch.toLowerCase()));
  }, [filteredAll, rfidSearch]);

  const COLORS = [
    "var(--color-primary)",
    "var(--color-success)",
    "var(--color-warning)",
    "var(--color-info)",
    "var(--color-destructive)",
  ];

  return (
    <div className="space-y-6">
      <Tabs defaultValue="daily">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="daily">Diario</TabsTrigger>
          <TabsTrigger value="monthly">Mensual</TabsTrigger>
          <TabsTrigger value="rfid">Por RFID</TabsTrigger>
        </TabsList>

        {(daily.error || all.error) && (
          <div className="bg-red-100 text-red-600 p-4 rounded-md mt-4">
            <strong>Error de Base de Datos:</strong>
            <pre className="text-xs mt-2">{JSON.stringify(daily.error || all.error, null, 2)}</pre>
          </div>
        )}

        <TabsContent value="daily" className="space-y-6 mt-6">
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={() => exportToExcel(dailyAsc as unknown as Record<string, unknown>[], "reporte-diario")}>
              <Download className="w-4 h-4 mr-1.5" /> Excel
            </Button>
            <Button variant="outline" onClick={() => exportToPdf("Reporte Diario", dailyAsc as unknown as Record<string, unknown>[], "reporte-diario")}>
              <FileText className="w-4 h-4 mr-1.5" /> PDF
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" /> Imprimir
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />Ingresos diarios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyAsc}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="report_date" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                      formatter={(v: unknown) => formatMoney(Number(v))}
                    />
                    <Bar dataKey="total_revenue" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><PieIcon className="w-5 h-5 text-info" />Distribución de estados</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusDist} dataKey="value" nameKey="name" outerRadius={90} label>
                        {statusDist.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-success" />Horas pico</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={peakHours}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" interval={2} />
                      <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                      <Area type="monotone" dataKey="entries" stroke="var(--color-success)" fill="var(--color-success)" fillOpacity={0.25} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Resumen por día</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Completadas</TableHead>
                    <TableHead className="text-right">Pendientes</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Promedio (min)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDaily.map((r, i) => (
                    <TableRow key={r.report_date} className={cn(i % 2 === 1 && "bg-muted/30")}>
                      <TableCell>{r.report_date}</TableCell>
                      <TableCell className="text-right">{r.total_sessions}</TableCell>
                      <TableCell className="text-right">{r.completed_sessions}</TableCell>
                      <TableCell className="text-right">{r.pending_payment_sessions}</TableCell>
                      <TableCell className="text-right font-semibold">{formatMoney(r.total_revenue)}</TableCell>
                      <TableCell className="text-right">{Math.round(Number(r.avg_stay_minutes || 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly" className="space-y-6 mt-6">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => exportToExcel(monthly as unknown as Record<string, unknown>[], "reporte-mensual")}>
              <Download className="w-4 h-4 mr-1.5" /> Excel
            </Button>
            <Button variant="outline" onClick={() => exportToPdf("Reporte Mensual", monthly as unknown as Record<string, unknown>[], "reporte-mensual")}>
              <FileText className="w-4 h-4 mr-1.5" /> PDF
            </Button>
          </div>
          <Card>
            <CardHeader><CardTitle>Ingresos mensuales</CardTitle></CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip
                      contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                      formatter={(v: unknown) => formatMoney(Number(v))}
                    />
                    <Bar dataKey="revenue" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rfid" className="space-y-6 mt-6">
          <Card>
            <CardContent className="p-4 flex gap-3">
              <Input placeholder="Ingresa el código RFID..." value={rfidSearch} onChange={(e) => setRfidSearch(e.target.value)} />
              <Button variant="outline" disabled={rfidRows.length === 0} onClick={() => exportToPdf(`Historial RFID ${rfidSearch}`, rfidRows as unknown as Record<string, unknown>[], `rfid-${rfidSearch}`)}>
                <FileText className="w-4 h-4 mr-1.5" /> PDF
              </Button>
              <Button variant="outline" disabled={rfidRows.length === 0} onClick={() => exportToExcel(rfidRows as unknown as Record<string, unknown>[], `rfid-${rfidSearch}`)}>
                <Download className="w-4 h-4 mr-1.5" /> Excel
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Historial por RFID {rfidSearch && `(${rfidRows.length})`}</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RFID</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Salida</TableHead>
                    <TableHead className="text-right">Tiempo (min)</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rfidRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        {rfidSearch ? "Sin coincidencias." : "Escribe un RFID para consultar."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rfidRows.map((r, i) => (
                      <TableRow key={r.session_id} className={cn(i % 2 === 1 && "bg-muted/30")}>
                        <TableCell className="font-mono text-xs">{r.rfid}</TableCell>
                        <TableCell className="text-sm">{new Date(r.entry_time).toLocaleString("es-PE")}</TableCell>
                        <TableCell className="text-sm">{r.exit_time ? new Date(r.exit_time).toLocaleString("es-PE") : "—"}</TableCell>
                        <TableCell className="text-right">{r.stay_minutes}</TableCell>
                        <TableCell className="text-right font-semibold">{formatMoney(r.amount_paid)}</TableCell>
                        <TableCell>{r.status}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
