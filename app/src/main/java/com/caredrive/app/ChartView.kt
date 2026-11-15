package com.caredrive.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import com.caredrive.app.core.ONSET
import com.caredrive.app.core.SIM_DAYS
import com.caredrive.app.core.Trace

/** 기준선 대비 지표 3개(1.0 = 기준선)와 -30% 임계선, 알림이 울린 날을 그린다. */
class ChartView(context: Context) : View(context) {
    var trace: Trace? = null
        set(v) { field = v; invalidate() }

    private val d = resources.displayMetrics.density
    private val axis = Paint().apply { color = Color.LTGRAY; strokeWidth = d }
    private val dash = Paint().apply { strokeWidth = 1.5f * d; style = Paint.Style.STROKE; pathEffect = DashPathEffect(floatArrayOf(8 * d, 6 * d), 0f) }
    private val line = Paint().apply { strokeWidth = 2f * d; style = Paint.Style.STROKE; isAntiAlias = true }
    private val text = Paint().apply { textSize = 11f * d; color = Color.DKGRAY; isAntiAlias = true }

    private val series = listOf(
        Triple("운전 횟수", Color.parseColor("#1E6FD9")) { t: Trace -> t.tripsRatio },
        Triple("야간 비율", Color.parseColor("#E08A00")) { t: Trace -> t.nightRatio },
        Triple("이동 반경", Color.parseColor("#2E9D5B")) { t: Trace -> t.radiusRatio },
    )

    override fun onDraw(c: Canvas) {
        val left = 36 * d; val right = width - 8 * d; val top = 8 * d; val bottom = height - 22 * d
        val maxV = 1.6f
        fun x(day: Int) = left + (right - left) * day / (SIM_DAYS - 1)
        fun y(v: Float) = bottom - (bottom - top) * (v.coerceIn(0f, maxV) / maxV)

        for (g in listOf(0f, 0.5f, 1f, 1.5f)) { c.drawLine(left, y(g), right, y(g), axis); c.drawText("%.1f".format(g), 4 * d, y(g) + 4 * d, text) }
        dash.color = Color.GRAY; c.drawLine(left, y(1f), right, y(1f), dash)
        dash.color = Color.RED; c.drawLine(left, y(0.7f), right, y(0.7f), dash)
        c.drawText("-30% 임계", right - 70 * d, y(0.7f) - 4 * d, text.apply { color = Color.RED }); text.color = Color.DKGRAY
        for (m in 0..12 step 2) c.drawText("${m}개월", x((m * 30).coerceAtMost(SIM_DAYS - 1)) - 14 * d, height - 4 * d, text)

        val t = trace ?: return
        dash.color = Color.GRAY; c.drawLine(x(ONSET), top, x(ONSET), bottom, dash)
        t.baseDay?.let { dash.color = Color.parseColor("#7A3FBF"); c.drawLine(x(it), top, x(it), bottom, dash) }
        for ((_, color, pick) in series) {
            line.color = color
            val p = Path(); var started = false
            pick(t).forEachIndexed { i, v -> if (!v.isNaN()) { if (started) p.lineTo(x(i), y(v)) else { p.moveTo(x(i), y(v)); started = true } } }
            c.drawPath(p, line)
        }
        line.color = Color.RED; line.strokeWidth = 3f * d
        for (a in t.alertDays) c.drawLine(x(a), top, x(a), bottom, line)
        line.strokeWidth = 2f * d
    }
}
