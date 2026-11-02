import type { UserOrganizationItem, UserProjectItem, UserThumbItem } from "@cadcamfun/api"

/** Pure profile logic for the phone: the desktop profile's identity facts and its four item lists. */

export type ProfileListKind = "projects" | "components" | "toolpaths" | "organizations"
export type ProfileListItem<K extends ProfileListKind> =
  K extends "projects" ? typeof UserProjectItem.Type
  : K extends "organizations" ? typeof UserOrganizationItem.Type
  : typeof UserThumbItem.Type

/** Any row of the four lists; organizations add their role and counts. */
export type ProfileRow = ProfileListItem<ProfileListKind>

export const PROFILE_TABS: readonly { id: ProfileListKind; label: string }[] = [
  { id: "projects", label: "Projects" }, { id: "components", label: "Components" },
  { id: "toolpaths", label: "Toolpaths" }, { id: "organizations", label: "Organizations" },
]

export interface ProfileLike {
  readonly name: string | null
  readonly email: string | null
  readonly bio: string | null
  readonly location: string | null
  readonly website: string | null
  readonly company: string | null
  readonly title: string | null
  readonly createdAt: string
  readonly showEmail: boolean
}

export interface ProfileFact { readonly id: string; readonly label: string; readonly value: string }

const filled = (value: string | null | undefined): value is string => typeof value === "string" && value.trim() !== ""

/** "November 2026"; empty for a date that does not parse. */
export function memberSince(iso: string): string {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? "" : new Date(parsed).toLocaleDateString("en-US", { year: "numeric", month: "long" })
}

/** The identity rows the desktop card shows, only the ones that have a value. The owner always sees their own email. */
export function profileFacts(profile: ProfileLike): ProfileFact[] {
  const role = [profile.title, profile.company].filter(filled).join(" · ")
  const facts: ProfileFact[] = [
    { id: "email", label: "Email", value: profile.email ?? "" },
    { id: "role", label: "Work", value: role },
    { id: "location", label: "Location", value: profile.location ?? "" },
    { id: "website", label: "Website", value: profile.website ?? "" },
    { id: "since", label: "Member since", value: memberSince(profile.createdAt) },
  ]
  return facts.filter((fact) => filled(fact.value))
}

/** Two letters for the avatar: first letters of the first two words of the name, else of the email. */
export function initials(name: string | null, email: string | null): string {
  const source = (filled(name) ? name : (email ?? "").split("@")[0] ?? "").trim()
  const letters = source.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0).toUpperCase())
  return letters.join("") || "?"
}

export interface ListRowLike { readonly name: string; readonly description: string | null; readonly updatedAt: string; readonly role?: string; readonly userCount?: number; readonly projectCount?: number }

/** The one-line subtitle of a list row: organizations name the role and size, everything else its description. */
export function itemSubtitle(kind: ProfileListKind, item: ListRowLike): string {
  if (kind === "organizations") {
    const members = item.userCount ?? 0
    const projects = item.projectCount ?? 0
    return [item.role, `${members} ${members === 1 ? "member" : "members"}`, `${projects} ${projects === 1 ? "project" : "projects"}`].filter(filled).join(" · ")
  }
  return filled(item.description) ? item.description : ""
}
