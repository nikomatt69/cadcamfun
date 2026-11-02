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
import { Button, Notice } from "../../../shared/components/enterprise.tsx"
import { LostPreview } from "../../../shared/ui/stageshow/index.ts"
import "../../../shared/ui/stageshow/scenes-account.css"

/** The document card of the other standalone pages, with the empty-outline scene for "this invitation is not there". */
export function InvitationScreen(): JSX.Element {
  const navigate = useNavigate()
  return (
    <div class="reference-standalone-container">
      <div class="ent-card" style={{ "max-width": "26rem" }}>
        <div class="acc-preview" aria-hidden="true"><LostPreview /></div>
        <div class="ent-card__head">
          <h1 class="ent-header__title ent-header--document">{t("invite.heading")}</h1>
        </div>
        <div class="ent-card__body" style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
          {/* Error state of `renderContent()` — the only state v6 can honestly render. */}
          <Notice tone="bad"><strong>{t("invite.errorTitle")}</strong> {t("invite.notFound")}</Notice>
          <Button block onClick={() => navigate("/")}>{t("invite.returnHome")}</Button>
        </div>
      </div>
    </div>
  )
}
