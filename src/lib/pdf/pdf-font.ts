/**
 * Embedded ₹-capable font for jsPDF PDFs (receipts + admin reports).
 *
 * jsPDF's built-in helvetica is WinAnsi-only — it has no U+20B9 (₹), which
 * is why every PDF used to print "Rs." while the screens showed ₹. These
 * subset Noto Sans builds (Latin + punctuation + ₹, ~35KB each) fix that
 * with a negligible bundle cost since PDF builders are dynamically imported.
 *
 * Usage:
 *   import { registerPdfFonts, PDFFont } from "@/lib/pdf/pdf-font"
 *   const doc = new jsPDF(...)
 *   registerPdfFonts(doc)           // idempotent
 *   doc.setFont(PDFFont.Regular)    // or PDFFont.Bold
 *   doc.text(`Total: ₹${amount}`, ...)
 *
 * For jspdf-autotable, pass `styles: { font: PDFFont.Regular }` (and
 * `headStyles: { font: PDFFont.Bold }`) — autoTable does not inherit the
 * document font automatically.
 */
import { jsPDF } from "jspdf"
import { NOTO_SANS_REGULAR_B64 } from "./noto-regular-b64"
import { NOTO_SANS_BOLD_B64 } from "./noto-bold-b64"

export const PDFFont = {
  Regular: "notosans",
  Bold: "notosans-bold",
} as const

const VFS_REGULAR = "NotoSans-Regular-subset.ttf"
const VFS_BOLD = "NotoSans-Bold-subset.ttf"

/** Docs whose fonts are already registered — memoised PER INSTANCE. A plain
 *  module-level boolean would only ever register the FIRST document created
 *  in the session, silently leaving every later PDF (another export, another
 *  dialog) on fallback helvetica with a broken ₹. */
const registeredDocs = new WeakSet<jsPDF>()

/** Register the embedded fonts on a jsPDF instance. Safe to call repeatedly
 *  on the SAME doc; a fresh doc always gets a fresh registration.
 *  Style aliases are registered so library defaults that request e.g.
 *  ("notosans", "bold") — jspdf-autotable's head style does — resolve. */
export function registerPdfFonts(doc: jsPDF): void {
  if (registeredDocs.has(doc)) return
  doc.addFileToVFS(VFS_REGULAR, NOTO_SANS_REGULAR_B64)
  doc.addFont(VFS_REGULAR, PDFFont.Regular, "normal")
  doc.addFont(VFS_REGULAR, PDFFont.Regular, "italic") // no italic build — fall back to regular
  doc.addFileToVFS(VFS_BOLD, NOTO_SANS_BOLD_B64)
  doc.addFont(VFS_BOLD, PDFFont.Bold, "normal")
  doc.addFont(VFS_BOLD, PDFFont.Bold, "bold")
  doc.addFont(VFS_BOLD, PDFFont.Regular, "bold")
  registeredDocs.add(doc)
}

/** ₹ symbol for PDF strings (kept next to the font so intent is obvious). */
export const INR = "\u20B9"
