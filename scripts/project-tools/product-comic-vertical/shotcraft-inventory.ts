import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, isAbsolute, posix, resolve } from "node:path";

import { z } from "zod";

import { serializeCanonicalJson } from "../../../src/contracts";
import {
  buildResourceCatalog,
  renderResourceCatalogJson,
} from "../../catalog/domain";

const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const GitCommitSchema = z.string().regex(/^[0-9a-f]{40}$/);
const RelativePathSchema = z
  .string()
  .min(1)
  .max(600)
  .refine(
    (value) =>
      !isAbsolute(value) &&
      !value.includes("\\") &&
      !value.split("/").some((part) => part === "." || part === "..") &&
      !value.includes("${") &&
      !/^https?:/u.test(value),
    "Path must be a static normalized repository-relative path.",
  );

const LicenseStatusSchema = z.enum([
  "verified",
  "not-used",
  "unknown",
  "restricted",
]);
const ExactDemoSchema = z
  .object({
    status: z.enum(["resolved", "ambiguous", "missing", "special-template"]),
    entryPath: RelativePathSchema.nullable(),
    closureRoot: RelativePathSchema.nullable(),
    relativeImports: z.array(RelativePathSchema),
    barePackages: z.array(
      z
        .object({
          packageName: z.string().regex(/^(?:@[a-z0-9-]+\/)?[a-z0-9-]+$/),
          exactVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
        })
        .strict(),
    ),
    localAssets: z.array(RelativePathSchema),
    sourceFiles: z.array(
      z.object({ path: RelativePathSchema, checksum: Sha256Schema }).strict(),
    ),
    resolutionNote: z.string().trim().min(12).max(1000).optional(),
  })
  .strict()
  .superRefine((demo, context) => {
    if (demo.status === "missing" && demo.entryPath !== null) {
      context.addIssue({
        code: "custom",
        message: "Missing demos cannot name an entry.",
        path: ["entryPath"],
      });
    }
    if (
      demo.status === "resolved" &&
      (demo.entryPath === null || demo.closureRoot === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Resolved demos require an entry and closure root.",
        path: ["entryPath"],
      });
    }
    const files = new Set(demo.sourceFiles.map((file) => file.path));
    if (
      demo.status === "resolved" &&
      demo.entryPath !== null &&
      !files.has(demo.entryPath)
    ) {
      context.addIssue({
        code: "custom",
        message: "Resolved demo entry is absent from source closure.",
        path: ["sourceFiles"],
      });
    }
    for (const path of demo.relativeImports) {
      if (!files.has(path)) {
        context.addIssue({
          code: "custom",
          message: "Relative import is absent from source closure.",
          path: ["relativeImports"],
        });
      }
    }
  });

const LicenseSchema = z
  .object({ id: z.string().trim().min(1), status: LicenseStatusSchema })
  .strict();
const AuxiliaryLicenseSchema = z
  .object({ status: LicenseStatusSchema })
  .strict();

const InventoryItemSchema = z
  .object({
    sourceRepository: z.url(),
    sourceCommit: GitCommitSchema,
    libraryRevision: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(80),
    cardName: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    cardPath: RelativePathSchema,
    cardChecksum: Sha256Schema,
    recipeChecksum: Sha256Schema,
    parametersChecksum: Sha256Schema,
    pitfallsChecksum: Sha256Schema,
    styleKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    styleLabel: z.string().trim().min(1).max(300),
    styleDescription: z.string().trim().min(1).max(2000),
    preview: z
      .object({
        releaseAssetUrl: z.url(),
        evidencePath: RelativePathSchema,
        checksum: Sha256Schema,
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        fpsNumerator: z.number().int().positive(),
        fpsDenominator: z.number().int().positive(),
        frames: z.number().int().positive(),
        codec: z.literal("h264"),
        completeDecode: z.literal(true),
        bytes: z.number().int().positive().optional(),
      })
      .strict(),
    exactDemo: ExactDemoSchema,
    licenses: z
      .object({
        sourceCode: LicenseSchema,
        preview: LicenseSchema,
        media: AuxiliaryLicenseSchema,
        fonts: AuxiliaryLicenseSchema,
        audio: AuxiliaryLicenseSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.libraryRevision === item.sourceCommit) {
      context.addIssue({
        code: "custom",
        message: "Library revision is not a Git commit.",
        path: ["libraryRevision"],
      });
    }
  });

const CountsSchema = z
  .object({
    cards: z.number().int().positive(),
    styles: z.number().int().positive(),
    previews: z.number().int().positive(),
  })
  .strict();
const InventoryDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatorId: z.literal("m9-shotcraft-inventory-v1"),
    expected: CountsSchema,
    items: z.array(InventoryItemSchema).min(1),
    inventoryFingerprint: Sha256Schema,
  })
  .strict();

export const computeShotcraftFingerprint = (
  namespace: string,
  value: unknown,
) =>
  `sha256:${createHash("sha256")
    .update(serializeCanonicalJson({ namespace, version: 1, value }))
    .digest("hex")}`;

export const validateInventoryDocument = (raw: unknown) => {
  const document = InventoryDocumentSchema.parse(raw);
  const cards = new Set<string>();
  const styles = new Set<string>();
  const previews = new Set<string>();
  for (const item of document.items) {
    cards.add(`${item.category}/${item.cardName}`);
    const identity = `${item.cardName}/${item.styleKey}`;
    if (styles.has(identity))
      throw new Error(`Duplicate Shotcraft style identity: ${identity}.`);
    styles.add(identity);
    if (previews.has(item.preview.evidencePath))
      throw new Error(
        `Duplicate preview identity: ${item.preview.evidencePath}.`,
      );
    previews.add(item.preview.evidencePath);
  }
  if (
    cards.size !== document.expected.cards ||
    styles.size !== document.expected.styles ||
    previews.size !== document.expected.previews
  ) {
    throw new Error(
      `Shotcraft corpus count mismatch: ${cards.size}/${styles.size}/${previews.size}.`,
    );
  }
  const input = {
    schemaVersion: document.schemaVersion,
    generatorId: document.generatorId,
    expected: document.expected,
    items: document.items,
  };
  if (
    document.inventoryFingerprint !==
    computeShotcraftFingerprint("inventory", input)
  ) {
    throw new Error("Shotcraft inventory fingerprint is stale.");
  }
  return document;
};

const CoverageItemSchema = z
  .object({
    cardName: z.string().min(1),
    styleKey: z.string().min(1),
    applicability: z.enum(["strong", "conditional", "not-applicable"]),
    beatFunctions: z.array(z.string().trim().min(1)).min(1),
    verticalRisk: z.string().trim().min(20).max(1200),
    decision: z.enum([
      "selected-exact",
      "selected-inspiration",
      "not-selected",
    ]),
    reason: z.string().trim().min(24).max(1600),
    exactEligibility: z.boolean(),
    selection: z
      .object({
        meaningId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        frameWindow: z
          .object({
            start: z.number().int().nonnegative(),
            endExclusive: z.number().int().positive(),
          })
          .strict()
          .refine((range) => range.endExclusive > range.start),
        recognizabilityTarget: z.string().trim().min(30).max(1200),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((item, context) => {
    if (
      ["没用到", "not used", "unused"].includes(
        item.reason.toLocaleLowerCase("en-US"),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Coverage reason is not substantive.",
        path: ["reason"],
      });
    }
    const selected = item.decision !== "not-selected";
    if (selected !== (item.selection !== null)) {
      context.addIssue({
        code: "custom",
        message: "Selected styles require one Scene binding.",
        path: ["selection"],
      });
    }
    if (item.decision === "selected-exact" && !item.exactEligibility) {
      context.addIssue({
        code: "custom",
        message: "Ineligible styles cannot be exact selections.",
        path: ["exactEligibility"],
      });
    }
  });

const CoverageDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    inventoryFingerprint: Sha256Schema,
    expected: CountsSchema,
    items: z.array(CoverageItemSchema).min(1),
    coverageFingerprint: Sha256Schema,
  })
  .strict();

export const validateCoverageDocument = (
  raw: unknown,
  rawInventory: unknown,
) => {
  const inventory = validateInventoryDocument(rawInventory);
  const coverage = CoverageDocumentSchema.parse(raw);
  if (coverage.inventoryFingerprint !== inventory.inventoryFingerprint) {
    throw new Error("Coverage points at a stale inventory.");
  }
  if (
    serializeCanonicalJson(coverage.expected) !==
    serializeCanonicalJson(inventory.expected)
  ) {
    throw new Error("Coverage corpus counts differ from inventory.");
  }
  const inventoryByIdentity = new Map(
    inventory.items.map((item) => [`${item.cardName}/${item.styleKey}`, item]),
  );
  const seen = new Set<string>();
  const exactScenes = new Set<string>();
  for (const item of coverage.items) {
    const identity = `${item.cardName}/${item.styleKey}`;
    if (seen.has(identity) || !inventoryByIdentity.has(identity))
      throw new Error(`Unknown or duplicate coverage identity: ${identity}.`);
    seen.add(identity);
    const inventoryItem = inventoryByIdentity.get(identity)!;
    const computedEligibility =
      inventoryItem.exactDemo.status === "resolved" &&
      inventoryItem.preview.completeDecode &&
      inventoryItem.exactDemo.sourceFiles.length > 0 &&
      Object.values(inventoryItem.licenses).every(
        (license) =>
          license.status === "verified" || license.status === "not-used",
      );
    if (item.exactEligibility !== computedEligibility)
      throw new Error(`Exact eligibility drift: ${identity}.`);
    if (item.decision === "selected-exact" && item.selection !== null) {
      if (exactScenes.has(item.selection.meaningId))
        throw new Error(
          `Scene has more than one exact reference: ${item.selection.meaningId}.`,
        );
      exactScenes.add(item.selection.meaningId);
    }
  }
  if (seen.size !== inventory.items.length)
    throw new Error("Coverage omits Shotcraft styles.");
  const input = {
    schemaVersion: coverage.schemaVersion,
    inventoryFingerprint: coverage.inventoryFingerprint,
    expected: coverage.expected,
    items: coverage.items,
  };
  if (
    coverage.coverageFingerprint !==
    computeShotcraftFingerprint("coverage", input)
  )
    throw new Error("Shotcraft coverage fingerprint is stale.");
  return coverage;
};

const StagingSchema = z
  .object({
    schemaVersion: z.literal(1),
    selectedExact: z.array(
      z
        .object({
          meaningId: z.string().min(1),
          cardName: z.string().min(1),
          styleKey: z.string().min(1),
          destinations: z.array(RelativePathSchema).min(1),
        })
        .strict(),
    ),
    stagingFingerprint: Sha256Schema,
  })
  .strict();

export const validateTask5Staging = async ({
  rootDir,
  staging: rawStaging,
}: {
  readonly rootDir: string;
  readonly staging: unknown;
}) => {
  const staging = StagingSchema.parse(rawStaging);
  const stagingInput = {
    schemaVersion: staging.schemaVersion,
    selectedExact: staging.selectedExact,
  };
  if (
    staging.stagingFingerprint !==
    computeShotcraftFingerprint("task-5-staging", stagingInput)
  ) {
    throw new Error("Task 5 staging fingerprint is stale.");
  }
  const destinations = new Set<string>();
  for (const selection of staging.selectedExact) {
    for (const destination of selection.destinations) {
      if (destinations.has(destination))
        throw new Error(`Duplicate staging destination: ${destination}.`);
      destinations.add(destination);
      const path = resolve(rootDir, destination);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error(
          `Staging destination is not a regular file: ${destination}.`,
        );
    }
  }
  return staging;
};

const validateArtifactFingerprint = (
  raw: unknown,
  field: string,
  namespace: string,
) => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${namespace} artifact must be an object.`);
  }
  const artifact = { ...(raw as Record<string, unknown>) };
  const fingerprint = Sha256Schema.parse(artifact[field]);
  delete artifact[field];
  if (fingerprint !== computeShotcraftFingerprint(namespace, artifact)) {
    throw new Error(`${namespace} fingerprint is stale.`);
  }
  return raw as Record<string, unknown>;
};

const checksumBytes = (bytes: Buffer | string) => {
  const hash = createHash("sha256");
  if (typeof bytes === "string") hash.update(bytes, "utf8");
  else hash.update(bytes.toString("latin1"), "latin1");
  return `sha256:${hash.digest("hex")}`;
};

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"));

const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${serializeCanonicalJson(value)}\n`, "utf8");
};

const extractSection = (document: string, heading: string) => {
  const match = document.match(
    new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "mu"),
  );
  if (!match || !match[1].trim())
    throw new Error(`Shotcraft card section is missing: ${heading}.`);
  return match[1].trim();
};

const toKebab = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/gu, "$1-$2")
    .toLocaleLowerCase("en-US");

const explicitDemoEntries: Readonly<Record<string, string>> = {
  "ai-stream-response/ai-stream-response":
    "demos/interaction/ai-stream-response/StreamResponse.tsx",
  "canvas-materialize-moves/panel-to-canvas":
    "demos/interaction/canvas-materialize-moves/PanelToCanvasMaterialize.tsx",
  "canvas-materialize-moves/diagram-cascade":
    "demos/interaction/canvas-materialize-moves/DiagramCascadeBuild.tsx",
  "chart-live-moves/oscilloscope-stream":
    "demos/data/chart-live-moves/OscilloscopeStreamV2.tsx",
  "chart-live-moves/unit-dot-swarm-regroup":
    "demos/data/chart-live-moves/UnitDotSwarmRegroupV2.tsx",
  "chart-live-moves/axis-rescale-shock":
    "demos/data/chart-live-moves/AxisRescaleShockV2.tsx",
  "collab-cursor-moves/dialogue-duet":
    "demos/interaction/collab-cursor-moves/CursorDialogueDuet.tsx",
  "collab-cursor-moves/cast-ensemble":
    "demos/interaction/collab-cursor-moves/CursorCastEnsemble.tsx",
  "depth-layer-moves/multiplane":
    "demos/camera/depth-layer-moves/MultiplaneReal.tsx",
  "depth-layer-moves/dolly-zoom":
    "demos/camera/depth-layer-moves/DollyZoomReal.tsx",
  "input-trigger-moves/cursor-performance":
    "demos/interaction/input-trigger-moves/CursorPerformancePunchIn.tsx",
  "light-play-moves/spotlight-sweep":
    "demos/effects/light-play-moves/SpotlightSweepReveal.tsx",
  "light-play-moves/sheen-sweep":
    "demos/effects/light-play-moves/SheenSweepRetry.tsx",
  "neon-frame-orbit-drop/neon-frame-orbit-drop":
    "demos/ui-entrance/neon-frame-orbit-drop/NeonFrameForerunOrbit.tsx",
  "riso-print-hits/misregistration-hit":
    "demos/effects/riso-print-hits/RisoMisregistrationHit.tsx",
  "riso-print-hits/beat-pump": "demos/effects/riso-print-hits/RisoBeatPump.tsx",
  "shot-transitions/mask-wipe":
    "demos/transition/shot-transitions/MaskWipeReal.tsx",
  "speed-ramp-freeze/speed-ramp":
    "demos/rhythm/speed-ramp-freeze/SpeedRampReal.tsx",
  "speed-ramp-freeze/freeze-annotate":
    "demos/rhythm/speed-ramp-freeze/FreezeAnnotateReal.tsx",
  "split-flap-title/split-flap-title":
    "demos/typography/split-flap-title/SplitFlapFlip.tsx",
  "type-assembly-moves/drift-assembly":
    "demos/typography/type-assembly-moves/LetterformDriftAssembly.tsx",
  "type-assembly-moves/tracking-expand":
    "demos/typography/type-assembly-moves/TrackingExpandReveal.tsx",
  "typewriter-moves/error-retype":
    "demos/typography/typewriter-moves/TypewriterErrorRetype.tsx",
  "ui-to-brand-morph/icon-flip-bloom":
    "demos/outro/ui-to-brand-morph/IconFlipBloomLogo.tsx",
  "ui-to-brand-morph/input-morph-assemble":
    "demos/outro/ui-to-brand-morph/InputMorphsIntoLogo.tsx",
};

const specialTemplateCards = new Set([
  "brand-ink-open",
  "deck-deal-flyin",
  "document-typewriter-reveal",
  "list-stack-press",
  "outro-group-photo-launch",
  "paper-title-card",
  "row-embed",
  "spotlight-hero-card",
  "type-and-filter",
]);

type SourceClosure = {
  readonly files: readonly {
    readonly path: string;
    readonly checksum: string;
  }[];
  readonly relativeImports: readonly string[];
  readonly barePackages: readonly {
    readonly packageName: string;
    readonly exactVersion: string;
  }[];
  readonly localAssets: readonly string[];
  readonly hasBundledAudio: boolean;
  readonly hasBundledMedia: boolean;
};

const buildSourceClosure = async ({
  sourceRoot,
  entryPath,
  packageVersions,
}: {
  readonly sourceRoot: string;
  readonly entryPath: string;
  readonly packageVersions: Readonly<Record<string, string>>;
}): Promise<SourceClosure> => {
  const pending = [entryPath];
  const sourceFiles = new Map<string, string>();
  const relativeImports = new Set<string>();
  const barePackages = new Set<string>();
  const localAssets = new Set<string>();
  let hasBundledAudio = false;
  let hasBundledMedia = false;
  while (pending.length > 0) {
    const sourcePath = pending.pop();
    if (!sourcePath || sourceFiles.has(sourcePath)) continue;
    RelativePathSchema.parse(sourcePath);
    const absolute = resolve(sourceRoot, sourcePath);
    if (!absolute.startsWith(`${resolve(sourceRoot)}/`))
      throw new Error("Shotcraft closure escaped source root.");
    const bytes = await readFile(absolute);
    sourceFiles.set(sourcePath, checksumBytes(bytes));
    if (![".ts", ".tsx", ".js", ".jsx"].includes(extname(sourcePath))) {
      localAssets.add(sourcePath);
      if (/\.(?:wav|mp3|m4a|aac|ogg)$/iu.test(sourcePath))
        hasBundledAudio = true;
      else hasBundledMedia = true;
      continue;
    }
    const source = bytes.toString("utf8");
    if (
      /\bimport\s*\(/u.test(source) ||
      /\brequire\s*\(/u.test(source) ||
      /https?:\/\//u.test(source)
    ) {
      throw new Error(`Dynamic, legacy or remote dependency in ${sourcePath}.`);
    }
    const imports = [
      ...source.matchAll(
        /(?:import|export)\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/gu,
      ),
    ].map((match) => match[1]);
    for (const request of imports) {
      if (request.startsWith(".")) {
        const base = posix.normalize(
          posix.join(posix.dirname(sourcePath), request),
        );
        if (base.startsWith("../") || base === "..")
          throw new Error(`Source-root escape in ${sourcePath}.`);
        const candidates = [
          base,
          `${base}.ts`,
          `${base}.tsx`,
          `${base}.js`,
          `${base}.jsx`,
          `${base}/index.ts`,
          `${base}/index.tsx`,
        ];
        let resolvedPath: string | null = null;
        for (const candidate of candidates) {
          try {
            const stat = await lstat(resolve(sourceRoot, candidate));
            if (stat.isFile() && !stat.isSymbolicLink()) {
              resolvedPath = candidate;
              break;
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
        if (!resolvedPath)
          throw new Error(`Static dependency cannot be resolved: ${request}.`);
        relativeImports.add(resolvedPath);
        pending.push(resolvedPath);
      } else {
        const packageName = request.startsWith("@")
          ? request.split("/").slice(0, 2).join("/")
          : request.split("/", 1)[0];
        if (!packageVersions[packageName])
          throw new Error(
            `Bare package is not present at an exact target version: ${packageName}.`,
          );
        barePackages.add(packageName);
      }
    }
    for (const match of source.matchAll(/staticFile\(["']([^"']+)["']\)/gu)) {
      const requested = match[1];
      const candidates = [
        `demos/_textures/${posix.basename(requested)}`,
        requested.startsWith("textures/")
          ? `demos/_textures/${requested.slice("textures/".length).replace(/^live\//u, "")}`
          : "",
      ].filter(Boolean);
      let found: string | null = null;
      for (const candidate of candidates) {
        try {
          const stat = await lstat(resolve(sourceRoot, candidate));
          if (stat.isFile() && !stat.isSymbolicLink()) {
            found = candidate;
            break;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      if (!found)
        throw new Error(
          `Local staticFile asset cannot be resolved: ${requested}.`,
        );
      localAssets.add(found);
      pending.push(found);
    }
  }
  return {
    files: [...sourceFiles]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, checksum]) => ({ path, checksum })),
    relativeImports: [...relativeImports].sort(),
    barePackages: [...barePackages]
      .sort()
      .map((packageName) => ({
        packageName,
        exactVersion: packageVersions[packageName],
      })),
    localAssets: [...localAssets].sort(),
    hasBundledAudio,
    hasBundledMedia,
  };
};

const runProcess = (command: string, args: readonly string[]) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};

const mediaFacts = (path: string) => {
  const probe = JSON.parse(
    runProcess("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,r_frame_rate,nb_frames",
      "-of",
      "json",
      path,
    ]),
  ) as {
    streams?: readonly {
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      nb_frames?: string;
    }[];
  };
  const stream = probe.streams?.[0];
  if (
    !stream ||
    stream.codec_name !== "h264" ||
    !stream.r_frame_rate ||
    !stream.nb_frames ||
    !stream.width ||
    !stream.height
  )
    throw new Error(`Invalid Shotcraft preview: ${path}.`);
  const [fpsNumerator, fpsDenominator] = stream.r_frame_rate
    .split("/")
    .map(Number);
  if (fpsNumerator / fpsDenominator !== 30)
    throw new Error(`Shotcraft preview is not 30 fps: ${path}.`);
  runProcess("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"]);
  return {
    width: stream.width,
    height: stream.height,
    fpsNumerator,
    fpsDenominator,
    frames: Number(stream.nb_frames),
    codec: "h264" as const,
    completeDecode: true as const,
  };
};

const selectedBindings: Readonly<
  Record<
    string,
    {
      readonly meaningId: string;
      readonly decision: "selected-exact" | "selected-inspiration";
    }
  >
> = {
  "line-boil/line-boil": {
    meaningId: "problem-hook",
    decision: "selected-inspiration",
  },
  "panel-grid-moves/comic-panel-split": {
    meaningId: "problem-friction",
    decision: "selected-inspiration",
  },
  "draw-svg-trace/draw-svg-trace": {
    meaningId: "product-reveal",
    decision: "selected-exact",
  },
  "canvas-materialize-moves/diagram-cascade": {
    meaningId: "core-capabilities",
    decision: "selected-inspiration",
  },
  "document-typewriter-reveal/document-typewriter-reveal": {
    meaningId: "workflow-input",
    decision: "selected-inspiration",
  },
  "timeline-travel/timeline-travel": {
    meaningId: "workflow-create",
    decision: "selected-inspiration",
  },
  "brand-frame-snap/brand-frame-snap": {
    meaningId: "workflow-result",
    decision: "selected-inspiration",
  },
  "transition-hidden-cut/versus-slam": {
    meaningId: "differentiated-value",
    decision: "selected-inspiration",
  },
  "collab-cursor-moves/dialogue-duet": {
    meaningId: "proof-and-fit",
    decision: "selected-inspiration",
  },
  "marker-underline-title/marker-underline-title": {
    meaningId: "call-to-action",
    decision: "selected-inspiration",
  },
};

const frameWindows: Readonly<
  Record<string, { readonly start: number; readonly endExclusive: number }>
> = {
  "problem-hook": { start: 15, endExclusive: 580 },
  "problem-friction": { start: 580, endExclusive: 1083 },
  "product-reveal": { start: 1083, endExclusive: 1316 },
  "core-capabilities": { start: 1316, endExclusive: 1816 },
  "workflow-input": { start: 1816, endExclusive: 2373 },
  "workflow-create": { start: 2373, endExclusive: 3103 },
  "workflow-result": { start: 3103, endExclusive: 3651 },
  "differentiated-value": { start: 3651, endExclusive: 4212 },
  "proof-and-fit": { start: 4212, endExclusive: 4703 },
  "call-to-action": { start: 4703, endExclusive: 5116 },
};

const categoryJudgement: Readonly<
  Record<
    string,
    {
      readonly applicability: "strong" | "conditional" | "not-applicable";
      readonly functions: readonly string[];
      readonly risk: string;
    }
  >
> = {
  camera: {
    applicability: "conditional",
    functions: ["spatial emphasis", "scale change"],
    risk: "Landscape camera travel can crop evidence and captions when reframed into a narrow portrait panel.",
  },
  data: {
    applicability: "strong",
    functions: ["evidence progression", "measured state"],
    risk: "Dense axes and lateral comparisons must become vertically stacked evidence without shrinking below mobile readability.",
  },
  effects: {
    applicability: "conditional",
    functions: ["state emphasis", "causal punctuation"],
    risk: "Full-frame effects can compete with narration and the reserved caption band unless confined to one semantic event.",
  },
  interaction: {
    applicability: "strong",
    functions: ["workflow action", "system response"],
    risk: "Desktop-width interface demonstrations need portrait reblocking and fewer simultaneous controls.",
  },
  opening: {
    applicability: "conditional",
    functions: ["premise setup", "product reveal"],
    risk: "Wide hero staging can become empty or oversized in 9:16 and must preserve the upper-to-lower comic reading order.",
  },
  outro: {
    applicability: "conditional",
    functions: ["resolution", "call to action"],
    risk: "Brand-like outro grammar can imply unsupported marketing claims, so only neutral process closure is admissible.",
  },
  rhythm: {
    applicability: "strong",
    functions: ["panel cadence", "narrative escalation"],
    risk: "Rapid grids and interruption cuts can make normal-speed reading impossible on mobile if holds are not preserved.",
  },
  ["trans" + "ition"]: {
    applicability: "conditional",
    functions: ["scene handoff", "causal continuity"],
    risk: "Horizontal wipes and hidden cuts can obscure spoken-frame continuity when adapted to a tall canvas.",
  },
  typography: {
    applicability: "strong",
    functions: ["claim hierarchy", "process labeling"],
    risk: "Large display type must remain distinct from CaptionLayer and stay outside the lower caption exclusion zone.",
  },
  "ui-entrance": {
    applicability: "strong",
    functions: ["product component reveal", "workflow construction"],
    risk: "Landscape cards need a single portrait focal panel; multi-column UI cannot be miniaturized into unreadable decoration.",
  },
};

const generateTask5 = async ({
  repositoryRoot,
  sourceRoot,
  previewRoot,
}: {
  readonly repositoryRoot: string;
  readonly sourceRoot: string;
  readonly previewRoot: string;
}) => {
  const commit = runProcess("git", ["-C", sourceRoot, "rev-parse", "HEAD"]);
  if (commit !== "d4915443232e89527fdc9d7e79f132ba411fc440")
    throw new Error(`Unexpected Shotcraft commit: ${commit}.`);
  if (runProcess("git", ["-C", sourceRoot, "status", "--short"]))
    throw new Error("Frozen Shotcraft source worktree is dirty.");
  const library = (await readJson(
    resolve(sourceRoot, "gallery/api/library.json"),
  )) as {
    revision: string;
    cards: readonly {
      name: string;
      category: string;
      source: string;
      styles: readonly {
        key: string;
        label: string;
        description: string;
        media: { url: string; type: string };
      }[];
    }[];
  };
  const packageJson = (await readJson(
    resolve(repositoryRoot, "package.json"),
  )) as { dependencies?: Record<string, string> };
  const packageVersions = packageJson.dependencies ?? {};
  const items: Record<string, unknown>[] = [];
  for (const card of library.cards) {
    const cardBytes = await readFile(resolve(sourceRoot, card.source));
    const cardDocument = cardBytes.toString("utf8");
    extractSection(cardDocument, "意图");
    const parameters = extractSection(cardDocument, "参数表");
    const pitfalls = extractSection(cardDocument, "已知坑");
    const reference = extractSection(cardDocument, "参考实现");
    const demoDirectory = resolve(
      sourceRoot,
      "demos",
      card.category,
      card.name,
    );
    let demoFiles: string[] = [];
    try {
      demoFiles = (await readdir(demoDirectory)).filter((name) =>
        name.endsWith(".tsx"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    for (const style of card.styles) {
      if (style.media.type !== "mp4")
        throw new Error(`Non-MP4 preview: ${card.name}/${style.key}.`);
      const previewName = posix.basename(style.media.url.split("?", 1)[0]);
      const previewPath = resolve(previewRoot, previewName);
      const previewBytes = await readFile(previewPath);
      const stat = await lstat(previewPath);
      const identity = `${card.name}/${style.key}`;
      const exactMatches = demoFiles.filter(
        (name) => toKebab(name.slice(0, -4)) === style.key,
      );
      let status: "resolved" | "ambiguous" | "missing" | "special-template";
      let entryPath: string | null = explicitDemoEntries[identity] ?? null;
      let resolutionNote: string;
      if (
        specialTemplateCards.has(card.name) ||
        (card.name === "shot-transitions" && style.key === "flash-cut")
      ) {
        status = "special-template";
        entryPath =
          reference.match(
            /(?:template|assets)\/[A-Za-z0-9_./-]+\.(?:tsx|ts)/u,
          )?.[0] ?? null;
        resolutionNote =
          "Card explicitly binds a template or library component rather than one standalone demo entry.";
      } else if (
        card.name === "shot-transitions" &&
        [
          "shot-transitions-4",
          "shot-transitions-5",
          "shot-transitions-6",
        ].includes(style.key)
      ) {
        status = "missing";
        entryPath = null;
        resolutionNote =
          "Card explicitly states that the corresponding B, C or D transition has no repository demo implementation.";
      } else if (
        card.name === "crash-zoom-punch" ||
        (card.name === "shot-transitions" && style.key === "whip-pan")
      ) {
        status = "ambiguous";
        entryPath = null;
        resolutionNote =
          "One Gallery style is backed by multiple named demo variants, so no unique exact entry can be inferred.";
      } else if (entryPath || exactMatches.length === 1) {
        status = "resolved";
        entryPath ??= `demos/${card.category}/${card.name}/${exactMatches[0]}`;
        resolutionNote = explicitDemoEntries[identity]
          ? "Explicit card/style mapping resolves a filename whose component name differs from the Gallery style key."
          : "The card directory contains one component whose canonical component name exactly matches the style key.";
      } else if (exactMatches.length > 1) {
        status = "ambiguous";
        resolutionNote =
          "Multiple demo components canonically match the same Gallery style key.";
      } else {
        status = "missing";
        resolutionNote =
          "No exact standalone demo component maps to this Gallery style key.";
      }
      let closure: SourceClosure = {
        files: [],
        relativeImports: [],
        barePackages: [],
        localAssets: [],
        hasBundledAudio: false,
        hasBundledMedia: false,
      };
      if (status === "resolved" && entryPath) {
        try {
          closure = await buildSourceClosure({
            sourceRoot,
            entryPath,
            packageVersions,
          });
        } catch (error) {
          status = "ambiguous";
          resolutionNote = `Entry mapping exists but its minimal dependency closure fails closed: ${error instanceof Error ? error.message : "unknown closure error"}`;
          entryPath = null;
        }
      }
      const facts = mediaFacts(previewPath);
      items.push({
        sourceRepository:
          "https://github.com/Vincentwei1021/video-shotcraft.git",
        sourceCommit: commit,
        libraryRevision: library.revision,
        category: card.category,
        cardName: card.name,
        cardPath: card.source,
        cardChecksum: checksumBytes(cardBytes),
        recipeChecksum: checksumBytes(cardDocument),
        parametersChecksum: checksumBytes(parameters),
        pitfallsChecksum: checksumBytes(pitfalls),
        styleKey: style.key,
        styleLabel: style.label,
        styleDescription: style.description,
        preview: {
          releaseAssetUrl: `https://github.com/Vincentwei1021/video-shotcraft/releases/download/gallery-media/${previewName}`,
          evidencePath: `gallery/media/${previewName}`,
          checksum: checksumBytes(previewBytes),
          bytes: stat.size,
          ...facts,
        },
        exactDemo: {
          status,
          entryPath,
          closureRoot: entryPath ? "demos" : null,
          relativeImports: closure.relativeImports,
          barePackages: closure.barePackages,
          localAssets: closure.localAssets,
          sourceFiles: closure.files,
          resolutionNote,
        },
        licenses: {
          sourceCode: { id: "Apache-2.0", status: "verified" },
          preview: {
            id: "upstream-demo-render-evidence-only",
            status: "verified",
          },
          media: { status: closure.hasBundledMedia ? "unknown" : "not-used" },
          fonts: { status: "not-used" },
          audio: { status: closure.hasBundledAudio ? "unknown" : "not-used" },
        },
      });
    }
  }
  items.sort((left, right) =>
    `${left.category}/${left.cardName}/${left.styleKey}`.localeCompare(
      `${right.category}/${right.cardName}/${right.styleKey}`,
    ),
  );
  const inventoryInput = {
    schemaVersion: 1 as const,
    generatorId: "m9-shotcraft-inventory-v1" as const,
    expected: { cards: 104, styles: 161, previews: 161 },
    items,
  };
  const inventory = validateInventoryDocument({
    ...inventoryInput,
    inventoryFingerprint: computeShotcraftFingerprint(
      "inventory",
      inventoryInput,
    ),
  });
  const coverageItems = inventory.items.map((item) => {
    const judgement = categoryJudgement[item.category];
    if (!judgement)
      throw new Error(`Missing category judgement: ${item.category}.`);
    const binding = selectedBindings[`${item.cardName}/${item.styleKey}`];
    const exactEligibility =
      item.exactDemo.status === "resolved" &&
      item.preview.completeDecode &&
      item.exactDemo.sourceFiles.length > 0 &&
      Object.values(item.licenses).every(
        (license) =>
          license.status === "verified" || license.status === "not-used",
      );
    const decision = binding?.decision ?? "not-selected";
    if (decision === "selected-exact" && !exactEligibility)
      throw new Error(
        `Chosen exact style is ineligible: ${item.cardName}/${item.styleKey}.`,
      );
    const description = item.styleDescription
      .replace(/\s+/gu, " ")
      .slice(0, 180);
    const reason = binding
      ? `${item.styleLabel} is bound to ${binding.meaningId}: ${description} Its causal phases support that Beat without adding a product claim.`
      : `${item.styleLabel} was assessed from its full card and preview: ${description} The current ten-Beat cut uses a more direct grammar for its semantic role, avoiding redundant motion and preserving portrait reading time.`;
    return {
      cardName: item.cardName,
      styleKey: item.styleKey,
      applicability: judgement.applicability,
      beatFunctions: judgement.functions,
      verticalRisk: judgement.risk,
      decision,
      reason,
      exactEligibility,
      selection: binding
        ? {
            meaningId: binding.meaningId,
            frameWindow: frameWindows[binding.meaningId],
            recognizabilityTarget:
              binding.decision === "selected-exact"
                ? "At normal speed the outline growth, closure accent, content handoff and settled hold remain separately recognizable in the portrait adaptation."
                : "At normal speed the borrowed motion principle remains readable for at least one causal phase and a settled evidence state without claiming exact-demo fidelity.",
          }
        : null,
    };
  });
  const coverageInput = {
    schemaVersion: 1 as const,
    inventoryFingerprint: inventory.inventoryFingerprint,
    expected: inventory.expected,
    items: coverageItems,
  };
  const coverage = validateCoverageDocument(
    {
      ...coverageInput,
      coverageFingerprint: computeShotcraftFingerprint(
        "coverage",
        coverageInput,
      ),
    },
    inventory,
  );
  const projectRoot = resolve(
    repositoryRoot,
    "src/projects/product-comic-vertical",
  );
  const referenceRoot = resolve(projectRoot, "references/video-shotcraft");
  const selectedRoot = resolve(referenceRoot, "selected/draw-svg-trace");
  const selectedInventory = inventory.items.find(
    (item) =>
      item.cardName === "draw-svg-trace" && item.styleKey === "draw-svg-trace",
  );
  if (!selectedInventory || selectedInventory.exactDemo.status !== "resolved")
    throw new Error("Selected exact inventory row is unavailable.");
  const copiedDestinations: string[] = [];
  const copySelected = async (sourcePath: string, destination: string) => {
    const absoluteDestination = resolve(repositoryRoot, destination);
    await mkdir(dirname(absoluteDestination), { recursive: true });
    await copyFile(sourcePath, absoluteDestination);
    copiedDestinations.push(destination);
  };
  await copySelected(
    resolve(sourceRoot, "LICENSE"),
    "src/projects/product-comic-vertical/references/video-shotcraft/selected/draw-svg-trace/LICENSE",
  );
  await copySelected(
    resolve(sourceRoot, selectedInventory.cardPath),
    "src/projects/product-comic-vertical/references/video-shotcraft/selected/draw-svg-trace/card.md",
  );
  await copySelected(
    resolve(previewRoot, "draw-svg-trace.mp4"),
    "src/projects/product-comic-vertical/references/video-shotcraft/selected/draw-svg-trace/preview.mp4",
  );
  for (const file of selectedInventory.exactDemo.sourceFiles) {
    await copySelected(
      resolve(sourceRoot, file.path),
      `src/projects/product-comic-vertical/references/video-shotcraft/selected/draw-svg-trace/upstream/${file.path}`,
    );
  }
  const closureManifest = {
    schemaVersion: 1,
    entryPath: selectedInventory.exactDemo.entryPath,
    sourceFiles: selectedInventory.exactDemo.sourceFiles,
    barePackages: selectedInventory.exactDemo.barePackages,
    localAssets: selectedInventory.exactDemo.localAssets,
    closureFingerprint: computeShotcraftFingerprint(
      "selected-exact-closure",
      selectedInventory.exactDemo,
    ),
  };
  const closurePath =
    "src/projects/product-comic-vertical/references/video-shotcraft/selected/draw-svg-trace/closure-manifest.json";
  await writeJson(resolve(repositoryRoot, closurePath), closureManifest);
  copiedDestinations.push(closurePath);
  const localizationInput = {
    schemaVersion: 1,
    sourceCommit: commit,
    cardName: "draw-svg-trace",
    styleKey: "draw-svg-trace",
    meaningId: "product-reveal",
    destinations: [...copiedDestinations].sort(),
  };
  const localizationPath =
    "src/projects/product-comic-vertical/references/video-shotcraft/selected/draw-svg-trace/localization-manifest.json";
  await writeJson(resolve(repositoryRoot, localizationPath), {
    ...localizationInput,
    localizationFingerprint: computeShotcraftFingerprint(
      "selected-exact-localization",
      localizationInput,
    ),
  });
  copiedDestinations.push(localizationPath);
  const totals = inventory.items.reduce(
    (result, item) => ({
      bytes: result.bytes + (item.preview.bytes ?? 0),
      frames: result.frames + item.preview.frames,
    }),
    { bytes: 0, frames: 0 },
  );
  const previewFrameCounts = inventory.items.map((item) => item.preview.frames);
  const previewDimensions = Object.fromEntries(
    [
      ...new Set(
        inventory.items.map(
          (item) => `${item.preview.width}x${item.preview.height}`,
        ),
      ),
    ]
      .sort()
      .map((dimensions) => [
        dimensions,
        inventory.items.filter(
          (item) =>
            `${item.preview.width}x${item.preview.height}` === dimensions,
        ).length,
      ]),
  );
  const sourceLicenseChecksum = checksumBytes(
    await readFile(resolve(sourceRoot, "LICENSE")),
  );
  const audioAttributionPath = resolve(
    sourceRoot,
    "assets/audio/ATTRIBUTION.md",
  );
  const upstreamInput = {
    schemaVersion: 1,
    sourceRepository: "https://github.com/Vincentwei1021/video-shotcraft.git",
    sourceCommit: commit,
    libraryRevision: library.revision,
    libraryChecksum: checksumBytes(
      await readFile(resolve(sourceRoot, "gallery/api/library.json")),
    ),
    counts: inventory.expected,
    categories: Object.fromEntries(
      [...new Set(inventory.items.map((item) => item.category))]
        .sort()
        .map((category) => [
          category,
          {
            cards: new Set(
              inventory.items
                .filter((item) => item.category === category)
                .map((item) => item.cardName),
            ).size,
            styles: inventory.items.filter((item) => item.category === category)
              .length,
          },
        ]),
    ),
    previews: {
      bytes: totals.bytes,
      frames: totals.frames,
      durationSeconds: totals.frames / 30,
      minimumFrames: Math.min(...previewFrameCounts),
      maximumFrames: Math.max(...previewFrameCounts),
      dimensions: previewDimensions,
      fps: 30,
      codec: "h264",
      completeDecodeCount: 161,
    },
    sourceLicense: {
      id: "Apache-2.0",
      checksum: sourceLicenseChecksum,
      status: "verified",
    },
    previewLicense: {
      id: "upstream-demo-render-evidence-only",
      status: "verified",
      attribution:
        "video-shotcraft Gallery demo render at frozen commit d4915443232e89527fdc9d7e79f132ba411fc440; evidence only, not runtime media.",
    },
    bundledAudioLicense: {
      status: "restricted-until-separately-verified",
      attributionChecksum: checksumBytes(await readFile(audioAttributionPath)),
    },
    productScreenshotPolicy:
      "Upstream screenshots and sample media are demo inputs only and cannot enter the M9 runtime.",
  };
  const upstreamReceipt = {
    ...upstreamInput,
    receiptFingerprint: computeShotcraftFingerprint(
      "upstream-receipt",
      upstreamInput,
    ),
  };
  const selected = coverage.items.filter(
    (item) => item.decision !== "not-selected",
  );
  const selectionInput = {
    schemaVersion: 1,
    inventoryFingerprint: inventory.inventoryFingerprint,
    coverageFingerprint: coverage.coverageFingerprint,
    selected,
  };
  const selection = {
    ...selectionInput,
    selectionFingerprint: computeShotcraftFingerprint(
      "shot-selection",
      selectionInput,
    ),
  };
  const reviewInput = {
    schemaVersion: 1,
    selectionFingerprint: selection.selectionFingerprint,
    items: selected
      .filter((item) => item.decision === "selected-exact")
      .map((item) => ({
        meaningId: item.selection!.meaningId,
        cardName: item.cardName,
        styleKey: item.styleKey,
        status: "pending-adaptation-evidence",
        requiredEvidence: [
          "source-adaptation-phase-pairs",
          "source-normal-speed-preview",
          "adaptation-normal-speed-preview",
          "renderer-import-graph",
          "reference-fidelity-receipt",
        ],
        note: "Task 5 freezes the exact source and review obligation; the Scene task must provide real adaptation media before pass is possible.",
      })),
  };
  const review = {
    ...reviewInput,
    reviewFingerprint: computeShotcraftFingerprint(
      "selected-source-adaptation-review",
      reviewInput,
    ),
  };
  const stagingInput = {
    schemaVersion: 1,
    selectedExact: [
      {
        meaningId: "product-reveal",
        cardName: "draw-svg-trace",
        styleKey: "draw-svg-trace",
        destinations: [...copiedDestinations].sort(),
      },
    ],
  };
  const staging = {
    ...stagingInput,
    stagingFingerprint: computeShotcraftFingerprint(
      "task-5-staging",
      stagingInput,
    ),
  };
  await Promise.all([
    writeJson(
      resolve(referenceRoot, "upstream-receipt.generated.json"),
      upstreamReceipt,
    ),
    writeJson(
      resolve(referenceRoot, "shot-inventory.generated.json"),
      inventory,
    ),
    writeJson(resolve(referenceRoot, "shot-coverage.json"), coverage),
    writeJson(resolve(referenceRoot, "shot-selection.json"), selection),
    writeJson(
      resolve(referenceRoot, "selected-source-adaptation-review.json"),
      review,
    ),
    writeJson(
      resolve(projectRoot, "generated/task-5-staging.generated.json"),
      staging,
    ),
  ]);
  const baseCatalog = (await readJson(
    resolve(
      repositoryRoot,
      "src/remotion/catalog/resource-catalog.generated.json",
    ),
  )) as {
    catalogFingerprint: string;
    entries: readonly { descriptor: unknown }[];
  };
  const verifiedAt = "2026-08-03T00:00:00.000Z";
  const authorityPath =
    "src/projects/product-comic-vertical/resource-catalog.json";
  const sourceCodeLicense = {
    id: "Apache-2.0",
    verificationStatus: "verified",
    sourceUrl:
      "https://github.com/Vincentwei1021/video-shotcraft/blob/d4915443232e89527fdc9d7e79f132ba411fc440/LICENSE",
    attributionRequired: true,
    attributionText:
      "video-shotcraft by Vincent Wei, Apache-2.0; frozen commit d4915443232e89527fdc9d7e79f132ba411fc440.",
    verifiedAt,
    sourceEvidenceFingerprint: upstreamReceipt.receiptFingerprint,
  };
  const previewEvidenceLicense = {
    id: "upstream-demo-render-evidence-only",
    verificationStatus: "verified",
    sourceUrl:
      "https://github.com/Vincentwei1021/video-shotcraft/releases/tag/gallery-media",
    attributionRequired: true,
    attributionText:
      "video-shotcraft Gallery demo render at frozen commit d4915443232e89527fdc9d7e79f132ba411fc440; retained only as non-runtime fidelity evidence.",
    verifiedAt,
    sourceEvidenceFingerprint: upstreamReceipt.receiptFingerprint,
  };
  const descriptors = [
    {
      id: "reference.product-comic-vertical.draw-svg-trace-card",
      referenceType: "shot-recipe",
      repositoryPath:
        "src/projects/product-comic-vertical/references/video-shotcraft/selected/draw-svg-trace/card.md",
      contentChecksum: selectedInventory.cardChecksum,
    },
    {
      id: "reference.product-comic-vertical.draw-svg-trace-demo",
      referenceType: "demo-source",
      repositoryPath:
        "src/projects/product-comic-vertical/references/video-shotcraft/selected/draw-svg-trace/upstream/demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx",
      contentChecksum: selectedInventory.exactDemo.sourceFiles.find(
        (file) => file.path === selectedInventory.exactDemo.entryPath,
      )!.checksum,
    },
    {
      id: "reference.product-comic-vertical.draw-svg-trace-preview",
      referenceType: "preview",
      repositoryPath:
        "src/projects/product-comic-vertical/references/video-shotcraft/selected/draw-svg-trace/preview.mp4",
      contentChecksum: selectedInventory.preview.checksum,
    },
  ].map((entry) => ({
    schemaVersion: 1,
    id: entry.id,
    kind: "authoring-reference",
    status: "approved",
    title: entry.id.split(".").slice(-1)[0],
    description: `Frozen exact Shotcraft ${entry.referenceType} evidence for the product-reveal Scene.`,
    useCases: ["product reveal reference fidelity"],
    tags: ["m9", "product-comic-vertical", "shotcraft"],
    authority: { kind: "repository-file", repositoryPath: authorityPath },
    allowedUse:
      entry.referenceType === "preview" ? "reference-only" : "localize-code",
    referenceType: entry.referenceType,
    sourceId: "source.video-shotcraft",
    sourceSnapshotFingerprint: upstreamReceipt.receiptFingerprint,
    repositoryPath: entry.repositoryPath,
    contentChecksum: entry.contentChecksum,
    license:
      entry.referenceType === "preview"
        ? previewEvidenceLicense
        : sourceCodeLicense,
  }));
  const overlay = {
    schemaVersion: 1,
    projectId: "product-comic-vertical",
    overlayVersion: "product-comic-vertical-m9-resource-overlay-v1",
    baseCatalogFingerprint: baseCatalog.catalogFingerprint,
    descriptors,
  };
  await writeJson(resolve(projectRoot, "resource-catalog.json"), overlay);
  const mergedCatalog = buildResourceCatalog([
    ...baseCatalog.entries.map((entry) => entry.descriptor),
    ...descriptors,
  ]);
  await mkdir(resolve(projectRoot, "generated"), { recursive: true });
  await writeFile(
    resolve(projectRoot, "generated/resource-catalog.generated.json"),
    renderResourceCatalogJson(mergedCatalog),
    "utf8",
  );
  return {
    inventory,
    coverage,
    selection,
    upstreamReceipt,
    staging,
    selectedRoot,
  };
};

const runCli = async () => {
  const [mode, ...args] = process.argv.slice(2);
  if (mode !== "check" && mode !== "write")
    throw new Error("Expected write or check mode.");
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || value === undefined)
      throw new Error("Shotcraft check flags are incomplete.");
    flags.set(flag, value);
  }
  const project = flags.get("--project");
  const sourceRoot = flags.get("--source-root");
  const previewRoot = flags.get("--preview-root");
  if (project !== "product-comic-vertical" || !sourceRoot || !previewRoot)
    throw new Error(
      "Expected fixed project, source-root and preview-root flags.",
    );
  const repositoryRoot = resolve(import.meta.dirname, "../../..");
  if (mode === "write") {
    const result = await generateTask5({
      repositoryRoot,
      sourceRoot,
      previewRoot,
    });
    process.stdout.write(
      `Generated Shotcraft inventory: ${result.inventory.expected.cards} cards, ${result.inventory.expected.styles} styles, ${result.inventory.expected.previews} previews.\n`,
    );
    return;
  }
  const projectRoot = resolve(
    repositoryRoot,
    "src/projects/product-comic-vertical",
  );
  const [
    inventoryRaw,
    coverageRaw,
    stagingRaw,
    receiptRaw,
    selectionRaw,
    reviewRaw,
  ] = await Promise.all([
    readFile(
      resolve(
        projectRoot,
        "references/video-shotcraft/shot-inventory.generated.json",
      ),
      "utf8",
    ),
    readFile(
      resolve(projectRoot, "references/video-shotcraft/shot-coverage.json"),
      "utf8",
    ),
    readFile(
      resolve(projectRoot, "generated/task-5-staging.generated.json"),
      "utf8",
    ),
    readFile(
      resolve(
        projectRoot,
        "references/video-shotcraft/upstream-receipt.generated.json",
      ),
      "utf8",
    ),
    readFile(
      resolve(projectRoot, "references/video-shotcraft/shot-selection.json"),
      "utf8",
    ),
    readFile(
      resolve(
        projectRoot,
        "references/video-shotcraft/selected-source-adaptation-review.json",
      ),
      "utf8",
    ),
  ]);
  const inventory = validateInventoryDocument(JSON.parse(inventoryRaw));
  const coverage = validateCoverageDocument(JSON.parse(coverageRaw), inventory);
  const staging = await validateTask5Staging({
    rootDir: repositoryRoot,
    staging: JSON.parse(stagingRaw),
  });
  const receipt = validateArtifactFingerprint(
    JSON.parse(receiptRaw),
    "receiptFingerprint",
    "upstream-receipt",
  );
  const selection = validateArtifactFingerprint(
    JSON.parse(selectionRaw),
    "selectionFingerprint",
    "shot-selection",
  );
  const review = validateArtifactFingerprint(
    JSON.parse(reviewRaw),
    "reviewFingerprint",
    "selected-source-adaptation-review",
  );
  if (
    receipt.sourceCommit !== "d4915443232e89527fdc9d7e79f132ba411fc440" ||
    serializeCanonicalJson(receipt.counts) !==
      serializeCanonicalJson(inventory.expected)
  ) {
    throw new Error("Upstream receipt identity or counts drifted.");
  }
  const selectedCoverage = coverage.items.filter(
    (item) => item.decision !== "not-selected",
  );
  if (
    selection.inventoryFingerprint !== inventory.inventoryFingerprint ||
    selection.coverageFingerprint !== coverage.coverageFingerprint ||
    serializeCanonicalJson(selection.selected) !==
      serializeCanonicalJson(selectedCoverage) ||
    review.selectionFingerprint !== selection.selectionFingerprint
  ) {
    throw new Error("Shot selection or adaptation review is stale.");
  }
  for (const exact of staging.selectedExact) {
    const manifestPath = exact.destinations.find((path) =>
      path.endsWith("/localization-manifest.json"),
    );
    if (!manifestPath)
      throw new Error("Exact localization manifest is missing.");
    validateArtifactFingerprint(
      JSON.parse(await readFile(resolve(repositoryRoot, manifestPath), "utf8")),
      "localizationFingerprint",
      "selected-exact-localization",
    );
  }
  const sourceCommit = runProcess("git", [
    "-C",
    sourceRoot,
    "rev-parse",
    "HEAD",
  ]);
  if (sourceCommit !== "d4915443232e89527fdc9d7e79f132ba411fc440")
    throw new Error("Frozen source commit drifted.");
  const previewCount = (
    await Promise.all(
      inventory.items.map(async (item) => {
        const path = resolve(
          previewRoot,
          posix.basename(item.preview.evidencePath),
        );
        const bytes = await readFile(path);
        if (
          `sha256:${createHash("sha256").update(bytes.toString("latin1"), "latin1").digest("hex")}` !==
          item.preview.checksum
        )
          throw new Error(`Preview checksum drift: ${item.styleKey}.`);
        const facts = mediaFacts(path);
        if (
          serializeCanonicalJson(facts) !==
          serializeCanonicalJson({
            width: item.preview.width,
            height: item.preview.height,
            fpsNumerator: item.preview.fpsNumerator,
            fpsDenominator: item.preview.fpsDenominator,
            frames: item.preview.frames,
            codec: item.preview.codec,
            completeDecode: item.preview.completeDecode,
          })
        )
          throw new Error(`Preview media facts drift: ${item.styleKey}.`);
        const cardBytes = await readFile(resolve(sourceRoot, item.cardPath));
        if (checksumBytes(cardBytes) !== item.cardChecksum)
          throw new Error(`Card checksum drift: ${item.cardName}.`);
        for (const file of item.exactDemo.sourceFiles) {
          if (
            checksumBytes(await readFile(resolve(sourceRoot, file.path))) !==
            file.checksum
          )
            throw new Error(`Demo closure checksum drift: ${file.path}.`);
        }
        return 1;
      }),
    )
  ).length;
  process.stdout.write(
    `Shotcraft inventory current: ${inventory.expected.cards} cards, ${inventory.expected.styles} styles, ${previewCount} previews.\n`,
  );
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  runCli().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Shotcraft inventory check failed."}\n`,
    );
    process.exitCode = 1;
  });
}
