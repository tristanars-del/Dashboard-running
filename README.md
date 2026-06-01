# ⚡ Running Dashboard

Dashboard de suivi running connecté à Strava, déployable sur **GitHub Pages** (100% statique, aucun backend).

---

## 🚀 Déploiement rapide

### 1. Créer une application Strava

1. Aller sur [strava.com/settings/api](https://www.strava.com/settings/api)
2. Créer une application (nom libre, catégorie "Other")
3. **Authorization Callback Domain** : entrer votre domaine GitHub Pages, ex : `monpseudo.github.io`
4. Noter le **Client ID** et le **Client Secret**

### 2. Publier sur GitHub Pages

1. Créer un dépôt GitHub (public ou privé avec Pages activé)
2. Pousser tous les fichiers à la racine du dépôt
3. Aller dans **Settings → Pages → Source : main branch / root**
4. L'URL sera : `https://monpseudo.github.io/nom-du-depot/`

### 3. Premier lancement

1. Ouvrir l'URL GitHub Pages dans votre navigateur
2. Le modal de configuration apparaît → saisir Client ID + Client Secret
3. Clic sur **Connecter Strava** → autoriser l'application sur Strava
4. Le chargement initial (toutes les activités + streams) peut prendre quelques minutes
5. Les best efforts (records) se chargent en arrière-plan après l'affichage

---

## 📁 Structure des fichiers

```
dashboard-running/
├── index.html              # Structure HTML principale
├── css/
│   └── style.css           # Thème dark, DM Sans + DM Mono
├── js/
│   ├── utils.js            # Helpers dates, formats, math
│   ├── tips.js             # Aide contextuelle (boutons ?)
│   ├── auth.js             # OAuth Strava + refresh token
│   ├── strava.js           # Client API Strava + cache localStorage
│   ├── classify.js         # Classification 13 types de séances
│   ├── metrics.js          # VO2max, TSS, ATL/CTL/TSB, VDOT
│   ├── weather.js          # Open-Meteo (météo historique + actuelle)
│   ├── charts.js           # Tous les graphiques Chart.js
│   ├── map.js              # Carte Leaflet pour les séances
│   ├── records.js          # Records personnels (PR)
│   ├── ui.js               # Rendu de toutes les pages
│   └── app.js              # Point d'entrée, orchestration
└── README.md
```

---

## 📊 Fonctionnalités

### Accueil
- Forme du jour (TSB coloré)
- VO2max actuelle
- Volume semaine en cours
- Séances de la semaine avec lien détail
- Mini-graphe VO2max 8 semaines + tendance
- Alerte contextuelle automatique

### Analyse
- Filtres : 4 sem. / 8 sem. / 12 sem. / 6 mois / 1 an / Tout
- Volume hebdo empilé par type, temps par zone FC
- ATL/CTL/TSB, évolution VO2max, chrono estimé par distance

### Performance
- VO2max, VDOT/VMA, FCmax dynamique
- 5 zones FC calibrées dynamiquement
- Estimations de chrono (5km → marathon)
- Allures d'entraînement recommandées
- Graphes allure EF + scatter allure/FC

### Records
- PR par distance (400m → 50km) via Strava best_efforts
- Graphe progression d'un record dans le temps
- Records de performance (TSS, dénivelé, durée, FC max)
- Records de volume (semaine, sortie)

### Séances
- Recherche, filtres type/période/tri
- Pagination 20 par page
- Détail complet : carte Leaflet, graphes FC/allure, laps, météo, analyse auto

### Méthodes
- Documentation complète des formules et méthodes utilisées

---

## 🔧 Notes techniques

- **Stockage** : tout en localStorage (credentials, cache activités, streams)
- **Rate limiting Strava** : pause automatique toutes les 90 requêtes
- **VO2max** : méthode hybride Jack Daniels + Firstbeat, lissage 28j
- **FCmax dynamique** : 99e percentile des séances intenses des 12 derniers mois
- **Best efforts** : chargés en arrière-plan après l'affichage initial
- **Météo** : Open-Meteo gratuit, sans clé API

---

## ⚠️ Limitations connues

- L'API Strava limite à 100 requêtes/15min et 1000/jour
- Le premier chargement peut être lent si vous avez beaucoup d'activités
- Les streams (graphes FC/allure, classification précise) ne sont disponibles que pour les activités récentes (6 derniers mois par défaut)
- Les records nécessitent que les best efforts soient chargés (chargement en arrière-plan)
