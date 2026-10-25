<!-- SPDX-License-Identifier: Apache-2.0 -->
# Stack et surface publique de Voiranime

Observation du 25 octobre 2026, entre 14:10 et 14:43 UTC. Cible :
[voir-anime.to](https://voir-anime.to/). Cette carte décrit ce qui a été annoncé
dans les pages publiques ou observé pendant leur consultation ; elle ne constitue
pas un inventaire des services internes.

## Niveaux de preuve

| Mention | Signification |
| --- | --- |
| Annoncé | Une URL, un module ou une propriété figure dans le HTML ou sa configuration publique. |
| Testé Bun | Une requête directe bornée a reçu un statut HTTP documenté. |
| Observé navigateur | La navigation ordinaire a déclenché une requête visible dans les événements réseau. |
| Déduit | L'architecture paraît compatible avec les indices ; son exécution interne n'a pas été vérifiée. |
| Non établi | La preuve est absente, indisponible ou insuffisante. |

Un `200` ne certifie pas le fonctionnement métier, l'exécution d'un script ni la
lecture d'une vidéo. Un `403` de Bun n'annule pas un `200` distinct observé dans le
navigateur : le client, la session, le moment et la requête diffèrent.

## Stack observée

| Couche | Constat | Preuve et limite |
| --- | --- | --- |
| DNS autoritatif | Cloudflare | NS `dell.ns.cloudflare.com` et `rene.ns.cloudflare.com`. |
| Frontal HTTP | Cloudflare | En-têtes `server: cloudflare`, `cf-ray` et `cf-cache-status: DYNAMIC` sur l'accueil. L'origine n'est pas révélée. |
| TLS public | Certificat Let's Encrypt YE2 | Nom `voir-anime.to`, wildcard `*.voir-anime.to`, validité du 24 septembre au 23 décembre 2026 ; validation TLS active. |
| Transport | HTTP redirige vers HTTPS ; TCP 80 et TLS 443 répondent | Deux ports web usuels seulement. `alt-svc` annonce HTTP/3, sans preuve d'une négociation QUIC. |
| Rendu | Pages HTML servies par le site, enrichies en JavaScript | Accueil de 212 858 octets ; pages de série, ressources et XHR observés en navigateur. Rien ne prouve une application React/Next.js. |
| CMS et thème | WordPress, Madara, thème enfant `madara-child-voiranime` | Chemins `wp-includes`, `wp-content/themes`, propriétés `madara` et réponses aux ressources en navigateur. |
| Catalogue et compte | Madara Core / WP Manga | Ressources `plugins/madara-core`, globals `manga` et `wpMangaLogin`, champs de configuration publique. L'authentification n'a pas été testée. |
| Recherche | Ajax Search Pro | Module map explicite `plugins/ajax-search-pro`, instances ASP, paramètres de recherche déclarés. |
| Interface | jQuery, jQuery Migrate/UI, Bootstrap, Slick, Shuffle, AOS, imagesLoaded | Ressources nommées et réponses HTTP `200` observées en navigateur. Leur code n'a pas été conservé. |
| Iconographie et pagination | Font Awesome, Ionicons, icônes Madara, WP PageNavi | Références de feuilles de style et réponses `200` en navigateur. |
| Autres intégrations déclarées | Google Tag Manager/Analytics ; Widget Logic | Références publiques de scripts et de plugin. Elles n'établissent pas le traitement serveur ni les destinataires effectifs de toutes les données. |
| Lecteurs externes | Plusieurs iframes de fournisseurs | Destinations publiques observées sur un épisode : `voembed.net`, `mfw09.org`, `voe.sx`, `streamtape.com`. La lecture n'a pas été tentée ; une iframe n'établit pas l'hôte CDN du fichier vidéo. |

Les adresses A mesurées sont `172.67.162.177` et `104.21.89.173` ; les AAAA sont
`2606:4700:3032::6815:59ad` et `2606:4700:3032::ac43:a2b1`. Elles désignent le frontal
public observé. Le suffixe `MRS` du `cf-ray` et le certificat wildcard ne révèlent
ni la localisation de l'origine, ni des sous-domaines effectivement déployés.

## Versions : annonces, pas attestation du serveur

Les URLs déclarent notamment jQuery `3.7.1`, jQuery Migrate `3.4.1`, jQuery UI
`1.13.3`, Bootstrap JavaScript `4.6.0` et CSS `4.3.1`, Shuffle `5.3.0`, Slick CSS
`1.9.0`, Font Awesome `5.15.3`, Ionicons `4.5.10` et WP PageNavi `2.70`.
Des ressources WordPress/Madara portent `?ver=6.7.2` ; le thème enfant porte
`?ver=1.6.6` sur sa feuille de style et `?ver=1.1` sur son script.

Ces valeurs sont des paramètres de cache déclarés par la page. Elles ne prouvent
pas la version des octets exécutés, du CMS, du thème installé ni de PHP. Les corps
des scripts signalés `200` en navigateur n'ont pas été récupérés par l'inspection
de ressources ; cette indisponibilité reste une limite distincte du statut HTTP.

## Endpoints et comportement observé

L'inventaire structuré est dans [endpoints.csv](endpoints.csv). La configuration
publique référence le dispatcher WordPress
[`/wp-admin/admin-ajax.php`](https://voir-anime.to/wp-admin/admin-ajax.php) dans
`madara.ajaxurl`, `wpMangaLogin.admin_ajax` et `manga.ajax_url`.

Pendant la navigation ordinaire d'une fiche série, le navigateur a émis
automatiquement un **POST `action=manga_views`**, avec les noms de paramètres
`action` et `manga`. Le réseau montre une réponse `200` de type JSON du dispatcher.
Il n'y a eu ni POST forgé, ni rejeu, ni variation de paramètres. La donnée et l'effet
du compteur côté serveur ne sont pas établis par cette seule observation.

À 14:43 UTC, une recherche latérale par saisie de « Naruto » et clic sur la loupe a
émis le POST `action=ajaxsearchpro_search` au même dispatcher. Les noms de paramètres
sont `action`, `aspp`, `asid`, `asp_inst_id` et `options` ; seules ces clés et le nom
de l'action sont conservés. Réponse HTTP `200`, 13 suggestions visibles, puis clic
sur « Naruto » jusqu'à la fiche `/anime/naruto/` avec son titre affiché. Cette action
est établie par une interaction normale de l'interface, sans POST forgé ni rejeu.
Preuve : `root/sidebar-search-action.json`. Les autres labels de configuration ne
deviennent pas pour autant des endpoints vérifiés.

La configuration de recherche déclare `/?s={query}` et `/?asp_ls={query}`. Les
valeurs `ajax`, `ajax_search`, `nothing` sont des choix d'interface ; `facet_change`,
`focus`, `magnifier`, `result_click`, `return`, `search_start`, `search_end` et
`try_this` sont des libellés de suivi. Leur présence ne prouve pas des actions
serveur `wp_ajax_*` correspondantes.

Les sondes directes Bun donnent `403` pour la racine REST `/wp-json/`, l'alternative
oEmbed publiée et le manifeste lié par la page. Le flux RSS `/feed/` répond `200`
avec un contenu XML de 848 octets. Aucun catalogue JSON REST n'a donc été établi
par ces sondes.

Huit ressources JavaScript/CSS explicitement référencées ont donné `403` à Bun,
avec un corps HTML de 4 548 octets. La navigation navigateur a séparément reçu
`200` pour ces mêmes chemins. Aucune recherche d'origine, adaptation destinée à
contourner le frontal ni relance en boucle n'a été entreprise.

## Backend : ce qui reste inconnu

La structure publique est compatible avec un backend WordPress et son dispatcher
AJAX ; PHP est une déduction d'architecture, pas une version ou un processus
serveur observé. Le moteur SQL, la topologie interne, le serveur HTTP d'origine,
l'hébergeur, les routes privées, les tâches de fond et un éventuel service d'IA
restent **non établis**. L'absence d'indices n'est pas une preuve d'absence.

## Reproduction et preuves locales

Les reçus détaillés restent hors Git dans `var/reports/voir-anime-20261025/` :

- `assets/inventory.json`, `assets/inline-identifiers.json`, `assets/surface.json` ;
- `root/browser-public-script-identifiers.json`, `root/series-browser-network.json` ;
- `root/browser-ajax-actions.json`, `root/public-endpoints.json` ;
- `root/episode-providers.json`, `network/receipt.json`, `network/README.md`.

Ils conservent les statuts, horodatages, tailles, empreintes et identifiants utiles,
sans valeurs de cookie, nonce, signature ou credential, ni copie du code tiers.
Les contrôles réseau ont utilisé `Bun.dns`, `Bun.connect` et `fetch`. Les commandes
`bun dns` et `bun tcp` ne sont pas fournies par le runtime installé ; `bun curl`
exige une construction avec `--curl-native=on`, indisponible ici. Aucun runtime
n'a été remplacé pour masquer ces limites.
