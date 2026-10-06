plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Multi Chat: several WhatsApp Web accounts on one Android phone, each in its own WebView
// profile (separate cookies and storage). A separate app from Cable TV; it shares only the
// Gradle setup, library versions and signing key.
android {
    namespace = "com.multichat.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.naseerbabar.multichat"
        minSdk = 26
        targetSdk = 36
        versionCode = 5
        versionName = "1.0.4"
    }

    // Same shared signing key as Cable TV when CI has it, so updates install over the old app.
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
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.fragment.ktx)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
}
