package com.iqraquran.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class PrayerTimesTest {

    private fun near(expected: String, minutes: Int, slack: Int = 2) {
        val (h, m) = expected.split(":").map { it.toInt() }
        assertTrue("expected $expected, got ${PrayerTimes.format(minutes, h24 = true)}", abs(h * 60 + m - minutes) <= slack)
    }

    @Test
    fun matchesAPublishedTimetable() {
        // Quinte West, Ontario, 7 October 2026 (EDT, UTC-4), as a well-known prayer app shows it.
        val t = PrayerTimes.of(2026, 10, 7, 44.11, -77.58, -240, CalcMethod.Isna, AsrMethod.Shafi)
        near("07:15", t[Prayer.Sunrise])
        near("16:06", t[Prayer.Asr])
        near("18:41", t[Prayer.Maghrib])
        near("20:00", t[Prayer.Isha])
        assertTrue(t[Prayer.Fajr] < t[Prayer.Sunrise] && t[Prayer.Sunrise] < t[Prayer.Zuhr])
        assertTrue(t[Prayer.Zuhr] < t[Prayer.Asr] && t[Prayer.Asr] < t[Prayer.Maghrib] && t[Prayer.Maghrib] < t[Prayer.Isha])
    }

    @Test
    fun hanafiAsrIsLater() {
        val shafi = PrayerTimes.of(2026, 10, 7, 24.86, 67.0, 300, CalcMethod.Karachi, AsrMethod.Shafi)
        val hanafi = PrayerTimes.of(2026, 10, 7, 24.86, 67.0, 300, CalcMethod.Karachi, AsrMethod.Hanafi)
        assertTrue(hanafi[Prayer.Asr] > shafi[Prayer.Asr] + 30)
    }

    @Test
    fun ummAlQuraIshaIs90MinutesAfterMaghrib() {
        val t = PrayerTimes.of(2026, 3, 1, 21.42, 39.83, 180, CalcMethod.UmmAlQura, AsrMethod.Shafi)
        assertTrue(abs(t[Prayer.Isha] - t[Prayer.Maghrib] - 90) <= 1)
    }

    @Test
    fun formats12And24Hours() {
        assertEquals("5:45 AM", PrayerTimes.format(5 * 60 + 45))
        assertEquals("12:03 PM", PrayerTimes.format(12 * 60 + 3))
        assertEquals("12:00 AM", PrayerTimes.format(0))
        assertEquals("20:00", PrayerTimes.format(20 * 60, h24 = true))
    }

    @Test
    fun hijriDates() {
        // 1 Ramadan 1446 = 1 March 2025; 1 Ramadan 1447 = 18 February 2026 (arithmetic calendar).
        assertEquals(Triple(1, 9, 1446), Hijri.of(2025, 3, 1))
        assertEquals(Triple(1, 9, 1447), Hijri.of(2026, 2, 18))
        assertEquals(Triple(24, 4, 1448), Hijri.of(2026, 10, 7))
    }

    @Test
    fun modesCycle() {
        assertEquals(AzanMode.Chime, AzanMode.Azan.next())
        assertEquals(AzanMode.Azan, AzanMode.Off.next())
    }

    @Test
    fun methodByCountry() {
        assertEquals(CalcMethod.Isna, CalcMethod.forCountry("ca"))
        assertEquals(CalcMethod.Karachi, CalcMethod.forCountry("PK"))
        assertEquals(CalcMethod.Mwl, CalcMethod.forCountry(null))
    }
}
