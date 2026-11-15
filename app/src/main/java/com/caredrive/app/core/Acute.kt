package com.caredrive.app.core

// 급성 채널: 이탈 후보 -> 정차 시 질문 -> 응답 분류 -> 길 잃음 후보 누적. 상수는 기획서의 시작값.
const val OFFROUTE_M = 1000
const val OFFROUTE_MIN = 10
const val REROUTES = 3
const val ALERT_DAYS = 2
const val ALERT_WINDOW = 30

enum class Answer { ACCEPT, REFUSE, DESTINATION, NONE }

enum class Action { ROUTE_HOME, NORMAL, LOGGED }

/**
 * "어디 가시나요? 집으로 안내할까요?"에 대한 STT 결과를 응답으로 나눈다. "집"이 들어가면 집 안내 수락(목적지가 집이어도 같다),
 * 거절어면 거절, 다른 말은 목적지 발화, 말이 없으면 무응답.
 */
fun classify(text: String?): Answer {
    val words = text.orEmpty().split(Regex("[\\s,.!?]+")).filter { it.isNotEmpty() }
    return when {
        words.isEmpty() -> Answer.NONE
        words.any { it.startsWith("집") } || words.any { it in listOf("네", "예", "응", "그래", "좋아", "좋아요") } -> Answer.ACCEPT
        words.any { it.startsWith("아니") || it.startsWith("아뇨") || it.startsWith("괜찮") } -> Answer.REFUSE
        else -> Answer.DESTINATION
    }
}

/** 평소 경로 이탈(약 1km·10분 이상) 또는 한 트립 재탐색 3회 이상. */
fun isDeviation(offrouteM: Int = 0, offrouteMin: Int = 0, reroutes: Int = 0) =
    (offrouteM >= OFFROUTE_M && offrouteMin >= OFFROUTE_MIN) || reroutes >= REROUTES

class Acute {
    private val askedDays = mutableSetOf<Int>()
    private val askedTrips = mutableSetOf<String>()
    val lostDays = mutableListOf<Int>()

    /** 이탈 후보가 생겼을 때 호출. 질문하지 않으면(주행 중, 하루·트립당 1회 초과) null. */
    fun handle(day: Int, trip: String, stopped: Boolean, answer: Answer): Action? {
        if (!stopped || day in askedDays || trip in askedTrips) return null
        askedDays += day
        askedTrips += trip
        return when (answer) {
            Answer.ACCEPT -> { lostDays += day; Action.ROUTE_HOME } // 도움을 받아들였다 = 길을 잃었다는 신호
            Answer.REFUSE, Answer.DESTINATION -> Action.NORMAL
            Answer.NONE -> { lostDays += day; Action.LOGGED }
        }
    }

    /** 30일 안에 서로 다른 날 후보가 2일 이상이면 자녀 알림에 반영. */
    fun alert(today: Int) = lostDays.filter { today - ALERT_WINDOW < it && it <= today }.toSet().size >= ALERT_DAYS
}
