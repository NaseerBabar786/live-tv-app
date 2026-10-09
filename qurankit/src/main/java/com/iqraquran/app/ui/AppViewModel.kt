package com.iqraquran.app.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.iqraquran.app.data.Hifz
import com.iqraquran.app.data.Namaz
import com.iqraquran.app.data.NamazProgress
import com.iqraquran.app.data.Profile
import com.iqraquran.app.data.Quran
import com.iqraquran.app.data.QuranText
import com.iqraquran.app.data.Reciter
import com.iqraquran.app.data.Store
import com.iqraquran.app.data.TranslationLang
import com.iqraquran.app.data.Translations
import androidx.compose.runtime.mutableStateMapOf
import com.iqraquran.app.data.AsrMethod
import com.iqraquran.app.data.AzanMode
import com.iqraquran.app.data.AzanSettings
import com.iqraquran.app.data.AzanVoice
import com.iqraquran.app.data.CalcMethod
import com.iqraquran.app.player.AyahPlayer
import com.iqraquran.app.player.AzanPlayer
import com.iqraquran.app.player.Speaker
import java.util.Locale
import java.util.TimeZone
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
    data object Prayer : Screen
    data object AzanSettings : Screen
    data object NamazHome : Screen
    data class NamazStep(val index: Int) : Screen
    data object NamazRakats : Screen
    data object NamazDuas : Screen
    data object NamazSurahs : Screen
    data object NamazAddSurah : Screen
}

class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val store = Store(app)
    val player = AyahPlayer(app)
    val speaker = Speaker(app)
    val reciters: List<Reciter> = Quran.reciters(app)

    /** Prayer times and Azan settings (the Namaz screens). */
    val azan = AzanSettings(app)
    private val azanPlayer = AzanPlayer(app)

    /** Goes up after every Azan setting change, so the Namaz screens redraw. */
    var azanVersion by mutableStateOf(0)
        private set
    var voices by mutableStateOf<List<AzanVoice>>(azan.voices())
        private set
    /** The recording being played as a sample in Azan settings. */
    var sampleId by mutableStateOf<String?>(null)
        private set

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
    /** The translations shown under each ayah (language codes, in order). */
    var translations by mutableStateOf(store.translations)
        private set
    /** Every language to choose from. */
    var languages by mutableStateOf(Translations.list(app))
        private set
    /** Downloaded languages' text, by code. */
    val extraText = mutableStateMapOf<String, List<List<String>>>()
    /** Languages being downloaded right now. */
    val downloading = mutableStateListOf<String>()
    var textSize by mutableStateOf(store.textSize)
        private set
    var lastRead by mutableStateOf(store.lastRead)
        private set

    var themeId by mutableStateOf(store.themeId)
        private set
    var customBackground by mutableStateOf(Color(store.customBackground))
        private set
    var customText by mutableStateOf(Color(store.customText))
        private set
    var customExtra by mutableStateOf(Palettes.customSlots.associateWith { store.customColor(it) })
        private set
    var lineSpacing by mutableStateOf(store.lineSpacing)
        private set

    var tileColors by mutableStateOf(HomeTiles.keys.associateWith { store.tileColor(it) })
        private set

    /**
     * Set by an app that hosts these screens with its own look (Cable TV): the colours then follow
     * that app's theme and the theme choices are hidden.
     */
    var fixedPalette by mutableStateOf<Palette?>(null)
    val themeLocked: Boolean get() = fixedPalette != null

    /** The reading theme in use. */
    val palette: Palette get() = fixedPalette ?: Palettes.byId(themeId, customBackground, customText, customExtra)

    var profiles by mutableStateOf(store.profiles)
        private set
    var profile by mutableStateOf<Profile?>(null)
        private set
    var stars by mutableStateOf<Map<Int, Int>>(emptyMap())
        private set
    var hifz by mutableStateOf<List<Hifz.Item>>(emptyList())
        private set
    /** What this learner has memorized in Learn Namaz. */
    var namaz by mutableStateOf(NamazProgress())
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
        viewModelScope.launch { languages = Translations.refreshList(app) }
        fetchTranslations()
        viewModelScope.launch {
            azan.refreshPlace()
            voices = azan.refreshVoices()
            azanVersion++
            azan.downloadChosen()
        }
    }

    /** Today as days since 1 Jan 1970 in local time (like LocalDate.toEpochDay, which needs Android 8). */
    fun today(): Long {
        val now = System.currentTimeMillis()
        return (now + TimeZone.getDefault().getOffset(now)).floorDiv(86_400_000L)
    }

    // Navigation

    fun open(s: Screen) {
        stopAzanSample()
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

    /** Shows or hides a language under each ayah (up to three at once). */
    fun toggleTranslation(code: String) {
        translations = if (code in translations) translations - code else (translations + code).takeLast(3)
        store.translations = translations
        fetchTranslations()
    }

    fun noTranslation() {
        translations = emptyList()
        store.translations = translations
    }

    /** The translation of an ayah in [code], or null while it is downloading. */
    fun translationOf(code: String, surah: Int, ayah: Int): String? {
        val q = quran ?: return null
        val all = when (code) {
            "ur" -> q.urdu
            "en" -> q.english
            else -> extraText[code]
        } ?: return null
        return all.getOrNull(surah - 1)?.getOrNull(ayah - 1)
    }

    fun language(code: String): TranslationLang? = languages.firstOrNull { it.code == code }

    private fun fetchTranslations() {
        translations.filter { it !in setOf("ur", "en") && it !in extraText && it !in downloading }.forEach { code ->
            downloading += code
            viewModelScope.launch {
                Translations.load(getApplication(), code)?.let { extraText[code] = it }
                downloading -= code
            }
        }
    }

    fun chooseTheme(p: Palette) {
        themeId = p.id
        store.themeId = p.id
    }

    fun chooseCustomColors(background: Color? = null, text: Color? = null) {
        if (themeId != "custom") chooseTheme(Palettes.custom(customBackground, customText, customExtra))
        background?.let { customBackground = it; store.customBackground = it.toArgb() }
        text?.let { customText = it; store.customText = it.toArgb() }
    }

    /** Sets one more colour of the Custom theme (see Palettes.customSlots); null = automatic. */
    fun chooseCustomColor(slot: String, color: Color?) {
        if (themeId != "custom") chooseTheme(Palettes.custom(customBackground, customText, customExtra))
        val argb = color?.toArgb() ?: 0
        store.setCustomColor(slot, argb)
        customExtra = customExtra + (slot to argb)
    }

    /** Copies the theme on screen into Custom, so the reader can change any of its colours. */
    fun customizeCurrent() {
        val p = palette
        chooseCustomColors(background = p.background, text = p.text)
        mapOf(
            "card" to p.card, "arabic" to p.arabic, "accent" to p.accent, "highlight" to p.highlight,
            "bar" to p.bar, "letterCard" to p.letterCard, "letterText" to p.letterText,
        )
            .forEach { (slot, c) -> chooseCustomColor(slot, c) }
    }

    /** Colour of a home screen button: the reader's choice, else its default. */
    fun tileColor(key: String): Color =
        tileColors[key]?.takeIf { it != 0 }?.let { Color(it) } ?: HomeTiles.default(key)

    /** Sets a home screen button's colour; null puts every button back to its default. */
    fun chooseTileColor(key: String?, color: Color?) {
        val keys = if (key == null) HomeTiles.keys else listOf(key)
        val argb = color?.toArgb() ?: 0
        keys.forEach { store.setTileColor(it, argb) }
        tileColors = tileColors + keys.associateWith { argb }
    }

    fun chooseLineSpacing(v: Int) {
        lineSpacing = v.coerceIn(0, 2)
        store.lineSpacing = lineSpacing
    }

    fun changeTextSize(delta: Int) {
        textSize = (textSize + delta).coerceIn(20, 64)
        store.textSize = textSize
    }

    fun markRead(surah: Int, ayah: Int) {
        lastRead = surah to ayah
        store.lastRead = lastRead
    }

    // Namaz and Azan

    private fun azanChanged() {
        azanVersion++
        viewModelScope.launch { azan.downloadChosen() }
    }

    fun setAzanMode(p: com.iqraquran.app.data.Prayer, m: AzanMode) { azan.setMode(p, m); azanChanged() }
    fun chooseVoice(id: String) { azan.voiceId = id; azanChanged() }
    fun chooseFajrVoice(id: String) { azan.fajrVoiceId = id; azanChanged() }
    fun setAzanVolume(v: Int) { azan.volume = v; azanChanged() }
    fun setReminder(m: Int) { azan.reminderMinutes = m; azanChanged() }
    fun setQuiet(from: Int, to: Int) { azan.quietFrom = from; azan.quietTo = to; azanChanged() }
    fun setMethod(m: CalcMethod?) { azan.method = m; azanChanged() }
    fun setAsr(m: AsrMethod) { azan.asr = m; azanChanged() }
    fun setHijriAdjust(d: Int) { azan.hijriAdjust = d; azanChanged() }

    /** A city picked by hand (kept until "Find my area again"). */
    fun chooseCity(p: com.iqraquran.app.data.Place) {
        azan.place = p
        azan.placeFixed = true
        azanChanged()
    }

    fun findPlaceAgain() {
        azan.placeFixed = false
        viewModelScope.launch { azan.refreshPlace(); azanChanged() }
    }

    fun playAzanSample(id: String) {
        val v = voices.firstOrNull { it.id == id } ?: return
        sampleId = id
        azanPlayer.playAzan(azan, v, azan.volume) { sampleId = null }
    }

    fun stopAzanSample() {
        azanPlayer.stop()
        sampleId = null
    }

    // Learners

    fun selectProfile(p: Profile) {
        profile = p
        store.currentProfileId = p.id
        stars = store.stars(p.id)
        hifz = store.hifz(p.id)
        namaz = store.namaz(p.id)
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

    // Learn Namaz

    /** A surah counts as memorized when marked so, or when Hifz lessons cover every ayah of it. */
    fun surahMemorized(n: Int): Boolean {
        if (n in namaz.surahs) return true
        val count = quran?.ayahCounts?.getOrNull(n - 1) ?: return false
        return Namaz.covers(hifz.filter { it.surah == n }.map { it.from..it.to }, count)
    }

    /** Learn Namaz teacher voice for the duas (Quran verses keep the chosen reciter). */
    var namazVoice by mutableStateOf(store.namazVoice)
        private set

    fun chooseNamazVoice(id: String) {
        namazVoice = id
        store.namazVoice = id
    }

    fun markSurah(n: Int, memorized: Boolean) {
        val p = profile ?: return
        namaz = namaz.copy(surahs = if (memorized) namaz.surahs + (n to today()) else namaz.surahs - n)
        // Unmarking also clears Hifz lessons for it, else it would still count as memorized.
        if (!memorized && hifz.any { it.surah == n }) {
            hifz = hifz.filter { it.surah != n }
            store.saveHifz(p.id, hifz)
        }
        store.saveNamaz(p.id, namaz)
    }

    fun markDua(id: String, memorized: Boolean) {
        val p = profile ?: return
        namaz = namaz.copy(duas = if (memorized) namaz.duas + (id to today()) else namaz.duas - id)
        store.saveNamaz(p.id, namaz)
    }

    fun addToPlan(n: Int) {
        val p = profile ?: return
        if (n in namaz.plan) return
        namaz = namaz.copy(extra = namaz.extra + n)
        store.saveNamaz(p.id, namaz)
    }

    fun removeFromPlan(n: Int) {
        val p = profile ?: return
        namaz = namaz.copy(extra = namaz.extra - n)
        store.saveNamaz(p.id, namaz)
    }

    override fun onCleared() {
        azanPlayer.stop()
        player.release()
        speaker.release()
    }
}
