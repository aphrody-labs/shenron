# Échecs et lectures concurrentes de la mémoire partagée

`MemoryPanel` de `@shenron/ui` conserve une seule interface pour le navigateur
et Shenron Studio. Les rejets de lecture, de suppression et d’effacement utilisent
l’erreur localisée existante ; le texte des exceptions n’est pas affiché. Une
suppression échouée conserve les souvenirs et libère les contrôles. Un nouvel
effacement exige à nouveau la confirmation prévue par l’interface.

Chaque lecture appartient à une connexion et à une version des souvenirs. Une
suppression réussie invalide les lectures antérieures : une réponse reçue ensuite
ne peut plus restaurer les souvenirs supprimés. Le remplacement du transport,
la désactivation du groupe ou le démontage invalident aussi les anciennes
opérations UI. Cela n’annule pas une opération déjà reçue par le serveur.

La liste et son compteur sont mis à jour ensemble. Si une suppression se termine
après une nouvelle recherche, elle ne diminue le compteur que pour les souvenirs
encore présents dans les résultats affichés. Une erreur de suppression reste
visible même si une lecture concurrente réussit ; les erreurs de lecture et
d’action ont des états distincts.

## Validation du 7 octobre 2026

Les huit scénarios de régression échouent avec le composant précédent. Les
douze tests DOM de la mémoire passent avec le véritable composant et le
préchargement `@aphrody/bun-test-dom` : rejets, reprise, recherche concurrente,
suppression, effacement et remplacement du transport. Le typecheck UI et le
contrôle de portabilité passent. Le format et les espaces sont vérifiés.
La suite UI complète passe également : 322 tests, dont 124 tests DOM.

Le lint scoped ne signale aucune erreur et conserve trois avertissements : deux
préexistants sur les dépendances de rafraîchissement et le rôle de statut, ainsi
qu’un sur la réinitialisation de l’état lors du changement de connexion.

Ces tests utilisent des souvenirs de fixture. Ils ne qualifient ni l’effacement
réel du store protégé, ni l’activation sur DBFR, ni le frontal de développement,
ni le rendu manga complet. Un transport injecté dont la promesse ne se termine
jamais exige toujours son propre délai ; le composant ne fabrique pas un succès.
