# Printtex — repères pour Claude

Application de gestion d'un atelier de personnalisation textile. Lis le README avant de toucher au code.

## Conventions
- Tout l'outil tient dans `index.html` (HTML + CSS + vanilla JS, pas de framework, pas de build, pas de npm). `cockpit.html` et `idees.html` sont des pages annexes avec le même style et la même config Firebase.
- Le code est découpé en sections repérées par `/* ---------- Nom ---------- */`. Ajoute une fonctionnalité dans la section qui la concerne, ou crée une section, sans réorganiser le reste.
- Interface et textes en français. Style visuel : variables CSS de `:root` (palette canvas / ink / thread), polices Oswald, Inter, JetBrains Mono.
- Données : Firestore (`orders`, `brands`, produits, tâches, `cockpit`, `idees`). La config Firebase du fichier pointe sur la production : ne lance aucune action destructrice en test.
- Vérifie la syntaxe du script avant de committer, par exemple en extrayant le `<script>` principal et en le passant à `node --check`.

## Branches et validation
- `main` déploie le site en ligne immédiatement (GitHub Pages). On n'y pousse jamais directement : une branche par sujet, une pull request, relecture avant fusion.
- Une idée de la boîte à idées (page `idees.html`, collection Firestore `idees`) se code sur la branche `idee-<id court>` et sa PR s'intitule « Idée : <titre> ». Le chef seul autorise un lancement, depuis sa session Claude Code. Le script `scripts/idees-firestore.mjs` lit et met à jour les idées (variable `FIREBASE_SERVICE_ACCOUNT`).
- Reste dans le périmètre de l'idée et de son analyse : pas de refonte, pas de dépendance ajoutée.

## Contexte fonctionnel (ajouté le 18/10/2026)
L'utilisateur (printtex75@gmail.com, artisan non développeur) parle français : répondre en français, simplement et brièvement. Les règles de branches ci-dessus priment sur tout le reste.

### Rôles
- Admin : `ADMIN_EMAIL = printtex75@gmail.com` → panneau complet (Commandes en Kanban, Marques, Vectoriseur, bloc-notes « À commander »).
- Marque : tout autre compte → portail restreint (ses produits, ses commandes à faire). Retrouvée via `brands` où `ownerUid == uid` (`findBrandByOwner`). Inscription marque : crée le compte Auth + le document `brands/{id}` (avec `ownerUid`, `ownerEmail`).

### Données Firestore
- `orders/{id}` (+ sous-collection `images`) : commande. Statuts : `attente_production`, `production`, `prete`, `livree`, `annulee`. Champs notables : `items[]`, `priceAmount`, `depositAmount`, `toCheckOnReceipt`, `deadline`, `archived`, `readyAt` (posé à l'état « prête »), `deliveredAt`. Livrée = archivée + images supprimées.
- `brands/{id}` ; sous-collections `tasks` (produits à faire : `nom, blank, taille/tailles, couleur, impression, quantity, readyQty, done, outOfStock, mockup[]`) et `products`. Résumé sur la marque : `taskTotal`, `taskDone`, `oldestPendingDate`.
- `adminNotes/toOrder` : bloc-notes admin.
- Règles Firestore/Storage : à coller par l'utilisateur dans la console Firebase (rien dans le dépôt). `orders` et `adminNotes` : admin seulement ; `brands/*` : admin ou propriétaire (`ownerUid`).

### Fonctions principales (déjà en place)
Kanban + vue liste, recherche (client, produit, n° de commande, archives), commandes multi-produits avec tailles par produit, blank, mockups, jauge de capacité T-shirts (500 pts/semaine) et alerte de surcharge à l'enregistrement, « Prévenir / Relancer le client » (WhatsApp ou email, relance après 3 jours en « Prête »), cases « À relancer » et « À encaisser » cliquables, export CSV et export comptable mensuel (commandes livrées), impression de commande, sauvegarde/restauration JSON, portail marque (cartes avec images, rupture de stock, quantité partielle `readyQty`, impression du résumé, numéro de téléphone), connexion avec « mot de passe oublié » et messages d'erreur détaillés.


### Pièges connus
- Ne jamais envoyer `undefined` à Firestore (`set()` échoue) : n'ajouter un champ que s'il a une valeur.
- Les erreurs doivent rester visibles à l'écran : des clients se connectent depuis des iPhone, parfois via des navigateurs intégrés.
- Changer le bandeau `#buildTag` (format `build AAAA-MM-JJ-nom`) à chaque publication.

### À faire / idées en attente
- Accélérer le chargement : ne charger que les commandes actives au démarrage (attention aux stats « Livrées » et à l'archivage qui lisent toutes les commandes).
- Problème de connexion d'un client (Flex Like, Fayçal) : en attente du message d'erreur exact affiché. Vérifier dans la console Firebase : domaine `printtex75.github.io` autorisé (Authentication → Settings), compte non désactivé, bonne adresse email (`fayssoule@yahoo.com` ou `faycalsellah@yahoo.com`).
- Idées : étiquettes de colis, statistiques simples, modèles de commandes répétitives.
