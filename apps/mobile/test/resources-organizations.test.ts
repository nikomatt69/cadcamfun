import { describe, expect, test } from "bun:test"
import { filterResources, resourceFacts, resourceTypes } from "../lib/resources"
import { canDeleteOrganization, canUpdateOrganization, filterOrganizations } from "../lib/organizations"
import { shouldPresentNotification, markNotificationShown } from "../lib/notification-policy"
import type { ResourceRow } from "../lib/client"
import type { NotificationRow } from "@cadcamfun/api"

const rows: ResourceRow[] = [
  { id: "1", name: "Steel", type: "metal", isPublic: false, properties: { density: 7850, hardness: "HB 150" } },
  { id: "2", name: "Alu plate", type: "metal", isPublic: true, properties: { density: 2700 } },
  { id: "3", name: "6mm endmill", type: "endmill", diameter: 6, material: "Carbide", isPublic: false },
]

describe("resources parity", () => {
  test("search, type and visibility filters match the desktop list", () => {
    expect(filterResources(rows, { search: "steel", type: "", visibility: "all" }).map((r) => r.id)).toEqual(["1"])
    expect(filterResources(rows, { search: "", type: "metal", visibility: "public" }).map((r) => r.id)).toEqual(["2"])
    expect(resourceTypes(rows)).toEqual(["endmill", "metal"])
  })
  test("facts mirror the desktop cards", () => {
    expect(resourceFacts("materials", rows[0]!)).toContainEqual({ label: "Density", value: "7850 kg/m³" })
    expect(resourceFacts("tools", rows[2]!)).toContainEqual({ label: "Diameter", value: "6 mm" })
    expect(resourceFacts("machine-configs", { id: "m", name: "Mill", config: { controller: "grbl", maxSpindleSpeed: 18000, workVolume: { x: 300, y: 180, z: 60 } } })).toContainEqual({ label: "Envelope", value: "300×180×60 mm" })
  })
})

describe("organizations parity", () => {
  test("search and role gates match the sidecar rules", () => {
    const orgs = [{ id: "a", name: "Acme", description: null, createdAt: "", updatedAt: "", role: "ADMIN" as const, userCount: 1, projectCount: 0 }, { id: "b", name: "Beta lab", description: "cnc", createdAt: "", updatedAt: "", role: "MEMBER" as const, userCount: 2, projectCount: 1 }]
    expect(filterOrganizations(orgs, "cnc").map((o) => o.id)).toEqual(["b"])
    expect(canUpdateOrganization("MANAGER")).toBe(true)
    expect(canUpdateOrganization("MEMBER")).toBe(false)
    expect(canDeleteOrganization("ADMIN")).toBe(true)
    expect(canDeleteOrganization("MANAGER")).toBe(false)
  })
})

describe("mobile native notifications", () => {
  test("only important unread rows present, once", () => {
    const row: NotificationRow = { id: "n-test-1", type: "WORKFLOW_FAILED", title: "t", content: "c", isRead: false, createdAt: "", userId: "u", organizationId: null, projectId: null, componentId: null, messageId: null, linkUrl: null }
    expect(shouldPresentNotification(row)).toBe(true)
    markNotificationShown("n-test-1")
    expect(shouldPresentNotification(row)).toBe(false)
    expect(shouldPresentNotification({ ...row, id: "n-test-2", type: "NEW_MESSAGE" })).toBe(false)
  })
})
