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

### La boîte à idées dans l'outil : `idees.html`

La page **Boîte à idées** (lien dans la navigation de l'application, ou directement `idees.html`) est l'endroit où les deux associés déposent leurs idées. Même connexion que le reste de l'outil (email/mot de passe ou Google), même projet Firebase, collection Firestore `idees`.

1. **Depuis n'importe quel écran de l'outil**, l'onglet « Une idée ? » sur le bord droit ouvre une petite fenêtre : on écrit, on envoie, c'est dans la boîte. La page complète garde les trois questions pour qui veut détailler. Le lien « Boîte à idées » affiche le nombre d'idées à trancher.
   **Trois questions** pour décrire l'idée : ce que ça change concrètement, ce que ça arrange, dans quel but. On envoie, l'idée est tout de suite dans la liste commune.
2. **Claude analyse chaque nouvelle idée** depuis la session Claude Code du chef, deux fois par jour (vers 9 h et 18 h, ou tout de suite si le chef écrit « boîte »), et écrit son avis sous l'idée : verdict (à faire / oui mais / plus tard / à ne pas faire), pourquoi le faire, pourquoi ne pas le faire, ce que ça causerait comme répercussions, ce qu'il faudrait pour que ça marche vraiment, taille du chantier, idées déjà dans la boîte qui recoupent celle-ci. L'analyse est enregistrée avec l'idée. Facultatif : une clé API Claude collée dans la page (bouton « ⚙ Claude ») donne l'avis dans la minute, à l'usage.
3. **Le chef décide.** Depuis sa session Claude Code, il reçoit un mini résumé des nouvelles idées analysées et répond « OK » ou « Non ». Tant qu'il n'a pas dit OK, rien n'est lancé. Sur OK, Claude code l'idée sur une branche `idee-…` et propose une pull request vers `main` ; le chef relit et fusionne.
4. Dans la liste : statuts, « Je suis d'accord », « Je m'en occupe » (une seule personne par idée), discussion sous chaque idée.

**Mise en place (une fois) :**

1. **Ajouter l'associé** dans la constante `ASSOCIES` de `idees.html` (email en minuscules).
2. **Autoriser les collections `idees` et `config`** dans la console Firebase → Firestore Database → Règles, en ajoutant dans le bloc `match /databases/{database}/documents` :
   ```
   match /idees/{id} {
     allow read, write: if request.auth != null
       && request.auth.token.email in ['printtex75@gmail.com', 'EMAIL_DE_L_ASSOCIE'];
   }
   match /config/{id} {
     allow read, write: if request.auth != null
       && request.auth.token.email in ['printtex75@gmail.com', 'EMAIL_DE_L_ASSOCIE'];
   }
   ```
3. **Clé Claude partagée (facultatif)** : sans clé, l'analyse est faite par la session du chef, comprise dans l'abonnement. Avec une clé API collée une fois dans la page (bouton « ⚙ Claude », rangée dans Firestore `config/claude`), l'avis arrive dans la minute, quelques centimes par idée.
4. **Lecture par la session du chef** : pour que Claude lise les idées depuis Claude Code (résumé, lancement sur OK), une clé de compte de service Firebase est placée dans les réglages de l'environnement cloud, variable `FIREBASE_SERVICE_ACCOUNT` (contenu du fichier JSON généré dans la console Firebase → Paramètres du projet → Comptes de service). Le script `scripts/idees-firestore.mjs` s'en sert.

### Les idées : libres à l'entrée, tranchées à deux

- **Toute idée passe par la boîte à idées** (`idees.html`). Ouvrir une idée est libre, pour les deux, à tout moment. GitHub reste en coulisses pour le code (branches, pull requests) ; les associés n'ont pas besoin d'y aller.
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
