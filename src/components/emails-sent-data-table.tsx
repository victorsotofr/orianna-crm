"use client"

import * as React from "react"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Mail,
  Building2,
  User,
  Calendar,
  RefreshCw,
} from "lucide-react"
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

interface EmailSentRow {
  id: string
  sent_at: string
  status: string
  sent_by_email: string | null
  contact_id: string
  contacts: {
    email: string
    first_name: string | null
    last_name: string | null
    company_name: string | null
  } | null
  templates: {
    name: string
  } | null
}

// Helper functions for status styling
const getStatusBadgeVariant = (status: string): "default" | "destructive" | "secondary" | "outline" => {
  switch (status) {
    case 'sent':
      return 'default'
    case 'failed':
      return 'destructive'
    case 'delivered':
      return 'default'
    case 'opened':
      return 'secondary'
    case 'replied':
      return 'secondary'
    default:
      return 'outline'
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'sent':
      return 'bg-green-500'
    case 'failed':
      return 'bg-red-500'
    case 'delivered':
      return 'bg-blue-500'
    case 'opened':
      return 'bg-yellow-500'
    case 'replied':
      return 'bg-purple-500'
    default:
      return 'bg-gray-500'
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'sent':
      return 'Envoyé'
    case 'failed':
      return 'Échec'
    case 'delivered':
      return 'Livré'
    case 'opened':
      return 'Ouvert'
    case 'replied':
      return 'Répondu'
    default:
      return status
  }
}

// Create columns definition
const columns: ColumnDef<EmailSentRow>[] = [
  {
    accessorKey: "contact",
    header: "Destinataire",
    cell: ({ row }) => {
      const contact = row.original.contacts
      if (!contact) return <span className="text-muted-foreground">—</span>
      
      return (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="font-medium">
              {contact.first_name} {contact.last_name}
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {contact.email}
            </div>
          </div>
        </div>
      )
    },
    enableHiding: false,
    filterFn: (row, id, value) => {
      const contact = row.original.contacts
      if (!contact) return false
      const searchLower = value.toLowerCase()
      return Boolean(
        contact.email?.toLowerCase().includes(searchLower) ||
        contact.first_name?.toLowerCase().includes(searchLower) ||
        contact.last_name?.toLowerCase().includes(searchLower)
      )
    },
  },
  {
    accessorKey: "company",
    header: "Entreprise",
    cell: ({ row }) => {
      const contact = row.original.contacts
      if (!contact || !contact.company_name) {
        return <span className="text-muted-foreground text-sm">—</span>
      }
      
      return (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span>{contact.company_name}</span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      const contact = row.original.contacts
      if (!contact || !contact.company_name) return false
      return Boolean(contact.company_name.toLowerCase().includes(value.toLowerCase()))
    },
  },
  {
    accessorKey: "status",
    header: "Statut",
    cell: ({ row }) => {
      const status = row.original.status
      const color = getStatusColor(status)
      
      return (
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${color}`} />
          <Badge variant={getStatusBadgeVariant(status)}>
            {getStatusLabel(status)}
          </Badge>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value === "all" || row.original.status === value
    },
  },
  {
    accessorKey: "sent_at",
    header: "Date d'envoi",
    cell: ({ row }) => {
      const date = new Date(row.original.sent_at)
      const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
      
      return (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">
              {format(date, 'dd MMM yyyy', { locale: fr })}
            </div>
            <div className="text-sm text-muted-foreground">
              {daysAgo === 0 ? "Aujourd'hui" : daysAgo === 1 ? "Il y a 1 jour" : `Il y a ${daysAgo} jours`}
            </div>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "sent_by_email",
    header: "Propriétaire",
    cell: ({ row }) => {
      const email = row.original.sent_by_email
      if (!email) {
        return <span className="text-muted-foreground text-sm">—</span>
      }
      
      // Extract name from email (part before @)
      const name = email.split('@')[0].replace(/[._-]/g, ' ')
      
      return (
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
            <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />
          </div>
          <div>
            <div className="text-sm font-medium capitalize">{name}</div>
            <div className="text-xs text-muted-foreground">{email}</div>
          </div>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      const email = row.original.sent_by_email
      if (!email) return false
      return Boolean(email.toLowerCase().includes(value.toLowerCase()))
    },
  },
  {
    id: "actions",
    header: "Action",
    cell: ({ row }) => {
      const date = new Date(row.original.sent_at)
      const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
      const shouldFollowUp = daysAgo >= 15 && row.original.status !== 'replied'
      
      if (!shouldFollowUp) {
        return <span className="text-muted-foreground text-xs">—</span>
      }
      
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => {
            // TODO: Implement follow-up logic
            console.log('Follow up with contact:', row.original.contact_id)
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Relancer
        </Button>
      )
    },
    enableSorting: false,
    enableHiding: false,
  },
]

interface EmailsSentDataTableProps {
  data: EmailSentRow[]
}

export function EmailsSentDataTable({ data }: EmailsSentDataTableProps) {
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([
    {
      id: 'sent_at',
      desc: true, // Most recent first
    },
  ])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      pagination,
      globalFilter,
    },
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    globalFilterFn: (row, columnId, filterValue) => {
      const contact = row.original.contacts
      const template = row.original.templates
      if (!filterValue) return true
      
      const searchLower = filterValue.toLowerCase()
      return Boolean(
        contact?.email?.toLowerCase().includes(searchLower) ||
        contact?.first_name?.toLowerCase().includes(searchLower) ||
        contact?.last_name?.toLowerCase().includes(searchLower) ||
        contact?.company_name?.toLowerCase().includes(searchLower) ||
        template?.name?.toLowerCase().includes(searchLower)
      )
    },
  })

  // Apply status filter
  React.useEffect(() => {
    if (statusFilter === "all") {
      table.getColumn("status")?.setFilterValue(undefined)
    } else {
      table.getColumn("status")?.setFilterValue(statusFilter)
    }
  }, [statusFilter, table])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Rechercher par nom, email, entreprise..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="sent">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  Envoyé
                </div>
              </SelectItem>
              <SelectItem value="delivered">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  Livré
                </div>
              </SelectItem>
              <SelectItem value="opened">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  Ouvert
                </div>
              </SelectItem>
              <SelectItem value="failed">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  Échec
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="h-4 w-4 mr-2" />
                <span className="hidden lg:inline">Colonnes</span>
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  Aucun email envoyé pour le moment.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
          {table.getFilteredRowModel().rows.length} email(s) au total.
        </div>
        <div className="flex w-full items-center gap-4 lg:w-fit">
          <div className="hidden items-center gap-2 lg:flex">
            <Label htmlFor="rows-per-page" className="text-sm font-medium whitespace-nowrap">
              Lignes par page
            </Label>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value))
              }}
            >
              <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                <SelectValue
                  placeholder={table.getState().pagination.pageSize}
                />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 50, 100].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-fit items-center justify-center text-sm font-medium whitespace-nowrap">
            Page {table.getState().pagination.pageIndex + 1} sur{" "}
            {table.getPageCount()}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden size-8 lg:flex"
              size="icon"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

