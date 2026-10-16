import { Database } from "bun:sqlite"
import { afterEach, describe, expect, test } from "bun:test"
import { linkAccount } from "../src/database.ts"

const databases: Database[] = []

function d1Database(): D1Database {
  const sqlite = new Database(":memory:")
  databases.push(sqlite)
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      disabled_at INTEGER
    ) STRICT;
    CREATE TABLE auth_methods (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider = 'email'),
      subject TEXT NOT NULL,
      UNIQUE(provider, subject)
    ) STRICT;
  `)

  const prepare = (sql: string) => {
    const statement = sqlite.query(sql)
    let values: any[] = []
    const wrapper = {
      bind(...input: unknown[]) {
        values = input
        return wrapper
      },
      async first<T>() {
        return (statement.get(...values) as T | null) ?? null
      },
      async run() {
        statement.run(...values)
        const result = sqlite.query("SELECT changes() AS count").get() as {
          count: number
        }
        return {
          success: true,
          meta: { changes: result.count },
        }
      },
    }
    return wrapper
  }

  return {
    prepare,
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      return Promise.all(statements.map((statement) => statement.run()))
    },
  } as unknown as D1Database
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

describe("OAuth account registration", () => {
  test("creates an account during the first verified OAuth login", async () => {
    const db = d1Database()
    const account = await linkAccount(db, "email", "new.user@example.com", "New.User@Example.com", 1_000)

    expect(account.email).toBe("new.user@example.com")
    expect(account.id).toStartWith("acc_")
  })

  test("reuses the registered account on later OAuth logins", async () => {
    const db = d1Database()
    const registered = await linkAccount(db, "email", "user@example.com", "user@example.com", 1_000)
    const loggedIn = await linkAccount(db, "email", "user@example.com", "USER@example.com", 2_000)
    const repeated = await linkAccount(db, "email", "user@example.com", "user@example.com", 3_000)

    expect(loggedIn.id).toBe(registered.id)
    expect(repeated.id).toBe(registered.id)
  })
})
