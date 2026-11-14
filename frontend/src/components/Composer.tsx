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
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={compact ? 2 : 3}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      <div className="composer-foot">
        <span className="muted">
          {compact ? 'Read-only. Work orders need a person to approve them.' : 'Enter to send · Shift+Enter for a new line'}
        </span>
        <button type="submit" className="btn btn-primary" disabled={disabled || !text.trim()}>
          Send
        </button>
      </div>
    </form>
  )
}
