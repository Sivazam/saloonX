'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgePercent, Clock3, Info, Loader2, Mail, MapPin, Pencil, Trash2, UserPlus } from 'lucide-react'
import { DuoUsers, DuoWarning } from '@/components/ui/duotone-icons'
import { toast } from 'sonner'
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api-client'
import { formatINR } from '@/lib/format'
import type { BranchAdminDTO, Role, StaffDTO } from '@/lib/types'
import { ShiftReportDialog } from './shift-report-dialog'
import { useAppStore } from '@/store/use-app-store'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { EmptyState, RoleBadge, initials, type StaffListResponse } from './ui-atoms'

interface StaffFields {
  name: string
  email: string
  password: string
  role: Role
  commissionPct: string
  /** Branches this user may operate. */
  branchIds: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseCommission(v: string): number | { error: string } {
  const t = v.trim()
  if (t === '') return 0
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return { error: 'Commission must be between 0 and 100' }
  }
  return Math.round(n * 10) / 10
}

/** Branch-assignment picker — checkbox list of the franchise's branches. */
function BranchPicker({
  branches,
  value,
  onChange,
  error,
}: {
  branches: BranchAdminDTO[]
  value: string[]
  onChange: (ids: string[]) => void
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>Branches they can work at</Label>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {branches.map((b) => {
          const checked = value.includes(b.id)
          const short = b.name.split('—')[1]?.trim() || b.name
          return (
            <label
              key={b.id}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition-colors',
                checked ? 'border-primary/50 bg-primary/5' : 'bg-card hover:bg-accent/50',
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => onChange(v ? [...value, b.id] : value.filter((id) => id !== b.id))}
                aria-label={`Assign ${b.name}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{short}</span>
                {b.city && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" aria-hidden />
                    {b.city}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>
      {branches.length === 0 && <p className="text-xs text-muted-foreground">Loading branches…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export default function StaffView() {
  const qc = useQueryClient()
  const user = useAppStore((s) => s.user)

  const staffQ = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiGet<StaffListResponse>('/api/staff'),
  })
  const branchesQ = useQuery({
    queryKey: ['branches'],
    queryFn: () => apiGet<{ branches: BranchAdminDTO[] }>('/api/branches'),
  })
  const users = staffQ.data?.users ?? []
  const franchiseBranches = branchesQ.data?.branches ?? []

  const invalidateStaff = () => {
    void qc.invalidateQueries({ queryKey: ['staff'] })
    // login screen tiles come from the same roster
    void qc.invalidateQueries({ queryKey: ['auth-users'] })
    void qc.invalidateQueries({ queryKey: ['branches'] })
  }

  /* Dialog state */
  const [addOpen, setAddOpen] = useState(false)
  const [addFields, setAddFields] = useState<StaffFields>({ name: '', email: '', password: '', role: 'STAFF', commissionPct: '', branchIds: [] })
  const [addErrors, setAddErrors] = useState<{ name?: string; email?: string; password?: string; commissionPct?: string; branches?: string }>({})

  const [editUser, setEditUser] = useState<StaffDTO | null>(null)
  const [shiftTarget, setShiftTarget] = useState<StaffDTO | null>(null)
  const [editFields, setEditFields] = useState<StaffFields>({ name: '', email: '', password: '', role: 'STAFF', commissionPct: '', branchIds: [] })
  const [editErrors, setEditErrors] = useState<{ name?: string; commissionPct?: string; branches?: string }>({})

  const [deleteTarget, setDeleteTarget] = useState<StaffDTO | null>(null)

  /* Mutations */
  const createMut = useMutation({
    mutationFn: (v: { name: string; email: string; password: string; role: Role; commissionPct: number; branchIds: string[] }) =>
      apiPost('/api/staff', v),
    onSuccess: () => {
      invalidateStaff()
      toast.success('Staff account created', {
        description: 'They can sign in with this email + password right away.',
      })
      setAddOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMut = useMutation({
    mutationFn: (v: {
      id: string
      name?: string
      pin?: string
      role?: Role
      active?: boolean
      commissionPct?: number
      branchIds?: string[]
    }) => apiPut('/api/staff', v),
    onSuccess: (_d, v) => {
      invalidateStaff()
      toast.success(
        v.branchIds != null
          ? 'Branches updated'
          : v.name != null || v.role != null
            ? 'Staff updated'
            : v.active
              ? 'Staff activated'
              : 'Staff deactivated',
      )
      setEditUser(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/staff?id=${id}`),
    onSuccess: () => {
      invalidateStaff()
      toast.success('Staff deleted')
      setDeleteTarget(null)
    },
    onError: (e: Error) => {
      setDeleteTarget(null)
      toast.error(e.message)
    },
  })

  /* Dialog helpers */
  function openAdd() {
    setAddFields({ name: '', email: '', password: '', role: 'STAFF', commissionPct: '', branchIds: [] })
    setAddErrors({})
    setAddOpen(true)
  }

  function openEdit(u: StaffDTO) {
    setEditUser(u)
    setEditFields({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      commissionPct: u.commissionPct > 0 ? String(u.commissionPct) : '',
      branchIds: u.branchIds,
    })
    setEditErrors({})
  }

  function submitAdd() {
    const name = addFields.name.trim()
    const email = addFields.email.trim().toLowerCase()
    const errors: typeof addErrors = {}
    if (!name) errors.name = 'Name is required'
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email'
    if (addFields.password.length < 6) errors.password = 'At least 6 characters'
    const commission = parseCommission(addFields.commissionPct)
    if (typeof commission === 'object') errors.commissionPct = commission.error
    if (addFields.branchIds.length === 0) errors.branches = 'Assign at least one branch'
    setAddErrors(errors)
    if (Object.keys(errors).length > 0 || typeof commission === 'object') return
    createMut.mutate({
      name,
      email,
      password: addFields.password,
      role: addFields.role,
      commissionPct: commission,
      branchIds: addFields.branchIds,
    })
  }

  function submitEdit() {
    if (!editUser) return
    const name = editFields.name.trim()
    const errors: typeof editErrors = {}
    if (!name) errors.name = 'Name is required'
    const commission = parseCommission(editFields.commissionPct)
    if (typeof commission === 'object') errors.commissionPct = commission.error
    if (editFields.branchIds.length === 0) errors.branches = 'Assign at least one branch'
    setEditErrors(errors)
    if (Object.keys(errors).length > 0 || typeof commission === 'object') return
    updateMut.mutate({
      id: editUser.id,
      name,
      role: editFields.role,
      commissionPct: commission,
      branchIds: editFields.branchIds,
    })
  }

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Staff</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Who can log in, where they work and what they earn.
          </p>
        </div>
        <Button onClick={openAdd}>
          <UserPlus aria-hidden />
          Add Staff
        </Button>
      </div>

      {staffQ.isPending ? (
        <div className="mt-4 space-y-3 lg:mt-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : staffQ.isError ? (
        <div className="hairline mt-4 rounded-xl bg-card lg:mt-6">
          <EmptyState icon={DuoWarning} title="Could not load staff" hint={(staffQ.error as Error).message} />
          <div className="flex justify-center pb-6">
            <Button variant="outline" onClick={() => void staffQ.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      ) : users.length === 0 ? (
        <div className="hairline mt-4 rounded-xl bg-card lg:mt-6">
          <EmptyState
            icon={DuoUsers}
            title="No staff yet"
            hint="Add your first staff member — they sign in with their own email & password."
          />
          <div className="flex justify-center pb-6">
            <Button onClick={openAdd}>
              <UserPlus aria-hidden />
              Add Staff
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3 lg:mt-6">
          {users.map((u) => (
            <div key={u.id} className="hairline rounded-xl bg-card p-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full border bg-secondary text-sm font-bold text-secondary-foreground">
                  {initials(u.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{u.name}</p>
                    <RoleBadge role={u.role} />
                    {!u.active && (
                      <Badge className="border-transparent bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-950">
                        Inactive
                      </Badge>
                    )}
                    {u.commissionPct > 0 && (
                      <Badge className="tnum gap-1 border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-950">
                        <BadgePercent className="size-3" aria-hidden />
                        {u.commissionPct}%
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    {u.branchNames.length > 0 ? (
                      u.branchNames.map((n) => (
                        <span
                          key={n}
                          className="max-w-45 truncate rounded-full border bg-background px-1.5 py-px text-[11px] font-medium text-muted-foreground"
                          title={n}
                        >
                          {n.split('—')[1]?.trim() || n}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs italic text-muted-foreground">No branch access</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                  <div className="text-right">
                    <p className="tnum text-sm font-bold">{formatINR(u.revenueToday)}</p>
                    <p className="tnum text-[11px] text-muted-foreground">{u.billsToday} today</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 text-muted-foreground"
                    aria-label={`${u.name} shift report`}
                    title="Shift handover report"
                    onClick={() => setShiftTarget(u)}
                  >
                    <Clock3 />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 text-muted-foreground"
                    aria-label={`Edit ${u.name}`}
                    onClick={() => openEdit(u)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 text-destructive hover:text-destructive"
                    aria-label={`Delete ${u.name}`}
                    onClick={() => setDeleteTarget(u)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          <p className="flex items-start gap-2 pb-2 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Admins see reports for their whole franchise; staff only bill at branches you assign.
            Deactivating someone logs them out everywhere.
          </p>
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Staff</DialogTitle>
            <DialogDescription>They sign in with their own email and password.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                value={addFields.name}
                onChange={(e) => setAddFields((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Priya"
              />
              {addErrors.name && <p className="text-xs text-destructive">{addErrors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-email">Email (their login)</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="add-email"
                  type="email"
                  inputMode="email"
                  className="pl-9"
                  value={addFields.email}
                  onChange={(e) => setAddFields((f) => ({ ...f, email: e.target.value }))}
                  placeholder="priya@salon.com"
                  aria-invalid={!!addErrors.email}
                />
              </div>
              {addErrors.email && <p className="text-xs text-destructive">{addErrors.email}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-password">Password</Label>
                <Input
                  id="add-password"
                  type="text"
                  autoComplete="new-password"
                  value={addFields.password}
                  onChange={(e) => setAddFields((f) => ({ ...f, password: e.target.value }))}
                  placeholder="min 6 characters"
                  aria-invalid={!!addErrors.password}
                />
                {addErrors.password && <p className="text-xs text-destructive">{addErrors.password}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-role">Role</Label>
                <Select
                  value={addFields.role}
                  onValueChange={(v) => setAddFields((f) => ({ ...f, role: v as Role }))}
                >
                  <SelectTrigger id="add-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAFF">Staff — billing only</SelectItem>
                    <SelectItem value="ADMIN">Admin — reports & management</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-commission">
                Commission % <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="add-commission"
                  inputMode="decimal"
                  className="tnum pr-8"
                  value={addFields.commissionPct}
                  onChange={(e) => setAddFields((f) => ({ ...f, commissionPct: e.target.value }))}
                  placeholder="0"
                />
                <span className="absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              {addErrors.commissionPct && (
                <p className="text-xs text-destructive">{addErrors.commissionPct}</p>
              )}
            </div>
            <BranchPicker
              branches={franchiseBranches}
              value={addFields.branchIds}
              onChange={(branchIds) => setAddFields((f) => ({ ...f, branchIds }))}
              error={addErrors.branches}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={createMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitAdd} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Add staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {editUser?.name}</DialogTitle>
            <DialogDescription>Branch access, role and earnings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editFields.name}
                onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
              />
              {editErrors.name && <p className="text-xs text-destructive">{editErrors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Login</Label>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2.5">
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate text-sm font-medium">{editFields.email}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  Password resets via “Forgot password?”
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-role">Role</Label>
                <Select
                  value={editFields.role}
                  onValueChange={(v) => setEditFields((f) => ({ ...f, role: v as Role }))}
                >
                  <SelectTrigger id="edit-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAFF">Staff — billing only</SelectItem>
                    <SelectItem value="ADMIN">Admin — reports & management</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-commission">
                Commission % <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="edit-commission"
                  inputMode="decimal"
                  className="tnum pr-8"
                  value={editFields.commissionPct}
                  onChange={(e) => setEditFields((f) => ({ ...f, commissionPct: e.target.value }))}
                  placeholder="0"
                />
                <span className="absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              {editErrors.commissionPct && (
                <p className="text-xs text-destructive">{editErrors.commissionPct}</p>
              )}
            </div>
            <BranchPicker
              branches={franchiseBranches}
              value={editFields.branchIds}
              onChange={(branchIds) => setEditFields((f) => ({ ...f, branchIds }))}
              error={editErrors.branches}
            />
            {editUser?.active && (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">Deactivating logs them out everywhere.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => updateMut.mutate({ id: editUser!.id, active: false })}
                  disabled={updateMut.isPending}
                >
                  Deactivate
                </Button>
              </div>
            )}
            {!editUser?.active && (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Currently inactive</p>
                  <p className="text-xs text-muted-foreground">Reactivate to let them log in again.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateMut.mutate({ id: editUser!.id, active: true })}
                  disabled={updateMut.isPending}
                >
                  Activate
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)} disabled={updateMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={updateMut.isPending}>
              {updateMut.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              If this person has past bills, deactivate them instead so reports stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) deleteMut.mutate(deleteTarget.id)
              }}
              disabled={deleteMut.isPending}
              className={cn(buttonVariants({ variant: 'destructive' }))}
            >
              {deleteMut.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shift handover report */}
      <ShiftReportDialog
        staffId={shiftTarget?.id}
        staffName={shiftTarget?.name}
        open={!!shiftTarget}
        onOpenChange={(o) => !o && setShiftTarget(null)}
      />
    </div>
  )
}
