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
      "scripts/production/domain",
      "scripts/production/application",
      "scripts/production/adapters",
      "scripts/delivery/domain",
      "scripts/delivery/application",
      "scripts/delivery/adapters",
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
      join(rootDir, "scripts/production/domain/bad.ts"),
      [
        'import "../application/use-case";',
        'import "../adapters/filesystem";',
        'import "../cli";',
      ].join("\n"),
    ),
    writeFile(
      join(rootDir, "scripts/production/application/bad.ts"),
      'import "../cli";\n',
    ),
    writeFile(
      join(rootDir, "scripts/production/adapters/bad.ts"),
      'import "../application/use-case";\n',
    ),
    writeFile(
      join(rootDir, "scripts/delivery/adapters/bad.ts"),
      [
        'import "../../production/adapters/filesystem";',
        'import type {ProcessRunner} from "../../baseline/evidence";',
      ].join("\n"),
    ),
    writeFile(
      join(rootDir, "scripts/delivery/application/bad.ts"),
      'import "../cover-cli";\n',
    ),
    writeFile(
      join(rootDir, "scripts/delivery/domain/bad.ts"),
      'import "../cover-cli";\n',
    ),
    writeFile(
      join(rootDir, "scripts/project-assets/domain/bad.ts"),
      'import "../application/import";\n',
    ),
    writeFile(
      join(rootDir, "scripts/projects/application/bad.ts"),
      'import "../../production/adapters/run-store";\n',
    ),
    writeFile(
      join(rootDir, "scripts/projects/configure.ts"),
      'import {writeTextFileAtomic} from "../production/adapters/run-store";\n',
    ),
    writeFile(
      join(rootDir, "scripts/projects/delete.ts"),
      'import {acquireProductionRunLock} from "../production/adapters/run-store";\n',
    ),
    writeFile(
      join(rootDir, "scripts/scene-templates/bad.ts"),
      'import "../projects/configure";\n',
    ),
    writeFile(
      join(rootDir, "scripts/shared/bad.ts"),
      'import "../production/application/start";\n',
    ),
  ]);

  assert.deepEqual(await findScriptLayeringViolations(rootDir), [
    "scripts/delivery/adapters/bad.ts -> scripts/baseline/evidence: shared process port owned by baseline",
    "scripts/delivery/adapters/bad.ts -> scripts/production/adapters/filesystem: delivery reuses production adapter",
    "scripts/delivery/application/bad.ts -> scripts/delivery/cover-cli: application depends on CLI",
    "scripts/delivery/domain/bad.ts -> scripts/delivery/cover-cli: domain dependency inversion",
    "scripts/production/adapters/bad.ts -> scripts/production/application/use-case: adapter dependency inversion",
    "scripts/production/application/bad.ts -> scripts/production/cli: application depends on CLI",
    "scripts/production/domain/bad.ts -> scripts/production/adapters/filesystem: domain dependency inversion",
    "scripts/production/domain/bad.ts -> scripts/production/application/use-case: domain dependency inversion",
    "scripts/production/domain/bad.ts -> scripts/production/cli: domain dependency inversion",
    "scripts/project-assets/domain/bad.ts -> scripts/project-assets/application/import: domain dependency inversion",
    "scripts/projects/application/bad.ts -> scripts/production/adapters/run-store: Project workflow reuses production adapter",
    "scripts/projects/configure.ts -> scripts/production/adapters/run-store: Project workflow reuses production adapter",
    "scripts/scene-templates/bad.ts -> scripts/projects/configure: Scene template projection depends on Project workflow",
    "scripts/shared/bad.ts -> scripts/production/application/start: shared technical module depends on business workflow",
  ]);
});
