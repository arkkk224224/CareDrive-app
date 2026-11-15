'use client'
import { useState } from 'react'
import { addDays, jo, md, mdw } from '@/lib/judge'
import { Btn, Bullets, Chip, Err, Field, Gray, inputCls, Note, Pick, Screen, Sheet } from '../ui'
import { useRelearn } from './coach'
import { Steps } from './onboarding'
import type { Ctx } from './types'

const Row = ({ label, value, onClick, icon }: { label: string; value?: string; onClick?: () => void; icon?: string }) => {
  const C = onClick ? 'button' : 'div'
  return (
    <C onClick={onClick} className="flex min-h-[52px] w-full items-center gap-3 border-b border-[#eee] text-left">
      {icon && <span className="flex size-7 items-center justify-center rounded-lg border border-[#ccc] text-[13px] text-[#555]">{icon}</span>}
      <span className="flex-1 text-[14px] font-medium">{label}</span>{value && <span className="text-[12px] text-[#777]">{value}</span>}{onClick && <span className="text-[16px] text-[#aaa]">›</span>}
    </C>
  )
}

function Settings({ nav, st, accepted, cur, act, logout }: Ctx) {
  const me = st?.me
  const rename = () => {
    const name = prompt('이름을 알려주세요 (부모님 차량 화면에 보여요)', me?.name ?? '')
    if (name === null) return
    const relation = prompt('부모님과의 관계 (예: 딸, 아들)', me?.relation ?? '') ?? ''
    act('child/profile', { name, relation })
  }
  return (
    <Screen nav={nav} title="설정" big tab="C-070">
      <button onClick={rename} className="flex items-center gap-3 text-left">
        <span className="flex size-10 items-center justify-center rounded-full bg-[#eee] text-[15px] font-bold">{me?.name?.[0] ?? '나'}</span>
        <span className="flex flex-1 flex-col"><span className="text-[16px] font-bold">{me?.name || '이름을 알려주세요'}</span><span className="text-[12px] text-[#777]">{me?.name ? `부모님께 "${me.name}님${me.relation ? `(${me.relation})` : ''}"으로 보여요` : '부모님 차량 화면에 보일 이름이에요'}</span></span><span className="text-[#aaa]">›</span>
      </button>
      <section className="flex flex-col gap-2">
        <p className="text-[12px] text-[#777]">연결된 부모님</p>
        {accepted.map(l => (
          <Gray key={l.id} onClick={() => nav.go('C-071', { linkId: l.id })} className="!flex-row items-center gap-2"><span className="flex-1 text-[14px] font-bold">{l.nickname} · {l.vehicle.model}</span><Chip dark>{l.paused ? '공유 멈춤' : '연동됨'}</Chip><span className="text-[#aaa]">›</span></Gray>
        ))}
        <button onClick={() => nav.go('C-010-1')} className="min-h-11 text-left text-[14px] font-medium">+ 부모님 추가</button>
      </section>
      <section className="flex flex-col">
        <Row icon="♪" label="알림" value="주간 · 일 오후 9시" onClick={() => nav.go('C-072')} />
        <Row icon="▦" label="기간 제외" value={cur ? `${cur.excl.length}건` : undefined} onClick={cur ? () => nav.go('C-060') : undefined} />
        <Row icon="⌂" label="생활 변화 알리기" value="이사, 은퇴 등" onClick={cur ? () => nav.go('C-073') : undefined} />
        <Row icon="▭" label="구독" onClick={() => nav.go('C-075')} />
        <Row icon="?" label="고객센터 · 약관" onClick={() => alert('고객센터 help@caredrive.app\n이용약관 · 개인정보 처리방침 · 위치기반서비스 약관은 출시 전에 확정해 게시해요.')} />
      </section>
      <section className="flex flex-col">
        <p className="text-[12px] text-[#777]">계정</p>
        <Row icon="→" label="로그아웃" onClick={() => act('child/logout', {}).finally(logout)} />
        <Row icon="○" label="회원 탈퇴" onClick={() => nav.go('C-078')} />
      </section>
    </Screen>
  )
}

function Parent(c: Ctx & { sheet?: boolean }) {
  const { nav, st, act, sheet } = c
  const l = st?.links.find(x => x.id === nav.p.linkId)
  if (!l) return null
  return (
    <Screen nav={nav} back title="" foot={<Btn kind="line" onClick={() => nav.go('C-077', { linkId: l.id })}>연결 해제</Btn>}>
      <div className="flex flex-col gap-1"><h2 className="flex items-center gap-2 text-[22px] font-bold">{l.nickname}<Chip dark>{l.paused ? '공유 멈춤' : '연동됨'}</Chip></h2><p className="text-[12px] text-[#777]">{l.vehicle.model} · {l.accepted.replaceAll('-', '.')} 연결</p></div>
      <section className="flex flex-col">
        <Row label="호칭 바꾸기" value={l.nickname} onClick={() => { const v = prompt('부모님을 어떻게 부르세요?', l.nickname); if (v) act('child/link/nickname', { linkId: l.id, nickname: v }) }} />
        <Row label="차량 변경" value={l.vehicle.model} onClick={() => nav.go(l.change ? 'C-071-W' : 'C-071-V', { linkId: l.id })} />
        <Row label={`${l.nickname} 차량에 보이는 내용`} onClick={() => alert(`${l.nickname} 차량 화면의 "이번 달 자녀에게 공유된 내용"에서, 이 앱으로 온 요약 문장을 그대로 보실 수 있어요. 검진·검사 안내는 "건강 점검 안내도 함께 전달됐어요"로만 보여요.`)} />
        <Row label="동의한 내용 보기" onClick={() => alert(`${l.accepted.replaceAll('-', '.')} 차량 화면에서 직접 동의하셨어요.\n\n"평소 운전 패턴(횟수·시간대·이동 범위)이 달라지면 자녀분께 요약해서 알려드려요. 실시간 위치는 보내지 않아요. 언제든 끌 수 있어요."`)} />
      </section>
      <p className="text-[12px] text-[#777]">이 차량에서 보는 것: 운전 횟수 · 야간 운전 · 이동 범위</p>
      {sheet && (
        <Sheet onClose={nav.back}>
          <h3 className="text-[18px] font-bold">{jo(l.nickname, '과', '와')} 연결을 해제할까요?</h3>
          <Bullets items={[`${l.nickname} 차량에서 기록이 멈춰요`, '지금까지의 기록이 지워져요', `${l.nickname} 차량 화면에도 안내가 나와요`]} />
          <Note title="자녀 앱은 100% 무료예요" sub="자녀분에게는 요금이 청구되지 않으며, 안심 연동만 해제돼요." onClick={() => nav.go('C-075')} />
          <div className="flex gap-2"><Btn kind="line" onClick={nav.back}>취소</Btn><Btn kind="line" className="!border-2 !border-[#333] !font-bold" onClick={() => act('child/link/unlink', { linkId: l.id }).then(() => nav.reset('C-020'))}>연결 해제</Btn></div>
        </Sheet>
      )}
    </Screen>
  )
}

const Toggle = ({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) => (
  <button role="switch" aria-checked={on} aria-label={label} onClick={onChange} className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 ${on ? 'justify-end bg-[#333]' : 'bg-[#ccc]'}`}><span className="size-6 rounded-full bg-white" /></button>
)
function Notify({ nav, st, act }: Ctx) {
  const s = (st?.me.settings ?? {}) as Record<string, boolean>
  const items: [string, string, string][] = [['chronic', '관찰 알림', '줄어든 모습이 두 달 가까이(56일 중 49일 이상) 이어질 때'], ['weekly', '주간 요약', '일요일 오후 9시 ›'], ['monthly', '월간 리포트', ''], ['dnd', '방해금지 시간', '22:00 ~ 07:00 ›']]
  const line = 'flex items-center gap-3 border-b border-[#eee] py-3.5'
  return (
    <Screen nav={nav} back title="알림">
      <section className="flex flex-col">
        <div className={line}><span className="flex flex-1 flex-col gap-0.5"><span className="text-[14px] font-medium">길 헤맴 알림</span><span className="text-[12px] text-[#777]">30일 안에 서로 다른 날 두 번 헤매시면 알려드려요</span></span><span className="text-[12px] text-[#555]">항상 켜짐</span></div>
        {items.map(([k, label, sub]) => (
          <div key={k} className={line}><span className="flex flex-1 flex-col gap-0.5"><span className="text-[14px] font-medium">{label}</span>{sub && <span className="text-[12px] text-[#777]">{sub}</span>}</span><Toggle label={label} on={s[k] !== false} onChange={() => act('child/settings', { [k]: s[k] === false })} /></div>
        ))}
      </section>
      <p className="text-[11px] leading-normal text-[#888]">알림 기준은 바꿀 수 없어요. 너무 자주 또는 늦게 알리지 않도록 정해 둔 기준이에요.</p>
    </Screen>
  )
}

function Exclusions(c: Ctx & { sheet?: boolean }) {
  const { nav, cur, st, act, sheet } = c
  const [kind, setKind] = useState('여행')
  const [start, setStart] = useState(st?.today ?? '')
  const [end, setEnd] = useState(st ? addDays(st.today, 3) : '')
  const [err, setErr] = useState('')
  if (!cur || !st) return null
  const list = (title: string, items: typeof cur.excl, tag: string) => items.length > 0 && (
    <section className="flex flex-col gap-1"><p className="text-[12px] text-[#777]">{title}</p>
      {items.map(e => (
        <div key={e.id} className="flex items-center border-b border-[#eee] py-3"><span className="flex flex-1 flex-col gap-0.5"><span className="text-[14px] font-bold">{e.kind}</span><span className="text-[12px] text-[#777]">{mdw(e.start)} ~ {mdw(e.end)}</span></span><span className="pr-3 text-[12px] text-[#555]">{tag}</span><button aria-label="삭제" onClick={() => confirm('이 기간을 지울까요?') && act('child/exclusion/delete', { linkId: cur.id, id: e.id })} className="size-11 text-[#999]">×</button></div>
      ))}
    </section>
  )
  return (
    <Screen nav={nav} back title="기간 제외">
      <p className="text-[13px] leading-normal text-[#555]">여행 · 입원처럼 평소와 다르게 지내는 기간을 알려주세요. 그 기간은 평소 운전 계산과 알림에서 빼요.</p>
      {list('예정', cur.excl.filter(e => e.end >= st.today), '예정')}
      {list('지난 기간', cur.excl.filter(e => e.end < st.today), '반영됨')}
      <Btn kind="line" onClick={() => nav.go('C-060-A')}>+ 기간 추가</Btn>
      <p className="text-[11px] leading-normal text-[#888]">이미 받은 알림의 기간을 빼면, 다시 계산해 조건에 맞지 않을 때 알림이 &quot;지난 알림&quot;으로 옮겨져요.</p>
      {sheet && (
        <Sheet onClose={nav.back}>
          <h3 className="text-[18px] font-bold">기간 추가</h3>
          <Pick options={['여행', '입원', '기타']} value={kind} onChange={setKind} />
          <Field label="시작일"><input type="date" value={start} onChange={e => setStart(e.target.value)} className={inputCls} /></Field>
          <Field label="종료일"><input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} className={inputCls} /></Field>
          <p className="text-[12px] text-[#777]">최대 30일까지 뺄 수 있어요.</p>
          <Err msg={err} />
          <div className="flex gap-2"><Btn kind="line" onClick={nav.back}>취소</Btn><Btn onClick={() => act('child/exclusion/add', { linkId: cur.id, kind, start, end }).then(nav.back, e => setErr(e.message))}>저장</Btn></div>
        </Sheet>
      )}
    </Screen>
  )
}

function LifeChange(c: Ctx) {
  const { nav, st, cur, ev } = c
  const f = useRelearn({ c, options: ['이사', '은퇴', '기타'], onDone: () => nav.reset('C-020') })
  return (
    <Screen nav={nav} back title="생활 변화 알리기" foot={<><Err msg={f.err} /><Btn disabled={!f.kind || !f.day} onClick={f.save}>저장</Btn></>}>
      <h2 className="text-[18px] font-bold">어떤 변화가 있었나요?</h2>
      <Pick options={f.options} value={f.kind} onChange={f.setKind} />
      <Field label="바뀐 날"><input type="date" value={f.day} min={cur?.accepted} max={st?.today} onChange={e => f.setDay(e.target.value)} className={inputCls} /></Field>
      <Note title="평소 운전을 새로 배워요" sub={`생활이 바뀌면 운전도 달라져요. 저장하면 그날부터 28일 동안 새로 배워요. 그동안 리포트는 지금 기준(${ev?.base?.label ?? '처음'})으로 볼 수 있고, 다 배우면 새 기준과 비교해요.`} />
    </Screen>
  )
}

function Subscription({ nav, cur }: Ctx) {
  const v = cur?.vehicle
  return (
    <Screen nav={nav} back title="구독">
      <Gray className="gap-1 !py-4"><p className="text-[12px] text-[#777]">연동된 부모님 차량</p><p className="text-[15px] font-bold">{v ? `현대 ${v.model}${v.plate ? ` (${v.plate})` : ''}` : '연결된 차량이 없어요'}</p><p className="pt-2 text-[12px] text-[#777]">차량 구독 상태</p><p className="text-[15px] font-bold">{!v ? '-' : v.subscription === 'active' ? '정상 이용 중 (월 3,900원 / Pleos)' : '차량 구독이 만료됐어요'}</p></Gray>
      <Gray className="gap-1 !py-4"><p className="text-[14px] font-bold">과금 정책 안내</p><p className="text-[12px] leading-normal text-[#555]">차량 앱 마켓(Pleos)에서 구독을 관리합니다. 자녀 모바일 앱에는 어떠한 요금도 청구되지 않아요.</p></Gray>
    </Screen>
  )
}

function Leave({ nav, act, logout }: Ctx) {
  const [ok, setOk] = useState(false)
  return (
    <Screen nav={nav} back title="회원 탈퇴" foot={<><p className="text-[11px] text-[#888]">확인에 체크하면 탈퇴할 수 있어요</p><div className="flex gap-2"><Btn kind="line" onClick={nav.back}>취소</Btn><Btn disabled={!ok} onClick={() => act('child/delete-account', {}).catch(() => {}).finally(logout)}>탈퇴하기</Btn></div></>}>
      <h2 className="text-[18px] font-bold">탈퇴하기 전에 확인해 주세요</h2>
      <Bullets items={['모든 부모님과의 연결이 해제되고 기록이 지워져요', '자녀 앱은 완전 무료이며, 추가 결제가 없어요']} />
      <Note title="부모님 차량의 Pleos 구독은 차량에서 관리돼요" />
      <label className="flex min-h-11 items-center gap-2.5 text-[14px]"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="size-5 accent-[#333]" />위 내용을 확인했어요</label>
    </Screen>
  )
}

function CarChange({ nav, st, act }: Ctx) {
  const l = st?.links.find(x => x.id === nav.p.linkId)
  const [model, setModel] = useState('')
  const [plate, setPlate] = useState('')
  if (!l) return null
  return (
    <Screen nav={nav} back title="차량 변경" foot={<><p className="text-[11px] leading-normal text-[#888]">다음을 누르면 새 차량으로 초대 코드를 보내요. 지금 차량({l.vehicle.model})의 기록은 새 차량이 연결될 때까지 이어서 받아요.</p><Btn disabled={!model.trim()} onClick={() => act('child/vehicle-change', { linkId: l.id, model, plate }).then(() => nav.go('C-071-W', { linkId: l.id }))}>새 차량으로 초대 보내기</Btn></>}>
      <h2 className="text-[18px] font-bold">{l.nickname}의 새 차량을 알려주세요</h2>
      <Field label="차량 모델"><input value={model} onChange={e => setModel(e.target.value)} placeholder="그랜저" maxLength={20} className={inputCls} /></Field>
      <Field label="차량 번호 (선택)"><input value={plate} onChange={e => setPlate(e.target.value)} placeholder="12가 3456" maxLength={12} className={inputCls} /></Field>
      <Note title="운전 기록은 그대로 이어져요" sub="운전하시는 분은 그대로라서 지금까지의 기록과 평소 기준을 계속 써요. 새 차량과는 다시 연결해야 해요." />
    </Screen>
  )
}

function CarWait({ nav, st, act }: Ctx) {
  const l = st?.links.find(x => x.id === nav.p.linkId)
  if (!l?.change) return null
  const at = new Date(l.change.at)
  return (
    <Screen nav={nav} back title="차량 변경" foot={<><Btn kind="line" onClick={() => act('child/vehicle-change', { linkId: l.id, ...l.change })}>초대 다시 보내기</Btn><Btn kind="text" onClick={() => act('child/vehicle-change/cancel', { linkId: l.id }).then(() => nav.reset('C-070'))}>차량 변경 취소</Btn></>}>
      <h2 className="text-[22px] leading-normal font-bold">{l.nickname}의 수락을<br />기다리고 있어요</h2>
      <p className="text-[13px] text-[#555]">새 차량({l.change.model})에서 정차하면 연결 요청이 보여요.</p>
      <button className="text-left" onClick={() => act('child/vehicle-change/confirm', { linkId: l.id }).then(() => nav.reset('C-071-X', { model: l.change!.model, old: l.vehicle.model }))}>
        <Steps items={[['새 차량으로 초대 보냄', `${md(at.toISOString().slice(0, 10))} ${at.toTimeString().slice(0, 5)}`, 'done'], ['새 차량에서 수락', '기다리는 중', 'now'], ['이어서 기록', '수락하면 바로', 'pending']]} />
      </button>
      <Note title="초대 코드" sub={`${l.change.code} · 24시간 동안 쓸 수 있어요`} />
    </Screen>
  )
}

function CarDone({ nav }: Ctx) {
  return (
    <Screen nav={nav} title="" foot={<Btn onClick={() => nav.reset('C-070')}>확인</Btn>}>
      <div className="flex flex-1 flex-col justify-center gap-2"><h2 className="text-[22px] font-bold">{jo(nav.p.model, '과', '와')} 연결됐어요</h2><p className="text-[13px] leading-normal text-[#555]">지금까지의 기록과 평소 기준이 그대로 이어져요. {jo(nav.p.old, '과', '와')}의 연결은 끝났어요.</p></div>
    </Screen>
  )
}

export const SETTINGS: Record<string, (c: Ctx) => React.ReactNode> = {
  'C-070': c => <Settings {...c} />, 'C-071': c => <Parent {...c} />, 'C-077': c => <Parent {...c} sheet />, 'C-072': c => <Notify {...c} />,
  'C-060': c => <Exclusions {...c} />, 'C-060-A': c => <Exclusions {...c} sheet />, 'C-073': c => <LifeChange {...c} />, 'C-075': c => <Subscription {...c} />,
  'C-078': c => <Leave {...c} />, 'C-071-V': c => <CarChange {...c} />, 'C-071-W': c => <CarWait {...c} />, 'C-071-X': c => <CarDone {...c} />,
}
