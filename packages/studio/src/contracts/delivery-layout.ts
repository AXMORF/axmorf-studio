import { StoryIdSchema } from "./primitives";

/** Fixed public delivery layout, shared by writers, inspectors and consumers. */
export const DELIVERY_FILES = Object.freeze({
  video: "video.mp4",
  cover4x3: "cover-4x3.png",
  cover3x4: "cover-3x4.png",
  publish: "publish.json",
} as const);

export const DELIVERY_FILE_NAMES = Object.freeze(
  Object.values(DELIVERY_FILES).sort(),
);

export type DeliveryArtifactKind = Exclude<
  keyof typeof DELIVERY_FILES,
  "publish"
>;

export const deliveryArtifactPath = (
  storyId: string,
  artifact: DeliveryArtifactKind,
) => `deliveries/${StoryIdSchema.parse(storyId)}/${DELIVERY_FILES[artifact]}`;
