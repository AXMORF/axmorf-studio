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

主题修订必须保留或替换完整 `visualStyle.theme` 四角色颜色；不能删除已有主题。旧 Project 的 immutable 首尾没有主题接口时，不能在 revision 中直接添加新主题，需新建 Project，禁止修改旧模板副本。
