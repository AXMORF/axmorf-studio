import { buildDeliveryMediaPath } from "../../../../packages/studio/src/web/delivery-route";

/* eslint-disable @remotion/warn-native-media-tag -- This browser-only viewer is not mounted in a Remotion composition. */

export const DeliveryViewer = ({
  filmId,
  deliveredAt,
}: {
  readonly filmId: string;
  readonly deliveredAt: string;
}) => {
  // The delivery time changes on every new delivery, so it keys the media elements.
  const url = (kind: "video" | "cover-4x3" | "cover-3x4") =>
    `${buildDeliveryMediaPath({ filmId, kind })}?at=${encodeURIComponent(deliveredAt)}`;
  return (
    <section className="delivery-viewer" aria-label={`${filmId} 当前交付预览`}>
      <div className="delivery-viewer-heading">
        <div>
          <span>CURRENT DELIVERY</span>
          <strong>当前交付预览</strong>
        </div>
        <code>{deliveredAt}</code>
      </div>
      <video
        key={`${deliveredAt}:video`}
        controls
        preload="metadata"
        src={url("video")}
      >
        当前浏览器无法播放此视频。
      </video>
      <div className="delivery-cover-grid">
        <figure>
          <img
            key={`${deliveredAt}:cover-4x3`}
            alt={`${filmId} 4:3 封面`}
            decoding="async"
            loading="lazy"
            src={url("cover-4x3")}
          />
          <figcaption>Cover 4:3</figcaption>
        </figure>
        <figure>
          <img
            key={`${deliveredAt}:cover-3x4`}
            alt={`${filmId} 3:4 封面`}
            decoding="async"
            loading="lazy"
            src={url("cover-3x4")}
          />
          <figcaption>Cover 3:4</figcaption>
        </figure>
      </div>
    </section>
  );
};
