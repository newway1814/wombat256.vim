import { useState, type KeyboardEvent } from 'react'

export function Composer({
  onSend,
  disabled,
  compact,
  label,
  placeholder,
  autoFocus,
  value,
  onValueChange,
}: {
  onSend: (text: string) => void
  disabled?: boolean
  compact?: boolean
  label: string
  placeholder: string
  autoFocus?: boolean
  value?: string
  onValueChange?: (v: string) => void
}) {
  const [own, setOwn] = useState('')
  const text = value ?? own
  const setText = onValueChange ?? setOwn
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
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={compact ? 1 : 2}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      <button type="submit" className="send" disabled={disabled || !text.trim()} aria-label="Send">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 12V2M2.5 6.5L7 2l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </form>
  )
}
