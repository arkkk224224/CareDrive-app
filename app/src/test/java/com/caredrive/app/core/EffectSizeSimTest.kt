package com.caredrive.app.core

import org.junit.Assert.assertTrue
import org.junit.Test

// 논문 수준의 작은 감소(집단 차이 약 10~15%)를 현재 규칙이 얼마나 잡는지 잰다. 감소는 3지표 모두 같은 비율로 140일째부터.
class EffectSizeSimTest {
    private fun step(cut: Double): (Int) -> Triple<Double, Double, Double> =
        { d -> if (d >= ONSET) Triple(1 - cut, 1 - cut, 1 - cut) else Triple(1.0, 1.0, 1.0) }

    @Test fun detectionBySizeOfDrop() {
        val n = 300
        val rows = listOf(0.0, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40).map { cut ->
            val delays = (1L..n).mapNotNull { seed -> alertsOf(makeDays(seed, SIM_DAYS, step(cut))).firstOrNull { it >= ONSET }?.minus(ONSET) }
            val med = delays.sorted().getOrNull(delays.size / 2)?.let { it / 7 }
            println("감소 -${(cut * 100).toInt()}%: 탐지 ${delays.size * 100 / n}%, 중앙 지연 ${med ?: "-"}주")
            cut to delays.size
        }.toMap()
        assertTrue(rows.getValue(0.10) < rows.getValue(0.40)) // 감소가 클수록 더 잡아야 한다
        val tripsOnly = (1L..n).count { seed -> alertsOf(makeDays(seed, Scenario.TRIPS_ONLY)).any { it >= ONSET } }
        println("운전 횟수만 -40%: 알림 ${tripsOnly * 100 / n}%")
        val falsePerYear = (1L..n).sumOf { alertsOf(makeDays(it, Scenario.NORMAL)).size } / n.toDouble()
        println("정상 유지: 오경보 연 %.2f회".format(falsePerYear))
        val gradual: (Int) -> Triple<Double, Double, Double> = { d -> val m = maxOf(0.4, 1 - 0.03 * maxOf(0, d - ONSET) / 7.0); Triple(m, m, m) }
        val gd = (1L..n).mapNotNull { seed -> alertsOf(makeDays(seed, SIM_DAYS, gradual)).firstOrNull { it >= ONSET }?.minus(ONSET) }.sorted()
        println("완만한 감소 주 3%: 탐지 ${gd.size * 100 / n}%, 중앙 지연 ${gd.getOrNull(gd.size / 2)?.div(7) ?: "-"}주")
    }
}
