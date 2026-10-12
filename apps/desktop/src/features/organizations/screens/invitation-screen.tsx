/**
 * `/invitations/:token` — `.reference/src/pages/invitations/[token].tsx`.
 *
 * The legacy page resolves the token in `getServerSideProps` against
 * `prisma.organizationInvitation` and answers "Invitation not found or has already been
 * used" when the lookup misses. v6 has no invitations contract at all (no
 * `POST /api/invitations/:token/accept`, no invitation read), so the screen renders the
 * legacy **error card** — the state that page shows whenever the token cannot be
 * resolved — with the legacy header, copy and "Return to Home" button. The success /
 * expired / accept branches would need data no endpoint can supply, so they are not
 * rendered rather than faked.
 */
import { type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { t } from "../../../i18n/index.ts"

export function InvitationScreen(): JSX.Element {
  const navigate = useNavigate()
  return (
    <section class="flex min-h-screen flex-col bg-gray-50">
      <header class="bg-white py-4 shadow-sm">
        <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h1 class="text-2xl font-semibold tracking-[-0.015em] text-gray-900 dark:text-gray-50">{t("invite.heading")}</h1>
        </div>
      </header>

      <main class="flex-grow">
        <div class="mx-auto mt-10 max-w-lg px-4 sm:px-6 lg:px-8">
          {/* Error state of `renderContent()` — the only state v6 can honestly render. */}
          <div class="rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 class="mb-4 text-xl font-semibold text-red-800">{t("invite.errorTitle")}</h2>
            <p class="text-red-700">{t("invite.notFound")}</p>
            <button
              type="button"
              class="mt-6 rounded-md bg-gray-100 px-5 py-2 font-medium text-gray-800 transition-colors duration-150 hover:bg-gray-200"
              onClick={() => navigate("/")}
            >
              {t("invite.returnHome")}
            </button>
          </div>
        </div>
      </main>
    </section>
  )
}
