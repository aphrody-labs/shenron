# Développement à distance et serveur de dev persistant

Le poste de travail reste un hôte d'édition : installation, portes et serveur de dev tournent sur l'hôte de build. `just remote` pilote `scripts/dev/remote-dev.ts` (défaut : `fr1`, variable `SHENRON_DEV_HOST` ; `--host auto` choisit le moins chargé parmi `SHENRON_DEV_HOSTS`, défaut `fr1,fr2`, la production n'étant jamais candidate).

| Besoin | Commande |
| --- | --- |
| État de l'hôte (cœurs, charge, Bun, disque, espace de travail, serveur) | `just remote doctor` |
| Envoyer l'arbre de travail (HEAD, modifications, fichiers non suivis) sur l'hôte | `just remote sync` |
| Portes complètes : installation, typecheck, lint, tests | `just remote gates` |
| Serveur Next de dev dans tmux sur l'hôte, redirigé vers `localhost` | `just remote dev` |
| Boucle complète : portes puis serveur | `just remote up` |
| Arrêter le serveur distant et la redirection | `just remote stop` |
| Lancer une commande dans l'extraction distante | `just remote run -- <commande>` |

Boucle de correction en direct : modifier en local, `just remote sync`, le serveur de dev distant recharge à chaud, ouvrir la page redirigée, corriger. Chaque arbre de travail local a sa propre extraction distante (`--workspace`), donc plusieurs arbres ne s'écrasent pas.

Limites mesurées le 2026-11-19 : sans base de données jointe, les routes de wiki mettent de 40 à 90 s par requête en dev (relevé local) ; le serveur de dev ne doit donc pas pointer vers une base absente. `fr1` est chargé (charge 10 à 14 sur 12 cœurs au moment du relevé) : arrêter le serveur avec `just remote stop` hors session. Les anciens alias `vps` et `cdn` désignent les mêmes machines que `fr1` et `fr2` (adresses publiques) ; les défauts utilisent maintenant les noms de `AGENTS.md`.

## Coque native

`shenron-desktop` (`../wiki/crates/shenron-desktop`) assemble en onglets trois espaces GPUI (`koharu-app`, `shenron-studio`, `shenron-admin-ui`) sur `gpui-kit` (`src/main.rs` : 71 lignes ; `shenron-admin-ui/src/view.rs` : 120 lignes ; `shenron-studio/src/lib.rs` : 51 lignes, relevé du 2026-11-21). Le reste de l'interface (site, wiki, TV) n'y est pas : la migration du site suit `docs/plans/base-ui-vers-gpui.md`.
