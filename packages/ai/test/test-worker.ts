// A stand-in worker for the tests of the job runner. It answers with the id and name of its job (from its environment), or, when the
// job asks to `exit`, dies the way the system kills a worker that runs out of memory: without an answer.
self.onmessage = (event: MessageEvent<{ readonly input?: { readonly mode?: string } }>) => {
  if (event.data.input?.mode === "exit") process.exit(7)
  self.postMessage({ ok: true, value: { id: process.env["CADCAMFUN_JOB_ID"], name: process.env["CADCAMFUN_JOB_NAME"] } })
}
