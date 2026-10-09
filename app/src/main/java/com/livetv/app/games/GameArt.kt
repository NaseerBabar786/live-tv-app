package com.livetv.app.games

import com.livetv.app.R

/**
 * The modern app-store style icon of each game on the Games menu (res/drawable-nodpi/game_<id>.webp, 256 px).
 * The sources (SVG) live in the project files under games/icons/svg. A game without one shows its emoji.
 */
fun gameArt(id: String): Int? = when (id) {
    "arrowescape" -> R.drawable.game_arrowescape
    "blockburst" -> R.drawable.game_blockburst
    "blockdrop" -> R.drawable.game_blockdrop
    "brickblast" -> R.drawable.game_brickblast
    "bubblebazaar" -> R.drawable.game_bubblebazaar
    "busrush" -> R.drawable.game_busrush
    "carrompro" -> R.drawable.game_carrompro
    "checkersplus" -> R.drawable.game_checkersplus
    "chessroyale" -> R.drawable.game_chessroyale
    "colorlink" -> R.drawable.game_colorlink
    "colorpour" -> R.drawable.game_colorpour
    "crownlogic" -> R.drawable.game_crownlogic
    "echopads" -> R.drawable.game_echopads
    "fourdrop" -> R.drawable.game_fourdrop
    "galaxyguard" -> R.drawable.game_galaxyguard
    "gemmines" -> R.drawable.game_gemmines
    "gemswap" -> R.drawable.game_gemswap
    "hexstack" -> R.drawable.game_hexstack
    "highwayrush" -> R.drawable.game_highwayrush
    "jademahjong" -> R.drawable.game_jademahjong
    "laddersnakes" -> R.drawable.game_laddersnakes
    "ludostar" -> R.drawable.game_ludostar
    "mazemunch" -> R.drawable.game_mazemunch
    "memorymatch" -> R.drawable.game_memorymatch
    "mergedrop" -> R.drawable.game_mergedrop
    "neonpong" -> R.drawable.game_neonpong
    "quizshow" -> R.drawable.game_quizshow
    "slide" -> R.drawable.game_slide
    "snakerush" -> R.drawable.game_snakerush
    "solitaireplus" -> R.drawable.game_solitaireplus
    "spades" -> R.drawable.game_spades
    "sudokuzen" -> R.drawable.game_sudokuzen
    "tictacglow" -> R.drawable.game_tictacglow
    "tiletrio" -> R.drawable.game_tiletrio
    "wordrescue" -> R.drawable.game_wordrescue
    "wordwheel" -> R.drawable.game_wordwheel
    else -> null
}
