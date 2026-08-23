import { z } from "zod";

export const DESKTOP_PRODUCT_ID = "com.axmorf.studio" as const;
export const DESKTOP_WORKSPACE_SCHEMA_VERSION = 2 as const;
export const DESKTOP_WORKSPACE_CONTRACT_VERSION =
  "desktop-workspace-v2" as const;
export const DESKTOP_LAYOUT_VERSION = 2 as const;
export const DESKTOP_INTEGRATION_VERSION = 2 as const;
export const DESKTOP_MANAGED_FILES_CONTRACT_VERSION =
  "desktop-managed-files-v2" as const;
export const DESKTOP_PREFERENCES_CONTRACT_VERSION =
  "desktop-preferences-v1" as const;
export const DESKTOP_WORKSPACE_MIGRATION_CONTRACT_VERSION =
  "desktop-workspace-migration-v1" as const;

export const DESKTOP_WORKSPACE_DIRECTORIES = [
  "projects",
  "media",
  "deliveries",
  ".agents",
  ".agents/skills",
  ".agents/skills/remotion-story-producer-video",
  ".rsp",
  ".rsp/bin",
  ".rsp/lib",
  ".rsp/hermes",
  ".rsp/work",
  ".rsp/artifacts",
  ".rsp/attempts",
  ".rsp/current",
  ".rsp/current/source",
  ".rsp/locks",
  ".rsp/migrations",
  ".rsp/session",
] as const;

export const DESKTOP_MANAGED_FILE_PATHS = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".agents/skills/remotion-story-producer-video/SKILL.md",
  ".rsp/hermes/INSTALL_PROMPT.md",
  ".rsp/bin/rsp",
] as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const WorkspaceManifestSchema = z.strictObject({
  schemaVersion: z.literal(DESKTOP_WORKSPACE_SCHEMA_VERSION),
  contractVersion: z.literal(DESKTOP_WORKSPACE_CONTRACT_VERSION),
  productId: z.literal(DESKTOP_PRODUCT_ID),
  workspaceId: z.string().uuid(),
  layoutVersion: z.literal(DESKTOP_LAYOUT_VERSION),
  integrationVersion: z.literal(DESKTOP_INTEGRATION_VERSION),
  createdBy: z.literal("AXMORF Studio"),
  engineVersion: z.literal("desktop-engine-phase-b-v1"),
  protocolVersion: z.literal("rsp-local-v2"),
  skillVersion: z.literal("workspace-production-skill-v1"),
});

export type WorkspaceManifest = z.infer<typeof WorkspaceManifestSchema>;

export const ManagedFileRecordSchema = z.strictObject({
  path: z.enum(DESKTOP_MANAGED_FILE_PATHS),
  mode: z.union([
    z.literal(0o600),
    z.literal(0o644),
    z.literal(0o700),
    z.literal(0o755),
  ]),
  sha256: Sha256Schema,
});

export const ManagedFilesLedgerSchema = z.strictObject({
  schemaVersion: z.literal(2),
  contractVersion: z.literal(DESKTOP_MANAGED_FILES_CONTRACT_VERSION),
  integrationVersion: z.literal(DESKTOP_INTEGRATION_VERSION),
  workspaceId: z.string().uuid(),
  state: z.enum(["initializing", "ready"]),
  files: z
    .array(ManagedFileRecordSchema)
    .length(DESKTOP_MANAGED_FILE_PATHS.length),
});

export type ManagedFileRecord = z.infer<typeof ManagedFileRecordSchema>;
export type ManagedFilesLedger = z.infer<typeof ManagedFilesLedgerSchema>;

export const DesktopPreferencesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  contractVersion: z.literal(DESKTOP_PREFERENCES_CONTRACT_VERSION),
  workspaceRoot: z.string().min(1),
});

export type DesktopPreferences = z.infer<typeof DesktopPreferencesSchema>;

export const createWorkspaceManifest = (
  workspaceId: string,
): WorkspaceManifest =>
  WorkspaceManifestSchema.parse({
    schemaVersion: DESKTOP_WORKSPACE_SCHEMA_VERSION,
    contractVersion: DESKTOP_WORKSPACE_CONTRACT_VERSION,
    productId: DESKTOP_PRODUCT_ID,
    workspaceId,
    layoutVersion: DESKTOP_LAYOUT_VERSION,
    integrationVersion: DESKTOP_INTEGRATION_VERSION,
    createdBy: "AXMORF Studio",
    engineVersion: "desktop-engine-phase-b-v1",
    protocolVersion: "rsp-local-v2",
    skillVersion: "workspace-production-skill-v1",
  });

export const LegacyWorkspaceV1ManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  contractVersion: z.literal("desktop-workspace-v1"),
  productId: z.literal(DESKTOP_PRODUCT_ID),
  workspaceId: z.string().uuid(),
  layoutVersion: z.literal(1),
  integrationVersion: z.literal(1),
  createdBy: z.literal("AXMORF Studio"),
});

export type LegacyWorkspaceV1Manifest = z.infer<
  typeof LegacyWorkspaceV1ManifestSchema
>;

export const LEGACY_DESKTOP_MANAGED_FILE_PATHS = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".agents/skills/remotion-story-producer-video/SKILL.md",
  ".rsp/hermes/INSTALL_PROMPT.md",
  ".rsp/bin/rsp",
  ".rsp/lib/rsp-client.cjs",
] as const;

export const LegacyManagedFileRecordSchema = z.strictObject({
  path: z.enum(LEGACY_DESKTOP_MANAGED_FILE_PATHS),
  mode: z.union([
    z.literal(0o600),
    z.literal(0o644),
    z.literal(0o700),
    z.literal(0o755),
  ]),
  sha256: Sha256Schema,
});

export const LegacyManagedFilesLedgerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  contractVersion: z.literal("desktop-managed-files-v1"),
  integrationVersion: z.literal(1),
  workspaceId: z.string().uuid(),
  state: z.enum(["initializing", "ready"]),
  files: z
    .array(LegacyManagedFileRecordSchema)
    .length(LEGACY_DESKTOP_MANAGED_FILE_PATHS.length),
});

export type LegacyManagedFilesLedger = z.infer<
  typeof LegacyManagedFilesLedgerSchema
>;

const MigrationLeafNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) => value !== "." && value !== ".." && !value.includes("/"),
    "Migration paths must be same-parent leaf names.",
  );

export const WorkspaceMigrationRecordSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(DESKTOP_WORKSPACE_MIGRATION_CONTRACT_VERSION),
    migrationId: z.string().uuid(),
    kind: z.enum([
      "workspace-v1-to-v2",
      "managed-integration-update",
      "workspace-root-move",
    ]),
    workspaceId: z.string().uuid(),
    sourceLeafName: MigrationLeafNameSchema,
    targetLeafName: MigrationLeafNameSchema,
    stagingLeafName: MigrationLeafNameSchema,
    preservedLeafName: MigrationLeafNameSchema.nullable(),
    state: z.enum([
      "copying",
      "validated",
      "source-preserved",
      "target-ready",
      "preference-switched",
    ]),
  })
  .readonly();

export type WorkspaceMigrationRecord = z.infer<
  typeof WorkspaceMigrationRecordSchema
>;
