// Export utilities (client-only)
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function exportToExcel(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToPdf(title: string, rows: Record<string, unknown>[], filename: string) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generado: ${new Date().toLocaleString("es-PE")}`, 14, 22);

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    const body = rows.map((r) => headers.map((h) => String(r[h] ?? "")));
    autoTable(doc, {
      head: [headers],
      body,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [22, 119, 138], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
  } else {
    doc.setTextColor(0);
    doc.text("Sin datos.", 14, 30);
  }
  doc.save(`${filename}.pdf`);
}
