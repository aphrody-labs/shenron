# Session d'enrichissement de contenu

`scripts/ops/run-content-session-pipeline.ts` enchaîne une session
d'enrichissement reprenable :

1. indexer dans `public.external_source_records` les bases de crawl BXC
   terminées (`BXC_STATE_DIR`) ;
2. matérialiser les enregistrements collectés en pages wiki attribuées et
   publier les actualités officielles sous forme de renvoi ;
3. rafraîchir, sur demande, les lecteurs média disponibles ;
4. mesurer depuis PostgreSQL la couverture des épisodes, films, tomes et
   databooks.

Chaque étape se rejoue séparément. Une source indisponible est rapportée comme
telle, jamais comme un contenu acquis, et n'efface aucun résultat antérieur.
L'état de la dernière session (sans secret ni corps de source) est écrit de
façon atomique dans `data/session-pipeline/latest.json`, fichier local ignoré
par Git.

```sh
bun scripts/ops/run-content-session-pipeline.ts                                # simulation
bun scripts/ops/run-content-session-pipeline.ts --apply                        # écriture
bun scripts/ops/run-content-session-pipeline.ts --apply --refresh-players      # + lecteurs
```

`DATABASE_URL` vient de l'environnement (ou, à défaut, de la dernière ligne
`DATABASE_URL=` du `.env` racine ou de celui du site). Une exécution périodique
sur un hôte relève d'`aphrody-infra` ([`INFRA-DELEGATION.md`](INFRA-DELEGATION.md)).
