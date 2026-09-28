// Letter Pantry — strings for the Graphics settings section, in every product
// locale. The rest of the interface is English-only (spec §10); this catalogue
// is picked from navigator.language and falls back to en-US.

const EN = {
  graphics: 'Graphics',
  quality: 'Quality',
  auto: 'Auto (detected: {tier})',
  renderScale: 'Render scale',
  fromPreset: 'From preset ({tier})',
  adaptive: 'Adaptive resolution',
  showFps: 'Show frame rate',
  postUnavailable: 'Post-processing is unavailable on this device; the scene is drawn without it.',
  noWebgl: '3D view unavailable; graphics settings have no effect.',
  gpuUnknown: 'unknown GPU',
  cat_shadows: 'Shadows', cat_ao: 'Ambient occlusion', cat_bloom: 'Bloom', cat_grade: 'Color grade',
  cat_antialias: 'Anti-aliasing', cat_reflections: 'Reflections', cat_detail: 'Surface detail',
  cat_particles: 'Particles', cat_background: 'Ambient motion',
  t_off: 'Off', t_on: 'On', t_low: 'Low', t_medium: 'Medium', t_high: 'High', t_balanced: 'Balanced',
  t_ultra: 'Ultra', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Plain',
  t_detailed: 'Detailed', t_static: 'Static', t_animated: 'Animated',
};

const ES = {
  graphics: 'Gráficos', quality: 'Calidad', auto: 'Automática (detectada: {tier})',
  renderScale: 'Escala de renderizado', fromPreset: 'Según el ajuste ({tier})',
  adaptive: 'Resolución adaptativa', showFps: 'Mostrar fotogramas por segundo',
  postUnavailable: 'El posprocesado no está disponible en este dispositivo; la escena se dibuja sin él.',
  noWebgl: 'Vista 3D no disponible; los ajustes gráficos no tienen efecto.', gpuUnknown: 'GPU desconocida',
  cat_shadows: 'Sombras', cat_ao: 'Oclusión ambiental', cat_bloom: 'Resplandor', cat_grade: 'Corrección de color',
  cat_antialias: 'Suavizado', cat_reflections: 'Reflejos', cat_detail: 'Detalle de superficies',
  cat_particles: 'Partículas', cat_background: 'Movimiento ambiental',
  t_off: 'No', t_on: 'Sí', t_low: 'Baja', t_medium: 'Media', t_high: 'Alta', t_balanced: 'Equilibrada',
  t_ultra: 'Ultra', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Sencillo',
  t_detailed: 'Detallado', t_static: 'Estático', t_animated: 'Animado',
};

const FR = {
  graphics: 'Graphismes', quality: 'Qualité', auto: 'Auto (détectée : {tier})',
  renderScale: 'Échelle de rendu', fromPreset: 'Selon le préréglage ({tier})',
  adaptive: 'Résolution adaptative', showFps: 'Afficher les images par seconde',
  postUnavailable: 'Le post-traitement est indisponible sur cet appareil ; la scène est affichée sans.',
  noWebgl: 'Vue 3D indisponible ; les réglages graphiques sont sans effet.', gpuUnknown: 'GPU inconnu',
  cat_shadows: 'Ombres', cat_ao: 'Occlusion ambiante', cat_bloom: 'Halo lumineux', cat_grade: 'Étalonnage des couleurs',
  cat_antialias: 'Anticrénelage', cat_reflections: 'Reflets', cat_detail: 'Détail des surfaces',
  cat_particles: 'Particules', cat_background: 'Animation d’ambiance',
  t_off: 'Désactivé', t_on: 'Activé', t_low: 'Basse', t_medium: 'Moyenne', t_high: 'Haute', t_balanced: 'Équilibrée',
  t_ultra: 'Ultra', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Simple',
  t_detailed: 'Détaillé', t_static: 'Statique', t_animated: 'Animé',
};

export const GFX_STRINGS = {
  'en-US': EN,
  'en-GB': { ...EN, cat_grade: 'Colour grade' },
  'es-419': ES,
  'es-ES': { ...ES, renderScale: 'Escala de renderizado', showFps: 'Mostrar FPS' },
  'de-DE': {
    graphics: 'Grafik', quality: 'Qualität', auto: 'Automatisch (erkannt: {tier})',
    renderScale: 'Renderskalierung', fromPreset: 'Laut Voreinstellung ({tier})',
    adaptive: 'Adaptive Auflösung', showFps: 'Bildrate anzeigen',
    postUnavailable: 'Nachbearbeitung ist auf diesem Gerät nicht verfügbar; die Szene wird ohne sie dargestellt.',
    noWebgl: '3D-Ansicht nicht verfügbar; Grafikeinstellungen haben keine Wirkung.', gpuUnknown: 'unbekannte GPU',
    cat_shadows: 'Schatten', cat_ao: 'Umgebungsverdeckung', cat_bloom: 'Leuchteffekt', cat_grade: 'Farbkorrektur',
    cat_antialias: 'Kantenglättung', cat_reflections: 'Spiegelungen', cat_detail: 'Oberflächendetails',
    cat_particles: 'Partikel', cat_background: 'Umgebungsbewegung',
    t_off: 'Aus', t_on: 'An', t_low: 'Niedrig', t_medium: 'Mittel', t_high: 'Hoch', t_balanced: 'Ausgewogen',
    t_ultra: 'Ultra', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Schlicht',
    t_detailed: 'Detailliert', t_static: 'Statisch', t_animated: 'Animiert',
  },
  'fr-FR': FR,
  'fr-CA': { ...FR, showFps: 'Afficher la fréquence d’images' },
  'pt-BR': {
    graphics: 'Gráficos', quality: 'Qualidade', auto: 'Automática (detectada: {tier})',
    renderScale: 'Escala de renderização', fromPreset: 'Conforme a predefinição ({tier})',
    adaptive: 'Resolução adaptativa', showFps: 'Mostrar taxa de quadros',
    postUnavailable: 'O pós-processamento não está disponível neste dispositivo; a cena é desenhada sem ele.',
    noWebgl: 'Visão 3D indisponível; as configurações gráficas não têm efeito.', gpuUnknown: 'GPU desconhecida',
    cat_shadows: 'Sombras', cat_ao: 'Oclusão ambiente', cat_bloom: 'Brilho', cat_grade: 'Correção de cor',
    cat_antialias: 'Suavização', cat_reflections: 'Reflexos', cat_detail: 'Detalhe das superfícies',
    cat_particles: 'Partículas', cat_background: 'Movimento ambiente',
    t_off: 'Desligado', t_on: 'Ligado', t_low: 'Baixa', t_medium: 'Média', t_high: 'Alta', t_balanced: 'Equilibrada',
    t_ultra: 'Ultra', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Simples',
    t_detailed: 'Detalhado', t_static: 'Estático', t_animated: 'Animado',
  },
  'it-IT': {
    graphics: 'Grafica', quality: 'Qualità', auto: 'Automatica (rilevata: {tier})',
    renderScale: 'Scala di rendering', fromPreset: 'Da preimpostazione ({tier})',
    adaptive: 'Risoluzione adattiva', showFps: 'Mostra frequenza fotogrammi',
    postUnavailable: 'La post-elaborazione non è disponibile su questo dispositivo; la scena viene disegnata senza.',
    noWebgl: 'Vista 3D non disponibile; le impostazioni grafiche non hanno effetto.', gpuUnknown: 'GPU sconosciuta',
    cat_shadows: 'Ombre', cat_ao: 'Occlusione ambientale', cat_bloom: 'Bagliore', cat_grade: 'Correzione colore',
    cat_antialias: 'Antialiasing', cat_reflections: 'Riflessi', cat_detail: 'Dettaglio superfici',
    cat_particles: 'Particelle', cat_background: 'Movimento ambientale',
    t_off: 'No', t_on: 'Sì', t_low: 'Bassa', t_medium: 'Media', t_high: 'Alta', t_balanced: 'Bilanciata',
    t_ultra: 'Ultra', t_fxaa: 'FXAA', t_smaa: 'SMAA', t_msaa: 'MSAA', t_plain: 'Semplice',
    t_detailed: 'Dettagliato', t_static: 'Statico', t_animated: 'Animato',
  },
};

/** Best catalogue for a BCP 47 tag: exact, then same language, then en-US. */
export function pickLocale(tag) {
  const t = String(tag || '');
  if (GFX_STRINGS[t]) return t;
  const lang = t.split('-')[0].toLowerCase();
  if (lang === 'es') return /^es-(ES)?$/i.test(t) ? 'es-ES' : 'es-419';
  if (lang === 'pt') return 'pt-BR';
  return Object.keys(GFX_STRINGS).find((k) => k.split('-')[0] === lang) || 'en-US';
}

export function gfxT(locale, key, vars) {
  const table = GFX_STRINGS[locale] || EN;
  let s = table[key] ?? EN[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
