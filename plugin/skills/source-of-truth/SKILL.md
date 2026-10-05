---
name: source-of-truth
description: "Vérifie de quelle révision du dépôt Shenron viennent les instantanés embarqués du plugin avant de s'y fier, et signale toute dérive entre l'instantané, le code et les sources vivantes."
---

# Source de vérité du plugin

Le plugin voyage seul : ce qu'il sait du dépôt Shenron est copié dans des
**instantanés générés**, jamais rédigés à la main. Leur registre,
[`references/instantane.json`](../../references/instantane.json), donne pour chaque
fichier généré la révision Git et la date de ses sources, et l'empreinte SHA-256 des
sources et de la sortie. Chaque fichier généré le rappelle dans son en-tête
(« Généré par scripts/plugin/build-references.ts — ne pas éditer »).

Avant de citer un instantané :

1. lire sa révision et sa date dans l'en-tête ou le registre, et les citer avec la
   réponse (« établi (instantané `4241d5e`, 2026-10-05) ») ;
2. si une source vivante répond (API, MCP), elle peut être plus récente : la
   préférer quand elle cite son passage primaire, et signaler l'écart ;
3. si le dépôt Shenron est présent (mainteneurs), `bun scripts/plugin/build-references.ts --check`
   dit si l'instantané a dérivé du code ; `bun scripts/plugin/build-references.ts` le
   régénère. Ne jamais corriger un fichier généré à la main : corriger la source
   dans le dépôt, puis régénérer.

Les pages rédigées (`SKILL.md`, références non générées) décrivent une méthode ; un
fait qui n'est ni dans un instantané ni dans une source vivante reste **non établi**.
Une prose de guide qui contredit le code ou l'instantané se corrige, elle ne
l'emporte pas.
