import type {
  EstimateDetails,
  EstimateResponse,
  EstimateRow,
  MaterialCostDetails,
  MaterialCostResponse,
  MaterialCostRow,
  OperationCostDetails,
  OperationCostRow,
  ToolWearDetails,
  ToolWearResponse,
  ToolWearRow
} from "@cadcamfun/api"
import { Database, type Db, type DatabaseError, schema } from "@cadcamfun/db"
import { and, asc, eq, inArray } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import type { CostSettings, MaterialCostLike, ToolWearLike } from "../services/costs.ts"
import { SYSTEM_DEFAULT_SETTINGS } from "../services/costs.ts"
import { isOrgMember, orgIdsOf, orgRef, userRef } from "./access.ts"
import { LiveEvents, announcingWrites } from "../services/live-events.ts"

type MaterialCostRow_ = typeof schema.materialCostTable.$inferSelect
type OperationCostRow_ = typeof schema.operationCostTable.$inferSelect
type ToolWearRow_ = typeof schema.toolWearCostTable.$inferSelect
type EstimateRow_ = typeof schema.productionCostEstimateTable.$inferSelect

const stamp = (row: { createdAt: Date; updatedAt: Date }) => ({
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
})

const toMaterialCostRow = (row: MaterialCostRow_): typeof MaterialCostRow.Type => ({
  ...stamp(row),
  ownerId: row.ownerId,
  organizationId: row.organizationId,
  currencyCode: row.currencyCode,
  materialId: row.materialId,
  costPerUnit: row.costPerUnit,
  wasteFactor: row.wasteFactor,
  minimumCharge: row.minimumCharge,
  id: row.id
})

const toToolWearRow = (row: ToolWearRow_): typeof ToolWearRow.Type => ({
  ...stamp(row),
  ownerId: row.ownerId,
  organizationId: row.organizationId,
  currencyCode: row.currencyCode,
  toolId: row.toolId,
  wearRatePerMeter: row.wearRatePerMeter,
  replacementCost: row.replacementCost,
  replacementThreshold: row.replacementThreshold,
  id: row.id
})

const toOperationCostRow = (row: OperationCostRow_): typeof OperationCostRow.Type => ({
  ...stamp(row),
  ownerId: row.ownerId,
  organizationId: row.organizationId,
  currencyCode: row.currencyCode,
  name: row.name,
  machineHourlyRate: row.machineHourlyRate,
  operatorHourlyRate: row.operatorHourlyRate,
  setupTime: row.setupTime,
  id: row.id
})

const toEstimateRow = (row: EstimateRow_): typeof EstimateRow.Type => ({
  ...stamp(row),
  materialCost: row.materialCost,
  toolWearCost: row.toolWearCost,
  machineTime: row.machineTime,
  machineTimeCost: row.machineTimeCost,
  operatorTime: row.operatorTime,
  operatorTimeCost: row.operatorTimeCost,
  setupCost: row.setupCost,
  totalCost: row.totalCost,
  currencyCode: row.currencyCode,
  ownerId: row.ownerId,
  organizationId: row.organizationId,
  toolpathId: row.toolpathId,
  details: row.details ?? {},
  operationCostId: row.operationCostId,
  costSettingsId: null,
  id: row.id
})

/**
 * The user may read a row they own, one in an organisation they belong to, or one with
 * no owner at all (a shared default such as the system cost settings).
 */
const readable = async (db: Db, userId: string, ownerId: string | null, organizationId: string | null): Promise<boolean> => {
  if (ownerId === userId) return true
  if (organizationId !== null) return isOrgMember(db, userId, organizationId)
  return ownerId === null
}

export interface EstimateInput {
  readonly toolpathId: string
  readonly totalCost: number
  readonly materialCost?: number | undefined
  readonly toolWearCost?: number | undefined
  readonly machineTime?: number | undefined
  readonly machineTimeCost?: number | undefined
  readonly operatorTime?: number | undefined
  readonly operatorTimeCost?: number | undefined
  readonly setupCost?: number | undefined
  readonly currencyCode?: string | undefined
  readonly details?: unknown
  readonly operationCostId?: string | null | undefined
  readonly organizationId?: string | null | undefined
}

/**
 * Persistence for `/api/production-costs/*`. Visibility follows the legacy rule: own rows,
 * rows of an organisation the user belongs to, and ownerless rows.
 */
export class ProductionCostRepo extends Context.Service<ProductionCostRepo, {
  listEstimates(userId: string, filter: { toolpathId?: string | undefined; projectId?: string | undefined; organizationId?: string | null | undefined }): Effect.Effect<typeof EstimateDetails.Type[], DatabaseError>
  findEstimate(userId: string, id: string): Effect.Effect<typeof EstimateDetails.Type | null, DatabaseError>
  createEstimate(userId: string, input: EstimateInput): Effect.Effect<typeof EstimateDetails.Type, DatabaseError>
  updateEstimate(userId: string, id: string, patch: { currencyCode?: string | undefined; details?: unknown; notes?: string | undefined }): Effect.Effect<typeof EstimateResponse.Type, DatabaseError>
  deleteEstimate(userId: string, id: string): Effect.Effect<void, DatabaseError>
  listMaterialCosts(userId: string, filter: { materialId?: string | undefined; organizationId?: string | null | undefined }): Effect.Effect<typeof MaterialCostDetails.Type[], DatabaseError>
  findMaterialCost(userId: string, id: string): Effect.Effect<typeof MaterialCostDetails.Type | null, DatabaseError>
  createMaterialCost(userId: string, input: { materialId: string; costPerUnit: number; wasteFactor?: number | undefined; minimumCharge?: number | undefined; currencyCode?: string | undefined; organizationId?: string | null | undefined }): Effect.Effect<typeof MaterialCostResponse.Type, DatabaseError>
  updateMaterialCost(userId: string, id: string, patch: { costPerUnit?: number | undefined; wasteFactor?: number | undefined; minimumCharge?: number | undefined; currencyCode?: string | undefined }): Effect.Effect<typeof MaterialCostResponse.Type, DatabaseError>
  deleteMaterialCost(userId: string, id: string): Effect.Effect<void, DatabaseError>
  listOperationCosts(userId: string, filter: { organizationId?: string | null | undefined }): Effect.Effect<typeof OperationCostDetails.Type[], DatabaseError>
  findOperationCost(userId: string, id: string): Effect.Effect<typeof OperationCostDetails.Type | null, DatabaseError>
  createOperationCost(userId: string, input: { name: string; machineHourlyRate: number; operatorHourlyRate: number; setupTime?: number | undefined; currencyCode?: string | undefined; organizationId?: string | null | undefined }): Effect.Effect<typeof OperationCostDetails.Type, DatabaseError>
  updateOperationCost(userId: string, id: string, patch: { name?: string | undefined; machineHourlyRate?: number | undefined; operatorHourlyRate?: number | undefined; setupTime?: number | undefined; currencyCode?: string | undefined }): Effect.Effect<typeof OperationCostDetails.Type, DatabaseError>
  deleteOperationCost(userId: string, id: string): Effect.Effect<void, DatabaseError>
  listToolWear(userId: string, filter: { toolId?: string | undefined; organizationId?: string | null | undefined }): Effect.Effect<typeof ToolWearDetails.Type[], DatabaseError>
  findToolWear(userId: string, id: string): Effect.Effect<typeof ToolWearDetails.Type | null, DatabaseError>
  createToolWear(userId: string, input: { toolId: string; wearRatePerMeter: number; replacementCost: number; replacementThreshold?: number | undefined; currencyCode?: string | undefined; organizationId?: string | null | undefined }): Effect.Effect<typeof ToolWearResponse.Type, DatabaseError>
  updateToolWear(userId: string, id: string, patch: { wearRatePerMeter?: number | undefined; replacementCost?: number | undefined; replacementThreshold?: number | undefined; currencyCode?: string | undefined }): Effect.Effect<typeof ToolWearResponse.Type, DatabaseError>
  deleteToolWear(userId: string, id: string): Effect.Effect<void, DatabaseError>
  /** Cost settings for a user/organisation, falling back to the system defaults. */
  settingsFor(userId: string, organizationId: string | null): Effect.Effect<CostSettings, DatabaseError>
  materialCostFor(userId: string, materialId: string): Effect.Effect<MaterialCostLike | null, DatabaseError>
  toolWearFor(userId: string, toolId: string): Effect.Effect<ToolWearLike | null, DatabaseError>
}>()("cadcamfun/ProductionCostRepo") {
  static readonly layer = Layer.effect(
    ProductionCostRepo,
    Effect.gen(function*() {
      const { query } = yield* Database
      const events = yield* LiveEvents
      const T = schema.productionCostEstimateTable
      const MC = schema.materialCostTable
      const OC = schema.operationCostTable
      const TW = schema.toolWearCostTable

      const relations = async (db: Db, rows: ReadonlyArray<{ ownerId: string | null; organizationId: string | null }>) => ({
        users: await userRef(db, rows.map((r) => r.ownerId).filter((id): id is string => id !== null)),
        orgs: await orgRef(db, rows.map((r) => r.organizationId).filter((id): id is string => id !== null))
      })

      const attach = async (
        db: Db,
        rows: ReadonlyArray<MaterialCostRow_>
      ): Promise<typeof MaterialCostDetails.Type[]> => {
        const { users, orgs } = await relations(db, rows)
        const materials = rows.length === 0
          ? new Map<string, typeof MaterialCostDetails.Type["material"]>()
          : new Map((await db.select().from(schema.materialTable)
            .where(inArray(schema.materialTable.id, rows.map((r) => r.materialId))))
            .map((m) => [m.id, { ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() }]))
        return rows.map((row) => {
          const base = toMaterialCostRow(row)
          const material = materials.get(row.materialId)
          if (!material) throw new Error(`MaterialCost ${row.id} references missing material ${row.materialId}`)
          return {
            ...base,
            material,
            owner: row.ownerId === null ? null : users.get(row.ownerId) ?? { id: row.ownerId, name: null, email: null },
            organization: row.organizationId === null ? null : orgs.get(row.organizationId) ?? null
          }
        })
      }

      const attachWear = async (db: Db, rows: ReadonlyArray<ToolWearRow_>): Promise<typeof ToolWearDetails.Type[]> => {
        const { users, orgs } = await relations(db, rows)
        const tools = rows.length === 0
          ? new Map<string, typeof ToolWearDetails.Type["tool"]>()
          : new Map((await db.select().from(schema.toolTable)
            .where(inArray(schema.toolTable.id, rows.map((r) => r.toolId))))
            .map((t) => [t.id, { ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() }]))
        return rows.map((row) => {
          const base = toToolWearRow(row)
          const tool = tools.get(row.toolId)
          if (!tool) throw new Error(`ToolWearCost ${row.id} references missing tool ${row.toolId}`)
          return {
            ...base,
            tool,
            owner: row.ownerId === null ? null : users.get(row.ownerId) ?? { id: row.ownerId, name: null, email: null },
            organization: row.organizationId === null ? null : orgs.get(row.organizationId) ?? null
          }
        })
      }

      const attachOperation = async (db: Db, rows: ReadonlyArray<OperationCostRow_>): Promise<typeof OperationCostDetails.Type[]> => {
        const { users, orgs } = await relations(db, rows)
        return rows.map((row) => ({
          ...toOperationCostRow(row),
          owner: row.ownerId === null ? null : users.get(row.ownerId) ?? { id: row.ownerId, name: null, email: null },
          organization: row.organizationId === null ? null : orgs.get(row.organizationId) ?? null
        }))
      }

      const attachEstimates = async (db: Db, rows: ReadonlyArray<EstimateRow_>): Promise<typeof EstimateDetails.Type[]> => {
        const { users, orgs } = await relations(db, rows)
        const toolpaths = rows.length === 0
          ? new Map<string, { id: string; name: string; projectId: string | null }>()
          : new Map((await db.select({ id: schema.toolpathTable.id, name: schema.toolpathTable.name, projectId: schema.toolpathTable.projectId })
            .from(schema.toolpathTable).where(inArray(schema.toolpathTable.id, rows.map((r) => r.toolpathId))))
            .map((t) => [t.id, { id: t.id, name: t.name, projectId: t.projectId }]))
        const operations = rows.filter((r) => r.operationCostId !== null)
        const operationRows = operations.length === 0
          ? []
          : await db.select().from(OC).where(inArray(OC.id, operations.map((r) => r.operationCostId!)))
        const operationMap = new Map(operationRows.map((o) => [o.id, toOperationCostRow(o)]))
        return rows.map((row) => {
          const toolpath = toolpaths.get(row.toolpathId)
          if (!toolpath) throw new Error(`ProductionCostEstimate ${row.id} references missing toolpath ${row.toolpathId}`)
          return {
            ...toEstimateRow(row),
            owner: users.get(row.ownerId) ?? { id: row.ownerId, name: null, email: null },
            organization: row.organizationId === null ? null : orgs.get(row.organizationId) ?? null,
            toolpath,
            operationCost: row.operationCostId === null ? null : operationMap.get(row.operationCostId) ?? null
          }
        })
      }

      return ProductionCostRepo.of(announcingWrites(events, {
        listEstimates: (userId, filter) =>
          query("production-costs.estimates.list", async (db) => {
            const orgIds = await orgIdsOf(db, userId)
            const toolpathIds = filter.projectId === undefined
              ? undefined
              : (await db.select({ id: schema.toolpathTable.id }).from(schema.toolpathTable)
                .where(eq(schema.toolpathTable.projectId, filter.projectId))).map((t) => t.id)
            const rows = await db.select().from(T)
              .where(and(
                eq(T.ownerId, userId),
                filter.toolpathId === undefined ? undefined : eq(T.toolpathId, filter.toolpathId),
                filter.projectId === undefined ? undefined : inArray(T.toolpathId, toolpathIds ?? [""]),
                filter.organizationId === undefined || filter.organizationId === null ? undefined : eq(T.organizationId, filter.organizationId)
              ))
              .orderBy(asc(T.createdAt))
            // Own rows plus organisation rows; the FK on ownerId makes the first term mandatory.
            const orgRows = orgIds.length === 0
              ? []
              : await db.select().from(T)
                .where(and(
                  inArray(T.organizationId, orgIds),
                  filter.toolpathId === undefined ? undefined : eq(T.toolpathId, filter.toolpathId),
                  filter.projectId === undefined ? undefined : inArray(T.toolpathId, toolpathIds ?? [""]),
                  filter.organizationId === undefined || filter.organizationId === null ? undefined : eq(T.organizationId, filter.organizationId)
                ))
                .orderBy(asc(T.createdAt))
            return attachEstimates(db, [...rows, ...orgRows.filter((r) => !rows.some((own) => own.id === r.id))])
          }),

        findEstimate: (userId, id) =>
          query("production-costs.estimates.get", async (db) => {
            const row = await db.select().from(T).where(eq(T.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) return null
            return (await attachEstimates(db, [row]))[0] ?? null
          }),

        createEstimate: (userId, input) =>
          query("production-costs.estimates.create", async (db) => {
            const [row] = await db.insert(T).values({
              toolpathId: input.toolpathId,
              totalCost: input.totalCost,
              materialCost: input.materialCost ?? 0,
              toolWearCost: input.toolWearCost ?? 0,
              machineTime: input.machineTime ?? 0,
              machineTimeCost: input.machineTimeCost ?? 0,
              operatorTime: input.operatorTime ?? 0,
              operatorTimeCost: input.operatorTimeCost ?? 0,
              setupCost: input.setupCost ?? 0,
              ...(input.currencyCode === undefined ? {} : { currencyCode: input.currencyCode }),
              details: input.details ?? {},
              operationCostId: input.operationCostId ?? null,
              ownerId: userId,
              organizationId: input.organizationId ?? null
            }).returning()
            if (!row) throw new Error("Failed to insert production cost estimate")
            return (await attachEstimates(db, [row]))[0]!
          }),

        updateEstimate: (userId, id, patch) =>
          query("production-costs.estimates.update", async (db) => {
            const row = await db.select().from(T).where(eq(T.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) {
              throw new Error(`Estimate ${id} is not accessible`)
            }
            const [updated] = await db.update(T).set({
              ...(patch.currencyCode === undefined ? {} : { currencyCode: patch.currencyCode }),
              ...(patch.details === undefined ? {} : { details: patch.details }),
              ...(patch.notes === undefined
                ? {}
                : { details: { ...(typeof row.details === "object" && row.details !== null ? row.details : {}), notes: patch.notes } })
            }).where(eq(T.id, id)).returning()
            const target = updated ?? row
            const { users, orgs } = await relations(db, [target])
            return {
              ...toEstimateRow(target),
              owner: users.get(target.ownerId) ?? { id: target.ownerId, name: null, email: null },
              organization: target.organizationId === null ? null : orgs.get(target.organizationId) ?? null,
              toolpath: { id: target.toolpathId, name: "", projectId: null }
            }
          }),

        deleteEstimate: (userId, id) =>
          query("production-costs.estimates.delete", async (db) => {
            const row = await db.select().from(T).where(eq(T.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) {
              throw new Error(`Estimate ${id} is not accessible`)
            }
            await db.delete(T).where(eq(T.id, id))
            return row.organizationId
          }).pipe(Effect.tap((organizationId) => events.resourcesChanged(userId, organizationId)), Effect.asVoid),

        listMaterialCosts: (userId, filter) =>
          query("production-costs.material-costs.list", async (db) => {
            const rows = await db.select().from(MC)
              .where(and(
                filter.materialId === undefined ? undefined : eq(MC.materialId, filter.materialId),
                filter.organizationId === undefined || filter.organizationId === null ? undefined : eq(MC.organizationId, filter.organizationId)
              ))
              .orderBy(asc(MC.createdAt))
            const visible = await Promise.all(rows.map(async (row) => readable(db, userId, row.ownerId, row.organizationId)))
            return attach(db, rows.filter((_, index) => visible[index] === true))
          }),

        findMaterialCost: (userId, id) =>
          query("production-costs.material-costs.get", async (db) => {
            const row = await db.select().from(MC).where(eq(MC.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) return null
            return (await attach(db, [row]))[0] ?? null
          }),

        createMaterialCost: (userId, input) =>
          query("production-costs.material-costs.create", async (db) => {
            const [row] = await db.insert(MC).values({
              materialId: input.materialId,
              costPerUnit: input.costPerUnit,
              wasteFactor: input.wasteFactor ?? 0,
              minimumCharge: input.minimumCharge ?? 0,
              ...(input.currencyCode === undefined ? {} : { currencyCode: input.currencyCode }),
              ownerId: userId,
              organizationId: input.organizationId ?? null
            }).returning()
            if (!row) throw new Error("Failed to insert material cost")
            return (await attach(db, [row]))[0]!
          }),

        updateMaterialCost: (userId, id, patch) =>
          query("production-costs.material-costs.update", async (db) => {
            const row = await db.select().from(MC).where(eq(MC.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) {
              throw new Error(`Material cost ${id} is not accessible`)
            }
            const [updated] = await db.update(MC).set({
              ...(patch.costPerUnit === undefined ? {} : { costPerUnit: patch.costPerUnit }),
              ...(patch.wasteFactor === undefined ? {} : { wasteFactor: patch.wasteFactor }),
              ...(patch.minimumCharge === undefined ? {} : { minimumCharge: patch.minimumCharge }),
              ...(patch.currencyCode === undefined ? {} : { currencyCode: patch.currencyCode })
            }).where(eq(MC.id, id)).returning()
            return (await attach(db, [updated ?? row]))[0]!
          }),

        deleteMaterialCost: (userId, id) =>
          query("production-costs.material-costs.delete", async (db) => {
            const row = await db.select().from(MC).where(eq(MC.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) {
              throw new Error(`Material cost ${id} is not accessible`)
            }
            await db.delete(MC).where(eq(MC.id, id))
            return row.organizationId
          }).pipe(Effect.tap((organizationId) => events.resourcesChanged(userId, organizationId)), Effect.asVoid),

        listOperationCosts: (userId, filter) =>
          query("production-costs.operation-costs.list", async (db) => {
            const rows = await db.select().from(OC)
              .where(filter.organizationId === undefined || filter.organizationId === null ? undefined : eq(OC.organizationId, filter.organizationId))
              .orderBy(asc(OC.createdAt))
            const visible = await Promise.all(rows.map(async (row) => readable(db, userId, row.ownerId, row.organizationId)))
            return attachOperation(db, rows.filter((_, index) => visible[index] === true))
          }),

        findOperationCost: (userId, id) =>
          query("production-costs.operation-costs.get", async (db) => {
            const row = await db.select().from(OC).where(eq(OC.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) return null
            return (await attachOperation(db, [row]))[0] ?? null
          }),

        createOperationCost: (userId, input) =>
          query("production-costs.operation-costs.create", async (db) => {
            const [row] = await db.insert(OC).values({
              name: input.name,
              machineHourlyRate: input.machineHourlyRate,
              operatorHourlyRate: input.operatorHourlyRate,
              setupTime: input.setupTime ?? 30,
              ...(input.currencyCode === undefined ? {} : { currencyCode: input.currencyCode }),
              ownerId: userId,
              organizationId: input.organizationId ?? null
            }).returning()
            if (!row) throw new Error("Failed to insert operation cost")
            return (await attachOperation(db, [row]))[0]!
          }),

        updateOperationCost: (userId, id, patch) =>
          query("production-costs.operation-costs.update", async (db) => {
            const row = await db.select().from(OC).where(eq(OC.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) {
              throw new Error(`Operation cost ${id} is not accessible`)
            }
            const [updated] = await db.update(OC).set({
              ...(patch.name === undefined ? {} : { name: patch.name }),
              ...(patch.machineHourlyRate === undefined ? {} : { machineHourlyRate: patch.machineHourlyRate }),
              ...(patch.operatorHourlyRate === undefined ? {} : { operatorHourlyRate: patch.operatorHourlyRate }),
              ...(patch.setupTime === undefined ? {} : { setupTime: patch.setupTime }),
              ...(patch.currencyCode === undefined ? {} : { currencyCode: patch.currencyCode })
            }).where(eq(OC.id, id)).returning()
            return (await attachOperation(db, [updated ?? row]))[0]!
          }),

        deleteOperationCost: (userId, id) =>
          query("production-costs.operation-costs.delete", async (db) => {
            const row = await db.select().from(OC).where(eq(OC.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) {
              throw new Error(`Operation cost ${id} is not accessible`)
            }
            await db.delete(OC).where(eq(OC.id, id))
            return row.organizationId
          }).pipe(Effect.tap((organizationId) => events.resourcesChanged(userId, organizationId)), Effect.asVoid),

        listToolWear: (userId, filter) =>
          query("production-costs.tool-wear.list", async (db) => {
            const rows = await db.select().from(TW)
              .where(and(
                filter.toolId === undefined ? undefined : eq(TW.toolId, filter.toolId),
                filter.organizationId === undefined || filter.organizationId === null ? undefined : eq(TW.organizationId, filter.organizationId)
              ))
              .orderBy(asc(TW.createdAt))
            const visible = await Promise.all(rows.map(async (row) => readable(db, userId, row.ownerId, row.organizationId)))
            return attachWear(db, rows.filter((_, index) => visible[index] === true))
          }),

        findToolWear: (userId, id) =>
          query("production-costs.tool-wear.get", async (db) => {
            const row = await db.select().from(TW).where(eq(TW.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) return null
            return (await attachWear(db, [row]))[0] ?? null
          }),

        createToolWear: (userId, input) =>
          query("production-costs.tool-wear.create", async (db) => {
            const [row] = await db.insert(TW).values({
              toolId: input.toolId,
              wearRatePerMeter: input.wearRatePerMeter,
              replacementCost: input.replacementCost,
              replacementThreshold: input.replacementThreshold ?? 100,
              ...(input.currencyCode === undefined ? {} : { currencyCode: input.currencyCode }),
              ownerId: userId,
              organizationId: input.organizationId ?? null
            }).returning()
            if (!row) throw new Error("Failed to insert tool wear cost")
            return (await attachWear(db, [row]))[0]!
          }),

        updateToolWear: (userId, id, patch) =>
          query("production-costs.tool-wear.update", async (db) => {
            const row = await db.select().from(TW).where(eq(TW.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) {
              throw new Error(`Tool wear cost ${id} is not accessible`)
            }
            const [updated] = await db.update(TW).set({
              ...(patch.wearRatePerMeter === undefined ? {} : { wearRatePerMeter: patch.wearRatePerMeter }),
              ...(patch.replacementCost === undefined ? {} : { replacementCost: patch.replacementCost }),
              ...(patch.replacementThreshold === undefined ? {} : { replacementThreshold: patch.replacementThreshold }),
              ...(patch.currencyCode === undefined ? {} : { currencyCode: patch.currencyCode })
            }).where(eq(TW.id, id)).returning()
            return (await attachWear(db, [updated ?? row]))[0]!
          }),

        deleteToolWear: (userId, id) =>
          query("production-costs.tool-wear.delete", async (db) => {
            const row = await db.select().from(TW).where(eq(TW.id, id)).limit(1).then((r) => r[0])
            if (!row || !(await readable(db, userId, row.ownerId, row.organizationId))) {
              throw new Error(`Tool wear cost ${id} is not accessible`)
            }
            await db.delete(TW).where(eq(TW.id, id))
            return row.organizationId
          }).pipe(Effect.tap((organizationId) => events.resourcesChanged(userId, organizationId)), Effect.asVoid),

        settingsFor: (userId, organizationId) =>
          query("production-costs.settings", async (db) => {
            const row = await db.select().from(schema.costSettingsTable)
              .where(and(
                eq(schema.costSettingsTable.ownerId, userId),
                organizationId === null ? undefined : eq(schema.costSettingsTable.organizationId, organizationId)
              ))
              .limit(1).then((r) => r[0])
            if (!row) return SYSTEM_DEFAULT_SETTINGS
            return {
              id: row.id,
              defaultCurrencyCode: row.defaultCurrencyCode,
              defaultMachineHourlyRate: row.defaultMachineHourlyRate,
              defaultOperatorHourlyRate: row.defaultOperatorHourlyRate,
              defaultSetupTime: row.defaultSetupTime
            }
          }),

        materialCostFor: (userId, materialId) =>
          query("production-costs.material-cost-for", async (db) => {
            const rows = await db.select().from(MC).where(eq(MC.materialId, materialId)).orderBy(asc(MC.createdAt))
            for (const row of rows) {
              if (await readable(db, userId, row.ownerId, row.organizationId)) {
                return { costPerUnit: row.costPerUnit, wasteFactor: row.wasteFactor, minimumCharge: row.minimumCharge }
              }
            }
            return null
          }),

        toolWearFor: (userId, toolId) =>
          query("production-costs.tool-wear-for", async (db) => {
            const all = await db.select().from(TW).where(eq(TW.toolId, toolId)).orderBy(asc(TW.createdAt))
            for (const row of all) {
              if (await readable(db, userId, row.ownerId, row.organizationId)) {
                return { wearRatePerMeter: row.wearRatePerMeter, replacementCost: row.replacementCost }
              }
            }
            return null
          })
      }, ["createEstimate", "updateEstimate", "createMaterialCost", "updateMaterialCost", "createOperationCost", "updateOperationCost", "createToolWear", "updateToolWear"]))
    })
  ).pipe(Layer.provide(LiveEvents.layer))
}
