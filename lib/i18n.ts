import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Language {
  code: string
  name: string
  flag: string
  currency: string
  currencySymbol: string
  rate: number
}

export const languages: Language[] = [
  { code: 'en', name: 'English', flag: '🇺🇸', currency: 'USD', currencySymbol: '$', rate: 1 },
  { code: 'en-gb', name: 'English (UK)', flag: '🇬🇧', currency: 'GBP', currencySymbol: '£', rate: 0.79 },
  { code: 'en-jm', name: 'English (JA)', flag: '🇯🇲', currency: 'JMD', currencySymbol: 'J$', rate: 155.50 },
  { code: 'es', name: 'Español', flag: '🇪🇸', currency: 'EUR', currencySymbol: '€', rate: 0.92 },
  { code: 'fr', name: 'Français', flag: '🇫🇷', currency: 'EUR', currencySymbol: '€', rate: 0.92 },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', currency: 'EUR', currencySymbol: '€', rate: 0.92 },
  { code: 'pt', name: 'Português', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$', rate: 5.05 },
  { code: 'ja', name: '日本語', flag: '🇯🇵', currency: 'JPY', currencySymbol: '¥', rate: 154.50 },
  { code: 'zh', name: '中文', flag: '🇨🇳', currency: 'CNY', currencySymbol: '¥', rate: 7.24 },
  { code: 'ko', name: '한국어', flag: '🇰🇷', currency: 'KRW', currencySymbol: '₩', rate: 1365 },
]

const T: Record<string, Record<string, string>> = {
  es: {
    'Discover': 'Descubre', 'beyond the resort.': 'mas alla del resort.',
    'Authentic cultural experiences crafted by locals who know the island best.': 'Experiencias culturales autenticas creadas por locales que conocen mejor la isla.',
    'Popular destinations': 'Destinos populares', 'Featured experiences': 'Experiencias destacadas',
    'View all': 'Ver todo', 'Curated for you': 'Seleccionado para ti',
    'More experiences': 'Mas experiencias', 'Trending Now': 'Tendencia ahora',
    'All experiences': 'Todas las experiencias', 'Load more': 'Cargar mas',
    'Add to Trip': 'Agregar al viaje', '✓ Added': '✓ Agregado', '✓ In Trip': '✓ En viaje',
    'Explore': 'Explorar', 'Profile': 'Perfil', 'Itinerary': 'Itinerario', 'Checkout': 'Pagar',
    'Search destinations': 'Buscar destinos', 'Search destinations, activities...': 'Buscar destinos, actividades...',
    '/person': '/persona', 'From': 'Desde',
    'A Taste of Jamaica': 'Un sabor de Jamaica', 'Food & Culture': 'Comida y cultura',
    'Your Itinerary': 'Tu itinerario', 'experience': 'experiencia', 'experiences': 'experiencias',
    'Continue to checkout': 'Continuar al pago', 'Free cancellation within 48 hours': 'Cancelacion gratuita en 48 horas',
    'Remove': 'Eliminar', 'Subtotal': 'Subtotal', 'Booking fee (5%)': 'Tarifa de reserva (5%)', 'Total': 'Total',
    'Review your trip': 'Revisa tu viaje', 'Your details': 'Tus datos', 'Payment': 'Pago',
    'First Name': 'Nombre', 'Last Name': 'Apellido', 'Email': 'Correo', 'Phone': 'Telefono', 'Country': 'Pais',
    'Special Requests': 'Solicitudes especiales', 'Continue to details': 'Continuar a detalles',
    'Continue to payment': 'Continuar al pago', 'Complete booking': 'Completar reserva',
    'Booking Confirmed': 'Reserva confirmada', 'Explore more experiences': 'Explorar mas experiencias',
    'Number of guests': 'Numero de huespedes', 'Applies to all': 'Aplica a todos',
    'Trip date': 'Fecha del viaje', 'All experiences on the same day': 'Todas las experiencias el mismo dia',
    'Choose different dates for each tour': 'Elegir fechas diferentes para cada tour',
    'Use same date for all tours': 'Usar la misma fecha para todos los tours',
    'Activity Waiver & Release': 'Exencion de actividad', 'Browse experiences': 'Explorar experiencias',
    'Your itinerary is empty': 'Tu itinerario esta vacio', 'Order Summary': 'Resumen del pedido',
    'When': 'Cuando', 'Where': 'Donde', 'Who': 'Quien', 'Guests': 'Huespedes', 'Any dates': 'Cualquier fecha',
    'Add a comment...': 'Agregar un comentario...', 'Comments': 'Comentarios', 'Reply': 'Responder',
    'Share': 'Compartir', 'Send': 'Enviar', 'No comments yet. Be the first!': 'Sin comentarios aun. Se el primero!',
    'Why MAPL Tours': 'Por que MAPL Tours',
    'The authenticity of local culture.': 'La autenticidad de la cultura local.',
    'The comfort of a curated trip.': 'La comodidad de un viaje curado.',
    'Only the best experiences': 'Solo las mejores experiencias',
    'Real local creators': 'Creadores locales reales',
    '24/7 trip support': 'Soporte de viaje 24/7',
    'Free cancellation': 'Cancelacion gratuita',
    '90%+ satisfaction': '90%+ satisfaccion',
    'Supports local economy': 'Apoya la economia local',
    'Contact Us': 'Contactanos', 'Get in touch': 'Ponerse en contacto',
    'more': 'mas',
  },
  fr: {
    'Discover': 'Decouvrez', 'beyond the resort.': 'au-dela du resort.',
    'Authentic cultural experiences crafted by locals who know the island best.': 'Experiences culturelles authentiques creees par des locaux qui connaissent le mieux ile.',
    'Popular destinations': 'Destinations populaires', 'Featured experiences': 'Experiences en vedette',
    'View all': 'Voir tout', 'Curated for you': 'Selectionne pour vous',
    'More experiences': 'Plus d\'experiences', 'Trending Now': 'Tendance maintenant',
    'All experiences': 'Toutes les experiences', 'Load more': 'Charger plus',
    'Add to Trip': 'Ajouter au voyage', '✓ Added': '✓ Ajoute', '✓ In Trip': '✓ Dans le voyage',
    'Explore': 'Explorer', 'Profile': 'Profil', 'Itinerary': 'Itineraire', 'Checkout': 'Payer',
    'Search destinations': 'Rechercher des destinations', 'Search destinations, activities...': 'Rechercher des destinations, activites...',
    '/person': '/personne', 'From': 'A partir de',
    'A Taste of Jamaica': 'Un gout de la Jamaique', 'Food & Culture': 'Nourriture et culture',
    'Your Itinerary': 'Votre itineraire', 'Remove': 'Supprimer',
    'Review your trip': 'Revoir votre voyage', 'Your details': 'Vos coordonnees', 'Payment': 'Paiement',
    'First Name': 'Prenom', 'Last Name': 'Nom', 'Email': 'E-mail', 'Phone': 'Telephone', 'Country': 'Pays',
    'Number of guests': 'Nombre d\'invites', 'Trip date': 'Date du voyage',
    'Order Summary': 'Resume de la commande', 'Total': 'Total',
    'Booking Confirmed': 'Reservation confirmee',
    'When': 'Quand', 'Where': 'Ou', 'Who': 'Qui', 'Guests': 'Invites', 'Any dates': 'Toutes les dates',
    'Comments': 'Commentaires', 'Reply': 'Repondre', 'Contact Us': 'Contactez-nous',
    'Why MAPL Tours': 'Pourquoi MAPL Tours',
    'The authenticity of local culture.': 'L\'authenticite de la culture locale.',
    'The comfort of a curated trip.': 'Le confort d\'un voyage organise.',
  },
  de: {
    'Discover': 'Entdecken Sie', 'beyond the resort.': 'jenseits des Resorts.',
    'Popular destinations': 'Beliebte Reiseziele', 'Featured experiences': 'Ausgewahlte Erlebnisse',
    'View all': 'Alle anzeigen', 'Add to Trip': 'Zur Reise hinzufugen',
    'Explore': 'Erkunden', 'Checkout': 'Bezahlen', 'Search destinations': 'Reiseziele suchen',
    '/person': '/Person', 'From': 'Ab', 'Itinerary': 'Reiseplan',
    'Your details': 'Ihre Daten', 'Payment': 'Zahlung', 'Total': 'Gesamt',
    'When': 'Wann', 'Where': 'Wo', 'Who': 'Wer', 'Guests': 'Gaste',
    'Comments': 'Kommentare', 'Contact Us': 'Kontaktieren Sie uns',
  },
  pt: {
    'Discover': 'Descubra', 'beyond the resort.': 'alem do resort.',
    'Popular destinations': 'Destinos populares', 'Featured experiences': 'Experiencias em destaque',
    'Add to Trip': 'Adicionar a viagem', 'Explore': 'Explorar', 'Checkout': 'Finalizar',
    '/person': '/pessoa', 'From': 'A partir de', 'Itinerary': 'Roteiro',
    'When': 'Quando', 'Where': 'Onde', 'Who': 'Quem', 'Guests': 'Hospedes',
    'Comments': 'Comentarios', 'Contact Us': 'Contate-nos',
  },
  ja: {
    'Discover': '発見する', 'beyond the resort.': 'リゾートを超えて。',
    'Popular destinations': '人気の目的地', 'Featured experiences': '注目の体験',
    'Add to Trip': '旅行に追加', 'Explore': '探索', 'Checkout': '精算',
    '/person': '/人', 'From': 'から', 'Itinerary': '旅程',
    'When': 'いつ', 'Where': 'どこ', 'Who': '誰', 'Guests': 'ゲスト',
    'Comments': 'コメント', 'Contact Us': 'お問い合わせ',
  },
  zh: {
    'Discover': '发现', 'beyond the resort.': '超越度假村。',
    'Popular destinations': '热门目的地', 'Featured experiences': '精选体验',
    'Add to Trip': '添加到行程', 'Explore': '探索', 'Checkout': '结账',
    '/person': '/人', 'From': '起', 'Itinerary': '行程',
    'When': '何时', 'Where': '哪里', 'Who': '谁', 'Guests': '客人',
    'Comments': '评论', 'Contact Us': '联系我们',
  },
  ko: {
    'Discover': '발견하다', 'beyond the resort.': '리조트를 넘어서.',
    'Popular destinations': '인기 여행지', 'Featured experiences': '추천 체험',
    'Add to Trip': '여행에 추가', 'Explore': '탐색', 'Checkout': '결제',
    '/person': '/인', 'From': '부터', 'Itinerary': '일정',
    'When': '언제', 'Where': '어디', 'Who': '누구', 'Guests': '손님',
    'Comments': '댓글', 'Contact Us': '문의하기',
  },
}

interface I18nStore {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string) => string
  formatPrice: (usdPrice: number) => string
}

export const useI18n = create<I18nStore>()(
  persist(
    (set, get) => ({
      lang: languages[0],
      setLang: (lang: Language) => set({ lang }),
      t: (key: string) => {
        const { lang } = get()
        const code = lang.code.split('-')[0]
        return T[code]?.[key] || T[lang.code]?.[key] || key
      },
      formatPrice: (usdPrice: number) => {
        const { lang } = get()
        const converted = Math.round(usdPrice * lang.rate)
        return `${lang.currencySymbol}${converted.toLocaleString()}`
      },
    }),
    { name: 'mapl-lang' }
  )
)

// Detect from browser language
export function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return languages[0]
  const bl = navigator.language.toLowerCase()
  return languages.find((l) => l.code === bl) || languages.find((l) => l.code.split('-')[0] === bl.split('-')[0]) || languages[0]
}

// Detect from IP using free geolocation API
export async function detectLanguageByIP(): Promise<Language> {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return detectLanguage()
    const data = await res.json()
    const countryToLang: Record<string, string> = {
      US: 'en', CA: 'en', GB: 'en-gb', AU: 'en-gb', NZ: 'en-gb',
      JM: 'en-jm', TT: 'en', BB: 'en', BS: 'en',
      ES: 'es', MX: 'es', CO: 'es', AR: 'es', PE: 'es', CL: 'es', VE: 'es', CU: 'es', DO: 'es', PR: 'es',
      FR: 'fr', BE: 'fr', CH: 'fr',
      DE: 'de', AT: 'de',
      BR: 'pt', PT: 'pt',
      JP: 'ja',
      CN: 'zh', TW: 'zh', HK: 'zh',
      KR: 'ko',
    }
    const langCode = countryToLang[data.country_code] || 'en'
    return languages.find((l) => l.code === langCode) || languages[0]
  } catch {
    return detectLanguage()
  }
}
