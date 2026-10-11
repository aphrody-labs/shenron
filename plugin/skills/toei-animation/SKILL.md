---
name: toei-animation
description: "Prépare des animations originales Dragon Ball sourcées, puis utilise le backend vidéo propriétaire si disponible ; chronologie, Beerus et scène originale, sans affiliation officielle à Toei."
---

# Animation originale sourcée

Appliquer le [contrat partagé](../../references/execution.md). Le nom technique
`toei-animation` désigne ce workflow Shenron ; il ne constitue ni un service
officiel de Toei Animation, ni une autorisation de reproduire ses films ou épisodes.
Créer une composition originale et conserver les références de ses faits.

1. Choisir `chronology`, `beerus` ou `original` et la langue `fr`, `en` ou `ja`.
   Vérifier les faits par les API de chronologie et les nouvelles sourcées ; garder
   les URL, dates, langues et limites. Une annonce de diffusion ne prouve pas une
   lecture disponible. Un épisode bonus non confirmé reste non confirmé.
2. Préparer la demande bornée décrite dans le [contrat vidéo](references/workflow.md).
   Ne fournir aucune URL, commande, chemin de corpus ou instruction de téléchargement
   au transport vidéo. Utiliser les données publiques résolues par son propriétaire.
3. Appeler `dragonball.toei_animation` sur un serveur MCP complet et autorisé.
   Le plan comporte provenance, empreinte et qualification ; aucun rendu n'est
   encore qualifié. Un plugin installé ne garantit pas un backend vidéo installé.
4. Si le rendu est demandé et autorisé, appeler séparément
   `dragonball.toei_animation_render`. Une capacité absente ou un backend non
   configuré doit produire une limite explicite, jamais un faux artefact.
5. Contrôler le reçu réel : moteur utilisé, dimensions, cadence, durée, nombre de
   frames, fichiers et empreintes. Ouvrir le rendu et vérifier des frames avant
   livraison. Ne revendiquer une correspondance de pixels qu'après comparaison
   mesurée d'une référence autorisée ; le plan initial la déclare non vérifiée.

Pour les éléments vectoriels, suivre [toriyama-svg](../toriyama-svg/SKILL.md) et
ses mesures ; réutiliser la géométrie existante. Référencer les images ou vidéos
officielles par leurs liens et embeds autorisés. Ne télécharger aucun épisode ou
film, ne publier aucun corpus brut, scan protégé ou donnée d'entraînement privée.
Les licences et droits d'une référence ne se déduisent pas de sa visibilité publique.

Le rendu reste privé tant que son inspection et ses droits de diffusion ne sont
pas établis. La publication et le déploiement sont des étapes distinctes du rendu.
