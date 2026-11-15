package com.caredrive.app.core

import kotlin.math.roundToInt

// 자녀에게 보내는 문구(템플릿). 진단·위험 점수 표현을 쓰지 않고 "변화 알림 + 건강 점검 권유"만 한다.
// LLM SDK는 공식 안내에 없어 템플릿으로 만들고, 쓸 수 있게 되면 이 문구를 다듬는 용도로만 붙인다.

data class Message(val title: String, val body: String, val coaching: String = "")

object AlertComposer {
    const val CHANGE_SHOWN = -15 // 기준선 대비 이 % 이하로 줄어든 지표만 문구에 넣는다

    // 만성(활동 감소)은 원인이 넓어 종합 점검으로, 급성(익숙한 길에서 반복해 헤맴)은 인지 쪽 신호라 치매안심센터로 연결한다.
    private val CHECKUP = "운전 이야기보다 \"요즘 컨디션 어떠세요? 건강검진 같이 가요\"로 시작해 보세요. " +
        "운전이 줄어드는 이유는 컨디션, 시력, 관절, 기분, 생활 변화처럼 다양해서 종합 건강검진이 첫걸음이에요."
    private val COGNITIVE = "길을 헤매는 일이 반복되면 인지 기능을 확인해 보는 게 좋아요. " +
        "\"요즘 길 찾기 어떠세요?\"로 시작해, 가까운 치매안심센터 무료 인지선별검사를 같이 받아보세요."

    /** 지표별 변화율(%). 기준선 야간 비율이 너무 작으면 야간은 빼고, 값이 없으면(운전 없음) -100%. */
    fun changes(base: Ind, cur: Ind): List<Pair<String, Int>> {
        fun pct(c: Double?, b: Double) = (((c ?: 0.0) / b - 1) * 100).roundToInt()
        val out = mutableListOf("운전 횟수" to pct(cur.trips, base.trips))
        if (base.night != null && base.night >= MIN_NIGHT_BASE) out += "밤 운전 비율" to pct(cur.night, base.night)
        if (base.radius != null) out += "집에서 가는 곳까지의 거리" to pct(cur.radius, base.radius)
        return out
    }

    /** 만성 채널 알림. month = 1~12(달력), firstYear = 기준선 완성 후 1년 안. */
    fun chronic(base: Ind, cur: Ind, month: Int, firstYear: Boolean): Message {
        val down = changes(base, cur).filter { it.second <= CHANGE_SHOWN }
        val what = down.joinToString(", ") { "${it.first} ${-it.second}%" }
        val body = buildString {
            append("최근 4주 동안 평소보다 ")
            append(if (what.isEmpty()) "운전이 조금" else what)
            append(" 줄었고, 두 달 가까이 이어지고 있어요. ")
            append("운전이 줄어드는 이유는 계절, 컨디션, 일정 변화처럼 다양해요.")
            if (firstYear && month in listOf(12, 1, 2)) append(" 겨울에는 운전이 줄기 쉬워서 계절 영향일 수도 있어요.")
        }
        return Message("평소와 다른 운전 패턴이 이어지고 있어요", body, CHECKUP)
    }

    /** 급성 채널 알림: 30일 안에 서로 다른 날 lostDays번. */
    fun acute(lostDays: Int): Message = Message(
        "길을 헤맨 일이 있었어요",
        "최근 30일 동안 서로 다른 날 ${lostDays}번, 평소 다니던 길에서 벗어나 맴돈 일이 있었어요. 차를 세웠을 때 집으로 갈지 여쭤봤어요.",
        COGNITIVE,
    )

    /** 매월 요약(알림이 없어도 보내는 "별일 없음" 확인). */
    fun monthly(base: Ind, cur: Ind): Message {
        val down = changes(base, cur).filter { it.second <= CHANGE_SHOWN }
        return if (down.isEmpty()) Message("이번 달 운전은 평소와 비슷해요", "운전 횟수, 밤 운전, 다니는 거리 모두 평소 범위예요.")
        else Message("이번 달 운전 요약", down.joinToString(", ") { "${it.first} ${-it.second}% 감소" } + ". 한 달만으로는 판단하지 않고 계속 지켜볼게요.")
    }
}
