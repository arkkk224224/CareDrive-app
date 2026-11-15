package com.caredrive.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.caredrive.app.core.AcuteScenario
import com.caredrive.app.core.AcuteWorld
import org.json.JSONObject
import java.util.Locale

/**
 * 차량 앱 본체. 화면(V-000 ~ V-021)은 web/app/v 를 WebView 로 띄우고,
 * 음성(TTS·STT)·내비·이탈 감지는 이 브리지(window.CareDriveNative)가 맡는다.
 * Pleos SDK 승인 뒤에는 speak/listen/navigateHome 안쪽만 Pleos TextToSpeech·SpeechToText·NaviHelper 로 바꾼다.
 */
class VehicleActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var tts: TextToSpeech? = null
    private var stt: SpeechRecognizer? = null
    private var seed = 1L

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tts = TextToSpeech(this) { if (it == TextToSpeech.SUCCESS) tts?.language = Locale.KOREAN }
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // 차량 세션 토큰 보관
            webViewClient = WebViewClient()
            addJavascriptInterface(Bridge(), "CareDriveNative")
            systemUiVisibility = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            loadUrl(getString(R.string.web_url))
        }
        setContentView(web)
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
    }

    override fun onDestroy() {
        tts?.shutdown(); stt?.destroy()
        super.onDestroy()
    }

    /** STT 결과를 웹으로 넘긴다. 응답 분류(수락·거절·목적지·무응답)는 웹의 classify 가 한다. */
    private fun deliver(text: String) = web.evaluateJavascript("window.onCareDriveSpeech && window.onCareDriveSpeech(${JSONObject.quote(text)})", null)

    inner class Bridge {
        @JavascriptInterface
        fun speak(text: String) { tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "caredrive") }

        @JavascriptInterface
        fun listen() = runOnUiThread {
            // 음성을 외부 인식 서비스로 보내지 않는다: 기기 안에서만 도는 인식기가 있을 때만 듣고, 없으면 화면 버튼으로 답한다.
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ||
                Build.VERSION.SDK_INT < 33 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(this@VehicleActivity)) return@runOnUiThread
            stt = (stt ?: SpeechRecognizer.createOnDeviceSpeechRecognizer(this@VehicleActivity)).apply {
                setRecognitionListener(object : RecognitionListener {
                    override fun onResults(b: Bundle) { b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let(::deliver) }
                    override fun onError(error: Int) {} // 못 알아들으면 웹의 15초 타임아웃이 무응답으로 처리한다
                    override fun onReadyForSpeech(p: Bundle?) {}
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(v: Float) {}
                    override fun onBufferReceived(b: ByteArray?) {}
                    override fun onEndOfSpeech() {}
                    override fun onPartialResults(b: Bundle?) {}
                    override fun onEvent(t: Int, b: Bundle?) {}
                })
                startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR")
                })
            }
        }

        @JavascriptInterface
        fun stopListening() = runOnUiThread { stt?.cancel() }

        /** 집 안내. shortcut: 표준 내비 인텐트로 연다, Pleos 승인 뒤 NaviHelper.requestRoute(집, COMFORTABLE)로 교체. */
        @JavascriptInterface
        fun navigateHome() = runOnUiThread {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=" + Uri.encode("집")))) }
        }

        /** 합성 궤적(지난 28일 평소 경로 + 오늘 궤적)을 실제 이탈 감지기(core/Route.kt)에 넣어 판정한다. */
        @JavascriptInterface
        fun detectWander(kind: String): String {
            val run = AcuteWorld(seed++).run(if (kind == "wander") AcuteScenario.LOST_WANDER else AcuteScenario.USUAL)
            return JSONObject()
                .put("detected", run.flagged)
                .put("reason", if (run.flagged) "차가 감지한 이유: ${run.reason}" else "")
                .put("minutes", (run.minutesToFlag ?: 0.0).toInt().coerceAtLeast(10))
                .toString()
        }
    }
}
