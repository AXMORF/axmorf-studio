import { FilmIdSchema } from "../contracts/film";

export const DELIVERY_MEDIA_KINDS = [
  "video",
  "cover-4x3",
  "cover-3x4",
] as const;

export type DeliveryMediaKind = (typeof DELIVERY_MEDIA_KINDS)[number];

export type DeliveryMediaRequest = Readonly<{
  filmId: string;
  kind: DeliveryMediaKind;
}>;

const routePattern = new RegExp(
  `^/api/films/([a-z0-9]+(?:-[a-z0-9]+)*)/(${DELIVERY_MEDIA_KINDS.join("|")})$`,
  "u",
);

export const buildDeliveryMediaPath = ({
  filmId,
  kind,
}: DeliveryMediaRequest) => {
  FilmIdSchema.parse(filmId);
  if (!DELIVERY_MEDIA_KINDS.includes(kind)) {
    throw new Error("Delivery media kind is invalid.");
  }
  return `/api/films/${filmId}/${kind}`;
};

export const parseDeliveryMediaPath = (
  pathname: string,
): DeliveryMediaRequest | null => {
  const match = routePattern.exec(pathname);
  if (match === null) return null;
  const [, filmId, kind] = match;
  if (filmId === undefined || kind === undefined) return null;
  const parsed = FilmIdSchema.safeParse(filmId);
  if (!parsed.success) return null;
  return { filmId: parsed.data, kind: kind as DeliveryMediaKind };
};
