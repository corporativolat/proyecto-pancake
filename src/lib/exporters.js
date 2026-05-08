// Exportadores de informes: PDF (jsPDF + autotable) y CSV (UTF-8 BOM).
//
// CSV se descarga con BOM U+FEFF para que Excel reconozca tildes y eñes.
// Excel abre archivos .csv directamente sin necesidad de .xlsx.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const BOM = String.fromCharCode(0xFEFF);

const sanitizeFilename = (name) =>
  String(name || 'reporte')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'reporte';

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export function downloadCSV({ filename, columns, rows }) {
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    // Si contiene coma, comilla o salto, envolver en comillas y duplicar comillas internas.
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const header = columns.map(c => escape(c.header)).join(',');
  const lines = rows.map(row => columns.map(c => escape(c.accessor(row))).join(','));
  const csv = BOM + [header, ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${sanitizeFilename(filename)}.csv`);
}

export function downloadPDF({ filename, title, subtitle, columns, rows }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  // Cabecera
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(24, 24, 27); // ink-900
  doc.text(title || 'Reporte', 40, 50);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(113, 113, 122); // ink-500
    doc.text(subtitle, 40, 70);
  }

  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170);
  doc.text(`Generado: ${new Date().toLocaleString()}`, 40, subtitle ? 85 : 70);

  // Tabla
  autoTable(doc, {
    startY: subtitle ? 100 : 85,
    head: [columns.map(c => c.header)],
    body: rows.map(row => columns.map(c => c.accessor(row))),
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, lineColor: [228, 228, 231] },
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`${sanitizeFilename(filename)}.pdf`);
}
