import { buildDeliveryMediaPath } from "../../../../packages/studio/src/web/delivery-route";
import type { ProjectProductionProgress } from "../../../contracts/api";

/* eslint-disable @remotion/warn-native-media-tag -- This browser-only viewer is not mounted in a Remotion composition. */

type CurrentDelivery = NonNullable<ProjectProductionProgress["delivery"]>;

export const DeliveryViewer = ({
  projectId,
  delivery,
}: {
  readonly projectId: string;
  readonly delivery: CurrentDelivery;
}) => {
  if (!delivery.current) return null;
  const mediaInput = {
    projectId,
    deliveryBuildId: delivery.deliveryBuildId,
  } as const;
  const videoUrl = buildDeliveryMediaPath({ ...mediaInput, kind: "video" });
  const cover4x3Url = buildDeliveryMediaPath({
    ...mediaInput,
    kind: "cover-4x3",
  });
  const cover3x4Url = buildDeliveryMediaPath({
    ...mediaInput,
    kind: "cover-3x4",
  });

  return (
    <section
      className="delivery-viewer"
      aria-label={`${projectId} 当前交付预览`}
    >
      <div className="delivery-viewer-heading">
        <div>
          <span>CURRENT DELIVERY</span>
          <strong>当前交付预览</strong>
        </div>
        <code>{delivery.deliveryBuildId}</code>
      </div>
      <video
        key={`${delivery.deliveryBuildId}:video`}
        controls
        preload="metadata"
        src={videoUrl}
      >
        当前浏览器无法播放此视频。
      </video>
      <div className="delivery-cover-grid">
        <figure>
          <img
            key={`${delivery.deliveryBuildId}:cover-4x3`}
            alt={`${projectId} 4:3 封面`}
            decoding="async"
            loading="lazy"
            src={cover4x3Url}
          />
          <figcaption>Cover 4:3</figcaption>
        </figure>
        <figure>
          <img
            key={`${delivery.deliveryBuildId}:cover-3x4`}
            alt={`${projectId} 3:4 封面`}
            decoding="async"
            loading="lazy"
            src={cover3x4Url}
          />
          <figcaption>Cover 3:4</figcaption>
        </figure>
      </div>
    </section>
  );
};
