# Synchronisation du plugin

Le paquet installé reste autonome. Ces commandes concernent le mainteneur
disposant du checkout Shenron et du runtime Bun d'Aphrody.

```sh
bun scripts/plugin/sync.ts --check
bun scripts/plugin/sync.ts
bun scripts/plugin/sync.ts --sources-depuis HEAD
```

Le script lance les générateurs canoniques `agy-manifest.ts` et
`build-references.ts`, puis aligne la version OpenAI sur le manifeste Claude,
l'URL MCP publique sur la configuration Shenron et `source-of-truth.json` sur
les pages embarquées. Il préserve les cas de revue et les autres métadonnées.
Une seconde synchronisation sans changement de sources n'écrit rien.
`--check` signale une dérive avec un code non nul sans modifier de fichier.

`--sources-depuis REV` fixe les sources lues par le générateur de références ;
les autres manifestes restent issus des fichiers courants. Les références
générées portent les empreintes, dates et révisions de leurs sources.
Ne pas les corriger à la main ; lire leur registre avant de citer un fait.

Cette commande ne configure aucun compte GitHub, SSH, Cloudflare ou OVH et
ne committe ni ne pousse. L'Infra Aphrody conserve la responsabilité des
authentifications, du DNS et du CDN. Une configuration ne prouve pas un accès.

Les noms MCP de protocole sont `dragonball.*`, par exemple
`dragonball.rag_search`. Un client peut présenter des noms normalisés différents.
Vérifier le catalogue connecté avant appel. Le serveur public filtre les outils
privés ; sa connexion ne donne aucun droit d'écriture.

A2A reste distinct : le client Shenron de coordination durable utilise le service
Aphrody configuré par `APHRODY_A2A_COORD_API`. L'absence de cette configuration
est une erreur en production, sans substitution silencieuse d'une boîte locale.
Une synchronisation du plugin ne prouve pas l'exécution d'une tâche distante.
