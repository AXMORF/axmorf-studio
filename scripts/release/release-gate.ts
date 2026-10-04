import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, lstat } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { packageContent } from "./package-content";
import { verifyReceipt } from "./first-use";

const Host = z.enum(["codex", "hermes"]);
const repositoryPath = z
  .string()
  .regex(/^[\w.-]+(?:\/[\w.-]+)*$/u)
  .refine(
    (value) => !value.split("/").some((part) => part === ".." || part === "."),
  );
export const ReleasePlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    baseTag: z.string().regex(/^v\d+\.\d+\.\d+$/u),
    primaryHost: Host,
    fullAcceptance: z.boolean(),
    compatibilityChanges: z
      .array(
        z
          .object({
            host: Host,
            paths: z.array(repositoryPath).min(1),
            reason: z.string().trim().min(1),
          })
          .strict(),
      )
      .max(2),
    regressionTests: z
      .array(
        repositoryPath.refine((path) => /^tests\/.+\.test\.tsx?$/u.test(path)),
      )
      .min(1)
      .max(100),
    packages: z
      .object({
        runtimeFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
        creatorFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
      })
      .strict(),
  })
  .strict()
  .superRefine((plan, context) => {
    if (new Set(plan.regressionTests).size !== plan.regressionTests.length)
      context.addIssue({
        code: "custom",
        message: "Regression test paths must be unique",
        path: ["regressionTests"],
      });
    if (
      new Set(plan.compatibilityChanges.map((change) => change.host)).size !==
      plan.compatibilityChanges.length
    )
      context.addIssue({
        code: "custom",
        message: "Compatibility hosts must be unique",
        path: ["compatibilityChanges"],
      });
  });
export type ReleasePlan = z.infer<typeof ReleasePlanSchema>;

export function classifyRelease(value: unknown, changedFiles: string[]) {
  const plan = ReleasePlanSchema.parse(value);
  const paths = [...new Set(changedFiles)].sort();
  assert.ok(paths.length > 0, "Release needs a source change set");
  paths.forEach((path) => repositoryPath.parse(path));
  const major = paths.filter(
    (path) =>
      /^(?:packages\/studio\/src\/contracts(?:\/|\.ts$)|packages\/create-axmorf-studio\/(?:src|template|scripts|bin)\/|scripts\/project-production\/|scripts\/projects\/|\.agents\/skills\/axmorf-video\/)/u.test(
        path,
      ) ||
      /^(?:AGENTS\.md|scripts\/release\/(?:native-execution|supervision|inline-execution)\.ts)$/u.test(
        path,
      ),
  );
  const requiredHosts = new Set([plan.primaryHost]);
  for (const change of plan.compatibilityChanges) {
    assert.ok(
      change.paths.every((path) => paths.includes(path)),
      "Compatibility evidence must name actual changed files",
    );
    requiredHosts.add(change.host);
  }
  if (plan.fullAcceptance) {
    requiredHosts.add("codex");
    requiredHosts.add("hermes");
  }
  const nativeFirstUse =
    major.length > 0 ||
    plan.fullAcceptance ||
    plan.compatibilityChanges.length > 0;
  return {
    schemaVersion: 1 as const,
    status: "release-scope-resolved" as const,
    version: plan.version,
    tier: nativeFirstUse ? "native-first-use" : "ordinary",
    nativeFirstUse,
    requiredHosts: nativeFirstUse ? [...requiredHosts].sort() : [],
    majorChanges: major,
    changedFiles: paths,
    regressionTests: plan.regressionTests,
  };
}

async function repositoryJson(path: string) {
  repositoryPath.parse(path);
  const absolute = resolve(path);
  assert.ok(!relative(process.cwd(), absolute).startsWith(`..${sep}`));
  assert.ok(
    (await lstat(absolute)).isFile() &&
      !(await lstat(absolute)).isSymbolicLink(),
    "Release evidence must be a regular repository file",
  );
  return JSON.parse(await readFile(absolute, "utf8")) as unknown;
}
function changedFiles(plan: ReleasePlan) {
  execFileSync("git", ["rev-parse", "--verify", `${plan.baseTag}^{commit}`], {
    stdio: "pipe",
  });
  execFileSync("git", ["merge-base", "--is-ancestor", plan.baseTag, "HEAD"], {
    stdio: "pipe",
  });
  assert.notEqual(
    plan.baseTag,
    `v${plan.version}`,
    "Release baseline must precede the candidate tag",
  );
  return execFileSync(
    "git",
    ["diff", "--no-renames", "--name-only", "-z", plan.baseTag, "HEAD"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
}
export async function verifyReleaseArtifacts(
  planValue: unknown,
  files: string[],
  runtimePath: string,
  creatorPath: string,
  receiptValue?: unknown,
) {
  const plan = ReleasePlanSchema.parse(planValue);
  const scope = classifyRelease(plan, files);
  const [runtime, creator] = await Promise.all([
    packageContent(runtimePath),
    packageContent(creatorPath),
  ]);
  assert.equal(runtime.name, "@axmorf/studio");
  assert.equal(creator.name, "create-axmorf-studio");
  assert.equal(runtime.version, plan.version);
  assert.equal(creator.version, plan.version);
  assert.equal(
    runtime.fingerprint,
    plan.packages.runtimeFingerprint,
    "Runtime contents differ from reviewed candidates",
  );
  assert.equal(
    creator.fingerprint,
    plan.packages.creatorFingerprint,
    "Creator contents differ from reviewed candidates",
  );
  if (scope.nativeFirstUse) {
    assert.ok(
      receiptValue,
      "This change scope requires complete native first-use evidence",
    );
    verifyReceipt(receiptValue, runtime, creator, {
      requiredHosts: scope.requiredHosts as Array<"codex" | "hermes">,
      currentNative: true,
    });
  }
  return {
    ...scope,
    status: "release-gate-passed",
    runtimeFingerprint: runtime.fingerprint,
    creatorFingerprint: creator.fingerprint,
  };
}

async function main(args: string[]) {
  const [action, planPath, ...paths] = args;
  assert.ok(planPath, "Release plan path is required");
  const plan = ReleasePlanSchema.parse(await repositoryJson(planPath));
  assert.equal(
    plan.version,
    JSON.parse(await readFile("package.json", "utf8")).version,
  );
  const files = changedFiles(plan);
  if (action === "inspect" && paths.length === 0)
    return classifyRelease(plan, files);
  if (action === "regressions" && paths.length === 0) {
    for (const path of plan.regressionTests) {
      const metadata = await lstat(path);
      assert.ok(metadata.isFile() && !metadata.isSymbolicLink());
    }
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--test", ...plan.regressionTests],
      { stdio: "inherit" },
    );
    return { status: "release-regressions-passed" };
  }
  if (action === "verify" && (paths.length === 2 || paths.length === 3)) {
    assert.equal(
      execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
        encoding: "utf8",
      }).trim(),
      "",
      "Release source has tracked modifications",
    );
    return verifyReleaseArtifacts(
      plan,
      files,
      paths[0]!,
      paths[1]!,
      paths[2] ? await repositoryJson(paths[2]) : undefined,
    );
  }
  throw new Error(
    "Usage: release-gate.ts inspect|regressions plan.json | verify plan.json runtime.tgz creator.tgz [first-use.json]",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
