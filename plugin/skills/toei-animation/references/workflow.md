# Contrat vidéo propriétaire

Les deux outils sont réservés au serveur complet, même si la planification est
en lecture seule. Ils n'acceptent que cet objet ; tous les champs sont optionnels :

```json
{
  "kind": "chronology",
  "language": "fr",
  "width": 1280,
  "height": 720,
  "fps": 24,
  "durationSeconds": 12,
  "maxCards": 6
}
```

Dimensions paires de 320 à 1920, au plus 2 073 600 pixels ; cadence de 1 à 60,
durée de 1 à 30 secondes et 1 à 12 cartes. Le JSON d'entrée est limité à 16 KiB,
la réponse à 256 KiB. Le plan dispose de 30 secondes, le rendu de 300 secondes.
Aucun champ de commande, URL d'entrée ou chemin utilisateur n'est accepté.

Le mainteneur configure `SHENRON_VIDEO_BUN` (binaire absolu qualifié) et
`SHENRON_VIDEO_PROJECT_ROOT` (dépôt propriétaire contenant les CLI). Le transport
lance uniquement `scripts/video/plan.ts` ou `scripts/video/render.ts`, avec
`--no-install`, par stdin JSON. Aucun chemin fourni par le client ne peut choisir
un exécutable. Une configuration n'établit pas que le renderer et ses dépendances
sont installés ou qualifiés en production.

Le plan porte `schema: "shenron.video/v1"`, la demande normalisée, les cartes,
leurs provenances, les sources et leurs empreintes, la composition de rendu et
`contentHash`. La qualification initiale est `originalArtwork: true`,
`pixelMatchVerified: false`, `rendered: false`.

Le renderer fournit un reçu contenant `plan` et `artifact`, avec les preuves
réelles du fichier produit. Il possède le nettoyage de ses sous-processus,
l'exclusivité du job et les sorties privées. Le transport MCP borne et termine
son enfant direct en cas de dépassement ; il n'est pas un superviseur universel
des descendants. Les erreurs ne doivent révéler ni stderr brut ni identifiants.

Conserver séparément les preuves de source, plan, rendu, inspection visuelle et
publication. Une frame générée ne prouve ni droits de diffusion ni conformité
pixel par pixel à une œuvre officielle.
