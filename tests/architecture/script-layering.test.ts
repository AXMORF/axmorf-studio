import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { findScriptLayeringViolations } from "../../scripts/architecture/script-layering";

test("workflow and shared scripts keep one-way layer dependencies", async () => {
  assert.deepEqual(await findScriptLayeringViolations(process.cwd()), []);
});

test("layering guard detects every forbidden dependency direction", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-script-layering-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await Promise.all(
    [
      "scripts/project-production/domain",
      "scripts/project-production/application",
      "scripts/project-production/adapters",
      "scripts/project-assets/domain",
      "scripts/project-assets/application",
      "scripts/project-assets/adapters",
      "scripts/projects/application",
      "scripts/scene-templates",
      "scripts/shared",
    ].map((path) => mkdir(join(rootDir, path), { recursive: true })),
  );
  await Promise.all([
    writeFile(
      join(rootDir, "scripts/project-production/domain/bad.ts"),
      [
        'import "../application/use-case";',
        'import "../adapters/filesystem";',
        'import "../cli";',
      ].join("\n"),
    ),
    writeFile(
      join(rootDir, "scripts/project-production/adapters/bad.ts"),
      'import "../application/use-case";\n',
    ),
    writeFile(
      join(rootDir, "scripts/project-production/adapters/legacy.ts"),
      [
        'import "../../delivery/adapters/filesystem";',
        'import "../../project-build/application/build";',
        'import type {ProcessRunner} from "../../baseline/evidence";',
      ].join("\n"),
    ),
    writeFile(
      join(rootDir, "scripts/project-production/application/legacy.ts"),
      'import "../../production/application/start";\n',
    ),
    writeFile(
      join(rootDir, "scripts/project-production/application/bad.ts"),
      'import "../cli";\n',
    ),
    writeFile(
      join(rootDir, "scripts/project-assets/domain/bad.ts"),
      'import "../application/import";\n',
    ),
    writeFile(
      join(rootDir, "scripts/scene-templates/bad.ts"),
      'import "../projects/configure";\n',
    ),
    writeFile(
      join(rootDir, "scripts/shared/bad.ts"),
      'import "../project-production/application/plan-production";\n',
    ),
  ]);

  assert.deepEqual(await findScriptLayeringViolations(rootDir), [
    "scripts/project-assets/domain/bad.ts -> scripts/project-assets/application/import: domain dependency inversion",
    "scripts/project-production/adapters/bad.ts -> scripts/project-production/application/use-case: adapter dependency inversion",
    "scripts/project-production/adapters/legacy.ts -> scripts/baseline/evidence: shared process port owned by baseline",
    "scripts/project-production/adapters/legacy.ts -> scripts/delivery/adapters/filesystem: depends on removed workflow",
    "scripts/project-production/adapters/legacy.ts -> scripts/project-build/application/build: depends on removed workflow",
    "scripts/project-production/application/bad.ts -> scripts/project-production/cli: application depends on CLI",
    "scripts/project-production/application/legacy.ts -> scripts/production/application/start: depends on removed workflow",
    "scripts/project-production/domain/bad.ts -> scripts/project-production/adapters/filesystem: domain dependency inversion",
    "scripts/project-production/domain/bad.ts -> scripts/project-production/application/use-case: domain dependency inversion",
    "scripts/project-production/domain/bad.ts -> scripts/project-production/cli: domain dependency inversion",
    "scripts/scene-templates/bad.ts -> scripts/projects/configure: Scene template projection depends on Project workflow",
    "scripts/shared/bad.ts -> scripts/project-production/application/plan-production: shared technical module depends on business workflow",
  ]);
});
