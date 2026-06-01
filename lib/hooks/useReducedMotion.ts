'use client'

import { useEffect, useState } from 'react'

// Reactive `prefers-reduced-motion: reduce` matcher. Returns true when the
// user has requested reduced motion at the OS / browser level.
// SSR-safe: defaults to false during server-render; updates after mount.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    function onChange(ev: MediaQueryListEvent) {
      setReduced(ev.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
