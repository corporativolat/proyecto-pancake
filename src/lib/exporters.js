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

// Dibuja en el `doc` (jsPDF) el Gantt vectorial de un proyecto a partir de
// la coordenada Y dada. Devuelve la nueva Y para encadenar dibujos.
// Se usa tanto en `downloadCronograma` como en el reporte general con Gantt.
function drawProjectGantt(doc, project, profMap, startY = 100) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 40;
  const right = pageW - 40;
  const totalW = right - left;
  const weekW = totalW / 8;
  const dayW = weekW / 7;
  let y = startY;

  doc.setFillColor(24, 24, 27);
  doc.rect(left, y, totalW, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  for (let s = 0; s < 8; s++) {
    if (s > 0) {
      doc.setDrawColor(80, 80, 90);
      doc.line(left + s * weekW, y, left + s * weekW, y + 18);
    }
    doc.text(`Semana ${s + 1}`, left + s * weekW + weekW / 2, y + 12, { align: 'center' });
  }
  y += 18;

  const rowH = 20;
  for (const ph of (project.phases || [])) {
    if (y > pageH - 80) { doc.addPage(); y = 60; }
    const phLeft = left + ((ph.start_week - 1) * 7 + ((ph.start_day || 1) - 1)) * dayW;
    const phWidth = ((ph.duration_days != null ? ph.duration_days : ph.duration_weeks * 7)) * dayW;
    doc.setFillColor(245, 243, 255);
    doc.rect(left, y, totalW, rowH, 'F');
    doc.setFillColor(221, 214, 254);
    doc.rect(phLeft, y + 3, phWidth, rowH - 6, 'F');
    doc.setDrawColor(124, 58, 237);
    doc.setLineWidth(0.6);
    doc.rect(phLeft, y + 3, phWidth, rowH - 6, 'D');
    doc.setTextColor(76, 29, 149);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(ph.name || '—', left + 6, y + 13);
    y += rowH;

    for (const tk of (ph.tasks || [])) {
      if (y > pageH - 60) { doc.addPage(); y = 60; }
      doc.setDrawColor(228, 228, 231);
      doc.setLineWidth(0.3);
      for (let s = 1; s < 8; s++) doc.line(left + s * weekW, y, left + s * weekW, y + rowH);
      doc.line(left, y + rowH, right, y + rowH);

      const tkLeft = left + (((tk.start_week - 1) * 7) + (tk.start_day - 1)) * dayW;
      const tkW = (tk.duration || 1) * dayW;
      if (tk.completed) doc.setFillColor(16, 185, 129); else doc.setFillColor(124, 58, 237);
      doc.roundedRect(tkLeft, y + 4, Math.max(tkW, 4), rowH - 8, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      const tkName = String(tk.name || '').slice(0, 36);
      if (tkW > 40) doc.text(tkName, tkLeft + 4, y + 14);
      else {
        doc.setTextColor(63, 63, 70);
        doc.text(tkName, tkLeft + tkW + 4, y + 14);
      }
      y += rowH;
    }
  }
  return y;
}

// Cronograma de un proyecto en PDF (vista cliente). Header + Gantt vectorial +
// tabla de actividades. No depende de html2canvas.
export function downloadCronograma(project, profiles = []) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const profMap = new Map((profiles || []).map(p => [p.id, p.name]));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(24, 24, 27);
  doc.text(`Cronograma · ${project.title || ''}`, 40, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(113, 113, 122);
  const meta = [];
  if (project.company) meta.push(`Cliente: ${project.company}`);
  if (project.status) meta.push(`Estado: ${project.status}`);
  const owner = profMap.get(project.owner_id) || project.owner_label;
  if (owner) meta.push(`Líder: ${owner}`);
  if (project.start_date) meta.push(`Inicio: ${project.start_date}`);
  if (project.projected_end_date) meta.push(`Fin proyectado: ${project.projected_end_date}`);
  doc.text(meta.join('   ·   '), 40, 66);

  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170);
  doc.text(`Generado: ${new Date().toLocaleString()}`, 40, 82);

  drawProjectGantt(doc, project, profMap, 100);

  const tableRows = [];
  for (const ph of (project.phases || [])) {
    for (const tk of (ph.tasks || [])) {
      tableRows.push([
        ph.name || '',
        tk.name || '',
        profMap.get(tk.assignee_id) || '—',
        `S${tk.start_week} D${tk.start_day}`,
        `${tk.duration || 1}d`,
        tk.completed ? 'Sí' : 'No',
      ]);
    }
  }
  if (tableRows.length) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(24, 24, 27);
    doc.text('Detalle de Actividades', 40, 50);
    autoTable(doc, {
      startY: 65,
      head: [['Fase', 'Actividad', 'Responsable', 'Inicio', 'Duración', 'Hecho']],
      body: tableRows,
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, lineColor: [228, 228, 231] },
      headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: 40, right: 40 },
    });
  }

  doc.save(`cronograma-${sanitizeFilename(project.title)}.pdf`);
}

// Reporte PDF: tabla resumen + (opcional) páginas de Gantt por proyecto.
// Si se pasa `projects` (array con phases/tasks), después de la tabla se
// añade una página por proyecto con su Gantt vectorial. `profiles` se usa
// para resolver nombres de responsable en el header de cada Gantt.
export function downloadPDF({ filename, title, subtitle, columns, rows, projects, profiles }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(24, 24, 27);
  doc.text(title || 'Reporte', 40, 50);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(113, 113, 122);
    doc.text(subtitle, 40, 70);
  }

  doc.setFontSize(8);
  doc.setTextColor(161, 161, 170);
  doc.text(`Generado: ${new Date().toLocaleString()}`, 40, subtitle ? 85 : 70);

  autoTable(doc, {
    startY: subtitle ? 100 : 85,
    head: [columns.map(c => c.header)],
    body: rows.map(row => columns.map(c => c.accessor(row))),
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, lineColor: [228, 228, 231] },
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: 40, right: 40 },
  });

  if (Array.isArray(projects) && projects.length) {
    const profMap = new Map((profiles || []).map(p => [p.id, p.name]));
    for (const project of projects) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(24, 24, 27);
      doc.text(`Gantt · ${project.title || ''}`, 40, 48);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(113, 113, 122);
      const meta = [];
      if (project.status) meta.push(`Estado: ${project.status}`);
      const owner = profMap.get(project.owner_id) || project.owner_label;
      if (owner) meta.push(`Líder: ${owner}`);
      if (project.start_date) meta.push(`Inicio: ${project.start_date}`);
      if (project.projected_end_date) meta.push(`Fin: ${project.projected_end_date}`);
      doc.text(meta.join('   ·   '), 40, 64);

      const hasPhases = Array.isArray(project.phases) && project.phases.length > 0;
      if (!hasPhases) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        doc.setTextColor(161, 161, 170);
        doc.text('Sin fases registradas para este proyecto.', 40, 100);
        continue;
      }
      drawProjectGantt(doc, project, profMap, 80);
    }
  }

  doc.save(`${sanitizeFilename(filename)}.pdf`);
}
