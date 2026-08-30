export const DELIVERY_MEDIA_KINDS = [
  "video",
  "cover-4x3",
  "cover-3x4",
] as const;

export type DeliveryMediaKind = (typeof DELIVERY_MEDIA_KINDS)[number];

export type DeliveryMediaRequest = Readonly<{
  projectId: string;
  deliveryBuildId: string;
  kind: DeliveryMediaKind;
}>;

const routePattern = new RegExp(
  `^/api/delivery/([a-z0-9]+(?:-[a-z0-9]+)*)/(delivery-[0-9a-f]{64})/(${DELIVERY_MEDIA_KINDS.join("|")})$`,
  "u",
);

export const buildDeliveryMediaPath = ({
  projectId,
  deliveryBuildId,
  kind,
}: DeliveryMediaRequest) => {
  StoryIdSchema.parse(projectId);
  DeliveryBuildIdSchema.parse(deliveryBuildId);
  if (!DELIVERY_MEDIA_KINDS.includes(kind)) {
    throw new Error("Delivery media kind is invalid.");
  }
  return `/api/delivery/${projectId}/${deliveryBuildId}/${kind}`;
};

export const parseDeliveryMediaPath = (
  pathname: string,
): DeliveryMediaRequest | null => {
  const match = routePattern.exec(pathname);
  if (match === null) return null;
  const [, projectId, deliveryBuildId, kind] = match;
  if (
    projectId === undefined ||
    deliveryBuildId === undefined ||
    kind === undefined
  ) {
    return null;
  }
  const parsedProjectId = StoryIdSchema.safeParse(projectId);
  const parsedDeliveryBuildId =
    DeliveryBuildIdSchema.safeParse(deliveryBuildId);
  if (!parsedProjectId.success || !parsedDeliveryBuildId.success) return null;
  return {
    projectId: parsedProjectId.data,
    deliveryBuildId: parsedDeliveryBuildId.data,
    kind: kind as DeliveryMediaKind,
  };
};
import { DeliveryBuildIdSchema } from "../contracts/delivery-build";
import { StoryIdSchema } from "../contracts/primitives";
