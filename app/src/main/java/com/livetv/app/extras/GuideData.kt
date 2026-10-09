package com.livetv.app.extras

import com.livetv.app.data.Channel
import com.livetv.app.data.Guide
import com.livetv.app.data.MyChannel

/** The TV guide's programmes for one channel, from our own schedules or the free listings (tv.bulkbazaar.ca/epg.json). */
object GuideData {
    data class Prog(val start: Long, val end: Long, val title: String)

    /**
     * [channel]'s programmes between [fromMs] and [toMs] (wall clock), in time order; empty when it has no listings.
     * Our own channels come from their schedule (ads and idents left out); the channels that play YouTube have none.
     */
    fun programmes(channel: Channel, epg: Map<String, List<Guide.Programme>>, fromMs: Long, toMs: Long): List<Prog> {
        if (MyChannel.isMine(channel)) return ours(channel, fromMs, toMs)
        val list = epg[Guide.key(channel.name)] ?: return emptyList()
        return list.filter { it.end * 1000 > fromMs && it.start * 1000 < toMs }.map { Prog(it.start * 1000, it.end * 1000, it.title) }
    }

    private fun ours(channel: Channel, fromMs: Long, toMs: Long): List<Prog> {
        if (MyChannel.webPage(channel) != null) return emptyList()
        val c = MyChannel.configOf(channel)?.takeIf { it.active && it.videos.isNotEmpty() } ?: return emptyList()
        val out = mutableListOf<Prog>()
        var t = fromMs
        var guard = 0
        runCatching {
            while (t < toMs && guard++ < 400) {
                when (val now = MyChannel.whatsOn(c, t)) {
                    is MyChannel.Now.Playing -> {
                        val start = t - now.offsetMs
                        val end = if (now.untilMs == Long.MAX_VALUE) toMs else now.untilMs
                        if (!now.video.isBreak) {
                            val title = now.show.ifEmpty { now.video.title }
                            val last = out.lastOrNull()
                            // A run of the same programme (or a short gap of ads inside it) shows as one.
                            if (last != null && last.title == title && start - last.end < 5 * 60_000L) out[out.lastIndex] = last.copy(end = end)
                            else out += Prog(start, end, title)
                        }
                        t = maxOf(end, t + 1000)
                    }
                    is MyChannel.Now.OffAir -> t = now.nextAt ?: break
                }
            }
        }
        return collapseShort(out)
    }

    /** A run of short videos (a music hour: one song after another) shows as one programme, "First song and more". */
    private fun collapseShort(list: List<Prog>): List<Prog> {
        val out = mutableListOf<Prog>()
        var run = mutableListOf<Prog>()
        fun flush() {
            if (run.size == 1) out += run[0]
            else if (run.isNotEmpty()) out += Prog(run.first().start, run.last().end, "${run.first().title} and more")
            run = mutableListOf()
        }
        for (p in list) {
            if (p.end - p.start < SHORT_MS) run += p else { flush(); out += p }
        }
        flush()
        return out
    }

    private const val SHORT_MS = 12 * 60_000L
}
