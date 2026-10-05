# Lots OCR — commandes du dépôt (mainteneurs, facultatif)

> **Ne s'applique que si** le dépôt Shenron est le répertoire de travail. La skill
> n'en a pas besoin : elle lit l'image fournie et livre le JSONL. Sans dépôt, ne
> lancer aucune commande d'ici ; le dépôt d'un lot passe par
> [l'administration](../../shenron-admin/SKILL.md).

Depuis la racine Shenron, après vérification de l'aide et du périmètre :

```bash
bun apps/site/scripts/export-databooks-ocr.ts --sortie /chemin/lots --taille 4
bun apps/site/scripts/planches-a-relire.ts --classe remplacement --limite 4 --json
bun apps/site/scripts/databooks.ts verifie /chemin/resultats.jsonl
bun apps/site/scripts/databooks.ts depose /chemin/lot --simulation
```

Fournir l'image locale ou jointe au lecteur, pas seulement une URL ou le nom du
fichier. Revoir la concordance au scan et les erreurs du juge. Pour une écriture
couverte par la demande, `databooks.ts depose /chemin/lot` résout le secret par
le mécanisme propriétaire ; ne pas le distribuer aux sous-agents. Le dépôt
Shenron crée les révisions réversibles et conserve ses gardes qualité.

Étalonner un lecteur contre des références relues :

```bash
bun apps/site/scripts/export-databooks-benchmark.ts --sortie /tmp/dbfr-benchmark --taille 64
bun apps/site/scripts/score-databooks-ocr.ts /tmp/dbfr-benchmark/benchmark.jsonl /chemin/resultats.jsonl
```

Les compteurs évoluent : `databooks.ts etat` mesure l'état courant ;
`databooks.ts sante` mesure l'intégrité. Ces commandes ont été vérifiées dans
les sources locales le 2026-10-04 ; aucun dépôt ni appel de production réalisé
par la révision du plugin.
