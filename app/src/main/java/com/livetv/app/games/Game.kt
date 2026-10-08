package com.livetv.app.games

/** The TV remote's buttons a game listens to. [Hold] is OK held down (Mines uses it to plant a flag). */
enum class Pad { Up, Down, Left, Right, Ok, Hold }

data class Cell(val x: Int, val y: Int)

/** How a game's record is kept on the Games menu. */
enum class Scoring {
    /** The highest score. */
    Best,

    /** The fewest moves in a won game. */
    Fewest,

    /** How many games were won. */
    Wins,
}

/**
 * One game's rules, kept free of Android so they can be tested. The screen sends it button
 * presses and, every [tickMs], a [tick]; then it draws whatever the game now holds.
 */
abstract class Game {
    /** How often [tick] runs; 0 for games that only move when a button is pressed. */
    open val tickMs: Long = 0

    /** Held buttons repeat (moving a block along, sliding a paddle). */
    open val repeats: Boolean = false

    /** A held arrow keeps moving the cursor (board games with a cursor to move a long way). */
    open val cursorRepeats: Boolean = false

    /** OK held down sends [Pad.Hold] instead of [Pad.Ok]. */
    open val usesHold: Boolean = false

    var score = 0
        protected set
    var over = false
        protected set
    var won = false
        protected set

    /** Shown when the game is over: "You win!", "Boom!". */
    var message: String = "Game over"
        protected set

    /** A line under the score: lives, level, the computer's points. */
    open val status: String = ""

    /** Choices shown before the game starts (players, difficulty); none starts straight away. */
    open val options: List<String> = emptyList()
    open val optionsTitle: String = ""
    var choice = 0
    var started = false
        private set

    /** Past the opening choices, so buttons and ticks go to the game itself. */
    val ready: Boolean get() = options.isEmpty() || started

    /** Ticks that think hard (the TV's chess move) and run away from the screen's thread. */
    open val heavy: Boolean = false

    /** The number buttons (Sudoku). */
    open val usesDigits: Boolean = false
    open fun digit(d: Int) {}

    fun begin() {
        started = true
        onBegin(choice)
    }

    protected open fun onBegin(choice: Int) {}

    open fun press(p: Pad) {}
    open fun release(p: Pad) {}
    open fun tick() {}

    protected fun finish(message: String, won: Boolean = false) {
        over = true
        this.message = message
        this.won = won
    }
}

/** One game on the Games menu. */
class GameInfo(
    val id: String,
    val name: String,
    val icon: String,
    val help: String,
    val scoring: Scoring,
    val create: () -> Game,
)

/** Every classic game's rules; the tests play them all. [GAMES] is what the menu still shows. */
val CLASSIC_GAMES = listOf(
    GameInfo("snake", "Snake", "🐍", "Arrows steer. Eat the red food to grow. Don't hit a wall or your tail.", Scoring.Best) { Snake() },
    GameInfo("blocks", "Falling Blocks", "🟦", "Left and Right move, Up turns, Down drops faster, OK drops straight down. Fill a row to clear it.", Scoring.Best) { Blocks() },
    GameInfo("bricks", "Brick Breaker", "🧱", "Left and Right move the paddle. OK launches the ball. Break every brick.", Scoring.Best) { BrickBreaker() },
    GameInfo("space", "Space Defender", "🚀", "Left and Right move, OK fires. Stop the invaders before they land.", Scoring.Best) { SpaceDefender() },
    GameInfo("paddle", "Paddle Ball", "🏓", "Up and Down move your paddle on the left. First to 7 points wins.", Scoring.Wins) { PaddleBall() },
    GameInfo("2048", "2048", "🔢", "Arrows slide all tiles. Two equal tiles join into one. Reach 2048!", Scoring.Best) { Game2048() },
    GameInfo("tictactoe", "Tic-Tac-Toe", "❌", "Arrows pick a square, OK places your X. Get three in a row before the TV.", Scoring.Wins) { TicTacToe() },
    GameInfo("four", "Four in a Row", "🔴", "Left and Right pick a column, OK drops your red disc. Line up four.", Scoring.Wins) { FourInRow() },
    GameInfo("mines", "Mines", "💣", "Arrows move, OK opens a square, hold OK to plant a flag. Numbers count the mines around.", Scoring.Wins) { Mines() },
    GameInfo("memory", "Memory Cards", "🃏", "Arrows move, OK flips a card. Find all the matching pairs.", Scoring.Fewest) { Memory() },
    GameInfo("slide", "Slide Puzzle", "🧩", "Arrows slide a tile into the gap. Put 1 to 15 in order.", Scoring.Fewest) { SlidePuzzle() },
    GameInfo("echo", "Color Echo", "🎨", "Watch the colours light up, then repeat them with the arrows.", Scoring.Best) { ColorEcho() },
    GameInfo("ludo", "Ludo", "🎲", "OK rolls the dice. Left and Right pick a piece, OK moves it. A 6 brings a piece out and rolls again. Get all four home.", Scoring.Wins) { Ludo() },
    GameInfo("cricket", "Cricket", "🏏", "Press OK to swing as the ball reaches the yellow zone. Perfect timing hits a six. Chase the target before the overs or wickets run out.", Scoring.Best) { Cricket() },
    GameInfo("snakes", "Snakes & Ladders", "🪜", "OK rolls the dice. Ladders take you up, snakes bring you down. First to 100 wins.", Scoring.Wins) { SnakesLadders() },
    GameInfo("chess", "Chess", "♟️", "Arrows move, OK picks a piece and OK again moves it to a highlighted square.", Scoring.Wins) { Chess() },
    GameInfo("quiz", "Quiz Time", "❓", "Arrows pick an answer, OK locks it in. Answer fast for bonus points. 10 questions a round.", Scoring.Best) { Quiz() },
    GameInfo("sudoku", "Sudoku", "🔢", "Arrows move. Number buttons fill a square (0 clears), or OK counts up 1 to 9. Every row, column and box needs 1 to 9 once.", Scoring.Wins) { Sudoku() },
    GameInfo("solitaire", "Solitaire", "🂡", "Arrows move, OK picks up cards and OK again puts them down. OK twice on a card sends it home. OK on the deck turns a card.", Scoring.Wins) { Solitaire() },
    GameInfo("race", "Car Race", "🏎️", "Left and Right change lanes. Dodge the traffic; it gets faster.", Scoring.Best) { CarRace() },
    GameInfo("maze", "Maze Muncher", "👾", "Arrows steer. Eat every dot and keep away from the ghosts. A big dot lets you chase them.", Scoring.Best) { MazeMuncher() },
    GameInfo("checkers", "Checkers", "⚫", "Arrows move, OK picks a piece and OK again moves it. Jump over the TV's pieces to take them; reach the far side to crown a king.", Scoring.Wins) { Checkers() },
    GameInfo("words", "Word Guess", "🔤", "Guess the hidden word one letter at a time. Arrows pick a letter, OK tries it. Seven wrong guesses and the round is lost.", Scoring.Best) { WordGuess() },
    GameInfo("carrom", "Carrom", "⚪", "Left and Right move the striker, Up and Down aim. Hold OK to build power, let go to shoot. Pocket every coin in as few shots as you can.", Scoring.Fewest) { Carrom() },
)

/**
 * Classic games that left the menu (1.10.22): the modern remakes in [WEB_GAMES] took their place,
 * and the owner took 2048 and Cricket off. Solitaire left in 1.10.28 for the new card-table Solitaire.
 */
private val RETIRED = setOf(
    "snake", "2048", "blocks", "bricks", "space", "paddle", "tictactoe", "four", "mines", "memory", "echo",
    "ludo", "cricket", "snakes", "chess", "quiz", "sudoku", "race", "maze", "checkers", "words", "carrom",
    "solitaire",
)

val GAMES = CLASSIC_GAMES.filter { it.id !in RETIRED }

/**
 * One of the modern games (1.10.x): drawn by a page in assets/games with smooth animation, effects and
 * sound, played with the remote, touch or a mouse. The PC app opens the same pages.
 * The page reports its record (best score, highest level done) and [label] shows it on the menu.
 */
class WebGameInfo(
    val id: String,
    val name: String,
    val icon: String,
    val page: String,
    /** True when a lower record is better (Carrom: fewest shots). */
    val fewest: Boolean = false,
    val label: (Int) -> String,
)

val WEB_GAMES = listOf(
    WebGameInfo("bubblebazaar", "Bubble Bazaar", "🔮", "bubblebazaar.html") { "Level $it done" },
    WebGameInfo("solitaireplus", "Solitaire", "🂡", "solitaire.html") { "Wins: $it" },
    WebGameInfo("spades", "Spades", "♠️", "spades.html") { "Wins: $it" },
    WebGameInfo("snakerush", "Snake Rush", "🐍", "snakerush.html") { "Best: $it" },
    WebGameInfo("blockburst", "Block Burst", "💥", "blockburst.html") { "Best: $it" },
    WebGameInfo("colorpour", "Color Pour", "🧪", "colorpour.html") { "Level $it done" },
    WebGameInfo("gemswap", "Gem Swap", "💎", "gemswap.html") { "Level $it done" },
    WebGameInfo("mergedrop", "Merge Drop", "🪐", "mergedrop.html") { "Best: $it" },
    WebGameInfo("jademahjong", "Jade Mahjong", "🀄", "jademahjong.html") { "Level $it done" },
    WebGameInfo("tiletrio", "Tile Trio", "🍀", "tiletrio.html") { "Level $it done" },
    WebGameInfo("hexstack", "Hex Stack", "🍯", "hexstack.html") { "Best: $it" },
    WebGameInfo("busrush", "Bus Rush", "🚌", "busrush.html") { "Level $it done" },
    WebGameInfo("arrowescape", "Arrow Escape", "🏹", "arrowescape.html") { "Level $it done" },
    WebGameInfo("wordwheel", "Word Wheel", "🔤", "wordwheel.html") { "Level $it done" },
    WebGameInfo("colorlink", "Color Link", "🔗", "colorlink.html") { "Level $it done" },
    WebGameInfo("crownlogic", "Crown Logic", "👑", "crownlogic.html") { "Level $it done" },
    WebGameInfo("blockdrop", "Block Drop", "🟦", "blockdrop.html") { "Best: $it" },
    WebGameInfo("brickblast", "Brick Blast", "🧱", "brickblast.html") { "Best: $it" },
    WebGameInfo("galaxyguard", "Galaxy Guard", "🚀", "galaxyguard.html") { "Best: $it" },
    WebGameInfo("neonpong", "Neon Pong", "🏓", "neonpong.html") { "Wins: $it" },
    WebGameInfo("highwayrush", "Highway Rush", "🏎️", "highwayrush.html") { "Best: $it" },
    WebGameInfo("mazemunch", "Maze Munch", "👾", "mazemunch.html") { "Best: $it" },
    WebGameInfo("gemmines", "Mine Field", "💣", "gemmines.html") { "Wins: $it" },
    WebGameInfo("memorymatch", "Memory Match", "🃏", "memorymatch.html") { "Level $it done" },
    WebGameInfo("echopads", "Echo Pads", "🎨", "echopads.html") { "Best: $it" },
    WebGameInfo("sudokuzen", "Sudoku Zen", "🔢", "sudokuzen.html") { "Wins: $it" },
    WebGameInfo("wordrescue", "Word Rescue", "🔤", "wordrescue.html") { "Best: $it" },
    WebGameInfo("chessroyale", "Chess", "♟️", "chessroyale.html") { "Wins: $it" },
    WebGameInfo("ludostar", "Ludo Star", "🎲", "ludostar.html") { "Wins: $it" },
    WebGameInfo("checkersplus", "Checkers", "⚫", "checkersplus.html") { "Wins: $it" },
    WebGameInfo("carrompro", "Carrom", "⚪", "carrompro.html", fewest = true) { "Best: $it shots" },
    WebGameInfo("quizshow", "Quiz Show", "❓", "quizshow.html") { "Best: $it" },
    WebGameInfo("laddersnakes", "Snakes & Ladders", "🪜", "laddersnakes.html") { "Wins: $it" },
    WebGameInfo("fourdrop", "Four Drop", "🔴", "fourdrop.html") { "Wins: $it" },
    WebGameInfo("tictacglow", "Tic-Tac-Toe Glow", "❌", "tictacglow.html") { "Wins: $it" },
)
