package com.livetv.app.player

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VolumeLevelerTest {

    private val rate = 48_000

    /** Plays [seconds] of a stereo tone at [amplitude] and returns the output level (dB) over the last second. */
    private fun play(leveler: VolumeLeveler, amplitude: Double, seconds: Int): Double {
        val out = ArrayList<Short>()
        val chunk = 1024
        var n = 0
        repeat(seconds * rate / chunk) {
            val buf = ByteBuffer.allocateDirect(chunk * 4).order(ByteOrder.nativeOrder())
            repeat(chunk) {
                val s = (amplitude * 32767 * sin(2 * PI * 440 * n++ / rate)).toInt().toShort()
                buf.putShort(s).putShort(s)
            }
            buf.flip()
            leveler.queueInput(buf)
            val o = leveler.output
            while (o.hasRemaining()) out.add(o.short)
        }
        val last = out.takeLast(rate * 2).map { it / 32768.0 }
        return 20 * log10(sqrt(last.sumOf { it * it } / last.size))
    }

    private fun leveler() = VolumeLeveler().apply {
        configure(AudioProcessor.AudioFormat(rate, 2, C.ENCODING_PCM_16BIT))
        flush()
    }

    @Test
    fun quietAndLoudChannelsComeOutAtTheSameLevel() {
        val l = leveler()
        val quiet = play(l, 0.03, 8) // about -33 dB
        l.flush() // channel change
        val loud = play(l, 0.9, 8) // about -4 dB
        assertTrue("quiet $quiet loud $loud", abs(quiet - loud) < 2.0)
        assertEquals(-18.4, loud, 2.0)
    }

    @Test
    fun silenceIsNotBoosted() {
        val l = leveler()
        val level = play(l, 0.0, 3)
        assertTrue(level.isInfinite() || level < -90)
    }

    @Test
    fun boostedPeaksNeverClip() {
        val l = leveler()
        play(l, 0.02, 6)
        // A sudden loud burst right after a long quiet stretch must stay under full scale.
        val buf = ByteBuffer.allocateDirect(4800 * 4).order(ByteOrder.nativeOrder())
        repeat(4800) { buf.putShort(32000).putShort(-32000) }
        buf.flip()
        l.queueInput(buf)
        val o = l.output
        while (o.hasRemaining()) {
            assertTrue(o.short > 0) // boosted, but bent below full scale instead of wrapping round
            assertTrue(o.short < 0)
        }
    }
}
