import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Loader2, RefreshCw, Clock, Car, CreditCard } from "lucide-react";
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
import { supabase, type ActiveSessionRow, type OccupancyRow, type SessionStatus } from "@/integrations/supabase/client";
import { formatMoney, formatDateTime, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/vehiculos")({
  component: VehiclesPage,
});

async function fetchActive(): Promise<ActiveSessionRow[]> {
  const { data, error } = await supabase
    .from("active_sessions_view")
    .select("*")
    .order("entry_time", { ascending: false });
  if (error) throw error;
  return (data as ActiveSessionRow[]) ?? [];
}

async function fetchOccupancy(): Promise<OccupancyRow> {
  const { data, error } = await supabase.from("occupancy_view").select("*").single();
  if (error) throw error;
  return data as OccupancyRow;
}

function statusBadge(s: SessionStatus) {
  switch (s) {
    case "inside":
      return <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/20">🟢 Adentro</Badge>;
    case "pending_payment":
      return <Badge className="bg-warning/15 text-warning border-warning/30 hover:bg-warning/20">🟡 Pendiente pago</Badge>;
    case "paid":
      return <Badge className="bg-info/15 text-info border-info/30 hover:bg-info/20">🔵 Pagado</Badge>;
    default:
      return <Badge variant="outline">{s}</Badge>;
  }
}

function VehiclesPage() {
  const active = useQuery({ queryKey: ["active-sessions"], queryFn: fetchActive, refetchInterval: 15_000 });
  const occ = useQuery({ queryKey: ["occupancy"], queryFn: fetchOccupancy, refetchInterval: 30_000 });
  const currency = occ.data?.currency ?? "PEN";

  const [statusFilter, setStatusFilter] = useState<"all" | SessionStatus>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(() => {
    const list = active.data ?? [];
    return list.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search && !r.rfid.toLowerCase().includes(search.toLowerCase())) return false;
      if (from && new Date(r.entry_time) < new Date(from)) return false;
      if (to && new Date(r.entry_time) > new Date(to + "T23:59:59")) return false;
      return true;
    });
  }, [active.data, statusFilter, search, from, to]);

  return (
    <div className="space-y-6">
      {/* Informational banner: payments are automatic */}
      <div className="rounded-xl border border-info/40 bg-info/10 text-info px-4 py-2.5 text-sm flex items-center gap-2">
        <CreditCard className="w-4 h-4 shrink-0" />
        <span>
          Los pagos se realizan <strong>automáticamente</strong> cuando el vehículo escanea su tarjeta en el <strong>tótem de pago RFID</strong>. No se requiere intervención manual.
        </span>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="text-xs text-muted-foreground mb-1.5 block">Buscar por RFID</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Código RFID..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="md:col-span-3">
              <label className="text-xs text-muted-foreground mb-1.5 block">Estado</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="inside">Adentro</SelectItem>
                  <SelectItem value="pending_payment">Pendiente pago</SelectItem>
                  <SelectItem value="paid">Pagado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground mb-1.5 block">Desde</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground mb-1.5 block">Hasta</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="md:col-span-1">
              <Button variant="outline" size="icon" className="w-full md:w-auto" onClick={() => active.refetch()} title="Recargar">
                <RefreshCw className={cn("w-4 h-4", active.isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-primary" />
            Vehículos activos
            <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RFID</TableHead>
                  <TableHead>Hora entrada</TableHead>
                  <TableHead>Tiempo estacionado</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Monto estimado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      No hay sesiones que coincidan con los filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r, i) => (
                    <TableRow key={r.session_id} className={cn("transition-colors", i % 2 === 1 && "bg-muted/30")}>
                      <TableCell className="font-mono text-xs">{r.rfid}</TableCell>
                      <TableCell className="text-sm">{formatDateTime(r.entry_time)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          {formatDuration(r.stay_minutes)}
                        </span>
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(r.status === "paid" ? r.amount_paid : r.estimated_amount, currency)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
