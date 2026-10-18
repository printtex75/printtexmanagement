# Printtex – application de gestion de commandes

Atelier de personnalisation textile à Paris (Printtex). Application web en un seul fichier, sans étape de build.
Réponds toujours en français à l'utilisateur (printtex75@gmail.com, administrateur).

## Architecture
- `index.html` : tout le code (HTML + CSS + JS vanilla). Pas de framework, pas de build.
- `sw.js` : service worker (réseau d'abord ; navigations en `no-store`). Incrémenter `CACHE_NAME` si on change la liste de fichiers.
- `manifest.json`, icônes, `README.md` : PWA et documentation développeur.
- Firebase (SDK « compat » chargé depuis cdnjs, repli sur gstatic) : Firestore, Storage, Auth (email/mot de passe + Google). Firestore en long-polling.
- Hébergement : GitHub Pages, dépôt `printtex75/printtexmanagement`, branche `main`. Pousser sur `main` publie le site (1 à 2 minutes). Netlify n'est plus utilisé.
- Page publiée : https://printtex75.github.io/printtexmanagement/
- Le bandeau près du logo (`#buildTag`) affiche le numéro de build : le changer à chaque publication (format `build AAAA-MM-JJ-nom`), pour vérifier ce qui est en ligne.

## Rôles
- Admin : `ADMIN_EMAIL = printtex75@gmail.com` → panneau complet (Commandes en Kanban, Marques, Vectoriseur, bloc-notes « À commander »).
- Marque : tout autre compte → portail restreint (ses produits, ses commandes à faire). Retrouvée via `brands` où `ownerUid == uid` (`findBrandByOwner`). Inscription marque : crée le compte Auth + le document `brands/{id}` (avec `ownerUid`, `ownerEmail`).

## Données Firestore
- `orders/{id}` (+ sous-collection `images`) : commande. Statuts : `attente_production`, `production`, `prete`, `livree`, `annulee`. Champs notables : `items[]`, `priceAmount`, `depositAmount`, `toCheckOnReceipt`, `deadline`, `archived`, `readyAt` (posé à l'état « prête »), `deliveredAt`. Livrée = archivée + images supprimées.
- `brands/{id}` ; sous-collections `tasks` (produits à faire : `nom, blank, taille/tailles, couleur, impression, quantity, readyQty, done, outOfStock, mockup[]`) et `products`. Résumé sur la marque : `taskTotal`, `taskDone`, `oldestPendingDate`.
- `adminNotes/toOrder` : bloc-notes admin.
- Règles Firestore/Storage : à coller par l'utilisateur dans la console Firebase (rien dans le dépôt). `orders` et `adminNotes` : admin seulement ; `brands/*` : admin ou propriétaire (`ownerUid`).

## Fonctions principales (déjà en place)
Kanban + vue liste, recherche (client, produit, n° de commande, archives), commandes multi-produits avec tailles par produit, blank, mockups, jauge de capacité T-shirts (500 pts/semaine) et alerte de surcharge à l'enregistrement, « Prévenir / Relancer le client » (WhatsApp ou email, relance après 3 jours en « Prête »), cases « À relancer » et « À encaisser » cliquables, export CSV et export comptable mensuel (commandes livrées), impression de commande, sauvegarde/restauration JSON, portail marque (cartes avec images, rupture de stock, quantité partielle `readyQty`, impression du résumé, numéro de téléphone), connexion avec « mot de passe oublié » et messages d'erreur détaillés.

## Règles de travail
- Toujours vérifier la syntaxe du script avant de pousser (extraire le plus grand bloc `<script>` et `node --check`).
- Ne jamais envoyer `undefined` à Firestore (`set()` échoue) : n'ajouter un champ que s'il a une valeur.
- Les erreurs doivent rester visibles à l'écran (pas seulement dans la console) : des clients se connectent depuis des iPhone, parfois via des navigateurs intégrés.
- Pas de changement de structure risqué sans prévenir : l'utilisateur est un artisan, pas un développeur ; expliquer simplement et brièvement.
- Commits : message clair en français ou anglais ; l'utilisateur ne veut pas passer par une branche `dev`, pousser sur `main`.

## À faire / idées en attente
- Accélérer le chargement : ne charger que les commandes actives au démarrage (attention aux stats « Livrées » et à l'archivage qui lisent toutes les commandes).
- Problème de connexion d'un client (Flex Like, Fayçal) : en attente du message d'erreur exact affiché. Vérifier dans la console Firebase : domaine `printtex75.github.io` autorisé (Authentication → Settings), compte non désactivé, bonne adresse email (`fayssoule@yahoo.com` ou `faycalsellah@yahoo.com`).
- Idées : étiquettes de colis, statistiques simples, modèles de commandes répétitives.
