package com.caredrive.app.core

import org.junit.Assert.assertTrue
import org.junit.Test

/** 타인 운전이 트립의 약 40% 섞일 때 필터가 급감 탐지를 되살리는지. 다른 가족의 운전 습관이 얼마나 다른지(표준편차 배수)에 따라 잰다. */
class OtherDriverSimTest {
    private fun rate(sc: Scenario, shift: Double, filter: Boolean, n: Int = 150): Double =
        (1L..n).count { s -> alertsOf(makeMixedDays(s, sc, 0.6, shift, filter)).any { it >= ONSET || sc == Scenario.NORMAL } }.toDouble() / n

    @Test fun filterRecoversDetection() {
        val none = rate(Scenario.ABRUPT, 2.0, false)
        val rows = listOf(0.5, 1.0, 2.0, 3.0).associateWith { rate(Scenario.ABRUPT, it, true) }
        val fpNone = rate(Scenario.NORMAL, 2.0, false)
        val fp = listOf(0.5, 1.0, 2.0, 3.0).associateWith { rate(Scenario.NORMAL, it, true) }
        println("타인 운전 40%: 필터 없음 급감 탐지 ${(none * 100).toInt()}%, 정상 오경보 ${(fpNone * 100).toInt()}%")
        rows.forEach { (k, v) -> println("  습관 차이 ${k}σ: 필터 급감 탐지 ${(v * 100).toInt()}%, 정상 오경보 ${(fp.getValue(k) * 100).toInt()}%") }
        assertTrue(rows.getValue(3.0) >= none + 0.2) // 습관이 뚜렷이 다르면 필터가 탐지를 되살린다
        assertTrue(fp.values.all { it <= fpNone + 0.03 }) // 필터 때문에 정상 오경보가 늘지 않는다
    }
}
