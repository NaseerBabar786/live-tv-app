package com.multichat.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import com.multichat.app.data.Lock
import com.multichat.app.data.Store
import com.multichat.app.ui.App
import com.multichat.app.ui.MultiChatTheme
import com.multichat.app.ui.UpdateViewModel
import com.multichat.app.web.Notifier
import com.multichat.app.web.WebPool
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity(), WebPool.Host {

    private val updates: UpdateViewModel by viewModels()

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var micRequest: PermissionRequest? = null

    /** An account a notification asked to open; the screen selects it. */
    private val _openAccount = MutableStateFlow<String?>(null)
    val openAccount: StateFlow<String?> = _openAccount.asStateFlow()

    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileCallback ?: return@registerForActivityResult
        fileCallback = null
        val data = result.data
        val uris: Array<Uri>? = when {
            result.resultCode != RESULT_OK || data == null -> null
            data.clipData != null -> {
                val clip = data.clipData!!
                Array(clip.itemCount) { clip.getItemAt(it).uri }
            }
            data.data != null -> arrayOf(data.data!!)
            else -> null
        }
        callback.onReceiveValue(uris)
    }

    private val askMic = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val request = micRequest ?: return@registerForActivityResult
        micRequest = null
        if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) else request.deny()
    }

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Store.init(this)
        Notifier.createChannels(this)
        WebPool.init(application)
        WebPool.host = this
        WebPool.attach(this)
        WebPool.setTextZoom(Store.settings.value.textZoom)

        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        handleIntent(intent)

        // While a PIN is set, chats never show in the recent-apps preview or in screenshots.
        lifecycleScope.launch {
            Store.settings.collect { s ->
                if (s.hasPin) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
        }

        setContent {
            MultiChatTheme {
                App(activity = this, updates = updates)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        Lock.onAppVisible()
        if (Store.settings.value.keepRunning && Store.accounts.value.isNotEmpty()) KeepAliveService.start(this)
    }

    override fun onStop() {
        super.onStop()
        Lock.onAppHidden()
        Notifier.onScreen = null
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onDestroy() {
        if (WebPool.host === this) WebPool.host = null
        WebPool.detach(this)
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        micRequest?.deny()
        micRequest = null
        super.onDestroy()
    }

    private fun handleIntent(intent: Intent?) {
        intent?.getStringExtra(Notifier.EXTRA_ACCOUNT)?.let { _openAccount.value = it }
    }

    fun accountOpened() {
        _openAccount.value = null
    }

    override fun chooseFiles(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        fileCallback?.onReceiveValue(null)
        fileCallback = callback
        val intent = params.createIntent()
        if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        return runCatching {
            Lock.openingOwnScreen()
            pickFiles.launch(intent)
        }.onFailure { fileCallback = null }.isSuccess
    }

    override fun requestMicrophone(request: PermissionRequest) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            return
        }
        micRequest?.deny()
        micRequest = request
        askMic.launch(Manifest.permission.RECORD_AUDIO)
    }

    fun canUseFingerprint(): Boolean =
        BiometricManager.from(this).canAuthenticate(BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS

    fun askFingerprint() {
        if (!canUseFingerprint()) return
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    Lock.unlock()
                }
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Multi Chat")
            .setNegativeButtonText("Use PIN")
            .setAllowedAuthenticators(BIOMETRIC_WEAK)
            .build()
        Lock.openingOwnScreen()
        runCatching { prompt.authenticate(info) }
    }
}
