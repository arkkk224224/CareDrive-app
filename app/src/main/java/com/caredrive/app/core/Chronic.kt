package com.caredrive.app.core

// 만성 채널: 일별 기록 -> 28일 창 -> 고정 기준선 -> 단계 판정. 상수는 기획서의 시작값(임상 근거 아님).
// reference/caredrive/chronic.py(Python 기준 구현)와 같은 규칙이다.
const val WINDOW = 28
const val MIN_BASE_TRIPS = 20
const val DROP = 0.30
const val SUSTAIN_DAYS = 56
const val SUSTAIN_MIN = 49 // 56일 중 49일 이상 '2지표 하락'이면 지속
const val COOLDOWN_DAYS = 84
const val MIN_NIGHT_BASE = 0.05
const val NIGHT_PSEUDO_TRIPS = 5 // 야간 비율을 기준선 쪽으로 5트립만큼 당긴다(트립이 적을 때의 출렁임 완화)
const val NIGHT_OFF_MEAN = 0.70 // 야간 지표를 못 쓸 때: 남은 2지표의 기준선 대비 비율 평균이 이 값 이하(둘 다 0.9 이하)
const val MIN_INCLUDED = 14

data class Day(
    val day: Int,
    val trips: Int = 0,
    val driveMin: Double = 0.0,
    val nightMin: Double = 0.0,
    val distsKm: List<Double> = emptyList(), // 트립별 집 기준 정차 지점 거리
    val excluded: Boolean = false, // 자녀가 여행·입원 등으로 태그한 날
)

/** 28일 창 지표. night·radius는 데이터가 없으면 null. */
data class Ind(val trips: Double, val night: Double?, val radius: Double?)

enum class Stage(val label: String) { LEARN("학습"), NORMAL("정상"), RECORD("기록"), ALERT("관찰알림") }

fun indicators(window: List<Day>): Ind? {
    val d = window.filter { !it.excluded }
    if (d.size < MIN_INCLUDED) return null
    val drive = d.sumOf { it.driveMin }
    val dists = d.flatMap { it.distsKm }
    return Ind(
        trips = d.sumOf { it.trips } * WINDOW.toDouble() / d.size,
        night = if (drive > 0) d.sumOf { it.nightMin } / drive else null,
        radius = if (dists.isNotEmpty()) dists.average() else null,
    )
}

/**
 * seasonal = 첫 1년의 계절 모양을 학습해 2년째부터 기준선을 그 시기의 기대값으로 조정(첫 해 알림이 있었으면 쓰지 않음).
 * 기본값은 끔: 1년치로는 계절당 표본이 사실상 한 번뿐이라 시뮬레이션에서 이득(2년째 겨울 오경보 14%->12%)과
 * 손실(급감 탐지 98%->95%)이 비슷했다. 2년 이상 쌓이면 다시 잰다.
 */
class Detector(private val seasonal: Boolean = false) {
    private val days = ArrayDeque<Day>()
    private val yearLog = ArrayList<Pair<Int, Ind>>()
    private var season: Array<DoubleArray>? = null // [지표 3][약 30일 칸 13]
    private var alertedInFirstYear = false
    private val hist = ArrayDeque<Boolean>()
    private var cooldownUntil = -1
    private var last = Stage.LEARN

    var base: Ind? = null
        private set
    var baseDay: Int? = null
        private set

    /** 마지막으로 계산된 지표(기준선 완성 이후). */
    var current: Ind? = null
        private set

    /** 자녀의 검진 완료·이사·차량 교체 입력 시 기준선 재학습. */
    fun reset() {
        days.clear(); hist.clear(); base = null; baseDay = null; current = null
        cooldownUntil = -1; last = Stage.LEARN
        yearLog.clear(); season = null; alertedInFirstYear = false
    }

    /** 저장해 둔 고정 기준선을 복원한다(오래된 하루 요약이 보존 기간으로 지워져도 기준선은 유지). */
    fun restoreBase(b: Ind, day: Int) {
        base = b; baseDay = day; last = Stage.NORMAL
    }

    fun update(d: Day): Stage {
        days.addLast(d)
        if (days.size > WINDOW) days.removeFirst()
        val cur = indicators(days.toList())
        if (d.excluded || cur == null) return last // 누적 동결
        if (base == null) {
            if (days.size == WINDOW && cur.trips >= MIN_BASE_TRIPS && cur.night != null && cur.radius != null) {
                base = cur; baseDay = d.day // 이후 고정
            }
            return last
        }
        current = cur
        val sinceBase = d.day - baseDay!!
        if (seasonal && season == null) {
            if (sinceBase < 365) yearLog += d.day to cur
            else if (!alertedInFirstYear) season = seasonFactors()
        }
        last = judge(cur, d.day)
        if (last == Stage.ALERT && sinceBase < 365) alertedInFirstYear = true
        return last
    }

    private fun judge(cur: Ind, day: Int): Stage {
        val raw = base!!
        val b = expected(raw, day)
        val anyDrop: Boolean
        val sustained: Boolean
        if (raw.night!! < MIN_NIGHT_BASE) {
            // 야간 비율이 기준선에서 너무 작아 비교가 무의미하면 남은 2지표만 남는다. 그때도 '2개 모두 -30%'를 요구하면
            // 3개 중 2개일 때보다 훨씬 엄격해져 급감 탐지가 56~66%로 떨어져서, 2지표의 평균으로 판정한다(시뮬레이션으로 정한 값).
            val r = listOf(ratio(cur.trips, b.trips), ratio(cur.radius, b.radius!!))
            anyDrop = r.average() <= NIGHT_OFF_MEAN
            sustained = anyDrop && r.max() <= 0.9
        } else {
            fun dropped(c: Double?, bv: Double?) = bv != null && (c == null || c <= (1 - DROP) * bv)
            val night = shrinkNight(cur.night, b.night!!)
            val n = listOf(dropped(cur.trips, b.trips), dropped(night, b.night), dropped(cur.radius, b.radius)).count { it }
            anyDrop = n > 0
            sustained = n >= 2
        }
        hist.addLast(sustained)
        if (hist.size > SUSTAIN_DAYS) hist.removeFirst()
        if (hist.size == SUSTAIN_DAYS && hist.count { it } >= SUSTAIN_MIN && day >= cooldownUntil) {
            cooldownUntil = day + COOLDOWN_DAYS
            return Stage.ALERT
        }
        return if (anyDrop) Stage.RECORD else Stage.NORMAL
    }

    private fun ratio(c: Double?, bv: Double) = if (c == null) 0.0 else c / bv

    private fun bucket(day: Int) = Math.floorMod(day, 365) / 30

    /** 계절 보정: 고정 기준선을 '이 시기라면 기대되는 값'으로 바꾼다. 학습 전이면 그대로. */
    private fun expected(raw: Ind, day: Int): Ind {
        val s = season ?: return raw
        fun f(k: Int) = s[k][bucket(day)] / s[k][bucket(baseDay!!)]
        return Ind(raw.trips * f(0), raw.night?.times(f(1)), raw.radius?.times(f(2)))
    }

    /**
     * 첫 1년의 지표로 계절 계수를 만든다. 칸별 평균은 그해 우연히 쉰 몇 주가 '계절'로 학습돼서,
     * 1년 주기 사인 곡선(log 값에 a + b·cos + c·sin)으로 매끄럽게 맞춘다. 기록이 200일 미만이면 null.
     */
    private fun seasonFactors(): Array<DoubleArray>? {
        if (yearLog.size < 200) return null
        val pick = listOf<(Ind) -> Double?>({ it.trips }, { it.night }, { it.radius })
        return Array(3) { k ->
            val v = yearLog.mapNotNull { (d, i) -> pick[k](i)?.takeIf { it > 0 }?.let { d to kotlin.math.ln(it) } }
            if (v.size < 200) return@Array DoubleArray(13) { 1.0 }
            val x = v.map { (d, _) -> val t = 2 * Math.PI * Math.floorMod(d, 365) / 365; doubleArrayOf(1.0, kotlin.math.cos(t), kotlin.math.sin(t)) }
            val xtx = Array(3) { i -> DoubleArray(3) { j -> x.sumOf { it[i] * it[j] } } }
            val xty = DoubleArray(3) { i -> x.indices.sumOf { x[it][i] * v[it].second } }
            val inv = OtherDriverFilter.inverse3(xtx)
            val beta = DoubleArray(3) { i -> (0..2).sumOf { inv[i][it] * xty[it] } }
            DoubleArray(13) { bk ->
                val t = 2 * Math.PI * (bk * 30 + 15) / 365
                kotlin.math.exp(beta[1] * kotlin.math.cos(t) + beta[2] * kotlin.math.sin(t)).coerceIn(0.6, 1.4)
            }
        }
    }

    /** 트립이 적으면 야간 비율이 크게 출렁여서, 의사 표본만큼 기준선 값 쪽으로 당겨 추정한다. */
    private fun shrinkNight(night: Double?, baseNight: Double): Double? {
        if (night == null) return null
        val win = days.filter { !it.excluded }
        val drive = win.sumOf { it.driveMin }
        val pseudo = NIGHT_PSEUDO_TRIPS * drive / maxOf(1, win.sumOf { it.trips })
        return (win.sumOf { it.nightMin } + pseudo * baseNight) / (drive + pseudo)
    }
}
