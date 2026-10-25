// A worker that is killed the way the system kills one that runs out of memory: it exits without an answer.
self.onmessage = () => { process.exit(7) }
