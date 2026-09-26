export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de';

export const TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    diary: 'Diary',
    fitness: 'Fitness',
    plan: 'Plan',
    reports: 'Reports',
    me: 'Me',
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
    eaten: 'Eaten',
    exercise: 'Exercise',
    target: 'Target',
    left: 'Left',
    kcalRemaining: 'kcal remaining',
    kcalOver: 'kcal over',
    waterTracker: 'Water Tracker',
    logExercise: 'Log Exercise',
    addFood: 'Add Food',
    fastingTimer: 'Fasting Timer',
    tipOfTheDay: 'Tip of the Day',
    energyCheckIn: "How's your energy today?",
    logCraving: 'Log a craving',
    wins: 'Wins',
    createAccount: 'Create account',
    notNow: 'Not now',
    startFresh: 'Start fresh',
    offlineWillSync: 'Offline — will sync',
    language: 'Language'
  },
  es: {
    diary: 'Diario',
    fitness: 'Ejercicio',
    plan: 'Plan',
    reports: 'Informes',
    me: 'Perfil',
    breakfast: 'Desayuno',
    lunch: 'Almuerzo',
    dinner: 'Cena',
    snack: 'Snacks',
    eaten: 'Consumido',
    exercise: 'Ejercicio',
    target: 'Objetivo',
    left: 'Restante',
    kcalRemaining: 'kcal restantes',
    kcalOver: 'kcal de exceso',
    waterTracker: 'Agua',
    logExercise: 'Registrar ejercicio',
    addFood: 'Añadir alimento',
    fastingTimer: 'Ayuno intermitente',
    tipOfTheDay: 'Consejo del día',
    energyCheckIn: '¿Cómo está tu energía hoy?',
    logCraving: 'Registrar un antojo',
    wins: 'Victorias',
    createAccount: 'Crear cuenta',
    notNow: 'Ahora no',
    startFresh: 'Empezar de nuevo',
    offlineWillSync: 'Sin conexión — se sincronizará',
    language: 'Idioma'
  },
  fr: {
    diary: 'Journal',
    fitness: 'Activité',
    plan: 'Plan',
    reports: 'Rapports',
    me: 'Profil',
    breakfast: 'Petit-déjeuner',
    lunch: 'Déjeuner',
    dinner: 'Dîner',
    snack: 'Collations',
    eaten: 'Consommé',
    exercise: 'Exercice',
    target: 'Objectif',
    left: 'Restant',
    kcalRemaining: 'kcal restantes',
    kcalOver: 'kcal dépassées',
    waterTracker: 'Hydratation',
    logExercise: 'Noter un exercice',
    addFood: 'Ajouter un aliment',
    fastingTimer: 'Minuteur de jeûne',
    tipOfTheDay: 'Conseil du jour',
    energyCheckIn: "Comment est votre énergie aujourd'hui ?",
    logCraving: 'Noter une envie',
    wins: 'Victoires',
    createAccount: 'Créer un compte',
    notNow: 'Pas maintenant',
    startFresh: 'Recommencer à zéro',
    offlineWillSync: 'Hors ligne — synchronisation en attente',
    language: 'Langue'
  },
  de: {
    diary: 'Tagebuch',
    fitness: 'Fitness',
    plan: 'Plan',
    reports: 'Berichte',
    me: 'Ich',
    breakfast: 'Frühstück',
    lunch: 'Mittagessen',
    dinner: 'Abendessen',
    snack: 'Snacks',
    eaten: 'Gegessen',
    exercise: 'Training',
    target: 'Ziel',
    left: 'Übrig',
    kcalRemaining: 'kcal übrig',
    kcalOver: 'kcal darüber',
    waterTracker: 'Wasser-Tracker',
    logExercise: 'Training eintragen',
    addFood: 'Essen hinzufügen',
    fastingTimer: 'Fasten-Timer',
    tipOfTheDay: 'Tipp des Tages',
    energyCheckIn: 'Wie ist deine Energie heute?',
    logCraving: 'Heißhunger eintragen',
    wins: 'Erfolge',
    createAccount: 'Konto erstellen',
    notNow: 'Nicht jetzt',
    startFresh: 'Neu starten',
    offlineWillSync: 'Offline — wird synchronisiert',
    language: 'Sprache'
  }
};

export function detectDefaultLanguage(): SupportedLanguage {
  if (typeof navigator === 'undefined') return 'en';
  const stored = localStorage.getItem('caloriq_lang') as SupportedLanguage | null;
  if (stored && TRANSLATIONS[stored]) return stored;
  const raw = (navigator.language || 'en').slice(0, 2).toLowerCase();
  if (raw === 'es' || raw === 'fr' || raw === 'de') return raw;
  return 'en';
}

export function t(key: string, lang?: SupportedLanguage): string {
  const active = lang || detectDefaultLanguage();
  return TRANSLATIONS[active]?.[key] || TRANSLATIONS.en[key] || key;
}
