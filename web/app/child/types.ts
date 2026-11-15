import type { Day, Evaluated, Relearn } from '@/lib/judge'
import type { Nav } from '../ui'

export type Alert = { id: string; kind: string; day: string; title: string; body: string; read: boolean; archived: boolean }
export type WanderEv = { id: string; day: string; at: string; minutes: number; response: string; timeline: [string, string][] }
export type Link = {
  id: string; nickname: string; status: 'pending' | 'accepted' | 'declined' | 'expired'; paused: boolean; invited_at: string; accepted: string
  relearns: Relearn[]; change: { model: string; plate: string; code: string; at: string } | null
  vehicle: { model: string; plate: string; subscription: string }
  days: Day[]; excl: { id: string; kind: string; start: string; end: string }[]; wanders: WanderEv[]; alerts: Alert[]
}
export type State = { today: string; me: { phone: string; name: string; relation: string; settings: Record<string, unknown> }; links: Link[] }
export type Ctx = {
  nav: Nav; st: State | null; cur?: Link; ev: Evaluated | null; accepted: Link[]
  refresh: () => Promise<void>; setSel: (id: string) => void
  act: (path: string, body: unknown) => Promise<Record<string, string>>
  login: (token: string) => void; logout: () => void
}
