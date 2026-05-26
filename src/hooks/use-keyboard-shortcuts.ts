import { useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'

interface Shortcut {
  key: string
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
  action: () => void
  description: string
}

export function useKeyboardShortcuts() {
  const router = useRouter()

  const shortcuts: Shortcut[] = useMemo(() => [
    { key: 'l', meta: true, shift: true, action: () => router.push('/launch'), description: 'Aller au lancement' },
    { key: 'd', meta: true, shift: true, action: () => router.push('/outbound'), description: 'Aller au control' },
    { key: 'c', meta: true, shift: true, action: () => router.push('/contacts'), description: 'Aller aux contacts' },
    { key: 'i', meta: true, shift: true, action: () => router.push('/conversations'), description: 'Aller aux conversations' },
    { key: ',', meta: true, action: () => router.push('/settings'), description: 'Ouvrir les paramètres' },
  ], [router])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      return
    }

    for (const shortcut of shortcuts) {
      const metaMatch = shortcut.meta ? (event.metaKey || event.ctrlKey) : true
      const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()

      if (metaMatch && shiftMatch && keyMatch) {
        event.preventDefault()
        shortcut.action()
        return
      }
    }
  }, [shortcuts])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return shortcuts
}
