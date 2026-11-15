'use client'
// 와이어프레임(Figma 04최종 와프)의 공통 부품. 색·간격·모서리는 시안 값 그대로.
import { useCallback, useEffect, useRef, useState } from 'react'

export async function api(role: 'child' | 'vehicle', path: string, body?: unknown) {
  const token = localStorage.getItem('cd_' + role)
  const r = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({ error: '연결이 불안정해요. 잠시 후 다시 시도해 주세요' }))
  if (!r.ok) throw Object.assign(new Error(j.error ?? '잠시 후 다시 시도해 주세요'), { status: r.status })
  return j
}

/** 서버 상태를 3초마다 다시 읽는다. */
export function usePoll<T>(load: () => Promise<T>, on: boolean) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const fn = useRef(load)
  fn.current = load
  const refresh = useCallback(async () => {
    try { setData(await fn.current()); setError('') } catch (e) {
      if ((e as { status?: number }).status === 401) setData(null)
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    if (!on) return
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [on, refresh])
  return { data, error, refresh, setData }
}

export type Nav = { go: (id: string, p?: Record<string, string>) => void; back: () => void; reset: (id: string, p?: Record<string, string>) => void; p: Record<string, string> }
/** 화면 스택. 브라우저 뒤로가기와 맞춘다. */
export function useNav(first: string) {
  const [stack, setStack] = useState<{ id: string; p: Record<string, string> }[]>([{ id: first, p: {} }])
  useEffect(() => {
    const pop = () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s))
    addEventListener('popstate', pop)
    return () => removeEventListener('popstate', pop)
  }, [])
  const top = stack[stack.length - 1]
  const nav: Nav = {
    p: top.p,
    go: (id, p = {}) => { history.pushState(null, ''); setStack(s => [...s, { id, p }]) },
    back: () => (stack.length > 1 ? history.back() : undefined),
    reset: (id, p = {}) => setStack([{ id, p }]),
  }
  return { id: top.id, nav }
}

export const Chip = ({ children, dark }: { children: React.ReactNode; dark?: boolean }) => (
  <span className={`inline-flex h-6 shrink-0 items-center rounded-xl px-2.5 text-[11px] font-medium whitespace-nowrap ${dark ? 'bg-[#333] text-white' : 'bg-[#eee] text-[#444]'}`}>{children}</span>
)
export const StateChip = ({ label }: { label: string }) => <Chip dark={label === '줄었어요'}>{label}</Chip>

export function Btn({ children, onClick, kind = 'primary', disabled, className = '' }: { children: React.ReactNode; onClick?: () => void; kind?: 'primary' | 'line' | 'text'; disabled?: boolean; className?: string }) {
  const k = kind === 'primary' ? 'bg-[#333] text-white' : kind === 'line' ? 'border border-[#999] bg-white text-[#333]' : 'text-[#222] underline'
  return <button disabled={disabled} onClick={onClick} className={`flex h-[52px] w-full shrink-0 items-center justify-center rounded-[10px] px-4 text-[15px] font-medium ${k} ${className}`}>{children}</button>
}

const TABS = [['C-020', '홈', 'home'], ['C-030', '리포트', 'report'], ['C-040', '코칭', 'coach'], ['C-070', '설정', 'settings']] as const
const Icon = ({ name, on, size = 22 }: { name: string; on?: boolean; size?: number }) => (
  <span aria-hidden className="block" style={{ width: size, height: size, background: on ? '#222' : '#aaa', WebkitMask: `url(/ic/${name}.svg) center / contain no-repeat`, mask: `url(/ic/${name}.svg) center / contain no-repeat` }} />
)
export function TabBar({ tab, nav }: { tab: string; nav: Nav }) {
  return (
    <nav className="flex h-16 shrink-0 items-center border-t border-[#eee] bg-white px-3">
      {TABS.map(([id, label, icon]) => (
        <button key={id} onClick={() => nav.reset(id)} className="flex flex-1 flex-col items-center gap-1 py-1.5" aria-current={tab === id}>
          <Icon name={icon} on={tab === id} />
          <span className={`text-[11px] ${tab === id ? 'font-bold text-[#222]' : 'text-[#999]'}`}>{label}</span>
        </button>
      ))}
    </nav>
  )
}

/** 휴대폰 한 화면: 앱바 + 스크롤 본문 + (탭바). */
export function Screen({ title, big, back, right, tab, nav, children, foot }: { title?: string; big?: boolean; back?: boolean; right?: React.ReactNode; tab?: string; nav: Nav; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col bg-white sm:border-x sm:border-[#ddd]">
      {(title !== undefined || back) && (
        <header className="flex h-14 shrink-0 items-center gap-2.5 px-4">
          {back && <button onClick={nav.back} aria-label="뒤로" className="-ml-2 flex size-11 items-center justify-center text-[22px] text-[#222]">←</button>}
          <h1 className={`${big ? 'text-[20px]' : 'text-[17px]'} font-bold text-[#222]`}>{title}</h1>
          <div className="flex-1" />
          {right}
        </header>
      )}
      <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-2 pb-7">{children}</main>
      {foot && <div className="flex shrink-0 flex-col gap-2 px-5 pt-2 pb-6">{foot}</div>}
      {tab && <TabBar tab={tab} nav={nav} />}
    </div>
  )
}

export function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-20 mx-auto flex max-w-[430px] flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="flex flex-col gap-4 rounded-t-[20px] bg-white px-5 pt-3 pb-6" style={{ animation: 'sheet-up .2s ease-out' }} onClick={e => e.stopPropagation()}>
        <div className="mx-auto h-1 w-9 rounded bg-[#ccc]" />
        {children}
      </div>
    </div>
  )
}

export const Gray = ({ children, onClick, className = '' }: { children: React.ReactNode; onClick?: () => void; className?: string }) => {
  const C = onClick ? 'button' : 'div'
  return <C onClick={onClick} className={`flex w-full flex-col gap-1 rounded-xl bg-[#f4f4f4] px-4 py-3.5 text-left ${className}`}>{children}</C>
}
/** 회색 안내 카드: 굵은 제목 + 설명 + (›) */
export const Note = ({ title, sub, onClick }: { title: string; sub?: string; onClick?: () => void }) => (
  <Gray onClick={onClick} className="!flex-row items-center gap-2">
    <div className="flex flex-1 flex-col gap-0.5">
      <p className="text-[13px] font-bold text-[#222]">{title}</p>
      {sub && <p className="text-[12px] text-[#666]">{sub}</p>}
    </div>
    {onClick && <span className="text-[16px] text-[#aaa]">›</span>}
  </Gray>
)
export const Bullets = ({ items }: { items: string[] }) => (
  <ul className="flex flex-col gap-2.5">
    {items.map(t => (
      <li key={t} className="flex gap-2.5 text-[13px] leading-normal text-[#333]"><span className="mt-[7px] size-[5px] shrink-0 rounded-full bg-[#666]" />{t}</li>
    ))}
  </ul>
)
export const Link = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button onClick={onClick} className="min-h-6 text-[13px] font-medium text-[#222] underline">{children}</button>
)
export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-2 text-[13px] font-medium text-[#444]">{label}{children}</label>
)
export const inputCls = 'h-12 w-full rounded-[10px] border border-[#ccc] bg-white px-3.5 text-[15px] font-normal text-[#222] outline-none focus:border-2 focus:border-[#333]'
export function Pick({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} aria-pressed={value === o} className={`h-9 rounded-[18px] px-4 text-[13px] font-medium ${value === o ? 'bg-[#333] text-white' : 'bg-[#eee] text-[#333]'}`}>{o}</button>
      ))}
    </div>
  )
}
export const Logo = ({ size = 64 }: { size?: number }) => (
  <div className="relative shrink-0 bg-[#222]" style={{ width: size, height: size, borderRadius: size / 4 }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img alt="CareDrive" src="/ic/logo-a.svg" className="absolute" style={{ left: '29%', top: '39.4%', width: '58.2%', height: '39%' }} />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img alt="" src="/ic/logo-b.svg" className="absolute" style={{ left: '12.8%', top: '21.7%', width: '48.6%', height: '41.9%' }} />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img alt="" src="/ic/logo-c.svg" className="absolute" style={{ left: '57.8%', top: '51.6%', width: '7.8%', height: '14.1%' }} />
  </div>
)
export const Err = ({ msg }: { msg: string }) => (msg ? <p role="alert" className="text-[13px] text-[#e5484d]">{msg}</p> : null)
