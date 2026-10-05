package com.livetv.app.games

import kotlin.random.Random

/** One quiz question; the right answer is listed first and the four are shuffled when asked. */
class Question(val topic: String, val text: String, val right: String, vararg val wrong: String)

/**
 * Ten questions a round from general knowledge, cricket, geography, science and Islamic
 * knowledge. Points for each right answer, plus a bonus for answering quickly.
 */
class Quiz(private val rnd: Random = Random.Default) : Game() {
    val total = 10
    var number = 0
        private set
    var question: Question = QUESTIONS[0]
        private set
    var answers: List<String> = emptyList()
        private set
    var cursor = 0
        private set
    /** The answer picked, shown with the right one for a moment before the next question. */
    var picked = -1
        private set
    var right = 0
        private set
    var correct = 0
        private set
    /** Seconds × 10 left to answer. */
    var timeLeft = 150
        private set
    private var pause = 0
    private var round: List<Question> = emptyList()

    override val options = listOf("Everything", "General knowledge", "Cricket", "Geography", "Science", "Islamic knowledge")
    override val optionsTitle = "Pick a topic"
    override val tickMs = 100L
    override val status: String get() = "Question ${number + 1} of $total · Right $correct"

    override fun onBegin(choice: Int) {
        val pool = if (choice == 0) QUESTIONS else QUESTIONS.filter { it.topic == options[choice] }
        round = pool.shuffled(rnd).take(total)
        ask(0)
    }

    private fun ask(n: Int) {
        number = n
        question = round[n]
        answers = (listOf(question.right) + question.wrong.take(3)).shuffled(rnd)
        right = answers.indexOf(question.right)
        cursor = 0
        picked = -1
        timeLeft = 150
    }

    override fun press(p: Pad) {
        if (over || picked >= 0) return
        when (p) {
            Pad.Ok -> answer(cursor)
            else -> cursor = moveCursor(cursor, p, 2, 2)
        }
    }

    private fun answer(i: Int) {
        picked = i
        if (i == right) {
            correct++
            score += 100 + timeLeft / 3
        }
        pause = 18
    }

    override fun tick() {
        if (over) return
        if (picked >= 0 || timeLeft <= 0) {
            if (picked < 0) picked = 4
            if (--pause <= 0) {
                if (number + 1 >= round.size) finish("$correct of ${round.size} right! $score points", won = correct >= round.size / 2)
                else ask(number + 1)
            }
            return
        }
        timeLeft--
        if (timeLeft == 0) pause = 18
    }

    companion object {
        private const val GK = "General knowledge"
        private const val CR = "Cricket"
        private const val GEO = "Geography"
        private const val SCI = "Science"
        private const val ISL = "Islamic knowledge"

        val QUESTIONS = listOf(
            Question(GK, "How many days are there in a leap year?", "366", "365", "364", "360"),
            Question(GK, "How many minutes are in one hour?", "60", "100", "30", "90"),
            Question(GK, "Which colour do you get by mixing blue and yellow?", "Green", "Purple", "Orange", "Brown"),
            Question(GK, "How many sides does a hexagon have?", "6", "5", "7", "8"),
            Question(GK, "What is the national language of Pakistan?", "Urdu", "Punjabi", "Sindhi", "Pashto"),
            Question(GK, "Who is known as the founder of Pakistan?", "Muhammad Ali Jinnah", "Allama Iqbal", "Liaquat Ali Khan", "Sir Syed Ahmad Khan"),
            Question(GK, "Which poet is called the national poet of Pakistan?", "Allama Iqbal", "Faiz Ahmed Faiz", "Mirza Ghalib", "Ahmad Faraz"),
            Question(GK, "On which date is Pakistan's Independence Day?", "14 August", "23 March", "25 December", "15 August"),
            Question(GK, "On which date is Canada Day?", "1 July", "4 July", "1 June", "11 November"),
            Question(GK, "What is the currency of Pakistan?", "Rupee", "Taka", "Dirham", "Riyal"),
            Question(GK, "What is the currency of the United Kingdom?", "Pound sterling", "Euro", "Dollar", "Franc"),
            Question(GK, "Which leaf is on the flag of Canada?", "Maple", "Oak", "Palm", "Fern"),
            Question(GK, "How many players are there in a football team on the field?", "11", "10", "9", "12"),
            Question(GK, "Which month has the fewest days?", "February", "April", "June", "November"),
            Question(GK, "How many hours are there in a day?", "24", "12", "20", "48"),
            Question(GK, "What do bees make?", "Honey", "Milk", "Silk", "Wax only"),
            Question(GK, "Which is the largest animal in the world?", "Blue whale", "Elephant", "Giraffe", "Great white shark"),
            Question(GK, "Which is the fastest land animal?", "Cheetah", "Lion", "Horse", "Leopard"),
            Question(GK, "What is the national flower of Pakistan?", "Jasmine", "Rose", "Tulip", "Lotus"),
            Question(GK, "What is the national animal of Pakistan?", "Markhor", "Lion", "Snow leopard", "Camel"),
            Question(GK, "How many letters are in the English alphabet?", "26", "24", "28", "25"),
            Question(GK, "Which instrument has black and white keys?", "Piano", "Guitar", "Violin", "Flute"),
            Question(GK, "What is frozen water called?", "Ice", "Steam", "Fog", "Dew"),
            Question(GK, "Which shape has three sides?", "Triangle", "Square", "Circle", "Pentagon"),

            Question(CR, "Which country won the 1992 Cricket World Cup?", "Pakistan", "England", "India", "Australia"),
            Question(CR, "Who captained Pakistan to the 1992 World Cup win?", "Imran Khan", "Javed Miandad", "Wasim Akram", "Inzamam-ul-Haq"),
            Question(CR, "Which country won the first Cricket World Cup in 1975?", "West Indies", "Australia", "England", "India"),
            Question(CR, "Which country won the 1983 Cricket World Cup?", "India", "West Indies", "Pakistan", "Australia"),
            Question(CR, "Which country won the 2011 Cricket World Cup?", "India", "Sri Lanka", "Australia", "Pakistan"),
            Question(CR, "Which country won the 1996 Cricket World Cup?", "Sri Lanka", "Australia", "India", "Pakistan"),
            Question(CR, "Which country won the 2009 T20 World Cup?", "Pakistan", "Sri Lanka", "India", "England"),
            Question(CR, "Which country won the 2017 Champions Trophy?", "Pakistan", "India", "England", "Bangladesh"),
            Question(CR, "How many balls are there in an over?", "6", "5", "8", "10"),
            Question(CR, "How many players does a cricket team have on the field?", "11", "10", "12", "9"),
            Question(CR, "How many runs is a ball hit over the boundary without bouncing?", "6", "4", "5", "8"),
            Question(CR, "How many stumps are there at one end of the pitch?", "3", "2", "4", "1"),
            Question(CR, "Which player was nicknamed the 'Rawalpindi Express'?", "Shoaib Akhtar", "Waqar Younis", "Wasim Akram", "Mohammad Asif"),
            Question(CR, "Which batsman is called the 'Little Master'?", "Sachin Tendulkar", "Brian Lara", "Javed Miandad", "Virat Kohli"),
            Question(CR, "Which bowler is known as the 'Sultan of Swing'?", "Wasim Akram", "Imran Khan", "Shane Warne", "Glenn McGrath"),
            Question(CR, "How long is a cricket pitch between the stumps?", "22 yards", "20 yards", "25 yards", "18 yards"),
            Question(CR, "What is a batsman out for zero called?", "A duck", "A goose", "A zero", "A blank"),
            Question(CR, "Who scored 400 not out, the highest Test innings?", "Brian Lara", "Matthew Hayden", "Virender Sehwag", "Hanif Mohammad"),
            Question(CR, "Where is Lord's cricket ground?", "London", "Melbourne", "Lahore", "Mumbai"),
            Question(CR, "Which city is Gaddafi Stadium in?", "Lahore", "Karachi", "Rawalpindi", "Multan"),

            Question(GEO, "What is the capital of Pakistan?", "Islamabad", "Karachi", "Lahore", "Rawalpindi"),
            Question(GEO, "What is the capital of Canada?", "Ottawa", "Toronto", "Montreal", "Vancouver"),
            Question(GEO, "What is the capital of India?", "New Delhi", "Mumbai", "Kolkata", "Chennai"),
            Question(GEO, "What is the capital of Saudi Arabia?", "Riyadh", "Jeddah", "Makkah", "Madinah"),
            Question(GEO, "What is the capital of Turkey?", "Ankara", "Istanbul", "Izmir", "Bursa"),
            Question(GEO, "What is the capital of Australia?", "Canberra", "Sydney", "Melbourne", "Perth"),
            Question(GEO, "What is the capital of Bangladesh?", "Dhaka", "Chittagong", "Sylhet", "Khulna"),
            Question(GEO, "What is the capital of the United Arab Emirates?", "Abu Dhabi", "Dubai", "Sharjah", "Ajman"),
            Question(GEO, "Which is the highest mountain in the world?", "Mount Everest", "K2", "Nanga Parbat", "Kangchenjunga"),
            Question(GEO, "K2, the second highest mountain, is in which country?", "Pakistan", "Nepal", "India", "China only"),
            Question(GEO, "Which is the longest river in Pakistan?", "Indus", "Jhelum", "Chenab", "Ravi"),
            Question(GEO, "Which is the largest ocean?", "Pacific", "Atlantic", "Indian", "Arctic"),
            Question(GEO, "Which is the largest continent?", "Asia", "Africa", "Europe", "North America"),
            Question(GEO, "Which is the largest country by area?", "Russia", "Canada", "China", "United States"),
            Question(GEO, "Which is the largest city of Pakistan?", "Karachi", "Lahore", "Faisalabad", "Islamabad"),
            Question(GEO, "Which province of Pakistan is the largest by area?", "Balochistan", "Punjab", "Sindh", "Khyber Pakhtunkhwa"),
            Question(GEO, "Niagara Falls is on the border of Canada and which country?", "United States", "Mexico", "Greenland", "Cuba"),
            Question(GEO, "Which is the largest province of Canada by population?", "Ontario", "Quebec", "British Columbia", "Alberta"),
            Question(GEO, "Which desert is the largest hot desert in the world?", "Sahara", "Thar", "Gobi", "Kalahari"),
            Question(GEO, "The Thar desert is shared by Pakistan and which country?", "India", "Iran", "Afghanistan", "China"),
            Question(GEO, "Which river flows through Cairo?", "Nile", "Tigris", "Euphrates", "Jordan"),
            Question(GEO, "How many continents are there?", "7", "5", "6", "8"),

            Question(SCI, "Which planet is closest to the Sun?", "Mercury", "Venus", "Earth", "Mars"),
            Question(SCI, "Which planet is known as the Red Planet?", "Mars", "Jupiter", "Venus", "Saturn"),
            Question(SCI, "Which is the largest planet in our solar system?", "Jupiter", "Saturn", "Neptune", "Earth"),
            Question(SCI, "What gas do plants take in from the air?", "Carbon dioxide", "Oxygen", "Nitrogen", "Hydrogen"),
            Question(SCI, "What gas do we need to breathe to live?", "Oxygen", "Carbon dioxide", "Helium", "Nitrogen"),
            Question(SCI, "At what temperature does water boil at sea level?", "100 °C", "90 °C", "50 °C", "120 °C"),
            Question(SCI, "At what temperature does water freeze?", "0 °C", "10 °C", "-10 °C", "4 °C"),
            Question(SCI, "How many bones does an adult human have?", "206", "106", "306", "256"),
            Question(SCI, "Which organ pumps blood around the body?", "Heart", "Lungs", "Liver", "Kidneys"),
            Question(SCI, "What is H2O better known as?", "Water", "Salt", "Sugar", "Air"),
            Question(SCI, "What is the closest star to the Earth?", "The Sun", "Polaris", "Sirius", "Alpha Centauri"),
            Question(SCI, "What force pulls things down to the ground?", "Gravity", "Magnetism", "Friction", "Wind"),
            Question(SCI, "How many legs does a spider have?", "8", "6", "10", "4"),
            Question(SCI, "How many legs does an insect have?", "6", "8", "4", "10"),
            Question(SCI, "What do we call animals that eat only plants?", "Herbivores", "Carnivores", "Omnivores", "Predators"),
            Question(SCI, "What is the hardest natural material?", "Diamond", "Gold", "Iron", "Glass"),
            Question(SCI, "What does the Moon go around?", "The Earth", "The Sun", "Mars", "Jupiter"),
            Question(SCI, "Which part of the plant makes food using sunlight?", "Leaf", "Root", "Stem", "Flower"),
            Question(SCI, "What travels faster, light or sound?", "Light", "Sound", "Both the same", "Neither moves"),
            Question(SCI, "How many planets are in our solar system?", "8", "9", "7", "10"),

            Question(ISL, "How many daily prayers are there in Islam?", "5", "3", "4", "6"),
            Question(ISL, "How many surahs are in the Holy Quran?", "114", "100", "120", "99"),
            Question(ISL, "What is the first surah of the Quran?", "Al-Fatiha", "Al-Baqarah", "Al-Ikhlas", "Yaseen"),
            Question(ISL, "What is the longest surah of the Quran?", "Al-Baqarah", "Al-Imran", "An-Nisa", "Yaseen"),
            Question(ISL, "In which month do Muslims fast?", "Ramadan", "Shawwal", "Muharram", "Rajab"),
            Question(ISL, "Ramadan is which month of the Islamic calendar?", "9th", "1st", "10th", "12th"),
            Question(ISL, "Which Eid comes right after Ramadan?", "Eid al-Fitr", "Eid al-Adha", "Both", "Neither"),
            Question(ISL, "In which city is the Kaaba?", "Makkah", "Madinah", "Jerusalem", "Riyadh"),
            Question(ISL, "In which city is Masjid an-Nabawi?", "Madinah", "Makkah", "Taif", "Jeddah"),
            Question(ISL, "How many pillars of Islam are there?", "5", "4", "6", "7"),
            Question(ISL, "What is the pilgrimage to Makkah called?", "Hajj", "Zakat", "Sawm", "Salah"),
            Question(ISL, "What is the giving of a share of wealth to the poor called?", "Zakat", "Hajj", "Salah", "Shahada"),
            Question(ISL, "Which is the first month of the Islamic calendar?", "Muharram", "Ramadan", "Safar", "Rabi al-Awwal"),
            Question(ISL, "In which month is Hajj performed?", "Dhul Hijjah", "Ramadan", "Muharram", "Shawwal"),
            Question(ISL, "Which angel brought the revelation to the Prophet ﷺ?", "Jibreel (Gabriel)", "Mikaeel", "Israfeel", "Malik"),
            Question(ISL, "In which cave did the first revelation come?", "Cave of Hira", "Cave of Thawr", "Cave of Uhud", "Cave of Quba"),
            Question(ISL, "What is the call to prayer called?", "Adhan", "Iqamah", "Dua", "Takbeer"),
            Question(ISL, "Which direction do Muslims face in prayer?", "The Qibla (Kaaba)", "East", "North", "Jerusalem"),
            Question(ISL, "Which surah is called the heart of the Quran?", "Yaseen", "Al-Mulk", "Ar-Rahman", "Al-Kahf"),
            Question(ISL, "How many rakats are in the Fajr fard prayer?", "2", "3", "4", "1"),
            Question(ISL, "How many rakats are in the Maghrib fard prayer?", "3", "2", "4", "5"),
            Question(ISL, "What was the first mosque built in Islam?", "Masjid Quba", "Masjid al-Haram", "Masjid an-Nabawi", "Masjid al-Aqsa"),
            Question(ISL, "The migration from Makkah to Madinah is called?", "Hijrah", "Hajj", "Umrah", "Isra"),
        )
    }
}
