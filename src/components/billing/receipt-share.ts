'use client'

import { toast } from 'sonner'
import { formatINR } from '@/lib/format'
import type { Dict } from '@/lib/i18n'
import type { BranchProfileDTO, TransactionDTO } from '@/lib/types'
import {
  buildReceiptShareNote,
  canShareFiles,
  downloadReceiptPdf,
  receiptPdfFile,
} from './receipt-pdf'

export interface ShareReceiptOpts {
  /**
   * true  → the green WhatsApp button (opens the customer's chat on the desktop fallback)
   * false → the generic "More Share" button (device share menu / PDF hand-off)
   */
  whatsapp: boolean
  /** Active dictionary (en/hi) for the guidance toasts. */
  L: Dict
}

/**
 * Share the receipt as the SAME A5 PDF that Print / Download PDF produce — never a text receipt.
 *
 * 1. Mobile (Web Share API Level 2): the actual PDF file is attached to the native share
 *    sheet — picking WhatsApp (or any app) delivers the PDF as a document attachment.
 * 2. Desktop fallback (WhatsApp): opens the customer's chat with a short thank-you note
 *    and downloads the PDF — staff just attach the downloaded file to that chat.
 * 3. Desktop fallback (generic / walk-in): downloads the PDF and copies the note,
 *    so staff can send it from anywhere.
 */
export function shareReceiptPdf(
  t: TransactionDTO,
  b: BranchProfileDTO,
  { whatsapp, L }: ShareReceiptOpts,
): void {
  const note = buildReceiptShareNote(t, b)

  // 1) Real file share — mobile browsers
  const file = receiptPdfFile(t, b)
  if (canShareFiles(file) && typeof navigator.share === 'function') {
    void navigator
      .share({ files: [file], title: `Receipt ${t.billNo}`, text: note })
      .catch(() => undefined) // user dismissed the share sheet — not an error
    return
  }

  const copyNote = () => {
    try {
      void navigator.clipboard.writeText(note)
    } catch {
      // clipboard unavailable — the downloaded PDF is the primary channel anyway
    }
  }

  // 2) Desktop WhatsApp — open the chat + download the PDF for attaching
  if (whatsapp && t.customerMobile) {
    window.open(
      `https://wa.me/91${t.customerMobile}?text=${encodeURIComponent(note)}`,
      '_blank',
      'noopener',
    )
    downloadReceiptPdf(t, b)
    toast.success(L.pdfWhatsappHint, {
      description: `${t.billNo} · ${formatINR(t.total)}`,
    })
    return
  }

  // 3) Generic / walk-in fallback — PDF in hand + note on clipboard
  downloadReceiptPdf(t, b)
  copyNote()
  toast.success(L.pdfShareHint, { description: `${t.billNo} · ${formatINR(t.total)}` })
}
