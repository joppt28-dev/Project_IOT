import { useState, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Car,
  History,
  BarChart3,
  Settings,
  LogOut,
  Moon,
  Sun,
  Menu,
  ParkingCircle,
  CalendarClock,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/components/theme-provider";
import { supabase } from "@/integrations/supabase/client";
import { useTestDate } from "@/hooks/use-test-date";
import { toast } from "sonner";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/vehiculos", label: "Vehículos", icon: Car },
  { to: "/historial", label: "Historial", icon: History },
  { to: "/reportes", label: "Reportes", icon: BarChart3 },
  { to: "/configuracion", label: "Configuración", icon: Settings },
] as const;

export function AppShell({ children, userEmail }: { children: ReactNode; userEmail?: string | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { testDateISO, isOverridden, setTestDate, reset } = useTestDate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Sidebar - desktop */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className={cn("flex items-center gap-2 px-4 h-16 border-b border-sidebar-border", collapsed && "justify-center px-2")}>
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center shrink-0">
            <ParkingCircle className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-semibold leading-tight">ParkRFID</span>
              <span className="text-xs text-muted-foreground leading-tight">Gestión</span>
            </div>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {nav.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-2",
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors",
              collapsed && "justify-center",
            )}
          >
            <Menu className="w-4 h-4" />
            {!collapsed && <span>Colapsar</span>}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar text-sidebar-foreground flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 h-16 border-b border-sidebar-border">
              <div className="w-9 h-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center">
                <ParkingCircle className="w-5 h-5" />
              </div>
              <span className="font-semibold">ParkRFID</span>
            </div>
            <nav className="flex-1 p-2 space-y-1">
              {nav.map((item) => {
                const active = pathname === item.to || pathname.startsWith(item.to + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                      active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent",
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold leading-tight">
                {nav.find((n) => pathname === n.to || pathname.startsWith(n.to + "/"))?.label ?? "ParkRFID"}
              </h1>
              <p className="text-xs text-muted-foreground">Sistema de estacionamiento</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1.5 pr-2 border-r border-border",
                isOverridden && "text-warning",
              )}
              title="Fecha de prueba: cambia el 'hoy' que ven el dashboard y los reportes"
            >
              <CalendarClock className="w-4 h-4" />
              <Input
                type="date"
                value={testDateISO}
                onChange={(e) => setTestDate(e.target.value)}
                className={cn(
                  "h-8 w-[150px] text-xs",
                  isOverridden && "border-warning text-warning",
                )}
              />
              {isOverridden && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    reset();
                    toast.success("Fecha restablecida a hoy");
                  }}
                  aria-label="Restablecer fecha"
                  title="Restablecer a hoy"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Cambiar tema">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            {userEmail && (
              <div className="hidden sm:flex items-center gap-2 text-sm pl-2 border-l border-border ml-1">
                <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                  {userEmail[0]?.toUpperCase()}
                </div>
                <span className="text-muted-foreground hidden md:inline">{userEmail}</span>
              </div>
            )}
            <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Cerrar sesión">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
