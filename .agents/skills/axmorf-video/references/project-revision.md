# Project revision workflow

Never edit live authoring for an existing Project. Read its exact current context, validate strict raw input, then
create the isolated candidate:

```bash
npm run project:revise:context -- --project <storyId>
npm run project:revise:validate -- --input <repository-relative-json>
npm run project:revise -- --project <storyId> --input <repository-relative-json>
```

The input binds `baseRevisionId` and verified `baseDeliveryBuildId`. Candidate source/public/narration/work/attempt/
output/Delivery stay isolated; live Project and current Delivery remain authoritative before promotion. Candidates
cannot import new assets and use only Project-owned media frozen in the base snapshot.

Use the returned `--candidate <candidateId>` on every inspect, prepare, task, continuation, and recovery command.
Candidate continuation verifies isolated exact-four files, then attempts controlled promotion. A promotion failure
rolls the source/public/narration/delivery transaction back together and leaves the candidate retryable:

```bash
npm run project:revision:promote -- --project <storyId> --candidate <candidateId> --revision <revisionId> --delivery <deliveryBuildId>
```

This retries promotion only. Do not reissue a successfully produced candidate attempt.
