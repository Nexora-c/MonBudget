# MonBudget — PWA gratuite

Application personnelle de gestion des revenus, dépenses et budgets, en français et en MAD, sans framework ni abonnement.

## Fichiers
- `index.html` : interface
- `styles.css` : mise en forme responsive
- `app.js` : calculs, transactions, budgets et sauvegardes
- `manifest.webmanifest` : installation sur téléphone
- `service-worker.js` : chargement hors connexion après une première visite en ligne
- `icons/` : icônes

## Tester localement sur ordinateur
Installer Python (gratuit), ouvrir un terminal dans le dossier `MonBudget`, puis exécuter :

```bash
python3 -m http.server 8000
```

Ouvrir http://localhost:8000 dans le navigateur. (Sur Windows, `py -m http.server 8000` peut être utilisé.)

## Installer sur iPhone et Android gratuitement
Une PWA doit être servie en **HTTPS** pour être installée sur un téléphone (ou localhost pour les tests sur ordinateur). Pour la mise en ligne gratuite, créer un dépôt GitHub contenant ces fichiers et activer **GitHub Pages** (Settings > Pages > Deploy from a branch > main > /root). La page sera accessible à une adresse du type `https://utilisateur.github.io/nom-du-depot/`.

- **iPhone** : ouvrir l'adresse avec Safari, toucher Partager, puis « Sur l'écran d'accueil » / « Ajouter à l'écran d'accueil ».
- **Android** : ouvrir l'adresse avec Chrome, utiliser le menu ⋮ puis « Installer l'application » ou « Ajouter à l'écran d'accueil » (selon le téléphone et le navigateur).

La PWA pourra se lancer sans réseau **après** le premier chargement réussi et la mise en cache. Les capacités de stockage hors ligne varient selon le navigateur.

## Vie privée et limites importantes
- Tout est stocké dans le **localStorage du navigateur** de l'appareil. Les données ne sont pas envoyées à un serveur.
- Pas de synchronisation entre iPhone et Android : importer/exporter la sauvegarde JSON pour passer les données d'un appareil à l'autre.
- Effacer les données du navigateur, désinstaller l'app ou utiliser un autre navigateur peut supprimer les opérations : **exporter régulièrement** la sauvegarde JSON.
- Aucun compte ni connexion bancaire, ni publication en boutique.
- Cette version est un **MVP** : pas de modification d'opération (supprimer puis recréer), pas de catégorisation personnalisée ni de gestion des charges récurrentes.
- Le dépôt GitHub Pages contient uniquement **le code public** : ne jamais y mettre des données financières exportées ni des secrets.
