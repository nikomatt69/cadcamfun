/**
 * Reference-aligned legal / static pages (`src/pages/legal/{terms,privacy,third-party-licenses}.tsx`,
 * `src/pages/third-party-licenses.tsx`, `src/pages/invitations/[token].tsx`).
 */
import { For, Show, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { Scale, ShieldCheck, ScrollText } from "lucide-solid"
import { t } from "../i18n/index.ts"

interface LegalDoc {
  readonly titleKey: "legal.terms.title" | "legal.privacy.title" | "legal.thirdParty.title"
  readonly icon: typeof Scale
  readonly introKey: "legal.terms.intro" | "legal.privacy.intro" | "legal.thirdParty.intro"
  readonly sections: ReadonlyArray<{ readonly heading: string; readonly body: string }>
}

const docs = {
  terms: {
    titleKey: "legal.terms.title",
    icon: Scale,
    introKey: "legal.terms.intro",
    sections: [
      { heading: "1. Acceptance", body: "By creating an account or otherwise using the CAD/CAM FUN desktop application, you agree to these terms in full. If you do not accept them, please discontinue use of the application." },
      { heading: "2. License", body: "Subject to your compliance with these terms and the applicable subscription tier, CAD/CAM FUN grants you a personal, non-exclusive, non-transferable license to install and use the application on devices you own or control." },
      { heading: "3. Acceptable Use", body: "You agree not to reverse engineer the application, to use it for unlawful purposes, or to upload content that infringes third-party intellectual property rights. Toolpath generation and machining remain your responsibility." },
      { heading: "4. Warranty Disclaimer", body: "The application is provided 'as is' and without warranty of any kind. CAD/CAM FUN disclaims all warranties, express or implied, including warranties of merchantability and fitness for a particular purpose." },
      { heading: "5. Limitation of Liability", body: "To the maximum extent permitted by law, CAD/CAM FUN shall not be liable for any indirect, incidental, special, consequential or punitive damages arising out of or related to your use of the application." },
      { heading: "6. Changes", body: "These terms may be updated from time to time. Continued use of the application after an update constitutes acceptance of the new terms." }
    ]
  },
  privacy: {
    titleKey: "legal.privacy.title",
    icon: ShieldCheck,
    introKey: "legal.privacy.intro",
    sections: [
      { heading: "1. Data We Store Locally", body: "Your projects, drawings, toolpaths, library items and machine presets live in a local SQLite database controlled by your operating system. They never leave your device unless you explicitly share or publish them." },
      { heading: "2. AI Features", body: "AI features route prompts through the provider you configure (NikCLI by default). Messages you send, attached files and the live drawing context may be transmitted to that provider solely to power the response." },
      { heading: "3. Telemetry", body: "Anonymous crash and usage telemetry may be collected to improve the application. Telemetry can be disabled from the Settings screen." },
      { heading: "4. Your Rights", body: "You can export, delete, or transfer your local data at any time through the project and library screens." },
      { heading: "5. Contact", body: "For privacy inquiries, reach out to privacy@cadcamfun.xyz." }
    ]
  },
  thirdParty: {
    titleKey: "legal.thirdParty.title",
    icon: ScrollText,
    introKey: "legal.thirdParty.intro",
    sections: [
      { heading: "Open Source", body: "This application is built on top of many open-source libraries. A complete list with attributions and license texts is shipped inside the application under the 'Third-party licenses' page." },
      { heading: "Trademarks", body: "All trademarks belong to their respective owners. The CAD/CAM FUN name and logo are trademarks of CAD/CAM FUN." }
    ]
  }
} as const satisfies Record<"terms" | "privacy" | "thirdParty", LegalDoc>

export function LegalScreen(props: { readonly kind: keyof typeof docs }): JSX.Element {
  const doc = () => docs[props.kind]
  const Icon = (props: { readonly size?: number }) => {
    const Component = doc().icon
    return <Component size={props.size ?? 28} aria-hidden="true" />
  }
  return <div class="reference-page-container">
    <article class="reference-legal-card">
      <div class="reference-legal-icon"><Icon size={28} /></div>
      <h1>{t(doc().titleKey)}</h1>
      <p class="reference-legal-intro">{t(doc().introKey)}</p>
      <For each={doc().sections}>{(section) => <>
        <h2>{section.heading}</h2>
        <p>{section.body}</p>
      </>}</For>
      <Show when={props.kind === "thirdParty"}>
        <p class="reference-legal-footer">
          <A href="/third-party-licenses">{t("legal.fullList")}</A>
        </p>
      </Show>
    </article>
  </div>
}

export function TermsScreen(): JSX.Element { return <LegalScreen kind="terms" /> }
export function PrivacyScreen(): JSX.Element { return <LegalScreen kind="privacy" /> }
export function ThirdPartyScreen(): JSX.Element { return <LegalScreen kind="thirdParty" /> }