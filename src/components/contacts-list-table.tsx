"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Mail,
  Building2,
  User,
  Phone,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { Badge } from "@/components/ui/badge"
import { ContactStatusBadge } from "@/components/contact-status-badge"
import { Contact } from "@/types/database"

const columns: ColumnDef<Contact>[] = [
  {
    accessorKey: "first_name",
    header: "Contact",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="font-medium">
            {row.original.first_name || ""} {row.original.last_name || ""}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {row.original.email}
          </div>
        </div>
      </div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "company_name",
    header: "Entreprise",
    cell: ({ row }) =>
      row.original.company_name ? (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span>{row.original.company_name}</span>
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">&mdash;</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Statut",
    cell: ({ row }) => <ContactStatusBadge status={row.original.status || "new"} />,
  },
  {
    accessorKey: "location",
    header: "Ville",
    cell: ({ row }) => {
      if (!row.original.location) return <span className="text-muted-foreground text-sm">&mdash;</span>
      return <span className="text-sm">{row.original.location}</span>
    },
  },
  {
    accessorKey: "phone",
    header: "Téléphone",
    cell: ({ row }) =>
      row.original.phone ? (
        <div className="flex items-center gap-1 text-sm">
          <Phone className="h-3 w-3 text-muted-foreground" />
          {row.original.phone}
        </div>
      ) : (
        <span className="text-muted-foreground text-sm">&mdash;</span>
      ),
  },
]

interface ContactsListTableProps {
  data: Contact[]
  statusFilter: string
  onStatusFilterChange: (value: string) => void
}

export function ContactsListTable({ data, statusFilter, onStatusFilterChange }: ContactsListTableProps) {
  const router = useRouter()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 })

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Input
          placeholder="Rechercher..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="new">Nouveau</SelectItem>
            <SelectItem value="contacted">Contacté</SelectItem>
            <SelectItem value="replied">Répondu</SelectItem>
            <SelectItem value="qualified">Qualifié</SelectItem>
            <SelectItem value="unqualified">Non qualifié</SelectItem>
            <SelectItem value="do_not_contact">Ne pas contacter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/contacts/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Aucun contact trouvé.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="text-muted-foreground text-sm">
          {table.getFilteredRowModel().rows.length} contact(s)
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 lg:flex">
            <Label className="text-sm whitespace-nowrap">Lignes par page</Label>
            <Select
              value={`${pagination.pageSize}`}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[20, 50, 100].map((size) => (
                  <SelectItem key={size} value={`${size}`}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm whitespace-nowrap">
            Page {pagination.pageIndex + 1} sur {table.getPageCount() || 1}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
