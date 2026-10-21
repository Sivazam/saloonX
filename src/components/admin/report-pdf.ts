'use client'

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate, formatDateTime, formatTime } from '@/lib/format'
import { INR, PDFFont, registerPdfFonts } from '@/lib/pdf/pdf-font'
import type { BranchProfileDTO, MethodSummary, ShiftReportResponse, StatsResponse, TransactionDTO, TransactionsResponse } from '@/lib/types'

/** Money strings for PDFs — the embedded Noto Sans subset renders the ₹ glyph
 *  (jsPDF's built-in helvetica is WinAnsi-only and has no U+20B9). */
function rs(n: number): string {
  const isInteger = Math.abs(n - Math.round(n)) < 0.005
  return `${INR}${n.toLocaleString('en-IN', isInteger ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Filename-safe slug: "Glow & Go — Koramangala" → "glow-go-koramangala". */
function slugify(s: string): string {
  return (
    s
      .trim()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'report'
  )
}

/** Filename context — scope + dates, mirroring how the shift/transactions
 *  PDFs name files (e.g. SaloonX-Summary-all-branches-2026-10-01-to-2026-10-07.pdf). */
export interface ReportFileScope {
  /** Scope slug — branch name (scoped) or 'All-Branches' (franchise-wide). */
  scope: string
  /** Range start (YYYY-MM-DD). */
  from: string
  /** Range end (YYYY-MM-DD). */
  to: string
}

/** Brand colour — deep rosewood, matches the SaloonX identity. */
const BRAND: [number, number, number] = [94, 26, 44]

/** Draw the branch/franchise logo (PNG data URL) at the top-left. Never throws. */
function drawLogo(doc: jsPDF, dataUrl: string | null, x: number, y: number, size = 14): number {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return y
  try {
    doc.addImage(dataUrl, 'PNG', x, y, size, size)
    return y + size + 2
  } catch {
    return y
  }
}

/* ── 1. Transactions ledger report (A4, summary + full table) ─────────────── */

/**
 * Client-side A4 transactions report (summary + full table + totals footer).
 * `summary` covers the whole filter; when fewer rows are loaded than the
 * filter total, a note is appended so the report stays honest.
 */
export function downloadReportPdf(
  rows: TransactionDTO[],
  summary: TransactionsResponse['summary'],
  branch: BranchProfileDTO,
  from: string,
  to: string,
): void {
  if (rows.length === 0) return

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  registerPdfFonts(doc)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const M = 14

  /* Header */
  const logo = branch.logo ?? branch.tenantLogo ?? null
  let headerY = 16
  if (logo) headerY = drawLogo(doc, logo, M, headerY - 2) + 2

  doc.setFont(PDFFont.Bold)
  doc.setFontSize(15)
  doc.setTextColor(35, 20, 24)
  doc.text(branch.name, M, headerY)

  doc.setFont(PDFFont.Regular)
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text(branch.tenantName && branch.tenantName !== branch.name ? `${branch.tenantName} · Transactions Report` : 'Transactions Report', M, headerY + 6)
  doc.text(`${formatDate(`${from}T00:00:00`)} to ${formatDate(`${to}T00:00:00`)}`, M, headerY + 11)

  doc.setFontSize(8)
  doc.text(`Generated ${formatDateTime(new Date())}`, pageWidth - M, headerY + 6, { align: 'right' })

  /* Summary stats */
  const stats: [string, string][] = [
    ['REVENUE', `${rs(summary.revenue)}`],
    ['BILLS', String(summary.count)],
    ['AVG BILL', `${rs(summary.avgBill)}`],
  ]
  let x = M
  const statsY = headerY + 19
  for (const [label, val] of stats) {
    doc.setFont(PDFFont.Regular)
    doc.setFontSize(7.5)
    doc.setTextColor(130)
    doc.text(label, x, statsY)
    doc.setFont(PDFFont.Bold)
    doc.setFontSize(11)
    doc.setTextColor(35, 20, 24)
    doc.text(val, x, statsY + 5.5)
    x += 46
  }

  /* Table (with Branch column) */
  const body = rows.map((t) => [
    t.billNo,
    t.branchName.split('—')[0].trim() || t.branchName,
    formatDate(t.createdAt),
    formatTime(t.createdAt),
    t.customerName || t.customerMobile || 'Walk-in',
    t.staffName,
    t.paymentMethod,
    t.discountAmount > 0 ? `${rs(t.discountAmount)}` : '-',
    `${rs(t.total)}`,
  ])

  const revenue = rows.reduce((s, t) => s + t.total, 0)
  const discount = rows.reduce((s, t) => s + t.discountAmount, 0)

  autoTable(doc, {
    startY: statsY + 10,
    head: [['Bill No', 'Branch', 'Date', 'Time', 'Customer', 'Staff', 'Method', 'Discount', 'Total']],
    body,
    foot: [
      [
        `Total — ${rows.length} bills`,
        '',
        '',
        '',
        '',
        '',
        '',
        discount > 0 ? `${rs(discount)}` : '',
        `${rs(revenue)}`,
      ],
    ],
    theme: 'grid',
    styles: { font: PDFFont.Regular, fontSize: 7.5, cellPadding: 2, lineColor: [235, 225, 225], lineWidth: 0.1 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [247, 240, 238], textColor: [60, 32, 38], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 248, 246] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      7: { halign: 'right' },
      8: { halign: 'right', fontStyle: 'bold' },
    },
    didDrawPage: () => {
      doc.setFont(PDFFont.Regular)
      doc.setFontSize(7.5)
      doc.setTextColor(140)
      doc.text('Generated by SaloonX', M, pageHeight - 8)
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - M, pageHeight - 8, { align: 'right' })
    },
  })

  /* Honesty note when the export is capped below the filter total */
  if (rows.length < summary.count) {
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
    doc.setFont(PDFFont.Regular)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(
      `Exported the newest ${rows.length.toLocaleString('en-IN')} of ${summary.count.toLocaleString('en-IN')} paid bills — download the CSV for the complete ledger (voided bills included).`,
      M,
      Math.min(y, pageHeight - 14),
    )
  }

  doc.save(`${branch.billPrefix}-report-${from}-to-${to}.pdf`)
}

/* ── 2. Business summary report (the Dashboard "Share Report" PDF) ─────────── */

/** Branding context for the summary report — franchise-wide or one branch. */
export interface ReportContext {
  /** Report title — franchise name (all-branches) or branch name (scoped). */
  name: string
  /** Branch logo ?? franchise logo (data URL) — null is fine. */
  logo: string | null
  /** Secondary line under the title. */
  tenantName: string | null
}

/**
 * Build the A4 business-summary report PDF — the shareable management report
 * for the selected range (single branch or whole franchise).
 */
export function buildSummaryReportDoc(
  stats: StatsResponse,
  ctx: ReportContext,
  rangeLabel: string,
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  registerPdfFonts(doc)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const M = 14

  const netProfit = stats.totalRevenue - stats.expenses.total

  /* Title block */
  let y = 18
  if (ctx.logo) y = drawLogo(doc, ctx.logo, M, y - 2, 16) + 2

  doc.setFont(PDFFont.Bold)
  doc.setFontSize(18)
  doc.setTextColor(...BRAND)
  doc.text(ctx.name, M, y)
  y += 7
  doc.setFont(PDFFont.Regular)
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text(ctx.tenantName && ctx.tenantName !== ctx.name ? `${ctx.tenantName} · Business Summary` : 'Business Summary', M, y)
  y += 5
  doc.text(rangeLabel, M, y)
  doc.setFontSize(8)
  doc.text(`Generated ${formatDateTime(new Date())}`, pageWidth - M, y, { align: 'right' })
  y += 8

  /* KPI table */
  // Period-over-period deltas (↑/↓ vs same-length prior window).
  const revDelta = stats.previous.totalRevenue > 0
    ? ((stats.totalRevenue - stats.previous.totalRevenue) / stats.previous.totalRevenue) * 100
    : null
  const billsDelta = stats.previous.totalBills > 0
    ? ((stats.totalBills - stats.previous.totalBills) / stats.previous.totalBills) * 100
    : null
  const fmtDelta = (d: number | null): string =>
    d == null ? '' : ` (${d > 0 ? '↑' : '↓'} ${Math.abs(d).toFixed(1)}% vs last)`
  const kpis: [string, string][] = [
    ['Revenue', `${rs(stats.totalRevenue)}${fmtDelta(revDelta)}`],
    ['Bills', `${stats.totalBills}${fmtDelta(billsDelta)}`],
    ['Average bill', `${rs(stats.avgBill)}`],
    ['New customers', String(stats.newCustomers)],
    ['Returning bills', String(stats.returningBills)],
    ['Unique customers', String(stats.customerDepth.unique)],
    ['Repeat rate', `${stats.customerDepth.repeatRate}%`],
    ['ARPU', `${rs(stats.customerDepth.avgRevenuePerCustomer)}`],
    ['Discount given', `${rs(stats.discounts.totalAmount)}`],
    ['Discount leakage', `${stats.discounts.leakagePct}%`],
    ['Expenses', stats.expenses.total > 0 ? `${rs(stats.expenses.total)}` : '—'],
    ['Net profit', stats.expenses.total > 0 ? `${rs(netProfit)}` : '—'],
  ]
  autoTable(doc, {
    startY: y,
    head: [['Key numbers', 'Value']],
    body: kpis,
    theme: 'grid',
    styles: { font: PDFFont.Regular, fontSize: 9, cellPadding: 2.4, lineColor: [235, 225, 225], lineWidth: 0.1 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 248, 246] },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  /* Payment split — SPLIT (mixed-tender) appears once it has activity. */
  const byMethod = stats.byMethod as Record<string, MethodSummary | undefined>
  const methodRows = (['CASH', 'UPI', 'CARD', 'SPLIT'] as const)
    .filter((m) => m !== 'SPLIT' || (byMethod.SPLIT?.count ?? 0) > 0)
    .map((m) => {
      const v = byMethod[m] ?? { amount: 0, count: 0 }
      return [m, `${rs(v.amount)}`, String(v.count)] as [string, string, string]
    })
  autoTable(doc, {
    startY: y,
    head: [['Payment method', 'Amount', 'Bills']],
    body: methodRows,
    foot: [['Total', `${rs(stats.totalRevenue)}`, String(stats.totalBills)]],
    theme: 'grid',
    styles: { font: PDFFont.Regular, fontSize: 9, cellPadding: 2.4, lineColor: [235, 225, 225], lineWidth: 0.1 },
    headStyles: { fillColor: [120, 85, 90], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [247, 240, 238], textColor: [60, 32, 38], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  /* Per-branch split (only when reporting across branches) */
  if (stats.byBranch.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Branch', 'Revenue', 'Bills']],
      body: stats.byBranch.map((b) => [b.name, `${rs(b.revenue)}`, String(b.bills)]),
      theme: 'grid',
      styles: { font: PDFFont.Regular, fontSize: 9, cellPadding: 2.4, lineColor: [235, 225, 225], lineWidth: 0.1 },
      headStyles: { fillColor: [120, 85, 90], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 248, 246] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  /* Top services */
  if (stats.topServices.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Top services', 'Sold', 'Revenue']],
      body: stats.topServices.map((s) => [s.name, String(s.count), `${rs(s.revenue)}`]),
      theme: 'grid',
      styles: { font: PDFFont.Regular, fontSize: 9, cellPadding: 2.4, lineColor: [235, 225, 225], lineWidth: 0.1 },
      headStyles: { fillColor: [120, 85, 90], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 248, 246] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  /* Staff performance */
  if (stats.topStaff.length > 0) {
    const staffRows = stats.topStaff.map((s) => [
      s.name,
      String(s.bills),
      `${rs(s.revenue)}`,
      s.commissionPct > 0 ? `${s.commissionPct}% · ${rs(s.commission)}` : '—',
    ])
    autoTable(doc, {
      startY: y,
      head: [['Staff', 'Bills', 'Revenue', 'Commission']],
      body: staffRows,
      theme: 'grid',
      styles: { font: PDFFont.Regular, fontSize: 9, cellPadding: 2.4, lineColor: [235, 225, 225], lineWidth: 0.1 },
      headStyles: { fillColor: [120, 85, 90], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 248, 246] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    })
  }

  /* Top customers — who to nurture */
  if (stats.topCustomers.length > 0) {
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    const custRows: [string, string, string][] = stats.topCustomers.map((c, i) => [
      `${i + 1}. ${c.name}`,
      String(c.bills),
      `${rs(c.spend)}`,
    ])
    autoTable(doc, {
      startY: y,
      head: [['Top customers', 'Visits', 'Spend']],
      body: custRows,
      theme: 'grid',
      styles: { font: PDFFont.Regular, fontSize: 9, cellPadding: 2.4, lineColor: [235, 225, 225], lineWidth: 0.1 },
      headStyles: { fillColor: [120, 85, 90], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 248, 246] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    })
  }

  /* Footer on every page */
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont(PDFFont.Regular)
    doc.setFontSize(7.5)
    doc.setTextColor(140)
    doc.text('Generated by SaloonX', M, pageHeight - 8)
    doc.text(`Page ${p} of ${pages}`, pageWidth - M, pageHeight - 8, { align: 'right' })
  }

  return doc
}

/** The summary report as a File — ready for Web Share API Level 2. */
export function summaryReportFile(
  stats: StatsResponse,
  ctx: ReportContext,
  rangeLabel: string,
  file: ReportFileScope,
): File {
  const blob = buildSummaryReportDoc(stats, ctx, rangeLabel).output('blob')
  return new File([blob], summaryReportFilename(file), { type: 'application/pdf' })
}

/** Download the summary report PDF directly. */
export function downloadSummaryReportPdf(
  stats: StatsResponse,
  ctx: ReportContext,
  rangeLabel: string,
  file: ReportFileScope,
): void {
  buildSummaryReportDoc(stats, ctx, rangeLabel).save(summaryReportFilename(file))
}

/** SaloonX-Summary-{scope}-{from}-to-{to}.pdf */
function summaryReportFilename(file: ReportFileScope): string {
  return `SaloonX-Summary-${slugify(file.scope)}-${file.from}-to-${file.to}.pdf`
}

/* ── 3. Shift handover report (per staff member, one day) ──────────────── */

/** Cash denominations recognised by the till-count grid (₹2000 … ₹1). */
const TILL_DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const

/** Till-count snapshot captured in the shift dialog — printed on the handover
 *  PDF so the manager can verify the drawer against the day's cash bills and
 *  sign off the handover. `counts` carries only non-zero denominations. */
export interface ShiftTillCount {
  /** Note/coin value → pieces counted (only non-zero entries). */
  counts: Record<number, number>
  /** Σ cash payment slices of the day's bills — what the drawer should hold. */
  expected: number
  /** Σ denomination × count — what the drawer actually holds. */
  counted: number
  /** counted − expected (positive = surplus, negative = shortfall). */
  delta: number
}

/** Build the A4 shift-handover PDF — what one staff member hands over.
 *  `till` (optional) adds the end-of-shift cash reconciliation: counted vs
 *  expected drawer, the denomination breakdown, and the staff/manager
 *  signature pair — the printed handover is the signable document. */
export function buildShiftReportDoc(
  shift: ShiftReportResponse,
  ctx: ReportContext,
  till?: ShiftTillCount,
): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  registerPdfFonts(doc)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const M = 14

  /* Title block */
  let y = 18
  if (ctx.logo) y = drawLogo(doc, ctx.logo, M, y - 2, 16) + 2

  doc.setFont(PDFFont.Bold)
  doc.setFontSize(18)
  doc.setTextColor(...BRAND)
  doc.text('Shift Handover', M, y)
  y += 7
  doc.setFont(PDFFont.Regular)
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text(`${ctx.name} · ${shift.staff.name}`, M, y)
  y += 5
  doc.text(`${formatDate(`${shift.date}T00:00:00`)} · ${shift.summary.bills} bill${shift.summary.bills === 1 ? '' : 's'}`, M, y)
  doc.setFontSize(8)
  doc.text(`Generated ${formatDateTime(new Date(shift.generatedAt))}`, pageWidth - M, y, { align: 'right' })
  y += 8

  /* The three numbers a handover is about */
  const headline: [string, string][] = [
    ['CASH TO HAND OVER', `${rs(shift.summary.cashCollected)}`],
    ['TOTAL COLLECTED', `${rs(shift.summary.revenue)}`],
    shift.staff.commissionPct > 0
      ? ['COMMISSION EARNED', `${rs(shift.summary.commission)} (${shift.staff.commissionPct}%)`]
      : ['BILLS', String(shift.summary.bills)],
  ]
  let x = M
  for (const [label, val] of headline) {
    doc.setFillColor(247, 240, 238)
    doc.roundedRect(x, y, 55, 16, 2, 2, 'F')
    doc.setFont(PDFFont.Regular)
    doc.setFontSize(7)
    doc.setTextColor(130)
    doc.text(label, x + 4, y + 5.5)
    doc.setFont(PDFFont.Bold)
    doc.setFontSize(12)
    doc.setTextColor(35, 20, 24)
    doc.text(val, x + 4, y + 12)
    x += 59
  }
  y += 24

  /* Payment split + summary rows */
  const p = shift.summary.byPayment
  autoTable(doc, {
    startY: y,
    head: [['Payment method', 'Bills', 'Amount']],
    body: [
      ['Cash', String(p.CASH.count), `${rs(p.CASH.amount)}`],
      ['UPI', String(p.UPI.count), `${rs(p.UPI.amount)}`],
      ['Card', String(p.CARD.count), `${rs(p.CARD.amount)}`],
      ['Discounts given', '', `${rs(shift.summary.discounts)}`],
      ['Average bill', '', `${rs(shift.summary.avgBill)}`],
    ],
    foot: [['Total', String(shift.summary.bills), `${rs(shift.summary.revenue)}`]],
    theme: 'grid',
    styles: { font: PDFFont.Regular, fontSize: 9, cellPadding: 2.4, lineColor: [235, 225, 225], lineWidth: 0.1 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [247, 240, 238], textColor: [60, 32, 38], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  /* Bill-by-bill table */
  autoTable(doc, {
    startY: y,
    head: [['Bill', 'Time', 'Customer', 'Items', 'Method', 'Total']],
    body: shift.bills.map((b) => [
      b.billNo,
      formatTime(b.createdAt),
      b.customerName || b.customerMobile || 'Walk-in',
      String(b.items),
      b.paymentMethod,
      `${rs(b.total)}`,
    ]),
    foot: [
      [
        `${shift.summary.bills} bill${shift.summary.bills === 1 ? '' : 's'}`,
        '',
        '',
        '',
        '',
        `${rs(shift.summary.revenue)}`,
      ],
    ],
    theme: 'grid',
    styles: { font: PDFFont.Regular, fontSize: 8, cellPadding: 2, lineColor: [235, 225, 225], lineWidth: 0.1 },
    headStyles: { fillColor: [120, 85, 90], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [247, 240, 238], textColor: [60, 32, 38], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 248, 246] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      3: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
  })

  if (till) {
    /* ── Cash reconciliation (till counted at handover) ──
     * Starts on a fresh page when the bills table leaves no room — a
     * reconciliation split across a page break is not signable. */
    const denomRows = TILL_DENOMS.filter((d) => (till.counts[d] ?? 0) > 0)
    // Conservative block height: heading + summary table (head+2+foot ≈ 32mm)
    // + denomination table (head + rows + foot ≈ 7mm/row) + signature strip.
    const needed = 12 + 34 + (denomRows.length + 2) * 7 + 24
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    if (y + needed > pageHeight - 16) {
      doc.addPage()
      y = 18
    }

    doc.setFont(PDFFont.Bold)
    doc.setFontSize(11)
    doc.setTextColor(...BRAND)
    doc.text('Cash reconciliation', M, y)
    doc.setFont(PDFFont.Regular)
    doc.setFontSize(8)
    doc.setTextColor(130)
    doc.text('Counted at handover', pageWidth - M, y, { align: 'right' })
    y += 6

    const balanced = Math.abs(till.delta) < 0.005
    const diffText = balanced
      ? `${rs(0)} — balanced`
      : `${till.delta > 0 ? '+' : '-'}${rs(Math.abs(till.delta))} — ${till.delta > 0 ? 'surplus' : 'shortfall'}`
    autoTable(doc, {
      startY: y,
      head: [['Drawer vs bills', 'Amount']],
      body: [
        ['Expected cash (from cash bills)', `${rs(till.expected)}`],
        ['Counted cash (in drawer)', `${rs(till.counted)}`],
      ],
      foot: [['Difference', diffText]],
      theme: 'grid',
      pageBreak: 'avoid',
      styles: { font: PDFFont.Regular, fontSize: 9, cellPadding: 2.4, lineColor: [235, 225, 225], lineWidth: 0.1 },
      headStyles: { fillColor: [120, 85, 90], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [247, 240, 238], textColor: [60, 32, 38], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      // A shortfall prints in red — it is the one number the manager must
      // question before signing. Surplus/balanced keep the neutral foot tone.
      didParseCell: (data) => {
        if (data.row.section === 'foot' && !balanced && till.delta < 0) {
          data.cell.styles.textColor = [185, 28, 28]
        }
      },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

    /* Denomination breakdown — only the denominations actually counted. */
    if (denomRows.length > 0) {
      const noteCount = denomRows.reduce((n, d) => n + (till.counts[d] ?? 0), 0)
      autoTable(doc, {
        startY: y,
        head: [['Denomination', 'Count', 'Amount']],
        body: denomRows.map(
          (d) => [`${INR}${d}`, `× ${till.counts[d]}`, `${rs((till.counts[d] ?? 0) * d)}`],
        ),
        foot: [['Counted total', `${noteCount} notes/coins`, `${rs(till.counted)}`]],
        theme: 'grid',
        pageBreak: 'avoid',
        styles: { font: PDFFont.Regular, fontSize: 8, cellPadding: 2, lineColor: [235, 225, 225], lineWidth: 0.1 },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [247, 240, 238], textColor: [60, 32, 38], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [252, 248, 246] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
      })
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
    }

    /* Signature pair — the handover is signed once the drawer is verified. */
    const sigY = Math.min(y + 4, pageHeight - 24)
    doc.setDrawColor(200, 185, 185)
    doc.setLineWidth(0.2)
    doc.line(M, sigY, M + 60, sigY)
    doc.line(pageWidth - M - 60, sigY, pageWidth - M, sigY)
    doc.setFont(PDFFont.Regular)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text('Staff signature', M, sigY + 5)
    doc.text('Manager signature', pageWidth - M, sigY + 5, { align: 'right' })
  } else {
    /* Signature strip (no till counted — plain handover sign-off) */
    const sigY = Math.min(
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14,
      pageHeight - 24,
    )
    doc.setDrawColor(200, 185, 185)
    doc.setLineWidth(0.2)
    doc.line(M, sigY, M + 60, sigY)
    doc.line(pageWidth - M - 60, sigY, pageWidth - M, sigY)
    doc.setFont(PDFFont.Regular)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(shift.staff.name, M, sigY + 5)
    doc.text('Manager / Owner', pageWidth - M, sigY + 5, { align: 'right' })
  }

  /* Footer on every page */
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont(PDFFont.Regular)
    doc.setFontSize(7.5)
    doc.setTextColor(140)
    doc.text(`${ctx.name} · SaloonX shift handover`, M, pageHeight - 8)
    doc.text(`Page ${i} of ${pages}`, pageWidth - M, pageHeight - 8, { align: 'right' })
  }

  return doc
}

/** The shift report as a File — ready for Web Share API Level 2. */
export function shiftReportFile(
  shift: ShiftReportResponse,
  ctx: ReportContext,
  till?: ShiftTillCount,
): File {
  const blob = buildShiftReportDoc(shift, ctx, till).output('blob')
  const who = shift.staff.name.replace(/[^a-z0-9]+/gi, '-')
  return new File([blob], `Shift-${who}-${shift.date}.pdf`, { type: 'application/pdf' })
}

/** Download the shift handover PDF directly. */
export function downloadShiftReportPdf(
  shift: ShiftReportResponse,
  ctx: ReportContext,
  till?: ShiftTillCount,
): void {
  buildShiftReportDoc(shift, ctx, till).save(`Shift-${shift.staff.name.replace(/\s+/g, '-')}-${shift.date}.pdf`)
}

/* ── 4. Expense ledger report (A4, summary + category breakdown + rows) ── */

import type { ExpenseDTO } from '@/lib/types'

/** The month view's category label map shared with the expenses UI. */
const EXPENSE_CAT_LABELS: Record<string, string> = {
  RENT: 'Rent',
  SUPPLIES: 'Supplies',
  SALARY: 'Salary / Payouts',
  UTILITY: 'Utilities',
  MARKETING: 'Marketing',
  MAINTENANCE: 'Maintenance',
  OTHER: 'Other',
}

/** Build the A4 expense-ledger PDF — the book-keeper's monthly export.
 *  `truncated` notes when only the first N of a larger total could be included. */
export function buildExpenseReportDoc(
  rows: ExpenseDTO[],
  branchName: string,
  logo: string | null,
  rangeLabel: string,
  truncated?: { shown: number; total: number },
): jsPDF {
  if (rows.length === 0) throw new Error('No expenses in this range')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  registerPdfFonts(doc)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const M = 14

  const total = rows.reduce((s, e) => s + e.amount, 0)

  /* Header */
  let y = 18
  if (logo) y = drawLogo(doc, logo, M, y - 2, 16) + 2
  doc.setFont(PDFFont.Bold)
  doc.setFontSize(18)
  doc.setTextColor(...BRAND)
  doc.text(branchName, M, y)
  y += 7
  doc.setFont(PDFFont.Regular)
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text('Expense Report', M, y)
  y += 5
  doc.text(rangeLabel, M, y)
  doc.setFontSize(8)
  doc.text(`Generated ${formatDateTime(new Date())}`, pageWidth - M, y, { align: 'right' })
  y += 8

  /* KPI strip */
  const topCat = [...rows.reduce((m, e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])[0]
  const stats: [string, string][] = [
    ['TOTAL EXPENSES', `${rs(total)}`],
    ['ENTRIES', String(rows.length)],
    ['TOP CATEGORY', topCat ? (EXPENSE_CAT_LABELS[topCat[0]] ?? topCat[0]).toUpperCase() : '—'],
  ]
  let x = M
  for (const [label, val] of stats) {
    doc.setFont(PDFFont.Regular)
    doc.setFontSize(7.5)
    doc.setTextColor(130)
    doc.text(label, x, y)
    doc.setFont(PDFFont.Bold)
    doc.setFontSize(11)
    doc.setTextColor(35, 20, 24)
    doc.text(val, x, y + 5.5)
    x += 52
  }
  y += 12

  /* Category breakdown */
  const byCat = [...rows.reduce(
    (m, e) => {
      const c = m.get(e.category) ?? { amount: 0, count: 0 }
      c.amount += e.amount
      c.count += 1
      m.set(e.category, c)
      return m
    },
    new Map<string, { amount: number; count: number }>(),
  )]
  autoTable(doc, {
    startY: y,
    head: [['Category', 'Entries', 'Amount']],
    body: byCat
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([cat, v]) => [EXPENSE_CAT_LABELS[cat] ?? cat, String(v.count), `${rs(v.amount)}`]),
    foot: [['Total', String(rows.length), `${rs(total)}`]],
    theme: 'grid',
    styles: { font: PDFFont.Regular, fontSize: 9, cellPadding: 2.4, lineColor: [235, 225, 225], lineWidth: 0.1 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [247, 240, 238], textColor: [60, 32, 38], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 248, 246] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' } },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  /* Full row table */
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Branch', 'Category', 'Description', 'Entered by', 'Amount']],
    body: rows.map((e) => [
      formatDate(e.date),
      e.branchName.split('—')[1]?.trim() || e.branchName,
      EXPENSE_CAT_LABELS[e.category] ?? e.category,
      e.description ?? '—',
      e.createdByName,
      `${rs(e.amount)}`,
    ]),
    foot: [['', '', '', '', `${rows.length} entries`, `${rs(total)}`]],
    theme: 'grid',
    styles: { font: PDFFont.Regular, fontSize: 8, cellPadding: 2, lineColor: [235, 225, 225], lineWidth: 0.1 },
    headStyles: { fillColor: [120, 85, 90], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [247, 240, 238], textColor: [60, 32, 38], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 248, 246] },
    columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
    didDrawPage: () => {
      doc.setFont(PDFFont.Regular)
      doc.setFontSize(7.5)
      doc.setTextColor(140)
      doc.text('Generated by SaloonX', M, pageHeight - 8)
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - M, pageHeight - 8, { align: 'right' })
    },
  })

  /* Truncation note — the export caps at 1,000 entries per PDF */
  if (truncated && truncated.shown < truncated.total) {
    const y = Math.min(
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
      pageHeight - 14,
    )
    doc.setFont(PDFFont.Regular)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(
      `Showing the first ${truncated.shown.toLocaleString('en-IN')} of ${truncated.total.toLocaleString('en-IN')} entries — export the CSV for the complete ledger.`,
      M,
      y,
    )
  }

  return doc
}

/** SaloonX-Expense-Report-{scope}-{from}-to-{to}.pdf */
function expenseReportFilename(file: ReportFileScope): string {
  return `SaloonX-Expense-Report-${slugify(file.scope)}-${file.from}-to-${file.to}.pdf`
}

/** Download the expense-ledger PDF directly. */
export function downloadExpenseReportPdf(
  rows: ExpenseDTO[],
  branchName: string,
  logo: string | null,
  rangeLabel: string,
  file: ReportFileScope,
  truncated?: { shown: number; total: number },
): void {
  buildExpenseReportDoc(rows, branchName, logo, rangeLabel, truncated).save(expenseReportFilename(file))
}
