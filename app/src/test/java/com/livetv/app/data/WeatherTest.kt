package com.livetv.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class WeatherTest {
    @Test
    fun readsOpenMeteoCurrentWeather() {
        val json = """{"current":{"time":"2026-09-30T09:00","temperature_2m":17.6,"weather_code":2,"is_day":1}}"""
        assertEquals("🌤️ 18°C", Weather.parse(json, "C").toString())
    }

    @Test
    fun clearNightShowsTheMoon() {
        assertEquals("🌙", Weather.icon(0, day = false))
        assertEquals("⛈️", Weather.icon(95))
    }
}
