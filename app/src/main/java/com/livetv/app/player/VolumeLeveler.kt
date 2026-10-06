package com.livetv.app.player

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Brings every channel to about the same loudness, so switching from a quiet channel to a
 * loud one does not jump the volume.
 *
 * It measures how loud the sound has been over the last few seconds and turns it up or down
 * towards one target level (at most 4x louder or 6x quieter). The gain moves slowly, so
 * speech and music keep their natural loud and soft parts; a quick look at the first half
 * second after a channel change sets the level straight away. Silence is not measured, so
 * pauses are never boosted into hiss, and a soft limiter stops boosted peaks from clipping.
 */
@OptIn(UnstableApi::class)
class VolumeLeveler : BaseAudioProcessor() {

    private var channels = 2
    private var sampleRate = 48_000

    /** Average power of the recent sound (0..1 full scale, squared); -1 until measured. */
    private var meanSquare = -1.0
    private var measuredFrames = 0L
    private var gain = 1.0

    // A short block of samples is measured at a time.
    private var blockSum = 0.0
    private var blockFrames = 0

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) {
            throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        }
        channels = inputAudioFormat.channelCount
        sampleRate = inputAudioFormat.sampleRate
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val size = inputBuffer.remaining()
        if (size == 0) return
        val out = replaceOutputBuffer(size)
        val input = inputBuffer.order(ByteOrder.nativeOrder())
        val blockLen = sampleRate / 50 // 20 ms
        var i = input.position()
        val end = input.limit()
        val frameBytes = 2 * channels
        while (i + frameBytes <= end) {
            var framePower = 0.0
            for (c in 0 until channels) {
                val s = input.getShort(i + 2 * c) / 32768.0
                framePower += s * s
            }
            blockSum += framePower / channels
            if (++blockFrames >= blockLen) {
                measureBlock(blockSum / blockFrames)
                blockSum = 0.0
                blockFrames = 0
            }
            for (c in 0 until channels) {
                val s = input.getShort(i + 2 * c) * gain
                out.putShort(limit(s).toInt().toShort())
            }
            i += frameBytes
        }
        input.position(end)
        out.flip()
    }

    private fun measureBlock(power: Double) {
        if (power < SILENCE) return
        val blockSeconds = 0.02
        measuredFrames++
        meanSquare = when {
            meanSquare < 0 -> power
            // First half second of a channel: plain average, so the level is known quickly.
            measuredFrames * blockSeconds < 0.5 -> meanSquare + (power - meanSquare) / measuredFrames
            else -> meanSquare + (power - meanSquare) * (blockSeconds / LOUDNESS_WINDOW_S)
        }
        val wanted = (TARGET_RMS / sqrt(meanSquare)).coerceIn(MIN_GAIN, MAX_GAIN)
        val seconds = when {
            measuredFrames * blockSeconds < 1.0 -> 0.1 // settle fast after a channel change
            wanted < gain -> 0.5 // turn down loud sound fairly quickly
            else -> 3.0 // turn quiet sound up slowly
        }
        gain += (wanted - gain) * (blockSeconds / seconds).coerceAtMost(1.0)
    }

    /** Soft limiter: sound under 80% passes unchanged, louder peaks are bent below full scale. */
    private fun limit(s: Double): Double {
        val a = abs(s)
        if (a <= KNEE) return s
        val over = a - KNEE
        val room = 32767.0 - KNEE
        val bent = KNEE + room * over / (over + room)
        return if (s < 0) -bent else bent
    }

    override fun onFlush() {
        // A new channel or a jump: measure afresh. Never start louder than unchanged, so a
        // loud channel after a quiet one does not blast for the moment it takes to measure.
        gain = gain.coerceAtMost(1.0)
        meanSquare = -1.0
        measuredFrames = 0
        blockSum = 0.0
        blockFrames = 0
    }

    override fun onReset() {
        onFlush()
        gain = 1.0
    }

    private companion object {
        /** About -18 dB below full scale, a comfortable TV level (YouTube channels are matched to it). */
        const val TARGET_RMS = 0.12
        const val MAX_GAIN = 4.0 // +12 dB
        const val MIN_GAIN = 0.16 // -16 dB
        const val LOUDNESS_WINDOW_S = 3.0
        /** Blocks quieter than -55 dB count as silence. */
        const val SILENCE = 3.2e-6
        const val KNEE = 0.8 * 32767.0
    }
}
