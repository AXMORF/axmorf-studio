export type ProducerSoundLibraryRole = "background-music" | "sound-effect";

export type ProducerSoundLibraryEntry = {
  readonly id: string;
  readonly role: ProducerSoundLibraryRole;
  readonly publicPath: string;
  readonly license: string;
  readonly durationInSeconds: number;
};

export type ProducerSoundLibrary = Readonly<
  Record<ProducerSoundLibraryRole, readonly ProducerSoundLibraryEntry[]>
>;

export type ProducerSoundContribution = {
  readonly contributionId: string;
  readonly publicPath: string;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly volume: number;
  readonly loop: boolean;
};
