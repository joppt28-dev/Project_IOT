import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, FileText, Search, RefreshCw, AlertOctagon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase, type ParkingReportRow, type SessionStatus, type ExitAttemptRow } from "@/integrations/supabase/client";
import { formatMoney, formatDateTime, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { exportToExcel, exportToPdf } from "@/lib/export";
import { useTestDate, endOfTestDay } from "@/hooks/use-test-date";

export const Route = createFileRoute("/_app/historial")({
  component: HistoryPage,
});

async function fetchHistory(): Promise<ParkingReportRow[]> {
  const { data, error } = await supabase
    .from("parking_report_view")
    .select("*")
    .order("entry_time", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data as ParkingReportRow[]) ?? [];
}

async function fetchExitAttempts(): Promise<ExitAttemptRow[]> {
  const { data, error } = await supabase
    .from("exit_attempts_view")
    .select("*")
    .order("attempt_time", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data as ExitAttemptRow[]) ?? [];
}

function statusBadge(s: SessionStatus) {
  const map: Record<string, string> = {
    inside: "bg-success/15 text-success border-success/30",
    pending_payment: "bg-warning/15 text-warning border-warning/30",
    paid: "bg-info/15 text-info border-info/30",
    completed: "bg-muted text-muted-foreground border-border",
  };
  return <Badge className={cn(map[s] ?? "")} variant="outline">{s}</Badge>;
}

const PAGE_SIZE = 20;

function HistoryPage() {
  const { testDate, isOverridden } = useTestDate();
  const q = useQuery({ queryKey: ["report-history"], queryFn: fetchHistory });
  const qAttempts = useQuery({ queryKey: ["exit-attempts-history"], queryFn: fetchExitAttempts });

  const [statusFilter, setStatusFilter] = useState<"all" | SessionStatus | "intentos_salida">("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const isViewingAttempts = statusFilter === "intentos_salida";

  const filteredSessions = useMemo(() => {
    let list = q.data ?? [];
    if (isOverridden) {
      const endLimit = endOfTestDay(testDate).getTime();
      list = list.filter((r) => new Date(r.entry_time).getTime() <= endLimit);
    }
    return list.filter((r) => {
      if (statusFilter !== "all" && statusFilter !== "intentos_salida" && r.status !== statusFilter) return false;
      if (search && !r.rfid.toLowerCase().includes(search.toLowerCase())) return false;
      if (from && new Date(r.entry_time) < new Date(from)) return false;
      if (to && new Date(r.entry_time) > new Date(to + "T23:59:59")) return false;
      return true;
    });
  }, [q.data, statusFilter, search, from, to, testDate, isOverridden]);

  const filteredAttempts = useMemo(() => {
    let list = qAttempts.data ?? [];
    if (isOverridden) {
      const endLimit = endOfTestDay(testDate).getTime();
      list = list.filter((r) => new Date(r.attempt_time).getTime() <= endLimit);
    }
    return list.filter((r) => {
      if (search && !r.rfid.toLowerCase().includes(search.toLowerCase())) return false;
      if (from && new Date(r.attempt_time) < new Date(from)) return false;
      if (to && new Date(r.attempt_time) > new Date(to + "T23:59:59")) return false;
      return true;
    });
  }, [qAttempts.data, search, from, to, testDate, isOverridden]);

  const currentList = isViewingAttempts ? filteredAttempts : filteredSessions;

  const totalRevenue = useMemo(() => {
    if (isViewingAttempts) return 0;
    return filteredSessions.reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  }, [isViewingAttempts, filteredSessions]);

  const totalPages = Math.max(1, Math.ceil(currentList.length / PAGE_SIZE));
  const pageRows = currentList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const rowsForExport = useMemo(() => {
    if (isViewingAttempts) {
      return (filteredAttempts as ExitAttemptRow[]).map((r) => ({
        RFID: r.rfid,
        "Hora Intento": formatDateTime(r.attempt_time),
        Lector: r.reader_code,
        "Horas cobradas": r.charged_hours,
        "Monto pendiente": Number(r.amount_due).toFixed(2),
        Resultado: r.result,
        Mensaje: r.message,
      }));
    }
    return (filteredSessions as ParkingReportRow[]).map((r) => ({
      RFID: r.rfid,
      Entrada: formatDateTime(r.entry_time),
      Salida: formatDateTime(r.exit_time),
      "Tiempo (min)": r.stay_minutes,
      "Monto pagado": Number(r.amount_paid).toFixed(2),
      Estado: r.status,
    }));
  }, [isViewingAttempts, filteredAttempts, filteredSessions]);

  const handleRefetch = () => {
    if (isViewingAttempts) {
      qAttempts.refetch();
    } else {
      q.refetch();
    }
  };

  const isQueryLoading = isViewingAttempts ? qAttempts.isLoading : q.isLoading;
  const isQueryFetching = isViewingAttempts ? qAttempts.isFetching : q.isFetching;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat title={isViewingAttempts ? "Intentos fallidos de salida" : "Total sesiones"} value={currentList.length} />
        <Stat title="Ingresos totales (Sesiones)" value={formatMoney(totalRevenue)} />
        <Stat
          title={isViewingAttempts ? "Monto total bloqueado" : "Pagadas"}
          value={
            isViewingAttempts
              ? formatMoney(filteredAttempts.reduce((s, r) => s + Number(r.amount_due || 0), 0))
              : filteredSessions.filter((r) => r.amount_paid > 0).length
          }
        />
      </div>

      <Card>

        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="text-xs text-muted-foreground mb-1.5 block">Buscar RFID</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground mb-1.5 block">Estado / Filtro</label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="inside">Inside</SelectItem>
                  <SelectItem value="pending_payment">Pendiente</SelectItem>
                  <SelectItem value="paid">Pagado</SelectItem>
                  <SelectItem value="completed">Completado</SelectItem>
                  <SelectItem value="intentos_salida">Intentos Salida (No Pagaron)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground mb-1.5 block">Desde</label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground mb-1.5 block">Hasta</label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => exportToExcel(rowsForExport, isViewingAttempts ? "intentos_salida" : "historial")}>
                <Download className="w-4 h-4 mr-1.5" /> Excel
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => exportToPdf(isViewingAttempts ? "Intentos fallidos de salida" : "Historial de sesiones", rowsForExport, isViewingAttempts ? "intentos_salida" : "historial")}>
                <FileText className="w-4 h-4 mr-1.5" /> PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{isViewingAttempts ? "Intentos de salida bloqueados" : "Sesiones históricas"}</CardTitle>
          <Button variant="ghost" size="icon" onClick={handleRefetch}>
            <RefreshCw className={cn("w-4 h-4", isQueryFetching && "animate-spin")} />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {isViewingAttempts ? (
                  <TableRow>
                    <TableHead>RFID</TableHead>
                    <TableHead>Hora Intento</TableHead>
                    <TableHead>Lector</TableHead>
                    <TableHead>Horas Cobradas</TableHead>
                    <TableHead className="text-right">Monto Estimado</TableHead>
                    <TableHead>Mensaje</TableHead>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableHead>RFID</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Salida</TableHead>
                    <TableHead>Tiempo</TableHead>
                    <TableHead className="text-right">Monto pagado</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {isQueryLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      Sin registros.
                    </TableCell>
                  </TableRow>
                ) : isViewingAttempts ? (
                  (pageRows as ExitAttemptRow[]).map((r, i) => (
                    <TableRow key={r.attempt_id} className={cn(i % 2 === 1 && "bg-muted/30")}>
                      <TableCell className="font-mono text-xs">{r.rfid}</TableCell>
                      <TableCell className="text-sm">{formatDateTime(r.attempt_time)}</TableCell>
                      <TableCell className="text-sm">{r.reader_code}</TableCell>
                      <TableCell className="text-sm">{r.charged_hours}h</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{formatMoney(r.amount_due)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground flex items-center gap-1.5 py-3">
                        <AlertOctagon className="w-3.5 h-3.5 text-destructive shrink-0" />
                        {r.message}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  (pageRows as ParkingReportRow[]).map((r, i) => (
                    <TableRow key={r.session_id} className={cn(i % 2 === 1 && "bg-muted/30")}>
                      <TableCell className="font-mono text-xs">{r.rfid}</TableCell>
                      <TableCell className="text-sm">{formatDateTime(r.entry_time)}</TableCell>
                      <TableCell className="text-sm">{formatDateTime(r.exit_time)}</TableCell>
                      <TableCell className="text-sm">{formatDuration(r.stay_minutes)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatMoney(r.amount_paid)}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
            <span className="text-muted-foreground">
              Página {page} de {totalPages} · {currentList.length} registros
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

