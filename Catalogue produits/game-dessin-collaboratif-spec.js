/**
 * SYSTÈME D'ANALYSE AUTOMATIQUE - CHAÎNE DE DESSIN
 * Jeu de dessin collaboratif avec scoring basé sur l'IA
 * 
 * Architecture modulaire pour analyse en temps réel des contributions
 */

// ============================================================================
// STRUCTURES DE DONNÉES
// ============================================================================

/**
 * Structure de données pour une contribution de joueur
 */
class ContributionDessin {
  constructor(joueurId, roundNumber, theme) {
    this.id = this.genererID();
    this.joueurId = joueurId;
    this.roundNumber = roundNumber;
    this.theme = theme;
    this.timestamp = Date.now();
    
    // Images
    this.imageAvant = null; // Base64 de l'image reçue
    this.imageApres = null; // Base64 de l'image après modification
    
    // Données de tracé
    this.traitData = {
      points: [], // [{x, y, timestamp, pression}]
      vitesseMoyenne: 0,
      vitesseMax: 0,
      longueurTotale: 0,
      nombrePauses: 0,
      dureeTotal: 0,
      fluidite: 0
    };
    
    // Scores calculés
    this.scores = {
      fluidite: 0,      // 0-1
      coherence: 0,     // 0-1
      theme: 0,         // 0-1
      creativite: 0,    // 0-1
      total: 0          // 0-4
    };
    
    // Métadonnées d'analyse
    this.analyse = {
      formeDetectees: [],
      pixelsModifies: 0,
      pourcentageModification: 0,
      destruction: false,
      amelioration: false
    };
  }
  
  genererID() {
    return `contrib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Structure pour un joueur
 */
class JoueurDessin {
  constructor(id, nom) {
    this.id = id;
    this.nom = nom;
    this.contributions = []; // Array de ContributionDessin
    this.scoreTotal = 0;
    this.scoreMoyenParCategorie = {
      fluidite: 0,
      coherence: 0,
      theme: 0,
      creativite: 0
    };
    this.titres = []; // Titres obtenus
  }
  
  ajouterContribution(contribution) {
    this.contributions.push(contribution);
    this.calculerScoreTotal();
  }
  
  calculerScoreTotal() {
    this.scoreTotal = this.contributions.reduce((sum, c) => sum + c.scores.total, 0);
    
    // Calcul des moyennes par catégorie
    const nbContrib = this.contributions.length;
    if (nbContrib > 0) {
      this.scoreMoyenParCategorie.fluidite = 
        this.contributions.reduce((sum, c) => sum + c.scores.fluidite, 0) / nbContrib;
      this.scoreMoyenParCategorie.coherence = 
        this.contributions.reduce((sum, c) => sum + c.scores.coherence, 0) / nbContrib;
      this.scoreMoyenParCategorie.theme = 
        this.contributions.reduce((sum, c) => sum + c.scores.theme, 0) / nbContrib;
      this.scoreMoyenParCategorie.creativite = 
        this.contributions.reduce((sum, c) => sum + c.scores.creativite, 0) / nbContrib;
    }
  }
}

// ============================================================================
// ANALYSEUR DE TRACÉ
// ============================================================================

class AnalyseurTrait {
  
  /**
   * Capture les événements de dessin et calcule les métriques
   */
  static capturerTrait(evenements) {
    const trait = {
      points: [],
      vitesseMoyenne: 0,
      vitesseMax: 0,
      longueurTotale: 0,
      nombrePauses: 0,
      dureeTotal: 0,
      fluidite: 0
    };
    
    let dernierPoint = null;
    let dernierTimestamp = null;
    const SEUIL_PAUSE = 150; // ms sans mouvement = pause
    
    for (const evt of evenements) {
      const point = {
        x: evt.x,
        y: evt.y,
        timestamp: evt.timestamp,
        pression: evt.pression || 1.0
      };
      
      trait.points.push(point);
      
      if (dernierPoint) {
        // Calcul de la distance
        const distance = Math.sqrt(
          Math.pow(point.x - dernierPoint.x, 2) + 
          Math.pow(point.y - dernierPoint.y, 2)
        );
        trait.longueurTotale += distance;
        
        // Calcul de la vitesse
        const deltaTemps = (point.timestamp - dernierTimestamp) / 1000; // en secondes
        if (deltaTemps > 0) {
          const vitesse = distance / deltaTemps;
          trait.vitesseMax = Math.max(trait.vitesseMax, vitesse);
          
          // Détection de pause
          if (deltaTemps * 1000 > SEUIL_PAUSE) {
            trait.nombrePauses++;
          }
        }
      }
      
      dernierPoint = point;
      dernierTimestamp = point.timestamp;
    }
    
    // Calculs finaux
    if (trait.points.length > 1) {
      const premierePoint = trait.points[0];
      const dernierePoint = trait.points[trait.points.length - 1];
      trait.dureeTotal = (dernierePoint.timestamp - premierePoint.timestamp) / 1000;
      
      if (trait.dureeTotal > 0) {
        trait.vitesseMoyenne = trait.longueurTotale / trait.dureeTotal;
      }
    }
    
    return trait;
  }
  
  /**
   * Calcule le score de fluidité (0-1)
   */
  static calculerFluidite(traitData) {
    let score = 1.0;
    
    // Pénalité pour les pauses (max -0.3)
    const penalitePauses = Math.min(0.3, traitData.nombrePauses * 0.05);
    score -= penalitePauses;
    
    // Bonus pour la longueur du trait (engagement)
    const bonusLongueur = Math.min(0.2, traitData.longueurTotale / 5000);
    score += bonusLongueur;
    
    // Évaluation de la cohérence de vitesse
    if (traitData.vitesseMax > 0 && traitData.vitesseMoyenne > 0) {
      const ratioVitesse = traitData.vitesseMoyenne / traitData.vitesseMax;
      // Une vitesse constante (ratio proche de 1) est fluide
      // Des pics de vitesse (ratio proche de 0) sont moins fluides
      const bonusVitesse = ratioVitesse * 0.3;
      score += bonusVitesse;
    }
    
    // Normaliser entre 0 et 1
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Analyse la variabilité du tracé pour détecter la fluidité
   */
  static analyserVariabilite(points) {
    if (points.length < 3) return 1.0;
    
    const angles = [];
    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const p3 = points[i + 1];
      
      // Calcul de l'angle entre les segments
      const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
      let diff = Math.abs(angle2 - angle1);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      
      angles.push(diff);
    }
    
    // Calcul de l'écart-type des angles
    const moyenne = angles.reduce((sum, a) => sum + a, 0) / angles.length;
    const variance = angles.reduce((sum, a) => sum + Math.pow(a - moyenne, 2), 0) / angles.length;
    const ecartType = Math.sqrt(variance);
    
    // Écart-type faible = tracé fluide
    // Normaliser sur une échelle 0-1 (écart-type typique ~0.5 radians)
    return Math.max(0, 1 - (ecartType / Math.PI));
  }
}

// ============================================================================
// ANALYSEUR VISUEL (Computer Vision)
// ============================================================================

class AnalyseurVisuel {
  
  /**
   * Compare deux images et calcule les différences
   */
  static comparerImages(imageAvantCanvas, imageApresCanvas) {
    const analyse = {
      pixelsModifies: 0,
      pourcentageModification: 0,
      zonesAjoutees: [],
      zonesSupprimees: [],
      densiteAjout: 0
    };
    
    const ctxAvant = imageAvantCanvas.getContext('2d');
    const ctxApres = imageApresCanvas.getContext('2d');
    
    const width = imageAvantCanvas.width;
    const height = imageAvantCanvas.height;
    
    const dataAvant = ctxAvant.getImageData(0, 0, width, height);
    const dataApres = ctxApres.getImageData(0, 0, width, height);
    
    const pixelsAvant = dataAvant.data;
    const pixelsApres = dataApres.data;
    
    let pixelsDifferents = 0;
    const SEUIL_DIFFERENCE = 30; // Différence RGB minimale pour considérer un changement
    
    for (let i = 0; i < pixelsAvant.length; i += 4) {
      const r1 = pixelsAvant[i];
      const g1 = pixelsAvant[i + 1];
      const b1 = pixelsAvant[i + 2];
      const a1 = pixelsAvant[i + 3];
      
      const r2 = pixelsApres[i];
      const g2 = pixelsApres[i + 1];
      const b2 = pixelsApres[i + 2];
      const a2 = pixelsApres[i + 3];
      
      const diff = Math.sqrt(
        Math.pow(r2 - r1, 2) +
        Math.pow(g2 - g1, 2) +
        Math.pow(b2 - b1, 2) +
        Math.pow(a2 - a1, 2)
      );
      
      if (diff > SEUIL_DIFFERENCE) {
        pixelsDifferents++;
      }
    }
    
    analyse.pixelsModifies = pixelsDifferents;
    analyse.pourcentageModification = (pixelsDifferents / (width * height)) * 100;
    
    // Densité d'ajout (concentration des modifications)
    analyse.densiteAjout = this.calculerDensite(dataAvant, dataApres, width, height);
    
    return analyse;
  }
  
  /**
   * Calcule la densité des modifications (zones concentrées vs dispersées)
   */
  static calculerDensite(dataAvant, dataApres, width, height) {
    const TAILLE_BLOC = 20; // Découper l'image en blocs de 20x20
    const blocsModifies = [];
    
    for (let y = 0; y < height; y += TAILLE_BLOC) {
      for (let x = 0; x < width; x += TAILLE_BLOC) {
        let pixelsModifiesDansBloc = 0;
        
        for (let by = 0; by < TAILLE_BLOC && y + by < height; by++) {
          for (let bx = 0; bx < TAILLE_BLOC && x + bx < width; bx++) {
            const idx = ((y + by) * width + (x + bx)) * 4;
            
            const diff = Math.sqrt(
              Math.pow(dataApres.data[idx] - dataAvant.data[idx], 2) +
              Math.pow(dataApres.data[idx + 1] - dataAvant.data[idx + 1], 2) +
              Math.pow(dataApres.data[idx + 2] - dataAvant.data[idx + 2], 2)
            );
            
            if (diff > 30) pixelsModifiesDansBloc++;
          }
        }
        
        if (pixelsModifiesDansBloc > 0) {
          blocsModifies.push({
            x, y,
            intensite: pixelsModifiesDansBloc / (TAILLE_BLOC * TAILLE_BLOC)
          });
        }
      }
    }
    
    // Densité = ratio entre blocs modifiés et surface totale modifiée
    // Haute densité = modifications concentrées (bon signe)
    // Basse densité = modifications dispersées (chaos)
    if (blocsModifies.length === 0) return 0;
    
    const intensiteMoyenne = blocsModifies.reduce((sum, b) => sum + b.intensite, 0) / blocsModifies.length;
    return intensiteMoyenne;
  }
  
  /**
   * Détecte si le dessin a été détruit/recouvert
   */
  static detecterDestruction(analyseComparaison) {
    // Si plus de 70% de l'image est modifiée = destruction probable
    if (analyseComparaison.pourcentageModification > 70) {
      return true;
    }
    
    // Si la densité est faible et le pourcentage élevé = dessin recouvert
    if (analyseComparaison.densiteAjout < 0.3 && analyseComparaison.pourcentageModification > 50) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Calcule le score de cohérence (0-1)
   */
  static calculerCoherence(analyseComparaison, destruction) {
    let score = 1.0;
    
    // Pénalité massive si destruction
    if (destruction) {
      return 0.0;
    }
    
    // Pénalité si trop de modifications (>40% = chaos)
    if (analyseComparaison.pourcentageModification > 40) {
      score -= 0.5;
    }
    
    // Bonus pour une densité élevée (modifications concentrées)
    score += analyseComparaison.densiteAjout * 0.3;
    
    // Bonus pour une modification modérée (5-30%)
    if (analyseComparaison.pourcentageModification >= 5 && 
        analyseComparaison.pourcentageModification <= 30) {
      score += 0.2;
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Détection de formes simples (cercles, lignes, courbes)
   */
  static detecterFormes(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Algorithme simplifié de détection de contours
    const formes = {
      lignes: 0,
      courbes: 0,
      cercles: 0,
      formesFermees: 0
    };
    
    // TODO: Implémentation complète avec détection de contours (Canny, Hough)
    // Pour l'instant, analyse basique de patterns
    
    return formes;
  }
}

// ============================================================================
// ANALYSEUR DE THÈME (Similarité sémantique)
// ============================================================================

class AnalyseurTheme {
  
  /**
   * Compare le dessin au thème avec une approche simplifiée
   * Dans une vraie app, utiliser un modèle ML type CLIP ou Vision Transformer
   */
  static calculerFideliteTheme(imageCanvas, theme) {
    // MÉTHODE 1: Analyse de mots-clés visuels
    const motsTheme = this.extraireMots(theme);
    const caracteristiquesImage = this.extraireCaracteristiques(imageCanvas);
    
    let score = 0.5; // Score de base neutre
    
    // Détection basique de correspondance
    for (const mot of motsTheme) {
      if (this.detecterCorrespondance(mot, caracteristiquesImage)) {
        score += 0.15;
      }
    }
    
    // MÉTHODE 2: Analyse de couleurs dominantes
    const couleursDominantes = this.extraireCouleursDominantes(imageCanvas);
    if (this.couleursCorrespondentTheme(couleursDominantes, theme)) {
      score += 0.2;
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Extrait les mots-clés du thème
   */
  static extraireMots(theme) {
    return theme.toLowerCase().split(/\s+/);
  }
  
  /**
   * Extrait des caractéristiques visuelles basiques
   */
  static extraireCaracteristiques(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    const caracteristiques = {
      densiteNoir: 0,
      densiteCouleur: 0,
      formesCentrees: false,
      complexite: 0
    };
    
    let pixelsNonBlancs = 0;
    let pixelsCouleur = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      
      if (a > 128) { // Pixel visible
        if (r < 240 || g < 240 || b < 240) { // Pas blanc
          pixelsNonBlancs++;
          
          if (!(r < 50 && g < 50 && b < 50)) { // Pas noir
            pixelsCouleur++;
          }
        }
      }
    }
    
    const totalPixels = canvas.width * canvas.height;
    caracteristiques.densiteNoir = pixelsNonBlancs / totalPixels;
    caracteristiques.densiteCouleur = pixelsCouleur / totalPixels;
    
    return caracteristiques;
  }
  
  /**
   * Détecte une correspondance basique entre mot et caractéristiques
   */
  static detecterCorrespondance(mot, caracteristiques) {
    // Exemples de règles simples
    const motsSimples = {
      'chat': () => caracteristiques.densiteNoir > 0.1,
      'soleil': () => caracteristiques.densiteCouleur > 0.05,
      'maison': () => caracteristiques.densiteNoir > 0.15,
      'arbre': () => caracteristiques.densiteNoir > 0.2,
      // Ajouter d'autres correspondances...
    };
    
    if (motsSimples[mot]) {
      return motsSimples[mot]();
    }
    
    return false;
  }
  
  /**
   * Extrait les couleurs dominantes du dessin
   */
  static extraireCouleursDominantes(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    const compteurCouleurs = {};
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      
      if (a > 128 && (r < 240 || g < 240 || b < 240)) {
        // Quantifier les couleurs (réduire la précision)
        const rQ = Math.floor(r / 50) * 50;
        const gQ = Math.floor(g / 50) * 50;
        const bQ = Math.floor(b / 50) * 50;
        const cle = `${rQ},${gQ},${bQ}`;
        
        compteurCouleurs[cle] = (compteurCouleurs[cle] || 0) + 1;
      }
    }
    
    // Trier par fréquence et retourner top 3
    const couleursTriees = Object.entries(compteurCouleurs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([couleur, count]) => {
        const [r, g, b] = couleur.split(',').map(Number);
        return { r, g, b, count };
      });
    
    return couleursTriees;
  }
  
  /**
   * Vérifie si les couleurs correspondent au thème
   */
  static couleursCorrespondentTheme(couleurs, theme) {
    const themeLower = theme.toLowerCase();
    
    // Associations couleur-thème simplifiées
    const associations = {
      'soleil': (c) => c.r > 200 && c.g > 150 && c.b < 100, // Jaune/orange
      'ciel': (c) => c.b > 200 && c.r < 100 && c.g > 100,   // Bleu
      'arbre': (c) => c.g > 100 && c.r < 150 && c.b < 150,  // Vert
      'nuit': (c) => c.r < 50 && c.g < 50 && c.b < 100,     // Sombre
      // Ajouter d'autres associations...
    };
    
    for (const [mot, testCouleur] of Object.entries(associations)) {
      if (themeLower.includes(mot)) {
        return couleurs.some(testCouleur);
      }
    }
    
    return false;
  }
}

// ============================================================================
// ANALYSEUR DE CRÉATIVITÉ
// ============================================================================

class AnalyseurCreativite {
  
  /**
   * Évalue la créativité de la contribution
   */
  static calculerCreativite(contribution, historiqueDessin) {
    let score = 0.5; // Score de base neutre
    
    // 1. Bonus pour transformation significative mais cohérente
    if (contribution.analyse.pourcentageModification > 10 && 
        contribution.analyse.pourcentageModification < 40) {
      score += 0.3;
    }
    
    // 2. Bonus pour ajout de détails (haute densité)
    if (contribution.analyse.densiteAjout > 0.6) {
      score += 0.2;
    }
    
    // 3. Détection de "twist amusant" (changement de direction du dessin)
    if (this.detecterTwist(contribution, historiqueDessin)) {
      score += 0.3;
    }
    
    // 4. Pénalité pour destruction ou chaos
    if (contribution.analyse.destruction) {
      score -= 0.5;
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Détecte un "twist créatif" dans le dessin
   */
  static detecterTwist(contribution, historiqueDessin) {
    // Un twist = transformation créative qui réinterprète le dessin
    // sans le détruire
    
    if (historiqueDessin.length < 1) return false;
    
    const dernierDessin = historiqueDessin[historiqueDessin.length - 1];
    
    // Critères d'un twist:
    // - Modification significative (>25%)
    // - Pas de destruction
    // - Maintien de la cohérence
    
    return (
      contribution.analyse.pourcentageModification > 25 &&
      !contribution.analyse.destruction &&
      contribution.scores.coherence > 0.5
    );
  }
  
  /**
   * Calcule un score de "chaos amusant" vs "chaos destructeur"
   */
  static evaluerChaos(contribution) {
    const modif = contribution.analyse.pourcentageModification;
    const densite = contribution.analyse.densiteAjout;
    
    // Chaos amusant = beaucoup de modifications mais concentrées
    if (modif > 40 && densite > 0.5) {
      return 'amusant';
    }
    
    // Chaos destructeur = beaucoup de modifications dispersées
    if (modif > 60 && densite < 0.3) {
      return 'destructeur';
    }
    
    return 'normal';
  }
}

// ============================================================================
// MOTEUR DE SCORING PRINCIPAL
// ============================================================================

class MoteurScoring {
  
  /**
   * Analyse complète d'une contribution et calcul des scores
   */
  static async analyserContribution(contribution, canvasAvant, canvasApres) {
    
    // 1. Analyse du trait
    contribution.traitData.fluidite = AnalyseurTrait.calculerFluidite(contribution.traitData);
    const variabilite = AnalyseurTrait.analyserVariabilite(contribution.traitData.points);
    
    // Score final de fluidité (moyenne pondérée)
    contribution.scores.fluidite = (contribution.traitData.fluidite * 0.7 + variabilite * 0.3);
    
    // 2. Analyse visuelle
    const analyseComparaison = AnalyseurVisuel.comparerImages(canvasAvant, canvasApres);
    contribution.analyse.pixelsModifies = analyseComparaison.pixelsModifies;
    contribution.analyse.pourcentageModification = analyseComparaison.pourcentageModification;
    contribution.analyse.densiteAjout = analyseComparaison.densiteAjout;
    
    const destruction = AnalyseurVisuel.detecterDestruction(analyseComparaison);
    contribution.analyse.destruction = destruction;
    
    contribution.scores.coherence = AnalyseurVisuel.calculerCoherence(analyseComparaison, destruction);
    
    // 3. Analyse du thème
    contribution.scores.theme = AnalyseurTheme.calculerFideliteTheme(canvasApres, contribution.theme);
    
    // 4. Analyse de créativité
    contribution.scores.creativite = AnalyseurCreativite.calculerCreativite(contribution, []);
    
    // 5. Score total
    contribution.scores.total = 
      contribution.scores.fluidite +
      contribution.scores.coherence +
      contribution.scores.theme +
      contribution.scores.creativite;
    
    return contribution;
  }
  
  /**
   * Détermine les gagnants et attribue les titres
   */
  static determinerGagnants(joueurs) {
    const resultats = {
      gagnant: null,
      titres: {}
    };
    
    // Trier par score total
    const joueursTriesScore = [...joueurs].sort((a, b) => b.scoreTotal - a.scoreTotal);
    resultats.gagnant = joueursTriesScore[0];
    resultats.titres['chainon-or'] = joueursTriesScore[0];
    
    // Maître du Swipe (meilleure fluidité)
    const joueursTriesFluidite = [...joueurs].sort(
      (a, b) => b.scoreMoyenParCategorie.fluidite - a.scoreMoyenParCategorie.fluidite
    );
    resultats.titres['maitre-swipe'] = joueursTriesFluidite[0];
    
    // Génie du Thème (meilleure fidélité)
    const joueursTriesTheme = [...joueurs].sort(
      (a, b) => b.scoreMoyenParCategorie.theme - a.scoreMoyenParCategorie.theme
    );
    resultats.titres['genie-theme'] = joueursTriesTheme[0];
    
    // Seigneur du Chaos (plus de modifications significatives)
    const joueursTriesChaos = [...joueurs].sort((a, b) => {
      const chaosA = a.contributions.reduce((sum, c) => 
        sum + c.analyse.pourcentageModification, 0
      );
      const chaosB = b.contributions.reduce((sum, c) => 
        sum + c.analyse.pourcentageModification, 0
      );
      return chaosB - chaosA;
    });
    resultats.titres['seigneur-chaos'] = joueursTriesChaos[0];
    
    return resultats;
  }
}

// ============================================================================
// API D'INTÉGRATION
// ============================================================================

class GameDrawingChainAPI {
  constructor() {
    this.joueurs = new Map();
    this.contributions = [];
    this.roundActuel = 1;
    this.themeActuel = '';
  }
  
  /**
   * Initialiser une partie
   */
  initialiserPartie(idsJoueurs, nomsJoueurs, theme) {
    this.themeActuel = theme;
    this.roundActuel = 1;
    
    for (let i = 0; i < idsJoueurs.length; i++) {
      const joueur = new JoueurDessin(idsJoueurs[i], nomsJoueurs[i]);
      this.joueurs.set(idsJoueurs[i], joueur);
    }
  }
  
  /**
   * Enregistrer une contribution
   */
  async enregistrerContribution(joueurId, traitData, canvasAvant, canvasApres) {
    const contribution = new ContributionDessin(joueurId, this.roundActuel, this.themeActuel);
    
    // Copier les données de trait
    contribution.traitData = traitData;
    
    // Analyse automatique
    await MoteurScoring.analyserContribution(contribution, canvasAvant, canvasApres);
    
    // Ajouter au joueur
    const joueur = this.joueurs.get(joueurId);
    if (joueur) {
      joueur.ajouterContribution(contribution);
    }
    
    this.contributions.push(contribution);
    
    return contribution;
  }
  
  /**
   * Terminer le round et passer au suivant
   */
  terminerRound() {
    this.roundActuel++;
  }
  
  /**
   * Calculer les résultats finaux
   */
  calculerResultatsFinaux() {
    const joueursArray = Array.from(this.joueurs.values());
    const resultats = MoteurScoring.determinerGagnants(joueursArray);
    
    return {
      gagnant: resultats.gagnant,
      classement: joueursArray.sort((a, b) => b.scoreTotal - a.scoreTotal),
      titres: resultats.titres,
      contributions: this.contributions
    };
  }
  
  /**
   * Obtenir le score d'un joueur en temps réel
   */
  obtenirScoreJoueur(joueurId) {
    const joueur = this.joueurs.get(joueurId);
    return joueur ? {
      nom: joueur.nom,
      scoreTotal: joueur.scoreTotal,
      scores: joueur.scoreMoyenParCategorie,
      contributions: joueur.contributions.length
    } : null;
  }
}

// ============================================================================
// EXEMPLE D'UTILISATION
// ============================================================================

/*
// 1. Initialiser le jeu
const game = new GameDrawingChainAPI();
game.initialiserPartie(
  ['player1', 'player2', 'player3'],
  ['Alice', 'Bob', 'Charlie'],
  'Un chat dans l\'espace'
);

// 2. Pendant le jeu, capturer les événements de dessin
const evenementsDessin = [
  {x: 100, y: 100, timestamp: Date.now(), pression: 1.0},
  {x: 105, y: 102, timestamp: Date.now() + 10, pression: 1.0},
  // ... plus d'événements
];

const traitData = AnalyseurTrait.capturerTrait(evenementsDessin);

// 3. Enregistrer la contribution après swipe
const canvasAvant = document.getElementById('canvas-avant');
const canvasApres = document.getElementById('canvas-apres');

const contribution = await game.enregistrerContribution(
  'player1',
  traitData,
  canvasAvant,
  canvasApres
);

console.log('Score obtenu:', contribution.scores);

// 4. Après 3 rounds, calculer les résultats
const resultatsFinaux = game.calculerResultatsFinaux();

console.log('Gagnant:', resultatsFinaux.gagnant.nom);
console.log('Score:', resultatsFinaux.gagnant.scoreTotal);
console.log('Titres:', resultatsFinaux.titres);
*/

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ContributionDessin,
    JoueurDessin,
    AnalyseurTrait,
    AnalyseurVisuel,
    AnalyseurTheme,
    AnalyseurCreativite,
    MoteurScoring,
    GameDrawingChainAPI
  };
}
