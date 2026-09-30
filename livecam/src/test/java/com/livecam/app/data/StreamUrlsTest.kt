package com.livecam.app.data

import com.livecam.app.data.StreamUrls.Brand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StreamUrlsTest {

    @Test
    fun buildsBrandAddresses() {
        assertEquals(
            "rtsp://192.168.1.64:554/Streaming/Channels/101",
            StreamUrls.build(Brand.HIKVISION, "192.168.1.64"),
        )
        assertEquals(
            "rtsp://192.168.1.64:554/Streaming/Channels/302",
            StreamUrls.build(Brand.HIKVISION, "192.168.1.64", channel = 3, sub = true),
        )
        assertEquals(
            "rtsp://10.0.0.5:554/cam/realmonitor?channel=2&subtype=1",
            StreamUrls.build(Brand.DAHUA, "10.0.0.5", channel = 2, sub = true),
        )
        assertEquals(
            "rtsp://10.0.0.6:554/h264Preview_01_main",
            StreamUrls.build(Brand.REOLINK, "10.0.0.6"),
        )
        assertEquals("rtsp://10.0.0.7:554/stream2", StreamUrls.build(Brand.TAPO, "10.0.0.7", sub = true))
        assertEquals(
            "rtsp://nas.local:8554/front-door",
            StreamUrls.build(Brand.WYZE_BRIDGE, "nas.local", name = "Front Door"),
        )
    }

    @Test
    fun keepsPortTypedWithHost() {
        assertEquals("rtsp://10.0.0.7:8554/stream1", StreamUrls.build(Brand.TAPO, "10.0.0.7:8554"))
    }

    @Test
    fun customOrBlankHostGivesNothing() {
        assertEquals("", StreamUrls.build(Brand.CUSTOM, "10.0.0.7"))
        assertEquals("", StreamUrls.build(Brand.HIKVISION, "  "))
    }

    @Test
    fun addsAndEncodesCredentials() {
        assertEquals(
            "rtsp://admin:p%40ss%3Aword@10.0.0.5:554/stream1",
            StreamUrls.withCredentials("rtsp://10.0.0.5:554/stream1", "admin", "p@ss:word"),
        )
    }

    @Test
    fun replacesExistingCredentials() {
        assertEquals(
            "rtsp://new:pw@host/live?x=1",
            StreamUrls.withCredentials("rtsp://old:old@host/live?x=1", "new", "pw"),
        )
    }

    @Test
    fun leavesUrlAloneWithoutUsername() {
        assertEquals("rtsp://host/live", StreamUrls.withCredentials("rtsp://host/live", "", "pw"))
    }

    @Test
    fun redactsPassword() {
        assertEquals("rtsp://admin:***@host/live", StreamUrls.redacted("rtsp://admin:secret@host/live"))
        assertEquals("rtsp://host/live", StreamUrls.redacted("rtsp://host/live"))
    }

    @Test
    fun detectsRtsp() {
        assertTrue(StreamUrls.isRtsp(" RTSP://host/x"))
        assertFalse(StreamUrls.isRtsp("https://host/x.m3u8"))
    }
}
