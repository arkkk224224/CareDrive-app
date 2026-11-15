package com.caredrive.app.core

// 타인 운전 필터: 부모 본인의 트립 조작 특징(평균 속도, 상위 5% 속도, 감속 표준편차) 분포에서
// 마할라노비스 거리가 chi²(0.99, 자유도 3)를 넘는 트립을 타인 운전으로 보고 집계에서 뺀다.
// 한계: 운전 습관이 비슷한 가족은 걸러지지 않는다.

const val CHI2_99_DF3 = 11.345
const val MIN_FIT_TRIPS = 20

class OtherDriverFilter(val mean: DoubleArray, val inv: Array<DoubleArray>) {
    fun d2(x: DoubleArray): Double {
        val d = DoubleArray(3) { x[it] - mean[it] }
        var s = 0.0
        for (i in 0..2) for (j in 0..2) s += d[i] * inv[i][j] * d[j]
        return s
    }

    fun isOther(t: Trip) = d2(t.features()) > CHI2_99_DF3

    companion object {
        /**
         * 기준선 학습 기간의 트립(타인 운전이 섞여 있을 수 있음)으로 부모의 조작 특징 분포를 맞춘다.
         * 트립을 k-평균으로 두 무리로 나눠, 큰 무리가 55% 이상이고 작은 무리가 큰 무리 분포 밖(chi² 99%)에 있을 때만
         * 큰 무리를 부모로 본다. 아니면 운전자가 한 명이라고 보고 전체로 맞춘다(이때는 사실상 거르지 않는다).
         * 전제: 부모가 그 차 트립의 과반을 운전한다. 트립이 20개 미만이면 null.
         */
        fun fit(trips: List<Trip>): OtherDriverFilter? {
            if (trips.size < MIN_FIT_TRIPS) return null
            val xs = trips.map { it.features() }
            val all = fitRaw(xs) ?: return null
            val mu = DoubleArray(3) { k -> xs.sumOf { it[k] } / xs.size }
            val sd = DoubleArray(3) { k -> kotlin.math.sqrt(xs.sumOf { (it[k] - mu[k]) * (it[k] - mu[k]) } / (xs.size - 1)) + 1e-9 }
            val z = xs.map { x -> DoubleArray(3) { (x[it] - mu[it]) / sd[it] } }
            var c = arrayOf(z.minBy { it.sum() }.copyOf(), z.maxBy { it.sum() }.copyOf())
            var label = IntArray(z.size)
            repeat(20) {
                label = IntArray(z.size) { i -> if (d2e(z[i], c[0]) <= d2e(z[i], c[1])) 0 else 1 }
                c = Array(2) { g -> val m = z.indices.filter { label[it] == g }; if (m.isEmpty()) c[g] else DoubleArray(3) { k -> m.sumOf { z[it][k] } / m.size } }
            }
            val big = if (label.count { it == 0 } >= label.count { it == 1 }) 0 else 1
            val members = xs.indices.filter { label[it] == big }
            if (members.size < MIN_FIT_TRIPS || members.size < 0.55 * xs.size) return all
            val own = fitRaw(members.map { xs[it] }) ?: return all
            val minor = xs.indices.filter { label[it] != big }.map { xs[it] }
            val minorCenter = DoubleArray(3) { k -> minor.sumOf { it[k] } / minor.size }
            return if (own.d2(minorCenter) > CHI2_99_DF3) own else all
        }

        private fun d2e(a: DoubleArray, b: DoubleArray) = (0..2).sumOf { (a[it] - b[it]) * (a[it] - b[it]) }

        private fun fitRaw(xs: List<DoubleArray>): OtherDriverFilter? {
            if (xs.size < 2) return null
            val mean = DoubleArray(3) { k -> xs.sumOf { it[k] } / xs.size }
            val cov = Array(3) { i -> DoubleArray(3) { j -> xs.sumOf { (it[i] - mean[i]) * (it[j] - mean[j]) } / (xs.size - 1) } }
            for (i in 0..2) cov[i][i] += 1e-6 + 0.01 * cov[i][i] // 특이 행렬 방지
            return OtherDriverFilter(mean, inverse3(cov))
        }

        fun inverse3(m: Array<DoubleArray>): Array<DoubleArray> {
            val (a, b, c) = Triple(m[0][0], m[0][1], m[0][2])
            val (d, e, f) = Triple(m[1][0], m[1][1], m[1][2])
            val (g, h, i) = Triple(m[2][0], m[2][1], m[2][2])
            val det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
            return arrayOf(
                doubleArrayOf((e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det),
                doubleArrayOf((f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det),
                doubleArrayOf((d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det),
            )
        }
    }
}
