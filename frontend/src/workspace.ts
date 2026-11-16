import { createContext, useContext } from 'react'

/** What the side panel can show. Each opened item becomes a tab. */
export type Tab =
  | { kind: 'trace'; convId: string; turnId: string }
  | { kind: 'step'; convId: string; turnId: string; stepId: string }
  | { kind: 'source'; convId: string; turnId: string; chunkId: string }
  | { kind: 'lot'; convId: string; lotId: string }
  | { kind: 'wo'; convId: string; ticketId: number }

export const tabKey = (t: Tab): string => {
  switch (t.kind) {
    case 'trace':
      return `trace:${t.turnId}`
    case 'step':
      return `step:${t.stepId}`
    case 'source':
      return `source:${t.turnId}:${t.chunkId.split('#')[0]}` // one tab per document
    case 'lot':
      return `lot:${t.lotId}`
    case 'wo':
      return `wo:${t.ticketId}`
  }
}

export interface WorkspaceApi {
  open: (t: Tab) => void
  /** True when this tab is the one on screen in the side panel. */
  showing: (t: Tab) => boolean
  hide: () => void
}
export const WorkspaceContext = createContext<WorkspaceApi>({ open: () => {}, showing: () => false, hide: () => {} })
export const useWorkspace = () => useContext(WorkspaceContext)
