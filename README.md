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
