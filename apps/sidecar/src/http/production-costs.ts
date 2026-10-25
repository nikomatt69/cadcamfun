import { Api, BadRequest, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { MaterialRepo } from "../repos/material-repo.ts"
import { ToolRepo } from "../repos/tool-repo.ts"
import { ProductionCostRepo } from "../repos/production-cost-repo.ts"
import { ToolpathRepo } from "../repos/toolpath-repo.ts"
import { CostService } from "../services/costs.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

/** Legacy message for an inaccessible row: the owner cannot be told the row exists. */
const inaccessible = new NotFound({ message: "Resource not found or access denied" })

export const ProductionCostsHandlers = HttpApiBuilder.group(Api, "production-costs", Effect.fn(function*(handlers) {
  const repo = yield* ProductionCostRepo
  const toolpaths = yield* ToolpathRepo
  const materials = yield* MaterialRepo
  const tools = yield* ToolRepo
  const costs = yield* CostService

  /** Legacy rule: an organisation id may only be used by one of its members. */
  const checkOrg = (userId: string, organizationId: string | null | undefined) =>
    Effect.gen(function*() {
      if (organizationId === undefined || organizationId === null) return null
      if (!(yield* materials.isMember(userId, organizationId))) {
        return yield* new Forbidden({ message: "You are not a member of the specified organization" })
      }
      return organizationId
    })

  /** Same check for the routes whose contract only declares BadRequest. */
  const checkOrgOrBadRequest = (userId: string, organizationId: string | null | undefined) =>
    checkOrg(userId, organizationId).pipe(Effect.catchTag("Forbidden", () => new BadRequest({ message: "You are not a member of the specified organization" })))

  return handlers
    .handle("listEstimates", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        return yield* repo.listEstimates(user.id, query)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch production cost estimates"))))
    .handle("createEstimate", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const organizationId = yield* checkOrg(user.id, payload.organizationId)
        if (!(yield* toolpaths.find(user.id, payload.toolpathId))) {
          return yield* new NotFound({ message: "Toolpath not found or access denied" })
        }
        if (payload.operationCostId && !(yield* repo.findOperationCost(user.id, payload.operationCostId))) return yield* inaccessible
        return yield* repo.createEstimate(user.id, { ...payload, organizationId })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create production cost estimate"))))
    .handle("getEstimate", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const found = yield* repo.findEstimate(user.id, params.id)
        if (!found) return yield* inaccessible
        return found
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch production cost estimate"))))
    .handle("updateEstimate", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!(yield* repo.findEstimate(user.id, params.id))) return yield* inaccessible
        return yield* repo.updateEstimate(user.id, params.id, payload)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update production cost estimate"))))
    .handle("deleteEstimate", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!(yield* repo.findEstimate(user.id, params.id))) return yield* inaccessible
        yield* repo.deleteEstimate(user.id, params.id)
        return { message: "Production cost estimate deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete production cost estimate"))))
    .handle("calculateEstimate", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const found = yield* toolpaths.find(user.id, payload.toolpathId)
        if (!found) return yield* new NotFound({ message: "Toolpath not found or access denied" })
        const toolpath = found.row
        const organizationId = yield* checkOrgOrBadRequest(user.id, payload.organizationId)
        const settings = yield* repo.settingsFor(user.id, organizationId)
        const wear = toolpath.toolId === null ? null : yield* repo.toolWearFor(user.id, toolpath.toolId)
        const material = toolpath.materialId === null ? null : yield* repo.materialCostFor(user.id, toolpath.materialId)
        const estimate = costs.estimate({
          toolpath: {
            id: toolpath.id,
            data: toolpath.data,
            gcode: toolpath.gcode,
            toolId: toolpath.toolId,
            materialId: toolpath.materialId
          },
          settings,
          toolWear: wear,
          materialCost: material
        })
        return {
          materialCost: estimate.materialCost,
          toolWearCost: estimate.toolWearCost,
          machineTime: estimate.machineTime,
          machineTimeCost: estimate.machineTimeCost,
          operatorTime: estimate.operatorTime,
          operatorTimeCost: estimate.operatorTimeCost,
          setupCost: estimate.setupCost,
          totalCost: estimate.totalCost,
          currencyCode: estimate.currencyCode,
          ownerId: user.id,
          organizationId,
          toolpathId: toolpath.id,
          details: estimate.details
        }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to calculate production cost estimate"))))

    .handle("listMaterialCosts", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        return yield* repo.listMaterialCosts(user.id, query)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch material costs"))))
    .handle("createMaterialCost", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const organizationId = yield* checkOrg(user.id, payload.organizationId)
        const material = yield* materials.access(user.id, payload.materialId)
        if (!material?.allowed) return yield* inaccessible
        return yield* repo.createMaterialCost(user.id, { ...payload, organizationId })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create material cost"))))
    .handle("getMaterialCost", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const found = yield* repo.findMaterialCost(user.id, params.id)
        if (!found) return yield* inaccessible
        return found
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch material cost"))))
    .handle("updateMaterialCost", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!(yield* repo.findMaterialCost(user.id, params.id))) return yield* inaccessible
        return yield* repo.updateMaterialCost(user.id, params.id, payload)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update material cost"))))
    .handle("deleteMaterialCost", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!(yield* repo.findMaterialCost(user.id, params.id))) return yield* inaccessible
        yield* repo.deleteMaterialCost(user.id, params.id)
        return { message: "Material cost deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete material cost"))))

    .handle("listOperationCosts", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        return yield* repo.listOperationCosts(user.id, query)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch operation costs"))))
    .handle("createOperationCost", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const organizationId = yield* checkOrg(user.id, payload.organizationId)
        return yield* repo.createOperationCost(user.id, { ...payload, organizationId })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create operation cost"))))
    .handle("getOperationCost", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const found = yield* repo.findOperationCost(user.id, params.id)
        if (!found) return yield* inaccessible
        return found
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch operation cost"))))
    .handle("updateOperationCost", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!(yield* repo.findOperationCost(user.id, params.id))) return yield* inaccessible
        return yield* repo.updateOperationCost(user.id, params.id, payload)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update operation cost"))))
    .handle("deleteOperationCost", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!(yield* repo.findOperationCost(user.id, params.id))) return yield* inaccessible
        yield* repo.deleteOperationCost(user.id, params.id)
        return { message: "Operation cost deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete operation cost"))))

    .handle("listToolWear", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        return yield* repo.listToolWear(user.id, query)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch tool wear costs"))))
    .handle("createToolWear", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const organizationId = yield* checkOrg(user.id, payload.organizationId)
        const tool = yield* tools.access(user.id, payload.toolId)
        if (!tool?.allowed) return yield* inaccessible
        return yield* repo.createToolWear(user.id, { ...payload, organizationId })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create tool wear cost"))))
    .handle("getToolWear", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const found = yield* repo.findToolWear(user.id, params.id)
        if (!found) return yield* inaccessible
        return found
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch tool wear cost"))))
    .handle("updateToolWear", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!(yield* repo.findToolWear(user.id, params.id))) return yield* inaccessible
        return yield* repo.updateToolWear(user.id, params.id, payload)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update tool wear cost"))))
    .handle("deleteToolWear", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!(yield* repo.findToolWear(user.id, params.id))) return yield* inaccessible
        yield* repo.deleteToolWear(user.id, params.id)
        return { message: "Tool wear cost deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete tool wear cost"))))
}))

