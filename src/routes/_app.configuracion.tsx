import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Save, Radio, Database, Loader2, ExternalLink, AlertCircle, CalendarClock, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase, type OccupancyRow } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTestDate } from "@/hooks/use-test-date";

export const Route = createFileRoute("/_app/configuracion")({
  component: SettingsPage,
});

interface LocalSettings {
  hourly_rate: number;
  max_capacity: number;
  currency: "PEN" | "USD";
  readers: { entry: boolean; exit: boolean };
}

const DEFAULT: LocalSettings = {
  hourly_rate: 1,
  max_capacity: 10,
  currency: "PEN",
  readers: { entry: true, exit: true },
};

function loadLocal(): LocalSettings {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem("parkrfid:settings");
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* noop */
  }
  return DEFAULT;
}

async function fetchOcc(): Promise<OccupancyRow> {
  const { data, error } = await supabase.from("occupancy_view").select("*").single();
  if (error) throw error;
  return data as OccupancyRow;
}

function SettingsPage() {
  const occ = useQuery({ queryKey: ["occupancy"], queryFn: fetchOcc });
  const { testDate, testDateISO, isOverridden, setTestDate, reset } = useTestDate();
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const s = loadLocal();
    setSettings(s);
    setLogs([
      `[${new Date().toLocaleTimeString("es-PE")}] Configuración cargada desde almacenamiento local`,
    ]);
  }, []);

  useEffect(() => {
    if (occ.data) {
      setSettings((s) => ({
        ...s,
        hourly_rate: Number(occ.data.hourly_rate) || s.hourly_rate,
        max_capacity: Number(occ.data.max_capacity) || s.max_capacity,
        currency: (occ.data.currency as "PEN" | "USD") || s.currency,
      }));
    }
  }, [occ.data]);

  const save = () => {
    localStorage.setItem("parkrfid:settings", JSON.stringify(settings));
    setLogs((l) => [
      `[${new Date().toLocaleTimeString("es-PE")}] Configuración local guardada`,
      ...l,
    ]);
    toast.success("Configuración guardada localmente");
  };

  return (
    <div className="space-y-6">
      {/* ── Fecha del sistema ── */}
      <Card className={isOverridden ? "border-warning/50 shadow-warning/10 shadow-lg" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className={`w-5 h-5 ${isOverridden ? "text-warning" : "text-primary"}`} />
            Fecha del sistema
          </CardTitle>
          <CardDescription>
            Cambia la fecha que usa toda la aplicación como "hoy". Todos los registros de vehículos,
            reportes y estadísticas usarán esta fecha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOverridden && (
            <Alert className="border-warning/40 bg-warning/10 text-warning">
              <AlertCircle className="w-4 h-4" />
              <AlertTitle>Fecha modificada</AlertTitle>
              <AlertDescription>
                El sistema está usando <strong>{testDate.toLocaleDateString("es-PE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</strong> como fecha actual.
                Todos los registros y reportes se mostrarán y generarán con esta fecha.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            <div className="flex-1 w-full">
              <Label>Fecha actual del sistema</Label>
              <Input
                type="date"
                value={testDateISO}
                onChange={(e) => {
                  setTestDate(e.target.value);
                  toast.success(`Fecha cambiada a ${new Date(e.target.value + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}`);
                }}
                className={isOverridden ? "border-warning text-warning font-semibold" : ""}
              />
            </div>
            <Button
              variant={isOverridden ? "default" : "outline"}
              onClick={() => {
                reset();
                toast.success("Fecha restablecida a hoy");
              }}
              disabled={!isOverridden}
              className={isOverridden ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""}
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Restablecer a hoy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isOverridden
              ? `Fecha real: ${new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })} — Fecha del sistema: ${testDate.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}`
              : "La fecha del sistema coincide con la fecha real de hoy."}
          </p>
        </CardContent>
      </Card>

      <Alert>
        <AlertCircle className="w-4 h-4" />
        <AlertTitle>Configuración del sistema</AlertTitle>
        <AlertDescription>
          La tarifa, capacidad y moneda mostradas provienen de tu vista <code>occupancy_view</code>.
          Para modificarlas permanentemente, actualízalas en la base de datos
          (tabla de configuración o función SQL correspondiente). Aquí puedes guardar
          una copia local para esta sesión y configurar los lectores RFID.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5 text-primary" />Tarifa y capacidad</CardTitle>
            <CardDescription>Parámetros principales del estacionamiento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Tarifa por hora</Label>
              <Input
                type="number"
                step="0.10"
                value={settings.hourly_rate}
                onChange={(e) => setSettings({ ...settings, hourly_rate: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Capacidad máxima</Label>
              <Input
                type="number"
                value={settings.max_capacity}
                onChange={(e) => setSettings({ ...settings, max_capacity: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Moneda</Label>
              <Select value={settings.currency} onValueChange={(v: "PEN" | "USD") => setSettings({ ...settings, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PEN">PEN (S/)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={save} className="w-full">
              {occ.isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-1.5" /> Guardar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Radio className="w-5 h-5 text-info" />Lectores RFID</CardTitle>
            <CardDescription>Habilita o deshabilita los lectores físicos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <p className="font-medium">Lector de entrada</p>
                <p className="text-xs text-muted-foreground">Lee los RFID al ingresar</p>
              </div>
              <Switch
                checked={settings.readers.entry}
                onCheckedChange={(c) => setSettings({ ...settings, readers: { ...settings.readers, entry: c } })}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <p className="font-medium">Lector de salida</p>
                <p className="text-xs text-muted-foreground">Lee los RFID al salir</p>
              </div>
              <Switch
                checked={settings.readers.exit}
                onCheckedChange={(c) => setSettings({ ...settings, readers: { ...settings.readers, exit: c } })}
              />
            </div>
            <Button variant="outline" className="w-full" asChild>
              <a href="https://supabase.com/dashboard/project/sotlajbbvrndjoanozjr" target="_blank" rel="noreferrer">
                <ExternalLink className="w-4 h-4 mr-1.5" />
                Abrir panel de Supabase
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Logs del sistema</CardTitle>
          <CardDescription>Actividad reciente del panel.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="font-mono text-xs bg-muted/40 rounded-lg p-3 max-h-64 overflow-auto space-y-1">
            {logs.length === 0 ? (
              <p className="text-muted-foreground">Sin actividad.</p>
            ) : (
              logs.map((l, i) => <div key={i}>{l}</div>)
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
