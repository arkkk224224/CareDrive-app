'use client'
import { useEffect, useState } from 'react'
import { jo, md } from '@/lib/judge'
import { api, Btn, Bullets, Err, Gray, inputCls, Link, Logo, Note, Screen, Sheet } from '../ui'
import type { Ctx } from './types'

const Progress = ({ step }: { step: number }) => (
  <div className="flex gap-1.5">{[1, 2, 3, 4].map(i => <div key={i} className={`h-[3px] flex-1 rounded ${i <= step ? 'bg-[#333]' : 'bg-[#ddd]'}`} />)}</div>
)
const H = ({ children }: { children: React.ReactNode }) => <h2 className="text-[22px] leading-normal font-bold whitespace-pre-line text-[#222]">{children}</h2>
const draft = { get: (k: string) => sessionStorage.getItem('cd_' + k) ?? '', set: (k: string, v: string) => sessionStorage.setItem('cd_' + k, v) }

function Start({ login }: Ctx) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [left, setLeft] = useState(0)
  const [err, setErr] = useState('')
  useEffect(() => { if (left > 0) { const t = setTimeout(() => setLeft(left - 1), 1000); return () => clearTimeout(t) } }, [left])
  const fmt = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/^(\d{3})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => [a, b, c].filter(Boolean).join('-'))
  const send = () => api('child', 'auth/code', { phone }).then(() => { setLeft(180); setErr('') }, e => setErr(e.message))
  const start = () => api('child', 'auth/verify', { phone, code }).then(r => login(r.token), e => setErr(e.message))
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col gap-5 overflow-y-auto bg-white px-5 pt-10 pb-7 sm:border-x sm:border-[#ddd]">
      <Logo />
      <h1 className="text-[24px] leading-normal font-bold text-[#222]">부모님의 운전 변화를<br />가족이 놓치지 않게</h1>
      <Bullets items={['감시가 아니에요. 평소와 크게 달라진 점만 요약해서 알려드려요.', '부모님이 차량에서 직접 수락해야 시작돼요.', '실시간 위치는 보내지 않아요.']} />
      <div className="flex flex-col gap-2">
        <label htmlFor="phone" className="text-[13px] font-medium text-[#444]">휴대폰 번호</label>
        <div className="flex h-12 items-center rounded-[10px] border-2 border-[#333] px-3.5">
          <input id="phone" inputMode="numeric" autoComplete="tel" placeholder="010-1234-5678" value={phone} onChange={e => setPhone(fmt(e.target.value))} className="min-w-0 flex-1 text-[15px] text-[#222] outline-none" />
          <button onClick={send} disabled={phone.length < 13} className="h-8 rounded-lg bg-[#eee] px-2.5 text-[12px] font-medium text-[#222]">{left ? '다시 받기' : '인증번호 받기'}</button>
        </div>
        <div className="flex h-12 items-center rounded-[10px] border border-[#ccc] px-3.5">
          <input aria-label="인증번호 6자리" inputMode="numeric" autoComplete="one-time-code" placeholder="인증번호 6자리" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="min-w-0 flex-1 text-[15px] text-[#222] outline-none placeholder:text-[#999]" />
          {left > 0 && <span className="text-[12px] text-[#888]">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}
        </div>
        <Err msg={err} />
        {left > 0 && <p className="text-[12px] text-[#888]">시연용 인증번호는 123456이에요.</p>}
      </div>
      <div className="flex-1" />
      <p className="text-[11px] text-[#888]">시작하면 이용약관 · 개인정보 처리방침 · 위치기반서비스 약관에 동의하게 돼요.</p>
      <Btn onClick={start} disabled={phone.length < 13 || code.length < 6}>시작하기</Btn>
    </div>
  )
}

function Nick({ nav, accepted }: Ctx) {
  const [v, setV] = useState(draft.get('nick'))
  return (
    <Screen nav={nav} back={accepted.length > 0} title="" foot={<Btn disabled={!v.trim()} onClick={() => { draft.set('nick', v.trim()); nav.go('C-010-2') }}>다음</Btn>}>
      <Progress step={1} />
      <H>{'부모님을 어떻게\n부르세요?'}</H>
      <input aria-label="부모님 호칭" autoFocus maxLength={8} placeholder="엄마" value={v} onChange={e => setV(e.target.value)} className={inputCls + ' !border-2 !border-[#333]'} />
      <p className="text-[12px] leading-normal text-[#888]">알림 문장에 쓰여요<br />예시) &quot;{v || '엄마'}의 운전 패턴이…&quot;</p>
    </Screen>
  )
}

function Code({ nav }: Ctx) {
  const [code, setCode] = useState(draft.get('code'))
  const [help, setHelp] = useState(false)
  return (
    <Screen nav={nav} back title="" foot={<Btn disabled={code.length < 6} onClick={() => { draft.set('code', code); nav.go('C-011') }}>다음</Btn>}>
      <Progress step={2} />
      <H>{'차량 화면에 보이는\n코드 6자리를 입력해 주세요'}</H>
      <label className="relative flex gap-2">
        <input aria-label="연결 코드 6자리" autoFocus inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="absolute inset-0 opacity-0" />
        {[0, 1, 2, 3, 4, 5].map(i => (
          <span key={i} className={`flex h-[52px] flex-1 items-center justify-center rounded-[10px] text-[20px] font-bold text-[#222] ${i === code.length ? 'border-2 border-[#333]' : 'border border-[#ccc]'}`}>{code[i]}</span>
        ))}
      </label>
      <div><Link onClick={() => setHelp(true)}>차량에 CareDrive 앱이 없나요?</Link></div>
      <div className="flex flex-col gap-2">
        <p className="text-[12px] text-[#777]">부모님 호칭</p>
        <Gray className="!flex-row items-center"><span className="flex-1 text-[15px] text-[#222]">{draft.get('nick')}</span><button onClick={nav.back} className="text-[12px] text-[#666] underline">수정</button></Gray>
      </div>
      {help && (
        <Sheet onClose={() => setHelp(false)}>
          <h3 className="text-[18px] font-bold">차량에 앱 설치하기</h3>
          {['차량 화면에서 App Market을 열어요', '"CareDrive"를 검색해 설치해요', '앱을 열면 코드 6자리가 보여요'].map((t, i) => (
            <p key={t} className="flex items-center gap-3 text-[14px] text-[#222]"><span className="flex size-7 items-center justify-center rounded-full bg-[#eee] text-[12px] font-bold">{i + 1}</span>{t}</p>
          ))}
          <Btn onClick={() => setHelp(false)}>확인했어요</Btn>
        </Sheet>
      )}
    </Screen>
  )
}

function Free({ nav, act }: Ctx) {
  const [err, setErr] = useState('')
  const send = () => act('child/invite', { code: draft.get('code'), nickname: draft.get('nick') }).then(r => { draft.set('code', ''); nav.reset('C-012', { linkId: r.linkId }) }, e => setErr(e.message))
  return (
    <Screen nav={nav} back title="" foot={<><p className="text-[11px] text-[#888]">모바일 앱 스토어 결제 없이 바로 부모님 차량에 연결 요청을 보냅니다.</p><Err msg={err} /><Btn onClick={send}>연결 요청 보내기</Btn></>}>
      <H>{'자녀분은 결제 없이\n평생 무료로 연결돼요'}</H>
      <Gray className="!py-4"><p className="text-[15px] font-bold">보호자 모바일 전용 앱</p><p className="text-[12px] text-[#555]">추가 요금이나 결제 정보 등록 없이 무제한 연동</p></Gray>
      <Gray className="!py-4"><p className="text-[15px] font-bold">차량 앱 결제 및 운영 안내</p><p className="text-[12px] leading-normal text-[#555]">부모님 차량(Pleos App Market)에서 CareDrive 유료 앱(월 3,900원)을 결제하시면 바로 연동이 시작돼요.<br />※ 자녀분에게는 어떠한 추가 결제나 구독 요금도 청구되지 않습니다.</p></Gray>
    </Screen>
  )
}

/** 진행 표시: 끝난 단계는 큰 점, 지금 단계는 커졌다 작아지는 점, 남은 단계는 작은 점. */
export function Steps({ items }: { items: [string, string, 'done' | 'now' | 'pending'][] }) {
  return (
    <div className="flex flex-col rounded-[14px] border border-[#ddd] p-4">
      {items.map(([t, sub, s], i) => (
        <div key={t} className="flex gap-3">
          <div className="flex w-4 flex-col items-center">
            <span className="relative mt-1 flex size-4 items-center justify-center">
              {s === 'now' && <span className="absolute size-4 rounded-full bg-[#333]" style={{ animation: 'pulse-dot 1.2s ease-in-out infinite' }} />}
              <span className={`rounded-full ${s === 'done' ? 'size-4 bg-[#333]' : s === 'now' ? 'size-2.5 bg-[#333] ring-2 ring-[#333] ring-offset-2' : 'size-2 border border-[#999]'}`} />
            </span>
            {i < items.length - 1 && <span className="my-1 w-px flex-1 border-l border-dashed border-[#999]" />}
          </div>
          <div className="flex flex-col pb-3"><p className={`text-[14px] ${s === 'pending' ? 'text-[#777]' : 'font-bold text-[#222]'}`}>{t}</p><p className="text-[12px] text-[#888]">{sub}</p></div>
        </div>
      ))}
    </div>
  )
}

function Wait({ nav, st, act }: Ctx) {
  const l = st?.links.find(x => x.id === nav.p.linkId)
  useEffect(() => { if (l?.status === 'accepted') nav.reset('C-013', { linkId: l.id }) }, [l?.status]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!l) return <Screen nav={nav} title=""><p className="text-[14px] text-[#555]">연결 요청을 찾을 수 없어요.</p><Btn onClick={() => nav.reset('C-010-1')}>다시 초대하기</Btn></Screen>
  const at = new Date(l.invited_at)
  const failed = l.status === 'declined' ? '연결이 수락되지 않았어요' : l.status === 'expired' ? '연결 요청 시간이 지났어요' : ''
  const sms = `sms:?&body=${encodeURIComponent('차를 세우면 차량 화면에 CareDrive 연결 요청이 보여요. "동의하고 연결하기"를 눌러 주세요.')}`
  return (
    <Screen nav={nav} title="" foot={<>
      <a href={sms} className="flex h-[52px] items-center justify-center rounded-[10px] bg-[#333] text-[15px] font-medium text-white">부모님께 안내 문자 보내기</a>
      <div className="flex justify-between px-4 pt-1">
        <Link onClick={() => act('child/link/resend', { linkId: l.id })}>초대 다시 보내기</Link>
        <Link onClick={() => act('child/link/cancel', { linkId: l.id }).then(() => nav.reset('boot'))}>초대 취소</Link>
      </div>
    </>}>
      <Progress step={4} />
      <H>{failed || `${l.nickname}의 수락을\n기다리고 있어요`}</H>
      <p className="text-[13px] text-[#555]">{failed ? '초대를 다시 보내거나, 차량 화면의 새 코드로 다시 연결해 주세요.' : '차가 정차하면 차량 화면에 연결 요청이 보여요.'}</p>
      <Steps items={[['초대 보냄', `${md(at.toISOString().slice(0, 10))} ${at.toTimeString().slice(0, 5)}`, 'done'], ['차량에서 수락', failed ? '수락되지 않음' : '기다리는 중', failed ? 'pending' : 'now'], ['기록 시작', '수락하면 바로', 'pending']]} />
      <Note title="부모님이 직접 수락해야 기록이 시작돼요" sub="실시간 위치는 보내지 않고, 언제든 끌 수 있어요." />
    </Screen>
  )
}

function Done({ nav, st, setSel }: Ctx) {
  const l = st?.links.find(x => x.id === nav.p.linkId)
  const nick = l?.nickname ?? '부모님'
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col gap-5 bg-white px-5 pt-12 pb-7 sm:border-x sm:border-[#ddd]">
      <Logo />
      <h1 className="text-[22px] font-bold">{jo(nick, '이', '가')} 연결을 수락했어요</h1>
      <p className="text-[13px] text-[#777]">{l?.accepted.replace(/(\d+)-0?(\d+)-0?(\d+)/, '$1년 $2월 $3일')} · {l?.vehicle.model}</p>
      <Gray className="gap-3 !py-4"><p className="text-[14px] font-bold">이제부터 이렇게 돼요</p><Bullets items={[`약 4주 동안 ${nick}의 평소 운전을 배워요.`, '다 배우면 매주 일요일 저녁에 요약을 보내드려요.', '평소와 크게 달라진 점이 오래 이어질 때만 알려드려요.']} /></Gray>
      <div className="flex-1" />
      <Btn onClick={() => { if (l) setSel(l.id); nav.reset('C-020') }}>홈으로</Btn>
    </div>
  )
}

export const ONBOARDING: Record<string, (c: Ctx) => React.ReactNode> = {
  'M-01': c => <Start {...c} />, 'C-010-1': c => <Nick {...c} />, 'C-010-2': c => <Code {...c} />,
  'C-011': c => <Free {...c} />, 'C-012': c => <Wait {...c} />, 'C-013': c => <Done {...c} />,
}
