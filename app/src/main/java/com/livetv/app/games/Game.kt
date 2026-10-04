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

val GAMES = listOf(
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
)
