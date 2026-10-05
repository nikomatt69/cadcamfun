import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Conflict, Forbidden, InternalError, NotFound } from "../errors.ts"
import { MaterialRow } from "./materials.ts"
import { ToolRow } from "./tools.ts"

const nullable = Schema.NullOr(Schema.String)
const ref = Schema.Struct({ id: Schema.String, name: nullable })
const owner = Schema.Struct({ ...ref.fields, email: Schema.optional(nullable) })
const scope = { ownerId: nullable, organizationId: nullable }
const timestamps = { id: Schema.String, createdAt: Schema.String, updatedAt: Schema.String }
const relations = { owner: Schema.NullOr(owner), organization: Schema.NullOr(ref) }
const currency = { currencyCode: Schema.String }
const optionalCurrency = { currencyCode: Schema.optional(Schema.String) }
const organizationId = Schema.optional(nullable)
const id = { id: Schema.String }
const message = Schema.Struct({ message: Schema.String })
const readErrors = [BadRequest, Forbidden, NotFound, InternalError] as const
const writeErrors = [...readErrors, Conflict] as const

export const MaterialCostUpdate = Schema.Struct({
  costPerUnit: Schema.optional(Schema.Number), wasteFactor: Schema.optional(Schema.Number),
  minimumCharge: Schema.optional(Schema.Number), ...optionalCurrency
})
export const MaterialCostCreate = Schema.Struct({
  ...MaterialCostUpdate.fields, materialId: Schema.String, costPerUnit: Schema.Number, organizationId
})
export const MaterialCostRow = Schema.Struct({
  ...timestamps, ...scope, ...currency, materialId: Schema.String, costPerUnit: Schema.Number,
  wasteFactor: Schema.Number, minimumCharge: Schema.Number
})
export const MaterialCostResponse = Schema.Struct({ ...MaterialCostRow.fields, material: MaterialRow })
export const MaterialCostDetails = Schema.Struct({ ...MaterialCostResponse.fields, ...relations })

export const ToolWearUpdate = Schema.Struct({
  wearRatePerMeter: Schema.optional(Schema.Number), replacementCost: Schema.optional(Schema.Number),
  replacementThreshold: Schema.optional(Schema.Number), ...optionalCurrency
})
export const ToolWearCreate = Schema.Struct({
  ...ToolWearUpdate.fields, toolId: Schema.String, wearRatePerMeter: Schema.Number,
  replacementCost: Schema.Number, organizationId
})
export const ToolWearRow = Schema.Struct({
  ...timestamps, ...scope, ...currency, toolId: Schema.String, wearRatePerMeter: Schema.Number,
  replacementCost: Schema.Number, replacementThreshold: Schema.Number
})
export const ToolWearResponse = Schema.Struct({ ...ToolWearRow.fields, tool: ToolRow })
export const ToolWearDetails = Schema.Struct({ ...ToolWearResponse.fields, ...relations })

export const OperationCostUpdate = Schema.Struct({
  name: Schema.optional(Schema.String), machineHourlyRate: Schema.optional(Schema.Number),
  operatorHourlyRate: Schema.optional(Schema.Number), setupTime: Schema.optional(Schema.Number), ...optionalCurrency
})
export const OperationCostCreate = Schema.Struct({
  ...OperationCostUpdate.fields, name: Schema.String, machineHourlyRate: Schema.Number,
  operatorHourlyRate: Schema.Number, organizationId
})
export const OperationCostRow = Schema.Struct({
  ...timestamps, ...scope, ...currency, name: Schema.String, machineHourlyRate: Schema.Number,
  operatorHourlyRate: Schema.Number, setupTime: Schema.Number
})
export const OperationCostDetails = Schema.Struct({ ...OperationCostRow.fields, ...relations })

const totals = {
  materialCost: Schema.Number, toolWearCost: Schema.Number, machineTime: Schema.Number,
  machineTimeCost: Schema.Number, operatorTime: Schema.Number, operatorTimeCost: Schema.Number,
  setupCost: Schema.Number, totalCost: Schema.Number
}
export const CalculationDetails = Schema.Struct({
  sourceSettingsId: Schema.optional(Schema.String),
  inputs: Schema.Struct({ toolpathId: Schema.String, toolId: nullable, materialId: nullable }),
  calculatedValues: Schema.Struct({
    totalPathLengthMm: Schema.Number, materialVolumeM3: Schema.Number, feedRateMmMin: Schema.Number,
    machineTimeMinutes: Schema.Number, operatorTimeMinutes: Schema.Number, totalSetupTimeMinutes: Schema.Number
  }),
  costBreakdown: Schema.Struct({
    material: Schema.Number, toolWear: Schema.Number, machineRun: Schema.Number, operator: Schema.Number, setup: Schema.Number
  })
})
export const CalculateEstimateBody = Schema.Struct({ toolpathId: Schema.String, costSettingsId: Schema.optional(nullable), organizationId })
export const CalculatedEstimate = Schema.Struct({
  ...totals, ...currency, ...scope, toolpathId: Schema.String, details: CalculationDetails
})
export const EstimateCreate = Schema.Struct({
  toolpathId: Schema.String, totalCost: Schema.Number,
  materialCost: Schema.optional(Schema.Number), toolWearCost: Schema.optional(Schema.Number),
  machineTime: Schema.optional(Schema.Number), machineTimeCost: Schema.optional(Schema.Number),
  operatorTime: Schema.optional(Schema.Number), operatorTimeCost: Schema.optional(Schema.Number),
  setupCost: Schema.optional(Schema.Number), ...optionalCurrency,
  details: Schema.optional(Schema.Unknown), operationCostId: Schema.optional(nullable),
  costSettingsId: Schema.optional(nullable), organizationId
})
export const EstimateUpdate = Schema.Struct({
  ...optionalCurrency, details: Schema.optional(Schema.Unknown), notes: Schema.optional(Schema.String)
})
export const EstimateRow = Schema.Struct({
  ...timestamps, ...totals, ...currency, ...scope, toolpathId: Schema.String,
  details: Schema.Unknown, operationCostId: nullable, costSettingsId: Schema.optional(nullable)
})
const toolpathRef = Schema.Struct({ id: Schema.String, name: Schema.String, projectId: Schema.optional(nullable) })
export const EstimateResponse = Schema.Struct({ ...EstimateRow.fields, ...relations, toolpath: toolpathRef })
export const EstimateDetails = Schema.Struct({ ...EstimateResponse.fields, operationCost: Schema.NullOr(OperationCostRow) })

export class ProductionCostsGroup extends HttpApiGroup.make("production-costs")
  .add(
    HttpApiEndpoint.get("listEstimates", "/api/production-costs/estimates", {
      query: { toolpathId: Schema.optional(Schema.String), projectId: Schema.optional(Schema.String), organizationId },
      success: Schema.Array(EstimateDetails), error: [Forbidden, InternalError]
    }),
    HttpApiEndpoint.post("createEstimate", "/api/production-costs/estimates", {
      payload: EstimateCreate, success: EstimateDetails.pipe(Schema.annotate({ httpApiStatus: 201 })), error: readErrors
    }),
    HttpApiEndpoint.get("getEstimate", "/api/production-costs/estimates/:id", { params: id, success: EstimateDetails, error: readErrors }),
    HttpApiEndpoint.put("updateEstimate", "/api/production-costs/estimates/:id", { params: id, payload: EstimateUpdate, success: EstimateResponse, error: readErrors }),
    HttpApiEndpoint.delete("deleteEstimate", "/api/production-costs/estimates/:id", { params: id, success: message, error: readErrors }),
    HttpApiEndpoint.post("calculateEstimate", "/api/production-costs/estimates/calculate", { payload: CalculateEstimateBody, success: CalculatedEstimate, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.get("listMaterialCosts", "/api/production-costs/material-costs", { query: { materialId: Schema.optional(Schema.String), organizationId }, success: Schema.Array(MaterialCostDetails), error: [Forbidden, InternalError] }),
    HttpApiEndpoint.post("createMaterialCost", "/api/production-costs/material-costs", { payload: MaterialCostCreate, success: MaterialCostResponse.pipe(Schema.annotate({ httpApiStatus: 201 })), error: writeErrors }),
    HttpApiEndpoint.get("getMaterialCost", "/api/production-costs/material-costs/:id", { params: id, success: Schema.NullOr(MaterialCostDetails), error: readErrors }),
    HttpApiEndpoint.put("updateMaterialCost", "/api/production-costs/material-costs/:id", { params: id, payload: MaterialCostUpdate, success: MaterialCostResponse, error: readErrors }),
    HttpApiEndpoint.delete("deleteMaterialCost", "/api/production-costs/material-costs/:id", { params: id, success: message, error: readErrors }),
    HttpApiEndpoint.get("listOperationCosts", "/api/production-costs/operation-costs", { query: { organizationId }, success: Schema.Array(OperationCostDetails), error: [Forbidden, InternalError] }),
    HttpApiEndpoint.post("createOperationCost", "/api/production-costs/operation-costs", { payload: OperationCostCreate, success: OperationCostDetails.pipe(Schema.annotate({ httpApiStatus: 201 })), error: writeErrors }),
    HttpApiEndpoint.get("getOperationCost", "/api/production-costs/operation-costs/:id", { params: id, success: Schema.NullOr(OperationCostDetails), error: readErrors }),
    HttpApiEndpoint.put("updateOperationCost", "/api/production-costs/operation-costs/:id", { params: id, payload: OperationCostUpdate, success: OperationCostDetails, error: writeErrors }),
    HttpApiEndpoint.delete("deleteOperationCost", "/api/production-costs/operation-costs/:id", { params: id, success: message, error: readErrors }),
    HttpApiEndpoint.get("listToolWear", "/api/production-costs/tool-wear", { query: { toolId: Schema.optional(Schema.String), organizationId }, success: Schema.Array(ToolWearDetails), error: [Forbidden, InternalError] }),
    HttpApiEndpoint.post("createToolWear", "/api/production-costs/tool-wear", { payload: ToolWearCreate, success: ToolWearResponse.pipe(Schema.annotate({ httpApiStatus: 201 })), error: writeErrors }),
    HttpApiEndpoint.get("getToolWear", "/api/production-costs/tool-wear/:id", { params: id, success: Schema.NullOr(ToolWearDetails), error: readErrors }),
    HttpApiEndpoint.put("updateToolWear", "/api/production-costs/tool-wear/:id", { params: id, payload: ToolWearUpdate, success: ToolWearResponse, error: readErrors }),
    HttpApiEndpoint.delete("deleteToolWear", "/api/production-costs/tool-wear/:id", { params: id, success: message, error: readErrors })
  )
{}
