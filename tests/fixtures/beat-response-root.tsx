import { Composition, registerRoot } from "remotion";
import { BeatResponseGallery } from "../../packages/studio/src/remotion/compositions/capability-gallery/BeatResponseGallery";

registerRoot(() => (
  <>
    <Composition
      id="Varied"
      component={BeatResponseGallery}
      defaultProps={{ globalOnly: false }}
      durationInFrames={180}
      fps={30}
      width={960}
      height={540}
    />
    <Composition
      id="GlobalOnly"
      component={BeatResponseGallery}
      defaultProps={{ globalOnly: true }}
      durationInFrames={180}
      fps={30}
      width={960}
      height={540}
    />
  </>
));
