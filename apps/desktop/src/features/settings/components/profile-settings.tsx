/**
 * `.reference/src/components/settings/ProfileSettings.tsx` — the Profile tab of
 * `/settings`: completeness bar, photo, stats, achievements, the editable fields,
 * skills and the privacy toggles.
 *
 * The reads go through the typed client (`GET /api/user/profile`,
 * `GET /api/user/stats`) instead of raw `fetch`, and the photo keeps the legacy
 * `localStorage.user_profile_image_<email>` contract (the legacy screen stored it
 * client-side too — it never uploaded it to the server).
 */
import { For, Show, createEffect, createSignal, type JSX } from "solid-js"
import { Motion, Presence } from "solid-motionone"
import {
  Camera, CircleX, Clock, Eye, EyeOff, Folder, Globe, MapPin, PenTool, Settings as SettingsIcon,
  ShieldCheck, Star, TrendingUp, User
} from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { useRead } from "../../../app/queries.ts"
import { toast } from "../../../shared/ui/feedback.tsx"
import { GitProfileSettings } from "./git-profile-settings.tsx"

interface ProfileData {
  name: string
  email: string
  bio: string
  location: string
  website: string
  company: string
  title: string
  skills: string[]
  socialLinks: { github?: string; linkedin?: string; twitter?: string }
  publicProfile: boolean
  showEmail: boolean
}

interface UserStats {
  projectsCount: number
  drawingsCount: number
  toolpathsCount: number
  componentsCount: number
  totalDesigns: number
  memberSince: string
}

const EMPTY_PROFILE: ProfileData = {
  name: "", email: "", bio: "", location: "", website: "", company: "", title: "",
  skills: [], socialLinks: {}, publicProfile: true, showEmail: false
}

const EMPTY_STATS: UserStats = {
  projectsCount: 0, drawingsCount: 0, toolpathsCount: 0, componentsCount: 0, totalDesigns: 0, memberSince: ""
}

const skillSuggestions = [
  "CAD Design", "CAM Programming", "3D Modeling", "CNC Machining",
  "SolidWorks", "AutoCAD", "Fusion 360", "Mastercam",
  "Manufacturing", "Product Design", "Mechanical Engineering",
  "Prototyping", "Quality Control", "G-Code Programming"
]

/** `.reference/src/lib/imageService.ts`, verbatim keys and behaviour. */
const imageKey = (userId: string): string => `user_profile_image_${userId}`

const saveImageToLocalStorage = (file: File, userId: string): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("The file is not a valid image"))
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result
      if (typeof result !== "string") {
        reject(new Error("Failed to read the file"))
        return
      }
      try {
        window.localStorage.setItem(imageKey(userId), result)
        resolve(result)
      } catch {
        reject(new Error("Unable to save the image. Try a smaller image."))
      }
    }
    reader.onerror = () => reject(new Error("Failed to read the file"))
    reader.readAsDataURL(file)
  })

const getImageFromLocalStorage = (userId: string): string | null => {
  try {
    return window.localStorage.getItem(imageKey(userId))
  } catch {
    return null
  }
}

const removeImageFromLocalStorage = (userId: string): void => {
  try {
    window.localStorage.removeItem(imageKey(userId))
  } catch {
    /* storage unavailable */
  }
}

const isValidUrl = (url: string): boolean => {
  try {
    // eslint-disable-next-line no-new
    new URL(url.startsWith("http") ? url : `https://${url}`)
    return true
  } catch {
    return false
  }
}

const formatMemberSince = (dateString: string): string => {
  if (!dateString) return "Recently"
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" })
}

/** The `{ error, details }` / `message` bodies the API answers with. */
const failureMessage = (cause: unknown, fallback: string): string => {
  if (typeof cause === "object" && cause !== null) {
    const candidate = cause as { error?: unknown; details?: unknown; message?: unknown }
    if (typeof candidate.message === "string" && candidate.message.length > 0) return candidate.message
    if (typeof candidate.error === "string") {
      return typeof candidate.details === "string" ? `${candidate.error}: ${candidate.details}` : candidate.error
    }
  }
  if (cause instanceof Error && cause.message.length > 0) return cause.message
  return fallback
}

export function ProfileSettings(): JSX.Element {
  const app = useApp()
  const profile = useRead((client) => client.user.profile())
  const stats = useRead((client) => client.user.stats())

  const [profileData, setProfileData] = createSignal<ProfileData>({ ...EMPTY_PROFILE })
  const [isEditing, setIsEditing] = createSignal(false)
  const [isUploading, setIsUploading] = createSignal(false)
  const [errors, setErrors] = createSignal<{ name?: string; website?: string }>({})
  const [newSkill, setNewSkill] = createSignal("")
  const [showSkillSuggestions, setShowSkillSuggestions] = createSignal(false)
  const [profileImage, setProfileImage] = createSignal<string | null>(null)
  let fileInput: HTMLInputElement | undefined
  let seeded = false

  const userStats = (): UserStats => stats.data() ?? EMPTY_STATS
  const userId = (): string => (profile.data()?.email ?? "").trim() || "anonymous-user"

  createEffect(() => {
    const data = profile.data()
    if (data === undefined || seeded) return
    seeded = true
    setProfileData({
      ...EMPTY_PROFILE,
      name: data.name ?? "",
      email: data.email ?? "",
      bio: data.bio ?? "",
      location: data.location ?? "",
      website: data.website ?? "",
      company: data.company ?? "",
      title: data.title ?? "",
      publicProfile: data.publicProfile,
      showEmail: data.showEmail
    })
    setProfileImage(getImageFromLocalStorage(data.email ?? "anonymous-user"))
  })

  const validateForm = (): boolean => {
    const next: { name?: string; website?: string } = {}
    if (!profileData().name.trim()) next.name = t("settings.profile.nameRequired")
    if (profileData().website && !isValidUrl(profileData().website)) next.website = t("settings.profile.invalidUrl")
    setErrors(next)
    return next.name === undefined && next.website === undefined
  }

  const handleSave = async (): Promise<void> => {
    if (!validateForm()) {
      toast.error(t("settings.profile.fixErrors"))
      return
    }
    try {
      setIsUploading(true)
      const data = profileData()
      // `UserProfileUpdate` is `HttpApiSchema.asMultipart()` — the payload is a FormData.
      const payload = new FormData()
      payload.set("name", data.name)
      payload.set("bio", data.bio)
      payload.set("location", data.location)
      payload.set("website", data.website)
      payload.set("company", data.company)
      payload.set("title", data.title)
      payload.set("publicProfile", String(data.publicProfile))
      payload.set("showEmail", String(data.showEmail))
      await app.runtime.run(app.client.user.updateProfile({ payload }))
      toast.success(t("settings.profile.updated"))
      setIsEditing(false)
      await profile.refetch()
    } catch (cause) {
      toast.error(failureMessage(cause, t("settings.profile.updateFailed")))
    } finally {
      setIsUploading(false)
    }
  }

  const handleImageUpload = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file === undefined) return
    if (!file.type.match("image.*")) {
      toast.error(t("settings.profile.invalidImage"))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("settings.profile.imageTooLarge"))
      return
    }
    try {
      setIsUploading(true)
      const imageBase64 = await saveImageToLocalStorage(file, userId())
      setProfileImage(imageBase64)
      toast.success(t("settings.profile.imageUploaded"))
    } catch {
      toast.error(t("settings.profile.imageFailed"))
    } finally {
      setIsUploading(false)
      input.value = ""
    }
  }

  const handleRemoveImage = (): void => {
    removeImageFromLocalStorage(userId())
    setProfileImage(null)
    toast.success(t("settings.profile.imageRemoved"))
  }

  const addSkill = (skill: string): void => {
    if (skill && !profileData().skills.includes(skill)) {
      setProfileData((previous) => ({ ...previous, skills: [...previous.skills, skill] }))
      setNewSkill("")
      setShowSkillSuggestions(false)
    }
  }

  const removeSkill = (skillToRemove: string): void => {
    setProfileData((previous) => ({ ...previous, skills: previous.skills.filter((skill) => skill !== skillToRemove) }))
  }

  const getProfileCompleteness = (): number => {
    const data = profileData()
    const fields = [
      data.name,
      data.bio,
      data.location,
      data.title,
      data.skills.length > 0 ? "skills" : "",
      profileImage()
    ]
    const completed = fields.filter((field) => field).length
    return Math.round((completed / fields.length) * 100)
  }

  const completeness = (): number => getProfileCompleteness()

  const fieldClass = (invalid: boolean): string =>
    `w-full rounded-md border px-2.5 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 ${
      !isEditing()
        ? "cursor-not-allowed border-slate-200/70 bg-slate-50/80 text-slate-500 dark:border-slate-700/50 dark:bg-slate-800/80 dark:text-slate-400"
        : "border-slate-200/70 bg-white/80 text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-100"
    }${invalid ? " border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-500" : ""}`

  return (
    <div class="space-y-8">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-medium leading-6 text-slate-900 dark:text-white">{t("settings.profile.title")}</h3>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.profile.subtitle")}</p>
        </div>

        <button
          type="button"
          onClick={() => setIsEditing(!isEditing())}
          class={`rounded-lg px-3.5 py-2 text-sm font-medium shadow-sm transition-colors duration-150 ease-out ${
            isEditing()
              ? "border border-slate-200/70 bg-white/70 text-slate-700 hover:bg-white dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800/70"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {isEditing() ? t("common.cancel") : t("settings.profile.edit")}
        </button>
      </div>

      {/* Profile Completeness */}
      <div class="rounded-xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300">{t("settings.profile.completeness")}</h3>
          <span class="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{completeness()}%</span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            class="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out"
            style={{ width: `${completeness()}%` }}
          />
        </div>
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("settings.profile.completenessHint")}</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Photo & Basic Info */}
        <div class="lg:col-span-1">
          <div class="rounded-xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60">
            {/* Profile Photo */}
            <div class="text-center">
              <div class="relative inline-block">
                <div class="mx-auto h-32 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <Show when={isUploading()}>
                    <div class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full z-10">
                      <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white" />
                    </div>
                  </Show>
                  <Show
                    when={profileImage()}
                    fallback={
                      <div class="h-full w-full flex items-center justify-center">
                        <User class="h-16 w-16 text-slate-400 dark:text-slate-500" />
                      </div>
                    }
                  >
                    <img src={profileImage() ?? undefined} alt="Profile" class="h-full w-full object-cover" />
                  </Show>
                </div>

                <Show when={isEditing()}>
                  <button
                    type="button"
                    onClick={() => fileInput?.click()}
                    class="absolute bottom-2 right-2 rounded-full bg-blue-600 p-2 text-white shadow-sm transition-colors duration-150 ease-out hover:bg-blue-700"
                  >
                    <Camera class="h-4 w-4" />
                  </button>
                </Show>
              </div>

              <input
                type="file"
                ref={(element) => { fileInput = element }}
                accept="image/*"
                class="hidden"
                onChange={(event) => void handleImageUpload(event)}
              />

              <Show when={isEditing()}>
                <div class="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => fileInput?.click()}
                    class="w-full rounded-lg border border-slate-200/70 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-colors duration-150 ease-out hover:bg-white dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800/70"
                  >
                    {t("settings.profile.uploadPhoto")}
                  </button>
                  <Show when={profileImage()}>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      class="w-full rounded-lg border border-red-200/70 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors duration-150 ease-out hover:bg-red-100 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
                    >
                      {t("settings.profile.removePhoto")}
                    </button>
                  </Show>
                  <p class="text-xs text-slate-500 dark:text-slate-400">JPG, PNG, or GIF. Max 2MB.</p>
                </div>
              </Show>
            </div>

            {/* Profile Stats */}
            <div class="mt-6">
              <Show
                when={stats.loading()}
                fallback={
                  <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                      <div class="text-center">
                        <div class="flex items-center justify-center text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
                          <Folder class="mr-1.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
                          {userStats().projectsCount}
                        </div>
                        <div class="text-xs font-medium text-slate-500 dark:text-slate-400">{t("shell.projects")}</div>
                      </div>
                      <div class="text-center">
                        <div class="flex items-center justify-center text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
                          <PenTool class="mr-1.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
                          {userStats().totalDesigns}
                        </div>
                        <div class="text-xs font-medium text-slate-500 dark:text-slate-400">{t("settings.profile.designs")}</div>
                      </div>
                    </div>

                    <Show when={userStats().drawingsCount > 0 || userStats().toolpathsCount > 0}>
                      <div class="border-t border-slate-200/70 pt-4 dark:border-slate-700/50">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                          <div class="text-center">
                            <div class="font-medium tabular-nums text-slate-900 dark:text-white">{userStats().drawingsCount}</div>
                            <div class="text-slate-500 dark:text-slate-400">{t("settings.profile.drawings")}</div>
                          </div>
                          <div class="text-center">
                            <div class="font-medium tabular-nums text-slate-900 dark:text-white">{userStats().toolpathsCount}</div>
                            <div class="text-slate-500 dark:text-slate-400">{t("shell.toolpaths")}</div>
                          </div>
                        </div>
                      </div>
                    </Show>

                    <div class="border-t border-slate-200/70 pt-4 dark:border-slate-700/50">
                      <div class="flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                        <Clock class="h-4 w-4 mr-1" />
                        {t("settings.profile.memberSince", { date: formatMemberSince(userStats().memberSince) })}
                      </div>
                    </div>
                  </div>
                }
              >
                <div class="animate-pulse">
                  <div class="grid grid-cols-2 gap-4">
                    <div class="text-center">
                      <div class="h-8 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                      <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded" />
                    </div>
                    <div class="text-center">
                      <div class="h-8 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                      <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded" />
                    </div>
                  </div>
                </div>
              </Show>
            </div>

            {/* Badges */}
            <div class="mt-6">
              <h4 class="mb-3 text-sm font-medium text-slate-900 dark:text-white">{t("settings.profile.achievements")}</h4>
              <div class="flex flex-wrap gap-2">
                <Show when={userStats().totalDesigns >= 10}>
                  <span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Star class="h-3 w-3 mr-1" />
                    {t("settings.profile.badgeExpert")}
                  </span>
                </Show>
                <Show when={userStats().projectsCount >= 5}>
                  <span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <TrendingUp class="h-3 w-3 mr-1" />
                    {t("settings.profile.badgeActive")}
                  </span>
                </Show>
                <Show when={profile.data() !== undefined}>
                  <span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <ShieldCheck class="h-3 w-3 mr-1" />
                    {t("settings.profile.badgeVerified")}
                  </span>
                </Show>
                <Show when={userStats().toolpathsCount >= 3}>
                  <span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <SettingsIcon class="h-3 w-3 mr-1" />
                    {t("settings.profile.badgeCam")}
                  </span>
                </Show>
                <Show when={userStats().totalDesigns >= 50}>
                  <span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Star class="h-3 w-3 mr-1" />
                    {t("settings.profile.badgeMaster")}
                  </span>
                </Show>
                <Show when={userStats().projectsCount === 0 && userStats().totalDesigns === 0}>
                  <span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <User class="h-3 w-3 mr-1" />
                    {t("settings.profile.badgeNew")}
                  </span>
                </Show>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Profile Details */}
        <div class="lg:col-span-2">
          <div class="rounded-xl border border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/60">
            <div class="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 class="mb-4 text-sm font-medium text-slate-700 dark:text-slate-300">{t("settings.profile.basicInfo")}</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.profile.fullName")}
                    </label>
                    <input
                      type="text"
                      value={profileData().name}
                      onInput={(event) => setProfileData((previous) => ({ ...previous, name: event.currentTarget.value }))}
                      disabled={!isEditing()}
                      class={fieldClass(errors().name !== undefined)}
                    />
                    <Show when={errors().name !== undefined}>
                      <p class="mt-1 text-sm text-red-600">{errors().name}</p>
                    </Show>
                  </div>

                  <div>
                    <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("auth.email")}
                    </label>
                    <input
                      type="email"
                      value={profileData().email}
                      disabled
                      class="w-full cursor-not-allowed rounded-md border border-slate-200/70 bg-slate-50/80 px-2.5 py-1.5 text-sm text-slate-500 shadow-sm dark:border-slate-700/50 dark:bg-slate-800/80 dark:text-slate-400"
                    />
                    <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("settings.profile.emailLocked")}</p>
                  </div>

                  <div>
                    <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.profile.jobTitle")}
                    </label>
                    <input
                      type="text"
                      value={profileData().title}
                      onInput={(event) => setProfileData((previous) => ({ ...previous, title: event.currentTarget.value }))}
                      disabled={!isEditing()}
                      placeholder="e.g., CAD Designer"
                      class={fieldClass(false)}
                    />
                  </div>

                  <div>
                    <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t("settings.profile.company")}
                    </label>
                    <input
                      type="text"
                      value={profileData().company}
                      onInput={(event) => setProfileData((previous) => ({ ...previous, company: event.currentTarget.value }))}
                      disabled={!isEditing()}
                      placeholder="Your company name"
                      class={fieldClass(false)}
                    />
                  </div>

                  <div>
                    <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      <MapPin class="h-4 w-4 inline mr-1" />
                      {t("settings.profile.location")}
                    </label>
                    <input
                      type="text"
                      value={profileData().location}
                      onInput={(event) => setProfileData((previous) => ({ ...previous, location: event.currentTarget.value }))}
                      disabled={!isEditing()}
                      placeholder="City, Country"
                      class={fieldClass(false)}
                    />
                  </div>

                  <div>
                    <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      <Globe class="h-4 w-4 inline mr-1" />
                      {t("settings.profile.website")}
                    </label>
                    <input
                      type="url"
                      value={profileData().website}
                      onInput={(event) => setProfileData((previous) => ({ ...previous, website: event.currentTarget.value }))}
                      disabled={!isEditing()}
                      placeholder="https://yourwebsite.com"
                      class={fieldClass(errors().website !== undefined)}
                    />
                    <Show when={errors().website !== undefined}>
                      <p class="mt-1 text-sm text-red-600">{errors().website}</p>
                    </Show>
                  </div>
                </div>
              </div>

              {/* Bio */}
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("settings.profile.bio")}
                </label>
                <textarea
                  value={profileData().bio}
                  onInput={(event) => setProfileData((previous) => ({ ...previous, bio: event.currentTarget.value }))}
                  disabled={!isEditing()}
                  rows={4}
                  placeholder="Tell us about yourself, your experience, and what you're passionate about..."
                  class={`w-full resize-none rounded-md border px-2.5 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 ${
                    !isEditing()
                      ? "cursor-not-allowed border-slate-200/70 bg-slate-50/80 text-slate-500 dark:border-slate-700/50 dark:bg-slate-800/80 dark:text-slate-400"
                      : "border-slate-200/70 bg-white/80 text-slate-900 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-100"
                  }`}
                />
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("settings.profile.bioCount", { count: profileData().bio.length })}
                </p>
              </div>

              {/* Skills */}
              <div>
                <label class="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("settings.profile.skills")}
                </label>
                <div class="mb-3 flex flex-wrap gap-2">
                  <For each={profileData().skills}>
                    {(skill) => (
                      <span class="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {skill}
                        <Show when={isEditing()}>
                          <button
                            type="button"
                            onClick={() => removeSkill(skill)}
                            class="ml-2 text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                          >
                            <CircleX class="h-4 w-4" />
                          </button>
                        </Show>
                      </span>
                    )}
                  </For>
                </div>

                <Show when={isEditing()}>
                  <div class="relative">
                    <input
                      type="text"
                      value={newSkill()}
                      onInput={(event) => setNewSkill(event.currentTarget.value)}
                      onFocus={() => setShowSkillSuggestions(true)}
                      onKeyPress={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          addSkill(newSkill())
                        }
                      }}
                      placeholder="Add a skill..."
                      class="w-full rounded-md border border-slate-200/70 bg-white/80 px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-100"
                    />

                    <Show when={showSkillSuggestions()}>
                      <div class="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200/70 bg-white shadow-lg dark:border-slate-700/50 dark:bg-slate-800">
                        <For
                          each={skillSuggestions.filter(
                            (skill) =>
                              skill.toLowerCase().includes(newSkill().toLowerCase()) &&
                              !profileData().skills.includes(skill)
                          )}
                        >
                          {(skill) => (
                            <button
                              type="button"
                              onClick={() => addSkill(skill)}
                              class="w-full px-3 py-2 text-left text-sm text-slate-900 transition-colors hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700/60"
                            >
                              {skill}
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>

              {/* Privacy Settings */}
              <div>
                <h4 class="mb-4 text-sm font-medium text-slate-700 dark:text-slate-300">{t("settings.profile.privacy")}</h4>
                <div class="space-y-3">
                  <label class="flex items-center justify-between">
                    <div class="flex items-center">
                      <Eye class="mr-2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                      <span class="text-sm text-slate-900 dark:text-white">{t("settings.profile.publicProfile")}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileData((previous) => ({ ...previous, publicProfile: !previous.publicProfile }))}
                      disabled={!isEditing()}
                      class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        profileData().publicProfile ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                      } ${!isEditing() ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <span
                        class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          profileData().publicProfile ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>

                  <label class="flex items-center justify-between">
                    <div class="flex items-center">
                      <Show when={profileData().showEmail} fallback={<EyeOff class="mr-2 h-4 w-4 text-slate-400 dark:text-slate-500" />}>
                        <Eye class="mr-2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                      </Show>
                      <span class="text-sm text-slate-900 dark:text-white">{t("settings.profile.showEmail")}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileData((previous) => ({ ...previous, showEmail: !previous.showEmail }))}
                      disabled={!isEditing()}
                      class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        profileData().showEmail ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                      } ${!isEditing() ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <span
                        class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          profileData().showEmail ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <GitProfileSettings />

      {/* Save Button */}
      <Presence>
        <Show when={isEditing()}>
          <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            class="flex justify-end gap-3"
          >
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              class="rounded-lg border border-slate-200/70 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-colors duration-150 ease-out hover:bg-white dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800/70"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isUploading()}
              class="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-150 ease-out hover:bg-blue-700 disabled:opacity-50"
            >
              <Show when={isUploading()}>
                <div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </Show>
              {t("settings.profile.save")}
            </button>
          </Motion.div>
        </Show>
      </Presence>
    </div>
  )
}
