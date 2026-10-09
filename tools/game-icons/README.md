# Games menu icons

`svg/<id>.svg` (512x512) is the source of each game's icon. To change one: edit the SVG, then

    NODE_PATH=$(npm root -g) node tools/game-icons/render.js <id>   # -> tools/game-icons/png/<id>.png

and save it as `app/src/main/res/drawable-nodpi/game_<id>.webp` at 256x256. A new game also needs a line in
`app/src/main/java/com/livetv/app/games/GameArt.kt`. Fonts: Fredoka and Outfit (SIL Open Font License).
