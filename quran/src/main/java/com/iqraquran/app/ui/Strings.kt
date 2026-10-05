package com.iqraquran.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf

/** The app's two languages. Urdu also turns the layout right-to-left. */
enum class Lang { En, Ur }

val LocalLang = staticCompositionLocalOf { Lang.En }

/** A piece of on-screen text in English and Urdu. */
class L(val en: String, val ur: String) {
    @Composable
    @ReadOnlyComposable
    fun get(): String = if (LocalLang.current == Lang.Ur) ur else en
}

/** Picks the English or Urdu of any pair of strings. */
@Composable
@ReadOnlyComposable
fun tr(en: String, ur: String): String = if (LocalLang.current == Lang.Ur) ur else en

object S {
    val appName = L("Iqra Quran", "اقرا قرآن")
    val tagline = L("Learn, read and memorize the Quran", "قرآن سیکھیں، پڑھیں اور حفظ کریں")
    val kids = L("Kids Qaida", "بچوں کا قاعدہ")
    val kidsSub = L("From alif to reading the Quran", "الف سے قرآن پڑھنے تک")
    val read = L("Read Quran", "قرآن پڑھیں")
    val readSub = L("With audio and translation", "تلاوت اور ترجمے کے ساتھ")
    val hifz = L("Hifz", "حفظ")
    val hifzSub = L("Memorize and revise", "یاد کریں اور دہرائیں")
    val settings = L("Settings", "ترتیبات")
    val continueReading = L("Continue reading", "جہاں چھوڑا تھا وہاں سے پڑھیں")
    val loading = L("Loading the Quran…", "قرآن لوڈ ہو رہا ہے…")
    val back = L("Back", "واپس")
    val learn = L("Learn", "سیکھیں")
    val quiz = L("Quiz", "سوالات")
    val playAll = L("Play all", "سب سنیں")
    val stop = L("Stop", "روکیں")
    val next = L("Next", "اگلا")
    val previous = L("Previous", "پچھلا")
    val whichOne = L("Which one did you hear?", "آپ نے کون سا سنا؟")
    val listenAgain = L("Listen again", "دوبارہ سنیں")
    val wellDone = L("Well done!", "شاباش!")
    val tryAgain = L("Try again", "دوبارہ کوشش کریں")
    val finished = L("Lesson finished", "سبق مکمل")
    val playAgain = L("Play again", "دوبارہ کھیلیں")
    val done = L("Done", "ٹھیک ہے")
    val noArabicVoice = L(
        "This device has no Arabic voice yet. Install it in Android Settings > Text-to-speech (Google), then come back.",
        "اس ڈیوائس پر عربی آواز موجود نہیں۔ اینڈرائیڈ سیٹنگز > ٹیکسٹ ٹو اسپیچ (Google) میں عربی آواز انسٹال کریں۔",
    )
    val surahs = L("Surahs", "سورتیں")
    val ayahs = L("ayahs", "آیات")
    val makki = L("Makki", "مکی")
    val madani = L("Madani", "مدنی")
    val play = L("Play", "چلائیں")
    val pause = L("Pause", "روکیں")
    val reciter = L("Reciter", "قاری")
    val translation = L("Translation", "ترجمہ")
    val textSize = L("Text size", "لکھائی کا سائز")
    val none = L("None", "کوئی نہیں")
    val urdu = L("Urdu", "اردو")
    val english = L("English", "انگریزی")
    val both = L("Both", "دونوں")
    val language = L("App language", "ایپ کی زبان")
    val noInternet = L("Could not play the audio. Check the internet.", "تلاوت نہیں چل سکی۔ انٹرنیٹ چیک کریں۔")
    val profiles = L("Who is learning?", "کون سیکھ رہا ہے؟")
    val addProfile = L("Add child", "بچہ شامل کریں")
    val name = L("Name", "نام")
    val save = L("Save", "محفوظ کریں")
    val cancel = L("Cancel", "منسوخ")
    val delete = L("Delete", "حذف کریں")
    val newLesson = L("New lesson (Sabaq)", "نیا سبق")
    val todaysRevision = L("Today's revision", "آج کی دہرائی")
    val nothingDue = L("Nothing to revise today. Start a new lesson!", "آج دہرانے کو کچھ نہیں۔ نیا سبق شروع کریں!")
    val sabaq = L("Sabaq (today)", "سبق (آج)")
    val sabqi = L("Sabqi (this week)", "سبقی (اس ہفتے)")
    val manzil = L("Manzil (older)", "منزل (پرانا)")
    val juzMap = L("My 30 juz", "میرے 30 پارے")
    val fromAyah = L("From ayah", "آیت سے")
    val toAyah = L("To ayah", "آیت تک")
    val repeatEach = L("Repeat each ayah", "ہر آیت دہرائیں")
    val repeatAll = L("Then repeat all together", "پھر سب ایک ساتھ")
    val gap = L("Pause after each ayah", "ہر آیت کے بعد وقفہ")
    val start = L("Start", "شروع کریں")
    val hideText = L("Hide text", "عبارت چھپائیں")
    val showText = L("Show text", "عبارت دکھائیں")
    val tapToPeek = L("Tap to peek", "دیکھنے کے لیے ٹیپ کریں")
    val memorized = L("I memorized it", "میں نے یاد کر لیا")
    val good = L("Good", "اچھا یاد ہے")
    val weak = L("Weak", "کمزور ہے")
    val repeat = L("Repeat", "دہرائیں")
    val ayahWord = L("Ayah", "آیت")
    val of = L("of", "میں سے")
    val savedToHifz = L("Added to your Hifz revision.", "آپ کی حفظ دہرائی میں شامل ہو گیا۔")
    val kidsReciter = L("Teacher voice for kids", "بچوں کے لیے استاد کی آواز")
    val credits = L("Sources", "ذرائع")
    val creditsText = L(
        "Quran text (Indo-Pak script) and translations: Quran Foundation (quran.com). " +
            "Urdu: Fateh Muhammad Jalandhari. English: Saheeh International. " +
            "Recitations: EveryAyah.com. Quran font: Scheherazade New by SIL (Open Font License). " +
            "Iqra Quran is free and has no ads.",
        "قرآن کا متن (انڈو پاک رسم الخط) اور تراجم: قرآن فاؤنڈیشن (quran.com)۔ " +
            "اردو: فتح محمد جالندھری۔ انگریزی: صحیح انٹرنیشنل۔ " +
            "تلاوت: EveryAyah.com۔ فونٹ: Scheherazade New (SIL)۔ " +
            "اقرا قرآن مفت ہے اور اس میں کوئی اشتہار نہیں۔",
    )
    val version = L("Version", "ورژن")
    val surahLesson = L("Pick a surah to learn", "سیکھنے کے لیے سورت چنیں")
    val minutes = L("Gap", "وقفہ")
    val seconds = L("s", "سیکنڈ")
    val readingTheme = L("Reading theme (easy on the eyes)", "پڑھنے کا رنگ (آنکھوں کے لیے آسان)")
    val theme = L("Theme", "رنگ")
    val background = L("Background", "پس منظر")
    val textColour = L("Text colour", "لکھائی کا رنگ")
    val lineSpacing = L("Line spacing", "سطروں کا فاصلہ")
    val normal = L("Normal", "عام")
    val wide = L("Wide", "زیادہ")
    val wider = L("Wider", "اور زیادہ")
}
