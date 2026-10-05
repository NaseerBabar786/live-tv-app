package com.iqraquran.app.data

/**
 * The kids' Qaida path, step by step like the Noorani Qaida: letters, joined shapes,
 * harakat, tanween, long vowels, jazm, tashdeed, words, then short surahs.
 * Pure Kotlin so the lessons can be checked in plain JVM unit tests.
 */
object Qaida {

    /** One of the 29 letters with its names. [say] is what the Arabic voice reads out. */
    data class Letter(val char: String, val say: String, val en: String, val ur: String, val joins: Boolean = true)

    /**
     * One card in a lesson. [text] is shown big, [say] is read out (Arabic),
     * [en] and [ur] are small labels under it (a name or a meaning), possibly empty.
     */
    data class Item(val text: String, val say: String, val en: String = "", val ur: String = "")

    enum class Kind { Letters, Shapes, Sounds, Words, Surahs }

    data class Lesson(
        val id: Int,
        val en: String,
        val ur: String,
        val tipEn: String,
        val tipUr: String,
        val kind: Kind,
        val items: List<Item>,
    )

    private const val FATHA = "َ"
    private const val KASRA = "ِ"
    private const val DAMMA = "ُ"
    private const val FATHATAN = "ً"
    private const val KASRATAN = "ٍ"
    private const val DAMMATAN = "ٌ"
    private const val SUKUN = "ْ"
    private const val SHADDA = "ّ"
    private const val ZWJ = "‍"

    val letters = listOf(
        Letter("ا", "أَلِف", "Alif", "الف", joins = false),
        Letter("ب", "بَاء", "Baa", "با"),
        Letter("ت", "تَاء", "Taa", "تا"),
        Letter("ث", "ثَاء", "Thaa", "ثا"),
        Letter("ج", "جِيم", "Jeem", "جیم"),
        Letter("ح", "حَاء", "Haa", "حا"),
        Letter("خ", "خَاء", "Khaa", "خا"),
        Letter("د", "دَال", "Daal", "دال", joins = false),
        Letter("ذ", "ذَال", "Dhaal", "ذال", joins = false),
        Letter("ر", "رَاء", "Raa", "را", joins = false),
        Letter("ز", "زَاي", "Zaa", "زا", joins = false),
        Letter("س", "سِين", "Seen", "سین"),
        Letter("ش", "شِين", "Sheen", "شین"),
        Letter("ص", "صَاد", "Saad", "صاد"),
        Letter("ض", "ضَاد", "Daad", "ضاد"),
        Letter("ط", "طَاء", "Taa (heavy)", "طا"),
        Letter("ظ", "ظَاء", "Zaa (heavy)", "ظا"),
        Letter("ع", "عَيْن", "Ain", "عین"),
        Letter("غ", "غَيْن", "Ghain", "غین"),
        Letter("ف", "فَاء", "Faa", "فا"),
        Letter("ق", "قَاف", "Qaaf", "قاف"),
        Letter("ك", "كَاف", "Kaaf", "کاف"),
        Letter("ل", "لَام", "Laam", "لام"),
        Letter("م", "مِيم", "Meem", "میم"),
        Letter("ن", "نُون", "Noon", "نون"),
        Letter("و", "وَاو", "Waw", "واؤ", joins = false),
        Letter("ه", "هَاء", "Ha", "ہا"),
        Letter("ء", "هَمْزَة", "Hamza", "ہمزہ", joins = false),
        Letter("ي", "يَاء", "Yaa", "یا"),
    )

    /** Letters that can carry a vowel sign; alif and hamza are left out where they would mislead. */
    private val consonants = letters.filter { it.char != "ا" }

    /** The start, middle and end shapes of a letter, using a zero-width joiner to show the joins. */
    fun shapes(letter: Letter): List<String> =
        if (letter.joins) {
            listOf(letter.char, letter.char + ZWJ, ZWJ + letter.char + ZWJ, ZWJ + letter.char)
        } else {
            listOf(letter.char, ZWJ + letter.char)
        }

    /** A letter with each of [marks], as cards that read out the sound itself. */
    private fun withMarks(vararg marks: String): List<Item> =
        consonants.filter { it.char != "ء" }.flatMap { l ->
            marks.map { m -> Item(l.char + m, l.char + m, l.en, l.ur) }
        }

    private fun longVowels(): List<Item> =
        consonants.filter { it.char != "ء" }.flatMap { l ->
            listOf(
                Item(l.char + FATHA + "ا", l.char + FATHA + "ا", l.en, l.ur),
                Item(l.char + KASRA + "ي" + SUKUN, l.char + KASRA + "ي", l.en, l.ur),
                Item(l.char + DAMMA + "و" + SUKUN, l.char + DAMMA + "و", l.en, l.ur),
            )
        }

    private fun jazm(): List<Item> =
        consonants.filter { it.char != "ء" }.flatMap { l ->
            listOf(FATHA, KASRA, DAMMA).map { v ->
                val text = "ا$v${l.char}$SUKUN"
                Item(text, text, l.en, l.ur)
            }
        }

    private fun tashdeed(): List<Item> =
        consonants.filter { it.char != "ء" }.flatMap { l ->
            listOf(FATHA, KASRA, DAMMA).map { v ->
                val text = "ا$FATHA${l.char}$SHADDA$v"
                Item(text, text, l.en, l.ur)
            }
        }

    /** Short words from the Quran with their meaning. */
    val words = listOf(
        Item("اَللّٰهُ", "اَللّٰهُ", "Allah", "اللہ"),
        Item("رَبِّ", "رَبِّ", "Lord", "رب"),
        Item("اَلْحَمْدُ", "اَلْحَمْدُ", "All praise", "تمام تعریف"),
        Item("رَحْمٰنِ", "رَحْمَانِ", "Most Merciful", "بہت مہربان"),
        Item("مٰلِكِ", "مَالِكِ", "Master", "مالک"),
        Item("يَوْمِ", "يَوْمِ", "Day", "دن"),
        Item("كِتَابٌ", "كِتَابٌ", "Book", "کتاب"),
        Item("قَلَمٌ", "قَلَمٌ", "Pen", "قلم"),
        Item("بَيْتٌ", "بَيْتٌ", "House", "گھر"),
        Item("نُوْرٌ", "نُورٌ", "Light", "نور"),
        Item("جَنَّةٌ", "جَنَّةٌ", "Paradise", "جنت"),
        Item("قُرْاٰنٌ", "قُرْآنٌ", "Quran", "قرآن"),
        Item("اِسْلَامٌ", "إِسْلَامٌ", "Islam", "اسلام"),
        Item("مَسْجِدٌ", "مَسْجِدٌ", "Mosque", "مسجد"),
        Item("رَسُوْلٌ", "رَسُولٌ", "Messenger", "رسول"),
        Item("نَبِيٌّ", "نَبِيٌّ", "Prophet", "نبی"),
        Item("سَلَامٌ", "سَلَامٌ", "Peace", "سلامتی"),
        Item("خَلَقَ", "خَلَقَ", "He created", "اس نے پیدا کیا"),
        Item("قُلْ", "قُلْ", "Say", "کہو"),
        Item("هُوَ", "هُوَ", "He", "وہ"),
        Item("اَحَدٌ", "أَحَدٌ", "One", "ایک"),
        Item("اَلنَّاسِ", "النَّاسِ", "Mankind", "لوگ"),
        Item("اَلْفَلَقِ", "الْفَلَقِ", "Daybreak", "صبح"),
        Item("اِقْرَاْ", "اِقْرَأْ", "Read", "پڑھ"),
        Item("عَلَّمَ", "عَلَّمَ", "He taught", "اس نے سکھایا"),
        Item("صَبْرٌ", "صَبْرٌ", "Patience", "صبر"),
        Item("شُكْرٌ", "شُكْرٌ", "Thanks", "شکر"),
        Item("اُمٌّ", "أُمٌّ", "Mother", "ماں"),
    )

    /** Short surahs for the last step, as surah numbers, in the order children usually learn them. */
    val firstSurahs = listOf(1, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100, 99, 98, 97)

    val lessons: List<Lesson> = listOf(
        Lesson(
            1, "Letters", "حروفِ تہجی",
            "Tap a letter to hear its name. Say it after the voice.",
            "حرف پر ٹیپ کریں اور اس کا نام سنیں۔ آواز کے بعد دہرائیں۔",
            Kind.Letters, letters.map { Item(it.char, it.say, it.en, it.ur) },
        ),
        Lesson(
            2, "Joined letters", "حروفِ مرکبات",
            "Letters change shape when they join: start, middle and end.",
            "حروف ملنے پر شکل بدلتے ہیں: شروع، درمیان اور آخر۔",
            Kind.Shapes, letters.map { Item(shapes(it).joinToString("  "), it.say, it.en, it.ur) },
        ),
        Lesson(
            3, "Zabar", "زبر",
            "Zabar is a small line above the letter. It makes an \"a\" sound: ba, ta, tha.",
            "زبر حرف کے اوپر چھوٹی لکیر ہے۔ اس سے \"اَ\" کی آواز آتی ہے: بَ، تَ، ثَ۔",
            Kind.Sounds, withMarks(FATHA),
        ),
        Lesson(
            4, "Zer", "زیر",
            "Zer is a small line below the letter. It makes an \"i\" sound: bi, ti, thi.",
            "زیر حرف کے نیچے چھوٹی لکیر ہے۔ اس سے \"اِ\" کی آواز آتی ہے: بِ، تِ، ثِ۔",
            Kind.Sounds, withMarks(KASRA),
        ),
        Lesson(
            5, "Pesh", "پیش",
            "Pesh is a small waw above the letter. It makes a \"u\" sound: bu, tu, thu.",
            "پیش حرف کے اوپر چھوٹی واؤ ہے۔ اس سے \"اُ\" کی آواز آتی ہے: بُ، تُ، ثُ۔",
            Kind.Sounds, withMarks(DAMMA),
        ),
        Lesson(
            6, "Zabar, zer, pesh together", "زبر، زیر، پیش ایک ساتھ",
            "Read each letter three ways: ba, bi, bu.",
            "ہر حرف کو تین طرح پڑھیں: بَ، بِ، بُ۔",
            Kind.Sounds, withMarks(FATHA, KASRA, DAMMA),
        ),
        Lesson(
            7, "Tanween", "تنوین",
            "Two zabar, two zer or two pesh add an \"n\" sound: ban, bin, bun.",
            "دو زبر، دو زیر یا دو پیش سے \"ن\" کی آواز آتی ہے: بًا، بٍ، بٌ۔",
            Kind.Sounds, withMarks(FATHATAN, KASRATAN, DAMMATAN),
        ),
        Lesson(
            8, "Long vowels (madd)", "حروفِ مدہ",
            "Alif, yaa and waw after a vowel make it long: baa, bee, boo.",
            "الف، یا اور واؤ آواز کو لمبا کرتے ہیں: بَا، بِیْ، بُوْ۔",
            Kind.Sounds, longVowels(),
        ),
        Lesson(
            9, "Jazm (sukoon)", "جزم",
            "Jazm means the letter has no vowel; join it to the letter before: ab, ib, ub.",
            "جزم والا حرف پچھلے حرف سے مل کر پڑھا جاتا ہے: اَبْ، اِبْ، اُبْ۔",
            Kind.Sounds, jazm(),
        ),
        Lesson(
            10, "Tashdeed", "تشدید",
            "Tashdeed doubles the letter: read it twice, once joined and once with its vowel.",
            "تشدید والا حرف دو بار پڑھا جاتا ہے: ایک بار ملا کر، ایک بار حرکت کے ساتھ۔",
            Kind.Sounds, tashdeed(),
        ),
        Lesson(
            11, "Quran words", "قرآنی الفاظ",
            "Now read whole words from the Quran, and learn what they mean.",
            "اب قرآن کے پورے الفاظ پڑھیں اور ان کا مطلب سیکھیں۔",
            Kind.Words, words,
        ),
        Lesson(
            12, "Short surahs", "چھوٹی سورتیں",
            "Listen to the teacher read slowly, ayah by ayah, and repeat.",
            "استاد کی آہستہ تلاوت سنیں، آیت بہ آیت، اور دہرائیں۔",
            Kind.Surahs, emptyList(),
        ),
    )

    fun lesson(id: Int): Lesson = lessons.first { it.id == id }

    /** Stars for a finished quiz: 3 for at most one mistake, 2 for a few, otherwise 1. */
    fun stars(mistakes: Int): Int = when {
        mistakes <= 1 -> 3
        mistakes <= 4 -> 2
        else -> 1
    }

    /** How many questions a quiz asks. */
    const val QUIZ_LENGTH = 10
}
