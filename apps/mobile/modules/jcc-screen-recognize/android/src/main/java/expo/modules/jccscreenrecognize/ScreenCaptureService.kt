package expo.modules.jccscreenrecognize

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import kotlin.math.min

class ScreenCaptureService : Service() {
  private var projection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var imageReader: ImageReader? = null
  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private val ticker = Handler(Looper.getMainLooper())
  private val projectionCallback =
    object : MediaProjection.Callback() {
      override fun onStop() {
        ticker.post {
          stopCapture()
          stopSelf()
        }
      }
    }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopCapture()
      stopSelf()
      return START_NOT_STICKY
    }
    val resultCode = intent?.getIntExtra(EXTRA_CODE, 0) ?: 0
    val data = projectionData(intent)
    try {
      startForegroundCompat()
    } catch (e: Exception) {
      errorEmitter?.invoke(e.message ?: "无法进入录屏前台服务")
      stopSelf()
      return START_NOT_STICKY
    }
    if (data == null) {
      errorEmitter?.invoke("录屏授权数据丢失，请重试")
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      startCapture(resultCode, data)
    } catch (e: Exception) {
      errorEmitter?.invoke(e.message ?: "启动录屏失败")
      stopCapture()
      stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun startForegroundCompat() {
    val channelId = "jcc-recognize"
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "对局识别", NotificationManager.IMPORTANCE_LOW),
      )
    }
    val notification: Notification =
      if (Build.VERSION.SDK_INT >= 26) {
        Notification.Builder(this, channelId)
          .setContentTitle("金铲铲 Meta 助手")
          .setContentText("正在识别对局（用户授权截屏）")
          .setSmallIcon(android.R.drawable.ic_menu_camera)
          .build()
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(this)
          .setContentTitle("金铲铲 Meta 助手")
          .setContentText("正在识别对局")
          .setSmallIcon(android.R.drawable.ic_menu_camera)
          .build()
      }
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(1, notification)
    }
  }

  private fun startCapture(resultCode: Int, data: Intent) {
    val mgr = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val mp = mgr.getMediaProjection(resultCode, data) ?: error("getMediaProjection 返回空")
    projection = mp
    mp.registerCallback(projectionCallback, ticker)
    val metrics = DisplayMetrics()
    val wm = getSystemService(WINDOW_SERVICE) as WindowManager
    @Suppress("DEPRECATION")
    wm.defaultDisplay.getRealMetrics(metrics)
    val srcW = metrics.widthPixels.coerceAtLeast(1)
    val srcH = metrics.heightPixels.coerceAtLeast(1)
    val scale = min(1f, MAX_CAPTURE_WIDTH / srcW.toFloat())
    val width = (srcW * scale).toInt().coerceAtLeast(1)
    val height = (srcH * scale).toInt().coerceAtLeast(1)
    val dpi = metrics.densityDpi
    thread = HandlerThread("jcc-capture").also { it.start() }
    handler = Handler(thread!!.looper)
    imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
    virtualDisplay =
      mp.createVirtualDisplay(
        "jcc-recognize",
        width,
        height,
        dpi,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
        imageReader?.surface,
        null,
        handler,
      )
    ticker.post(tickRunnable)
  }

  private var capturing = false

  private val tickRunnable: Runnable =
    object : Runnable {
      override fun run() {
        captureOnce()
        ticker.postDelayed(this, 1000)
      }
    }

  private fun captureOnce() {
    if (capturing) return
    capturing = true
    OverlayWindow.hideForCapture()
    ticker.postDelayed(
      {
        try {
          grabFrame()
        } finally {
          OverlayWindow.restoreAfterCapture()
          capturing = false
        }
      },
      80,
    )
  }

  private fun grabFrame() {
    val reader = imageReader ?: return
    val image = reader.acquireLatestImage() ?: return
    try {
      val plane = image.planes[0]
      val buffer = plane.buffer
      val pixelStride = plane.pixelStride
      val rowStride = plane.rowStride
      val width = image.width
      val height = image.height
      val rowPadding = rowStride - pixelStride * width
      val bmp = Bitmap.createBitmap(width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888)
      bmp.copyPixelsFromBuffer(buffer)
      val cropped = Bitmap.createBitmap(bmp, 0, 0, width, height)
      bmp.recycle()
      val slots = MatchEngine.matchSlots(buildSlots(cropped))
      cropped.recycle()
      OverlayWindow.updateText(
        MatchEngine.ownedNames(slots),
        MatchEngine.shopNames(slots),
        overlayAdvice,
      )
      emitter?.invoke(slots)
    } catch (e: Exception) {
      errorEmitter?.invoke(e.message ?: "capture failed")
    } finally {
      image.close()
    }
  }

  private fun stopCapture() {
    ticker.removeCallbacksAndMessages(null)
    virtualDisplay?.release()
    imageReader?.close()
    try {
      projection?.unregisterCallback(projectionCallback)
    } catch (_: Exception) {
    }
    try {
      projection?.stop()
    } catch (_: Exception) {
    }
    thread?.quitSafely()
    virtualDisplay = null
    imageReader = null
    projection = null
    thread = null
    handler = null
  }

  override fun onDestroy() {
    stopCapture()
    super.onDestroy()
  }

  companion object {
    const val ACTION_STOP = "jcc.STOP_CAPTURE"
    const val EXTRA_CODE = "code"
    const val EXTRA_DATA = "data"
    private const val MAX_CAPTURE_WIDTH = 1080
    var paneLeft = 0.0
    var paneRight = 1.0
    var overlayAdvice = ""
    var emitter: ((List<Map<String, Any>>) -> Unit)? = null
    var errorEmitter: ((String) -> Unit)? = null

    fun setPane(pane: String) {
      when (pane) {
        "right" -> {
          paneLeft = 0.5
          paneRight = 1.0
        }
        "full" -> {
          paneLeft = 0.0
          paneRight = 1.0
        }
        else -> {
          paneLeft = 0.0
          paneRight = 1.0
        }
      }
    }

    fun start(ctx: Context, resultCode: Int, data: Intent) {
      val intent = Intent(ctx, ScreenCaptureService::class.java)
      intent.putExtra(EXTRA_CODE, resultCode)
      intent.putExtra(EXTRA_DATA, data)
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
    }

    fun stop(ctx: Context) {
      OverlayWindow.hide()
      ctx.stopService(Intent(ctx, ScreenCaptureService::class.java))
    }

    private fun projectionData(intent: Intent?): Intent? {
      if (intent == null) return null
      return if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
      } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(EXTRA_DATA)
      }
    }
  }
}

private const val SHOP_TOP = 0.80
private const val SHOP_BOTTOM = 0.97
private const val SHOP_LEFT = 0.14
private const val SHOP_RIGHT = 0.86
private const val SHOP_SLOTS = 5
private const val SHOP_FACE_TOP = 0.22
private const val SHOP_FACE_BOTTOM = 0.28
private const val SHOP_FACE_SIDE = 0.16
private const val BOARD_TOP = 0.24
private const val BOARD_BOTTOM = 0.74
private const val BOARD_LEFT = 0.10
private const val BOARD_RIGHT = 0.90
private const val BOARD_ROWS = 4
private const val BOARD_COLS = 7
private const val BOARD_PAD = 0.28

private fun buildSlots(bmp: Bitmap): MutableList<MutableMap<String, Any>> {
  val slots = mutableListOf<MutableMap<String, Any>>()
  val originX = ScreenCaptureService.paneLeft * bmp.width
  val paneW = (ScreenCaptureService.paneRight - ScreenCaptureService.paneLeft) * bmp.width
  val shopW = (SHOP_RIGHT - SHOP_LEFT) * paneW
  val slotW = shopW / SHOP_SLOTS
  val shopTop = SHOP_TOP * bmp.height
  val shopH = (SHOP_BOTTOM - SHOP_TOP) * bmp.height
  for (i in 0 until SHOP_SLOTS) {
    val cellLeft = originX + SHOP_LEFT * paneW + i * slotW
    val bannerH = shopH * 0.12
    val costHint =
      meanCostHint(
        bmp,
        cellLeft.toInt(),
        shopTop.toInt(),
        slotW.toInt().coerceAtLeast(1),
        bannerH.toInt().coerceAtLeast(1),
      )
    val innerLeft = cellLeft + slotW * SHOP_FACE_SIDE
    val innerTop = shopTop + shopH * SHOP_FACE_TOP
    val innerW = slotW * (1 - 2 * SHOP_FACE_SIDE)
    val innerH = shopH * (1 - SHOP_FACE_TOP - SHOP_FACE_BOTTOM)
    slots.add(
      slotMap(
        "shop",
        i,
        sampleFingerprint(bmp, innerLeft.toInt(), innerTop.toInt(), innerW.toInt(), innerH.toInt()),
        costHint,
      ),
    )
  }
  val cellW = ((BOARD_RIGHT - BOARD_LEFT) * paneW) / BOARD_COLS
  val cellH = ((BOARD_BOTTOM - BOARD_TOP) * bmp.height) / BOARD_ROWS
  var index = 0
  for (r in 0 until BOARD_ROWS) {
    val rowOffset = if (r % 2 == 1) cellW * 0.5 else 0.0
    for (c in 0 until BOARD_COLS) {
      val cellLeft = originX + BOARD_LEFT * paneW + c * cellW + rowOffset
      val cellTop = BOARD_TOP * bmp.height + r * cellH
      slots.add(
        slotMap(
          "board",
          index,
          sampleFingerprint(
            bmp,
            (cellLeft + cellW * BOARD_PAD).toInt(),
            (cellTop + cellH * BOARD_PAD).toInt(),
            (cellW * (1 - 2 * BOARD_PAD)).toInt(),
            (cellH * (1 - 2 * BOARD_PAD)).toInt(),
          ),
          null,
        ),
      )
      index += 1
    }
  }
  return slots
}

private fun slotMap(
  region: String,
  index: Int,
  fingerprint: List<Int>,
  costHint: Int?,
): MutableMap<String, Any> {
  val map = mutableMapOf<String, Any>("region" to region, "index" to index, "fingerprint" to fingerprint)
  if (costHint != null) map["costHint"] = costHint
  return map
}

private fun meanCostHint(src: Bitmap, left: Int, top: Int, width: Int, height: Int): Int? {
  val safeLeft = left.coerceIn(0, src.width - 1)
  val safeTop = top.coerceIn(0, src.height - 1)
  val w = width.coerceAtMost(src.width - safeLeft).coerceAtLeast(1)
  val h = height.coerceAtMost(src.height - safeTop).coerceAtLeast(1)
  var r = 0L
  var g = 0L
  var b = 0L
  val n = w.toLong() * h
  for (y in 0 until h) {
    for (x in 0 until w) {
      val p = src.getPixel(safeLeft + x, safeTop + y)
      r += (p shr 16) and 0xFF
      g += (p shr 8) and 0xFF
      b += p and 0xFF
    }
  }
  return MatchEngine.costFromRgb((r / n).toInt(), (g / n).toInt(), (b / n).toInt())
}

private fun sampleFingerprint(src: Bitmap, left: Int, top: Int, width: Int, height: Int): List<Int> {
  val fp = MatchEngine.FP_SIZE
  val safeLeft = left.coerceIn(0, src.width - 1)
  val safeTop = top.coerceIn(0, src.height - 1)
  val w = width.coerceAtMost(src.width - safeLeft).coerceAtLeast(1)
  val h = height.coerceAtMost(src.height - safeTop).coerceAtLeast(1)
  val out = ArrayList<Int>(fp * fp * 3)
  for (y in 0 until fp) {
    for (x in 0 until fp) {
      val px = (safeLeft + ((x + 0.5) / fp) * w).toInt().coerceIn(safeLeft, safeLeft + w - 1)
      val py = (safeTop + ((y + 0.5) / fp) * h).toInt().coerceIn(safeTop, safeTop + h - 1)
      val p = src.getPixel(px, py)
      out.add((p shr 16) and 0xFF)
      out.add((p shr 8) and 0xFF)
      out.add(p and 0xFF)
    }
  }
  return out
}
