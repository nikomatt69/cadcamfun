import { expect, test } from "bun:test"
import { Schema } from "effect"
import { ActivityAction, ActivityItemType, SystemMetricsResponse, TrackActivityRequest, TrackActivityResponse } from "./analytics.ts"

test("metrics and activity schemas validate legacy payloads", () => {
  const metrics = { cpuUsage: 10, memoryUsage: 20, storageUsed: 30, networkLatency: 15, activeConnections: 100, cacheHitRatio: 90, errorRate: 0, responseTime: 50 }
  expect(Schema.encodeSync(SystemMetricsResponse)(Schema.decodeUnknownSync(SystemMetricsResponse)(metrics))).toEqual(metrics)
  const activity = { itemId: "p", itemType: "project" as const, action: "created" as const, details: { name: "Part" } }
  expect(Schema.encodeSync(TrackActivityRequest)(Schema.decodeUnknownSync(TrackActivityRequest)(activity))).toEqual(activity)
  expect(Schema.decodeUnknownSync(TrackActivityResponse)({ success: true })).toEqual({ success: true })
  expect(Schema.is(ActivityItemType)("invalid")).toBe(false)
  expect(Schema.is(ActivityAction)("created")).toBe(true)
  expect(() => Schema.decodeUnknownSync(SystemMetricsResponse)({ ...metrics, cpuUsage: "10" })).toThrow()
})
