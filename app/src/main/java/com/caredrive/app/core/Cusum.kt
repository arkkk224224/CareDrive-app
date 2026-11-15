package com.caredrive.app.core

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

// 부록 D의 대안: 중앙값·MAD 표준화 + 그룹 CUSUM. 본문 규칙과 같은 시뮬레이션에서 비교하려고 만든 것이고 앱 기본값이 아니다.
// 학습: 28일 창 값을 49일째까지(22개 창) 모아 중앙값 m과 산포 σ = max(1.4826·MAD, 0.2·m, ε)를 정한다.
// 누적: 28일 창 값을 주 1회 표본으로 z = (x - m)/σ, S = min(4, max(0, -z)), C = max(0, C + S - k). 2개 이상 그룹이 C > h면 알림.

const val CUSUM_K = 0.5
const val CUSUM_H = 3.0
const val CUSUM_LEARN_DAYS = 49

class CusumDetector(private val k: Double = CUSUM_K, private val h: Double = CUSUM_H) {
    private val days = ArrayDeque<Day>()
    private val learn = mutableListOf<Ind>()
    private var m: DoubleArray? = null
    private var sd: DoubleArray? = null
    private val c = DoubleArray(3)
    private var cooldownUntil = -1
    private var started: Int? = null

    fun update(d: Day): Stage {
        if (started == null) started = d.day
        days.addLast(d)
        if (days.size > WINDOW) days.removeFirst()
        val cur = indicators(days.toList())
        if (d.excluded || cur == null) return Stage.NORMAL
        val mm = m
        if (mm == null) {
            if (days.size == WINDOW && cur.night != null && cur.radius != null) learn += cur
            if (d.day - started!! + 1 >= CUSUM_LEARN_DAYS && learn.size >= 15 && learn.map { it.trips }.median() >= MIN_BASE_TRIPS) fit()
            return Stage.LEARN
        }
        if ((d.day - started!!) % 7 != 0) return Stage.NORMAL // 주 1회 표본
        val s = sd!!
        val x = listOf(cur.trips, cur.night, cur.radius)
        var over = 0
        var groups = 0
        for (k in 0..2) {
            if (k == 1 && mm[1] < MIN_NIGHT_BASE) continue // 야간을 거의 안 타면 야간 그룹 제외
            groups++
            val z = x[k]?.let { (it - mm[k]) / s[k] } ?: -4.0
            c[k] = max(0.0, c[k] + min(4.0, max(0.0, -z)) - this.k)
            if (c[k] > h) over++
        }
        if (over >= min(2, groups) && d.day >= cooldownUntil) {
            cooldownUntil = d.day + COOLDOWN_DAYS
            c.fill(0.0)
            return Stage.ALERT
        }
        return if (over > 0) Stage.RECORD else Stage.NORMAL
    }

    private fun fit() {
        val cols = listOf(learn.map { it.trips }, learn.map { it.night!! }, learn.map { it.radius!! })
        val eps = doubleArrayOf(6.0, 0.05, 0.5) // 운전 횟수 주 1.5회(28일 6회), 야간 비율 5%p, 반경 0.5km
        m = DoubleArray(3) { cols[it].median() }
        sd = DoubleArray(3) { k -> maxOf(1.4826 * cols[k].map { abs(it - m!![k]) }.median(), 0.2 * m!![k], eps[k]) }
    }

    private fun List<Double>.median() = sorted().let { s -> if (s.size % 2 == 1) s[s.size / 2] else (s[s.size / 2 - 1] + s[s.size / 2]) / 2 }
}
