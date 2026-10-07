plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.livetv.app"
    compileSdk = 36

    defaultConfig {
        minSdk = 21
        targetSdk = 36
        buildConfigField("boolean", "IS_MAX", "false")
    }

    // Three apps from one code base. Code and resources only one app uses live in
    // src/livetv, src/player or src/plus; each provides the Edition object the shared code calls.
    flavorDimensions += "edition"
    productFlavors {
        // Cable TV: built-in free channels, sponsor screen, self-updating APK from GitHub.
        create("livetv") {
            dimension = "edition"
            applicationId = "com.naseerbabar.livetv"
            versionCode = 208
            versionName = "1.9.70"
            // The TV sign-in client secret comes from the TV_CLIENT_SECRET repository secret,
            // so it stays out of the public code.
            buildConfigField("String", "TV_CLIENT_SECRET", "\"${System.getenv("TV_CLIENT_SECRET") ?: ""}\"")
        }
        // Stream Player Plus: the Google Play app. No channels of its own; viewers add playlists.
        create("player") {
            dimension = "edition"
            applicationId = "com.streamplayerplus.app"
            versionCode = 2
            versionName = "1.0.1"
        }
        // Live TV Plus: the Google Play edition of Cable TV. Cable TV's look and weather,
        // but like Stream Player Plus it has no channels; viewers add playlists.
        create("plus") {
            dimension = "edition"
            applicationId = "com.naseerbabar.livetvplus"
            versionCode = 5
            versionName = "1.3.0"
        }
        // Live TV Max: Cable TV's channels and code, opening on a streaming-style home screen
        // (rows by country and language, a now/next guide, movies and dramas). Installs beside Cable TV.
        create("max") {
            dimension = "edition"
            applicationId = "com.naseerbabar.livetvmax"
            versionCode = 2
            versionName = "1.0.1"
            buildConfigField("boolean", "IS_MAX", "true")
            buildConfigField("String", "TV_CLIENT_SECRET", "\"${System.getenv("TV_CLIENT_SECRET") ?: ""}\"")
        }
    }
    // The two store editions share their playlist settings screen.
    sourceSets {
        getByName("player").java.srcDir("src/store/java")
        getByName("plus").java.srcDir("src/store/java")
        // Live TV Max is built from Cable TV's own code and pictures, plus its icon in src/max.
        getByName("max") {
            java.srcDir("src/livetv/java")
            res.srcDir("src/livetv/res")
            assets.srcDir("src/livetv/assets")
        }
    }

    // CI signs every build with the same private key (from the SIGNING_KEYSTORE and
    // SIGNING_PASSWORD repository secrets) so a new version installs over the old one.
    // Without those secrets, builds fall back to the default debug key.
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
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.exoplayer.dash)
    implementation(libs.media3.ui)
    implementation(libs.coil.compose)
    implementation(libs.coil.network)
    implementation(libs.kotlinx.coroutines.android)
    // Cable TV sign-in: the Google account picker on phones (and TVs that support it).
    "livetvImplementation"("androidx.credentials:credentials:1.3.0")
    "livetvImplementation"("androidx.credentials:credentials-play-services-auth:1.3.0")
    "livetvImplementation"("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    "livetvImplementation"("com.google.zxing:core:3.5.3")
    "maxImplementation"("androidx.credentials:credentials:1.3.0")
    "maxImplementation"("androidx.credentials:credentials-play-services-auth:1.3.0")
    "maxImplementation"("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    "maxImplementation"("com.google.zxing:core:3.5.3")
    // Live TV Plus Premium: a Google Play subscription.
    "plusImplementation"("com.android.billingclient:billing-ktx:7.1.1")
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
    // Real org.json for JVM unit tests (the Android one is a stub there).
    testImplementation(libs.org.json)
}
