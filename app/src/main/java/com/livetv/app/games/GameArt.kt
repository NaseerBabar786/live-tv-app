package com.livetv.app.games

import com.livetv.app.R

/**
 * The modern app-store style icon of each game on the Games menu (res/drawable-nodpi/game_<id>.webp, 256 px).
 * The sources (SVG) live in the project files under games/icons/svg. A game without one shows its emoji.
 */
fun gameArt(id: String): Int? = when (id) {
    "actitout" -> R.drawable.game_actitout
    "arrowescape" -> R.drawable.game_arrowescape
    "blockburst" -> R.drawable.game_blockburst
    "blockdrop" -> R.drawable.game_blockdrop
    "brickblast" -> R.drawable.game_brickblast
    "bubblebazaar" -> R.drawable.game_bubblebazaar
    "bullseye" -> R.drawable.game_bullseye
    "busrush" -> R.drawable.game_busrush
    "carrompro" -> R.drawable.game_carrompro
    "checkersplus" -> R.drawable.game_checkersplus
    "chessroyale" -> R.drawable.game_chessroyale
    "colorlink" -> R.drawable.game_colorlink
    "colorpour" -> R.drawable.game_colorpour
    "crazyeights" -> R.drawable.game_crazyeights
    "crownlogic" -> R.drawable.game_crownlogic
    "dicefive" -> R.drawable.game_dicefive
    "dominoes" -> R.drawable.game_dominoes
    "dotsboxes" -> R.drawable.game_dotsboxes
    "echopads" -> R.drawable.game_echopads
    "flipdisc" -> R.drawable.game_flipdisc
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
    "minigolf" -> R.drawable.game_minigolf
    "neonpong" -> R.drawable.game_neonpong
    "pebblepits" -> R.drawable.game_pebblepits
    "quizshow" -> R.drawable.game_quizshow
    "seabattle" -> R.drawable.game_seabattle
    "slide" -> R.drawable.game_slide
    "snakerush" -> R.drawable.game_snakerush
    "solitaireplus" -> R.drawable.game_solitaireplus
    "spades" -> R.drawable.game_spades
    "strikelanes" -> R.drawable.game_strikelanes
    "sudokuzen" -> R.drawable.game_sudokuzen
    "tambola" -> R.drawable.game_tambola
    "tictacglow" -> R.drawable.game_tictacglow
    "tiletrio" -> R.drawable.game_tiletrio
    "wordrescue" -> R.drawable.game_wordrescue
    "wordwheel" -> R.drawable.game_wordwheel
    else -> null
}
