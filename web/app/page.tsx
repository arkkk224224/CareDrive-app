'use client'
// 자녀 앱. 화면 ID는 와이어프레임(M-01, C-0xx)과 같다.
import { useEffect, useMemo, useState } from 'react'
import { evaluate } from '@/lib/judge'
import { api, useNav, usePoll } from './ui'
import type { Ctx, Link, State } from './child/types'
import { ONBOARDING } from './child/onboarding'
import { HOME } from './child/home'
import { REPORT } from './child/report'
import { COACH } from './child/coach'
import { SETTINGS } from './child/settings'

const SCREENS: Record<string, (c: Ctx) => React.ReactNode> = { ...ONBOARDING, ...HOME, ...REPORT, ...COACH, ...SETTINGS }

export default function ChildApp() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  useEffect(() => setAuthed(!!localStorage.getItem('cd_child')), [])
  const { data: st, refresh, error, setData } = usePoll<State>(() => api('child', 'child/state').catch(e => { if (e.status === 401) { localStorage.removeItem('cd_child'); setAuthed(false) } throw e }), !!authed)
  const { id, nav } = useNav('boot')
  const [sel, setSel] = useState('')

  const accepted = useMemo(() => st?.links.filter(l => l.status === 'accepted') ?? [], [st])
  const cur: Link | undefined = accepted.find(l => l.id === sel) ?? accepted[0]
  const ev = useMemo(
    () => (cur && st ? evaluate({ nick: cur.nickname, accepted: cur.accepted, today: st.today, days: cur.days, excl: cur.excl, wanders: cur.wanders, relearns: cur.relearns }) : null),
    [cur, st],
  )

  // 로그인이 풀리면 시작 화면으로.
  useEffect(() => {
    if (authed === false) nav.reset('M-01')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed])
  useEffect(() => {
    if (id !== 'boot' || !st) return
    const waiting = st.links.find(l => l.status !== 'accepted')
    nav.reset(accepted.length ? 'C-020' : waiting ? 'C-012' : 'C-010-1', waiting && !accepted.length ? { linkId: waiting.id } : {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, id])

  if (authed === null || (id === 'boot' && authed)) return <div className="flex h-dvh items-center justify-center text-[13px] text-[#888]">{error || '불러오는 중이에요'}</div>
  const ctx: Ctx = {
    nav, st, cur, ev, accepted, refresh, setSel,
    act: async (path, body) => { const r = await api('child', path, body); await refresh(); return r },
    login: token => { localStorage.setItem('cd_child', token); setAuthed(true); nav.reset('boot') },
    logout: () => { localStorage.removeItem('cd_child'); setData(null); setAuthed(false); nav.reset('M-01') },
  }
  const render = SCREENS[id] ?? SCREENS['C-020']
  return <>{render(ctx)}</>
}
