import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

export type ExpenseRow = {
  date: Date;
  category: string;
  merchant: string | null;
  merchantCif: string | null;
  amount: number;
  currency: string;
  notes: string | null;
  imageUrl: string | null;
};

export type TripReportData = {
  company: { name: string; cif: string | null };
  user: { firstName: string | null; lastName: string | null; email: string };
  trip: {
    destination: string;
    purpose: string | null;
    startDate: Date;
    endDate: Date | null;
    kmStart: number | null;
    kmEnd: number | null;
    budget: number | null;
    status: string;
  };
  expenses: ExpenseRow[];
};

export type MonthlyReportData = {
  company: { name: string; cif: string | null };
  month: string;
  user: { firstName: string | null; lastName: string | null; email: string } | null;
  expenses: ExpenseRow[];
};

const CATEGORY_LABELS: Record<string, string> = {
  COMBUSTIBIL: 'Combustibil',
  MASA: 'Masă',
  CAZARE: 'Cazare',
  TRANSPORT: 'Transport',
  DIURNA: 'Diurnă',
  ALTELE: 'Altele',
};

function formatDate(d: Date) {
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatAmount(amount: number, currency: string) {
  return `${amount.toFixed(2)} ${currency}`;
}

function imageLocalPath(imageUrl: string | null, publicUrl: string): string | null {
  if (!imageUrl) return null;
  try {
    const base = publicUrl.replace(/\/$/, '');
    const relative = imageUrl.replace(base, '').replace(/^\/api\/uploads/, '');
    const p = path.join(process.cwd(), 'uploads', relative);
    return fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

function groupByCategory(expenses: ExpenseRow[]) {
  const groups: Record<string, ExpenseRow[]> = {};
  for (const e of expenses) {
    if (!groups[e.category]) groups[e.category] = [];
    groups[e.category].push(e);
  }
  return groups;
}

function drawHeader(doc: InstanceType<typeof PDFDocument>, title: string, subtitle: string) {
  doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fontSize(11).font('Helvetica').text(subtitle, { align: 'center' });
  doc.moveDown(1.5);
}

function drawInfoRow(doc: InstanceType<typeof PDFDocument>, label: string, value: string) {
  doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);
}

function drawExpenseTable(doc: InstanceType<typeof PDFDocument>, expenses: ExpenseRow[]) {
  const groups = groupByCategory(expenses);
  let grandTotal = 0;

  doc.fontSize(11).font('Helvetica-Bold').text('Cheltuieli pe categorii:');
  doc.moveDown(0.5);

  for (const [cat, rows] of Object.entries(groups)) {
    const catTotal = rows.reduce((s, e) => s + e.amount, 0);
    const currency = rows[0]?.currency ?? 'RON';
    grandTotal += catTotal;

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
      .text(`${CATEGORY_LABELS[cat] ?? cat}  —  subtotal: ${formatAmount(catTotal, currency)}`);

    for (const row of rows) {
      const merchant = row.merchant ? ` | ${row.merchant}` : '';
      const cif = row.merchantCif ? ` (CIF: ${row.merchantCif})` : '';
      doc.fontSize(9).font('Helvetica').fillColor('#555555')
        .text(`  ${formatDate(row.date)}${merchant}${cif}  →  ${formatAmount(row.amount, row.currency)}`);
    }
    doc.moveDown(0.3);
  }

  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
    .text(`TOTAL GENERAL: ${formatAmount(grandTotal, expenses[0]?.currency ?? 'RON')}`, { align: 'right' });

  return grandTotal;
}

export async function generateTripReport(data: TripReportData, outDir: string, publicUrl: string): Promise<string> {
  fs.mkdirSync(outDir, { recursive: true });
  const filename = `trip-${Date.now()}.pdf`;
  const outPath = path.join(outDir, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const userName = [data.user.firstName, data.user.lastName].filter(Boolean).join(' ') || data.user.email;
    const km = data.trip.kmStart != null && data.trip.kmEnd != null
      ? `${data.trip.kmEnd - data.trip.kmStart} km (${data.trip.kmStart} → ${data.trip.kmEnd})`
      : null;

    drawHeader(doc, `Decont delegație — ${data.trip.destination}`, data.company.name + (data.company.cif ? ` | CIF: ${data.company.cif}` : ''));

    drawInfoRow(doc, 'Angajat', userName);
    drawInfoRow(doc, 'Destinație', data.trip.destination);
    if (data.trip.purpose) drawInfoRow(doc, 'Scop', data.trip.purpose);
    drawInfoRow(doc, 'Perioadă', `${formatDate(data.trip.startDate)} — ${data.trip.endDate ? formatDate(data.trip.endDate) : 'în desfășurare'}`);
    if (km) drawInfoRow(doc, 'Km parcurși', km);
    if (data.trip.budget != null) drawInfoRow(doc, 'Buget aprobat', formatAmount(data.trip.budget, 'RON'));
    drawInfoRow(doc, 'Status', data.trip.status);
    doc.moveDown(1.5);

    const total = drawExpenseTable(doc, data.expenses);

    if (data.trip.budget != null) {
      const diff = data.trip.budget - total;
      doc.moveDown(0.5).fontSize(10).font('Helvetica').fillColor(diff >= 0 ? '#006600' : '#cc0000')
        .text(`${diff >= 0 ? 'Economie' : 'Depășire buget'}: ${formatAmount(Math.abs(diff), 'RON')}`, { align: 'right' });
    }

    // Receipt images — one per page
    const withImages = data.expenses.filter((e) => e.imageUrl);
    for (const expense of withImages) {
      const imgPath = imageLocalPath(expense.imageUrl, publicUrl);
      if (!imgPath) continue;
      doc.addPage();
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
        .text(`${CATEGORY_LABELS[expense.category] ?? expense.category} — ${formatDate(expense.date)}`);
      if (expense.merchant) doc.fontSize(10).font('Helvetica').text(expense.merchant);
      doc.fontSize(10).font('Helvetica-Bold').text(formatAmount(expense.amount, expense.currency));
      doc.moveDown(0.5);
      try {
        doc.image(imgPath, { fit: [480, 600], align: 'center' });
      } catch {
        doc.fontSize(9).fillColor('#999').text('[Imagine indisponibilă]');
      }
    }

    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

export async function generateMonthlyReport(data: MonthlyReportData, outDir: string, publicUrl: string): Promise<string> {
  fs.mkdirSync(outDir, { recursive: true });
  const filename = `monthly-${data.month}-${Date.now()}.pdf`;
  const outPath = path.join(outDir, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const userLabel = data.user
      ? ([data.user.firstName, data.user.lastName].filter(Boolean).join(' ') || data.user.email)
      : 'Toți angajații';

    drawHeader(doc, `Raport lunar — ${data.month}`, data.company.name + (data.company.cif ? ` | CIF: ${data.company.cif}` : ''));
    drawInfoRow(doc, 'Angajat', userLabel);
    drawInfoRow(doc, 'Perioadă', data.month);
    doc.moveDown(1.5);

    drawExpenseTable(doc, data.expenses);

    const withImages = data.expenses.filter((e) => e.imageUrl);
    for (const expense of withImages) {
      const imgPath = imageLocalPath(expense.imageUrl, publicUrl);
      if (!imgPath) continue;
      doc.addPage();
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
        .text(`${CATEGORY_LABELS[expense.category] ?? expense.category} — ${formatDate(expense.date)}`);
      if (expense.merchant) doc.fontSize(10).font('Helvetica').text(expense.merchant);
      doc.fontSize(10).font('Helvetica-Bold').text(formatAmount(expense.amount, expense.currency));
      doc.moveDown(0.5);
      try {
        doc.image(imgPath, { fit: [480, 600], align: 'center' });
      } catch {
        doc.fontSize(9).fillColor('#999').text('[Imagine indisponibilă]');
      }
    }

    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}
