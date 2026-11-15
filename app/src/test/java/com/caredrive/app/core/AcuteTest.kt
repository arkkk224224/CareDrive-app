package com.caredrive.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AcuteTest {
    @Test fun noQuestionWhileMoving() {
        assertNull(Acute().handle(1, "t1", stopped = false, answer = Answer.NONE))
    }

    @Test fun answers() {
        val a = Acute()
        assertEquals(Action.ROUTE_HOME, a.handle(1, "t1", true, Answer.ACCEPT))
        assertEquals(listOf(1), a.lostDays) // 수락은 후보로 기록
        assertEquals(Action.NORMAL, a.handle(2, "t2", true, Answer.DESTINATION))
        assertEquals(Action.NORMAL, a.handle(3, "t3", true, Answer.REFUSE))
        assertEquals(listOf(1), a.lostDays) // 목적지 발화·거절은 기록하지 않음
    }

    @Test fun oncePerDayAndTrip() {
        val a = Acute()
        assertEquals(Action.LOGGED, a.handle(1, "t1", true, Answer.NONE))
        assertNull(a.handle(1, "t2", true, Answer.NONE)) // 같은 날
        assertNull(a.handle(2, "t1", true, Answer.NONE)) // 같은 트립
    }

    @Test fun alertNeedsTwoDifferentDaysIn30() {
        val a = Acute()
        a.handle(1, "t1", true, Answer.NONE)
        assertFalse(a.alert(1))
        a.handle(20, "t2", true, Answer.NONE)
        assertTrue(a.alert(20))
        assertFalse(a.alert(35)) // 첫 후보가 30일 밖
    }

    @Test fun deviation() {
        assertTrue(isDeviation(offrouteM = 1200, offrouteMin = 12))
        assertFalse(isDeviation(offrouteM = 1200, offrouteMin = 3))
        assertTrue(isDeviation(reroutes = 3))
    }

    @Test fun classifiesSpokenAnswers() {
        assertEquals(Answer.ACCEPT, classify("집이요"))
        assertEquals(Answer.ACCEPT, classify("네"))
        assertEquals(Answer.ACCEPT, classify("아니 집으로 가는 중이야")) // 집으로 가려는 중이면 안내가 도움이 된다
        assertEquals(Answer.REFUSE, classify("아니요 괜찮아요"))
        assertEquals(Answer.DESTINATION, classify("마트 가는 중이야"))
        assertEquals(Answer.NONE, classify(null))
        assertEquals(Answer.NONE, classify("  "))
    }
}
