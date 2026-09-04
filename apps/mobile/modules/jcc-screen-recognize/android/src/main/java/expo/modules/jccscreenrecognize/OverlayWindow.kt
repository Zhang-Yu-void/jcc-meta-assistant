package expo.modules.jccscreenrecognize

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.abs

object OverlayWindow {
  private val main = Handler(Looper.getMainLooper())
  private var wm: WindowManager? = null
  private var root: LinearLayout? = null
  private var params: WindowManager.LayoutParams? = null
  private var panel: ScrollView? = null
  private var body: TextView? = null
  private var expanded = false
  private var hiddenForCapture = false
  private var lastText = "等待识别…"

  fun show(ctx: Context) {
    main.post {
      if (root != null) return@post
      val app = ctx.applicationContext
      val windowManager = app.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      wm = windowManager
      val density = app.resources.displayMetrics.density
      val ballSize = (56 * density).toInt()
      val ball =
        TextView(app).apply {
          text = "铲"
          textSize = 20f
          setTextColor(Color.WHITE)
          gravity = Gravity.CENTER
          background =
            GradientDrawable().apply {
              shape = GradientDrawable.OVAL
              setColor(Color.parseColor("#0284c7"))
            }
          layoutParams = LinearLayout.LayoutParams(ballSize, ballSize)
        }
      body =
        TextView(app).apply {
          text = lastText
          textSize = 13f
          setTextColor(Color.parseColor("#e2e8f0"))
          setPadding((10 * density).toInt(), (8 * density).toInt(), (10 * density).toInt(), (8 * density).toInt())
        }
      panel =
        ScrollView(app).apply {
          visibility = View.GONE
          setBackgroundColor(Color.parseColor("#E61E293B"))
          addView(body, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
          layoutParams =
            LinearLayout.LayoutParams((280 * density).toInt(), LinearLayout.LayoutParams.WRAP_CONTENT).apply {
              topMargin = (8 * density).toInt()
            }
        }
      val container =
        LinearLayout(app).apply {
          orientation = LinearLayout.VERTICAL
          addView(ball)
          addView(panel)
        }
      var downRawX = 0f
      var downRawY = 0f
      var startX = 0
      var startY = 0
      var dragging = false
      ball.setOnTouchListener { _, event ->
        val lp = params ?: return@setOnTouchListener false
        when (event.actionMasked) {
          MotionEvent.ACTION_DOWN -> {
            dragging = false
            downRawX = event.rawX
            downRawY = event.rawY
            startX = lp.x
            startY = lp.y
            true
          }
          MotionEvent.ACTION_MOVE -> {
            val dx = (event.rawX - downRawX).toInt()
            val dy = (event.rawY - downRawY).toInt()
            if (abs(dx) > 8 || abs(dy) > 8) dragging = true
            lp.x = startX + dx
            lp.y = startY + dy
            try {
              windowManager.updateViewLayout(container, lp)
            } catch (_: Exception) {
            }
            true
          }
          MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
            if (!dragging) togglePanel()
            true
          }
          else -> false
        }
      }
      val type =
        if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
      val lp =
        WindowManager.LayoutParams(
          WindowManager.LayoutParams.WRAP_CONTENT,
          WindowManager.LayoutParams.WRAP_CONTENT,
          type,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
          PixelFormat.TRANSLUCENT,
        )
      lp.gravity = Gravity.TOP or Gravity.END
      lp.x = (12 * density).toInt()
      lp.y = (80 * density).toInt()
      params = lp
      root = container
      try {
        windowManager.addView(container, lp)
      } catch (_: Exception) {
        root = null
      }
    }
  }

  fun hide() {
    main.post {
      val view = root ?: return@post
      try {
        wm?.removeView(view)
      } catch (_: Exception) {
      }
      root = null
      panel = null
      body = null
      params = null
      wm = null
      expanded = false
      hiddenForCapture = false
    }
  }

  fun hideForCapture() {
    main.post {
      hiddenForCapture = true
      root?.visibility = View.INVISIBLE
    }
  }

  fun restoreAfterCapture() {
    main.post {
      hiddenForCapture = false
      root?.visibility = View.VISIBLE
    }
  }

  fun updateText(owned: List<String>, shop: List<String>, advice: String) {
    val text =
      buildString {
        append("场上：")
        append(if (owned.isEmpty()) "—" else owned.joinToString("、"))
        append("\n商店：")
        append(if (shop.isEmpty()) "—" else shop.joinToString("、"))
        if (advice.isNotBlank()) {
          append("\n\n")
          append(advice)
        }
      }
    lastText = text
    main.post { body?.text = text }
  }

  private fun togglePanel() {
    expanded = !expanded
    panel?.visibility = if (expanded) View.VISIBLE else View.GONE
  }
}
