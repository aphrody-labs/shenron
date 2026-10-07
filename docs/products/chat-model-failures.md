# Échecs du panneau partagé des modèles

`ModelsPanel` de `@shenron/ui` sert le web et Shenron Studio. Un rejet de la
lecture termine désormais la vérification avec l’erreur localisée existante.
Le bouton de reprise utilise `error.retry`, déjà traduit en français, anglais
et japonais. Un rejet pendant un téléchargement n’interrompt plus le polling
suivant ; les lectures restent sérialisées.

L’échec d’une installation reste visible après une lecture réussie de la liste.
Les rejets d’installation, d’import et du dialogue natif libèrent les contrôles
et affichent une erreur localisée, sans exposer le texte de l’exception. Le chemin
de l’adaptateur reste présent après un import échoué et se vide après réussite.
Le champ et les boutons sont désactivés pendant une opération.

Un jeton d’opération empêche deux gestes simultanés. Chaque opération appartient
à une connexion : un changement de transport ou la désactivation du groupe
invalide ses mises à jour UI. Il ne prétend pas annuler une opération déjà reçue
par le serveur. La liste, les erreurs et les estimations sont réinitialisées
lors du changement de connexion pour ne pas présenter les modèles d’un autre
serveur comme les modèles actuels.

## Validation du 7 octobre 2026

Les sept scénarios ajoutés échouent avec la version précédente : lecture
rejetée, installation refusée ou rejetée, import rejeté, dialogue natif rejeté,
ancienne installation après remplacement du transport et rejet du polling.
Ils passent avec le véritable composant, préchargé par `@aphrody/bun-test-dom`.
La suite UI complète passe : 314 tests, dont 116 tests DOM. Les typechecks UI et
site, la compilation de production et le contrôle de portabilité passent.

Le lint scoped ne signale aucune erreur ; il signale trois avertissements,
dont un sur la réinitialisation d’état à la connexion et deux préexistants sur
la progression et le panneau desktop. Le format et les espaces sont vérifiés.

Cette validation couvre les rejets et les changements de connexion. Une
promesse injectée qui ne se termine jamais exige encore un transport borné ;
les transports HTTP du produit utilisent le client avec délai. Les tests DOM
ne qualifient pas l’installation réelle d’un modèle, l’activation sur DBFR,
le frontal de développement inchangé ou le rendu manga complet.
