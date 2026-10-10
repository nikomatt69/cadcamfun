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
import { t } from "../../i18n/index.ts"
import { useApp } from "../../state/context.ts"
import { useRead } from "../../app/queries.ts"
import { toast } from "../ui/feedback.tsx"

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
    `w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
      !isEditing() ? "cursor-not-allowed bg-gray-50 dark:bg-gray-800" : "focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    }${invalid ? " border-red-500" : ""}`

  return (
    <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} class="space-y-8">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="flex text-2xl font-bold text-gray-900 dark:text-white">
            <User class="mr-3 h-7 w-7 text-blue-500" />
            {t("settings.profile.title")}
          </h2>
          <p class="mt-1 text-gray-600 dark:text-gray-400">{t("settings.profile.subtitle")}</p>
        </div>

        <Motion.button
          onClick={() => setIsEditing(!isEditing())}
          hover={{ scale: 1.02 }}
          press={{ scale: 0.98 }}
          transition={{ duration: 0.2 }}
          class={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isEditing() ? "bg-gray-600 hover:bg-gray-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {isEditing() ? t("common.cancel") : t("settings.profile.edit")}
        </Motion.button>
      </div>

      {/* Profile Completeness */}
      <div class="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-blue-900 dark:text-blue-200">{t("settings.profile.completeness")}</h3>
          <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">{completeness()}%</span>
        </div>
        <div class="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3">
          <div
            class="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${completeness()}%` }}
          />
        </div>
        <p class="text-sm text-blue-700 dark:text-blue-300 mt-2">{t("settings.profile.completenessHint")}</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Photo & Basic Info */}
        <div class="lg:col-span-1">
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            {/* Profile Photo */}
            <div class="text-center">
              <div class="relative inline-block">
                <div class="h-32 w-32 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-900 mx-auto">
                  <Show when={isUploading()}>
                    <div class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full z-10">
                      <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white" />
                    </div>
                  </Show>
                  <Show
                    when={profileImage()}
                    fallback={
                      <div class="h-full w-full flex items-center justify-center">
                        <User class="h-16 w-16 text-gray-400" />
                      </div>
                    }
                  >
                    <img src={profileImage() ?? undefined} alt="Profile" class="h-full w-full object-cover" />
                  </Show>
                </div>

                <Show when={isEditing()}>
                  <Motion.button
                    onClick={() => fileInput?.click()}
                    hover={{ scale: 1.1 }}
                    press={{ scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    class="absolute bottom-2 right-2 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-lg"
                  >
                    <Camera class="h-4 w-4" />
                  </Motion.button>
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
                    class="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    {t("settings.profile.uploadPhoto")}
                  </button>
                  <Show when={profileImage()}>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      class="w-full py-2 px-4 bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 rounded-lg text-sm font-medium transition-colors"
                    >
                      {t("settings.profile.removePhoto")}
                    </button>
                  </Show>
                  <p class="text-xs text-gray-500 dark:text-gray-400">JPG, PNG, or GIF. Max 2MB.</p>
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
                        <div class="text-2xl font-bold text-gray-900 dark:text-white flex items-center justify-center">
                          <Folder class="h-5 w-5 mr-1 text-blue-500" />
                          {userStats().projectsCount}
                        </div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">{t("shell.projects")}</div>
                      </div>
                      <div class="text-center">
                        <div class="text-2xl font-bold text-gray-900 dark:text-white flex items-center justify-center">
                          <PenTool class="h-5 w-5 mr-1 text-green-500" />
                          {userStats().totalDesigns}
                        </div>
                        <div class="text-sm text-gray-500 dark:text-gray-400">{t("settings.profile.designs")}</div>
                      </div>
                    </div>

                    <Show when={userStats().drawingsCount > 0 || userStats().toolpathsCount > 0}>
                      <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                          <div class="text-center">
                            <div class="font-semibold text-gray-900 dark:text-white">{userStats().drawingsCount}</div>
                            <div class="text-gray-500 dark:text-gray-400">{t("settings.profile.drawings")}</div>
                          </div>
                          <div class="text-center">
                            <div class="font-semibold text-gray-900 dark:text-white">{userStats().toolpathsCount}</div>
                            <div class="text-gray-500 dark:text-gray-400">{t("shell.toolpaths")}</div>
                          </div>
                        </div>
                      </div>
                    </Show>

                    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <div class="flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
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
                      <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                      <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                    </div>
                    <div class="text-center">
                      <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                      <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                    </div>
                  </div>
                </div>
              </Show>
            </div>

            {/* Badges */}
            <div class="mt-6">
              <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">{t("settings.profile.achievements")}</h4>
              <div class="flex flex-wrap gap-2">
                <Show when={userStats().totalDesigns >= 10}>
                  <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                    <Star class="h-3 w-3 mr-1" />
                    {t("settings.profile.badgeExpert")}
                  </span>
                </Show>
                <Show when={userStats().projectsCount >= 5}>
                  <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                    <TrendingUp class="h-3 w-3 mr-1" />
                    {t("settings.profile.badgeActive")}
                  </span>
                </Show>
                <Show when={profile.data() !== undefined}>
                  <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                    <ShieldCheck class="h-3 w-3 mr-1" />
                    {t("settings.profile.badgeVerified")}
                  </span>
                </Show>
                <Show when={userStats().toolpathsCount >= 3}>
                  <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                    <SettingsIcon class="h-3 w-3 mr-1" />
                    {t("settings.profile.badgeCam")}
                  </span>
                </Show>
                <Show when={userStats().totalDesigns >= 50}>
                  <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400">
                    <Star class="h-3 w-3 mr-1" />
                    {t("settings.profile.badgeMaster")}
                  </span>
                </Show>
                <Show when={userStats().projectsCount === 0 && userStats().totalDesigns === 0}>
                  <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
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
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div class="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t("settings.profile.basicInfo")}</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t("auth.email")}
                    </label>
                    <input
                      type="email"
                      value={profileData().email}
                      disabled
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    />
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("settings.profile.emailLocked")}</p>
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t("settings.profile.bio")}
                </label>
                <textarea
                  value={profileData().bio}
                  onInput={(event) => setProfileData((previous) => ({ ...previous, bio: event.currentTarget.value }))}
                  disabled={!isEditing()}
                  rows={4}
                  placeholder="Tell us about yourself, your experience, and what you're passionate about..."
                  class={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none ${
                    !isEditing() ? "cursor-not-allowed bg-gray-50 dark:bg-gray-800" : "focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  }`}
                />
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t("settings.profile.bioCount", { count: profileData().bio.length })}
                </p>
              </div>

              {/* Skills */}
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t("settings.profile.skills")}
                </label>
                <div class="flex flex-wrap gap-2 mb-3">
                  <For each={profileData().skills}>
                    {(skill) => (
                      <Motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                      >
                        {skill}
                        <Show when={isEditing()}>
                          <button
                            type="button"
                            onClick={() => removeSkill(skill)}
                            class="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                          >
                            <CircleX class="h-4 w-4" />
                          </button>
                        </Show>
                      </Motion.span>
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
                      class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />

                    <Show when={showSkillSuggestions()}>
                      <div class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
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
                              class="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 text-sm text-gray-900 dark:text-white"
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
                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">{t("settings.profile.privacy")}</h4>
                <div class="space-y-3">
                  <label class="flex items-center justify-between">
                    <div class="flex items-center">
                      <Eye class="h-4 w-4 mr-2 text-gray-500" />
                      <span class="text-sm text-gray-900 dark:text-white">{t("settings.profile.publicProfile")}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileData((previous) => ({ ...previous, publicProfile: !previous.publicProfile }))}
                      disabled={!isEditing()}
                      class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        profileData().publicProfile ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"
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
                      <Show when={profileData().showEmail} fallback={<EyeOff class="h-4 w-4 mr-2 text-gray-500" />}>
                        <Eye class="h-4 w-4 mr-2 text-gray-500" />
                      </Show>
                      <span class="text-sm text-gray-900 dark:text-white">{t("settings.profile.showEmail")}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileData((previous) => ({ ...previous, showEmail: !previous.showEmail }))}
                      disabled={!isEditing()}
                      class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        profileData().showEmail ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"
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

      {/* Save Button */}
      <Presence>
        <Show when={isEditing()}>
          <Motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            class="flex justify-end space-x-3"
          >
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              class="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isUploading()}
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center"
            >
              <Show when={isUploading()}>
                <div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
              </Show>
              {t("settings.profile.save")}
            </button>
          </Motion.div>
        </Show>
      </Presence>
    </Motion.div>
  )
}
