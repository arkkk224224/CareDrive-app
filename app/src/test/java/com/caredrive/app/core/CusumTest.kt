package com.caredrive.app.core

import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.max

/** 본문 규칙(56일 중 49일)과 부록 D의 그룹 CUSUM을 같은 합성 데이터에서 비교한다. 결과는 출력하고 결정은 문서에 남긴다. */
class CusumTest {
    private val n = 200

    private fun rule(days: List<Day>): List<Int> { val det = Detector(); return days.filter { det.update(it) == Stage.ALERT }.map { it.day } }
    private fun cusum(days: List<Day>): List<Int> { val det = CusumDetector(); return days.filter { det.update(it) == Stage.ALERT }.map { it.day } }

    private fun summary(mult: (Int) -> Triple<Double, Double, Double>, decline: Boolean, run: (List<Day>) -> List<Int>): String {
        val res = (1L..n).map { run(makeDays(it, SIM_DAYS, mult)) }
        if (!decline) return "${res.count { it.isNotEmpty() } * 100 / n}%"
        val delays = res.mapNotNull { r -> r.firstOrNull { it >= ONSET }?.let { (it - ONSET) / 7.0 } }.sorted()
        return "${delays.size * 100 / n}%/${delays.getOrNull(delays.size / 2)?.let { "%.0f주".format(it) } ?: "-"}"
    }

    @Test fun compare() {
        val aging = { d: Int -> val m = max(0.5, 1 - 0.2 * d / 365.0); Triple(m, m, m) }
        val cases = listOf(
            Triple("정상", Scenario.NORMAL.mult, false), Triple("노화-20%/년", aging, false), Triple("횟수만-40%", Scenario.TRIPS_ONLY.mult, false),
            Triple("급감-40%", Scenario.ABRUPT.mult, true), Triple("완만 주5%", Scenario.GRADUAL.mult, true),
        )
        for ((name, mult, dec) in cases) println("비교 $name: 규칙 ${summary(mult, dec, ::rule)} | CUSUM ${summary(mult, dec, ::cusum)}")
        // 오경보를 규칙 수준으로 맞춘 CUSUM
        for ((kk, hh) in listOf(0.5 to 8.0, 0.5 to 12.0, 1.0 to 6.0, 1.0 to 8.0, 1.5 to 4.0)) {
            val run = { days: List<Day> -> val det = CusumDetector(kk, hh); days.filter { det.update(it) == Stage.ALERT }.map { it.day } }
            println("격자 k=$kk h=$hh: " + cases.joinToString(" | ") { (name, mult, dec) -> "$name ${summary(mult, dec, run)}" })
        }
        assertTrue(true)
    }
}
