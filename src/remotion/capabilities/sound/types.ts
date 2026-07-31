import type { ProducerTransitionPresetId } from "../transitions";

export type ProducerSoundRole = "narration" | "bgm" | "ambience" | "sfx";

export type ProducerNarrationWindow = {
  readonly startFrame: number;
  readonly endFrame: number;
};

export type ProducerSoundLibraryEntry = {
  readonly id: string;
  readonly role: ProducerSoundRole;
  readonly src: string;
  readonly license: string;
  readonly durationInSeconds: number;
};

export type ProducerSoundLibrary = Readonly<
  Record<ProducerSoundRole, readonly ProducerSoundLibraryEntry[]>
>;

export type ProducerBedTrack = {
  readonly id: string;
  readonly src: string;
  readonly volume: number;
};

export type ProducerSfxCue = {
  readonly id: string;
  readonly src: string;
  readonly from: number;
  readonly durationInFrames: number;
  readonly volume: number;
  readonly transitionId?: ProducerTransitionPresetId;
};
