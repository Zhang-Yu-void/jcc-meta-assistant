package expo.modules.jccscreenrecognize

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class JccScreenRecognizeModule : Module() {
  companion object {
    const val REQUEST_CODE = 7127
    var pendingPromise: Promise? = null
    var overlayPromise: Promise? = null
  }

  override fun definition() = ModuleDefinition {
    Name("JccScreenRecognize")
    Events("onFrame", "onError", "onStopped")

    OnActivityResult { _, payload ->
      val requestCode = payload.requestCode
      val resultCode = payload.resultCode
      val data = payload.data
      if (requestCode != REQUEST_CODE) return@OnActivityResult
      val promise = pendingPromise
      pendingPromise = null
      if (resultCode != Activity.RESULT_OK || data == null) {
        sendEvent("onError", mapOf("message" to "用户拒绝录屏或系统禁止捕获"))
        promise?.resolve(false)
        return@OnActivityResult
      }
      val activity = appContext.currentActivity
      val ctx = activity ?: appContext.reactContext
      if (ctx == null) {
        promise?.resolve(false)
        return@OnActivityResult
      }
      ScreenCaptureService.emitter = { slots ->
        sendEvent("onFrame", mapOf("slots" to slots))
      }
      ScreenCaptureService.errorEmitter = { msg ->
        sendEvent("onError", mapOf("message" to msg))
      }
      val start =
        Runnable {
          try {
            ScreenCaptureService.start(ctx, resultCode, data)
            val overlayCtx = appContext.reactContext ?: ctx
            OverlayWindow.show(overlayCtx)
            promise?.resolve(true)
          } catch (e: Exception) {
            sendEvent("onError", mapOf("message" to (e.message ?: "启动录屏服务失败")))
            promise?.resolve(false)
          }
        }
      if (activity != null) activity.runOnUiThread(start) else start.run()
    }

    OnActivityEntersForeground {
      val p = overlayPromise ?: return@OnActivityEntersForeground
      val ctx = appContext.reactContext ?: return@OnActivityEntersForeground
      overlayPromise = null
      p.resolve(Settings.canDrawOverlays(ctx))
    }

    AsyncFunction("startCapture") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "没有 Activity，无法申请录屏", null)
        return@AsyncFunction
      }
      pendingPromise = promise
      val mgr = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      activity.startActivityForResult(mgr.createScreenCaptureIntent(), REQUEST_CODE)
    }

    AsyncFunction("stopCapture") {
      OverlayWindow.hide()
      appContext.reactContext?.let { ScreenCaptureService.stop(it) }
      sendEvent("onStopped", emptyMap<String, Any>())
    }

    Function("isAvailable") {
      Build.VERSION.SDK_INT >= 21
    }

    Function("setLayout") { pane: String ->
      ScreenCaptureService.setPane(pane)
    }

    Function("canDrawOverlays") {
      val ctx = appContext.reactContext ?: return@Function false
      Settings.canDrawOverlays(ctx)
    }

    AsyncFunction("requestOverlayPermission") { promise: Promise ->
      val ctx = appContext.reactContext
      val activity = appContext.currentActivity
      if (ctx == null || activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      if (Settings.canDrawOverlays(ctx)) {
        promise.resolve(true)
        return@AsyncFunction
      }
      overlayPromise = promise
      val intent =
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))
      activity.startActivity(intent)
    }

    Function("startOverlay") {
      val ctx = appContext.reactContext
      if (ctx != null) OverlayWindow.show(ctx)
      null
    }

    Function("stopOverlay") {
      OverlayWindow.hide()
      null
    }

    Function("setAdvice") { summary: String ->
      ScreenCaptureService.overlayAdvice = summary
      null
    }

    Function("setTemplates") { raw: List<Map<String, Any>> ->
      MatchEngine.templates =
        raw.mapNotNull { row ->
          val id = row["id"] as? String ?: return@mapNotNull null
          val name = row["name"] as? String ?: id
          val cost = (row["cost"] as? Number)?.toInt()
          val fpRaw = row["fingerprint"] ?: return@mapNotNull null
          val fp =
            when (fpRaw) {
              is List<*> -> fpRaw.map { (it as? Number)?.toInt() ?: 0 }.toIntArray()
              else -> return@mapNotNull null
            }
          MatchEngine.Template(id, name, fp, cost)
        }
    }
  }
}
