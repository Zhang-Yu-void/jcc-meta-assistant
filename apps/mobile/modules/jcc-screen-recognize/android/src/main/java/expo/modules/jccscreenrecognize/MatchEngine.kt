package expo.modules.jccscreenrecognize

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

object MatchEngine {
  const val FP_SIZE = 24
  const val FP_LEN = FP_SIZE * FP_SIZE * 3
  const val HSV_BINS = 16
  const val MATCH_THRESHOLD = 0.72
  const val MATCH_MARGIN = 0.08
  const val EMPTY_VARIANCE = 140.0
  const val NCC_WEIGHT = 0.75
  const val HSV_WEIGHT = 0.25

  data class Template(val id: String, val name: String, val fingerprint: IntArray, val cost: Int?)

  @Volatile
  var templates: List<Template> = emptyList()

  fun rgbToHsv(r: Int, g: Int, b: Int): DoubleArray {
    val rn = r / 255.0
    val gn = g / 255.0
    val bn = b / 255.0
    val mx = maxOf(rn, gn, bn)
    val mn = minOf(rn, gn, bn)
    val d = mx - mn
    var h = 0.0
    if (d != 0.0) {
      h =
        when (mx) {
          rn -> ((gn - bn) / d) % 6.0
          gn -> (bn - rn) / d + 2.0
          else -> (rn - gn) / d + 4.0
        }
      h *= 60.0
      if (h < 0) h += 360.0
    }
    val s = if (mx == 0.0) 0.0 else d / mx
    return doubleArrayOf(h, s, mx)
  }

  fun costFromRgb(r: Int, g: Int, b: Int): Int? {
    val hsv = rgbToHsv(r, g, b)
    val h = hsv[0]
    val s = hsv[1]
    if (s < 0.18) return 1
    if (h >= 25 && h <= 55) return 5
    if (h >= 260 && h <= 310) return 4
    if (h >= 195 && h <= 250) return 3
    if (h >= 80 && h <= 160) return 2
    return null
  }

  fun fingerprintVariance(fp: List<Int>): Double {
    if (fp.isEmpty()) return 0.0
    val mean = fp.sum().toDouble() / fp.size
    var acc = 0.0
    for (x in fp) acc += (x - mean) * (x - mean)
    return acc / fp.size
  }

  fun hsvHistogram(fp: List<Int>): DoubleArray {
    val bins = DoubleArray(HSV_BINS)
    var weight = 0.0
    var i = 0
    while (i + 2 < fp.size) {
      accumulateHue(bins, fp[i], fp[i + 1], fp[i + 2]) { s -> weight += s }
      i += 3
    }
    return normalizeHist(bins, weight)
  }

  fun hsvHistogram(fp: IntArray): DoubleArray {
    val bins = DoubleArray(HSV_BINS)
    var weight = 0.0
    var i = 0
    while (i + 2 < fp.size) {
      accumulateHue(bins, fp[i], fp[i + 1], fp[i + 2]) { s -> weight += s }
      i += 3
    }
    return normalizeHist(bins, weight)
  }

  private fun accumulateHue(bins: DoubleArray, r: Int, g: Int, b: Int, onSat: (Double) -> Unit) {
    val hsv = rgbToHsv(r, g, b)
    val s = hsv[1]
    if (s < 0.08) return
    val idx = min(HSV_BINS - 1, kotlin.math.floor((hsv[0] / 360.0) * HSV_BINS).toInt())
    bins[idx] += s
    onSat(s)
  }

  private fun normalizeHist(bins: DoubleArray, weight: Double): DoubleArray {
    if (weight <= 0) return bins
    for (i in bins.indices) bins[i] /= weight
    return bins
  }

  fun matchNcc(a: List<Int>, b: IntArray): Double {
    if (a.isEmpty() || a.size != b.size) return 0.0
    val meanA = a.sum().toDouble() / a.size
    val meanB = b.sum().toDouble() / b.size
    var dot = 0.0
    var na = 0.0
    var nb = 0.0
    for (i in a.indices) {
      val da = a[i] - meanA
      val db = b[i] - meanB
      dot += da * db
      na += da * da
      nb += db * db
    }
    val eps = 1e-6
    if (na < eps && nb < eps) {
      val meanDiff = abs(meanA - meanB) / 255.0
      return if (meanDiff < 0.08) 1.0 else 0.0
    }
    if (na < eps || nb < eps) return 0.0
    return max(0.0, dot / sqrt(na * nb))
  }

  fun matchFingerprint(a: List<Int>, b: IntArray): Double {
    if (a.isEmpty() || a.size != b.size) return 0.0
    val ncc = matchNcc(a, b)
    val ha = hsvHistogram(a)
    val hb = hsvHistogram(b)
    var hist = 0.0
    for (i in ha.indices) hist += min(ha[i], hb[i])
    return NCC_WEIGHT * ncc + HSV_WEIGHT * hist
  }

  fun matchSlots(slots: List<MutableMap<String, Any>>): List<MutableMap<String, Any>> {
    val usable = templates.filter { it.fingerprint.size == FP_LEN }
    for (slot in slots) {
      @Suppress("UNCHECKED_CAST")
      val fp = slot["fingerprint"] as? List<Int> ?: emptyList()
      if (fingerprintVariance(fp) < EMPTY_VARIANCE) {
        slot["id"] = ""
        slot["name"] = ""
        slot["confidence"] = 0.0
        slot.remove("fingerprint")
        continue
      }
      val hinted = (slot["costHint"] as? Number)?.toInt()
      val pool =
        if (hinted != null && hinted in 1..5) {
          val filtered = usable.filter { it.cost == null || it.cost == hinted }
          if (filtered.isNotEmpty()) filtered else usable
        } else {
          usable
        }
      var bestId = ""
      var bestName = ""
      var best = -1.0
      var second = -1.0
      for (t in pool) {
        val score = matchFingerprint(fp, t.fingerprint)
        if (score > best) {
          second = best
          best = score
          bestId = t.id
          bestName = t.name
        } else if (score > second) {
          second = score
        }
      }
      val ok = best >= MATCH_THRESHOLD && best - max(0.0, second) >= MATCH_MARGIN
      slot["id"] = if (ok) bestId else ""
      slot["name"] = if (ok) bestName else ""
      slot["confidence"] = max(0.0, best)
      slot.remove("fingerprint")
    }
    return slots
  }

  fun ownedNames(slots: List<Map<String, Any>>): List<String> {
    val names = mutableListOf<String>()
    for (s in slots) {
      if (s["region"] != "board") continue
      val name = s["name"] as? String ?: continue
      if (name.isNotEmpty() && !names.contains(name)) names.add(name)
    }
    return names
  }

  fun shopNames(slots: List<Map<String, Any>>): List<String> {
    val names = mutableListOf<String>()
    for (s in slots) {
      if (s["region"] != "shop") continue
      val name = s["name"] as? String ?: continue
      if (name.isNotEmpty()) names.add(name)
    }
    return names
  }
}
