package com.livetv.app

import org.junit.Assert.assertEquals
import org.junit.Test

class CrashGuardTest {
    @Test
    fun anrTraceKeepsOnlyTheMainThread() {
        val trace = "----- pid 123 -----\n\n\"Signal Catcher\" daemon\n  at a.b\n\n" +
            "\"main\" prio=5 tid=1 Blocked\n  at com.livetv.app.X.y(X.kt:1)\n\n\"other\" tid=2\n  at c.d\n"
        assertEquals("\"main\" prio=5 tid=1 Blocked\n  at com.livetv.app.X.y(X.kt:1)", CrashGuard.mainThread(trace))
    }

    @Test
    fun traceWithoutMainThreadIsKept() {
        assertEquals("no threads", CrashGuard.mainThread("no threads"))
    }
}
