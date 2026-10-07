<!-- SPDX-License-Identifier: Apache-2.0 -->
# Développement derrière le frontal Bun

Le frontal de `shenron-server` présente une seule origine pour l’API Bun et
l’interface. Une connexion WebSocket de développement vers `/_next/hmr` ou
`/_next/webpack-hmr` ne peut pas traverser un relais HTTP ordinaire : celui-ci
supprime les en-têtes de changement de protocole. Dans la qualification native,
Next répondait donc 404 et l’UI restait sur son HTML serveur, avec des états de
connexion et de modèles qui ne se terminaient pas.

`serveFront` accepte un indicateur `development` explicite, désactivé par
défaut. Lorsqu’il est actif, ces deux chemins peuvent être reliés au WebSocket
du serveur Next choisi par `nextPort`, sur l’adresse de bouclage. Le client doit
lui aussi venir de la boucle locale ; une origine fournie doit correspondre à
celle du frontal. L’indicateur est posé par la fixture de qualification qui
lance réellement `next dev`, sans changer les défauts de production.

Le relais utilise les WebSockets natifs de Bun. Il conserve le chemin, la
requête, les trames texte et binaires ainsi que les premiers messages reçus
avant l’ouverture du socket frontal. Les adresses transmises viennent du pair
réseau, pas des en-têtes fournis par le client. La connexion amont dispose d’un
délai de cinq secondes ; les tampons du relais sont bornés à 16 Mio. Une
fermeture aval ferme l’amont. Un serveur indisponible répond 503 avec
`Retry-After`, au lieu de laisser une ouverture attendre indéfiniment.

Le WebSocket métier du chat continue à utiliser le gestionnaire de
`@shenron/api`. Les tests serveur vérifient le relais de développement, les
refus en production et entre origines, les erreurs d’amont, les trames initiales
et binaires et la fermeture. La suite du serveur contient 86 tests réussis et
deux tests ignorés dans l’environnement de qualification du 7 octobre 2026.

Le test existant `scripts/testing/integration/test/dev.live.test.ts` passe avec
le binaire Obscura qualifié par Aphrody `ce81d2829`. Il démarre Next et un hôte
Bun avec des données synthétiques, retrouve une conversation, ouvre son message,
crée une nouvelle discussion et vérifie les appels API depuis le navigateur.
Il n’utilise aucun navigateur externe. Les images et diagnostics restent dans
`var/reports/integration/`, hors Git. Cela prouve le fonctionnement du parcours
de qualification, sans constituer une validation de la production ou du rendu
complet de toutes les pages.

Le même parcours, rejoué dans un viewport natif de 390 × 844 pixels, passe
avec une largeur de document de 390 pixels et aucune exception JavaScript.
Cette vérification mobile utilise une variante temporaire du test existant,
conservée dans les rapports locaux ; elle ne remplace pas une qualification sur
un téléphone physique. La capture met encore en évidence une promotion Discord
superposée à l’en-tête mobile, hors du périmètre du relais.
