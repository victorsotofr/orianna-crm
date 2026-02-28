"use client"

import * as React from "react"
import { useState } from "react"
import {
  Home,
  Users,
  FileText,
  Send,
  Settings,
  GalleryVerticalEnd,
  MessageSquarePlus,
  ChevronsUpDown,
  Plus,
  Check,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { FeedbackModal } from "@/components/feedback-modal"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTranslation } from "@/lib/i18n"
import { useWorkspace } from "@/lib/workspace-context"

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: {
    name: string
    email: string
    avatar?: string
  }
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const { t } = useTranslation()
  const { workspace, workspaces, switchWorkspace } = useWorkspace()

  const navMain = [
    {
      title: t.sidebar.dashboard,
      url: "/dashboard",
      icon: Home,
    },
    {
      title: t.sidebar.contacts,
      url: "/contacts",
      icon: Users,
    },
    {
      title: t.sidebar.campaigns,
      url: "/campaigns",
      icon: Send,
    },
    {
      title: t.sidebar.templates,
      url: "/templates",
      icon: FileText,
    },
    {
      title: t.sidebar.settings,
      url: "/settings",
      icon: Settings,
    },
  ]

  const showSwitcher = workspaces.length > 1

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader>
          {showSwitcher ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-2 py-2 w-full rounded-md hover:bg-accent transition-colors">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
                    <GalleryVerticalEnd className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{workspace?.name || 'Orianna'}</span>
                    <span className="truncate text-xs text-muted-foreground">CRM</span>
                  </div>
                  <ChevronsUpDown className="size-4 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {workspaces.map((ws) => (
                  <DropdownMenuItem
                    key={ws.id}
                    onClick={() => switchWorkspace(ws.id)}
                    className="flex items-center justify-between"
                  >
                    <span>{ws.name}</span>
                    {ws.id === workspace?.id && <Check className="size-4" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/create-workspace" className="flex items-center gap-2">
                    <Plus className="size-4" />
                    {t.workspace.createNew}
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <GalleryVerticalEnd className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{workspace?.name || 'Orianna'}</span>
                <span className="truncate text-xs text-muted-foreground">CRM</span>
              </div>
            </div>
          )}
        </SidebarHeader>
        <SidebarContent>
          <NavMain items={navMain} />
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setFeedbackOpen(true)}
                tooltip={t.sidebar.feedback}
                className="bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50"
              >
                <MessageSquarePlus className="size-4" />
                <span>{t.sidebar.feedback}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <NavUser user={user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  )
}
