/* ============================================================
   tips.js — Contextual help content and modal management
   ============================================================ */

const TIPS = {
  tsb: {
    title: 'TSB — Training Stress Balance (Forme)',
    body: `
      <p>Le <strong>TSB (Training Stress Balance)</strong> mesure votre "forme" du moment, définie comme :</p>
      <p><code>TSB = CTL − ATL</code></p>
      <ul>
        <li><strong>TSB &gt; 5</strong> : Forme fraîche, idéal pour une compétition ou séance clé</li>
        <li><strong>TSB 0 à 5</strong> : Équilibre entraînement/récupération</li>
        <li><strong>TSB -10 à 0</strong> : Fatigue légère, normal en phase de charge</li>
        <li><strong>TSB &lt; -20</strong> : Fatigue importante, risque de surmenage</li>
      </ul>
      <p>Un TSB très négatif indique un besoin de récupération. Un TSB très positif peut indiquer un désentraînement.</p>
    `
  },
  atl: {
    title: 'ATL / CTL / TSB',
    body: `
      <p><strong>ATL (Acute Training Load)</strong> — Fatigue à court terme, moyenne exponentielle sur 7 jours de TSS.</p>
      <p><strong>CTL (Chronic Training Load)</strong> — Forme aérobie à long terme, moyenne exponentielle sur 42 jours de TSS.</p>
      <p><strong>TSB (Training Stress Balance)</strong> = CTL − ATL</p>
      <p><strong>TSS (Training Stress Score)</strong> = (durée en heures) × (FC_moy / FCmax)² × 100</p>
      <p>Ces métriques sont inspirées du modèle de forme athlétique de Banister (1975), popularisé par TrainingPeaks.</p>
    `
  },
  vo2max: {
    title: 'VO2max — Méthode hybride',
    body: `
      <p>La VO2max est estimée avec une méthode hybride en 3 étapes :</p>
      <ol>
        <li><strong>Ancrage compétition</strong> : Inverse Jack Daniels<br>
        <code>VO2(v) = 0.000104v² + 0.182258v − 4.602</code><br>
        où v = vitesse en m/min</li>
        <li><strong>Séances Firstbeat</strong> : <code>VO2max ≈ (v×0.2+3.5) × (FCmax/FC_moy)</code></li>
        <li><strong>Lissage 28 jours</strong> pour lisser les variations dues à la chaleur, la fatigue, etc.</li>
      </ol>
      <p>⚠️ Les séances à &gt; 25°C sont exclues du calcul car la chaleur augmente artificiellement la FC.</p>
    `
  },
  vdot: {
    title: 'VDOT — Jack Daniels',
    body: `
      <p>Le <strong>VDOT</strong> est une approximation de la VO2max dérivée de la performance en course. Il permet de calculer des allures d'entraînement personnalisées.</p>
      <p>Les allures recommandées (en % de VMA) :</p>
      <ul>
        <li>Récupération : 59% VMA</li>
        <li>Endurance fondamentale : 65% VMA</li>
        <li>Tempo : 80% VMA</li>
        <li>Seuil : 85% VMA</li>
        <li>Intervalles : 97,5% VMA</li>
        <li>Répétitions : 105% VMA</li>
        <li>Marathon : 75% VMA</li>
      </ul>
    `
  },
  zones: {
    title: 'Zones FC — Calibration dynamique',
    body: `
      <p>Les 5 zones sont calculées en pourcentage de votre <strong>FCmax dynamique</strong>, estimée comme le 99e percentile des FC max des séances intenses des 12 derniers mois.</p>
      <table>
        <tr><th>Zone</th><th>%FCmax</th><th>Objectif</th></tr>
        <tr><td>Z1 — Récup.</td><td>&lt; 60%</td><td>Récupération active</td></tr>
        <tr><td>Z2 — EF</td><td>60–75%</td><td>Endurance fondamentale</td></tr>
        <tr><td>Z3 — Tempo</td><td>75–85%</td><td>Seuil aérobie</td></tr>
        <tr><td>Z4 — Seuil</td><td>85–93%</td><td>Seuil anaérobie</td></tr>
        <tr><td>Z5 — VO2max</td><td>&gt; 93%</td><td>VO2max, puissance</td></tr>
      </table>
      <p>Les zones sont calibrées pour que les séances d'EF typiques tombent en Zone 2.</p>
    `
  },
  tss: {
    title: 'TSS — Training Stress Score',
    body: `
      <p>Le <strong>TSS</strong> quantifie la charge d'une séance en combinant durée et intensité :</p>
      <p><code>TSS = durée (heures) × (FC_moy / FCmax)² × 100</code></p>
      <p>Une séance de 1h à 75% FCmax donne TSS = 0,5625 × 100 ≈ 56.</p>
      <p>Une course de 2h à 90% FCmax donne TSS = 1,62 × 100 ≈ 162.</p>
    `
  },
  classification: {
    title: 'Classification automatique des séances',
    body: `
      <p>Chaque séance est analysée via les streams Strava (vitesse, FC, altitude seconde par seconde) et classifiée parmi 13 catégories :</p>
      <ul>
        <li><strong>Récupération</strong> : &lt;6km, FC&lt;65%, &lt;40min</li>
        <li><strong>EF (Endurance fondamentale)</strong> : FC&lt;78%, vitesse stable</li>
        <li><strong>Sortie longue</strong> : EF + distance ≥15km</li>
        <li><strong>Sortie longue progressive</strong> : SL + accélération en 2e moitié</li>
        <li><strong>Tempo</strong> : FC 78–86%, vitesse stable, &gt;6km</li>
        <li><strong>Seuil</strong> : FC&gt;86%, vitesse stable, 4–12km</li>
        <li><strong>Intervalles courts/médiums/longs</strong> : blocs d'effort répétés</li>
        <li><strong>Compétition</strong> : FC&gt;88%, vitesse stable, &gt;5km</li>
        <li><strong>Affûtage</strong> : séance légère avant compétition</li>
        <li><strong>Côtes</strong> : 25–35m/km de dénivelé</li>
        <li><strong>Trail</strong> : &gt;35m/km de dénivelé</li>
      </ul>
      <p>Les seuils FC sont calculés dynamiquement (% FCmax) pour s'adapter à tous les niveaux.</p>
    `
  }
};

// Initialize tip buttons via event delegation
function initTips() {
  // Delegate on document since buttons may be added dynamically
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tip-btn');
    if (btn) {
      const key = btn.getAttribute('data-tip');
      showTip(key);
    }
  });

  // Close tip modal
  document.getElementById('tip-modal-close').addEventListener('click', closeTip);
  document.getElementById('tip-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('tip-modal')) closeTip();
  });
}

function showTip(key) {
  const tip = TIPS[key];
  if (!tip) return;
  const modal = document.getElementById('tip-modal');
  document.getElementById('tip-modal-title').textContent = tip.title;
  document.getElementById('tip-modal-body').innerHTML = tip.body;
  modal.classList.remove('hidden');
}

function closeTip() {
  document.getElementById('tip-modal').classList.add('hidden');
}
