"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import {
  Building2,
  Check,
  ChevronsUpDown,
  Clock3,
  Contact,
  Ellipsis,
  LayoutDashboard,
  LogOut,
  Moon,
  Network,
  QrCode,
  ReceiptText,
  Scissors,
  Settings2,
  Sparkles,
  Sun,
  UsersRound,
  Wallet,
} from "lucide-react"
import { useTheme } from "next-themes"
import { signOut } from "firebase/auth"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { apiPost } from "@/lib/api-client"
import { firebaseAuth } from "@/lib/firebase"
import type { BranchRef } from "@/lib/types"
import { useAppStore, type View } from "@/store/use-app-store"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Skeleton } from "@/components/ui/skeleton"
import { ShiftReportDialog } from "@/components/admin/shift-report-dialog"
import { SyncIndicator } from "@/components/shell/sync-indicator"
import { AnnouncementsBell, AnnouncementBanner } from "@/components/shell/announcements-bell"

// Lazy-loaded views keep the initial bundle lean.
const BillingFlow = dynamic(() => import("@/components/billing/billing-flow"), { loading: () => <ViewSkeleton /> })
const DashboardView = dynamic(() => import("@/components/admin/dashboard-view"), { loading: () => <ViewSkeleton /> })
const TransactionsView = dynamic(() => import("@/components/admin/transactions-view"), { loading: () => <ViewSkeleton /> })
const ServicesView = dynamic(() => import("@/components/admin/services-view"), { loading: () => <ViewSkeleton /> })
const StaffView = dynamic(() => import("@/components/admin/staff-view"), { loading: () => <ViewSkeleton /> })
const CustomersView = dynamic(() => import("@/components/admin/customers-view"), { loading: () => <ViewSkeleton /> })
const ExpensesView = dynamic(() => import("@/components/admin/expenses-view"), { loading: () => <ViewSkeleton /> })
const SettingsView = dynamic(() => import("@/components/admin/settings-view"), { loading: () => <ViewSkeleton /> })
const BranchesView = dynamic(() => import("@/components/admin/branches-view"), { loading: () => <ViewSkeleton /> })
const TenantsView = dynamic(() => import("@/components/admin/tenants-view"), { loading: () => <ViewSkeleton /> })
const QrMenuView = dynamic(() => import("@/components/admin/qr-menu-view"), { loading: () => <ViewSkeleton /> })

interface NavItem {
  view: View
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const ADMIN_NAV: NavItem[] = [
  { view: "billing", label: "Billing", icon: Scissors },
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "transactions", label: "Transactions", icon: ReceiptText },
  { view: "expenses", label: "Expenses", icon: Wallet },
  { view: "services", label: "Menu & Prices", icon: Sparkles },
  { view: "staff", label: "Staff", icon: UsersRound },
  { view: "customers", label: "Customers", icon: Contact },
  { view: "branches", label: "Branches", icon: Building2 },
  { view: "qrmenu", label: "QR Menu", icon: QrCode },
  { view: "settings", label: "Settings", icon: Settings2 },
]

const SUPER_ADMIN_NAV: NavItem[] = [{ view: "tenants", label: "Franchises", icon: Network }]

const MOBILE_MORE_VIEWS: View[] = ["expenses", "services", "staff", "customers", "branches", "qrmenu", "settings"]

function initials(name: string): string {
  return (
    name
      .split(" ")
      .filter((w) => /^[a-zA-Z]/.test(w))
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || name.slice(0, 1).toUpperCase()
  )
}

/** Logo chip: tenant logo if present, else monogram tile. */
function TenantChip({ logo, name, size = 36 }: { logo: string | null; name: string; size?: number }) {
  if (logo) {
    return (
       
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-lg border object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg border bg-secondary text-[11px] font-bold text-secondary-foreground"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  )
}

function ViewSkeleton() {
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}

function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="text-muted-foreground"
    >
      {/* CSS-driven icon swap — SSR-safe, no hydration flash */}
      <Sun className="hidden size-5 dark:block" />
      <Moon className="size-5 dark:hidden" />
    </Button>
  )
}

function RoleBadge({ role }: { role: string }) {
  if (role === "SUPER_ADMIN")
    return (
      <span className="micro rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-primary">
        Platform
      </span>
    )
  if (role === "ADMIN")
    return (
      <span className="micro rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-primary">Admin</span>
    )
  return (
    <span className="micro rounded-md border bg-secondary px-1.5 py-0.5 text-secondary-foreground">Staff</span>
  )
}

/** Branch context switcher — heads-up display + dropdown for multi-branch users. */
function BranchSwitcher() {
  const branches = useAppStore((s) => s.branches)
  const currentBranch = useAppStore((s) => s.currentBranch)
  const setCurrentBranch = useAppStore((s) => s.setCurrentBranch)
  const clearCart = useAppStore((s) => s.clearCart)
  const queryClient = useQueryClient()
  const [switching, setSwitching] = useState(false)

  if (branches.length === 0) return null

  // Single-branch users just see where they are.
  if (branches.length === 1) {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5">
        <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="max-w-40 truncate text-sm font-medium sm:max-w-none">{currentBranch?.name ?? branches[0].name}</span>
      </div>
    )
  }

  async function switchTo(b: BranchRef) {
    if (switching || b.id === currentBranch?.id) return
    setSwitching(true)
    try {
      const res = await apiPost<{ currentBranch: BranchRef }>("/api/auth/switch-branch", { branchId: b.id })
      setCurrentBranch(res.currentBranch)
      clearCart() // menu prices & availability differ per branch
      queryClient.removeQueries() // everything is branch-scoped
      toast.success(`Now at ${res.currentBranch.name}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch branch"
          disabled={switching}
          className="flex min-w-0 items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 shadow-sm transition-colors hover:bg-accent disabled:opacity-60"
        >
          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="max-w-32 truncate text-sm font-medium sm:max-w-56">
            {currentBranch?.name ?? "Choose branch"}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="micro justify-between text-muted-foreground">
          Switch branch
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.map((b) => {
          const active = b.id === currentBranch?.id
          return (
            <DropdownMenuItem
              key={b.id}
              onClick={() => void switchTo(b)}
              className={cn("gap-2", active && "font-semibold")}
            >
              <Building2 className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{b.name}</span>
                {b.city && <span className="block truncate text-xs text-muted-foreground">{b.city}</span>}
              </span>
              {active && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell() {
  const user = useAppStore((s) => s.user)
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const setSession = useAppStore((s) => s.setSession)
  const [moreOpen, setMoreOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [shiftOpen, setShiftOpen] = useState(false)

  const role = user?.role ?? "STAFF"
  const isAdmin = role === "ADMIN"
  const isSuperAdmin = role === "SUPER_ADMIN"
  const effectiveView: View = isSuperAdmin ? "tenants" : isAdmin ? view : "billing"

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await apiPost("/api/auth/logout")
      // Also clear the Firebase session so the next visitor signs in fresh.
      await signOut(firebaseAuth()).catch(() => undefined)
      toast.success("Logged out")
    } catch {
      toast.error("Could not log out — try again")
      return
    } finally {
      setLoggingOut(false)
    }
    setSession(null)
  }

  const sidebarNav = isSuperAdmin ? SUPER_ADMIN_NAV : isAdmin ? ADMIN_NAV : ADMIN_NAV.filter((n) => n.view === "billing")

  const renderView = () => {
    switch (effectiveView) {
      case "billing":
        return <BillingFlow />
      case "dashboard":
        return <DashboardView />
      case "transactions":
        return <TransactionsView />
      case "expenses":
        return <ExpensesView />
      case "services":
        return <ServicesView />
      case "staff":
        return <StaffView />
      case "customers":
        return <CustomersView />
      case "branches":
        return <BranchesView />
      case "qrmenu":
        return <QrMenuView />
      case "tenants":
        return <TenantsView />
      case "settings":
        return <SettingsView />
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {isSuperAdmin ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-primary/5 text-primary">
                  <Network className="size-4.5" aria-hidden />
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-sm font-bold sm:text-[15px]">SaloonX Platform</div>
                  <p className="micro text-muted-foreground">Franchise console</p>
                </div>
              </div>
            ) : (
              <>
                <TenantChip logo={user?.tenantLogo ?? null} name={user?.tenantName ?? "SaloonX"} />
                <div className="min-w-0 hidden leading-tight sm:block lg:block">
                  <div className="max-w-44 truncate text-sm font-bold lg:max-w-none">{user?.tenantName ?? "SaloonX"}</div>
                  <p className="micro text-muted-foreground">Franchise</p>
                </div>
                <span aria-hidden className="mx-1 hidden h-8 w-px bg-border sm:block" />
                <BranchSwitcher />
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {/* Franchise announcements (approvals, pauses, welcome notes) */}
            <AnnouncementsBell />
            {/* Offline bill queue — visible where billing happens (not for the platform console) */}
            {!isSuperAdmin && <SyncIndicator />}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-2 shadow-sm transition-colors hover:bg-accent sm:pr-3"
                >
                  <span className="flex size-8 items-center justify-center rounded-full border bg-secondary text-xs font-bold text-secondary-foreground">
                    {user ? initials(user.name) : "?"}
                  </span>
                  <span className="hidden max-w-36 truncate text-sm font-medium lg:block">{user?.name}</span>
                  <RoleBadge role={role} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{user?.name}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {role === "SUPER_ADMIN" ? "Platform developer" : role === "ADMIN" ? "Administrator" : "Staff"}
                    {user?.tenantName ? ` · ${user.tenantName}` : ""}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!isSuperAdmin && (
                  <DropdownMenuItem onClick={() => setShiftOpen(true)}>
                    <Clock3 /> My shift today
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onClick={() => void logout()} disabled={loggingOut}>
                  <LogOut /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Fresh-branch-live celebration strip (auto-hides once read) */}
      <AnnouncementBanner />

      {/* Self shift handover (ADMIN + STAFF) */}
      {!isSuperAdmin && <ShiftReportDialog open={shiftOpen} onOpenChange={setShiftOpen} />}

      {/* ── Body: sidebar (desktop) + content ──────────────────────────── */}
      <div className="flex flex-1">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-sidebar px-3 py-4 lg:flex">
          {sidebarNav.map((item) => {
            const active = effectiveView === item.view
            const Icon = item.icon
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => setView(item.view)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex w-full items-center rounded-lg py-2.5 pl-3 pr-4 text-sm font-medium transition-colors",
                  active ? "text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-lg bg-primary shadow-sm"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-3">
                  <Icon className="size-5 shrink-0" />
                  {item.label}
                </span>
              </button>
            )
          })}
          {isSuperAdmin && (
            <p className="mt-auto hidden rounded-lg border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground lg:block">
              You are the platform owner. Onboard franchises, approve new branches and review each
              chain&apos;s performance here.
            </p>
          )}
        </aside>

        {/* Views own their padding (incl. mobile bottom-nav clearance pb-24) */}
        <main className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={effectiveView}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Mobile bottom nav (ADMIN only) ─────────────────────────────── */}
      {isAdmin && (
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <div className="grid grid-cols-4">
            {(
              [
                { view: "billing", label: "Bill", icon: Scissors },
                { view: "dashboard", label: "Home", icon: LayoutDashboard },
                { view: "transactions", label: "Bills", icon: ReceiptText },
              ] as NavItem[]
            ).map((item) => {
              const active = effectiveView === item.view
              const Icon = item.icon
              return (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => setView(item.view)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl transition-colors",
                      active && "bg-primary/10",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  {item.label}
                </button>
              )
            })}
            <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-label="More menu"
                aria-current={MOBILE_MORE_VIEWS.includes(effectiveView) ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium transition-colors",
                  MOBILE_MORE_VIEWS.includes(effectiveView)
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl transition-colors",
                    MOBILE_MORE_VIEWS.includes(effectiveView) && "bg-primary/10",
                  )}
                >
                  <Ellipsis className="size-5" />
                </span>
                More
              </button>
              <DrawerContent>
                <div className="mx-auto w-full max-w-md pb-8">
                  <DrawerTitle className="px-4 pb-2 pt-4 text-left text-sm font-semibold text-muted-foreground">
                    More
                  </DrawerTitle>
                  <div className="grid gap-1 px-2">
                    {MOBILE_MORE_VIEWS.map((v) => {
                      const item = ADMIN_NAV.find((n) => n.view === v)!
                      const Icon = item.icon
                      const active = effectiveView === v
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            setView(v)
                            setMoreOpen(false)
                          }}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                            active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
                          )}
                        >
                          <Icon className="size-5" />
                          {item.label}
                        </button>
                      )
                    })}
                    <div className="my-1 border-t" />
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false)
                        void logout()
                      }}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <LogOut className="size-5" />
                      Log out
                    </button>
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        </nav>
      )}
    </div>
  )
}
