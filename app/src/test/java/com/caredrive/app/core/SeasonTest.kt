package com.caredrive.app.core

import org.junit.Assert.assertTrue
import org.junit.Test

/** 매년 겨울(약 90~180일째)마다 운전 횟수 -30%, 이동 반경 -15%인 사람을 2년 본다. 계절 보정이 2년째 겨울 오경보를 줄이는지. */
class SeasonTest {
    private fun winter(d: Int) = if (Math.floorMod(d, 365) in 90 until 180) Triple(0.7, 1.0, 0.85) else Triple(1.0, 1.0, 1.0)

    @Test fun seasonalAdjustmentCutsSecondYearWinterAlarms() {
        val n = 200
        fun yr2Alarm(seasonal: Boolean) = (1L..n).count { s -> alertsOf(makeDays(s, 730, ::winter), seasonal).any { it >= 365 } }.toDouble() / n
        val dropAt = 450
        fun detect(seasonal: Boolean) = (1L..n).count { s ->
            alertsOf(makeDays(s, 730) { d -> winter(d).let { (t, ni, r) -> if (d >= dropAt) Triple(t * 0.6, ni * 0.6, r * 0.6) else Triple(t, ni, r) } }, seasonal).any { it >= dropAt }
        }.toDouble() / n
        val (off, on) = yr2Alarm(false) to yr2Alarm(true)
        val (dOff, dOn) = detect(false) to detect(true)
        println("계절: 2년째 겨울 오경보(1회 이상) 보정 없음 ${(off * 100).toInt()}% -> 보정 ${(on * 100).toInt()}%")
        println("계절: 2년째 급감 탐지 보정 없음 ${(dOff * 100).toInt()}% -> 보정 ${(dOn * 100).toInt()}%")
        assertTrue(on <= off)
        assertTrue(dOn >= dOff - 0.05)
    }
}
