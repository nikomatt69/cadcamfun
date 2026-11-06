/**
 * Detects the companion app's project list in a sidecar stderr log.
 *
 * Effect's JSON logger is compact (`"http.url":"/api/projects"`). The iOS job used to
 * search for a spaced `"http.url": "/api/projects"` on the previous line, which never
 * matches that logger. The desktop's own POST that creates the fixture project logs the
 * same URL, so only a GET counts. The HTTP server records `http.url`; the companion
 * gateway records `http.path`.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const annotationsOf = (line: string): Record<string, unknown> | undefined => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const annotations = parsed.annotations;
  return isRecord(annotations) ? annotations : undefined;
};

/** True when the log shows the phone listed projects. */
export const companionListedProjects = (log: string): boolean => {
  for (const line of log.split(/\r?\n/)) {
    const annotations = annotationsOf(line);
    if (annotations === undefined) continue;
    const target = annotations["http.url"] ?? annotations["http.path"];
    if (annotations["http.method"] === "GET" && target === "/api/projects") return true;
  }
  return false;
};

if (import.meta.main) {
  const file = process.argv[2];
  if (file === undefined || file.length === 0) {
    console.error("usage: ios-companion-listed.ts <sidecar-log>");
    process.exit(2);
  }
  const log = Bun.file(file);
  if (!(await log.exists())) process.exit(1);
  process.exit((await companionListedProjects(await log.text())) ? 0 : 1);
}
