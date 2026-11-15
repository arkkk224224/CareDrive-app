plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.caredrive.app"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.caredrive.app"
        minSdk = 28 // Pleos Connect 요구사항(API 28 이상)
        targetSdk = 34 // Pleos Connect Emulator 2.1.0 = API 34
        versionCode = 1
        versionName = "0.1.0"
    }

    // 릴리스 서명: -PkeystoreFile=... -PkeystorePass=... 를 주면 그 키로, 없으면 디버그 키로 서명한다.
    signingConfigs {
        if (project.hasProperty("keystoreFile")) {
            create("release") {
                storeFile = file(project.property("keystoreFile") as String)
                storePassword = project.property("keystorePass") as String
                keyAlias = "caredrive"
                keyPassword = project.property("keystorePass") as String
            }
        }
    }

    buildTypes {
        release {
            optimization {
                enable = false
            }
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    testImplementation(libs.junit)
}
