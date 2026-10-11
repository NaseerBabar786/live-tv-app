plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Spark Weather: Cable TV's Weather section as its own free app, for phones and TVs.
// The weather screens are not copied: they are taken from Cable TV's own source files (app/src/main) at
// build time, so both apps always show the same weather. This module only adds the app around them
// (start screen, settings, home-screen widget, morning forecast, updates and crash rollback).
android {
    namespace = "com.sparkweather.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.naseerbabar.sparkweather"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
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
        buildConfig = true
    }
    sourceSets["main"].java.srcDir("build/weatherShared/java")
    sourceSets["main"].assets.srcDir("build/weatherShared/assets")
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// Cable TV's weather files this app is built from (see the note at the top).
val weatherShared = tasks.register<Sync>("weatherShared") {
    from(rootProject.file("app/src/main")) {
        include(
            "java/com/livetv/app/data/Weather.kt",
            "java/com/livetv/app/data/WeatherApp.kt",
            "java/com/livetv/app/data/Location.kt",
            "java/com/livetv/app/ui/WeatherScreen.kt",
            "java/com/livetv/app/ui/WeatherArt.kt",
            "java/com/livetv/app/ui/AppThemes.kt",
            "java/com/livetv/app/ui/Focus.kt",
            "java/com/livetv/app/ui/DeviceLocation.kt",
            "java/com/livetv/app/ui/Touch.kt",
            "assets/weather/**",
        )
    }
    into(layout.projectDirectory.dir("build/weatherShared"))
}
tasks.named("preBuild") { dependsOn(weatherShared) }

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
    implementation(libs.coil.compose)
    implementation(libs.coil.network)
    implementation(libs.kotlinx.coroutines.android)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
}
