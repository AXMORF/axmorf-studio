import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { ResourceDescriptorSchema } from "../../../src/contracts";

const HexSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
const RelativePublicPathSchema = z
  .string()
  .refine(
    (value) =>
      value.startsWith("public/") &&
      !value.includes("..") &&
      !value.includes("\\"),
  );

const DesignSchema = z
  .object({
    schemaVersion: z.literal(1),
    canvas: z
      .object({
        width: z.literal(1080),
        height: z.literal(1920),
        safeInset: z.number().int().min(48).max(160),
      })
      .strict(),
    palette: z
      .object({
        ink: HexSchema,
        paper: HexSchema,
        accent: HexSchema,
        support: HexSchema,
        muted: HexSchema,
      })
      .strict(),
    typography: z
      .object({
        displayFamily: z.string().min(1),
        bodyFamily: z.string().min(1),
        minimumReadablePx: z.number().int().min(32),
      })
      .strict(),
    panels: z
      .object({
        gutterPx: z.number().int().positive(),
        borderPx: z.number().int().positive(),
        radiusPx: z.number().int().nonnegative(),
        readingOrder: z.literal("top-to-bottom"),
      })
      .strict(),
    motion: z
      .object({
        source: z.literal("remotion-frame-api"),
        allowedPrimitives: z
          .array(z.enum(["interpolate", "spring", "Sequence"]))
          .min(1),
        cssAnimation: z.literal(false),
        cssTransition: z.literal(false),
      })
      .strict(),
    captions: z
      .object({
        owner: z.literal("CaptionLayer"),
        band: z
          .object({ top: z.number().int(), bottom: z.number().int() })
          .strict(),
        visualExclusionZone: z
          .object({ top: z.number().int(), bottom: z.number().int() })
          .strict(),
      })
      .strict(),
    grammar: z
      .object({
        devices: z.array(z.string().min(1)).min(5),
        maxSimultaneousPanels: z.number().int().min(1).max(4),
        automaticLayout: z.literal(false),
        sceneDsl: z.literal(false),
        automaticDirector: z.literal(false),
      })
      .strict(),
  })
  .strict()
  .superRefine((design, context) => {
    if (
      design.captions.visualExclusionZone.top > design.captions.band.top ||
      design.captions.visualExclusionZone.bottom < design.captions.band.bottom
    ) {
      context.addIssue({
        code: "custom",
        message: "Visual exclusion zone must fully reserve the caption band.",
        path: ["captions", "visualExclusionZone"],
      });
    }
  });

const containsForbiddenDeclaration = (value: unknown): boolean => {
  if (typeof value === "string")
    return /(?:animation|transition)\s*[: ]/iu.test(value);
  if (Array.isArray(value)) return value.some(containsForbiddenDeclaration);
  if (value && typeof value === "object")
    return Object.entries(value).some(
      ([key, nested]) =>
        /^(?:animation|transition|layoutDsl|sceneDslSource)$/iu.test(key) ||
        containsForbiddenDeclaration(nested),
    );
  return false;
};

export const validateComicDesignSystem = (raw: unknown) => {
  if (containsForbiddenDeclaration(raw))
    throw new Error(
      "Comic system contains CSS animation, transition or DSL declarations.",
    );
  return DesignSchema.parse(raw);
};

const AssetOverlaySchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.literal("product-comic-vertical"),
    baseCatalogFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    entries: z
      .array(
        z
          .object({
            id: z.string().min(1),
            kind: z.literal("asset"),
            localPath: RelativePublicPathSchema,
            checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
            permission: z.enum([
              "project-authored",
              "user-authorized",
              "generated-project-audio",
            ]),
            license: z
              .object({ id: z.string().min(1), status: z.literal("verified") })
              .strict(),
            catalogIdentity: z.string().min(1),
          })
          .strict(),
      )
      .superRefine((entries, context) => {
        const ids = new Set<string>();
        entries.forEach((entry, index) => {
          if (entry.id !== entry.catalogIdentity || ids.has(entry.id))
            context.addIssue({
              code: "custom",
              message: "Project Catalog identity is missing or duplicated.",
              path: [index, "catalogIdentity"],
            });
          ids.add(entry.id);
        });
      }),
  })
  .strict();

const AuthoringOverlaySchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.literal("product-comic-vertical"),
    overlayVersion: z.literal("product-comic-vertical-m9-resource-overlay-v1"),
    baseCatalogFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    descriptors: z.array(ResourceDescriptorSchema).min(1),
  })
  .strict()
  .superRefine((overlay, context) => {
    const ids = new Set<string>();
    overlay.descriptors.forEach((descriptor, index) => {
      if (
        descriptor.kind !== "asset" &&
        descriptor.kind !== "authoring-reference"
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Project overlay cannot replace shared capability or style descriptors.",
          path: ["descriptors", index, "kind"],
        });
      }
      if (ids.has(descriptor.id)) {
        context.addIssue({
          code: "custom",
          message: "Project Catalog descriptor identity is duplicated.",
          path: ["descriptors", index, "id"],
        });
      }
      ids.add(descriptor.id);
    });
  });

const OverlaySchema = z.union([AssetOverlaySchema, AuthoringOverlaySchema]);

export const validateProjectResourceOverlay = async ({
  rootDir,
  overlay: rawOverlay,
}: {
  readonly rootDir: string;
  readonly overlay: unknown;
}) => {
  const overlay = OverlaySchema.parse(rawOverlay);
  const files =
    "entries" in overlay
      ? overlay.entries.map((entry) => ({
          id: entry.id,
          path: entry.localPath,
          checksum: entry.checksum,
        }))
      : overlay.descriptors.map((descriptor) => {
          if (descriptor.kind === "asset")
            return {
              id: descriptor.id,
              path: descriptor.localPath,
              checksum: descriptor.checksum,
            };
          if (descriptor.kind === "authoring-reference")
            return {
              id: descriptor.id,
              path: descriptor.repositoryPath,
              checksum: descriptor.contentChecksum,
            };
          throw new Error(
            "Project overlay cannot contain shared capability or style descriptors.",
          );
        });
  for (const entry of files) {
    const path = resolve(rootDir, entry.path);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error(`Project resource is not a regular file: ${entry.path}.`);
    const bytes = await readFile(path);
    const checksum = `sha256:${createHash("sha256").update(bytes.toString("latin1"), "latin1").digest("hex")}`;
    if (checksum !== entry.checksum)
      throw new Error(`Project asset checksum drift: ${entry.id}.`);
  }
  return overlay;
};
