import { schema } from "@cadcamfun/db"
import type { Db } from "@cadcamfun/db"
import { and, eq, inArray } from "drizzle-orm"

/** Organisation ids the user belongs to. */
export const orgIdsOf = async (db: Db, userId: string): Promise<string[]> =>
  (await db.select({ id: schema.userOrganizationTable.organizationId }).from(schema.userOrganizationTable)
    .where(eq(schema.userOrganizationTable.userId, userId))).map((r) => r.id)

export const isOrgMember = async (db: Db, userId: string, organizationId: string): Promise<boolean> =>
  (await db.select({ id: schema.userOrganizationTable.id }).from(schema.userOrganizationTable)
    .where(and(eq(schema.userOrganizationTable.userId, userId), eq(schema.userOrganizationTable.organizationId, organizationId)))
    .limit(1)).length > 0

/** ADMIN/MANAGER of the organisation: legacy `hasOrganizationWriteAccess`. */
export const hasOrgWriteAccess = async (db: Db, userId: string, organizationId: string): Promise<boolean> =>
  (await db.select({ id: schema.userOrganizationTable.id }).from(schema.userOrganizationTable)
    .where(and(
      eq(schema.userOrganizationTable.userId, userId),
      eq(schema.userOrganizationTable.organizationId, organizationId),
      inArray(schema.userOrganizationTable.role, ["ADMIN", "MANAGER"])
    )).limit(1)).length > 0

export const userRef = async (db: Db, ids: ReadonlyArray<string>) =>
  ids.length === 0
    ? new Map<string, { id: string; name: string | null; email: string | null }>()
    : new Map((await db.select({ id: schema.userTable.id, name: schema.userTable.name, email: schema.userTable.email })
      .from(schema.userTable).where(inArray(schema.userTable.id, [...ids]))).map((u) => [u.id, u]))

export const orgRef = async (db: Db, ids: ReadonlyArray<string>) =>
  ids.length === 0
    ? new Map<string, { id: string; name: string }>()
    : new Map((await db.select({ id: schema.organizationTable.id, name: schema.organizationTable.name })
      .from(schema.organizationTable).where(inArray(schema.organizationTable.id, [...ids]))).map((o) => [o.id, o]))
