// src/renderer/a11y/useFocusTrap.ts
import { useEffect, useRef } from 'preact/hooks'

/**
 * Focus trap hook — traps Tab/Shift+Tab within a container.
 * Returns a ref to attach to the container element.
 * On mount, focuses the first focusable element.
 * On unmount, restores focus to the previously focused element.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null)
  const previousFocusRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!active || !containerRef.current) return

    previousFocusRef.current = document.activeElement

    const container = containerRef.current
    const focusable = getFocusableElements(container)
    if (focusable.length > 0) {
      ;(focusable[0] as HTMLElement).focus()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const elements = getFocusableElements(container)
      if (elements.length === 0) return

      const first = elements[0] as HTMLElement
      const last = elements[elements.length - 1] as HTMLElement

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      // Restore focus to previously focused element
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [active])

  return containerRef
}

function getFocusableElements(container: HTMLElement): NodeListOf<HTMLElement> {
  return container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
}
