# Traduction JA→FR — lexique et contrôle

Depuis Aphrody, réutiliser `apps/shenron/site/src/lib/ja/traduction.ts`
(`protegerTermes`, `restaurerTermes`, `segmentsTraduisibles`) ou
`src/lib/i18n/glossary.ts` (`protect`, `restore`, `spell`) et
`apps/shenron/site/messages/glossary.json`. Le nombre d'entrées se mesure dans
le fichier courant ; ne pas recopier un ancien compteur.

Protéger du plus long au plus court, traduire les segments masqués, restaurer
les noms français attestés. Le retour `missing` refuse une phrase dont un jeton
s'est perdu. Respecter la casse : un nom tiré de l'épicerie n'autorise pas à
protéger le mot commun. Les homonymes ambigus (Vegeta prince/planète) exigent
contexte, pas sélection silencieuse.

Le marqueur dépend du moteur. Le relevé du 2026-09-12 trouvait `⟦0⟧` stable
avec Google et fragile avec NLLB ; requalifier sur un échantillon avant de
réutiliser ce comportement. Ne pas déléguer une nouvelle traduction payante
ou installer un moteur hors du périmètre de la demande.

Consulter l'aide courante de `aphrody translate` ou `bxc google translate`.
Un serveur local `--serve` annonce son adresse : ne pas figer le port. La boucle
`bun apps/shenron/site/scripts/traduction-boucle.ts --lots 1 --moteur google`
est en simulation ; `--appliquer` exige l'autorité d'écriture et ses contrôles.
Le CLI/moteur disponible ne prouve ni la qualité du résultat ni son dépôt.

Garder le style factuel et les ellipses ; dates/prix restent exacts, les
honorifiques ne s'ajoutent que s'ils portent du sens. Une source contenant `�`
ou du charabia relève d'abord de la relecture. Vérifier les noms, le nombre et
l'ordre des valeurs ; conserver les onomatopées non établies plutôt que les
traduire mécaniquement. Signaler un nom avalé ou rendu littéralement.

Le lexique attesté permet JA→FR ; il ne garantit aucune graphie canonique à
partir d'un nom français. Le traducteur livre une proposition, pas une écriture
en base. Le propriétaire Shenron contrôle le résultat et suit le dépôt autorisé,
versionné. L'arbitrage absent d'une preuve n'est jamais remplacé par une devinette.
