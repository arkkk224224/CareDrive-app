'use client'
import { useState } from 'react'
import { md } from '@/lib/judge'
import { Btn, Chip, Err, Field, inputCls, Note, Pick, Screen, Sheet } from '../ui'
import type { Ctx } from './types'

const GUIDE = {
  A: {
    title: '건강검진 권하는 방법', place: '가까운 건강검진 기관', tag: '국가건강검진 · 운영 시간 표시', more: '기관 더 보기', done: '건강검진을 다녀오셨나요?', q: '건강검진',
    talks: [['"이번에 건강검진 같이 갈까요? 저도 받으려고요."', '운전 이야기 대신 함께하는 검진으로 제안해 보세요'], ['"요즘 잠은 잘 주무세요? 밖에 나가기 귀찮진 않으세요?"', '운전이 줄어든 건 기분이나 체력 변화 때문일 수도 있어요']],
    // shortcut: 기관 목록은 와이어프레임의 자리표시 값이다, 공공데이터(검진기관·치매안심센터) API 연동 시 교체.
    places: [['OO구 보건소', '1.2km'], ['△△내과의원 (국가건강검진 기관)', '2.4km'], ['□□종합병원 건강검진센터', '3.8km']],
  },
  B: {
    title: '기억력 검사 권하는 방법', place: '가까운 치매안심센터', tag: '무료 선별검사 · 운영 시간 표시', more: '센터 더 보기', done: '기억력 검사를 다녀오셨나요?', q: '치매안심센터',
    talks: [['"요즘 길 찾기는 어떠세요? 저도 가끔 헷갈리더라고요."', '길을 잃었다고 몰아세우지 말고 편하게 물어보세요'], ['"치매안심센터에서 무료로 기억력 검사를 해준대요. 같이 가볼까요?"', '검사는 진단이 아니라 확인이에요. 괜찮으면 안심할 수 있어요']],
    places: [['OO구 치매안심센터', '1.2km'], ['△△동 보건지소 치매안심센터', '2.4km'], ['□□구 광역치매센터', '3.8km']],
  },
}

function Hub({ nav, cur }: Ctx) {
  const live = (k: string) => cur?.alerts.find(a => a.kind === k && !a.archived)
  const nick = cur?.nickname ?? '부모님', chronic = live('chronic'), wander = live('wander')
  const card = (to: string, chip: string, title: string, sub: string) => (
    <button onClick={() => nav.go(to)} className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-[#333] p-4 text-left">
      <Chip dark>{chip}</Chip><span className="text-[16px] font-bold">{title}</span><span className="text-[13px] leading-normal text-[#555]">{sub}</span><span className="self-end text-[13px] font-medium underline">방법 보기 ›</span>
    </button>
  )
  return (
    <Screen nav={nav} title="코칭" big tab="C-040">
      <p className="text-[13px] text-[#555]">{nick}와 이야기할 때 도움이 되는 방법이에요</p>
      {/* 낙인 방지: 건강검진은 관찰 알림이 있을 때, 치매안심센터는 길 헤맴 알림(30일 2회)이 있을 때만 보인다 */}
      {chronic && card('C-040A', `관찰 알림 · ${md(chronic.day)}`, `${nick}께 건강검진 권하는 방법`, '외출과 밤 운전이 줄었을 때 부담 없이 꺼내는 말과 가까운 검진 기관')}
      {wander && card('C-040B', `길 헤맴 알림 · ${md(wander.day)}`, `${nick}께 기억력 검사 권하는 방법`, '치매안심센터의 무료 검사를 함께 가자고 권하는 말과 가까운 센터')}
      {cur && <Note title="검진이나 검사를 다녀오셨나요?" sub="알려주시면 그날부터 평소 운전을 새로 배워요" onClick={() => nav.go('C-061')} />}
      <p className="text-[11px] leading-normal text-[#888]">알림이 없을 때는 이 화면에 안내만 보여요. 코칭은 알림이 온 뒤에 생겨요.</p>
    </Screen>
  )
}

function Guide({ nav, cur, kind }: Ctx & { kind: 'A' | 'B' }) {
  const g = GUIDE[kind], line = 'flex h-11 flex-1 items-center justify-center rounded-lg border border-[#999] text-[13px] font-medium'
  return (
    <Screen nav={nav} back title={g.title} tab="C-040">
      <h2 className="text-[20px] font-bold">이렇게 이야기해 보세요</h2>
      {g.talks.map(([say, tip], i) => (
        <section key={say} className="flex flex-col items-start gap-2 rounded-[14px] border border-[#ddd] p-4"><Chip>대화 예시 {i + 1}</Chip><p className="text-[15px] leading-normal font-bold">{say}</p><p className="text-[12px] text-[#666]">{tip}</p></section>
      ))}
      <div className="flex items-center border-t border-[#e6e6e6] pt-4"><h3 className="flex-1 text-[15px] font-bold">{g.place}</h3><span className="text-[11px] text-[#888] underline">{cur?.nickname} 집 기준 · 변경</span></div>
      <section className="flex flex-col rounded-[14px] border border-[#ddd]">
        {g.places.map(([name, km], i) => (
          <div key={name} className={`flex flex-col gap-2 p-3.5 ${i ? 'border-t border-[#e6e6e6]' : ''}`}>
            <p className="flex text-[14px] font-bold"><span className="flex-1">{name}</span><span className="text-[12px] font-normal text-[#777]">{km}</span></p><p className="text-[12px] text-[#777]">{g.tag}</p>
            <div className="flex gap-2"><a href="tel:1577-1000" className={line}>전화하기</a><a href={`https://map.naver.com/p/search/${encodeURIComponent(g.q)}`} target="_blank" rel="noreferrer" className={line}>지도 보기</a></div>
          </div>
        ))}
      </section>
      <a href={`https://map.naver.com/p/search/${encodeURIComponent(g.q)}`} target="_blank" rel="noreferrer" className="self-center text-[14px] font-medium underline">{g.more}</a>
      <Note title={g.done} sub="완료 입력하기" onClick={() => nav.go('C-061', { kind: kind === 'A' ? '건강검진' : '기억력 검사' })} />
    </Screen>
  )
}

/** 검진·검사 완료, 생활 변화 → 그날부터 평소 운전을 새로 배운다. */
export function useRelearn({ c, options, first, onDone }: { c: Ctx; options: string[]; first?: string; onDone: () => void }) {
  const [kind, setKind] = useState(first ?? '')
  const [day, setDay] = useState(c.st?.today ?? '')
  const [err, setErr] = useState('')
  const save = () => c.act('child/relearn', { linkId: c.cur!.id, day, reason: kind }).then(onDone, e => setErr(e.message))
  return { kind, setKind, day, setDay, err, save, options }
}

function DoneSheet(c: Ctx) {
  const { nav, cur, st, ev } = c
  const f = useRelearn({ c, options: ['건강검진', '기억력 검사'], first: nav.p.kind, onDone: () => nav.reset('C-020') })
  return (
    <>
      <Hub {...c} />
      <Sheet onClose={nav.back}>
        <h3 className="text-[18px] font-bold">어떤 걸 다녀오셨나요?</h3>
        <Pick options={f.options} value={f.kind} onChange={f.setKind} />
        <Field label="다녀온 날"><input type="date" value={f.day} min={cur?.accepted} max={st?.today} onChange={e => f.setDay(e.target.value)} className={inputCls} /></Field>
        <p className="text-[12px] leading-normal text-[#666]">저장하면 그날부터 28일 동안 {cur?.nickname}의 평소 운전을 새로 배워요. 그동안에도 리포트는 지금 기준({ev?.base?.label ?? '처음'})으로 볼 수 있고, 알림은 보내지 않아요.</p>
        <Err msg={f.err} />
        <div className="flex gap-2"><Btn kind="line" onClick={nav.back}>취소</Btn><Btn disabled={!f.kind || !f.day} onClick={f.save}>저장</Btn></div>
      </Sheet>
    </>
  )
}

export const COACH: Record<string, (c: Ctx) => React.ReactNode> = {
  'C-040': c => <Hub {...c} />, 'C-040A': c => <Guide {...c} kind="A" />, 'C-040B': c => <Guide {...c} kind="B" />, 'C-061': c => <DoneSheet {...c} />,
}
