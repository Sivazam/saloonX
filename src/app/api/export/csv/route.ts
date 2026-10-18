import { db } from "@/lib/db"
import { adminBranchScope, requireApiUser } from "@/lib/auth"
import { dayEnd, dayStart } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/**
 * GET (ADMIN): transactions CSV for the franchise (or one ?branchId=),
 * newest first. Columns include the branch name. Same filters as the
 * Transactions view (method, staff, free-text search).
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const params = new URL(request.url).searchParams
  const from = dayStart(params.get("from") ?? new Date(Date.now() - 29 * 86400000))
  const to = dayEnd(params.get("to") ?? new Date())
  const method = params.get("method") ?? ""
  const staffId = params.get("staffId") ?? ""
  const search = (params.get("search") ?? "").trim()
  const branchIdParam = params.get("branchId") ?? ""

  const scope = await adminBranchScope(auth.user, branchIdParam || null)
  if (scope.error) return Response.json({ error: scope.error }, { status: 403 })
  const branchIds = scope.branchIds ?? []

  // Neutralise spreadsheet formula injection: a cell starting with = + - @ or
  // tab is prefixed with a single quote so Excel/Sheets treats it as text.
  const esc = (v: string) => {
    const safe = /^[=+@\t\r]|^\-/.test(v) ? `'${v}` : v
    return `"${safe.replace(/"/g, '""')}"`
  }

  // Empty scope (no approved branches) → an empty ledger, never the platform.
  const cols = [
    "Bill No", "Branch", "Date", "Time", "Customer Mobile", "Customer Name",
    "Staff", "Services", "Subtotal", "Discount %", "Discount Amt", "GST Amt", "Total",
    "Payment Method", "Status",
  ]
  if (branchIds.length === 0) {
    return csvResponse([cols], branchIdParam ? "branch" : "all")
  }

  const where = {
    branchId: { in: branchIds },
    ...(from || to
      ? {
          AND: [
            ...(from ? [{ createdAt: { gte: from } }] : []),
            ...(to ? [{ createdAt: { lte: to } }] : []),
          ],
        }
      : {}),
    ...(method === "CASH" || method === "UPI" || method === "CARD" ? { paymentMethod: method } : {}),
    ...(staffId ? { staffId } : {}),
    ...(search
      ? {
          OR: [
            { billNo: { contains: search } },
            { customerMobile: { contains: search } },
            { customerName: { contains: search } },
          ],
        }
      : {}),
  }

  const rows = await db.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { items: true },
  })

  const lines = [cols]
  for (const t of rows) {
    const services = t.items.map((i) => (i.qty > 1 ? `${i.serviceName} x${i.qty}` : i.serviceName)).join("; ")
    const d = t.createdAt
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    lines.push(
      [
        t.billNo, t.branchName, date, time,
        t.customerMobile ?? "", t.customerName ?? "", t.staffName, services,
        t.subtotal.toFixed(2), t.discountPct.toFixed(0), t.discountAmount.toFixed(2),
        t.gstAmount.toFixed(2), t.total.toFixed(2), t.paymentMethod, t.status,
      ]
        .map((c) => esc(String(c))),
    )
  }

  return csvResponse(lines, branchIdParam ? branchIds[0] : "all")
}

function csvResponse(rows: string[][], prefix: string): Response {
  const csv = "\uFEFF" + rows.map((r) => r.join(",")).join("\r\n")
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="saloonx-transactions-${prefix}.csv"`,
    },
  })
}
