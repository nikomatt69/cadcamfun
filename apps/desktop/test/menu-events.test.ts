import { expect, test } from "bun:test"
import { openLogsFolder, projectOfRecentId } from "../src/app/menu-events.ts"

test("a tray recent item names its project; any other id names none", () => {
  expect(projectOfRecentId("tray.recent.abc-123")).toBe("abc-123")
  expect(projectOfRecentId("tray.recent.")).toBeUndefined()
  expect(projectOfRecentId("tray.quit")).toBeUndefined()
  expect(projectOfRecentId("file.new")).toBeUndefined()
})

test("Show Logs Folder opens the folder the shell reports", async () => {
  const calls: Array<[string, unknown]> = []
  await openLogsFolder(async (command, args) => { calls.push([command, args]); return command === "get_logs_dir" ? "/logs" : undefined })
  expect(calls).toEqual([["get_logs_dir", undefined], ["open_path", { path: "/logs" }]])
})
