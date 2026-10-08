# Accès SSH via WireGuard

Cette procédure configure les accès du compte `omar` entre le VPS, dbfr et les
postes Windows. Le réseau SSH privé est `10.200.77.0/24` sur `wg1`.

## État au 8 octobre 2026

- VPS (`10.200.77.1`) et dbfr (`10.200.77.3`) : le compte `omar` existe,
  dispose de `sudo` sans mot de passe et son dossier `~/.ssh` est en mode
  `0700`.
- Les règles UFW autorisent TCP/22 depuis `10.200.77.0/24` sur `wg1`. Les règles
  SSH publiques existantes restent en place ; cette tâche ajoute l'accès tunnel.
- Le routage du VPS autorise aussi seulement TCP/22 de dbfr (`.3`) vers le PC
  Omar (`.10`), pour le bastion SSH du poste Shenron.
- Les clés ed25519 dédiées relient `omar` dans les deux sens :
  `omar_vps_to_dbfr` et `omar_dbfr_to_vps`. Leurs clés publiques sont dans
  `/etc/ssh/authorized_keys.d/omar` sur l'hôte cible, fichier root-owned lisible
  (`0644`), chemin effectif de `sshd` sur les deux machines.
- Les connexions VPS → dbfr et dbfr → VPS ont été validées par SSH en mode
  non interactif. Le poste Shenron utilise dbfr comme bastion, car WSL n'a pas
  de route directe vers le sous-réseau WireGuard.
- PC Aphrody (`10.200.77.4`) : le shell WSL courant n'est pas administrateur.
  Le script [`enable-windows-ssh.ps1`](../../scripts/dev/enable-windows-ssh.ps1)
  est prêt, mais n'a pas été exécuté ; OpenSSH Server n'a pas pu être interrogé
  sans élévation.
- La clé publique d'Omar et la confirmation de son pair WireGuard `.10` ne sont
  pas encore reçues. Ses accès sortants et l'accès vers son PC restent donc en
  attente.

## Aliases du poste Shenron

Les trois blocs sont déjà ajoutés au `~/.ssh/config` du poste Shenron. Ils
passent par dbfr comme bastion, la route directe WSL → WireGuard étant absente.
Les valeurs sont aussi décrites dans [`ssh-access.json`](../../config/ssh-access.json) :

```sshconfig
Host omar-pc
    HostName 10.200.77.10
    User omar
    Port 22
    IdentityFile ~/.ssh/omar_ed25519
    IdentitiesOnly yes
    ProxyJump dbfr

Host vps-wg
    HostName 10.200.77.1
    User omar
    Port 22
    IdentityFile ~/.ssh/omar_ed25519
    IdentitiesOnly yes
    ProxyJump dbfr

Host dbfr-wg
    HostName 10.200.77.3
    User omar
    Port 22
    IdentityFile ~/.ssh/omar_ed25519
    IdentitiesOnly yes
    ProxyJump dbfr
```

`omar-pc` ne répondra qu'une fois le serveur Windows, le pair WireGuard `.10`
et la clé autorisée installés.

## Activation OpenSSH sur Windows

Dans PowerShell lancé en administrateur, depuis la racine du dépôt :

```powershell
.\scripts\dev\enable-windows-ssh.ps1 -AuthorizedKey 'ssh-ed25519 AAAA... commentaire'
```

Le script installe OpenSSH Server, démarre `sshd` au démarrage, autorise la clé
publique donnée, désactive les règles entrantes TCP/22 plus larges et crée une
règle limitée aux sources `10.200.77.0/24`. Il ne modifie pas la configuration
WireGuard : le pair Windows doit déjà porter l'adresse `10.200.77.4` pour le
poste Aphrody, ou `.10` pour le PC d'Omar.

Si PowerShell n'est pas élevé, le script s'arrête avec l'instruction de le
relancer en administrateur. Il ne contourne pas l'UAC.

## Étape 12 à transmettre à Omar

Dans son salon Codex, demander à Omar de :

1. générer une clé dédiée `ssh-keygen -t ed25519 -f ~/.ssh/omar_shenron -C omar-shenron` ;
2. copier uniquement `~/.ssh/omar_shenron.pub` dans le salon, jamais la clé privée ;
3. activer OpenSSH sur son PC (pair WireGuard `.10`) avec le script du dépôt,
   en autorisant la clé publique Shenron transmise dans le salon ;
4. ajouter les aliases `vps` (`10.200.77.1`, utilisateur `omar`), `dbfr`
   (`10.200.77.3`, utilisateur `omar`) et `aphro-pc` (`10.200.77.4`, utilisateur
   `omara`) dans `~/.ssh/config`, avec sa clé `~/.ssh/omar_shenron` :

   ```sshconfig
   Host vps
       HostName 10.200.77.1
       User omar
       IdentityFile ~/.ssh/omar_shenron
       IdentitiesOnly yes

   Host dbfr
       HostName 10.200.77.3
       User omar
       IdentityFile ~/.ssh/omar_shenron
       IdentitiesOnly yes

   Host aphro-pc
       HostName 10.200.77.4
       User omara
       IdentityFile ~/.ssh/omar_shenron
       IdentitiesOnly yes
   ```
5. communiquer l'adresse tunnel exacte de son PC et confirmer que son pare-feu
   Windows n'accepte TCP/22 que depuis `10.200.77.0/24`.

Clé publique Shenron à autoriser sur le PC d'Omar :

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJvmGjMWPLFJZWsACxRqCC0Ll+uXvnyunYdPG4E8jS4V windows-aphro
```

Quand sa clé publique arrive, l'ajouter au fichier effectif
`/etc/ssh/authorized_keys.d/omar` sur le VPS et dbfr, en gardant son mode
`0644`, puis autoriser la clé de ce PC dans Windows. Si elle n'est pas encore
arrivée, garder l'installation différée et ne créer aucune clé à sa place. Une
fois reçue, l'installation distante se fait avec
`bun scripts/dev/install-omar-public-key.ts '<clé publique>'` ; la clé ajoutée
sur le PC Windows s'installe en relançant `enable-windows-ssh.ps1` avec cette
clé, depuis PowerShell administrateur.

## Chantiers qui restent ouverts

- La release des téléchargements.
- L'unification de la stack (VNC, computer use et capacités associées).
- Le conteneur de build sur le VPS.

## Vérifications

```sh
ssh -o BatchMode=yes omar-pc true
ssh -o BatchMode=yes vps-wg true
ssh -o BatchMode=yes dbfr-wg true
```

Les deux hôtes Linux sont aussi à tester dans les deux sens depuis les comptes
`omar` : `ssh dbfr-wg true` depuis le VPS et `ssh vps-wg true` depuis dbfr.
