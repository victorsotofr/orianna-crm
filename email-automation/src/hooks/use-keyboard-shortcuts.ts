import { useEffect, useCallback } from 'react'
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

  const shortcuts: Shortcut[] = [
    { key: 'd', meta: true, shift: true, action: () => router.push('/dashboard'), description: 'Aller au dashboard' },
    { key: 'c', meta: true, shift: true, action: () => router.push('/contacts'), description: 'Aller aux contacts' },
    { key: 's', meta: true, shift: true, action: () => router.push('/sequences'), description: 'Aller aux séquences' },
    { key: 't', meta: true, shift: true, action: () => router.push('/templates'), description: 'Aller aux templates' },
    { key: ',', meta: true, action: () => router.push('/settings'), description: 'Ouvrir les paramètres' },
  ]

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
