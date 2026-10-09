plugins {
  kotlin("jvm") version "2.2.0"
  kotlin("plugin.compose") version "2.2.0"
  id("org.jetbrains.compose") version "1.8.2"
}
repositories { google(); mavenCentral() }
configurations.matching { it.name.startsWith("compile") }.all { listOf("androidx.lifecycle","androidx.annotation","androidx.collection","androidx.arch.core").forEach { exclude(group = it) } }
dependencies {
  implementation(compose.desktop.currentOs)
  implementation(compose.material3)
  implementation(compose.materialIconsExtended)
  implementation("org.json:json:20240303")
  compileOnly("org.robolectric:android-all:14-robolectric-10818077")
}
val sync by tasks.registering(Copy::class) {
  from("../app/src/main/java/com/livetv/app") {
    include("data/WeatherApp.kt", "data/Weather.kt", "ui/WeatherScreen.kt", "ui/AppThemes.kt", "ui/Focus.kt", "ui/WeatherArt.kt")
    filter { it.replace(", decorFitsSystemWindows = false", "").replace("private fun HomeTab(", "internal fun HomeTab(").replace("private enum class Tab(", "internal enum class Tab(").replace("private val SkyBottom", "internal val SkyBottom").replace("Radar(r.place, mini = true,", "RadarStub(r.place, mini = true,") }
  }
  into("build/gen")
}
sourceSets { main { kotlin.srcDirs("build/gen", "stubs") } }
tasks.named("compileKotlin") { dependsOn(sync) }

compose.desktop { application { mainClass = "com.livetv.app.ui.RenderKt" } }
