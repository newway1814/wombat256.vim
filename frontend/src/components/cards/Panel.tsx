import type { ReactNode } from 'react'

export function Panel(props: {
  title: ReactNode
  meta?: ReactNode
  wide?: boolean
  label: string
  id?: string
  children: ReactNode
}) {
  return (
    <section id={props.id} aria-label={props.label} className={`panel card-enter${props.wide ? ' wide' : ''}`}>
      <div className="panel-head">
        <h3>{props.title}</h3>
        {props.meta && <span className="panel-meta">{props.meta}</span>}
      </div>
      {props.children}
    </section>
  )
}
