'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronDown,
  FolderPlus,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api-client'
import { formatINR } from '@/lib/format'
import type { FranchiseCategoryDTO, FranchiseMenuResponse, FranchiseServiceDTO } from '@/lib/types'
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
import { EmptyState } from './ui-atoms'

interface ServiceFields {
  name: string
  price: string
  durationMin: string
  categoryId: string
  active: boolean
}

interface CategoryFields {
  name: string
  sortOrder: string
}

interface DeleteTarget {
  type: 'service' | 'category'
  id: string
  name: string
}

/** Effective override state for one service × branch pair. */
function overrideOf(s: FranchiseServiceDTO, branchId: string) {
  return s.overrides.find((o) => o.branchId === branchId) ?? null
}

export default function ServicesView() {
  const qc = useQueryClient()
  const menuQ = useQuery({
    queryKey: ['franchise-menu'],
    queryFn: () => apiGet<FranchiseMenuResponse>('/api/catalog/franchise'),
  })
  const categories = menuQ.data?.categories ?? []
  const branches = menuQ.data?.branches ?? []
  const totalServices = categories.reduce((n, c) => n + c.services.length, 0)
  const totalOverrides = categories.reduce(
    (n, c) => n + c.services.reduce((m, s) => m + s.overrides.length, 0),
    0,
  )

  /** Expanded "branch pricing" rows — serviceId in this Set. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /* Dialog state */
  const [svcOpen, setSvcOpen] = useState(false)
  const [svcEditId, setSvcEditId] = useState<string | null>(null)
  const [svcFields, setSvcFields] = useState<ServiceFields>({ name: '', price: '', durationMin: '', categoryId: '', active: true })
  const [svcErrors, setSvcErrors] = useState<{ name?: string; price?: string }>({})

  const [catOpen, setCatOpen] = useState(false)
  const [catEditId, setCatEditId] = useState<string | null>(null)
  const [catFields, setCatFields] = useState<CategoryFields>({ name: '', sortOrder: '' })
  const [catError, setCatError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  /* Mutations */
  const invalidateMenu = () => {
    void qc.invalidateQueries({ queryKey: ['franchise-menu'] })
    void qc.invalidateQueries({ queryKey: ['catalog'] })
  }

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => apiPut('/api/catalog/service', v),
    onSuccess: (_d, v) => {
      void invalidateMenu()
      toast.success(v.active ? 'Service activated' : 'Service deactivated')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const saveServiceMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      body.id ? apiPut('/api/catalog/service', body) : apiPost('/api/catalog/service', body),
    onSuccess: (_d, body) => {
      void invalidateMenu()
      toast.success(body.id ? 'Service updated' : 'Service added')
      setSvcOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const saveCategoryMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      body.id ? apiPut('/api/catalog/category', body) : apiPost('/api/catalog/category', body),
    onSuccess: (_d, body) => {
      void invalidateMenu()
      toast.success(body.id ? 'Category updated' : 'Category added')
      setCatOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (t: DeleteTarget) =>
      t.type === 'category'
        ? apiDelete(`/api/catalog/category?id=${t.id}`)
        : apiDelete(`/api/catalog/service?id=${t.id}`),
    onSuccess: (_d, t) => {
      void invalidateMenu()
      toast.success(t.type === 'category' ? 'Category deleted' : 'Service deleted')
      setDeleteTarget(null)
    },
    onError: (e: Error, t) => {
      setDeleteTarget(null)
      if (t.type === 'service' && e.message.toLowerCase().includes('deactivate')) {
        toast.error(e.message, {
          action: { label: 'Deactivate', onClick: () => toggleMut.mutate({ id: t.id, active: false }) },
        })
      } else {
        toast.error(e.message)
      }
    },
  })

  /** Upsert a per-branch price override. `null` price = inherit (delete the row). */
  const priceOverrideMut = useMutation({
    mutationFn: (v: { serviceId: string; branchId: string; price: number | null; name: string; branchName: string }) =>
      v.price === null
        ? apiDelete(`/api/catalog/override?serviceId=${v.serviceId}&branchId=${v.branchId}`)
        : apiPost('/api/catalog/override', { serviceId: v.serviceId, branchId: v.branchId, price: v.price }),
    onSuccess: (_d, v) => {
      void invalidateMenu()
      if (v.price === null) toast.success(`${v.branchName} inherits the franchise price again`)
      else toast.success(`${v.name} → ${formatINR(v.price)} at ${v.branchName}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  /** Toggle a service's availability at ONE branch (branch-level inactive). */
  const availabilityMut = useMutation({
    mutationFn: (v: { serviceId: string; branchId: string; active: boolean; name: string; branchName: string }) =>
      apiPost('/api/catalog/override', { serviceId: v.serviceId, branchId: v.branchId, active: v.active }),
    onSuccess: (_d, v) => {
      void invalidateMenu()
      toast.success(`${v.name} ${v.active ? 'available' : 'hidden'} at ${v.branchName}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  /* Dialog openers */
  function openAddService() {
    setSvcFields({ name: '', price: '', durationMin: '', categoryId: categories[0]?.id ?? '', active: true })
    setSvcErrors({})
    setSvcEditId(null)
    setSvcOpen(true)
  }

  function openEditService(s: FranchiseServiceDTO) {
    setSvcFields({
      name: s.name,
      price: String(s.price),
      durationMin: s.durationMin != null ? String(s.durationMin) : '',
      categoryId: s.categoryId,
      active: s.active,
    })
    setSvcErrors({})
    setSvcEditId(s.id)
    setSvcOpen(true)
  }

  function openAddCategory() {
    setCatFields({ name: '', sortOrder: '' })
    setCatError('')
    setCatEditId(null)
    setCatOpen(true)
  }

  function openEditCategory(c: FranchiseCategoryDTO) {
    setCatFields({ name: c.name, sortOrder: String(c.sortOrder) })
    setCatError('')
    setCatEditId(c.id)
    setCatOpen(true)
  }

  /* Submits */
  function submitService() {
    const name = svcFields.name.trim()
    const price = Number(svcFields.price)
    const errors: { name?: string; price?: string } = {}
    if (!name) errors.name = 'Name is required'
    if (!svcFields.price || Number.isNaN(price) || price <= 0) errors.price = 'Enter a price above ₹0'
    setSvcErrors(errors)
    if (Object.keys(errors).length > 0) return
    if (!svcFields.categoryId) {
      toast.error('Choose a category first')
      return
    }

    const body: Record<string, unknown> = {
      name,
      price,
      categoryId: svcFields.categoryId,
    }
    if (svcFields.durationMin) body.durationMin = Number(svcFields.durationMin)
    if (svcEditId) {
      body.id = svcEditId
      body.active = svcFields.active
    }
    saveServiceMut.mutate(body)
  }

  function submitCategory() {
    const name = catFields.name.trim()
    if (!name) {
      setCatError('Name is required')
      return
    }
    const body: Record<string, unknown> = { name }
    if (catFields.sortOrder) body.sortOrder = Number(catFields.sortOrder)
    if (catEditId) body.id = catEditId
    saveCategoryMut.mutate(body)
  }

  const editingService = svcEditId != null

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Menu & Prices</h1>
            {menuQ.data && <Badge variant="secondary">{totalServices} services</Badge>}
            {totalOverrides > 0 && (
              <Badge className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/10">
                {totalOverrides} custom prices
              </Badge>
            )}
          </div>
          <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
            The franchise menu applies everywhere. Branches inherit these prices — open a
            service to give one branch its own price or hide it there.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openAddCategory}>
            <FolderPlus aria-hidden />
            Add Category
          </Button>
          <Button onClick={openAddService}>
            <Plus aria-hidden />
            Add Service
          </Button>
        </div>
      </div>

      {menuQ.isPending ? (
        <div className="mt-4 space-y-4 lg:mt-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : menuQ.isError ? (
        <div className="hairline mt-4 rounded-xl bg-card lg:mt-6">
          <EmptyState icon={AlertTriangle} title="Could not load the menu" hint={(menuQ.error as Error).message} />
          <div className="flex justify-center pb-6">
            <Button variant="outline" onClick={() => void menuQ.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      ) : categories.length === 0 ? (
        <div className="hairline mt-4 rounded-xl bg-card lg:mt-6">
          <EmptyState
            icon={Sparkles}
            title="No categories yet"
            hint="Create your first category, then add services to it."
          />
          <div className="flex justify-center pb-6">
            <Button onClick={openAddCategory}>
              <FolderPlus aria-hidden />
              Add Category
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4 lg:mt-6">
          {categories.map((c) => (
            <Collapsible key={c.id} defaultOpen className="hairline overflow-hidden rounded-xl bg-card">
              <div className="flex items-center gap-1 px-2 py-2 sm:px-3">
                <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent/60">
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden
                  />
                  <p className="truncate font-semibold">{c.name}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{c.services.length} services</span>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground"
                  aria-label={`Edit ${c.name} category`}
                  onClick={() => openEditCategory(c)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-destructive hover:text-destructive"
                  aria-label={`Delete ${c.name} category`}
                  onClick={() => setDeleteTarget({ type: 'category', id: c.id, name: c.name })}
                >
                  <Trash2 />
                </Button>
              </div>
              <CollapsibleContent>
                <div className="divide-y border-t">
                  {c.services.length === 0 ? (
                    <p className="px-4 py-5 text-center text-xs text-muted-foreground">
                      No services yet — add the first one.
                    </p>
                  ) : (
                    c.services.map((s) => {
                      const isOpen = expanded.has(s.id)
                      return (
                        <div key={s.id}>
                          <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="truncate text-sm font-medium">{s.name}</p>
                                {!s.active && (
                                  <Badge className="border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-950">
                                    Inactive
                                  </Badge>
                                )}
                                {s.overrides.length > 0 && (
                                  <Badge className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/10">
                                    {s.overrides.length} custom
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {s.durationMin != null ? `${s.durationMin} min` : 'No fixed duration'}
                              </p>
                            </div>
                            <p className="tnum shrink-0 text-sm font-bold text-primary">
                              {formatINR(s.price)}
                              <span className="ml-1 hidden text-[10px] font-medium text-muted-foreground sm:inline">
                                default
                              </span>
                            </p>
                            <Switch
                              checked={s.active}
                              disabled={toggleMut.isPending && toggleMut.variables?.id === s.id}
                              onCheckedChange={(v) => toggleMut.mutate({ id: s.id, active: v })}
                              aria-label={s.active ? `Deactivate ${s.name}` : `Activate ${s.name}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0 text-muted-foreground"
                              aria-label={`Edit ${s.name}`}
                              onClick={() => openEditService(s)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0 text-destructive hover:text-destructive"
                              aria-label={`Delete ${s.name}`}
                              onClick={() => setDeleteTarget({ type: 'service', id: s.id, name: s.name })}
                            >
                              <Trash2 />
                            </Button>
                            {branches.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  'h-8 shrink-0 gap-1 text-xs',
                                  isOpen && 'bg-accent text-accent-foreground',
                                )}
                                aria-expanded={isOpen}
                                aria-label={`Branch pricing for ${s.name}`}
                                onClick={() => toggleExpanded(s.id)}
                              >
                                <MapPin className="size-3.5" aria-hidden />
                                <span className="hidden sm:inline">Branches</span>
                                <ChevronDown
                                  className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')}
                                  aria-hidden
                                />
                              </Button>
                            )}
                          </div>

                          {/* Per-branch pricing panel */}
                          {isOpen && (
                            <div className="border-t bg-muted/40 px-3 py-3 sm:px-4">
                              <p className="micro mb-2 text-muted-foreground">
                                Prices & availability per branch
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {branches.map((b) => {
                                  const ov = overrideOf(s, b.id)
                                  const effectiveActive = ov?.active ?? s.active
                                  const short = b.name.split('—')[1]?.trim() || b.name
                                  return (
                                    <div
                                      key={b.id}
                                      className={cn(
                                        'rounded-lg border bg-card p-2.5',
                                        !effectiveActive && 'opacity-70',
                                      )}
                                    >
                                      <div className="flex items-center gap-2">
                                        <p className="min-w-0 flex-1 truncate text-xs font-semibold" title={b.name}>
                                          {short}
                                          {b.city && (
                                            <span className="ml-1 font-normal text-muted-foreground">· {b.city}</span>
                                          )}
                                        </p>
                                        <Switch
                                          checked={effectiveActive}
                                          disabled={availabilityMut.isPending}
                                          onCheckedChange={(v) =>
                                            availabilityMut.mutate({
                                              serviceId: s.id,
                                              branchId: b.id,
                                              active: v,
                                              name: s.name,
                                              branchName: short,
                                            })
                                          }
                                          aria-label={`${s.name} available at ${b.name}`}
                                        />
                                      </div>
                                      <div className="mt-2 flex items-center gap-1.5">
                                        <div className="relative min-w-0 flex-1">
                                          <span className="absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">
                                            ₹
                                          </span>
                                          <BranchPriceInput
                                            key={`${s.id}-${b.id}-${ov?.price ?? 'default'}`}
                                            defaultValue={ov?.price != null ? String(ov.price) : ''}
                                            placeholder={String(s.price)}
                                            disabled={priceOverrideMut.isPending}
                                            onCommit={(raw) => {
                                              const trimmed = raw.trim()
                                              if (trimmed === '') {
                                                // empty = inherit the franchise default
                                                if (ov) {
                                                  priceOverrideMut.mutate({
                                                    serviceId: s.id,
                                                    branchId: b.id,
                                                    price: null,
                                                    name: s.name,
                                                    branchName: short,
                                                  })
                                                }
                                                return
                                              }
                                              const num = Number(trimmed)
                                              if (Number.isNaN(num) || num <= 0) {
                                                toast.error('Enter a price above ₹0')
                                                return
                                              }
                                              if (num === s.price && ov) {
                                                // same as franchise default → drop the override
                                                priceOverrideMut.mutate({
                                                  serviceId: s.id,
                                                  branchId: b.id,
                                                  price: null,
                                                  name: s.name,
                                                  branchName: short,
                                                })
                                                return
                                              }
                                              if (num !== (ov?.price ?? s.price)) {
                                                priceOverrideMut.mutate({
                                                  serviceId: s.id,
                                                  branchId: b.id,
                                                  price: num,
                                                  name: s.name,
                                                  branchName: short,
                                                })
                                              }
                                            }}
                                          />
                                        </div>
                                        {ov?.price != null && (
                                          <button
                                            type="button"
                                            aria-label={`Reset ${s.name} price at ${b.name} to franchise default`}
                                            title="Reset to franchise default"
                                            onClick={() =>
                                              priceOverrideMut.mutate({
                                                serviceId: s.id,
                                                branchId: b.id,
                                                price: null,
                                                name: s.name,
                                                branchName: short,
                                              })
                                            }
                                            className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:text-foreground"
                                          >
                                            <RotateCcw className="size-3.5" aria-hidden />
                                          </button>
                                        )}
                                      </div>
                                      <p className="mt-1 text-[10px] text-muted-foreground">
                                        {ov?.price != null ? (
                                          <>
                                            Custom price · franchise default {formatINR(s.price)}
                                          </>
                                        ) : (
                                          <>Inherits {formatINR(s.price)} (franchise default)</>
                                        )}
                                      </p>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Service dialog */}
      <Dialog open={svcOpen} onOpenChange={setSvcOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingService ? 'Edit Service' : 'Add Service'}</DialogTitle>
            <DialogDescription>
              {editingService
                ? 'The price here is the franchise default — branches can override it. Past bills keep their prices.'
                : 'New services are active everywhere immediately and show up in billing.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="svc-name">Name</Label>
              <Input
                id="svc-name"
                value={svcFields.name}
                onChange={(e) => setSvcFields((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Haircut"
              />
              {svcErrors.name && <p className="text-xs text-destructive">{svcErrors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="svc-price">Franchise price</Label>
                <div className="relative">
                  <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                    ₹
                  </span>
                  <Input
                    id="svc-price"
                    inputMode="decimal"
                    className="tnum pl-6"
                    value={svcFields.price}
                    onChange={(e) => setSvcFields((f) => ({ ...f, price: e.target.value }))}
                    placeholder="250"
                    aria-invalid={!!svcErrors.price}
                  />
                </div>
                {svcErrors.price && <p className="text-xs text-destructive">{svcErrors.price}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-duration">
                  Duration <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <div className="relative">
                  <Input
                    id="svc-duration"
                    inputMode="numeric"
                    className="tnum pr-14"
                    value={svcFields.durationMin}
                    onChange={(e) => setSvcFields((f) => ({ ...f, durationMin: e.target.value }))}
                    placeholder="30"
                  />
                  <span className="absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
                    minutes
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-category">Category</Label>
              <Select
                value={svcFields.categoryId}
                onValueChange={(v) => setSvcFields((f) => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger id="svc-category" className="w-full">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingService && (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Active (franchise default)</p>
                  <p className="text-xs text-muted-foreground">Hidden services stay hidden unless a branch overrides it.</p>
                </div>
                <Switch
                  checked={svcFields.active}
                  onCheckedChange={(v) => setSvcFields((f) => ({ ...f, active: v }))}
                  aria-label="Service active"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSvcOpen(false)} disabled={saveServiceMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitService} disabled={saveServiceMut.isPending}>
              {saveServiceMut.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {editingService ? 'Save changes' : 'Add service'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category dialog */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{catEditId ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>
              Categories group services on the billing screen — e.g. Hair, Beard, Spa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={catFields.name}
                onChange={(e) => setCatFields((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Hair Care"
              />
              {catError && <p className="text-xs text-destructive">{catError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-sort">
                Sort order <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="cat-sort"
                type="number"
                className="tnum"
                value={catFields.sortOrder}
                onChange={(e) => setCatFields((f) => ({ ...f, sortOrder: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatOpen(false)} disabled={saveCategoryMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitCategory} disabled={saveCategoryMut.isPending}>
              {saveCategoryMut.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {catEditId ? 'Save changes' : 'Add category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === 'category' ? 'category' : 'service'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'category'
                ? `"${deleteTarget?.name}" will be removed from your menu. Categories that still have services cannot be deleted.`
                : `"${deleteTarget?.name}" will be removed from your menu. If it appears in past bills, deactivate it instead so reports stay intact.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) deleteMut.mutate(deleteTarget)
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
    </div>
  )
}

/**
 * Uncontrolled numeric input that commits on blur or Enter. `key` remounts it
 * whenever the underlying override changes so the displayed value stays true.
 */
function BranchPriceInput({
  defaultValue,
  placeholder,
  disabled,
  onCommit,
}: {
  defaultValue: string
  placeholder: string
  disabled: boolean
  onCommit: (raw: string) => void
}) {
  const [value, setValue] = useState(defaultValue)
  return (
    <Input
      inputMode="decimal"
      className="tnum h-8 pl-6 text-xs"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      aria-label="Branch price override — empty inherits the franchise price"
    />
  )
}
