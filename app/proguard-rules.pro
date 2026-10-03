# Media3 and Compose ship their own consumer rules.

# Credential Manager finds its Play services provider by reflection.
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** {
  *;
}
