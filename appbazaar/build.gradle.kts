plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// App Bazaar: the apps.bulkbazaar.ca store as an app for phones and TVs. It reads the app list
// (apps.json) from the website, so apps added there show up here without a new version.
android {
    namespace = "com.appbazaar.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.naseerbabar.appbazaar"
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
    implementation(libs.coil.compose)
    implementation(libs.coil.network)
    implementation(libs.coil.svg)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
    // Real org.json for JVM unit tests (the Android one is a stub there).
    testImplementation(libs.org.json)
}
