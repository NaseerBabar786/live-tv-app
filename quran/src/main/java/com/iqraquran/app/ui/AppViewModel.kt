package com.iqraquran.app.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.iqraquran.app.data.Hifz
import com.iqraquran.app.data.Profile
import com.iqraquran.app.data.Quran
import com.iqraquran.app.data.QuranText
import com.iqraquran.app.data.Reciter
import com.iqraquran.app.data.Store
import com.iqraquran.app.data.TranslationMode
import com.iqraquran.app.player.AyahPlayer
import com.iqraquran.app.player.Speaker
import java.time.LocalDate
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.launch

/** Where the app is. The back stack is a list of these. */
sealed interface Screen {
    data object Home : Screen
    data object QaidaMap : Screen
    data class QaidaLesson(val id: Int) : Screen
    data class QaidaQuiz(val id: Int) : Screen
    data class SurahList(val forHifz: Boolean, val kids: Boolean = false) : Screen
    data class Read(val surah: Int, val ayah: Int = 1, val kids: Boolean = false) : Screen
    data object HifzHome : Screen
    data class HifzSetup(val surah: Int) : Screen
    data class HifzSession(
        val surah: Int,
        val from: Int,
        val to: Int,
        val perAyah: Int,
        val wholeTimes: Int,
        val gapSeconds: Int,
        val revising: Boolean,
    ) : Screen
    data object Settings : Screen
}

class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val store = Store(app)
    val player = AyahPlayer(app)
    val speaker = Speaker(app)
    val reciters: List<Reciter> = Quran.reciters(app)

    var quran by mutableStateOf<QuranText?>(null)
        private set

    val stack = mutableStateListOf<Screen>(Screen.Home)
    val screen: Screen get() = stack.last()

    var lang by mutableStateOf(
        when (store.language) {
            "ur" -> Lang.Ur
            "en" -> Lang.En
            else -> if (Locale.getDefault().language == "ur") Lang.Ur else Lang.En
        },
    )
        private set

    var reciter by mutableStateOf(reciters.firstOrNull { it.id == store.reciterId } ?: reciters.first())
        private set
    var kidsReciter by mutableStateOf(reciters.firstOrNull { it.id == store.kidsReciterId } ?: reciters.first())
        private set
    var translation by mutableStateOf(store.translation)
        private set
    var textSize by mutableStateOf(store.textSize)
        private set
    var lastRead by mutableStateOf(store.lastRead)
        private set

    var profiles by mutableStateOf(store.profiles)
        private set
    var profile by mutableStateOf<Profile?>(null)
        private set
    var stars by mutableStateOf<Map<Int, Int>>(emptyMap())
        private set
    var hifz by mutableStateOf<List<Hifz.Item>>(emptyList())
        private set

    init {
        if (profiles.isEmpty()) {
            // Everyone starts with one learner, so nothing has to be set up before the first lesson.
            val first = Profile(UUID.randomUUID().toString(), "", 0)
            profiles = listOf(first)
            store.profiles = profiles
        }
        selectProfile(profiles.firstOrNull { it.id == store.currentProfileId } ?: profiles.first())
        viewModelScope.launch { quran = Quran.load(app) }
    }

    fun today(): Long = LocalDate.now().toEpochDay()

    // Navigation

    fun open(s: Screen) {
        player.stop()
        speaker.stop()
        stack.add(s)
    }

    /** Replaces the current screen, e.g. lesson to quiz. */
    fun replace(s: Screen) {
        player.stop()
        speaker.stop()
        stack[stack.lastIndex] = s
    }

    /** Returns false when already home (so Android can close the app). */
    fun back(): Boolean {
        player.stop()
        speaker.stop()
        if (stack.size <= 1) return false
        stack.removeAt(stack.lastIndex)
        return true
    }

    // Settings

    fun setLanguage(l: Lang) {
        lang = l
        store.language = if (l == Lang.Ur) "ur" else "en"
    }

    fun chooseReciter(r: Reciter) {
        reciter = r
        store.reciterId = r.id
    }

    fun chooseKidsReciter(r: Reciter) {
        kidsReciter = r
        store.kidsReciterId = r.id
    }

    fun chooseTranslation(t: TranslationMode) {
        translation = t
        store.translation = t
    }

    fun changeTextSize(delta: Int) {
        textSize = (textSize + delta).coerceIn(20, 64)
        store.textSize = textSize
    }

    fun markRead(surah: Int, ayah: Int) {
        lastRead = surah to ayah
        store.lastRead = lastRead
    }

    // Learners

    fun selectProfile(p: Profile) {
        profile = p
        store.currentProfileId = p.id
        stars = store.stars(p.id)
        hifz = store.hifz(p.id)
    }

    fun saveProfile(id: String?, name: String) {
        val clean = name.trim().take(24)
        if (id == null) {
            val p = Profile(UUID.randomUUID().toString(), clean, profiles.size % KidColors.size)
            profiles = profiles + p
            store.profiles = profiles
            selectProfile(p)
        } else {
            profiles = profiles.map { if (it.id == id) it.copy(name = clean) else it }
            store.profiles = profiles
            profiles.firstOrNull { it.id == id }?.let { if (profile?.id == id) profile = it }
        }
    }

    fun deleteProfile(p: Profile) {
        if (profiles.size <= 1) return
        profiles = profiles.filter { it.id != p.id }
        store.profiles = profiles
        store.deleteProfileData(p.id)
        if (profile?.id == p.id) selectProfile(profiles.first())
    }

    // Progress

    fun recordStars(lesson: Int, earned: Int) {
        val p = profile ?: return
        if (earned <= (stars[lesson] ?: 0)) return
        stars = stars + (lesson to earned)
        store.saveStars(p.id, stars)
    }

    fun addHifz(surah: Int, from: Int, to: Int) {
        val p = profile ?: return
        val today = today()
        // Learning the same passage again replaces the old entry.
        val item = Hifz.Item(surah, from, to, learnedOn = today, lastReview = today)
        hifz = hifz.filter { it.key != item.key } + item
        store.saveHifz(p.id, hifz)
    }

    fun reviewHifz(item: Hifz.Item, good: Boolean) {
        val p = profile ?: return
        hifz = hifz.map { if (it.key == item.key) Hifz.reviewed(it, today(), good) else it }
        store.saveHifz(p.id, hifz)
    }

    fun removeHifz(item: Hifz.Item) {
        val p = profile ?: return
        hifz = hifz.filter { it.key != item.key }
        store.saveHifz(p.id, hifz)
    }

    override fun onCleared() {
        player.release()
        speaker.release()
    }
}
