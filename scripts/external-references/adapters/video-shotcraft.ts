import {
  computeExternalReferenceCardFingerprint,
  computeExternalReferenceStyleFingerprint,
  ExternalReferenceCardSchema,
  ExternalRepositoryPathSchema,
  type ExternalReferenceCard,
} from "../../../src/contracts";

type UpstreamStyle = {
  readonly key?: unknown;
  readonly label?: unknown;
  readonly description?: unknown;
  readonly media?: { readonly url?: unknown; readonly type?: unknown };
};

type UpstreamCard = {
  readonly name?: unknown;
  readonly summary?: unknown;
  readonly source?: unknown;
  readonly category?: unknown;
  readonly tags?: unknown;
  readonly styles?: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Shotcraft library must be an object.");
  }
  return value as Record<string, unknown>;
};

const normalizePreviewPath = (rawUrl: unknown): string => {
  if (typeof rawUrl !== "string") {
    throw new Error("Shotcraft preview URL is missing.");
  }
  const withoutQuery = rawUrl.split("?", 1)[0];
  const normalized = withoutQuery.startsWith("./")
    ? `gallery/${withoutQuery.slice(2)}`
    : withoutQuery;
  return ExternalRepositoryPathSchema.parse(normalized);
};

export const readExactDemoDeclaration = (cardDocument: string): string => {
  const section = cardDocument.match(
    /## 参考实现\s*\n([^\n]+)\s*\n（([^）]+)）/u,
  );
  if (!section) {
    throw new Error("Shotcraft card document does not declare an exact demo.");
  }
  const directory = section[1].trim().replace(/\/$/, "");
  const file = section[2].trim();
  return ExternalRepositoryPathSchema.parse(`${directory}/${file}`);
};

export const canonicalizeVideoShotcraftCard = ({
  library,
  cardDocument,
  cardId,
  styleKey,
  cardDocumentChecksum,
  demoSourceChecksum,
  previewChecksum,
}: {
  readonly library: unknown;
  readonly cardDocument: string;
  readonly cardId: string;
  readonly styleKey: string;
  readonly cardDocumentChecksum: string;
  readonly demoSourceChecksum: string;
  readonly previewChecksum: string;
}): ExternalReferenceCard => {
  const root = asRecord(library);
  if (!Array.isArray(root.cards)) {
    throw new Error("Shotcraft library cards are missing.");
  }
  const cards = (root.cards as readonly UpstreamCard[]).filter(
    (card) => card.name === cardId,
  );
  if (cards.length !== 1) {
    throw new Error("Shotcraft card identity is missing or ambiguous.");
  }
  const card = cards[0];
  if (!Array.isArray(card.styles)) {
    throw new Error("Shotcraft card styles are missing.");
  }
  const styles = (card.styles as readonly UpstreamStyle[]).filter(
    (style) => style.key === styleKey,
  );
  if (styles.length !== 1) {
    throw new Error("Shotcraft style identity is missing or ambiguous.");
  }
  const style = styles[0];
  if (style.media?.type !== "mp4") {
    throw new Error("Shotcraft exact preview must be an MP4.");
  }
  if (
    typeof card.category !== "string" ||
    !Array.isArray(card.tags) ||
    !card.tags.every((tag) => typeof tag === "string")
  ) {
    throw new Error("Shotcraft card metadata is invalid.");
  }
  const demoSourcePath = readExactDemoDeclaration(cardDocument);
  const cardDocumentPath = ExternalRepositoryPathSchema.parse(card.source);
  const previewPath = normalizePreviewPath(style.media.url);
  const common = {
    cardId,
    styleKey,
    title:
      typeof style.label === "string" && style.label.trim()
        ? style.label
        : cardId,
    summary: String(card.summary ?? style.description ?? cardId),
    category: card.category,
    tags: card.tags,
    cardDocumentPath,
    demoSourcePath,
    previewPath,
    closureRoot: demoSourcePath.slice(0, demoSourcePath.lastIndexOf("/")),
    exactDemoDeclared: true as const,
    cardDocumentChecksum,
    demoSourceChecksum,
    previewChecksum,
  };
  return ExternalReferenceCardSchema.parse({
    ...common,
    cardFingerprint: computeExternalReferenceCardFingerprint(common),
    styleFingerprint: computeExternalReferenceStyleFingerprint(common),
  });
};
