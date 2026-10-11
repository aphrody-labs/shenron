# Portraits distribués séparément

Le manifeste portrait-distributions.json inventorie 143 groupes de PNG identiques (SHA-256), avec leurs chemins exacts. Il ne permet aucun nouveau chemin, groupe partiel ou contenu différent.

Le bot utilise les fichiers locaux code.png : apps/bot/src/db/seed-xv2-characters.ts et seed-xv2-portraits.ts vérifient leur existence, et apps/bot/src/lib/images/wiki-illustration.ts parcourt ce répertoire pour le canvas. Dragon Pixel utilise les URL /games/dragon-pixel/portraits/code.png dans apps/site/src/app/games/dragon-pixel/DragonPixelGame.tsx. Ces copies publiques sont suivies par Git et distribuées avec le site ; les assets du bot sont distribués séparément. Le résolveur sitePublicRedirects ne redirige que vers une destination site/public, il ne rend donc pas servable un fichier bot/assets dans la distribution du site.

Le test asset-aliases.test.ts reste le contrôle propriétaire de déduplication. Il vérifie les groupes exacts et leurs octets SHA-256 ; les autres doublons nouveaux restent refusés. L'exception antérieure des codes partageant une illustration au sein de xv2-portraits reste inchangée. Aucune suppression d'asset ni modification du manifeste de redirections.
