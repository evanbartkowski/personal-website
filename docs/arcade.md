# Shared Flappy Orbit record

`/api/arcade` is served by the `arcadeScores` Firebase function. It uses the same private Admin-only Firestore database as visitor analytics, with one separate document: `arcade_records/flappy`. The record contains only `highScore` and `updatedAt`. It has no expiry, visitor details, or direct browser database access.

- `GET` returns `{highScore, updatedAt}`. A short server cache reduces reads.
- `POST {action: "start"}` returns an opaque signed `runId`, course `seed`, `expiresAt`, fixed `step`, `maxSteps`, and the current record.
- `POST {action: "finish", runId, steps, flaps, score}` submits a completed flight. `flaps` lists sorted unique fixed-step indices, applied before each corresponding tick. The response contains `verifiedScore`, the current `highScore`, and whether this flight established a record.

The browser and verifier share `arcade-model.js`. The server replays the seeded course at 120 fixed ticks per second, requires the flight to end in a real collision on its final tick, and compares the score with the replay result. Inputs, request bytes, duration, origins, request rates, and concurrency are bounded. Signed runs expire after 15 minutes and bind to the validated network address through a domain-separated HMAC. Raw addresses are never saved or returned by this API. Signing reuses the private `VISITOR_HASH_SALT` secret with a distinct arcade context.

A Firestore transaction updates the maximum atomically. Simultaneous submissions and cold starts cannot replace a higher score with a lower one. This is a casual game record with replay checks, not a guarantee against automated gameplay.

The local server forwards only this fixed endpoint to the live site, so legitimate local play can join the same shared record. It does not forward caller-supplied authorization, network identities, or destinations. Browser QA must intercept `/api/arcade`; backend tests inject an in-memory store and never submit to production. Failed requests leave the game available as local practice.

Run `node --test scripts/test-arcade-scores.mjs` for provider-free API, replay, transaction, and proxy checks.
