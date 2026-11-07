export declare const usesStoryboardScore: (
  recipe: Record<string, unknown>,
) => boolean;
export declare const scoreOnsets: (
  timeline: Record<string, unknown>,
) => Record<
  "kick" | "snare" | "clap" | "hat" | "bass" | "hits" | "sections",
  number[]
>;
