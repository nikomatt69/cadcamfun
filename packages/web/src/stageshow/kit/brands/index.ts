import brandVisa from "./visa.svg?url"
import brandMastercard from "./mastercard.svg?url"
import brandAmex from "./amex.svg?url"
import brandAmexTile from "./amex-tile.svg?url"
import brandDiscover from "./discover.svg?url"
import brandPaypal from "./paypal.svg?url"
import brandStripe from "./stripe.svg?url"
import brandNotion from "./notion.svg?url"
import brandGmail from "./gmail.svg?url"
import brandGoogleCalendar from "./google-calendar.svg?url"
import brandGoogleDocs from "./google-docs.svg?url"
import brand1password from "./1password.svg?url"
import brand1passwordDark from "./1password-dark.svg?url"
import brandFigma from "./figma.svg?url"
import brandSlack from "./slack.svg?url"
import brandGithub from "./github.svg?url"
import brandGithubDark from "./github-dark.svg?url"
import brandLinear from "./linear.svg?url"
import brandLinearDark from "./linear-dark.svg?url"
import brandDropboxGlyph from "./dropbox-glyph.svg?url"
import brandGoogleDrive from "./google-drive.svg?url"
import brandGoogleSheets from "./google-sheets.svg?url"
import brandGoogleSlides from "./google-slides.svg?url"
import brandGoogleMeet from "./google-meet.svg?url"
import brandZoom from "./zoom.svg?url"
import brandVercel from "./vercel.svg?url"
import brandVercelDark from "./vercel-dark.svg?url"
import brandShopify from "./shopify.svg?url"
import brandBitcoin from "./bitcoin.svg?url"
import brandEthereum from "./ethereum.svg?url"
import brandSolana from "./solana.svg?url"
import brandUsdc from "./usdc.svg?url"
import brandTether from "./tether.svg?url"
import brandChase from "./chase.svg?url"
import brandWellsfargo from "./wellsfargo.svg?url"
import brandBankofamerica from "./bankofamerica.svg?url"
import brandBankofamericaDark from "./bankofamerica-dark.svg?url"
import brandBarclays from "./barclays.svg?url"
import brandHsbc from "./hsbc.svg?url"
import brandMonzo from "./monzo.svg?url"
import brandMonzoDark from "./monzo-dark.svg?url"
import brandRevolut from "./revolut.svg?url"
import brandRevolutDark from "./revolut-dark.svg?url"

/** Local product artwork. No network lookup or runtime icon service. */
export type BrandAsset = {
  name: string
  category: 'Payments' | 'Banks' | 'Apps' | 'Crypto'
  light: string
  dark: string
  tileArtwork?: string
  tileBackground?: string
  proportion: number
  scale: number
}

export const brandMarks = {
  'visa': {
    name: "Visa", category: 'Payments',
    light: brandVisa,
    dark: brandVisa,
    proportion: 1.56, scale: 0.9,
  },
  'mastercard': {
    name: "Mastercard", category: 'Payments',
    light: brandMastercard,
    dark: brandMastercard,
    proportion: 1.56, scale: 0.9,
  },
  'amex': {
    name: "American Express", category: 'Payments',
    light: brandAmex,
    dark: brandAmex,
    tileArtwork: brandAmexTile, tileBackground: '#006fcf',
    proportion: 1.56, scale: 0.84,
  },
  'discover': {
    name: "Discover", category: 'Payments',
    light: brandDiscover,
    dark: brandDiscover,
    proportion: 1.56, scale: 0.9,
  },
  'paypal': {
    name: "PayPal", category: 'Payments',
    light: brandPaypal,
    dark: brandPaypal,
    proportion: 1, scale: 0.64,
  },
  'stripe': {
    name: "Stripe", category: 'Payments',
    light: brandStripe,
    dark: brandStripe,
    proportion: 1, scale: 0.64,
  },
  'notion': {
    name: "Notion", category: 'Apps',
    light: brandNotion,
    dark: brandNotion,
    proportion: 1, scale: 0.68,
  },
  'gmail': {
    name: "Gmail", category: 'Apps',
    light: brandGmail,
    dark: brandGmail,
    proportion: 1, scale: 0.64,
  },
  'google-calendar': {
    name: "Google Calendar", category: 'Apps',
    light: brandGoogleCalendar,
    dark: brandGoogleCalendar,
    proportion: 1, scale: 0.64,
  },
  'google-docs': {
    name: "Google Docs", category: 'Apps',
    light: brandGoogleDocs,
    dark: brandGoogleDocs,
    proportion: 1, scale: 0.64,
  },
  '1password': {
    name: "1Password", category: 'Apps',
    light: brand1password,
    dark: brand1passwordDark,
    proportion: 1, scale: 0.64,
  },
  'figma': {
    name: "Figma", category: 'Apps',
    light: brandFigma,
    dark: brandFigma,
    proportion: 1, scale: 0.68,
  },
  'slack': {
    name: "Slack", category: 'Apps',
    light: brandSlack,
    dark: brandSlack,
    proportion: 1, scale: 0.64,
  },
  'github': {
    name: "GitHub", category: 'Apps',
    light: brandGithub,
    dark: brandGithubDark,
    proportion: 1, scale: 0.64,
  },
  'linear': {
    name: "Linear", category: 'Apps',
    light: brandLinear,
    dark: brandLinearDark,
    proportion: 1, scale: 0.64,
  },
  'dropbox': {
    name: "Dropbox", category: 'Apps',
    // The source artwork is the glyph on a square blue field; shown as the
    // blue glyph alone, so it sits on a tile like the other app marks
    light: brandDropboxGlyph,
    dark: brandDropboxGlyph,
    proportion: 1, scale: 0.72,
  },
  'google-drive': {
    name: "Google Drive", category: 'Apps',
    light: brandGoogleDrive,
    dark: brandGoogleDrive,
    proportion: 1, scale: 0.64,
  },
  'google-sheets': {
    name: "Google Sheets", category: 'Apps',
    light: brandGoogleSheets,
    dark: brandGoogleSheets,
    proportion: 1, scale: 0.74,
  },
  'google-slides': {
    name: "Google Slides", category: 'Apps',
    light: brandGoogleSlides,
    dark: brandGoogleSlides,
    proportion: 1, scale: 0.74,
  },
  'google-meet': {
    name: "Google Meet", category: 'Apps',
    light: brandGoogleMeet,
    dark: brandGoogleMeet,
    proportion: 1, scale: 0.64,
  },
  'zoom': {
    name: "Zoom", category: 'Apps',
    light: brandZoom,
    dark: brandZoom,
    proportion: 1, scale: 0.64,
  },
  'vercel': {
    name: "Vercel", category: 'Apps',
    light: brandVercel,
    dark: brandVercelDark,
    proportion: 1, scale: 0.64,
  },
  'shopify': {
    name: "Shopify", category: 'Apps',
    light: brandShopify,
    dark: brandShopify,
    proportion: 1, scale: 0.68,
  },
  'bitcoin': {
    name: 'Bitcoin', category: 'Crypto',
    light: brandBitcoin,
    dark: brandBitcoin,
    proportion: 1, scale: 0.68,
  },
  'ethereum': {
    name: 'Ethereum', category: 'Crypto',
    light: brandEthereum,
    dark: brandEthereum,
    proportion: 1, scale: 0.68,
  },
  'solana': {
    name: 'Solana', category: 'Crypto',
    light: brandSolana,
    dark: brandSolana,
    proportion: 1, scale: 0.68,
  },
  'usdc': {
    name: 'USDC', category: 'Crypto',
    light: brandUsdc,
    dark: brandUsdc,
    proportion: 1, scale: 0.8,
  },
  'tether': {
    name: 'Tether', category: 'Crypto',
    light: brandTether,
    dark: brandTether,
    proportion: 1, scale: 0.68,
  },
  'chase': {
    name: "Chase", category: 'Banks',
    light: brandChase,
    dark: brandChase,
    proportion: 1, scale: 0.8,
  },
  'wellsfargo': {
    name: "Wells Fargo", category: 'Banks',
    light: brandWellsfargo,
    dark: brandWellsfargo,
    proportion: 1, scale: 0.8,
  },
  'bankofamerica': {
    name: "Bank of America", category: 'Banks',
    light: brandBankofamerica,
    dark: brandBankofamericaDark,
    proportion: 1, scale: 0.8,
  },
  'barclays': {
    name: "Barclays", category: 'Banks',
    light: brandBarclays,
    dark: brandBarclays,
    proportion: 1, scale: 0.8,
  },
  'hsbc': {
    name: "HSBC", category: 'Banks',
    light: brandHsbc,
    dark: brandHsbc,
    proportion: 1, scale: 0.8,
  },
  'monzo': {
    name: "Monzo", category: 'Banks',
    light: brandMonzo,
    dark: brandMonzoDark,
    proportion: 1, scale: 0.8,
  },
  'revolut': {
    name: "Revolut", category: 'Banks',
    light: brandRevolut,
    dark: brandRevolutDark,
    proportion: 1, scale: 0.8,
  },
} as const satisfies Record<string, BrandAsset>

export type BrandName = keyof typeof brandMarks
