import type { ProcessRunner } from "../../baseline/evidence";
import type { checkProductionRenderReady } from "../../production/application/render-ready";
import type { launchDetachedRemotionRender } from "../adapters/render-launch";

export type DeliveryApplicationDependencies = Readonly<{
  runProcess?: ProcessRunner;
  checkRenderReady?: typeof checkProductionRenderReady;
  launchRender?: typeof launchDetachedRemotionRender;
  clock?: () => Date;
}>;
