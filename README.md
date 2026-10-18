# Printtex — Suivi des commandes

Application de gestion des commandes pour un atelier de personnalisation textile : suivi des commandes clients, catalogue et commandes par marque, vectoriseur d'image, et portail dédié pour les marques inscrites.

**Site en ligne :** https://printtex75.github.io/printtexmanagement/

## Architecture

Le projet tient dans un **seul fichier** : `index.html`. Pas de framework, pas d'étape de build, pas de dépendances npm — tout le HTML, le CSS et le JavaScript sont dans ce fichier, en vanilla JS.

- **Base de données / stockage / connexion** : [Firebase](https://console.firebase.google.com) (projet `printtex-commande`)
  - **Firestore** : commandes, marques, produits, tâches
  - **Storage** : images (visuels de commandes, mockups, photos produits)
  - **Authentication** : connexion admin (email/mot de passe ou Google) + inscription des marques
- **Hébergement** : GitHub Pages, redéploie automatiquement à chaque push sur `main`
- **PWA** : le site est installable comme application (voir `manifest.json` et `sw.js`)

## Se repérer dans le code

Le fichier est volumineux (plusieurs milliers de lignes) mais organisé par sections, repérables par des commentaires du type :

```js
/* ---------- Nom de la section ---------- */
```

Sections principales, dans l'ordre :
1. **Authentification** — connexion admin, inscription marque, routage par rôle
2. **Commandes** (onglet principal) — création/édition, produits multiples par commande, emplacements visuels par produit, quota T-shirts hebdomadaire
3. **Marques** — catalogue produits par marque, création de commande depuis le catalogue, suivi (cartes avec progression partielle, galerie d'images, rupture de stock)
4. **Vectorizer** — conversion image → SVG dans le navigateur (ImageTracer.js)

## Rôles et accès

- **Admin** (email fixé dans le code, `ADMIN_EMAIL`) : accès complet à Commandes + toutes les Marques
- **Marque** (auto-inscription) : accès uniquement à son propre catalogue et ses commandes, via un portail dédié
- La séparation est appliquée **côté serveur** par les règles Firestore/Storage, pas seulement dans l'interface

## Développer en local

Aucune installation requise :

```bash
python3 -m http.server
# ou l'extension "Live Server" de VS Code
```

Ouvre ensuite `index.html` dans le navigateur. La configuration Firebase déjà présente dans le fichier (`FIREBASE_CONFIG`) pointe vers le projet de production — attention en testant des actions destructrices (suppression, etc.).

## Déploiement

Tout push sur la branche `main` déclenche un redéploiement automatique de GitHub Pages (1-2 minutes). La branche `dev` sert de zone de travail avant de fusionner vers `main`.

## Sécurité

Les valeurs dans `FIREBASE_CONFIG` (apiKey, projectId, etc.) ne sont **pas des secrets** — c'est la configuration standard côté client de Firebase. La vraie protection vient des règles Firestore/Storage (consultables et modifiables dans la console Firebase → Firestore Database / Storage → onglet "Règles").

## Travailler à deux

Le projet est développé par deux associés. Pour éviter que deux personnes codent la même chose en même temps (et que les deux versions se marchent dessus dans `index.html`), on suit ces règles.

### Les idées : libres à l'entrée, tranchées à deux

- **Toute idée devient une issue GitHub**, créée avec le modèle « 💡 Idée ». Ouvrir une issue est libre, pour les deux, à tout moment, même depuis l'application GitHub sur téléphone.
- **Avant d'ouvrir une issue, on cherche** dans la liste si une idée proche existe déjà. Si oui, on la commente au lieu d'en créer une nouvelle.
- Une idée suit ces étiquettes :
  - `idée` + `à discuter` : nouvelle, pas encore tranchée (mis automatiquement par le modèle)
  - `validé` : accepté à deux, peut être codé
  - `refusé` : écarté après discussion (on garde l'issue fermée pour mémoire)
  - `en cours` : quelqu'un est dessus
  - `terminé` : fusionné dans `main` et en ligne
- **On ne passe jamais une idée en `validé` seul.** Un point rapide par semaine suffit pour trancher la pile des `à discuter`.

### Le code : une issue = une personne = une branche

1. **On ne code jamais sans issue `validé`.** C'est le filtre contre les doublons.
2. **On s'assigne l'issue avant de commencer** et on met l'étiquette `en cours`. Si l'autre voit une issue assignée, il ne la touche pas : il commente s'il a quelque chose à dire.
3. **Une branche par sujet, au nom de la personne**, par exemple `prenom/relances-clients`. On la crée **depuis `main` à jour**.
4. **Petit et court.** Une fonctionnalité par branche, fusionnée dès qu'elle marche. Une branche qui traîne plusieurs jours diverge de `main` et finit en conflit.
5. **Pull request + relecture de l'autre avant de fusionner dans `main`**, parce que `main` déploie le site en ligne immédiatement. La relecture sert aussi à repérer un « tiens, ça existe déjà ».
6. Après fusion : étiquette `terminé`, issue fermée, branche supprimée.

### Avec Claude

- Chacun utilise ses propres conversations et sessions Claude Code, sur sa propre branche.
- Pour coder une issue, on donne son numéro à Claude (« implémente l'issue #12 ») : il part du besoin écrit, pas d'une consigne orale qui peut diverger de ce que l'autre a compris.
- Les instructions partagées du projet Claude ne se modifient qu'avec l'accord des deux.
