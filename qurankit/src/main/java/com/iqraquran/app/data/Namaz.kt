package com.iqraquran.app.data

/**
 * Learn Namaz: how to offer the prayer, following the Salat book of the Ahmadiyya Muslim
 * Community (alislam.org/book/salat), with every recitation in Arabic, transliteration,
 * English and Urdu, and the 30 surahs to memorize for namaz.
 *
 * Quran verses take their Arabic text and audio from the app's own Quran (standard verse
 * numbers, as in the rest of the app). Other recitations are written out here.
 */
object Namaz {

    const val SOURCE_EN =
        "Salat, the Muslim Prayer Book (Ahmadiyya Muslim Community, alislam.org/book/salat) and the alislam.org Online Salat Guide. " +
            "Translations of Quran verses follow the Ahmadiyya English translation. When in doubt, ask your local missionary or Murabbi."
    const val SOURCE_UR =
        "کتاب \"نماز\" (جماعت احمدیہ، alislam.org/book/salat) اور alislam.org کی آن لائن نماز گائیڈ۔ " +
            "کسی بات میں شک ہو تو اپنے مربی صاحب سے پوچھیں۔"

    /**
     * One thing said in the prayer. [arabic] is written out, or taken from the Quran [ayahs]
     * (surah to ayah, standard numbers); [fromWord] cuts a verse to start at that word.
     * [wholeAyahs] = the words are whole verses, so the reciter's audio fits them exactly.
     */
    data class Recitation(
        val id: String,
        val titleEn: String,
        val titleUr: String,
        val translit: String,
        val meaningEn: String,
        val meaningUr: String,
        val arabic: String = "",
        val ayahs: List<Pair<Int, Int>> = emptyList(),
        val fromWord: String = "",
        val timesEn: String = "",
        val timesUr: String = "",
        val memorize: Boolean = true,
    ) {
        val wholeAyahs: Boolean get() = ayahs.isNotEmpty() && fromWord.isEmpty() && arabic.isEmpty()
    }

    /** One position or stage of the prayer: what to do, then the [recitations] (ids) said in it. */
    data class Step(
        val id: String,
        val titleEn: String,
        val titleUr: String,
        val arabicName: String,
        val howEn: String,
        val howUr: String,
        val recitations: List<String> = emptyList(),
        val noteEn: String = "",
        val noteUr: String = "",
    )

    data class Part(val en: String, val ur: String, val count: Int, val fard: Boolean = false)
    data class PrayerRakats(val nameEn: String, val nameUr: String, val parts: List<Part>)

    /** The Arabic of a recitation; [verse] looks up Quran text (surah, ayah). */
    fun arabicOf(r: Recitation, verse: (Int, Int) -> String?): String {
        if (r.arabic.isNotEmpty()) return r.arabic
        val text = r.ayahs.joinToString(" ") { (s, a) -> verse(s, a).orEmpty() }.trim()
        if (r.fromWord.isEmpty()) return text
        val i = text.indexOf(r.fromWord)
        return if (i >= 0) text.substring(i) else text
    }

    /** True when [ranges] of ayahs together cover every ayah from 1 to [count]. */
    fun covers(ranges: List<IntRange>, count: Int): Boolean {
        if (count <= 0) return false
        val seen = BooleanArray(count + 1)
        ranges.forEach { r -> for (a in r) if (a in 1..count) seen[a] = true }
        return (1..count).all { seen[it] }
    }

    /**
     * The 30 surahs to memorize for namaz: Al-Fatihah, recited in every rak'ah, and the 29 short
     * surahs from At-Tariq (86) to An-Nas (114) that are usually recited after it.
     */
    val starterSurahs: List<Int> = listOf(1) + (86..114)

    private const val ODD_EN = "3 times or more (an odd number)"
    private const val ODD_UR = "تین بار یا زیادہ (طاق تعداد)"

    val recitations: List<Recitation> = listOf(
        Recitation(
            id = "niyyat",
            titleEn = "Intention (optional verse)",
            titleUr = "نیت (اختیاری آیت)",
            ayahs = listOf(6 to 79),
            translit = "Inni wajjahtu wajhiya lilladhi fataras-samawati wal-arda hanifan wa ma ana minal-mushrikin.",
            meaningEn = "I have turned my face toward Him Who created the heavens and the earth, being ever inclined to Him, " +
                "and I am not of those who associate partners with Allah. (Holy Quran 6:80, counting Bismillah as verse 1)",
            meaningUr = "میں نے اپنا رُخ اُس کی طرف پھیر لیا ہے جس نے آسمانوں اور زمین کو پیدا کیا، اُسی کی طرف جھکتے ہوئے، " +
                "اور میں مشرکوں میں سے نہیں ہوں۔ (سورۃ الانعام 6:80، بسم اللہ کو پہلی آیت گن کر)",
        ),
        Recitation(
            id = "takbir",
            titleEn = "Takbir",
            titleUr = "تکبیر",
            arabic = "اَللّٰهُ اَكْبَرُ",
            translit = "Allahu Akbar.",
            meaningEn = "Allah is the Greatest.",
            meaningUr = "اللہ سب سے بڑا ہے۔",
        ),
        Recitation(
            id = "thana",
            titleEn = "Thana (praise)",
            titleUr = "ثناء",
            arabic = "سُبْحَانَكَ اللّٰهُمَّ وَبِحَمْدِكَ وَتَبَارَكَ اسْمُكَ وَتَعَالٰى جَدُّكَ وَلَآ اِلٰهَ غَيْرُكَ",
            translit = "Subhanakallahumma wa bihamdika wa tabarakasmuka wa ta'ala jadduka wa la ilaha ghairuk.",
            meaningEn = "Holy art Thou, O Allah, and all praise is Thine; blessed is Thy name and exalted is Thy majesty, " +
                "and there is none worthy of worship except Thee.",
            meaningUr = "اے اللہ! تُو پاک ہے اور سب تعریف تیری ہی ہے، تیرا نام بہت برکت والا ہے اور تیری شان بہت بلند ہے، " +
                "اور تیرے سوا کوئی عبادت کے لائق نہیں۔",
            timesEn = "First rak'ah only",
            timesUr = "صرف پہلی رکعت میں",
        ),
        Recitation(
            id = "taawwudh",
            titleEn = "Ta'awwudh (seeking refuge)",
            titleUr = "تعوّذ",
            arabic = "اَعُوْذُ بِاللّٰهِ مِنَ الشَّيْطٰنِ الرَّجِيْمِ",
            translit = "A'udhu billahi minash-shaitanir-rajim.",
            meaningEn = "I seek refuge with Allah from Satan, the accursed.",
            meaningUr = "میں دھتکارے ہوئے شیطان سے اللہ کی پناہ مانگتا ہوں۔",
            timesEn = "First rak'ah only",
            timesUr = "صرف پہلی رکعت میں",
        ),
        Recitation(
            id = "tasmiya",
            titleEn = "Tasmiyah (Bismillah)",
            titleUr = "تسمیہ (بسم اللہ)",
            ayahs = listOf(1 to 1),
            translit = "Bismillahir-rahmanir-rahim.",
            meaningEn = "In the name of Allah, the Gracious, the Merciful.",
            meaningUr = "اللہ کے نام کے ساتھ جو بے حد مہربان، بار بار رحم کرنے والا ہے۔",
        ),
        Recitation(
            id = "fatiha",
            titleEn = "Surah Al-Fatihah",
            titleUr = "سورۃ الفاتحہ",
            ayahs = (1..7).map { 1 to it },
            translit = "Bismillahir-rahmanir-rahim. Al-hamdu lillahi rabbil-'alamin. Ar-rahmanir-rahim. Maliki yaumid-din. " +
                "Iyyaka na'budu wa iyyaka nasta'in. Ihdinas-siratal-mustaqim. Siratal-ladhina an'amta 'alaihim, " +
                "ghairil-maghdubi 'alaihim wa lad-dallin.",
            meaningEn = "In the name of Allah, the Gracious, the Merciful. All praise belongs to Allah, Lord of all the worlds, " +
                "the Gracious, the Merciful, Master of the Day of Judgment. Thee alone do we worship and Thee alone do we implore for help. " +
                "Guide us in the right path, the path of those on whom Thou hast bestowed Thy blessings, " +
                "those who have not incurred Thy displeasure, and those who have not gone astray.",
            meaningUr = "اللہ کے نام کے ساتھ جو بے حد مہربان، بار بار رحم کرنے والا ہے۔ سب تعریف اللہ ہی کے لیے ہے جو تمام جہانوں کا رب ہے۔ " +
                "بے حد مہربان، بار بار رحم کرنے والا۔ جزا سزا کے دن کا مالک۔ ہم تیری ہی عبادت کرتے ہیں اور تجھ ہی سے مدد مانگتے ہیں۔ " +
                "ہمیں سیدھے راستے پر چلا۔ اُن لوگوں کے راستے پر جن پر تُو نے انعام کیا، جن پر غضب نہیں کیا گیا اور جو گمراہ نہیں ہوئے۔",
            timesEn = "Every rak'ah",
            timesUr = "ہر رکعت میں",
        ),
        Recitation(
            id = "amin",
            titleEn = "Amin",
            titleUr = "آمین",
            arabic = "اٰمِيْن",
            translit = "Amin.",
            meaningEn = "So be it (accept our prayer). Said after Al-Fatihah.",
            meaningUr = "ایسا ہی ہو (ہماری دعا قبول فرما)۔ سورۃ الفاتحہ کے بعد۔",
            memorize = false,
        ),
        Recitation(
            id = "ruku",
            titleEn = "In Ruku'",
            titleUr = "رکوع میں",
            arabic = "سُبْحَانَ رَبِّيَ الْعَظِيْمِ",
            translit = "Subhana rabbiyal-'azim.",
            meaningEn = "Holy is my Lord, the Most Great.",
            meaningUr = "پاک ہے میرا رب جو بڑی عظمت والا ہے۔",
            timesEn = ODD_EN,
            timesUr = ODD_UR,
        ),
        Recitation(
            id = "tasmi",
            titleEn = "Rising from Ruku'",
            titleUr = "رکوع سے اٹھتے ہوئے",
            arabic = "سَمِعَ اللّٰهُ لِمَنْ حَمِدَهٗ",
            translit = "Sami'allahu liman hamidah.",
            meaningEn = "Allah hears him who praises Him.",
            meaningUr = "اللہ نے اُس کی سن لی جس نے اُس کی تعریف کی۔",
        ),
        Recitation(
            id = "tahmid",
            titleEn = "Standing after Ruku' (Qaumah)",
            titleUr = "قومہ میں",
            arabic = "رَبَّنَا وَلَكَ الْحَمْدُ، حَمْدًا كَثِيْرًا طَيِّبًا مُّبَارَكًا فِيْهِ",
            translit = "Rabbana wa lakal-hamd, hamdan kathiran tayyiban mubarakan fih.",
            meaningEn = "O our Lord, and Thine is the praise; praise which is plenty, pure and blessed.",
            meaningUr = "اے ہمارے رب! اور سب تعریف تیری ہی ہے، بہت زیادہ، پاکیزہ اور برکت والی تعریف۔",
        ),
        Recitation(
            id = "sajdah",
            titleEn = "In Sajdah",
            titleUr = "سجدے میں",
            arabic = "سُبْحَانَ رَبِّيَ الْاَعْلٰى",
            translit = "Subhana rabbiyal-a'la.",
            meaningEn = "Holy is my Lord, the Most High.",
            meaningUr = "پاک ہے میرا رب جو سب سے بلند ہے۔",
            timesEn = ODD_EN,
            timesUr = ODD_UR,
        ),
        Recitation(
            id = "jalsah",
            titleEn = "Between the two Sajdahs (Jalsah)",
            titleUr = "دو سجدوں کے درمیان (جلسہ)",
            arabic = "اَللّٰهُمَّ اغْفِرْ لِيْ وَارْحَمْنِيْ وَاهْدِنِيْ وَعَافِنِيْ وَارْفَعْنِيْ وَاجْبُرْنِيْ وَارْزُقْنِيْ",
            translit = "Allahummaghfir li warhamni wahdini wa 'afini warfa'ni wajburni warzuqni.",
            meaningEn = "O Allah, forgive me and have mercy on me and guide me and grant me security and raise me up " +
                "and make good my shortcomings and provide for me.",
            meaningUr = "اے اللہ! مجھے بخش دے، مجھ پر رحم کر، مجھے ہدایت دے، مجھے عافیت دے، مجھے بلندی عطا کر، " +
                "میری کمی پوری کر اور مجھے رزق عطا کر۔",
        ),
        Recitation(
            id = "tashahhud",
            titleEn = "Tashahhud (At-Tahiyyat)",
            titleUr = "تشہد (التحیات)",
            arabic = "اَلتَّحِيَّاتُ لِلّٰهِ وَالصَّلَوٰتُ وَالطَّيِّبٰتُ، اَلسَّلَامُ عَلَيْكَ اَيُّهَا النَّبِيُّ وَرَحْمَةُ اللّٰهِ وَبَرَكَاتُهٗ، " +
                "اَلسَّلَامُ عَلَيْنَا وَعَلٰى عِبَادِ اللّٰهِ الصّٰلِحِيْنَ، اَشْهَدُ اَنْ لَّآ اِلٰهَ اِلَّا اللّٰهُ وَاَشْهَدُ اَنَّ مُحَمَّدًا عَبْدُهٗ وَرَسُوْلُهٗ",
            translit = "At-tahiyyatu lillahi was-salawatu wat-tayyibatu. As-salamu 'alaika ayyuhan-nabiyyu wa rahmatullahi wa barakatuh. " +
                "As-salamu 'alaina wa 'ala 'ibadillahis-salihin. Ash-hadu alla ilaha illallahu wa ash-hadu anna Muhammadan 'abduhu wa rasuluh.",
            meaningEn = "All verbal, physical and financial worship is due to Allah. Peace be on you, O Prophet, and the mercy of Allah " +
                "and His blessings. Peace be on us and on the righteous servants of Allah. I bear witness that there is none worthy of " +
                "worship except Allah, and I bear witness that Muhammad is His servant and His Messenger.",
            meaningUr = "تمام زبانی، بدنی اور مالی عبادتیں اللہ ہی کے لیے ہیں۔ اے نبی! آپ پر سلام ہو اور اللہ کی رحمت اور اُس کی برکتیں۔ " +
                "ہم پر اور اللہ کے نیک بندوں پر سلام ہو۔ میں گواہی دیتا ہوں کہ اللہ کے سوا کوئی عبادت کے لائق نہیں، " +
                "اور میں گواہی دیتا ہوں کہ محمد (صلی اللہ علیہ وسلم) اُس کے بندے اور اُس کے رسول ہیں۔",
            timesEn = "Every sitting",
            timesUr = "ہر قعدہ میں",
        ),
        Recitation(
            id = "durood",
            titleEn = "Durood (blessings on the Holy Prophet)",
            titleUr = "درود شریف",
            arabic = "اَللّٰهُمَّ صَلِّ عَلٰى مُحَمَّدٍ وَّعَلٰٓى اٰلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلٰٓى اِبْرَاهِيْمَ وَعَلٰٓى اٰلِ اِبْرَاهِيْمَ اِنَّكَ حَمِيْدٌ مَّجِيْدٌ۔ " +
                "اَللّٰهُمَّ بَارِكْ عَلٰى مُحَمَّدٍ وَّعَلٰٓى اٰلِ مُحَمَّدٍ كَمَا بَارَكْتَ عَلٰٓى اِبْرَاهِيْمَ وَعَلٰٓى اٰلِ اِبْرَاهِيْمَ اِنَّكَ حَمِيْدٌ مَّجِيْدٌ",
            translit = "Allahumma salli 'ala Muhammadin wa 'ala ali Muhammadin kama sallaita 'ala Ibrahima wa 'ala ali Ibrahima innaka hamidun majid. " +
                "Allahumma barik 'ala Muhammadin wa 'ala ali Muhammadin kama barakta 'ala Ibrahima wa 'ala ali Ibrahima innaka hamidun majid.",
            meaningEn = "Bless, O Allah, Muhammad and his people as Thou didst bless Abraham and his people; Thou art indeed Praiseworthy, the Exalted. " +
                "Prosper, O Allah, Muhammad and his people as Thou didst prosper Abraham and his people; Thou art indeed Praiseworthy, the Exalted.",
            meaningUr = "اے اللہ! محمد (ﷺ) اور آلِ محمد پر رحمت نازل فرما جیسے تُو نے ابراہیم اور آلِ ابراہیم پر رحمت نازل فرمائی، یقیناً تُو تعریف والا، بزرگی والا ہے۔ " +
                "اے اللہ! محمد (ﷺ) اور آلِ محمد پر برکت نازل فرما جیسے تُو نے ابراہیم اور آلِ ابراہیم پر برکت نازل فرمائی، یقیناً تُو تعریف والا، بزرگی والا ہے۔",
            timesEn = "Last sitting",
            timesUr = "آخری قعدہ میں",
        ),
        Recitation(
            id = "rabbana_atina",
            titleEn = "Rabbana atina",
            titleUr = "ربنا آتنا",
            ayahs = listOf(2 to 201),
            fromWord = "رَبَّنَآ",
            translit = "Rabbana atina fid-dunya hasanatan wa fil-akhirati hasanatan wa qina 'adhaban-nar.",
            meaningEn = "Our Lord, grant us good in this world as well as good in the world to come, and protect us from the torment of the Fire. " +
                "(Holy Quran 2:202, counting Bismillah as verse 1)",
            meaningUr = "اے ہمارے رب! ہمیں دنیا میں بھی بھلائی دے اور آخرت میں بھی بھلائی دے اور ہمیں آگ کے عذاب سے بچا۔ (سورۃ البقرہ 2:202)",
            timesEn = "Last sitting",
            timesUr = "آخری قعدہ میں",
        ),
        Recitation(
            id = "rabbij_alni",
            titleEn = "Rabbij'alni",
            titleUr = "ربِّ اجعلنی",
            ayahs = listOf(14 to 40),
            translit = "Rabbij'alni muqimas-salati wa min dhurriyyati, rabbana wa taqabbal du'a.",
            meaningEn = "My Lord, make me observe Prayer, and my children too. Our Lord, bestow Thy grace on me and accept my prayer. " +
                "(Holy Quran 14:41, counting Bismillah as verse 1)",
            meaningUr = "اے میرے رب! مجھے نماز قائم کرنے والا بنا اور میری اولاد کو بھی۔ اے ہمارے رب! اور میری دعا قبول فرما۔ (سورۃ ابراہیم 14:41)",
            timesEn = "Last sitting",
            timesUr = "آخری قعدہ میں",
        ),
        Recitation(
            id = "rabbanaghfirli",
            titleEn = "Rabbanaghfir li",
            titleUr = "ربنا اغفر لی",
            ayahs = listOf(14 to 41),
            translit = "Rabbanaghfir li wa li-walidayya wa lil-mu'minina yauma yaqumul-hisab.",
            meaningEn = "Our Lord, grant forgiveness to me and to my parents and to the believers on the day when the reckoning will take place. " +
                "(Holy Quran 14:42, counting Bismillah as verse 1)",
            meaningUr = "اے ہمارے رب! مجھے اور میرے والدین کو اور مومنوں کو اُس دن بخش دینا جس دن حساب قائم ہوگا۔ (سورۃ ابراہیم 14:42)",
            timesEn = "Last sitting",
            timesUr = "آخری قعدہ میں",
        ),
        Recitation(
            id = "salam",
            titleEn = "Salam (ending the prayer)",
            titleUr = "سلام",
            arabic = "اَلسَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللّٰهِ",
            translit = "As-salamu 'alaikum wa rahmatullah.",
            meaningEn = "Peace be on you and the mercy of Allah.",
            meaningUr = "تم پر سلامتی ہو اور اللہ کی رحمت۔",
            timesEn = "Right, then left",
            timesUr = "دائیں، پھر بائیں",
        ),
        Recitation(
            id = "qunut",
            titleEn = "Du'a-e-Qunut (in Witr)",
            titleUr = "دعائے قنوت (وتر میں)",
            arabic = "اَللّٰهُمَّ اِنَّا نَسْتَعِيْنُكَ وَنَسْتَغْفِرُكَ وَنُؤْمِنُ بِكَ وَنَتَوَكَّلُ عَلَيْكَ وَنُثْنِيْ عَلَيْكَ الْخَيْرَ وَنَشْكُرُكَ وَلَا نَكْفُرُكَ " +
                "وَنَخْلَعُ وَنَتْرُكُ مَنْ يَّفْجُرُكَ۔ اَللّٰهُمَّ اِيَّاكَ نَعْبُدُ وَلَكَ نُصَلِّيْ وَنَسْجُدُ وَاِلَيْكَ نَسْعٰى وَنَحْفِدُ " +
                "وَنَرْجُوْ رَحْمَتَكَ وَنَخْشٰى عَذَابَكَ اِنَّ عَذَابَكَ بِالْكُفَّارِ مُلْحِقٌ",
            translit = "Allahumma inna nasta'inuka wa nastaghfiruka wa nu'minu bika wa natawakkalu 'alaika wa nuthni 'alaikal-khair, " +
                "wa nashkuruka wa la nakfuruka wa nakhla'u wa natruku man yafjuruk. Allahumma iyyaka na'budu wa laka nusalli wa nasjudu " +
                "wa ilaika nas'a wa nahfidu wa narju rahmataka wa nakhsha 'adhabaka inna 'adhabaka bil-kuffari mulhiq.",
            meaningEn = "O Allah, we beseech Thy help and request Thy protection and believe in Thee and trust in Thee, and we laud Thee " +
                "in the best manner and we thank Thee and we are not ungrateful to Thee, and we cast off and forsake him who disobeys Thee. " +
                "O Allah, Thee alone do we serve and to Thee alone do we pray and make obeisance, and to Thee we flee and are quick, " +
                "we hope for Thy mercy and fear Thy punishment; surely Thy punishment overtakes the disbelievers.",
            meaningUr = "اے اللہ! ہم تجھ سے مدد مانگتے ہیں اور تجھ سے بخشش چاہتے ہیں، تجھ پر ایمان لاتے ہیں اور تجھ پر بھروسہ کرتے ہیں، " +
                "اور تیری بہترین تعریف کرتے ہیں، تیرا شکر کرتے ہیں اور تیری ناشکری نہیں کرتے، اور جو تیری نافرمانی کرے اُسے ہم چھوڑتے اور الگ کرتے ہیں۔ " +
                "اے اللہ! ہم تیری ہی عبادت کرتے ہیں، تیرے ہی لیے نماز پڑھتے اور سجدہ کرتے ہیں، تیری ہی طرف دوڑتے اور جلدی کرتے ہیں، " +
                "تیری رحمت کی امید رکھتے ہیں اور تیرے عذاب سے ڈرتے ہیں، یقیناً تیرا عذاب کافروں کو پہنچنے والا ہے۔",
            timesEn = "3rd rak'ah of Witr",
            timesUr = "وتر کی تیسری رکعت",
        ),
        Recitation(
            id = "after_salam",
            titleEn = "After the prayer",
            titleUr = "نماز کے بعد",
            arabic = "اَللّٰهُمَّ اَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْاِكْرَامِ",
            translit = "Allahumma antas-salamu wa minkas-salamu, tabarakta ya dhal-jalali wal-ikram.",
            meaningEn = "O Allah, Thou art Peace and from Thee comes peace. Blessed art Thou, O Lord of Majesty and Honour.",
            meaningUr = "اے اللہ! تُو سلامتی والا ہے اور تجھ ہی سے سلامتی ہے، تُو بڑی برکت والا ہے، اے جلال اور عزت والے!",
        ),
        Recitation(
            id = "tasbih",
            titleEn = "Tasbih after the prayer",
            titleUr = "نماز کے بعد تسبیح",
            arabic = "سُبْحَانَ اللّٰهِ ۝ اَلْحَمْدُ لِلّٰهِ ۝ اَللّٰهُ اَكْبَرُ",
            translit = "Subhanallah (33 times), Alhamdulillah (33 times), Allahu Akbar (34 times).",
            meaningEn = "Holy is Allah. All praise belongs to Allah. Allah is the Greatest.",
            meaningUr = "اللہ پاک ہے۔ سب تعریف اللہ کے لیے ہے۔ اللہ سب سے بڑا ہے۔",
            timesEn = "33 + 33 + 34",
            timesUr = "33 + 33 + 34",
        ),
    )

    private val byId = recitations.associateBy { it.id }
    fun recitation(id: String): Recitation = byId.getValue(id)

    /** The recitations to learn by heart (Amin is too short to count). */
    val memorizable: List<Recitation> get() = recitations.filter { it.memorize }

    val steps: List<Step> = listOf(
        Step(
            "intention", "Intention (Niyyat)", "نیت", "نِيَّة",
            "Do wudu, stand facing the Qiblah and make the intention in your heart for the prayer you are about to offer. " +
                "No fixed words are required: the intention is made in the heart, not with the tongue.",
            "وضو کریں، قبلہ رُخ کھڑے ہوں اور جو نماز پڑھنی ہے اُس کی دل میں نیت کریں۔ " +
                "کوئی خاص الفاظ ضروری نہیں: نیت دل سے ہوتی ہے، زبان سے نہیں۔",
            listOf("niyyat"),
            "Some people recite the verse below before starting; it is a beautiful verse, but not a required part of the prayer.",
            "بعض لوگ نماز شروع کرنے سے پہلے نیچے والی آیت پڑھتے ہیں؛ یہ خوبصورت آیت ہے مگر نماز کا لازمی حصہ نہیں۔",
        ),
        Step(
            "takbir", "Takbir-e-Tahrimah", "تکبیرِ تحریمہ", "تَكْبِيْرُ التَّحْرِيْمَة",
            "Raise both hands up to the earlobes and say \"Allahu Akbar\". The prayer has now begun.",
            "دونوں ہاتھ کانوں کی لو تک اٹھائیں اور \"اللہ اکبر\" کہیں۔ اب نماز شروع ہو گئی۔",
            listOf("takbir"),
            "Hands are raised only at this first Takbir, not at Ruku'.",
            "ہاتھ صرف اسی پہلی تکبیر پر اٹھائے جاتے ہیں، رکوع پر نہیں۔",
        ),
        Step(
            "qiyam", "Standing (Qiyam)", "قیام", "قِيَام",
            "Fold your hands on your chest, right hand over the left, and stand still with your eyes on the place of Sajdah. " +
                "Recite Thana and Ta'awwudh (first rak'ah only), then Bismillah, Surah Al-Fatihah and Amin.",
            "سینے پر ہاتھ باندھ لیں، دایاں ہاتھ بائیں ہاتھ کے اوپر، اور سجدے کی جگہ پر نظر رکھ کر سکون سے کھڑے ہوں۔ " +
                "ثناء اور تعوّذ (صرف پہلی رکعت میں) پڑھیں، پھر بسم اللہ، سورۃ الفاتحہ اور آمین۔",
            listOf("thana", "taawwudh", "tasmiya", "fatiha", "amin"),
            "The Salat book describes the hands folded on the chest, and says folding them a little below or above the navel is also a sign of respect.",
            "کتاب نماز میں سینے پر ہاتھ باندھنا بیان ہوا ہے، اور ناف سے کچھ نیچے یا اوپر باندھنا بھی ادب ہی کی علامت بتایا گیا ہے۔",
        ),
        Step(
            "surah", "Recite a surah", "سورت پڑھیں", "قِرَاءَة",
            "After Al-Fatihah, recite a surah or a few verses of the Quran, for example Surah Al-Ikhlas. " +
                "Do this in the first two rak'at of every prayer. In the 3rd and 4th rak'at of the fard, recite Al-Fatihah only.",
            "سورۃ الفاتحہ کے بعد قرآن کی کوئی سورت یا چند آیات پڑھیں، مثلاً سورۃ الاخلاص۔ " +
                "یہ ہر نماز کی پہلی دو رکعتوں میں کریں۔ فرض کی تیسری اور چوتھی رکعت میں صرف سورۃ الفاتحہ پڑھیں۔",
            emptyList(),
            "Learn the 30 surahs under \"Memorize surahs\" so you can change the surah from prayer to prayer.",
            "\"سورتیں یاد کریں\" میں 30 سورتیں یاد کریں تاکہ ہر نماز میں مختلف سورت پڑھ سکیں۔",
        ),
        Step(
            "ruku", "Bowing (Ruku')", "رکوع", "رُكُوْع",
            "Say \"Allahu Akbar\" and bow, with your hands on your knees and fingers spread, keeping your back straight.",
            "\"اللہ اکبر\" کہہ کر جھکیں، ہاتھ گھٹنوں پر رکھیں اور انگلیاں کھلی ہوں، کمر سیدھی رکھیں۔",
            listOf("takbir", "ruku"),
        ),
        Step(
            "qaumah", "Standing up (Qaumah)", "قومہ", "قَوْمَة",
            "Rise to standing with your arms hanging at your sides, saying \"Sami'allahu liman hamidah\", then " +
                "\"Rabbana wa lakal-hamd...\". Behind an Imam, say \"Rabbana wa lakal-hamd\" quietly.",
            "\"سمع اللہ لمن حمدہ\" کہتے ہوئے سیدھے کھڑے ہو جائیں، ہاتھ دونوں طرف لٹکے ہوں، پھر \"ربنا ولک الحمد...\" کہیں۔ " +
                "امام کے پیچھے \"ربنا ولک الحمد\" آہستہ کہیں۔",
            listOf("tasmi", "tahmid"),
        ),
        Step(
            "sajdah", "Prostration (Sajdah)", "سجدہ", "سَجْدَة",
            "Say \"Allahu Akbar\" and go down: knees on the ground, then the hands flat on the ground, then the forehead. " +
                "Keep your elbows raised off the ground.",
            "\"اللہ اکبر\" کہہ کر سجدے میں جائیں: پہلے گھٹنے زمین پر، پھر ہاتھ زمین پر، پھر پیشانی۔ " +
                "کہنیاں زمین سے اٹھی رہیں۔",
            listOf("takbir", "sajdah"),
        ),
        Step(
            "jalsah", "Sitting between Sajdahs (Jalsah)", "جلسہ", "جَلْسَة",
            "Say \"Allahu Akbar\" and sit up calmly with your hands on your thighs, and recite the prayer below.",
            "\"اللہ اکبر\" کہہ کر سکون سے بیٹھ جائیں، ہاتھ رانوں پر ہوں، اور نیچے والی دعا پڑھیں۔",
            listOf("takbir", "jalsah"),
        ),
        Step(
            "sajdah2", "Second Sajdah", "دوسرا سجدہ", "سَجْدَة",
            "Say \"Allahu Akbar\" and make the second Sajdah just like the first. This completes one rak'ah. " +
                "Then say \"Allahu Akbar\" and stand up for the next rak'ah.",
            "\"اللہ اکبر\" کہہ کر پہلے سجدے کی طرح دوسرا سجدہ کریں۔ یوں ایک رکعت پوری ہوئی۔ " +
                "پھر \"اللہ اکبر\" کہہ کر اگلی رکعت کے لیے کھڑے ہو جائیں۔",
            listOf("takbir", "sajdah"),
        ),
        Step(
            "rakah2", "The second rak'ah", "دوسری رکعت", "الرَّكْعَةُ الثَّانِيَة",
            "Pray the second rak'ah like the first, but without Thana and Ta'awwudh: start with Bismillah and Al-Fatihah, then a surah, " +
                "Ruku', Qaumah and the two Sajdahs. After the second Sajdah, stay sitting for the Tashahhud.",
            "دوسری رکعت پہلی کی طرح پڑھیں مگر ثناء اور تعوّذ کے بغیر: بسم اللہ اور سورۃ الفاتحہ سے شروع کریں، پھر سورت، " +
                "رکوع، قومہ اور دو سجدے۔ دوسرے سجدے کے بعد تشہد کے لیے بیٹھے رہیں۔",
        ),
        Step(
            "qadah", "Sitting (Qa'dah) and Tashahhud", "قعدہ اور تشہد", "قَعْدَة",
            "Sit with your hands on your thighs near the knees. Recite the Tashahhud. While saying \"Ash-hadu alla ilaha illallahu\", " +
                "raise the forefinger of your right hand, then lower it. In a prayer of 3 or 4 rak'at, after the Tashahhud of the " +
                "second rak'ah, say \"Allahu Akbar\" and stand up for the remaining rak'at (Al-Fatihah only in the fard).",
            "رانوں پر گھٹنوں کے قریب ہاتھ رکھ کر بیٹھیں اور تشہد پڑھیں۔ \"اشہد ان لا الہ الا اللہ\" کہتے ہوئے دائیں ہاتھ کی " +
                "شہادت کی انگلی اٹھائیں، پھر نیچے کر لیں۔ تین یا چار رکعت والی نماز میں دوسری رکعت کے تشہد کے بعد \"اللہ اکبر\" کہہ کر " +
                "باقی رکعتوں کے لیے کھڑے ہو جائیں (فرض میں صرف سورۃ الفاتحہ)۔",
            listOf("tashahhud"),
        ),
        Step(
            "final", "Last sitting: Durood and prayers", "آخری قعدہ: درود اور دعائیں", "الْقَعْدَةُ الْاَخِيْرَة",
            "In the last rak'ah, after the Tashahhud, recite the Durood and then these prayers from the Quran.",
            "آخری رکعت میں تشہد کے بعد درود شریف پڑھیں، پھر قرآن کی یہ دعائیں۔",
            listOf("durood", "rabbana_atina", "rabbij_alni", "rabbanaghfirli"),
        ),
        Step(
            "salam", "Ending the prayer (Salam)", "سلام", "تَسْلِيْم",
            "Turn your face to the right and say the Salam, then turn to the left and say it again. The prayer is complete.",
            "چہرہ دائیں طرف پھیر کر سلام کہیں، پھر بائیں طرف پھیر کر دوبارہ کہیں۔ نماز مکمل ہو گئی۔",
            listOf("salam"),
        ),
        Step(
            "witr", "Witr and Du'a-e-Qunut", "وتر اور دعائے قنوت", "وِتْر",
            "Witr has 3 rak'at, prayed after Isha. Sit for the Tashahhud after the 2nd rak'ah. In the 3rd rak'ah, after Ruku', " +
                "stand and recite Du'a-e-Qunut, then go into Sajdah and finish the prayer as usual.",
            "وتر کی تین رکعتیں ہیں جو عشاء کے بعد پڑھی جاتی ہیں۔ دوسری رکعت کے بعد تشہد کے لیے بیٹھیں۔ تیسری رکعت میں رکوع کے بعد " +
                "کھڑے ہو کر دعائے قنوت پڑھیں، پھر سجدے میں جائیں اور معمول کے مطابق نماز مکمل کریں۔",
            listOf("qunut"),
            "Qunut is a practice of the Holy Prophet (sa), not an obligation.",
            "قنوت آنحضرت صلی اللہ علیہ وسلم کی سنت ہے، فرض نہیں۔",
        ),
        Step(
            "after", "After the prayer", "نماز کے بعد", "ذِكْر",
            "Sit for a while remembering Allah, as the Holy Prophet (sa) did.",
            "کچھ دیر بیٹھ کر اللہ کا ذکر کریں، جیسے آنحضرت صلی اللہ علیہ وسلم کیا کرتے تھے۔",
            listOf("after_salam", "tasbih"),
        ),
    )

    val prayers: List<PrayerRakats> = listOf(
        PrayerRakats("Fajr", "فجر", listOf(Part("Sunnah", "سنت", 2), Part("Fard", "فرض", 2, fard = true))),
        PrayerRakats(
            "Zuhr", "ظہر",
            listOf(Part("Sunnah", "سنت", 4), Part("Fard", "فرض", 4, fard = true), Part("Sunnah", "سنت", 2)),
        ),
        PrayerRakats("Asr", "عصر", listOf(Part("Fard", "فرض", 4, fard = true))),
        PrayerRakats("Maghrib", "مغرب", listOf(Part("Fard", "فرض", 3, fard = true), Part("Sunnah", "سنت", 2))),
        PrayerRakats(
            "Isha", "عشاء",
            listOf(Part("Fard", "فرض", 4, fard = true), Part("Sunnah", "سنت", 2), Part("Witr", "وتر", 3)),
        ),
    )

    const val RAKAT_NOTE_EN =
        "Before the fard of Asr, 4 rak'at of nafl may be offered (optional). Witr (3 rak'at) is wajib and is prayed after Isha. " +
            "Tahajjud is a nafl prayer of 8 rak'at in the last part of the night."
    const val RAKAT_NOTE_UR =
        "عصر کے فرضوں سے پہلے چار رکعت نفل پڑھے جا سکتے ہیں (اختیاری)۔ وتر (تین رکعت) واجب ہیں اور عشاء کے بعد پڑھے جاتے ہیں۔ " +
            "تہجد رات کے آخری حصے میں آٹھ رکعت نفل نماز ہے۔"
}
