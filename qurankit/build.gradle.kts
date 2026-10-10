plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Iqra Quran's screens, Quran text, recitation and lessons. Used by the Iqra Quran app (:quran)
// and built into NextGen Cable (its Iqra Quran button), so both always have the same Quran section.
android {
    namespace = "com.iqraquran.kit"
    compileSdk = 36

    defaultConfig {
        // NextGen Cable still runs on Android 5, so this stays as low as NextGen Cable.
        minSdk = 21
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.media3.exoplayer)
    // Caches the recitation audio, so repeated ayahs (Hifz) and replays need no new download.
    implementation("androidx.media3:media3-datasource:${libs.versions.media3.get()}")
    implementation("androidx.media3:media3-database:${libs.versions.media3.get()}")
    implementation(libs.kotlinx.coroutines.android)
    testImplementation(libs.junit)
}
