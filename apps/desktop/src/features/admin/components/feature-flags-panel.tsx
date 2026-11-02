/**
 * `AdminFeatureFlagsPanel` — `.reference/src/components/admin/AdminFeatureFlagsPanel.tsx`.
 *
 * The legacy component floated a Shield button over the app and opened the admin
 * modal. On a page that exists only to show the flags, that indirection is noise:
 * the panel is rendered inline, in the shared enterprise vocabulary, so the page
 * reads like the rest of the console.
 *
 * The desktop build has a single local profile and no session, so that profile
 * is the sidecar's administrator (`local@cadcamfun.local`) rather than the
 * legacy hosted-site session check.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { Check, Settings, Shield, X } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { ADMIN_EMAILS, LOCAL_ADMIN_EMAIL, featureFlagService, isAdminUser, type FeatureFlag } from "./feature-flags.ts"
import { Field, Notice, SectionHeader, TextField } from "../../../shared/components/enterprise.tsx"
import { FlagsScene } from "../../../shared/ui/stageshow/index.ts"

export function AdminFeatureFlagsPanel(): JSX.Element | null {
  const [selectedUser, setSelectedUser] = createSignal("")
  const [revision, setRevision] = createSignal(0)

  if (!isAdminUser(LOCAL_ADMIN_EMAIL)) return null

  const allFeatures = featureFlagService.getAllFeatureFlags()
  const countWith = (prefix: string): number => allFeatures.filter((flag) => flag.startsWith(prefix)).length

  const userId = (): string => selectedUser().trim()
  const overridden = (feature: FeatureFlag): boolean | undefined => {
    void revision()
    return featureFlagService.listOverrides(userId()).find((entry) => entry.featureFlag === feature)?.enabled
  }
  const addUserOverride = (feature: FeatureFlag, enabled: boolean): void => {
    featureFlagService.addAdminOverride({
      userId: userId(),
      featureFlag: feature,
      enabled,
      reason: `Admin override - ${enabled ? "enabled" : "disabled"} by admin`
    })
    setRevision((value) => value + 1)
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
      <section>
        <SectionHeader index="01" title={t("admin.ff.adminActive")} />
        <Notice tone="ok" icon={<Shield size={14} aria-hidden="true" />}>
          <span style={{ display: "flex", "flex-direction": "column", gap: "2px" }}>
            <strong>{t("admin.ff.adminActiveBody")}</strong>
            <span style={{ "font-family": "var(--ent-mono)", "font-size": "11px" }}>
              {t("admin.ff.adminEmails", { emails: [...ADMIN_EMAILS, LOCAL_ADMIN_EMAIL].join(", ") })}
            </span>
          </span>
        </Notice>
      </section>

      <section>
        <SectionHeader index="02" title={t("admin.ff.overview")} />
        <div class="ent-stats">
          <div class="ent-stat">
            <span class="ent-stat__value">{allFeatures.length}</span>
            <span class="ent-stat__label">{t("admin.ff.label.total")}</span>
          </div>
          <div class="ent-stat">
            <span class="ent-stat__value">{countWith("ai_")}</span>
            <span class="ent-stat__label">{t("admin.ff.label.ai")}</span>
          </div>
          <div class="ent-stat">
            <span class="ent-stat__value">{countWith("cad_")}</span>
            <span class="ent-stat__label">{t("admin.ff.label.cad")}</span>
          </div>
          <div class="ent-stat">
            <span class="ent-stat__value">{countWith("cam_")}</span>
            <span class="ent-stat__label">{t("admin.ff.label.cam")}</span>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader index="03" title={t("admin.ff.overrides")} />
        <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
          <Field label={t("admin.ff.userId")} id="admin-ff-user">
            <TextField
              id="admin-ff-user"
              name="userId"
              value={selectedUser()}
              placeholder={t("admin.ff.userIdPlaceholder")}
              onInput={setSelectedUser}
            />
          </Field>

          <Show when={!userId()}>
            <div
              aria-hidden="true"
              style={{ "max-width": "28rem", overflow: "hidden", border: "1px solid var(--ent-border)", "border-radius": "var(--ent-radius)" }}
            >
              <FlagsScene />
            </div>
          </Show>

          <Show when={userId()}>
            <div class="ent-card">
              <div class="ent-card__head">
                <h3 class="ent-section__title">{t("admin.ff.available")}</h3>
              </div>
              <div class="ent-card__body" style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(min(100%, 13rem), 1fr))", gap: "4px", "max-height": "15rem", "overflow-y": "auto" }}>
                <For each={[...allFeatures]}>
                  {(feature) => (
                    <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "6px", padding: "4px 6px", "border-radius": "var(--ent-radius)", background: "var(--ent-surface-subtle)" }}>
                      <span style={{ overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap", "font-size": "11px", color: "var(--ent-text-muted)" }}>
                        {feature.replace(/_/g, " ")}
                      </span>
                      <span style={{ display: "flex", gap: "2px", "flex-shrink": "0" }}>
                        <button
                          type="button"
                          class="ent-btn ent-btn--ghost"
                          style={{ "min-height": "28px", padding: "0 8px", "font-size": "11px", color: "var(--ent-ok)", background: overridden(feature) === true ? "var(--ent-ok-soft)" : undefined }}
                          aria-label={`${t("mcp.settings.enable")}: ${feature.replace(/_/g, " ")}`}
                          aria-pressed={overridden(feature) === true}
                          title={t("mcp.settings.enable")}
                          onClick={() => addUserOverride(feature, true)}
                        >
                          <Check size={12} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          class="ent-btn ent-btn--ghost"
                          style={{ "min-height": "28px", padding: "0 8px", "font-size": "11px", color: "var(--ent-bad)", background: overridden(feature) === false ? "var(--ent-bad-soft)" : undefined }}
                          aria-label={`${t("mcp.settings.disable")}: ${feature.replace(/_/g, " ")}`}
                          aria-pressed={overridden(feature) === false}
                          title={t("mcp.settings.disable")}
                          onClick={() => addUserOverride(feature, false)}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </section>

      <section>
        <SectionHeader index="04" title={t("admin.ff.categories")} />
        <div class="ent-card">
          <div class="ent-card__body" style={{ display: "grid", "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))", gap: "16px" }}>
            <div>
              <h4 class="ent-section__title">{t("admin.ff.aiCat")}</h4>
              <ul style={{ margin: "6px 0 0", "padding-left": "16px", display: "grid", gap: "2px", "font-size": "12px", color: "var(--ent-text-muted)" }}>
                <li>{t("admin.ff.aiAssistant")}</li>
                <li>{t("admin.ff.aiVision")}</li>
                <li>{t("admin.ff.aiAutonomous")}</li>
                <li>{t("admin.ff.aiCodeInterpreter")}</li>
              </ul>
            </div>
            <div>
              <h4 class="ent-section__title">{t("admin.ff.cadcamCat")}</h4>
              <ul style={{ margin: "6px 0 0", "padding-left": "16px", display: "grid", gap: "2px", "font-size": "12px", color: "var(--ent-text-muted)" }}>
                <li>{t("admin.ff.advancedCad")}</li>
                <li>{t("admin.ff.modeling")}</li>
                <li>{t("admin.ff.camOperations")}</li>
                <li>{t("admin.ff.exportFormats")}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
