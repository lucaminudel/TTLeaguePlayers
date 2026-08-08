# Database Updates

One-off data and schema changes applied to the DynamoDB tables outside the normal deploy.

`template.yaml` declares the tables and their indexes, but it only creates them for **staging** and
**prod** (`Condition: IsProdOrStaging`), and it never touches existing rows. Anything that has to
*change data* — or that has to be applied to the hand-created **dev** and **test** local tables — lives
here.

## Naming

One file per change, prefixed with the date it was written:

```
YYYY-MM-DD-<table>-<what-it-does>.sh
```

for example `2026-08-05-invites-add-league-season.sh`. The date orders the folder chronologically and
makes it obvious which changes predate a given release.

## Writing one

* **Make it idempotent.** These get re-run — on another developer's machine, on a rebuilt local volume,
  after a partial failure. Re-running must be harmless.
* **Take the target as an argument**, not a hard-coded endpoint. Each change normally has to be applied
  to all four environments: dev (`--endpoint-url http://localhost:8000`), test
  (`--endpoint-url http://localhost:8001`), staging and prod.
* **Say what it did.** Print the number of items scanned and updated, so a run can be checked.
* **Record the order** in the file's header comment when the change has to be sequenced with a code
  deploy — e.g. a new attribute must be written by the deployed code *before* existing rows are
  backfilled, or new rows created during the backfill will be missed.

## Applying one

Local dev and test tables are not managed by CloudFormation, so a change here has to be run by hand
against `:8000` and `:8001` as well as against the cloud environments. Note this means every developer
and every rebuilt Docker volume needs the same run — a table missing an index or an attribute usually
fails **silently**, returning no rows rather than an error.

## Retiring one

A script whose change has reached every environment can be deleted; a *data* change in particular is
one-shot and has little reason to stay. But **check what it was the only copy of first.**

`2026-08-06-invites-add-league-season-index.sh` created `LeagueSeasonTeamIndex` on the local dev and
test tables and was deleted once it had done so. `template.yaml` remains the definition of that index
— but it only *creates* it on staging and prod. So a developer starting fresh, or anyone rebuilding
the local Docker volume, now has to re-create it by hand from the `GlobalSecondaryIndexes` block of
`template.yaml` before `2026-08-06-invites-backfill-league-season.sh` will achieve anything. A missing
index does not error: every team simply reads `NOT_INVITED`.

So when deleting a schema script, say in this file where the definition still lives and what has to
be done by hand without it.
