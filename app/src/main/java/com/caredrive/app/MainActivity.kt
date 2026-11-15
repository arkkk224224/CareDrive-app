package com.caredrive.app

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.caredrive.app.core.Acute
import com.caredrive.app.core.AcuteScenario
import com.caredrive.app.core.AcuteWorld
import com.caredrive.app.core.AlertComposer
import com.caredrive.app.core.Ind
import com.caredrive.app.core.MIN_NIGHT_BASE
import com.caredrive.app.core.Action
import com.caredrive.app.core.Answer
import com.caredrive.app.core.ONSET
import com.caredrive.app.core.Scenario
import com.caredrive.app.core.runScenario

/**
 * 차량 화면 시연 콘솔. Pleos Connect SDK 연동 전 단계라 센서·내비 입력은 시뮬레이션이고,
 * 판정 로직(core/)은 실제 앱에 그대로 들어간다.
 */
class MainActivity : AppCompatActivity() {
    private val acute = Acute()
    private var day = 1
    private var trip = 1
    private var deviating = false
    private var stopped = false
    private var acuteSeed = 1L
    private var lastReason = ""

    private lateinit var acuteStatus: TextView
    private lateinit var prompt: LinearLayout
    private lateinit var acuteCard: TextView
    private lateinit var chart: ChartView
    private lateinit var summary: TextView
    private lateinit var chronicCard: TextView
    private var scenario = Scenario.ABRUPT // 시연 첫 화면에서 알림이 울리는 장면을 바로 보여준다
    private var seed = 1L

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun tv(text: String, sp: Float = 16f, bold: Boolean = false, color: Int = Color.parseColor("#1B1F24")) =
        TextView(this).apply {
            this.text = text; textSize = sp; setTextColor(color)
            if (bold) setTypeface(null, Typeface.BOLD)
            setPadding(0, dp(4), 0, dp(4))
        }

    private fun btn(text: String, onClick: () -> Unit) = Button(this).apply {
        this.text = text; textSize = 16f; isAllCaps = false; minHeight = dp(56)
        setOnClickListener { onClick() }
    }

    private fun card(bg: String = "#FFFFFF", vararg views: View) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(12), dp(16), dp(12))
        background = GradientDrawable().apply { setColor(Color.parseColor(bg)); cornerRadius = dp(12).toFloat(); setStroke(dp(1), Color.parseColor("#D5DAE0")) }
        views.forEach { addView(it) }
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { setMargins(0, dp(8), 0, dp(8)) }
    }

    private fun childCard() = tv("", 15f).apply {
        visibility = View.GONE; setPadding(dp(14), dp(10), dp(14), dp(10))
        background = GradientDrawable().apply { setColor(Color.parseColor("#FFF6E5")); cornerRadius = dp(10).toFloat(); setStroke(dp(1), Color.parseColor("#F0C36D")) }
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(16), dp(24), dp(24)) }
        root.addView(tv("케어드라이브 (CareDrive) — 차량 화면 시연 콘솔", 24f, true))
        root.addView(tv("센서·내비 입력은 시뮬레이션입니다. Pleos Connect SDK 연동은 SDK 접근 승인 후 이 입력을 실제 값으로 교체합니다. 판정 로직은 실제 앱 코드 그대로 동작합니다.", 14f, color = Color.GRAY))

        // ---- 급성 채널 ----
        acuteStatus = tv("평소 경로로 주행 중입니다.", 16f)
        prompt = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; visibility = View.GONE
            addView(tv("🔊 \"어디 가시나요? 집으로 안내할까요?\"", 18f, true, Color.parseColor("#0B5CAD")))
            val row = LinearLayout(context)
            row.addView(btn("\"집이요\"") { answer(Answer.ACCEPT) }, LinearLayout.LayoutParams(0, -2, 1f))
            row.addView(btn("\"아니요\"") { answer(Answer.REFUSE) }, LinearLayout.LayoutParams(0, -2, 1f))
            row.addView(btn("\"여기 가는 중이야\"") { answer(Answer.DESTINATION) }, LinearLayout.LayoutParams(0, -2, 1f))
            row.addView(btn("(무응답)") { answer(Answer.NONE) }, LinearLayout.LayoutParams(0, -2, 1f))
            addView(row)
        }
        acuteCard = childCard()
        val acuteRow = LinearLayout(this)
        acuteRow.addView(btn("평소 길 (비교)") { usual() }, LinearLayout.LayoutParams(0, -2, 1f))
        acuteRow.addView(btn("① 길을 벗어나 맴돈다") { deviate() }, LinearLayout.LayoutParams(0, -2, 1f))
        acuteRow.addView(btn("② 차를 세운다 (P단)") { stop() }, LinearLayout.LayoutParams(0, -2, 1f))
        acuteRow.addView(btn("다시 출발") { moveAgain() }, LinearLayout.LayoutParams(0, -2, 1f))
        acuteRow.addView(btn("다음 날 · 새 트립") { nextDay() }, LinearLayout.LayoutParams(0, -2, 1f))
        root.addView(card("#FFFFFF", tv("급성: 길을 잃었을 때 (정차 시에만 질문)", 20f, true), acuteRow, acuteStatus, prompt, acuteCard))

        // ---- 만성 채널 ----
        chart = ChartView(this).apply { layoutParams = LinearLayout.LayoutParams(-1, dp(240)) }
        summary = tv("", 15f)
        chronicCard = childCard()
        val spinner = Spinner(this).apply {
            adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, Scenario.entries.map { it.label })
            setSelection(scenario.ordinal)
            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) { scenario = Scenario.entries[pos]; runChronic() }
                override fun onNothingSelected(p: AdapterView<*>?) {}
            }
        }
        val chronicRow = LinearLayout(this)
        chronicRow.addView(spinner, LinearLayout.LayoutParams(0, dp(56), 2f))
        chronicRow.addView(btn("다른 운전자로 다시") { seed++; runChronic() }, LinearLayout.LayoutParams(0, -2, 1f))
        val legend = tv("파랑 운전 횟수 · 주황 야간 비율 · 이동 반경 초록 | 보라선 기준선 완성 · 회색선 감소 시작 · 빨강 막대 자녀 알림", 12f, color = Color.GRAY)
        root.addView(card("#FFFFFF", tv("만성: 몇 달에 걸친 운전 패턴 변화 (365일 시뮬레이션, 시간 압축)", 20f, true), chronicRow, legend, chart, summary, chronicCard))

        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#F4F6F8")); addView(root) })
        runChronic()
    }

    // ---------- 급성 ----------
    /** 합성 궤적(지난 28일 평소 경로 + 오늘 궤적)을 실제 이탈 감지기(RouteMonitor)에 넣은 결과를 보여준다. */
    private fun deviate() {
        stopped = false; prompt.visibility = View.GONE
        val run = AcuteWorld(acuteSeed++).run(AcuteScenario.LOST_WANDER)
        deviating = run.flagged
        lastReason = run.reason
        acuteStatus.text = if (run.flagged) "주행 중 · 이탈 후보: ${run.reason} (이탈 시작 ${"%.1f".format(run.minutesToFlag)}분 뒤 감지)\n" +
            "궤적 ${run.samples.size / 60}분을 이탈 감지기에 넣은 결과입니다. 주행 중에는 묻지 않습니다."
        else "주행 중 · 이번 궤적은 이탈 후보가 아닙니다. 질문하지 않습니다."
    }

    private fun usual() {
        stopped = false; prompt.visibility = View.GONE
        val run = AcuteWorld(acuteSeed++).run(AcuteScenario.USUAL)
        deviating = run.flagged
        acuteStatus.text = if (run.flagged) "평소 길인데 이탈 후보로 잡혔습니다: ${run.reason}" else "평소 길 · 궤적 ${run.samples.size / 60}분, 이탈 후보 아님. 질문하지 않습니다."
    }

    private fun stop() {
        if (!deviating) { acuteStatus.text = "평소 경로로 주행 중이라 질문하지 않습니다."; return }
        stopped = true
        acuteStatus.text = "정차(주차 브레이크 체결). 이탈 후보가 있어 한 번 묻습니다. 감지 이유: $lastReason"
        prompt.visibility = View.VISIBLE
    }

    private fun moveAgain() {
        stopped = false; prompt.visibility = View.GONE
        acuteStatus.text = if (deviating) "다시 주행 중 · 주행 중에는 묻지 않습니다." else "평소 경로로 주행 중입니다."
    }

    private fun answer(a: Answer) {
        val action = acute.handle(day, "trip$trip", stopped, a)
        prompt.visibility = View.GONE
        acuteStatus.text = when (action) {
            Action.ROUTE_HOME -> "내비 목적지를 집으로 설정했습니다 (NaviHelper.requestRoute · 시뮬레이션). 길 잃음 후보 1건 기록."
            Action.NORMAL -> "정상 이동으로 처리했습니다. 집계에서 제외합니다."
            Action.LOGGED -> "경로는 바꾸지 않습니다. 길 잃음 후보 1건 기록."
            null -> "오늘은 이미 질문했습니다 (하루 1회, 같은 트립 1회)."
        } + "\n서로 다른 날 후보 누적: ${acute.lostDays.toSet().size}건 (30일 안에 2건이면 자녀 알림)"
        if (acute.alert(day)) {
            acuteCard.visibility = View.VISIBLE
            val m = AlertComposer.acute(acute.lostDays.toSet().size)
            acuteCard.text = "📱 자녀 폰 알림 미리보기\n${m.title}\n${m.body}\n${m.coaching}"
        }
    }

    private fun nextDay() {
        day++; trip++; deviating = false; stopped = false; prompt.visibility = View.GONE
        acuteStatus.text = "새로운 날 · 평소 경로로 주행 중입니다. (날짜 $day)"
    }

    // ---------- 만성 ----------
    private fun runChronic() {
        val t = runScenario(seed, scenario)
        chart.trace = t
        val first = t.alertDays.firstOrNull()
        summary.text = buildString {
            append(t.baseDay?.let { "기준선 완성: ${it + 1}일째 (이후 고정). " } ?: "기준선이 아직 완성되지 않았습니다. ")
            append(
                when {
                    first != null -> "첫 관찰 알림: ${first + 1}일째 (감소 시작 ${ONSET + 1}일째 + ${(first - ONSET) / 7}주)."
                    scenario == Scenario.TRIPS_ONLY -> "지표 1개만 줄어 알리지 않습니다 (의도한 동작)."
                    scenario == Scenario.NORMAL -> "알림 없음 — 평소 변동에는 조용합니다."
                    else -> "이 운전자는 아직 알림 조건에 도달하지 못했습니다."
                },
            )
            append("\n합성 데이터 시뮬레이션입니다. 성능 입증이 아니라 동작 확인용입니다.")
        }
        chronicCard.visibility = if (first != null) View.VISIBLE else View.GONE
        if (first != null) {
            val base = Ind(1.0, if ((t.baseNight ?: 0.0) >= MIN_NIGHT_BASE) 1.0 else 0.0, 1.0) // Trace는 기준선 대비 비율이라 기준선 = 1
            val cur = Ind(t.tripsRatio[first].toDouble(), t.nightRatio[first].toDouble(), t.radiusRatio[first].toDouble())
            val month = java.time.LocalDate.of(2025, 9, 1).plusDays(first.toLong()).monthValue // 시뮬레이션 0일 = 9월 1일
            val m = AlertComposer.chronic(base, cur, month, firstYear = true)
            chronicCard.text = "📱 자녀 폰 알림 미리보기\n${m.title}\n${m.body}\n${m.coaching}"
        }
    }
}
