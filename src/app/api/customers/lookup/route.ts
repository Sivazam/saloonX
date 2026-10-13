import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiBranch } from "@/lib/auth"
import { toCustomerDTO } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/**
 * GET: look up a customer by mobile within the CURRENT franchise.
 * Loyalty recommendation uses the CURRENT branch's loyalty settings
 * (franchise-wide visit count — customers are chain-wide).
 */
export async function GET(request: Request) {
  const auth = await requireApiBranch()
  if (!auth.user) return auth.response
  const branch = auth.branch

  const mobile = (new URL(request.url).searchParams.get("mobile") ?? "").trim()
  if (!/^\d{10}$/.test(mobile)) {
    return NextResponse.json({ error: "Mobile must be exactly 10 digits" }, { status: 400 })
  }

  const customer = await db.customer.findUnique({
    where: { tenantId_mobile: { tenantId: branch.tenantId, mobile } },
  })
  if (!customer) {
    return NextResponse.json({ customer: null, recommendation: null, lastVisit: null })
  }

  // Last COMPLETED visit with its items — powers the "Last visit" hint at billing,
  // so staff can say "same as last time?" without checking records.
  const lastBill = await db.transaction.findFirst({
    where: { customerId: customer.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  })

  const lastVisit = lastBill
    ? {
        billNo: lastBill.billNo,
        date: lastBill.createdAt.toISOString(),
        services: lastBill.items.map((i) => (i.qty > 1 ? `${i.serviceName} x${i.qty}` : i.serviceName)),
        total: lastBill.total,
        paymentMethod: lastBill.paymentMethod,
        branchName: lastBill.branchName,
      }
    : null

  return NextResponse.json({
    customer: toCustomerDTO(customer),
    recommendation: {
      eligible: branch.loyaltyEnabled && customer.visits >= branch.loyaltyVisits,
      discountPct: branch.loyaltyDiscountPct,
      visits: customer.visits,
    },
    lastVisit,
  })
}
