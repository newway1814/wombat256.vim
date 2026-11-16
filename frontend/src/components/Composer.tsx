import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

export function Composer({
  onSend,
  disabled,
  compact,
  label,
  placeholder,
  autoFocus,
  value,
  onValueChange,
  onStop,
}: {
  onSend: (text: string) => void
  disabled?: boolean
  compact?: boolean
  label: string
  placeholder: string
  autoFocus?: boolean
  value?: string
  onValueChange?: (v: string) => void
  /** While the agent works, the send button becomes a stop button. */
  onStop?: () => void
}) {
  const [own, setOwn] = useState('')
  const text = value ?? own
  const setText = onValueChange ?? setOwn
  const box = useRef<HTMLTextAreaElement>(null)
  // The box grows with the question, up to a few lines.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [text])
  const send = () => {
    const q = text.trim()
    if (!q || disabled) return
    onSend(q)
    setText('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }
  const id = compact ? 'ask-followup' : 'ask'
  return (
    <form
      className={`composer${compact ? ' compact' : ''}`}
      style={{ viewTransitionName: 'composer' }}
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <textarea
        ref={box}
        id={id}
        rows={compact ? 1 : 2}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {onStop ? (
        <button type="button" className="send stop" onClick={onStop} aria-label="Stop">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <button type="submit" className="send" disabled={disabled || !text.trim()} aria-label="Send">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 12V2M2.5 6.5L7 2l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      )}
    </form>
  )
}
