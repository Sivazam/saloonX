import { db } from "@/lib/db"
import { adminBranchScope, requireApiUser } from "@/lib/auth"
import { dayEnd, dayStart } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/**
 * GET (ADMIN): expenses CSV for the franchise (or one ?branchId=),
 * newest first — the same filters as the Expenses view. Book-keepers get a
 * clean month ledger without re-typing anything.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const params = new URL(request.url).searchParams
  const fromParam = params.get("from")
  const toParam = params.get("to")
  const category = (params.get("category") ?? "").toUpperCase()
  const branchIdParam = params.get("branchId") ?? ""

  const scope = await adminBranchScope(auth.user, branchIdParam || null)
  if (scope.error) return Response.json({ error: scope.error }, { status: 403 })
  const branchIds = scope.branchIds ?? []

  // Neutralise spreadsheet formula injection.
  const esc = (v: string) => {
    const safe = /^[=+@\t\r]|^\-/.test(v) ? `'${v}` : v
    return `"${safe.replace(/"/g, '""')}"`
  }

  const from = fromParam ? dayStart(fromParam) : null
  const to = toParam ? dayEnd(toParam) : null
  const validCategory = ["RENT", "SUPPLIES", "SALARY", "UTILITY", "MARKETING", "MAINTENANCE", "OTHER"]

  // Empty scope (no approved branches) → an empty ledger, never the platform.
  const cols = ["Date", "Category", "Description", "Amount (INR)", "Branch", "Entered by", "Logged at"]
  if (branchIds.length === 0) {
    return csvResponse([cols], "all")
  }

  const where = {
    branchId: { in: branchIds },
    ...(from || to
      ? {
          AND: [
            ...(from ? [{ date: { gte: from } }] : []),
            ...(to ? [{ date: { lte: to } }] : []),
          ],
        }
      : {}),
    ...(validCategory.includes(category) ? { category } : {}),
  }

  const rows = await db.expense.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { branch: { select: { name: true } } },
  })

  const lines = [cols]
  for (const e of rows) {
    const d = e.date
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    lines.push(
      [
        date,
        e.category,
        e.description ?? "",
        e.amount.toFixed(2),
        e.branch.name,
        e.createdByName,
        `${e.createdAt.getFullYear()}-${String(e.createdAt.getMonth() + 1).padStart(2, "0")}-${String(e.createdAt.getDate()).padStart(2, "0")}`,
      ]
        .map((c) => esc(String(c))),
    )
  }

  const suffix = validCategory.includes(category) ? category.toLowerCase() : "all"
  return csvResponse(lines, suffix)
}

function csvResponse(rows: string[][], suffix: string): Response {
  const csv = "\uFEFF" + rows.map((r) => r.join(",")).join("\r\n")
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="saloonx-expenses-${suffix}.csv"`,
    },
  })
}
