# Annulation des signalements

L'envoi interactif de `/api/reports` dispose de dix secondes pour recevoir ses
en-têtes. Un serveur qui ne répond pas conduit au message d'échec existant et
rend le bouton d'envoi disponible. Les réponses 401 et 429 gardent leurs états
spécifiques. Aucun nouvel envoi automatique ne suit une erreur.

La fermeture du formulaire et le démontage de son composant annulent la
requête. Une référence d'envoi protège aussi contre deux clics simultanés et
contre une réponse ancienne après une nouvelle ouverture. La minuterie de
fermeture ne peut être créée que par l'envoi encore actif.

L'annulation concerne le client : elle ne prouve pas qu'une écriture déjà
acceptée par le serveur a été annulée. Les tests de transport utilisent des
serveurs HTTP Bun jetables pour vérifier le délai, l'annulation, un nouvel
envoi après délai et la conservation du contenu et des statuts. Ils ne
touchent pas à la base éditoriale.
