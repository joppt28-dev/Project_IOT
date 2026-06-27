export function formatMoney(amount: number | null | undefined, currency = "PEN") {
  const n = Number(amount ?? 0);
  const symbol = currency === "USD" ? "$" : "S/";
  return `${symbol} ${n.toFixed(2)}`;
}

export function formatDuration(minutes: number | null | undefined) {
  const m = Math.max(0, Math.floor(Number(minutes ?? 0)));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return `${h}h ${r}m`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}
