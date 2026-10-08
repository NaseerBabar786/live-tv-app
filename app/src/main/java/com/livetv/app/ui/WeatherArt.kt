package com.livetv.app.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.livetv.app.data.WeatherApp
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/*
 * The Weather section's drawn graphics (1.10.22): weather pictures instead of emoji, a sky that matches the
 * weather (soft drifting clouds, falling rain or snow, night sky), and the 24-hour temperature graph, like
 * The Weather Network's phone app. All drawn here, so nothing is downloaded.
 */

private val SunCore = listOf(Color(0xFFFFF6B0), Color(0xFFFFD23F), Color(0xFFFF9F1C))
private val CloudLight = listOf(Color(0xFFFFFFFF), Color(0xFFC9D4EA))
private val CloudDark = listOf(Color(0xFFC3CDE3), Color(0xFF8391B3))
private val CloudStorm = listOf(Color(0xFF9AA5C0), Color(0xFF5A6684))
private val Drop = listOf(Color(0xFF9FE0FF), Color(0xFF2F8CFF))

private enum class Sky { Clear, Partly, Cloudy, Fog, Rain, Snow, Storm }

private fun skyOf(code: Int): Sky = when (code) {
    0, 1 -> Sky.Clear
    2 -> Sky.Partly
    3 -> Sky.Cloudy
    45, 48 -> Sky.Fog
    in 51..67, in 80..82 -> Sky.Rain
    in 71..77, 85, 86 -> Sky.Snow
    in 95..99 -> Sky.Storm
    else -> Sky.Cloudy
}

/** A drawn weather picture for a WMO weather [code]. */
@Composable
fun WeatherIcon(code: Int, day: Boolean = true, size: Dp = 40.dp, modifier: Modifier = Modifier) {
    Canvas(modifier.size(size)) { drawWeather(skyOf(code), day) }
}

private fun DrawScope.drawWeather(sky: Sky, day: Boolean) {
    val w = size.width
    when (sky) {
        Sky.Clear -> if (day) sun(Offset(w * 0.5f, w * 0.5f), w * 0.24f) else moon(Offset(w * 0.5f, w * 0.5f), w * 0.3f)
        Sky.Partly -> {
            if (day) sun(Offset(w * 0.62f, w * 0.36f), w * 0.18f) else moon(Offset(w * 0.64f, w * 0.34f), w * 0.2f)
            cloud(Offset(w * 0.06f, w * 0.38f), w * 0.8f, CloudLight)
        }
        Sky.Cloudy -> {
            cloud(Offset(w * 0.22f, w * 0.18f), w * 0.72f, CloudDark)
            cloud(Offset(w * 0.04f, w * 0.34f), w * 0.84f, CloudLight)
        }
        Sky.Fog -> {
            cloud(Offset(w * 0.1f, w * 0.14f), w * 0.8f, CloudDark)
            for (i in 0..2) {
                val y = w * (0.72f + i * 0.1f)
                drawLine(Color.White.copy(alpha = 0.8f), Offset(w * (0.12f + i * 0.06f), y), Offset(w * (0.88f - i * 0.04f), y), w * 0.045f, StrokeCap.Round)
            }
        }
        Sky.Rain -> {
            cloud(Offset(w * 0.2f, w * 0.04f), w * 0.72f, CloudDark)
            cloud(Offset(w * 0.04f, w * 0.16f), w * 0.86f, CloudLight)
            listOf(0.3f, 0.5f, 0.7f).forEachIndexed { i, x -> drop(Offset(w * x, w * (0.8f + if (i == 1) 0.06f else 0f)), w * 0.07f) }
        }
        Sky.Snow -> {
            cloud(Offset(w * 0.04f, w * 0.1f), w * 0.88f, CloudLight)
            listOf(0.3f, 0.5f, 0.7f).forEachIndexed { i, x -> flake(Offset(w * x, w * (0.82f + if (i == 1) 0.06f else 0f)), w * 0.06f) }
        }
        Sky.Storm -> {
            cloud(Offset(w * 0.04f, w * 0.06f), w * 0.9f, CloudStorm)
            val bolt = Path().apply {
                moveTo(w * 0.56f, w * 0.56f)
                lineTo(w * 0.4f, w * 0.78f)
                lineTo(w * 0.52f, w * 0.78f)
                lineTo(w * 0.44f, w * 0.98f)
                lineTo(w * 0.66f, w * 0.7f)
                lineTo(w * 0.54f, w * 0.7f)
                lineTo(w * 0.62f, w * 0.56f)
                close()
            }
            drawPath(bolt, Color(0xFFFFD23F))
        }
    }
}

private fun DrawScope.sun(c: Offset, r: Float) {
    drawCircle(Brush.radialGradient(listOf(Color(0xA6FFD23F), Color(0x00FFD23F)), c, r * 2.1f), r * 2.1f, c)
    for (i in 0 until 8) {
        val a = i * Math.PI / 4
        val from = Offset(c.x + (r * 1.35f * cos(a)).toFloat(), c.y + (r * 1.35f * sin(a)).toFloat())
        val to = Offset(c.x + (r * 1.75f * cos(a)).toFloat(), c.y + (r * 1.75f * sin(a)).toFloat())
        drawLine(Color(0xFFFFD23F), from, to, r * 0.2f, StrokeCap.Round)
    }
    drawCircle(Brush.radialGradient(SunCore, Offset(c.x - r * 0.3f, c.y - r * 0.3f), r * 1.4f), r, c)
}

private fun DrawScope.moon(c: Offset, r: Float) {
    drawCircle(Color(0x2EB4C8FF), r * 1.5f, c)
    val path = Path().apply {
        addOval(androidx.compose.ui.geometry.Rect(c.x - r, c.y - r, c.x + r, c.y + r))
    }
    val bite = Path().apply {
        addOval(androidx.compose.ui.geometry.Rect(c.x - r * 0.35f, c.y - r * 1.25f, c.x + r * 1.45f, c.y + r * 0.55f))
    }
    drawPath(Path.combine(androidx.compose.ui.graphics.PathOperation.Difference, path, bite), Color(0xFFE8EEFF))
}

/** A puffy cloud [width] wide with its top-left at [at]. */
private fun DrawScope.cloud(at: Offset, width: Float, colors: List<Color>) {
    val h = width * 0.6f
    val path = Path().apply {
        val x = at.x
        val y = at.y
        addRoundRect(androidx.compose.ui.geometry.RoundRect(x, y + h * 0.48f, x + width, y + h, h * 0.26f, h * 0.26f))
        addOval(androidx.compose.ui.geometry.Rect(x + width * 0.12f, y + h * 0.26f, x + width * 0.5f, y + h * 0.86f))
        addOval(androidx.compose.ui.geometry.Rect(x + width * 0.3f, y, x + width * 0.78f, y + h * 0.8f))
        addOval(androidx.compose.ui.geometry.Rect(x + width * 0.58f, y + h * 0.3f, x + width * 0.96f, y + h * 0.9f))
    }
    // A soft shadow under it, then the cloud lit from above.
    translate(0f, h * 0.06f) { drawPath(path, Color(0x33000000)) }
    drawPath(path, Brush.verticalGradient(colors, at.y, at.y + h))
}

private fun DrawScope.drop(c: Offset, r: Float) {
    val path = Path().apply {
        moveTo(c.x, c.y - r * 2.2f)
        cubicTo(c.x + r * 0.6f, c.y - r * 1.2f, c.x + r, c.y - r * 0.5f, c.x + r, c.y)
        cubicTo(c.x + r, c.y + r * 0.6f, c.x + r * 0.55f, c.y + r, c.x, c.y + r)
        cubicTo(c.x - r * 0.55f, c.y + r, c.x - r, c.y + r * 0.6f, c.x - r, c.y)
        cubicTo(c.x - r, c.y - r * 0.5f, c.x - r * 0.6f, c.y - r * 1.2f, c.x, c.y - r * 2.2f)
        close()
    }
    drawPath(path, Brush.verticalGradient(Drop, c.y - r * 2.2f, c.y + r))
}

private fun DrawScope.flake(c: Offset, r: Float) {
    for (i in 0 until 3) {
        rotate(i * 60f, c) { drawLine(Color.White, Offset(c.x, c.y - r), Offset(c.x, c.y + r), r * 0.35f, StrokeCap.Round) }
    }
}

/**
 * The sky behind the Weather section: its colours follow the weather and the time of day, with slowly
 * drifting clouds and falling rain or snow when it's wet.
 */
@Composable
fun SkyBackdrop(code: Int?, day: Boolean, modifier: Modifier = Modifier) {
    val sky = code?.let(::skyOf) ?: Sky.Cloudy
    val colors = when {
        !day && sky == Sky.Clear -> listOf(Color(0xFF0F1B3D), Color(0xFF070C22))
        !day -> listOf(Color(0xFF1C2647), Color(0xFF090E24))
        sky == Sky.Clear -> listOf(Color(0xFF3F86E0), Color(0xFF1D3F86))
        sky == Sky.Partly -> listOf(Color(0xFF4677C4), Color(0xFF1E356E))
        sky == Sky.Storm -> listOf(Color(0xFF2E3250), Color(0xFF0D0F21))
        sky == Sky.Snow -> listOf(Color(0xFF7586A8), Color(0xFF2F3A5A))
        sky == Sky.Rain -> listOf(Color(0xFF3B4F78), Color(0xFF16213F))
        else -> listOf(Color(0xFF55658A), Color(0xFF222C4C))
    }
    val time = rememberInfiniteTransition(label = "sky")
    val drift by time.animateFloat(0f, 1f, infiniteRepeatable(tween(90_000, easing = LinearEasing)), label = "drift")
    val fall by time.animateFloat(0f, 1f, infiniteRepeatable(tween(if (sky == Sky.Snow) 9_000 else 1_400, easing = LinearEasing)), label = "fall")
    val specks = remember { List(70) { Triple(Random.nextFloat(), Random.nextFloat(), Random.nextFloat()) } }
    Box(modifier.fillMaxSize()) {
        Canvas(Modifier.fillMaxSize()) {
            drawRect(Brush.verticalGradient(colors))
            // Big soft clouds (fewer under a clear sky), drifting across.
            val clouds = when (sky) {
                Sky.Clear -> 1
                Sky.Partly -> 3
                else -> 4
            }
            for (i in 0 until clouds) {
                val r = size.height * (0.32f + 0.08f * (i % 2))
                val x = ((i * 0.31f + drift) % 1.3f - 0.15f) * size.width
                val y = size.height * (0.05f + 0.12f * i)
                val alpha = if (!day) 0.18f else if (sky == Sky.Clear) 0.12f else 0.32f
                drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = alpha), Color.Transparent), Offset(x, y), r), r, Offset(x, y))
            }
            // Stars on a clear night.
            if (!day && (sky == Sky.Clear || sky == Sky.Partly)) {
                specks.forEach { (a, b, c) -> drawCircle(Color.White.copy(alpha = 0.25f + 0.5f * c), 1.2f + 1.5f * c, Offset(a * size.width, b * size.height * 0.6f)) }
            }
            if (sky == Sky.Rain || sky == Sky.Storm) {
                specks.forEach { (a, b, c) ->
                    val y = ((b + fall) % 1f) * size.height
                    val x = a * size.width - y * 0.18f
                    drawLine(Color.White.copy(alpha = 0.10f + 0.12f * c), Offset(x, y), Offset(x - 8f, y + 40f + 30f * c), 1.5f)
                }
            }
            if (sky == Sky.Snow) {
                specks.forEach { (a, b, c) ->
                    val y = ((b + fall * (0.6f + 0.4f * c)) % 1f) * size.height
                    val x = a * size.width + sin((y / size.height + c) * 6.28f) * 14f
                    drawCircle(Color.White.copy(alpha = 0.35f + 0.4f * c), 2f + 3f * c, Offset(x, y))
                }
            }
            // Darker towards the edges.
            drawRect(Brush.radialGradient(listOf(Color.Transparent, Color(0x8C050A1E)), Offset(size.width * 0.3f, size.height * 0.2f), size.maxDimension))
        }
    }
}

/**
 * The next hours as a smooth temperature line with a soft fill, the temperature over every other hour,
 * and the chance of rain as bars along the bottom with the hour under them.
 */
@Composable
fun TempGraph(hours: List<WeatherApp.Hour>, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    val label = TextStyle(color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    val small = TextStyle(color = Color.White.copy(alpha = 0.75f), fontSize = 11.sp)
    val rainStyle = TextStyle(color = Color(0xFF8FD3FF), fontSize = 10.sp)
    Canvas(modifier) {
        if (hours.size < 2) return@Canvas
        val step = size.width / hours.size
        val top = size.height * 0.16f
        val bottom = size.height * 0.62f
        val low = hours.minOf { it.temperature } - 2
        val high = hours.maxOf { it.temperature } + 2
        fun y(t: Int) = bottom - (t - low).toFloat() / (high - low).coerceAtLeast(1) * (bottom - top)
        val points = hours.mapIndexed { i, h -> Offset(i * step + step / 2, y(h.temperature)) }
        val line = Path().apply {
            moveTo(points[0].x, points[0].y)
            for (i in 1 until points.size) {
                val a = points[i - 1]
                val b = points[i]
                val mid = (a.x + b.x) / 2
                cubicTo(mid, a.y, mid, b.y, b.x, b.y)
            }
        }
        val fill = Path().apply {
            addPath(line)
            lineTo(points.last().x, bottom + size.height * 0.08f)
            lineTo(points.first().x, bottom + size.height * 0.08f)
            close()
        }
        drawPath(fill, Brush.verticalGradient(listOf(Color(0x8CFFD23F), Color(0x00FFD23F)), top, bottom + size.height * 0.08f))
        drawPath(line, Color(0xFFFFD23F), style = Stroke(3.dp.toPx(), cap = StrokeCap.Round))
        val barBase = size.height * 0.88f
        hours.forEachIndexed { i, h ->
            val p = points[i]
            val barH = size.height * 0.14f * h.rain / 100f
            if (h.rain > 0) {
                drawRoundRect(Color(0x8C6EC6FF), Offset(p.x - step * 0.3f, barBase - barH), Size(step * 0.6f, barH), androidx.compose.ui.geometry.CornerRadius(3.dp.toPx()))
            }
            if (i % 2 == 0) {
                drawCircle(if (i == 0) Color.White else Color(0xFFFFD23F), if (i == 0) 5.dp.toPx() else 3.dp.toPx(), p)
                val t = measurer.measure("${h.temperature}°", label)
                drawText(t, topLeft = Offset(p.x - t.size.width / 2f, p.y - t.size.height - 6.dp.toPx()))
                val name = measurer.measure(if (i == 0) "Now" else h.label, small)
                drawText(name, topLeft = Offset(p.x - name.size.width / 2f, barBase + 3.dp.toPx()))
                if (h.rain >= 10) {
                    val r = measurer.measure("${h.rain}%", rainStyle)
                    drawText(r, topLeft = Offset(p.x - r.size.width / 2f, barBase - barH - r.size.height - 1.dp.toPx()))
                }
            }
        }
    }
}

/** A ring filled to [fraction] in [color], for humidity and air quality. */
@Composable
fun Ring(fraction: Float, colors: List<Color>, size: Dp = 64.dp, content: @Composable () -> Unit = {}) {
    Box(Modifier.size(size), contentAlignment = androidx.compose.ui.Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = this.size.minDimension * 0.12f
            val box = Size(this.size.width - stroke, this.size.height - stroke)
            val at = Offset(stroke / 2, stroke / 2)
            drawArc(Color.White.copy(alpha = 0.15f), 0f, 360f, false, at, box, style = Stroke(stroke))
            drawArc(Brush.sweepGradient(colors + colors.first()), -90f, 360f * fraction.coerceIn(0.02f, 1f), false, at, box, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        content()
    }
}

/** The UV scale from green to purple with a marker at [uv]. */
@Composable
fun UvScale(uv: Int, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val h = size.height * 0.3f
        val y = size.height / 2
        drawRoundRect(
            Brush.horizontalGradient(listOf(Color(0xFF7BD389), Color(0xFFFFE14D), Color(0xFFFF9F43), Color(0xFFFF5252), Color(0xFFB16CFF))),
            Offset(0f, y - h / 2), Size(size.width, h), androidx.compose.ui.geometry.CornerRadius(h / 2),
        )
        val x = (uv.coerceIn(0, 11) / 11f) * size.width
        drawCircle(Color.White, size.height * 0.32f, Offset(x.coerceIn(size.height * 0.32f, size.width - size.height * 0.32f), y))
        drawCircle(Color(0xFF1A2550), size.height * 0.32f, Offset(x.coerceIn(size.height * 0.32f, size.width - size.height * 0.32f), y), style = Stroke(2.dp.toPx()))
    }
}

/** A sun-path arc with the sun glowing where it is now (no sun outside daylight). */
@Composable
fun SunPath(fraction: Float, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val box = Size(size.width - 16.dp.toPx(), (size.height - 12.dp.toPx()) * 2)
        val at = Offset(8.dp.toPx(), 10.dp.toPx())
        drawArc(Color.White.copy(alpha = 0.35f), 180f, 180f, false, at, box,
            style = Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 10f))))
        if (fraction in 0f..1f) {
            drawArc(Brush.horizontalGradient(listOf(Color(0xFFFFB347), Color(0xFFFF6F61))), 180f, 180f * fraction, false, at, box,
                style = Stroke(4.dp.toPx(), cap = StrokeCap.Round))
            val a = Math.toRadians(180.0 + 180.0 * fraction)
            val c = Offset(at.x + box.width / 2, at.y + box.height / 2)
            val p = Offset(c.x + (box.width / 2 * cos(a)).toFloat(), c.y + (box.height / 2 * sin(a)).toFloat())
            sun(p, 8.dp.toPx())
        }
    }
}
