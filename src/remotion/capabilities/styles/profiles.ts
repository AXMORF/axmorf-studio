import type { ProducerEffectPresetId } from "../effects";
import type { ProducerMotionTreatmentId } from "../motion";
import type { ProducerTransitionSfxRole } from "../sound";
import type { ProducerTransitionPresetId } from "../transitions";
import { producerStyleProfileIds, type ProducerStyleProfileId } from "./profile-ids";

export {
  isProducerStyleProfileId,
  producerStyleProfileIds,
  type ProducerStyleProfileId,
} from "./profile-ids";

export type ProducerStylePalette = {
  readonly background: string;
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly accent: string;
  readonly secondary: string;
};

export type ProducerStyleTypography = {
  readonly headingFamily: string;
  readonly bodyFamily: string;
  readonly headingWeight: number;
  readonly headingCase: "display" | "sentence" | "uppercase";
  readonly headlineScale: "dominant" | "balanced";
};

export type ProducerStyleBackground = {
  readonly treatment: string;
  readonly materials: readonly string[];
};

export type ProducerStyleLayoutGrammar = {
  readonly grammar:
    | "asymmetric-editorial"
    | "panel-sequence"
    | "depth-stage"
    | "terminal-stream"
    | "evidence-led"
    | "diagram-reveal";
  readonly focalStructure: string;
  readonly density: "sparse" | "balanced" | "layered";
  readonly whitespace: "generous" | "structured" | "compressed";
};

export type ProducerStyleMediaRole =
  | "code-diagram"
  | "evidence-image"
  | "evidence-video"
  | "character-sprite"
  | "gltf"
  | "texture"
  | "map"
  | "quote"
  | "svg-drawing";

export type ProducerStyleCaptionTreatment = {
  readonly placement: "bottom-safe" | "lower-third" | "panel-integrated";
  readonly alignment: "left" | "center";
  readonly surface: string;
  readonly emphasis: string;
};

export type ProducerStyleSoundStrategy = {
  readonly signature: string;
  readonly bgm: string;
  readonly ambience: string;
  readonly sfx: string;
  readonly transitionSfx: ProducerTransitionSfxRole;
};

export type ProducerStyleProfile = {
  readonly id: ProducerStyleProfileId;
  readonly label: string;
  readonly useWhen: string;
  readonly palette: ProducerStylePalette;
  readonly typography: ProducerStyleTypography;
  readonly background: ProducerStyleBackground;
  readonly layout: ProducerStyleLayoutGrammar;
  readonly approvedPrimitives: readonly string[];
  readonly approvedBlocks: readonly string[];
  readonly effect: {
    readonly id: ProducerEffectPresetId;
    readonly intensity: "subtle" | "medium" | "bold";
  };
  readonly transitionPreset: {
    readonly id: ProducerTransitionPresetId;
    readonly durationRange: readonly [number, number];
  };
  readonly motion: {
    readonly id: ProducerMotionTreatmentId;
    readonly policy: string;
  };
  readonly mediaMix: readonly ProducerStyleMediaRole[];
  readonly three: {
    readonly policy: "avoid" | "optional" | "preferred";
    readonly rule: string;
  };
  readonly captions: ProducerStyleCaptionTreatment;
  readonly sound: ProducerStyleSoundStrategy;
  readonly forbiddenDefaults: readonly string[];
};

export const producerStyleProfiles = [
  {
    id: "editorial-tech",
    label: "Editorial tech",
    useWhen: "Technical arguments need strong typography, diagrams, and restrained evidence media.",
    palette: {
      background: "#071019",
      surface: "#102536",
      ink: "#f4fbff",
      muted: "#9fb4c6",
      accent: "#55dcff",
      secondary: "#ffcf5a",
    },
    typography: {
      headingFamily: "Noto Sans CJK SC",
      bodyFamily: "Noto Sans CJK SC",
      headingWeight: 900,
      headingCase: "sentence",
      headlineScale: "dominant",
    },
    background: {
      treatment: "Deep editorial field with one measured grid and restrained edge glow.",
      materials: ["fine-grid", "diagram-line", "evidence-window"],
    },
    layout: {
      grammar: "asymmetric-editorial",
      focalStructure: "Large left thesis balanced by one right-side evidence diagram.",
      density: "balanced",
      whitespace: "generous",
    },
    approvedPrimitives: ["AnimatedText", "LineChart", "Kicker"],
    approvedBlocks: ["EvidenceOverlayPanel", "ProducerLocalVideo"],
    effect: { id: "cyber-scan", intensity: "subtle" },
    transitionPreset: { id: "editorial-fade", durationRange: [12, 20] },
    motion: {
      id: "typography-trail",
      policy: "Trail only the thesis entrance; hold diagrams still.",
    },
    mediaMix: ["code-diagram", "evidence-image", "evidence-video"],
    three: {
      policy: "optional",
      rule: "Use depth only when it explains a technical relationship; never as ambient decoration.",
    },
    captions: {
      placement: "bottom-safe",
      alignment: "left",
      surface: "Opaque navy strip with a fine cyan rule.",
      emphasis: "One highlighted technical term per cue.",
    },
    sound: {
      signature: "measured-pulse-and-clean-nodes",
      bgm: "Restrained low pulse with generous midrange space for narration.",
      ambience: "Quiet system room tone.",
      sfx: "Sparse node confirmations and diagram joins.",
      transitionSfx: "soft-whoosh",
    },
    forbiddenDefaults: ["equal-weight dashboard cards", "constant glitch treatment"],
  },
  {
    id: "comic-anime",
    label: "Comic anime",
    useWhen:
      "A high-energy explanation benefits from panels, outlines, speed lines, and existing sprites.",
    palette: {
      background: "#fff1bd",
      surface: "#f9d865",
      ink: "#24162d",
      muted: "#6a3b56",
      accent: "#ff3d6e",
      secondary: "#2b8cff",
    },
    typography: {
      headingFamily: "Noto Sans CJK SC",
      bodyFamily: "Noto Sans CJK SC",
      headingWeight: 900,
      headingCase: "display",
      headlineScale: "dominant",
    },
    background: {
      treatment: "Offset printed panels over halftone paper with directional speed accents.",
      materials: ["halftone", "ink-outline", "speed-line"],
    },
    layout: {
      grammar: "panel-sequence",
      focalStructure: "One dominant angled panel followed by two subordinate reaction beats.",
      density: "layered",
      whitespace: "structured",
    },
    approvedPrimitives: ["TitleSplit", "PoppingText", "PhotoStack"],
    approvedBlocks: ["ProducerAnimatedImage", "EvidenceScreenshotBackdrop"],
    effect: { id: "comic-print", intensity: "bold" },
    transitionPreset: { id: "directional-slide", durationRange: [8, 14] },
    motion: {
      id: "icon-trail",
      policy: "Use short directional accents; keep readable panels stable.",
    },
    mediaMix: ["code-diagram", "character-sprite", "evidence-image"],
    three: {
      policy: "avoid",
      rule: "Prefer drawn perspective and panel staging; use no ornamental 3D camera moves.",
    },
    captions: {
      placement: "panel-integrated",
      alignment: "center",
      surface: "Outlined speech-strip shape with opaque paper fill.",
      emphasis: "Short impact words may use a second accent color.",
    },
    sound: {
      signature: "panel-hits-and-speed-swishes",
      bgm: "Percussive upbeat rhythm with clear narration gaps.",
      ambience: "No continuous ambience unless the depicted place requires it.",
      sfx: "Panel hits, short speed swishes, and restrained impact punctuation.",
      transitionSfx: "directional-whoosh",
    },
    forbiddenDefaults: ["six equal rectangular cards", "continuous camera shake"],
  },
  {
    id: "cinematic-3d",
    label: "Cinematic 3D",
    useWhen:
      "Spatial relationships, scale, depth, materials, or an existing 3D asset carry the story.",
    palette: {
      background: "#030712",
      surface: "#172033",
      ink: "#f8f4ea",
      muted: "#aeb9ca",
      accent: "#ffad5b",
      secondary: "#6be7ff",
    },
    typography: {
      headingFamily: "Noto Sans CJK SC",
      bodyFamily: "Noto Sans CJK SC",
      headingWeight: 800,
      headingCase: "display",
      headlineScale: "balanced",
    },
    background: {
      treatment: "Deep stage with motivated key/rim light, atmosphere, and controlled lens depth.",
      materials: ["matte-metal", "volumetric-haze", "light-rim"],
    },
    layout: {
      grammar: "depth-stage",
      focalStructure:
        "One lit 3D subject owns depth while copy occupies a separate foreground plane.",
      density: "sparse",
      whitespace: "generous",
    },
    approvedPrimitives: ["CinematicTitleIntro", "Starfield", "LetterboxReveal"],
    approvedBlocks: ["ProducerLocalVideo", "ProducerMotionTreatment"],
    effect: { id: "pixel-grid", intensity: "subtle" },
    transitionPreset: { id: "cinematic-film-burn", durationRange: [12, 18] },
    motion: {
      id: "camera-natural",
      policy: "Camera travel must reveal depth and settle before copy.",
    },
    mediaMix: ["gltf", "texture", "evidence-video"],
    three: {
      policy: "preferred",
      rule: "Use code geometry or manifest-backed GLB/glTF with explicit camera, light, material, and texture intent.",
    },
    captions: {
      placement: "bottom-safe",
      alignment: "center",
      surface: "Quiet cinematic band separated from the 3D focal plane.",
      emphasis: "No animated word karaoke; preserve the shot rhythm.",
    },
    sound: {
      signature: "low-cinematic-bed-and-weighted-impacts",
      bgm: "Low cinematic bed with slow harmonic movement.",
      ambience: "Spatial air and room-scale texture matched to the stage.",
      sfx: "Weighted impacts and material movement tied to camera beats.",
      transitionSfx: "impact-bloom",
    },
    forbiddenDefaults: ["unmotivated orbit camera", "decorative 3D behind dense text"],
  },
  {
    id: "retro-terminal",
    label: "Retro terminal",
    useWhen:
      "Commands, system state, debugging, or signal flow should feel procedural and immediate.",
    palette: {
      background: "#020806",
      surface: "#07140e",
      ink: "#b7ffcf",
      muted: "#5aa773",
      accent: "#54ff88",
      secondary: "#ffcf4a",
    },
    typography: {
      headingFamily: "Menlo",
      bodyFamily: "Menlo",
      headingWeight: 800,
      headingCase: "uppercase",
      headlineScale: "balanced",
    },
    background: {
      treatment: "Dark phosphor field with sparse grid, scanlines, and explicit signal windows.",
      materials: ["scanline", "pixel-grid", "phosphor-glow"],
    },
    layout: {
      grammar: "terminal-stream",
      focalStructure: "One command/result stream advances vertically with one active cursor.",
      density: "balanced",
      whitespace: "compressed",
    },
    approvedPrimitives: ["TypewriterSubtitle", "GlitchText", "MatrixRain"],
    approvedBlocks: ["EvidenceOverlayPanel", "ProducerSoundtrack"],
    effect: { id: "cyber-scan", intensity: "bold" },
    transitionPreset: { id: "signal-wipe", durationRange: [8, 16] },
    motion: {
      id: "typography-trail",
      policy: "Trail only fast command changes; results remain crisp.",
    },
    mediaMix: ["code-diagram", "evidence-image"],
    three: {
      policy: "avoid",
      rule: "Represent systems with code, signal paths, and pixel depth rather than ornamental meshes.",
    },
    captions: {
      placement: "bottom-safe",
      alignment: "left",
      surface: "Opaque terminal footer with a fixed prompt marker.",
      emphasis: "Highlight commands and result states, never every word.",
    },
    sound: {
      signature: "clocked-sequence-and-signal-chirps",
      bgm: "Clocked minimal sequence with no broadband wash.",
      ambience: "Low electronic room tone.",
      sfx: "Key confirmations, signal chirps, and one error-state accent.",
      transitionSfx: "signal-sweep",
    },
    forbiddenDefaults: ["fake unreadable code rain", "constant RGB glitch"],
  },
  {
    id: "documentary-media",
    label: "Documentary media",
    useWhen:
      "Source images, video, maps, quotes, and factual context must remain the visual authority.",
    palette: {
      background: "#12171c",
      surface: "#222a31",
      ink: "#f5f0e8",
      muted: "#b7b2aa",
      accent: "#e9b44c",
      secondary: "#7db6d8",
    },
    typography: {
      headingFamily: "Noto Sans CJK SC",
      bodyFamily: "Noto Sans CJK SC",
      headingWeight: 800,
      headingCase: "sentence",
      headlineScale: "balanced",
    },
    background: {
      treatment: "Neutral editorial field that yields to source media, maps, quotes, and captions.",
      materials: ["subtle-grain", "source-frame", "map-line"],
    },
    layout: {
      grammar: "evidence-led",
      focalStructure: "One dominant source frame with a restrained contextual lower third.",
      density: "balanced",
      whitespace: "structured",
    },
    approvedPrimitives: ["LowerThird", "QuoteCard", "KenBurns"],
    approvedBlocks: ["EvidenceScreenshotBackdrop", "ProducerLocalVideo"],
    effect: { id: "paper-grain", intensity: "subtle" },
    transitionPreset: { id: "editorial-fade", durationRange: [15, 24] },
    motion: {
      id: "camera-natural",
      policy: "Use slow source-preserving pushes with explicit context returns.",
    },
    mediaMix: ["evidence-image", "evidence-video", "map", "quote"],
    three: {
      policy: "optional",
      rule: "Use 3D maps or terrain only when sourced evidence requires spatial explanation.",
    },
    captions: {
      placement: "lower-third",
      alignment: "left",
      surface: "Source-safe lower third with explicit attribution space.",
      emphasis: "Prefer names, dates, and source context over decorative emphasis.",
    },
    sound: {
      signature: "observational-bed-and-location-detail",
      bgm: "Restrained observational score that never sentimentalizes evidence.",
      ambience: "Location or room tone tied to the visible source.",
      sfx: "Only factual interface, archive, or location sounds with provenance.",
      transitionSfx: "soft-whoosh",
    },
    forbiddenDefaults: ["fabricated screenshot treatment", "dramatic impact on every cut"],
  },
  {
    id: "hand-drawn-explainer",
    label: "Hand-drawn explainer",
    useWhen:
      "A concept benefits from paper texture, drawn diagrams, rough annotations, and sequential reveals.",
    palette: {
      background: "#f4ead5",
      surface: "#fff8e8",
      ink: "#292624",
      muted: "#746b61",
      accent: "#e7573f",
      secondary: "#287f8f",
    },
    typography: {
      headingFamily: "Noto Sans CJK SC",
      bodyFamily: "Noto Sans CJK SC",
      headingWeight: 800,
      headingCase: "sentence",
      headlineScale: "dominant",
    },
    background: {
      treatment: "Warm paper field with visible fibers, imperfect rules, and diagram annotations.",
      materials: ["paper-fiber", "pencil-line", "marker-accent"],
    },
    layout: {
      grammar: "diagram-reveal",
      focalStructure:
        "One central idea grows through arrows, labels, and a sequential sketch path.",
      density: "sparse",
      whitespace: "generous",
    },
    approvedPrimitives: ["AnimatedText", "TextHighlight", "GeometricPatterns"],
    approvedBlocks: ["EvidenceOverlayPanel", "ProducerLottie"],
    effect: { id: "paper-grain", intensity: "medium" },
    transitionPreset: { id: "directional-slide", durationRange: [12, 20] },
    motion: {
      id: "icon-trail",
      policy: "Reveal arrows and marks sequentially; never wobble body text.",
    },
    mediaMix: ["svg-drawing", "code-diagram", "evidence-image"],
    three: {
      policy: "avoid",
      rule: "Prefer flat SVG diagrams and drawn depth cues over 3D rendering.",
    },
    captions: {
      placement: "bottom-safe",
      alignment: "center",
      surface: "Warm paper strip with dark ink and one marker underline.",
      emphasis: "Underline one concept with a frame-driven SVG stroke.",
    },
    sound: {
      signature: "organic-plucks-and-drawn-marks",
      bgm: "Light organic plucks with open space around narration.",
      ambience: "Very quiet paper and room texture.",
      sfx: "Pencil marks, paper turns, and soft diagram confirmations.",
      transitionSfx: "directional-whoosh",
    },
    forbiddenDefaults: ["perfect UI card grid", "continuous handwritten font body copy"],
  },
] as const satisfies readonly ProducerStyleProfile[];

const requireText = (value: string, label: string): void => {
  if (!value.trim()) throw new Error(`${label} must be non-empty.`);
};

export const assertProducerStyleProfiles = (
  profiles: readonly ProducerStyleProfile[] = producerStyleProfiles,
): void => {
  if (profiles.length !== producerStyleProfileIds.length) {
    throw new Error(`Expected ${producerStyleProfileIds.length} Producer style profiles.`);
  }

  const ids = new Set<ProducerStyleProfileId>();
  const grammars = new Set<ProducerStyleLayoutGrammar["grammar"]>();
  const soundSignatures = new Set<string>();

  for (const profile of profiles) {
    if (!producerStyleProfileIds.includes(profile.id)) {
      throw new Error(`Unknown Producer style profile id: ${String(profile.id)}.`);
    }
    if (ids.has(profile.id)) throw new Error(`Duplicate Producer style profile: ${profile.id}.`);
    ids.add(profile.id);
    grammars.add(profile.layout.grammar);
    soundSignatures.add(profile.sound.signature);

    requireText(profile.label, `${profile.id} label`);
    requireText(profile.useWhen, `${profile.id} useWhen`);
    for (const [key, value] of Object.entries(profile.palette)) {
      requireText(value, `${profile.id} palette.${key}`);
    }
    requireText(profile.typography.headingFamily, `${profile.id} headingFamily`);
    requireText(profile.typography.bodyFamily, `${profile.id} bodyFamily`);
    if (
      !Number.isFinite(profile.typography.headingWeight) ||
      profile.typography.headingWeight <= 0
    ) {
      throw new Error(`${profile.id} headingWeight must be positive.`);
    }
    requireText(profile.background.treatment, `${profile.id} background treatment`);
    requireText(profile.layout.focalStructure, `${profile.id} focalStructure`);
    requireText(profile.motion.policy, `${profile.id} motion policy`);
    requireText(profile.three.rule, `${profile.id} Three.js rule`);
    requireText(profile.captions.surface, `${profile.id} caption surface`);
    requireText(profile.captions.emphasis, `${profile.id} caption emphasis`);
    requireText(profile.sound.signature, `${profile.id} sound signature`);
    requireText(profile.sound.bgm, `${profile.id} BGM strategy`);
    requireText(profile.sound.ambience, `${profile.id} ambience strategy`);
    requireText(profile.sound.sfx, `${profile.id} SFX strategy`);

    for (const [label, values] of [
      ["background materials", profile.background.materials],
      ["approved primitives", profile.approvedPrimitives],
      ["approved blocks", profile.approvedBlocks],
      ["media mix", profile.mediaMix],
      ["forbidden defaults", profile.forbiddenDefaults],
    ] as const) {
      if (values.length === 0 || values.some((value) => !value.trim())) {
        throw new Error(`${profile.id} ${label} must contain non-empty entries.`);
      }
    }
    if (profile.forbiddenDefaults.length < 2) {
      throw new Error(`${profile.id} must declare at least two forbidden defaults.`);
    }
    const [minimum, maximum] = profile.transitionPreset.durationRange;
    if (
      !Number.isInteger(minimum) ||
      !Number.isInteger(maximum) ||
      minimum <= 0 ||
      maximum < minimum
    ) {
      throw new Error(`${profile.id} transition duration range is invalid.`);
    }
  }

  if (grammars.size !== profiles.length) {
    throw new Error("Producer style profiles must use distinct layout grammars.");
  }
  if (soundSignatures.size !== profiles.length) {
    throw new Error("Producer style profiles must use distinct sound signatures.");
  }
};

export const getProducerStyleProfile = (id: ProducerStyleProfileId): ProducerStyleProfile => {
  const profile = producerStyleProfiles.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`Unknown Producer style profile: ${String(id)}.`);
  return profile;
};

assertProducerStyleProfiles();
