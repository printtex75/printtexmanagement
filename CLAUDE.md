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
