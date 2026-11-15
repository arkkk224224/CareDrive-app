package com.caredrive.app.core

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AlertsTest {
    private val base = Ind(30.0, 0.12, 8.0)
    private val forbidden = listOf("진단", "의심", "위험", "인지저하", "치매입니다", "점수")

    private fun clean(m: Message) = (m.title + m.body + m.coaching).let { t -> forbidden.none { it in t } }

    @Test fun chronicListsWhatDropped() {
        val m = AlertComposer.chronic(base, Ind(18.0, 0.11, 5.5), month = 6, firstYear = false)
        assertTrue(m.body.contains("운전 횟수 40%"))
        assertTrue(m.body.contains("집에서 가는 곳까지의 거리 31%"))
        assertFalse(m.body.contains("밤 운전")) // -8%라 문구에 넣지 않음
        assertFalse(m.body.contains("계절 영향")) // 첫 해 겨울이 아니면 계절 완충 문구 없음
        assertTrue(clean(m))
    }

    @Test fun firstWinterAddsSeasonBuffer() {
        assertTrue(AlertComposer.chronic(base, Ind(18.0, 0.05, 5.0), month = 1, firstYear = true).body.contains("계절 영향"))
        assertFalse(AlertComposer.chronic(base, Ind(18.0, 0.05, 5.0), month = 1, firstYear = false).body.contains("계절 영향"))
    }

    @Test fun nightIsSkippedWhenBaselineHasNoNightDriving() {
        val m = AlertComposer.chronic(Ind(30.0, 0.0, 8.0), Ind(15.0, 0.0, 4.0), 6, false)
        assertFalse(m.body.contains("밤 운전"))
    }

    @Test fun acuteAndMonthlyAreCalm() {
        assertTrue(clean(AlertComposer.acute(2)))
        assertTrue(AlertComposer.monthly(base, Ind(29.0, 0.12, 8.2)).title.contains("평소와 비슷"))
        assertTrue(clean(AlertComposer.monthly(base, Ind(20.0, 0.12, 8.2))))
    }

    @Test fun chronicGoesToCheckupAcuteGoesToDementiaCenter() {
        // 활동 감소는 원인이 넓어 종합 건강검진, 반복된 길 헤맴만 치매안심센터로 연결한다
        val chronic = AlertComposer.chronic(base, Ind(18.0, 0.05, 5.0), 6, false).coaching
        assertTrue(chronic.contains("건강검진"))
        assertFalse(chronic.contains("치매안심센터"))
        assertTrue(AlertComposer.acute(2).coaching.contains("치매안심센터"))
    }
}
