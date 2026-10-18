'use client'

import { jsPDF } from 'jspdf'
import { formatDateTime, formatINR } from '@/lib/format'
import type { BranchProfileDTO, TransactionDTO } from '@/lib/types'

/** jsPDF's built-in fonts cannot render the rupee sign — use "Rs." instead. */
function rs(n: number): string {
  const isInteger = Math.abs(n - Math.round(n)) < 0.005
  return `Rs. ${n.toLocaleString('en-IN', isInteger ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Split a GST amount into CGST + SGST such that the two halves ALWAYS sum
 *  back to the original amount (round-then-balance). Halving then displaying
 *  each half independently can be off by 1 paisa on odd-paisa totals
 *  (e.g. gst=1.01 → 0.51 + 0.51 = 1.02 ≠ 1.01) — a real GST-filing hazard. */
function splitGst(gstAmount: number): { cgst: number; sgst: number } {
  const cgst = Math.round(gstAmount * 100 / 2) / 100
  return { cgst, sgst: Math.round((gstAmount - cgst) * 100) / 100 }
}

/** Plain-text receipt for Copy / paste-anywhere (WhatsApp *bold* syntax). */
export function buildReceiptText(t: TransactionDTO, b: BranchProfileDTO): string {
  const lines: string[] = []
  lines.push(`*${b.name}*`)
  if (b.tenantName && b.tenantName !== b.name) lines.push(b.tenantName)
  if (b.gstin) lines.push(`GSTIN: ${b.gstin}`)
  const docLabel = t.status === 'VOIDED' ? 'VOID Bill' : 'Bill'
  lines.push(`${docLabel} ${t.billNo} \u00b7 ${formatDateTime(t.createdAt)}`)
  if (t.customerName || t.customerMobile) {
    lines.push(
      `Customer: ${[t.customerName, t.customerMobile].filter(Boolean).join(' · ')}`,
    )
  }
  lines.push('------------------------')
  for (const item of t.items) {
    lines.push(`${item.serviceName} x${item.qty} \u2014 ${formatINR(item.price * item.qty)}`)
  }
  lines.push('------------------------')
  lines.push(`Subtotal: ${formatINR(t.subtotal)}`)
  if (t.discountPct > 0) lines.push(`Discount (${t.discountPct}%): \u2212${formatINR(t.discountAmount)}`)
  if (t.gstAmount > 0) {
    const { cgst, sgst } = splitGst(t.gstAmount)
    lines.push(`CGST (${(t.gstPct / 2).toFixed(2)}%): ${formatINR(cgst)}`)
    lines.push(`SGST (${(t.gstPct / 2).toFixed(2)}%): ${formatINR(sgst)}`)
  }
  lines.push(`*Total: ${formatINR(t.total)}*`)
  if (t.status === 'VOIDED') {
    lines.push('*VOIDED*')
    if (t.voidReason) lines.push(`Reason: ${t.voidReason}`)
  } else {
    lines.push(`Paid via ${t.paymentMethod}`)
  }
  if (t.note) lines.push(`Note: ${t.note}`)
  if (b.receiptFooter) lines.push(b.receiptFooter)
  return lines.join('\n')
}

/** Draw the branch/franchise logo (a PNG data URL) centred at the top of the doc.
 *  Never throws — a bad/missing logo must not break the receipt. */
function drawLogo(doc: jsPDF, dataUrl: string | null, W: number, y: number): number {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return y
  try {
    const size = 16 // mm
    doc.addImage(dataUrl, 'PNG', W / 2 - size / 2, y - 4, size, size)
    return y + size + 2
  } catch {
    return y
  }
}

/** Build the SAME A5 receipt PDF used by Print-file / Download / Share — single source of truth. */
function buildReceiptDoc(t: TransactionDTO, b: BranchProfileDTO): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  const W = 148 // A5 width mm
  const M = 14 // margin
  const right = W - M
  let y = 20

  const dash = () => {
    doc.setLineDashPattern([1.4, 1.4], 0)
    doc.setDrawColor(150)
    doc.setLineWidth(0.4)
    doc.line(M, y, right, y)
    doc.setLineDashPattern([], 0)
  }

  // Header: logo (branch ?? franchise) then branch identity
  const logo = b.logo ?? b.tenantLogo ?? null
  if (logo) y = drawLogo(doc, logo, W, y + 4)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(b.name, W / 2, y, { align: 'center' })
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90)
  if (b.tenantName && b.tenantName !== b.name) {
    doc.text(b.tenantName, W / 2, y, { align: 'center' })
    y += 4.5
  }
  if (b.address) {
    doc.text(b.address, W / 2, y, { align: 'center' })
    y += 4.5
  }
  if (b.phone) {
    doc.text(`Phone: ${b.phone}`, W / 2, y, { align: 'center' })
    y += 4.5
  }
  // GSTIN — required on a tax invoice when the branch is GST-registered.
  if (b.gstin) {
    doc.text(`GSTIN: ${b.gstin}`, W / 2, y, { align: 'center' })
    y += 4.5
  }
  doc.setTextColor(0)

  // Bill meta
  y += 3
  dash()
  y += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`${t.status === 'VOIDED' ? 'VOID Bill' : 'Bill'} ${t.billNo}`, M, y)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDateTime(t.createdAt), right, y, { align: 'right' })
  y += 6.5
  // Customer line (when the bill is tied to a customer).
  if (t.customerName || t.customerMobile) {
    doc.setFontSize(9)
    doc.setTextColor(90)
    doc.text(
      `Customer: ${[t.customerName, t.customerMobile].filter(Boolean).join(' · ')}`,
      M,
      y,
    )
    doc.setTextColor(0)
    doc.setFontSize(10)
    y += 6
  }
  y += 0.5

  // Items
  doc.setFontSize(11)
  for (const item of t.items) {
    if (y > 172) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'normal')
    doc.text(`${item.serviceName} x${item.qty}`, M, y)
    doc.text(rs(item.price * item.qty), right, y, { align: 'right' })
    y += 6.5
  }

  // Totals
  y += 1
  dash()
  y += 7
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Subtotal', M, y)
  doc.text(rs(t.subtotal), right, y, { align: 'right' })
  y += 6
  if (t.discountPct > 0) {
    doc.text(`Discount (${t.discountPct}%)`, M, y)
    doc.text(`- ${rs(t.discountAmount)}`, right, y, { align: 'right' })
    y += 6
  }
  if (t.gstAmount > 0) {
    // Intra-state sale → tax is split CGST + SGST. Salons bill within their
    // own state, so the split is always applicable. The two halves are
    // round-then-balanced so CGST+SGST always reconciles to gstAmount.
    const { cgst, sgst } = splitGst(t.gstAmount)
    const halfPct = (t.gstPct / 2).toFixed(2).replace(/\.?0+$/, '')
    doc.text(`CGST (${halfPct}%)`, M, y)
    doc.text(rs(cgst), right, y, { align: 'right' })
    y += 6
    doc.text(`SGST (${halfPct}%)`, M, y)
    doc.text(rs(sgst), right, y, { align: 'right' })
    y += 6
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(t.status === 'VOIDED' ? 'Total (VOIDED)' : 'Total', M, y)
  doc.text(rs(t.total), right, y, { align: 'right' })
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  if (t.status === 'VOIDED') {
    doc.setTextColor(180, 30, 30)
    doc.text('Cancelled — no amount due', M, y)
    if (t.voidReason) {
      y += 5
      const wrapped = doc.splitTextToSize(`Reason: ${t.voidReason}`, W - M * 2)
      doc.text(wrapped, M, y)
      y += wrapped.length * 4.5
    }
    doc.setTextColor(0)
  } else {
    doc.text(`Paid via ${t.paymentMethod}`, M, y)
  }
  y += 8

  // Bill note (optional)
  if (t.note) {
    doc.setFontSize(9)
    doc.setTextColor(110)
    const wrapped = doc.splitTextToSize(`Note: ${t.note}`, W - M * 2)
    if (y + wrapped.length * 4.5 > 195) {
      doc.addPage()
      y = 20
    }
    doc.text(wrapped, W / 2, y, { align: 'center' })
    y += wrapped.length * 4.5 + 3
    doc.setTextColor(0)
  }

  // Footer
  if (b.receiptFooter) {
    doc.setFontSize(8.5)
    doc.setTextColor(110)
    const wrapped = doc.splitTextToSize(b.receiptFooter, W - M * 2)
    if (y + wrapped.length * 4 > 195) {
      doc.addPage()
      y = 20
    }
    doc.text(wrapped, W / 2, y, { align: 'center' })
  }

  // VOIDED watermark — a diagonal red stamp across every page so a voided
  // bill can never be mistaken for a valid receipt (audit/GST compliance).
  if (t.status === 'VOIDED') {
    const pageCount = doc.getNumberOfPages()
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p)
      doc.setTextColor(200, 40, 40)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(56)
      doc.text('VOID', W / 2, 105, { align: 'center', angle: 35 })
      doc.setTextColor(0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
    }
  }

  return doc
}

/** Download the receipt PDF. */
export function downloadReceiptPdf(t: TransactionDTO, b: BranchProfileDTO): void {
  buildReceiptDoc(t, b).save(`${t.billNo}.pdf`)
}

/** The receipt PDF as a File, ready for Web Share API Level 2 (file sharing). */
export function receiptPdfFile(t: TransactionDTO, b: BranchProfileDTO): File {
  const blob = buildReceiptDoc(t, b).output('blob')
  return new File([blob], `${t.billNo}.pdf`, { type: 'application/pdf' })
}

/** Can this browser attach real files to the native share sheet (mobile Web Share L2)? */
export function canShareFiles(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  )
}

/** Short note that travels WITH the shared PDF file (the full bill lives inside the PDF). */
export function buildReceiptShareNote(t: TransactionDTO, b: BranchProfileDTO): string {
  const items = t.items.map((i) => i.serviceName).join(', ')
  const greeting = t.customerName
    ? `Thank you, ${t.customerName}!`
    : `Thank you for visiting ${b.name}!`
  return (
    `${greeting} \u{1F9FE}\n` +
    `Receipt ${t.billNo} \u00b7 ${formatINR(t.total)} \u00b7 ${items}\n` +
    `PDF receipt attached \u{1F4C4}`
  )
}
