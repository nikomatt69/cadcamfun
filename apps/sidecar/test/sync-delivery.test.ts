/**
 * Delivery to real users: two accounts and an organization in a real database, the real
 * ProjectRepo, the real LiveEvents bus. A write by the owner reaches the member's stream and not
 * a stranger's; removing the membership stops delivery on the next frame.
 */
import { expect, test } from "bun:test"
import { Database, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { Effect, Fiber, Layer, Stream } from "effect"
import { frameVisibleTo } from "../src/http/events.ts"
import { LiveEvents } from "../src/services/live-events.ts"
import { ProjectRepo } from "../src/repos/project-repo.ts"

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const Live = ProjectRepo.layer.pipe(Layer.provideMerge(Database.layer({ path: ":memory:", migrationsFolder })))

test("an organization frame reaches a real member, not a stranger, and stops after removal", async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const { db } = yield* Database
    const projects = yield* ProjectRepo
    const events = yield* LiveEvents
    const owner = db.insert(schema.userTable).values({ email: "owner@test.local" }).returning().get()
    const member = db.insert(schema.userTable).values({ email: "member@test.local" }).returning().get()
    const stranger = db.insert(schema.userTable).values({ email: "stranger@test.local" }).returning().get()
    const org = db.insert(schema.organizationTable).values({ name: "Shop" }).returning().get()
    db.insert(schema.userOrganizationTable).values({ userId: owner.id, organizationId: org.id, role: "ADMIN" }).run()
    db.insert(schema.userOrganizationTable).values({ userId: member.id, organizationId: org.id, role: "MEMBER" }).run()

    const subscribe = (userId: string) => Effect.gen(function*() {
      const source = yield* events.subscribe({})
      return yield* Effect.forkDetach(Stream.runCollect(source.pipe(
        Stream.filterEffect((event) => frameVisibleTo(userId, event, projects)),
        Stream.filter((event) => event.type === "resources.changed"),
        Stream.take(1)
      )).pipe(Effect.timeout("300 millis"), Effect.orElseSucceed(() => [] as ReadonlyArray<never>)))
    })
    const memberStream = yield* subscribe(member.id)
    const strangerStream = yield* subscribe(stranger.id)
    // The frame an organization write publishes; the membership check runs against the real database.
    yield* events.resourcesChanged(owner.id, org.id)
    expect((yield* Fiber.join(memberStream)).length).toBe(1)
    expect((yield* Fiber.join(strangerStream)).length).toBe(0)

    db.delete(schema.userOrganizationTable).where(eq(schema.userOrganizationTable.userId, member.id)).run()
    const revoked = yield* subscribe(member.id)
    yield* events.resourcesChanged(owner.id, org.id)
    expect((yield* Fiber.join(revoked)).length).toBe(0)
  }).pipe(Effect.provide(Live), Effect.provide(LiveEvents.layer))))
})
