# Local database storage

Run these commands from the repository root. Paths are explicit; no environment
file or remote service is needed.

Inspect byte/page counts without printing records or applying migrations:

```sh
bun --no-env-file packages/db/src/storage-cli.ts ./data/cadcamfun.db
```

With the app closed, recover unused space without deleting logical records:

```sh
bun --no-env-file packages/db/src/storage-cli.ts ./data/cadcamfun.db --compact
```

Compaction uses SQLite checkpoint/VACUUM/checkpoint and needs temporary free disk
space. A blocking reader causes an explicit failure; retry after closing the app.
It does not prune project versions, chat, history, KV state, or attachments.
`reclaimableBytes` counts completely free pages, so VACUUM may also recover space
by repacking partially filled pages. WAL/SHM counts are measured while connected;
graceful close can remove these temporary files.

Every app connection now explicitly enables automatic checkpointing at 1,000 WAL
pages and limits the journal retained after resets to 8 MiB. Active transactions
or readers can temporarily exceed that limit. This is not a cap on saved data.
Migration snapshots already retain the last five per database. The storage report
covers the database, WAL and SHM only; backups and external attachments are extra.

Create a shareable database from fixed invented fixtures:

```sh
bun --no-env-file packages/db/src/demo-cli.ts ./data/cadcamfun-demo.db
```

This creates the schema and one synthetic profile/project. It never opens the
real database, reads credentials or attachments, or copies/redacts real records.
Authentication, KV, chat, history and all other application tables remain empty.
An existing destination is refused, including an existing real database. The demo
file is created with owner-only permissions and remains under ignored `data/`.
Use a new filename to regenerate it. A failed creation may leave a partial file;
that file must not be shared.

Share only the successfully generated `cadcamfun-demo.db`, not `data/`, a real
database, or migration backups. No command uploads anything. A remote destination
must be selected separately. Uploading a copy does not reduce local storage;
compaction and appropriate future retention policies address that independently.
