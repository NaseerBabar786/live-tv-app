package com.iqraquran.app.data

import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.tan

/** The five prayers, plus sunrise (shown on the timeline, never an Azan). */
enum class Prayer(val en: String, val ur: String, val hasAzan: Boolean = true) {
    Fajr("Fajr", "فجر"),
    Sunrise("Sunrise", "طلوعِ آفتاب", hasAzan = false),
    Zuhr("Zuhr", "ظہر"),
    Asr("Asr", "عصر"),
    Maghrib("Maghrib", "مغرب"),
    Isha("Isha", "عشاء");

    companion object {
        val withAzan = entries.filter { it.hasAzan }
    }
}

/** What happens at a prayer's time. */
enum class AzanMode(val en: String, val ur: String) {
    Azan("Azan", "اذان"),
    Chime("Chime", "گھنٹی"),
    Message("Message", "پیغام"),
    Off("Off", "بند");

    fun next(): AzanMode = entries[(ordinal + 1) % entries.size]
}

/**
 * A way of working out Fajr and Isha: the sun's angle below the horizon, or (Umm al-Qura) Isha a fixed
 * time after Maghrib. ISNA is what Cable TV's News mode shows (aladhan method 2).
 */
enum class CalcMethod(val en: String, val ur: String, val fajrAngle: Double, val ishaAngle: Double, val ishaMinutes: Int = 0) {
    Isna("North America (ISNA)", "شمالی امریکہ (ISNA)", 15.0, 15.0),
    Karachi("Karachi (Pakistan, India)", "کراچی (پاکستان، بھارت)", 18.0, 18.0),
    Mwl("Muslim World League", "مسلم ورلڈ لیگ", 18.0, 17.0),
    UmmAlQura("Umm al-Qura (Makkah)", "ام القریٰ (مکہ)", 18.5, 0.0, ishaMinutes = 90),
    Egypt("Egypt", "مصر", 19.5, 17.5);

    companion object {
        /** The usual method where the viewer lives (country code from their internet address). */
        fun forCountry(code: String?): CalcMethod = when (code?.uppercase()) {
            "US", "CA" -> Isna
            "PK", "IN", "BD", "AF" -> Karachi
            "SA", "AE", "QA", "KW", "BH", "OM", "YE" -> UmmAlQura
            "EG", "SD", "LY" -> Egypt
            else -> Mwl
        }
    }
}

/** Asr: Shafi, Maliki and Hanbali (shadow as long as the thing) or Hanafi (twice as long). */
enum class AsrMethod(val en: String, val ur: String, val factor: Int) {
    Shafi("Shafi (standard)", "شافعی (عام)", 1),
    Hanafi("Hanafi", "حنفی", 2),
}

/** One day's times, in minutes after local midnight. */
data class DayTimes(val minutes: Map<Prayer, Int>) {
    operator fun get(p: Prayer): Int = minutes.getValue(p)
}

/**
 * Prayer times worked out on the device from the sun's position (the well-known praytimes.org formulas),
 * so they need no internet and the Azan can be set for days ahead.
 */
object PrayerTimes {

    /** Times for [year]-[month]-[day] at [lat], [lng]; [utcOffsetMinutes] is the local time zone's offset that day. */
    fun of(
        year: Int, month: Int, day: Int,
        lat: Double, lng: Double, utcOffsetMinutes: Int,
        method: CalcMethod, asr: AsrMethod,
    ): DayTimes {
        val jd = julian(year, month, day) - lng / (15 * 24)
        fun noon(t: Double): Double = fix24(12 - sun(jd + t / 24).second)
        fun angleTime(angle: Double, t: Double, before: Boolean): Double {
            val decl = sun(jd + t / 24).first
            val v = (-sin(rad(angle)) - sin(rad(decl)) * sin(rad(lat))) / (cos(rad(decl)) * cos(rad(lat)))
            val h = deg(acos(v.coerceIn(-1.0, 1.0))) / 15
            return noon(t) + if (before) -h else h
        }
        fun asrTime(t: Double): Double {
            val decl = sun(jd + t / 24).first
            val angle = -deg(atan(1 / (asr.factor + tan(rad(abs(lat - decl))))))
            return angleTime(angle, t, before = false)
        }
        var t = doubleArrayOf(5.0, 6.0, 12.0, 13.0, 18.0, 18.0)
        repeat(2) {
            t = doubleArrayOf(
                angleTime(method.fajrAngle, t[0], before = true),
                angleTime(0.833, t[1], before = true),
                noon(t[2]),
                asrTime(t[3]),
                angleTime(0.833, t[4], before = false),
                if (method.ishaMinutes > 0) t[4] else angleTime(method.ishaAngle, t[5], before = false),
            )
        }
        val shift = utcOffsetMinutes / 60.0 - lng / 15
        val hours = t.map { it + shift }.toMutableList()
        if (method.ishaMinutes > 0) hours[5] = hours[4] + method.ishaMinutes / 60.0
        // Zuhr a few minutes after the sun's highest point, as prayer timetables give it.
        hours[2] += 2 / 60.0
        val minutes = Prayer.entries.zip(hours).associate { (p, h) -> p to ((h * 60).roundToInt()).mod(24 * 60) }
        return DayTimes(minutes)
    }

    /** "5:45 AM" or, with [h24], "05:45". */
    fun format(minutes: Int, h24: Boolean = false): String {
        val h = minutes / 60 % 24
        val m = minutes % 60
        if (h24) return "%02d:%02d".format(h, m)
        val h12 = if (h % 12 == 0) 12 else h % 12
        return "%d:%02d %s".format(h12, m, if (h < 12) "AM" else "PM")
    }

    // The sun's declination and the equation of time (hours) at Julian day [jd].
    private fun sun(jd: Double): Pair<Double, Double> {
        val d = jd - 2451545.0
        val g = fix360(357.529 + 0.98560028 * d)
        val q = fix360(280.459 + 0.98564736 * d)
        val l = fix360(q + 1.915 * sin(rad(g)) + 0.020 * sin(rad(2 * g)))
        val e = 23.439 - 0.00000036 * d
        val ra = fix24(deg(atan2(cos(rad(e)) * sin(rad(l)), cos(rad(l)))) / 15)
        val decl = deg(asin(sin(rad(e)) * sin(rad(l))))
        val eqt = (q / 15 - ra + 12).mod(24.0) - 12
        return decl to eqt
    }

    private fun julian(year: Int, month: Int, day: Int): Double {
        var y = year
        var m = month
        if (m <= 2) { y -= 1; m += 12 }
        val a = floor(y / 100.0)
        val b = 2 - a + floor(a / 4)
        return floor(365.25 * (y + 4716)) + floor(30.6001 * (m + 1)) + day + b - 1524.5
    }

    private fun rad(d: Double) = d * Math.PI / 180
    private fun deg(r: Double) = r * 180 / Math.PI
    private fun fix360(a: Double) = a.mod(360.0)
    private fun fix24(a: Double) = a.mod(24.0)
}

/** The Islamic (Hijri) date by the usual arithmetic calendar; [adjust] moves it a day to match local moon sighting. */
object Hijri {
    val monthsEn = listOf(
        "Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani", "Jumada al-Ula", "Jumada al-Thani",
        "Rajab", "Shaban", "Ramadan", "Shawwal", "Dhul Qadah", "Dhul Hijjah",
    )
    val monthsUr = listOf(
        "محرم", "صفر", "ربیع الاول", "ربیع الثانی", "جمادی الاول", "جمادی الثانی",
        "رجب", "شعبان", "رمضان", "شوال", "ذوالقعدہ", "ذوالحجہ",
    )

    /** Day, month (1-12) and year for a Gregorian date. */
    fun of(year: Int, month: Int, day: Int, adjust: Int = 0): Triple<Int, Int, Int> {
        var y = year
        var m = month
        if (m < 3) { y -= 1; m += 12 }
        val a = floor(y / 100.0)
        val b = 2 - a + floor(a / 4)
        val jd = floor(365.25 * (y + 4716)) + floor(30.6001 * (m + 1)) + day + b - 1524 + adjust
        val l0 = jd - 1948440 + 10632
        val n = floor((l0 - 1) / 10631)
        val l1 = l0 - 10631 * n + 354
        val j = floor((10985 - l1) / 5316) * floor(50 * l1 / 17719) + floor(l1 / 5670) * floor(43 * l1 / 15238)
        val l2 = l1 - floor((30 - j) / 15) * floor(17719 * j / 50) - floor(j / 16) * floor(15238 * j / 43) + 29
        val hm = floor(24 * l2 / 709)
        val hd = l2 - floor(709 * hm / 24)
        val hy = 30 * n + j - 30
        return Triple(hd.toInt(), hm.toInt(), hy.toInt())
    }
}
