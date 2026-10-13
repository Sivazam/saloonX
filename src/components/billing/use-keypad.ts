'use client'

import { useCallback, useRef, useState } from 'react'

export interface KeypadState {
  digits: string
  isFull: boolean
  press: (digit: string) => void
  backspace: () => void
  clear: () => void
}

/**
 * Shared numeric keypad state (used by the customer mobile step).
 * `onFull` fires once when the entry reaches `maxLength` (event-driven,
 * no effects), so the caller can auto-trigger a lookup.
 *
 * State is mirrored in a ref so that presses never read a stale `digits`
 * value — this keeps the keypad correct even when multiple presses land
 * in the same tick (fast two-finger taps, automation, etc.).
 */
export function useKeypad(maxLength = 10, onFull?: (digits: string) => void): KeypadState {
  const [digits, setDigits] = useState('')
  const digitsRef = useRef('')

  const setSafe = useCallback((next: string) => {
    digitsRef.current = next
    setDigits(next)
  }, [])

  const press = useCallback(
    (digit: string) => {
      const s = digitsRef.current
      if (s.length >= maxLength) return
      const next = s + digit
      setSafe(next)
      if (next.length === maxLength) onFull?.(next)
    },
    [maxLength, onFull, setSafe],
  )

  const backspace = useCallback(() => {
    setSafe(digitsRef.current.slice(0, -1))
  }, [setSafe])

  const clear = useCallback(() => setSafe(''), [setSafe])

  return { digits, isFull: digits.length >= maxLength, press, backspace, clear }
}

/** "9876543210" -> "98765 43210" for the big display box. */
export function formatMobileDisplay(digits: string): string {
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)} ${digits.slice(5)}`
}
