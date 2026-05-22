"use client"

import * as React from "react"
import { useState, useEffect, useMemo } from "react"
import { usePathname } from "next/navigation"
import {
  Home,
  Users,
  FileText,
  Send,
  Settings,
  Bot,
  GalleryVerticalEnd,
  MessageSquarePlus,
  ChevronsUpDown,
  Plus,
  Check,
  Reply,
  MoreHorizontal,
  MessageSquareText,
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
  const [followUpCount, setFollowUpCount] = useState(0)
  const [unreadConversations, setUnreadConversations] = useState(0)
  const pathname = usePathname()
  const { t } = useTranslation()
  const { workspace, workspaces, switchWorkspace } = useWorkspace()

  useEffect(() => {
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
  }, [workspace?.id])

  useEffect(() => {
    if (!workspace?.id) {
      return
    }

    const fetchFollowUpCount = async () => {
      const todayStr = new Date().toISOString().split('T')[0]

      const [tab1, tab2] = await Promise.all([
        supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id)
          .eq('status', 'contacted')
          .not('first_contact', 'is', null)
          .is('second_contact', null)
          .lte('follow_up_1', todayStr),
        supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id)
          .eq('status', 'contacted')
          .not('second_contact', 'is', null)
          .is('third_contact', null)
          .lte('follow_up_2', todayStr),
      ])

      setFollowUpCount((tab1.count ?? 0) + (tab2.count ?? 0))
    }

    fetchFollowUpCount()
    // Refresh every 5 minutes
    const interval = setInterval(fetchFollowUpCount, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [workspace?.id])

  const navMain = useMemo(() => [
    {
      title: t.sidebar.agent,
      url: "/outbound",
      icon: Bot,
    },
    {
      title: t.sidebar.contacts,
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

  const moreItems = useMemo(() => [
    {
      title: t.sidebar.dashboard,
      url: "/dashboard",
      icon: Home,
    },
    {
      title: t.sidebar.campaigns,
      url: "/campaigns",
      icon: Send,
    },
    {
      title: t.sidebar.followUps,
      url: "/follow-ups",
      icon: Reply,
      badge: followUpCount,
    },
    {
      title: t.sidebar.templates,
      url: "/templates",
      icon: FileText,
    },
  ], [t, followUpCount])

  const moreActive = moreItems.some((item) => pathname === item.url || pathname.startsWith(item.url + '/'))
    || pathname === '/settings'
    || pathname.startsWith('/settings/')

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
          <SidebarMenu className="px-2">
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton tooltip={t.sidebar.more} isActive={moreActive}>
                    <MoreHorizontal className="size-4" />
                    <span>{t.sidebar.more}</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-56">
                  {moreItems.map((item) => (
                    <DropdownMenuItem key={item.url} asChild>
                      <a href={item.url} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <item.icon className="size-4 shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </span>
                        {item.badge != null && item.badge > 0 && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                            {item.badge}
                          </span>
                        )}
                      </a>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
                    <MessageSquarePlus className="size-4" />
                    {t.sidebar.feedback}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="/settings">
                      <Settings className="size-4" />
                      {t.sidebar.settings}
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  )
}
