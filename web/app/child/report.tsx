'use client'
import { useState } from 'react'
import { addDays, aggregate, chipOf, compare, diff, dow, fmt, jo, joinKo, kdate, LEARN_DAYS, md, mdw, WD, type Baseline, type Key, type Metrics } from '@/lib/judge'
import { Btn, Bullets, Chip, Gray, Link as A, Note, Screen, Sheet, StateChip } from '../ui'
import { ROWS, Switcher } from './home'
import type { Ctx, WanderEv } from './types'

const lost = (w: WanderEv) => w.response === 'accept' || w.response === 'none'
const answer = (w: WanderEv) => ({ accept: '집 안내 받으심', none: '대답 없으심', refuse: '괜찮다고 하심', destination: '목적지를 말씀하심' })[w.response] ?? ''
const monday = (d: string) => addDays(d, -((dow(d) + 6) % 7))
/** "11월 2주": 그 주 목요일이 속한 달 기준. */
const weekLabel = (mon: string) => { const t = addDays(mon, 3); return `${+t.slice(5, 7)}월 ${Math.ceil(+t.slice(8, 10) / 7)}주` }
const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="flex flex-col gap-2"><h3 className="text-[16px] font-bold">{title}</h3>{children}</section>
const P = ({ children }: { children: React.ReactNode }) => <p className="text-[13px] leading-relaxed text-[#333]">{children}</p>
const How = ({ children }: { children: React.ReactNode }) => <div className="flex flex-col gap-1"><p className="text-[11px] text-[#888]">측정 기준</p><p className="text-[11px] leading-normal text-[#888]">{children}</p></div>
const Disclaimer = () => <p className="text-[11px] text-[#888]">이 화면은 진단이 아니에요. 운전 기록의 변화만 보고 알려드려요.</p>

/** 기간(주·월) 지표 3줄. period 는 그 기간의 집계, base 는 그때 쓰던 기준. */
function Rows({ period, base, cmp, tripsText }: { period: Metrics; base: Baseline; cmp: ReturnType<typeof compare>; tripsText: string }) {
  const text: Record<Key, string> = {
    trips: `${tripsText} · 평소 주 ${fmt.trips(base)}`,
    night: `10번 중 ${fmt.night(period)} · 평소 10번 중 ${fmt.night(base)}`,
    radius: `평균 ${fmt.radius(period)} · 평소 ${fmt.radius(base)}`,
  }
  return <>{ROWS.map(([k, label], i) => (
    <div key={k} className={`flex items-center gap-2.5 py-3.5 ${i ? 'border-t border-[#e6e6e6]' : ''}`}>
      <span className="flex flex-1 flex-col gap-0.5"><span className="text-[14px] font-medium">{label}</span><span className="text-[12px] text-[#777]">{text[k]}</span></span>
      <StateChip label={chipOf(cmp.ratio[k])} />
    </div>
  ))}</>
}

function Report(c: Ctx & { monthly?: boolean }) {
  const { nav, st, cur, ev, monthly } = c
  const [off, setOff] = useState(0)
  if (!st || !cur || !ev) return <Screen nav={nav} title="리포트" big tab="C-030"><p className="py-10 text-center text-[13px] text-[#888]">연결된 차량이 없어요.</p></Screen>
  const today = st.today
  // 기간의 시작·끝
  let from: string, to: string, title: string, sub = ''
  if (monthly) {
    const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 + off - (nav.p.day ? 1 : 0), 1))
    from = d.toISOString().slice(0, 10)
    to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
    title = `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`
  } else {
    from = addDays(monday(nav.p.day ?? today), off * 7); to = addDays(from, 6)
    title = weekLabel(from); sub = `${mdw(from)} ~ ${mdw(to)}`
  }
  const end = to < today ? to : today
  const base = ev.baselines.filter(b => b.effective <= end).at(-1)
  const inRange = ev.hist.filter(d => d >= from && d <= end)
  const rolling = aggregate(ev.hist.filter(d => d <= end).slice(-LEARN_DAYS), ev.byDay)
  const period = monthly ? aggregate(inRange, ev.byDay) : rolling
  const cmp = base ? compare(period, base) : null
  const learning = ev.learning && ev.learning.from <= end
  const tripsWeek = inRange.reduce((s, d) => s + (ev.byDay.get(d)?.trips ?? 0), 0)
  const m = +from.slice(5, 7)
  const summary = !base ? ['평소 운전을 배우는 중이에요', '다 배우면 평소와 비교해서 보여드려요.']
    : cmp!.declined.length
      ? monthly ? [`${joinKo(cmp!.declined)} 줄어든 상태가 이어지고 있어요`, '아직 상황을 더 지켜보고 있어요.'] : [`${joinKo(cmp!.declined)} ${learning ? base.label + '보다 줄어든 상태예요' : '평소보다 줄어든 상태가 이어졌어요'}`, learning ? `새 기준을 배우는 동안에도 ${jo(base.label, '과', '와')} 비교해서 보여드려요.` : `${cur.nickname}의 ${base.label}(평소)과 비교했어요.`]
      : [`${base.label === ev.baselines[0].label ? '' : base.label + ' '}평소와 비슷해요`, `${cur.nickname}의 ${base.label}(평소)과 비교했어요.`]
  const excluded = (d: string) => cur.excl.some(e => e.start <= d && d <= e.end)
  const wander = (d: string) => cur.wanders.some(w => w.day === d && lost(w))
  const cell = (d: string, wide: boolean) => {
    const trips = ev.byDay.get(d)?.trips ?? 0, w = wander(d), future = d > today || d < cur.accepted
    return (
      <button key={d} disabled={future} onClick={() => nav.go('C-032', { day: d })} className={`flex ${wide ? 'h-[58px]' : 'h-11'} flex-1 flex-col items-center justify-center gap-0.5 rounded-lg disabled:opacity-100 ${w ? 'bg-[#333] text-white' : excluded(d) ? 'bg-[#e6e6e6]' : wide ? 'bg-[#f4f4f4]' : ''}`}>
        {wide && <span className={`text-[10px] ${w ? 'text-white' : 'text-[#888]'}`}>{WD[dow(d)]}</span>}
        <span className={`text-[14px] ${wide ? 'font-bold' : ''} ${future ? 'text-[#bbb]' : ''}`}>{+d.slice(8)}</span>
        <span className={`size-1 rounded-full ${trips ? (w ? 'bg-white' : 'bg-[#333]') : ''}`} />
      </button>
    )
  }
  const days: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  const tripExcl = cur.excl.find(e => e.end >= from && e.start <= to)
  return (
    <Screen nav={nav} title="리포트" big tab="C-030">
      <Switcher {...c} />
      <div className="flex shrink-0 rounded-[10px] bg-[#eee] p-1">
        {['주간', '월간'].map((t, i) => <button key={t} onClick={() => nav.reset(i ? 'C-030-M' : 'C-030')} aria-pressed={!!i === !!monthly} className={`h-9 flex-1 rounded-lg text-[13px] ${!!i === !!monthly ? 'bg-white font-bold text-[#222]' : 'text-[#777]'}`}>{t}</button>)}
      </div>
      <div className="flex shrink-0 items-center">
        <button aria-label="이전" onClick={() => setOff(off - 1)} disabled={to < cur.accepted} className="size-11 text-[18px] text-[#888]">‹</button>
        <div className="flex flex-1 flex-col items-center"><p className="text-[16px] font-bold">{title}</p>{sub && <p className="text-[12px] text-[#888]">{sub}</p>}</div>
        <button aria-label="다음" onClick={() => setOff(off + 1)} disabled={to >= today} className="size-11 text-[18px] text-[#888]">›</button>
      </div>
      {learning && base && <div className="flex items-center gap-2"><Chip dark>새 기준 배우는 중</Chip><span className="text-[12px] text-[#666]">{LEARN_DAYS}일 중 {Math.min(ev.learning!.days, LEARN_DAYS)}일째</span></div>}
      {ev.baselines.length + (learning && base ? 1 : 0) > 1 && base && <Note title="비교 기준" sub={`${base.label} (${md(base.from)} ~ ${md(base.to)})`} onClick={() => nav.go('C-033')} />}
      <Gray className="gap-1.5 !py-4"><p className="text-[12px] text-[#777]">{monthly ? `${m}월 요약` : '이번 주 요약'}</p><p className="text-[17px] leading-normal font-bold">{summary[0]}</p><p className="text-[12px] text-[#666]">{summary[1]}</p></Gray>
      {base && cmp && (
        <section className="flex flex-col rounded-[14px] border border-[#ddd] px-4 pt-4 pb-1">
          <button onClick={() => nav.go('C-031')} className="flex min-h-6 items-center"><h3 className="flex-1 text-left text-[15px] font-bold">지표</h3><span className="text-[12px] text-[#555]">자세히 보기 ›</span></button>
          <Rows period={period} base={base} cmp={cmp} tripsText={monthly ? `${m}월 주 평균 ${period.trips.toFixed(1)}번` : `이번 주 ${tripsWeek}번`} />
        </section>
      )}
      <section className="flex flex-col gap-3 rounded-[14px] border border-[#ddd] p-4">
        <h3 className="text-[15px] font-bold">날짜별 기록</h3>
        {monthly ? (
          <div className="grid grid-cols-7 gap-y-1">
            {WD.map(w => <span key={w} className="pb-1 text-center text-[11px] text-[#888]">{w}</span>)}
            {Array.from({ length: dow(from) }, (_, i) => <span key={i} />)}
            {days.map(d => cell(d, false))}
          </div>
        ) : <div className="flex gap-1">{days.map(d => cell(d, true))}</div>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#666]">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-[#333]" />운전한 날</span>
          {days.some(wander) && <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-[#333]" />헤맨 일이 있던 날</span>}
          {tripExcl && <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-[#e6e6e6]" />계산에서 뺀 기간 ({tripExcl.kind} {md(tripExcl.start)}~{md(tripExcl.end).split('/')[1]})</span>}
        </p>
        <p className="text-[12px] text-[#777]">{learning && base ? `${ev.learning!.reason} 이후 기록은 새 기준을 배우는 데 쓰여요.` : '날짜를 누르면 그날의 기록을 볼 수 있어요.'}</p>
      </section>
    </Screen>
  )
}

function DayView({ nav, cur, ev }: Ctx) {
  const d = nav.p.day, r = ev?.byDay.get(d), ws = cur?.wanders.filter(w => w.day === d && lost(w)) ?? []
  const sent = cur?.alerts.some(a => a.kind === 'wander' && a.day === d)
  return (
    <Screen nav={nav} back title={`${kdate(d)} (${WD[dow(d)]})`}>
      <Gray className="gap-3 !py-4">
        <p className="text-[12px] text-[#777]">이날의 운전</p>
        <div className="flex">{[['운전', `${r?.trips ?? 0}번`], ['해 진 뒤', `${r?.night ?? 0}번`], ['집에서 평균', r ? `${r.radius.toFixed(1)}km` : '-']].map(([k, v]) => <div key={k} className="flex flex-1 flex-col gap-1"><span className="text-[11px] text-[#888]">{k}</span><span className="text-[17px] font-bold">{v}</span></div>)}</div>
      </Gray>
      {ws.map(w => (
        <button key={w.id} onClick={() => nav.go('C-052-R', { id: w.id })} className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-[#333] p-4 text-left">
          <span className="flex w-full items-center"><Chip dark>길 헤맴</Chip><span className="flex-1" /><span className="text-[12px] text-[#555]">{answer(w)}</span></span>
          <span className="text-[15px] font-bold">평소 다니던 길에서 약 {w.minutes}분 헤매신 일이 있었어요</span><span className="self-end text-[13px] font-medium underline">상세보기 ›</span>
        </button>
      ))}
      {sent && <Note title="이날이 30일 안에 두 번째라" sub="길 헤맴 알림을 보내드렸어요" onClick={() => nav.go('C-052')} />}
      {!ws.length && <p className="text-[14px]">{r ? '이날은 특별한 일이 없었어요.' : '이날은 운전 기록이 없어요.'}</p>}
      <Gray><p className="text-[13px] font-bold">하루 요약만 보여드려요</p><p className="text-[12px] leading-normal text-[#666]">다니신 장소와 시간은 저장하지 않아요. 길을 헤매신 날만 그날 있었던 일을 보여드려요.</p></Gray>
    </Screen>
  )
}

const Bar = ({ label, text, v, dark }: { label: string; text: string; v: number; dark?: boolean }) => (
  <div className="flex items-center gap-3"><span className="w-7 text-[11px] text-[#888]">{label}</span><span className={`h-2 rounded ${dark ? 'bg-[#333]' : 'bg-[#bbb]'}`} style={{ width: `${Math.max(v, 0.04) * 45}%` }} /><span className={`text-[12px] ${dark ? 'font-bold' : 'text-[#555]'}`}>{text}</span></div>
)
const valueText = (k: Key, m: Metrics) => (k === 'trips' ? `일주일에 ${fmt.trips(m)}` : k === 'night' ? `10번 중 ${fmt.night(m)}` : fmt.radius(m))
const SUB: Record<Key, string> = { trips: '운전해서 나가신 횟수', night: '해가 진 뒤에 운전하신 비율', radius: '집에서 평균 거리' }
const Exceptions = ({ items, link, onClick }: { items: string[]; link: string; onClick: () => void }) => (
  <Gray className="gap-2.5 !py-4"><p className="text-[13px] font-bold">이런 경우라면 걱정하지 않으셔도 돼요</p><Bullets items={items} /><A onClick={onClick}>{link} ›</A></Gray>
)

function Why({ nav, cur, ev }: Ctx) {
  if (!cur || !ev?.base) return <Screen nav={nav} back title="지표"><p className="py-10 text-center text-[13px] text-[#888]">평소 운전을 다 배우면 볼 수 있어요.</p></Screen>
  const nick = cur.nickname, cmp = compare(ev.now, ev.base), max = Math.max
  const alerted = cur.alerts.some(a => a.kind === 'chronic' && !a.archived)
  const one = cmp.declined.includes('trips') && cmp.declined.includes('night') ? `${jo(nick, '이', '가')} 요즘 예전보다 외출이 줄고, 밤에는 거의 운전하지 않으세요.`
    : cmp.declined.length ? `${nick}의 ${joinKo(cmp.declined)} 예전보다 줄었어요.` : `${jo(nick, '은', '는')} 요즘도 예전과 비슷하게 다니고 계세요.`
  return (
    <Screen nav={nav} back title="지표">
      <Gray className="gap-2 !py-4"><p className="text-[12px] text-[#777]">한 줄 요약</p><p className="text-[16px] leading-normal font-bold">{one}</p>{alerted && <><p className="text-[13px] text-[#555]">이런 모습이 두 달 가까이 이어지고 있어요.</p><p className="text-[13px] font-bold">건강검진을 한번 받아보시길 권해요.</p></>}</Gray>
      <Sec title="무엇이 달라졌나요?"><p className="text-[12px] leading-normal text-[#666]">{jo(nick, '이', '가')} {ev.base.label === ev.baselines[0].label ? `서비스를 처음 쓰기 시작한 ${ev.base.label}` : ev.base.label}의 모습과 요즘을 비교했어요.</p></Sec>
      {ROWS.map(([k, label]) => {
        const chip = chipOf(cmp.ratio[k]), top = max(ev.base![k], ev.now[k]) || 1
        return (
          <section key={k} className={`flex flex-col gap-2.5 rounded-[14px] p-4 ${chip === '줄었어요' ? 'border-[1.5px] border-[#333]' : 'border border-[#ddd]'}`}>
            <div className="flex items-start"><div className="flex flex-1 flex-col gap-0.5"><h3 className="text-[15px] font-bold">{label}</h3><p className="text-[12px] text-[#777]">{SUB[k]}</p></div><StateChip label={chip} /></div>
            <Bar label="예전" text={valueText(k, ev.base!)} v={ev.base![k] / top} />
            <Bar label="요즘" text={valueText(k, ev.now)} v={ev.now[k] / top} dark={chip === '줄었어요'} />
            <div><A onClick={() => nav.go('C-031-R', { k })}>상세보기</A></div>
          </section>
        )
      })}
      <Exceptions items={['추워져서 외출을 줄이셨어요 (첫 1년은 계절 영향이 섞일 수 있어요)', '여행 · 입원 · 명절이 있었어요', '다른 가족이 대신 운전했어요']} link="해당하는 기간이 있다면 기간 제외하기" onClick={() => nav.go('C-060')} />
      {alerted && <Btn onClick={() => nav.go('C-040A')}>코칭으로 넘어가기</Btn>}
      <Disclaimer />
    </Screen>
  )
}

const DETAIL: Record<Key, { title: string; mean: (n: string, down: boolean) => string; note: string; how: string }> = {
  trips: { title: '외출 횟수 상세', mean: (n, d) => (d ? `${jo(n, '이', '가')} 차를 타고 밖에 나가시는 일이 줄었다는 뜻이에요. 장보기 · 병원 · 모임 같은 바깥 활동이 예전보다 적어졌어요.` : `${jo(n, '이', '가')} 차를 타고 밖에 나가시는 횟수는 예전과 비슷해요.`), note: '활동이 크게, 오래 줄면 체력 · 관절이나 기분 · 의욕 같은 몸과 마음의 변화가 원인일 때가 있어요. 생활 반경이 좁아지는 것은 노쇠나 우울과 함께 나타나는 경우가 많다는 연구도 있어요.', how: '시동을 켜고 끌 때까지를 1번으로 세고, 최근 4주 합계를 일주일 평균으로 바꿨어요.' },
  night: { title: '밤 운전 상세', mean: (n, d) => (d ? `${jo(n, '이', '가')} 어두울 때 운전하는 것을 피하고 계시다는 뜻이에요.` : '해가 진 뒤에 운전하시는 비율은 예전과 비슷해요.'), note: '밤 운전을 피하는 건 어두운 곳에서 잘 안 보이는 시력 변화 때문인 경우가 많아요. 스스로 조심하시는 좋은 습관일 수도 있어요.', how: '전조등을 켜고 달린 시간을 전체 운전 시간으로 나눠요. 터널 · 흐린 날 점등은 해 지는 시각으로 걸러내요.' },
  radius: { title: '다니는 거리 상세', mean: (_, d) => (d ? '집에서 가까운 곳 위주로 다니시게 됐다는 뜻이에요.' : '가시는 곳의 범위는 그대로라는 뜻이에요. 다니는 곳은 같고, 나가시는 횟수가 줄어든 쪽에 가까워요.'), note: '다니는 거리는 다른 지표와 함께 볼 때 의미가 있어요. 이 지표 하나만 달라졌다면 참고로만 보시면 돼요.', how: '운전할 때마다 집에서 멈춘 곳까지의 거리를 재고 평균을 냈어요. 가장 먼 거리만 보지는 않아요.' },
}
function Detail({ nav, cur, ev, st }: Ctx) {
  const k = (nav.p.k ?? 'trips') as Key, t = DETAIL[k]
  if (!cur || !ev?.base || !st) return null
  const base = ev.base, cmp = compare(ev.now, base), down = chipOf(cmp.ratio[k]) === '줄었어요'
  const week = (end: string) => aggregate(ev.hist.filter(d => d > addDays(end, -7) && d <= end), ev.byDay)[k]
  // 회색 4주(기준을 만든 기간) + 검은 8주(최근)
  const bars = [...[0, 1, 2, 3].map(i => week(addDays(base.from, i * 7 + 6))), ...[7, 6, 5, 4, 3, 2, 1, 0].map(i => week(addDays(st.today, -i * 7)))]
  const top = Math.max(...bars, base[k]) * 1.1 || 1
  return (
    <Screen nav={nav} back title={t.title}>
      <Gray className="items-start gap-2 !py-4"><StateChip label={chipOf(cmp.ratio[k])} /><p className="text-[16px] leading-normal font-bold">{k === 'radius' ? '집에서 평균 ' : k === 'night' ? '해 진 뒤 운전이 ' : ''}{valueText(k, base)} → {valueText(k, ev.now).replace(/^(일주일에|10번 중) /, '')}{down ? k === 'night' ? '으로 줄었어요' : ', 줄었어요' : ', 거의 그대로예요'}</p></Gray>
      <Sec title="주별 변화">
        <div className="relative flex h-28 items-end gap-1.5">
          {bars.map((v, i) => <span key={i} className={`flex-1 rounded-t-sm ${i < 4 ? 'bg-[#c4c4c4]' : 'bg-[#333]'}`} style={{ height: `${Math.max((v / top) * 100, 2)}%` }} />)}
          <span className="absolute inset-x-0 border-t-2 border-[#3b63d6]" style={{ bottom: `${(base[k] / top) * 100}%` }}><span className="absolute -top-4 right-0 text-[10px] text-[#3b63d6]">평소 기준</span></span>
        </div>
        <div className="flex justify-between text-[10px] text-[#888]"><span>{base.label} (평소 기준)</span><span>최근 8주</span></div>
        <p className="text-[12px] text-[#777]">회색은 평소 기준을 만든 {base.label}, 검은색은 최근 8주예요.</p>
      </Sec>
      <Sec title="분석 결과"><P>{t.mean(cur.nickname, down)}</P></Sec>
      <Sec title="참고"><P>{t.note}</P></Sec>
      <How>{t.how}</How>
    </Screen>
  )
}

function WhyWander({ nav, cur, st }: Ctx) {
  if (!cur || !st) return null
  const nick = cur.nickname, evs = cur.wanders.filter(w => lost(w) && diff(st.today, w.day) < 30)
  const alerted = cur.alerts.some(a => a.kind === 'wander' && !a.archived)
  const strip = Array.from({ length: 30 }, (_, i) => addDays(st.today, i - 29))
  return (
    <Screen nav={nav} back title="왜 이 알림이 왔나요?">
      <Gray className="gap-2 !py-4"><p className="text-[12px] text-[#777]">한 줄 요약</p><p className="text-[16px] leading-normal font-bold">{jo(nick, '이', '가')} 최근 30일 동안 평소 다니던 길에서 {evs.length >= 2 ? '두 번' : `${evs.length}번`} 헤매셨어요.</p>{alerted ? <><p className="text-[13px] text-[#555]">서로 다른 날 두 번 있어서 알려드려요.</p><p className="text-[13px] leading-normal font-bold">치매안심센터에서 무료 기억력 검사를 한번 받아보시길 권해요.</p></> : <p className="text-[13px] text-[#555]">한 번은 누구에게나 있을 수 있어서 알림은 보내지 않았어요.</p>}</Gray>
      <Sec title="무엇이 있었나요?"><p className="text-[12px] leading-normal text-[#666]">{jo(nick, '이', '가')} 지난 28일 동안 다니신 길과 비교했어요. 어디였는지는 기록하지 않아요.</p></Sec>
      {evs.map(w => (
        <section key={w.id} className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-[#333] p-4">
          <div className="flex items-start"><div className="flex flex-1 flex-col gap-0.5"><h3 className="text-[15px] font-bold">{kdate(w.day)} ({WD[dow(w.day)]})</h3><p className="text-[12px] text-[#777]">{w.at}</p></div><Chip dark>{answer(w)}</Chip></div>
          {[['헤매신 시간', `약 ${w.minutes}분`], ['차의 질문', '"집으로 안내할까요?"'], [`${nick}의 응답`, answer(w)]].map(([a, b]) => <p key={a} className="flex text-[12px]"><span className="w-[72px] text-[#888]">{a}</span><span className="font-bold">{b}</span></p>)}
          <div><A onClick={() => nav.go('C-052-R', { id: w.id })}>상세보기 ›</A></div>
        </section>
      ))}
      <Gray className="gap-3"><p className="text-[12px] font-bold">알림 기준: 30일 안에 서로 다른 날 2번</p>
        <div className="flex items-center gap-[2px]">{strip.map(d => <span key={d} className={evs.some(w => w.day === d) ? 'h-3.5 flex-1 rounded-sm bg-[#333]' : 'h-1.5 flex-1 rounded-sm bg-[#d6d6d6]'} />)}</div>
        <div className="flex justify-between text-[10px] text-[#888]"><span>{md(strip[0])}</span>{evs.map(w => <span key={w.id} className="font-bold text-[#222]">{md(w.day)}</span>)}<span>오늘</span></div>
      </Gray>
      <Exceptions items={['공사나 도로 변경으로 길이 바뀌었어요.', '처음 가는 곳을 찾고 계셨어요.', '다른 가족이 대신 운전했어요.']} link="해당하는 날이 있다면 그 날 제외하기" onClick={() => nav.go('C-060')} />
      {alerted && <Btn onClick={() => nav.go('C-040B')}>코칭으로 넘어가기</Btn>}
      <Disclaimer />
    </Screen>
  )
}

function WanderDetail({ nav, cur }: Ctx) {
  const w = cur?.wanders.find(x => x.id === nav.p.id)
  if (!w || !cur) return null
  const acc = w.response === 'accept', first = cur.wanders.filter(lost).find(x => x.day < w.day && diff(w.day, x.day) < 30)
  return (
    <Screen nav={nav} back title={`${kdate(w.day)} 상세`}>
      <Gray className="items-start gap-2 !py-4"><Chip dark>{answer(w)}</Chip><p className="text-[16px] leading-normal font-bold">{kdate(w.day)}, 평소 길을 벗어나 약 {w.minutes}분 맴도{acc ? '신 뒤 집 안내를 받으셨어요' : '셨고 차의 질문에 대답이 없으셨어요'}</p><p className="text-[12px] text-[#666]">{acc ? '차가 여쭤보자 "집이요"라고 답하셨어요.' : '대답이 없으셔서 경로는 바꾸지 않았어요.'}</p></Gray>
      <Sec title="그날의 흐름">
        <ol className="flex flex-col">{w.timeline.map(([t, s], i) => (
          <li key={i} className="flex gap-3"><span className="w-16 shrink-0 pt-0.5 text-[11px] text-[#888]">{t}</span>
            <span className="flex flex-col items-center"><span className={`mt-1.5 size-2 rounded-full ${i === w.timeline.length - 1 ? 'bg-[#333]' : 'bg-[#bbb]'}`} />{i < w.timeline.length - 1 && <span className="w-px flex-1 bg-[#ccc]" />}</span>
            <span className={`flex-1 pb-4 text-[13px] leading-normal ${i === w.timeline.length - 1 ? 'font-bold' : ''}`}>{s}</span></li>
        ))}</ol>
      </Sec>
      <Sec title="분석 결과"><P>{acc ? '늘 다니시던 길에서 방향을 잃으셨다가 도움을 받아들이셨다는 뜻이에요. 도움을 받아들이신 것도 길을 헤매셨다는 신호로 봐요.' : '질문에 대답하지 않으신 건 못 들으셨거나 바쁘셨기 때문일 수도 있어요. 다만 질문을 이해하기 어려우셨을 수도 있어서, 이날도 헤매신 날로 셌어요.'}</P></Sec>
      <Sec title="참고"><P>{first ? `${kdate(first.day)}에 이어 30일 안에 서로 다른 날 두 번째라서 이번 알림을 보내드렸어요.` : '익숙한 곳에서 길을 잃는 건 기억력과 길 찾기 능력 변화의 초기 신호로 꼽혀요. 한 번은 누구에게나 있을 수 있어서, 이날만으로는 알려드리지 않았어요.'}</P></Sec>
      <How>지난 28일 동안 다니신 길과 비교해요. 평소 길에서 1km 넘게 벗어난 채 10분 넘게 있거나, 같은 구역을 3분 넘게 맴돌거나, 내비가 길을 3번 넘게 다시 찾으면 헤매신 것으로 봐요. {jo(cur.nickname, '이', '가')} 목적지를 말씀하시거나 &quot;괜찮아요&quot;라고 하시면 세지 않아요.</How>
    </Screen>
  )
}

function BaseSheet({ nav, ev }: Ctx) {
  if (!ev) return null
  const L = ev.learning && ev.base ? ev.learning : null, [nowB, prevB] = [ev.base, ev.baselines.at(-2)]
  const Item = ({ chip, dark, title, sub }: { chip: string; dark?: boolean; title: string; sub: string }) => <Gray className="items-start gap-1.5"><Chip dark={dark}>{chip}</Chip><p className="text-[14px] font-bold">{title}</p><p className="text-[12px] text-[#666]">{sub}</p></Gray>
  return (
    <Sheet onClose={nav.back}>
      <h3 className="text-[18px] font-bold">비교 기준</h3>
      {nowB && <Item chip="지금 기준" dark title={`${nowB.label} · ${md(nowB.from)} ~ ${md(nowB.to)}`} sub={prevB && !L ? `${md(nowB.effective)}부터 이 기준과 비교해요.` : '처음 연결하고 배운 평소 운전이에요.'} />}
      {L && <Item chip="배우는 중" title={`${L.reason} 이후 · ${md(L.from)} ~ ${md(addDays(L.from, LEARN_DAYS - 1))}`} sub="28일과 운전 기록 20번이 다 모이면 이 기간이 새 기준이 돼요." />}
      {prevB && !L && <Item chip="이전 기준" title={`${prevB.label} · ${md(prevB.from)} ~ ${md(prevB.to)}`} sub={`${md(nowB!.to)}까지의 리포트는 이 기준으로 남아 있어요.`} />}
      {L && <p className="text-[12px] leading-normal text-[#777]">28일이 지나도 운전 기록이 20번이 안 되면, 다 모일 때까지 {nowB?.label} 기준을 계속 써요.</p>}
      <Btn onClick={nav.back}>확인</Btn>
    </Sheet>
  )
}

export const REPORT: Record<string, (c: Ctx) => React.ReactNode> = {
  'C-030': c => <Report key="w" {...c} />, 'C-030-M': c => <Report key="m" {...c} monthly />, 'C-032': c => <DayView {...c} />,
  'C-031': c => <Why {...c} />, 'C-031-R': c => <Detail {...c} />, 'C-052': c => <WhyWander {...c} />, 'C-052-R': c => <WanderDetail {...c} />,
  'C-033': c => <><Report key="w" {...c} /><BaseSheet {...c} /></>,
}
