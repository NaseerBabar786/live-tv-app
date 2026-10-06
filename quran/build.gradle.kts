plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Iqra Quran: learn to read the Quran (kids' Qaida), read it with audio, and memorize it (Hifz).
// A separate app from Live TV; it shares only the Gradle setup and library versions.
android {
    namespace = "com.iqraquran.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.naseerbabar.iqraquran"
        minSdk = 26
        targetSdk = 36
        versionCode = 7
        versionName = "1.3.3"
    }

    // Same shared signing key as Live TV when CI has it, so updates install over the old app.
    val keystorePath = System.getenv("SIGNING_KEYSTORE_FILE")
    val keystorePassword = System.getenv("SIGNING_PASSWORD")
    val shared = if (keystorePath != null && keystorePassword != null && file(keystorePath).exists()) {
        signingConfigs.create("shared") {
            storeFile = file(keystorePath)
            storePassword = keystorePassword
            keyAlias = System.getenv("SIGNING_KEY_ALIAS") ?: "livetv"
            keyPassword = keystorePassword
        }
    } else {
        null
    }

    buildTypes {
        debug {
            if (shared != null) signingConfig = shared
        }
        release {
            if (shared != null) signingConfig = shared
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
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
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.media3.exoplayer)
    // Caches the recitation audio, so repeated ayahs (Hifz) and replays need no new download.
    implementation("androidx.media3:media3-datasource:${libs.versions.media3.get()}")
    implementation("androidx.media3:media3-database:${libs.versions.media3.get()}")
    implementation(libs.kotlinx.coroutines.android)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
}
