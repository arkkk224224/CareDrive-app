'use client'
// 차량 앱(부모). 화면 ID는 와이어프레임 V-000 ~ V-021. 기준 해상도 1280×720 을 화면에 맞춰 늘린다.
// 센서(변속·경로 이탈)는 Pleos SDK 승인 전이라 오른쪽 아래 "시연" 패널로 넣는다.
import { useEffect, useRef, useState } from 'react'
import { classify, dow, WD } from '@/lib/judge'
import { api, Logo, usePoll } from '../ui'

type VLink = { id: string; status: string; paused: boolean; nickname: string; name: string; relation: string; phone: string; shared: { kind: string; day: string; parent: string }[]; wanders: { day: string; response: string }[] }
type VState = { today: string; vehicle: { vin: string; model: string; code: string | null; code_expires_at: string | null }; links: VLink[] }
type Native = { speak?: (t: string) => void; listen?: () => void; stopListening?: () => void; navigateHome?: () => void; detectWander?: (kind: string) => string }
const native = (): Native | undefined => (window as unknown as { CareDriveNative?: Native }).CareDriveNative

function speak(text: string) {
  const n = native()
  if (n?.speak) return n.speak(text)
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { lang: 'ko-KR' }))
}
/** 음성 인식을 시작하고, 멈추는 함수를 돌려준다. 인식기가 없으면 버튼으로만 답한다. */
function listen(onText: (t: string) => void) {
  const n = native()
  if (n?.listen) {
    (window as unknown as { onCareDriveSpeech?: (t: string) => void }).onCareDriveSpeech = onText
    n.listen()
    return () => n.stopListening?.()
  }
  const SR = (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; start: () => void; abort: () => void } }).webkitSpeechRecognition
  if (!SR) return () => {}
  const r = new SR()
  r.lang = 'ko-KR'
  r.onresult = e => onText(e.results[0][0].transcript)
  try { r.start() } catch { /* 마이크 권한이 없으면 버튼으로 답한다 */ }
  return () => r.abort()
}

const register = (vin: string) => api('vehicle', 'vehicle/register', { vin }).then(r => localStorage.setItem('cd_vehicle', r.token))
const who = (l: VLink) => `${l.name || l.phone}님${l.relation ? `(${l.relation})` : ''}`
const CHIP: Record<string, string> = { chronic: '관찰 알림', wander: '길 헤맴 알림', weekly: '주간 요약', monthly: '월간 리포트', baseline: '평소 운전 완성', rebaseline: '새 기준', linked: '연결', ask: '귀가 안내' }
const Chip = ({ children }: { children: React.ReactNode }) => <span className="inline-flex h-9 shrink-0 items-center rounded-2xl bg-[#eee] px-3 text-[16px] font-medium text-[#444]">{children}</span>
const VBtn = ({ children, onClick, dark, wide }: { children: React.ReactNode; onClick: () => void; dark?: boolean; wide?: boolean }) => (
  <button onClick={onClick} className={`flex h-[76px] shrink-0 items-center justify-center rounded-lg text-[22px] font-medium ${wide ? 'flex-1' : 'px-10'} ${dark ? 'bg-[#333] px-14 text-white' : 'border border-[#999] bg-white text-[#333]'}`}>{children}</button>
)
const Map = ({ label, children }: { label: string; children?: React.ReactNode }) => <div className="relative flex size-full items-center justify-center bg-[#e6e6e6] text-[16px] text-[#888]">{label}{children}</div>

export default function VehicleApp() {
  const [vin, setVin] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const v = new URLSearchParams(location.search).get('vin') ?? localStorage.getItem('cd_vin') ?? 'DEMO-GRANDEUR'
    localStorage.setItem('cd_vin', v)
    setVin(v)
    register(v).then(() => setReady(true))
  }, [])
  // 세션이 끊기면(데모 초기화 등) 차량을 다시 등록하고 읽는다.
  const { data: st, refresh } = usePoll<VState>(() => api('vehicle', 'vehicle/state').catch(e => (e.status === 401 ? register(localStorage.getItem('cd_vin')!).then(() => api('vehicle', 'vehicle/state')) : Promise.reject(e))), ready)
  const act = (path: string, body: unknown = {}) => api('vehicle', path, body).then(refresh)

  const [gear, setGear] = useState<'P' | 'D'>('P')
  const [dev, setDev] = useState<{ reason: string; minutes: number } | null>(null) // 이탈 후보
  const [routing, setRouting] = useState(false)
  const [view, setView] = useState<'home' | 'shared' | 'manage' | 'help'>('home')
  const [later, setLater] = useState('') // "나중에" 한 요청은 다음 정차 때 다시 보인다
  const [toast, setToast] = useState('')
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () => setScale(Math.min(innerWidth / 1280, innerHeight / 720))
    fit(); addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t) } }, [toast])

  const links = st?.links ?? [], on = links.filter(l => l.status === 'accepted')
  const pending = links.find(l => l.status === 'pending' && l.id !== later)
  const parked = gear === 'P'
  const askedToday = on.some(l => l.wanders.some(w => w.day === st?.today))
  const asking = !!dev && parked && on.length > 0 && !askedToday && !routing
  // 연결 코드가 없거나 만료됐으면 새로 받는다.
  const code = st?.vehicle?.code, expires = st?.vehicle?.code_expires_at ? new Date(st.vehicle.code_expires_at).getTime() : 0
  const [now, setNow] = useState(0)
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (st && !on.length && !pending && parked && (!code || expires < Date.now())) act('vehicle/code') }, [st, now]) // eslint-disable-line react-hooks/exhaustive-deps

  const answer = async (response: 'accept' | 'refuse' | 'destination' | 'none', said = '') => {
    if (!dev) return
    const t = new Date(), hm = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`, t0 = new Date(t.getTime() - dev.minutes * 6e4)
    const last = response === 'accept' ? `"${said || '집이요'}"라고 답하셔서 집 안내를 시작했어요.` : response === 'none' ? '15초 동안 대답이 없으셔서 안내를 시작하지 않았어요.' : '목적지를 말씀하셔서 안내하지 않았어요.'
    const timeline = [[`${t0.getHours() < 12 ? '오전' : '오후'} ${hm(t0)}`, '평소 다니시던 길에서 벗어나셨어요.'], [`${hm(new Date(t0.getTime() + 4 * 6e4))}~${hm(t)}`, dev.reason], [hm(t), '차를 세우셨어요.'], [hm(t), '차가 "어디 가시나요? 집으로 안내할까요?"라고 여쭤봤어요.'], [hm(t), last]]
    setDev(null)
    await act('vehicle/wander', { response, minutes: dev.minutes, at: `${t.getHours() < 12 ? '오전' : '오후'} ${t.getHours() % 12 || 12}시쯤`, timeline })
    if (response === 'accept') {
      const n = native()
      if (n?.navigateHome) n.navigateHome()
      setRouting(true); speak('집으로 안내를 시작할게요')
    }
  }

  let screen: React.ReactNode
  if (!st?.vehicle) screen = <Map label="CareDrive를 준비하고 있어요" />
  else if (asking) screen = <Ask onAnswer={answer} />
  else if (!parked || routing) screen = (
    <Map label={routing ? '차량 내비게이션 · 집까지 경로 안내 중 (큰길 위주 경로)' : '차량 내비게이션 지도 화면 · 안전을 위해 주행 중에는 CareDrive 화면을 볼 수 없어요'}>
      {routing && (
        <div className="absolute top-8 left-1/2 flex w-[820px] -translate-x-1/2 items-center gap-5 rounded-2xl bg-[#333] px-7 py-5 text-white">
          <span className="flex size-11 items-center justify-center rounded-full bg-white text-[22px] text-[#333]">⌂</span>
          <div className="flex flex-1 flex-col"><p className="text-[24px] font-bold">집으로 안내를 시작할게요</p><p className="text-[18px] text-[#ddd]">큰길 우선 · 약 20분</p></div>
          <button onClick={() => setRouting(false)} className="h-14 rounded-lg bg-white px-5 text-[18px] font-medium text-[#333]">안내 취소</button>
        </div>
      )}
      {on.length > 0 && <div className="absolute bottom-6 left-6 flex h-12 items-center gap-2.5 rounded-full border border-[#555] bg-white px-5 text-[16px] font-medium text-[#222]"><span className="size-3 rounded-full bg-[#333] ring-2 ring-[#bbb]" />안심귀가 연결 중</div>}
    </Map>
  )
  else if (pending) screen = (
    <div className="flex size-full flex-col gap-7 px-14 py-10">
      <div className="flex flex-1 items-center gap-12">
        <Logo size={260} />
        <div className="flex flex-1 flex-col items-start gap-6">
          <Chip>CareDrive · 연결 요청</Chip>
          <h1 className="text-[36px] leading-snug font-bold">{who(pending)}이 CareDrive 안심 연결을 요청했어요</h1>
          <div className="flex flex-col gap-3.5">
            {[['~', '평소 운전 패턴(횟수·시간대·이동 범위)이 달라지면 자녀분께 요약해서 알려드려요.'], ['×', '실시간 위치는 보내지 않아요.'], ['◑', '언제든 끌 수 있어요.']].map(([i, t]) => (
              <p key={t} className="flex items-center gap-4 text-[22px]"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#d6d6d6] text-[20px] font-bold text-[#555]">{i}</span>{t}</p>
            ))}
          </div>
          <button onClick={() => setView('help')} className="text-[18px] text-[#555] underline">무엇을 기록하고 언제 지우나요?  자세히 보기 &gt;</button>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={() => act('vehicle/respond', { linkId: pending.id, action: 'block' })} className="h-[76px] px-5 text-[20px] font-medium text-[#555] underline">모르는 사람이에요 (24시간 차단)</button>
        <div className="flex-1" />
        <VBtn onClick={() => setLater(pending.id)}>나중에</VBtn>
        <VBtn dark onClick={() => act('vehicle/respond', { linkId: pending.id, action: 'accept' }).then(() => speak('연결됐어요. 평소 운전을 배우기 시작할게요'))}>동의하고 연결하기</VBtn>
      </div>
      {view === 'help' && <Help onClose={() => setView('home')} />}
    </div>
  )
  else if (!on.length) {
    const left = Math.max(0, Math.round((expires - now) / 1000))
    screen = (
      <div className="flex size-full flex-col gap-7 px-14 py-10">
        <div className="flex flex-1 items-center gap-12">
          <Logo size={260} />
          <div className="flex flex-1 flex-col items-start gap-5">
            <Chip>Pleos 유료 결제 완료 (월 3,900원)</Chip>
            <h1 className="text-[36px] font-bold">자녀 앱에 아래 6자리 코드를 입력해 주세요</h1>
            <div className="flex w-[560px] flex-col items-center gap-1 rounded-2xl bg-[#333] py-7 text-white">
              <p className="text-[56px] leading-none font-bold tracking-[0.25em]">{code ? `${code.slice(0, 3)}-${code.slice(3)}` : '···-···'}</p>
              <p className="pt-3 text-[15px] text-[#ccc]">유효시간 {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} · 자녀가 코드를 입력하면 차량에 연결 요청이 떠요</p>
            </div>
            <p className="text-[18px] text-[#555] underline">※ 차량에는 실시간 위치가 공유되지 않으며, 언제든 연결을 해제할 수 있어요.</p>
          </div>
        </div>
        <div className="flex items-center"><button onClick={() => act('vehicle/code')} className="h-[76px] px-5 text-[20px] font-medium text-[#555] underline">코드 재발급</button><div className="flex-1" /><VBtn onClick={() => setToast('다음 정차 때 다시 보여드릴게요')}>닫기</VBtn></div>
      </div>
    )
  } else if (view === 'shared') screen = <Shared st={st} on={on} onBack={() => setView('home')} />
  else {
    const all = on.flatMap(l => l.shared).sort((a, b) => (a.day < b.day ? 1 : -1)), month = st.today.slice(0, 7)
    const mine = all.filter(a => a.day.startsWith(month))
    screen = (
      <div className="relative flex size-full flex-col gap-7 px-14 py-10">
        <div className="flex items-center gap-5">
          <span className="flex size-12 items-center justify-center rounded-full bg-[#d6d6d6]"><span className="size-5 rounded-full bg-[#555]" /></span>
          <div className="flex flex-col"><h1 className="text-[30px] font-bold">{on.map(who).join(', ')}과 연결되어 있어요</h1><p className="text-[18px] text-[#555]">{on.some(l => l.paused) ? '지금은 공유가 멈춰 있어요 · 기록은 계속해요' : '운전할 때만 기록해요 · 실시간 위치는 보내지 않아요'}</p></div>
        </div>
        <div className="flex flex-1 gap-6">
          <button onClick={() => setView('shared')} className="flex flex-[1.7] flex-col gap-3 rounded-2xl border border-[#bbb] p-8 text-left">
            <h2 className="text-[26px] font-bold">이번 달 자녀에게 공유된 내용</h2><p className="text-[18px] text-[#555]">{+month.slice(5)}월 · {mine.length}건 공유됨</p><hr className="w-full border-[#e6e6e6]" />
            <p className="text-[20px]">{all[0] ? `최근: ${all[0].parent} (${+all[0].day.slice(5, 7)}/${+all[0].day.slice(8)})` : '평소 운전 습관을 익히는 중이에요'}</p><div className="flex-1" /><p className="self-end text-[20px] font-medium">보러 가기 &gt;</p>
          </button>
          <button onClick={() => setView('manage')} className="flex flex-1 flex-col gap-3 rounded-2xl border border-[#bbb] p-8 text-left">
            <h2 className="text-[26px] font-bold">연결 끊기 · 기록 삭제</h2><p className="text-[18px] leading-normal text-[#555]">언제든 끊을 수 있어요. 끊으면 기록이 바로 지워져요.</p><div className="flex-1" /><p className="self-end text-[20px] font-medium">관리하기 &gt;</p>
          </button>
        </div>
        <div className="flex items-center"><p className="flex-1 text-[16px] text-[#777]">기록하는 항목: 운전 횟수 · 야간 운전 · 이동 범위</p><button onClick={() => setView('help')} className="h-[60px] rounded-lg border border-[#999] px-8 text-[20px] font-medium">도움말</button></div>
        {view === 'manage' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex w-[760px] flex-col gap-5 rounded-3xl border-2 border-[#222] bg-white p-11">
              <h2 className="text-[36px] font-bold">연결을 끊을까요?</h2>
              <p className="text-[21px] leading-normal text-[#333]">연결을 끊으면 기록이 멈추고, 지금까지 쌓인 기록이 모두 바로 지워져요. 자녀분께는 연결이 끊겼다고만 알려드려요.</p>
              <button onClick={() => confirm('기록과 평소 기준을 지우고 처음부터 다시 배울까요?') && act('vehicle/wipe').then(() => { setView('home'); setToast('기록을 지웠어요. 평소 운전을 처음부터 다시 배워요') })} className="rounded-xl bg-[#f2f2f2] px-5 py-4 text-left text-[18px] text-[#444] underline">기록만 지우고 연결은 유지하기 &gt;</button>
              <div className="flex gap-4"><VBtn wide onClick={() => setView('home')}>취소</VBtn><button onClick={() => act('vehicle/disconnect').then(() => { setView('home'); setToast('연결을 끊고 기록을 모두 지웠어요') })} className="h-[76px] flex-1 rounded-lg border-2 border-[#222] text-[22px] font-bold">연결 끊고 모두 지우기</button></div>
            </div>
          </div>
        )}
        {view === 'help' && <Help onClose={() => setView('home')} paused={on.some(l => l.paused)} onPause={p => act('vehicle/pause', { paused: p }).then(() => setToast(p ? '공유를 멈췄어요. 기록은 계속해요' : '공유를 다시 켰어요'))} />}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#111]">
      <div className="absolute top-1/2 left-1/2 h-[720px] w-[1280px] overflow-hidden bg-white text-[#222]" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        {screen}
        {toast && <p role="status" className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-[#333] px-8 py-4 text-[20px] text-white">{toast}</p>}
      </div>
      <Sim vin={vin} gear={gear} today={st?.today} linked={on.length > 0} askedToday={askedToday}
        onGear={g => { setGear(g); if (g === 'D') setView('home'); if (g === 'P') setLater('') }}
        onDeviate={kind => {
          const n = native()
          const r = n?.detectWander ? JSON.parse(n.detectWander(kind)) : { detected: kind === 'wander', reason: '같은 동네를 몇 번 도셨어요.', minutes: 15 }
          setDev(r.detected ? { reason: r.reason, minutes: r.minutes } : null)
          setToast(r.detected ? '이탈 후보를 감지했어요. 차를 세우면(P단) 여쭤봐요' : '평소 길이라 이탈 후보로 잡지 않았어요')
        }}
        onTrip={night => act('vehicle/trip', { radius: +(4.5 + Math.random() * 3).toFixed(1), night }).then(() => setToast('시동을 껐어요. 오늘 운전 1번을 기록했어요'))}
        onVoicePause={() => act('vehicle/pause', { paused: true }).then(() => { speak('공유를 멈췄어요'); setToast('"공유 멈춰줘" → 공유를 멈췄어요') })}
        onDemo={(path, body) => api('vehicle', path, body).then(r => { if (path === 'demo/reset') return location.reload(); refresh(); setRouting(false); setDev(null); setToast(r.today ? `오늘은 ${r.today}이에요` : '가상 계정과 목업 데이터를 처음 상태로 되돌렸어요') })}
        onVin={v => { localStorage.setItem('cd_vin', v); location.href = '/v?vin=' + v }} />
    </div>
  )
}

function Ask({ onAnswer }: { onAnswer: (r: 'accept' | 'refuse' | 'destination' | 'none', said?: string) => void }) {
  const [left, setLeft] = useState(15)
  const done = useRef(false)
  const fire = (r: 'accept' | 'refuse' | 'destination' | 'none', said?: string) => { if (!done.current) { done.current = true; onAnswer(r, said) } }
  useEffect(() => {
    speak('어디 가시나요? 집으로 안내할까요?')
    return listen(text => fire(classify(text), text))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (left <= 0) return fire('none')
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])
  return (
    <Map label="차량 내비게이션 지도 화면 (기본 내비 · 정차 중)">
      <div className="absolute top-[90px] left-1/2 flex w-[760px] -translate-x-1/2 flex-col gap-6 rounded-3xl border-2 border-[#222] bg-white p-10 text-[#222]">
        <div className="flex items-center gap-4"><span className="flex size-14 items-center justify-center rounded-full bg-[#d6d6d6] text-[26px] text-[#555]">◉</span><p className="text-[18px] leading-normal text-[#555]">듣고 있어요…<br /><span className="text-[#222]">&quot;집이요&quot; 또는 가시는 곳을 말씀해 주세요</span></p></div>
        <h1 className="text-[44px] leading-tight font-bold">어디 가시나요?<br />집으로 안내할까요?</h1>
        <div className="flex gap-4"><VBtn wide onClick={() => fire('refuse')}>아니요</VBtn><VBtn wide dark onClick={() => fire('accept')}>집으로 안내</VBtn></div>
        <div className="flex items-center gap-3"><div className="h-1.5 flex-1 rounded bg-[#ddd]"><div className="h-full rounded bg-[#888] transition-[width] duration-1000 ease-linear" style={{ width: `${(left / 15) * 100}%` }} /></div><span className="text-[14px] text-[#888]">응답 기다리는 중</span></div>
      </div>
    </Map>
  )
}

function Shared({ st, on, onBack }: { st: VState; on: VLink[]; onBack: () => void }) {
  const [off, setOff] = useState(0)
  const d = new Date(Date.UTC(+st.today.slice(0, 4), +st.today.slice(5, 7) - 1 + off, 1)), ym = d.toISOString().slice(0, 7)
  const rows = [
    ...on.flatMap(l => l.shared.map(a => ({ day: a.day, chip: CHIP[a.kind] ?? a.kind, text: a.parent }))),
    ...on.flatMap(l => l.wanders.filter(w => w.response === 'accept' || w.response === 'none').map(w => ({ day: w.day, chip: CHIP.ask, text: `"귀가 안내 질문을 1번 했어요"` }))),
  ].filter(r => r.day.startsWith(ym)).sort((a, b) => (a.day < b.day ? 1 : -1))
  const nb = 'flex size-14 items-center justify-center rounded-lg bg-[#d6d6d6] text-[24px] font-bold text-[#444]'
  return (
    <div className="flex size-full flex-col gap-6 px-14 py-10">
      <div className="flex items-center gap-4">
        <button aria-label="뒤로" onClick={onBack} className={nb}>←</button><h1 className="flex-1 text-[30px] font-bold">{d.getUTCMonth() + 1}월에 자녀에게 공유된 내용</h1>
        <button aria-label="이전 달" onClick={() => setOff(off - 1)} className={nb}>&lt;</button><span className="px-2 text-[20px]">{d.getUTCFullYear()}년 {d.getUTCMonth() + 1}월</span><button aria-label="다음 달" disabled={off >= 0} onClick={() => setOff(off + 1)} className={nb}>&gt;</button>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto rounded-2xl border border-[#bbb]">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-[#e6e6e6] px-8 py-6"><span className="w-[110px] shrink-0 text-[20px] text-[#555]">{r.day.slice(5).replace('-', '/')} ({WD[dow(r.day)]})</span><Chip>{r.chip}</Chip><p className="text-[22px] leading-normal">{r.text}</p></div>
        ))}
        {!rows.length && <p className="p-10 text-center text-[22px] text-[#777]">이번 달에는 아직 자녀분께 공유된 내용이 없어요</p>}
      </div>
      <p className="flex items-center gap-4 rounded-xl bg-[#f2f2f2] px-6 py-4 text-[18px] text-[#444]"><span className="flex size-8 items-center justify-center rounded-full bg-[#d6d6d6] text-[16px] font-bold">i</span>자녀분께 보낸 문장을 그대로 보여드려요. 실시간 위치나 이동 경로는 공유하지 않아요.</p>
    </div>
  )
}

function Help({ onClose, paused, onPause }: { onClose: () => void; paused?: boolean; onPause?: (p: boolean) => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
      <div className="flex w-[860px] flex-col gap-4 rounded-3xl border-2 border-[#222] bg-white p-11 text-[20px] leading-normal">
        <h2 className="text-[32px] font-bold">무엇을 기록하고 언제 지우나요?</h2>
        <p>· 기록: 운전 횟수, 해 진 뒤 운전(전조등), 집에서 멈춘 곳까지의 평균 거리. 하루 요약만 남기고 위치 기록은 시동을 끄면 차에서 바로 지워요.</p>
        <p>· 자녀에게 가는 것: &quot;이번 주도 평소와 비슷해요&quot; 같은 요약 문장만 보내요. 실시간 위치와 이동 경로는 보내지 않아요.</p>
        <p>· 귀가 안내: 평소 다니던 길에서 오래 벗어났을 때, 차를 세웠을 때만 &quot;집으로 안내할까요?&quot;라고 여쭤봐요. 하루에 한 번만 여쭤봐요.</p>
        <p>· 삭제: &quot;연결 끊기 · 기록 삭제&quot;에서 언제든 바로 지울 수 있어요.</p>
        <div className="flex gap-4 pt-2">
          {onPause && <VBtn wide onClick={() => onPause(!paused)}>{paused ? '공유 다시 켜기' : '공유 잠시 멈추기'}</VBtn>}
          <VBtn wide dark onClick={onClose}>확인</VBtn>
        </div>
      </div>
    </div>
  )
}

const VINS = [['DEMO-AVANTE', '엄마 아반떼 (지수와 연결됨)'], ['DEMO-GRANDEUR', '새 차 그랜저 (연결 전)'], ['DEMO-SANTAFE', '아빠 싼타페'], ['DEMO-MORNING', '할머니 모닝']]
function Sim(p: { vin: string; gear: 'P' | 'D'; today?: string; linked: boolean; askedToday: boolean; onGear: (g: 'P' | 'D') => void; onDeviate: (k: string) => void; onTrip: (night: boolean) => void; onVoicePause: () => void; onDemo: (path: string, body: unknown) => void; onVin: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const b = 'min-h-11 rounded-lg border border-[#555] px-3 text-[13px] text-white disabled:opacity-40'
  if (!open) return <button onClick={() => setOpen(true)} className="fixed right-3 bottom-3 z-10 h-11 rounded-full bg-black/70 px-4 text-[13px] text-white">시연 · {p.gear}단 · {p.today?.slice(5).replace('-', '/')}</button>
  return (
    <div className="fixed right-3 bottom-3 z-10 flex w-[300px] flex-col gap-2 rounded-2xl bg-black/85 p-3 text-[12px] text-[#ccc]">
      <div className="flex items-center"><p className="flex-1 font-bold text-white">시연 패널 (센서 시뮬레이션)</p><button aria-label="닫기" onClick={() => setOpen(false)} className="size-11 text-[18px] text-white">×</button></div>
      <select aria-label="차량" value={p.vin} onChange={e => p.onVin(e.target.value)} className="h-11 rounded-lg bg-[#333] px-2 text-[13px] text-white">{VINS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}{!VINS.some(([v]) => v === p.vin) && <option>{p.vin}</option>}</select>
      <p>변속 · 오늘 {p.today}</p>
      <div className="flex gap-2">{(['P', 'D'] as const).map(g => <button key={g} onClick={() => p.onGear(g)} aria-pressed={p.gear === g} className={`${b} flex-1 ${p.gear === g ? '!border-white bg-white !text-black' : ''}`}>{g === 'P' ? 'P단 (정차)' : 'D단 (주행)'}</button>)}</div>
      <p>급성: 주행 중 길 이탈{p.askedToday ? ' · 오늘은 이미 여쭤봤어요(하루 1회)' : ''}</p>
      <div className="flex gap-2"><button disabled={!p.linked} onClick={() => p.onDeviate('wander')} className={b + ' flex-1'}>길을 벗어나 맴돈다</button><button disabled={!p.linked} onClick={() => p.onDeviate('usual')} className={b + ' flex-1'}>평소 길 (비교)</button></div>
      <p>기록 · 음성</p>
      <div className="flex gap-2"><button disabled={!p.linked} onClick={() => p.onTrip(false)} className={b + ' flex-1'}>시동 끄기 (운전 1번)</button><button disabled={!p.linked} onClick={p.onVoicePause} className={b + ' flex-1'}>&quot;공유 멈춰줘&quot;</button></div>
      <p>시간 압축</p>
      <div className="flex gap-2"><button onClick={() => p.onDemo('vehicle/demo/next-day', {})} className={b + ' flex-1'}>다음 날로</button><button disabled={!p.linked} onClick={() => p.onDemo('vehicle/demo/chronic', { scenario: 'normal', weeks: 4 })} className={b + ' flex-1'}>평소 4주</button><button disabled={!p.linked} onClick={() => p.onDemo('vehicle/demo/chronic', { scenario: 'decline', weeks: 12 })} className={b + ' flex-1'}>감소 12주</button></div>
      <button onClick={() => confirm('가상 계정과 목업 데이터를 11/15 상태로 되돌릴까요?') && p.onDemo('demo/reset', {})} className={b}>데모 초기화 (11/15 시나리오)</button>
    </div>
  )
}
