---
name: dragon-ball-japonais
description: "Vérifie les graphies et traduit le japonais Dragon Ball en français avec le lexique attesté du wiki et des databooks."
---

# Japonais Dragon Ball

Appliquer le [contrat partagé](../../references/execution.md).

Une graphie de fiction ne se déduit ni du rōmaji ni de la prononciation.
Vérifier dans le scan ou les occurrences du corpus ; sans preuve, signaler
l'incertitude et laisser la graphie vide. L'absence de JMdict/IPADIC n'est
pas une preuve de faute.

1. Chercher le japonais avec `dragonball_databooks_planches` ou
   `GET https://dragonballfr.com/api/databooks/search?q=…&limit=3`.
   L'index trigramme devient bruité sous trois signes ; un OCR isolé peut être faux.
2. Trouver la forme française retenue avec `dragonball_wiki_search` ou
   `https://bot.dragonballfr.com/api/public/wiki/search?q=…&limit=5` :
   `name` et `name_ja`. Une valeur absente reste vide. Les routes
   `/api/bot-user/…` exigent une session et ne sont pas ce flux public.
3. Traduire avec protection du lexique, du terme le plus long au plus court,
   puis vérifier tous les termes et nombres. Ne pas traduire une source
   illisible ni combler ses lacunes. Conserver le ton factuel et les ellipses.
4. Normaliser les points médians pour comparer ; séparer les cellules mixtes
   `name_ja` sur les virgules et ne garder que les segments japonais. Le
   contexte et la date de l'ouvrage priment sur la ressemblance d'un mot.

Charger seulement ce qui sert : [lexique](references/lexique.md) pour les noms ;
[traduction et contrôle](references/traduction.md) pour JA→FR ;
[outils du dépôt](references/outils.md) pour analyse ou maintenance.
Les noms du domaine sont souvent absents des dictionnaires ; un taux de
couverture ou une fréquence doit être remesuré avant d'être cité.
