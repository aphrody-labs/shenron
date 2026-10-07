<!-- SPDX-License-Identifier: Apache-2.0 -->

# Environnement Android Shenron

L'image `shenron/android-builder:local` réunit Rust 1.98.1, les cibles Android Rust,
OpenJDK 17, Android SDK Platform 37.2, Build Tools 37.0.0, NDK 30.0.16248370 et CMake.
Les outils de ligne de commande Android sont épinglés au build `15859902` et vérifiés par
SHA-256 à partir de la somme publiée par Android Developers.

Depuis la racine du dépôt :

```sh
docker build -t shenron/android-builder:local -f deploy/docker/android/Dockerfile .
docker run --rm -it -v "$PWD:/workspace" shenron/android-builder:local
```

Sur Windows, le script `scripts/dev/setup-android-windows.ps1` installe les mêmes outils
Android dans `%LOCALAPPDATA%\Android\Sdk`, Apktool dans
`%LOCALAPPDATA%\Programs\ShenronRE\bin` et SteamCMD dans
`%LOCALAPPDATA%\Programs\ShenronRE\SteamCMD`. Il laisse les installations et variables
d'environnement dans le profil de l'utilisateur courant. `-SkipEmulatorImage` évite le
téléchargement de l'image x86_64 Play Store (plusieurs gigaoctets).

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev/setup-android-windows.ps1
```

L'image Android est un environnement de compilation et de désassemblage. Elle n'émule pas
Android dans le navigateur et ne transforme pas à elle seule des APK propriétaires en jeux
WebAssembly.
