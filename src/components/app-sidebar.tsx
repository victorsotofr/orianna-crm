"use client"

import * as React from "react"
import { useState, useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import {
  Users,
  Settings,
  Bot,
  GalleryVerticalEnd,
  MessageSquarePlus,
  ChevronsUpDown,
  Plus,
  Check,
  MessageSquareText,
  Rocket,
  Loader2,
  CalendarClock,
  History,
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
import { supabase } from "@/lib/supabase"
import { isE2EMockMode } from "@/lib/e2e-mock"

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
  const [unreadConversations, setUnreadConversations] = useState(0)
  const [runningOutreachTasks, setRunningOutreachTasks] = useState(0)
  const pathname = usePathname()
  const { t } = useTranslation()
  const { workspace, workspaces, switchWorkspace } = useWorkspace()
  const mockMode = isE2EMockMode()

  useEffect(() => {
    if (mockMode) return
    if (!workspace?.id) {
      return
    }

    const fetchUnreadConversations = async () => {
      const { count } = await supabase
        .from('mailbox_threads')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace.id)
        .gt('unread_count', 0)

      setUnreadConversations(count ?? 0)
    }

    fetchUnreadConversations()
    const interval = setInterval(fetchUnreadConversations, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [mockMode, workspace?.id])

  useEffect(() => {
    if (mockMode) return
    if (!workspace?.id) {
      return
    }

    const fetchRunningTasks = async () => {
      const { count, error } = await supabase
        .from('outreach_session_events')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace.id)
        .eq('status', 'running')

      if (!error) setRunningOutreachTasks(count ?? 0)
    }

    fetchRunningTasks()
    const interval = setInterval(fetchRunningTasks, 30 * 1000)
    return () => clearInterval(interval)
  }, [mockMode, workspace?.id])

  const navMain = useMemo(() => [
    {
      title: t.sidebar.launch,
      url: "/launch",
      icon: Rocket,
    },
    {
      title: t.sidebar.threads,
      url: "/threads",
      icon: History,
    },
    {
      title: t.sidebar.control,
      url: "/outbound",
      icon: Bot,
    },
    {
      title: t.sidebar.automations,
      url: "/automations",
      icon: CalendarClock,
    },
    {
      title: t.sidebar.people,
      url: "/contacts",
      icon: Users,
    },
    {
      title: t.sidebar.inbox,
      url: "/conversations",
      icon: MessageSquareText,
      badge: unreadConversations,
    },
  ], [t, unreadConversations])

  const settingsActive = pathname === '/settings' || pathname.startsWith('/settings/')

  const showSwitcher = workspaces.length > 0

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
            {runningOutreachTasks > 0 && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={t.sidebar.outreachRunning}>
                  <a href="/launch">
                    <Loader2 className="size-4 animate-spin text-emerald-700" />
                    <span>{t.sidebar.outreachRunning}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
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
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={t.sidebar.settings} isActive={settingsActive}>
                <a href="/settings">
                  <Settings className="size-4" />
                  <span>{t.sidebar.settings}</span>
                </a>
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
