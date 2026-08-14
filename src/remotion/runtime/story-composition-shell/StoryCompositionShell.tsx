import type { FC, PropsWithChildren, ReactElement, ReactNode } from "react";
import { Series } from "remotion";

export type StoryCompositionBookend = Readonly<{
  durationInFrames: number;
  content: ReactNode;
}>;

export type StoryCompositionShellProps = PropsWithChildren<{
  readonly bodyDurationInFrames: number;
  readonly intro?: StoryCompositionBookend;
  readonly outro?: StoryCompositionBookend;
}>;

const assertDuration = (durationInFrames: number, label: string) => {
  if (!Number.isSafeInteger(durationInFrames) || durationInFrames <= 0) {
    throw new Error(`${label} duration must be a positive safe integer.`);
  }
};

export const StoryCompositionShell: FC<StoryCompositionShellProps> = ({
  intro,
  bodyDurationInFrames,
  children,
  outro,
}) => {
  assertDuration(bodyDurationInFrames, "Body");
  if (intro !== undefined) {
    assertDuration(intro.durationInFrames, "Intro");
  }
  if (outro !== undefined) {
    assertDuration(outro.durationInFrames, "Outro");
  }

  const sequences: ReactElement[] = [];
  if (intro !== undefined) {
    sequences.push(
      <Series.Sequence
        key="fixed-intro"
        durationInFrames={intro.durationInFrames}
      >
        {intro.content}
      </Series.Sequence>,
    );
  }
  sequences.push(
    <Series.Sequence key="story-body" durationInFrames={bodyDurationInFrames}>
      {children}
    </Series.Sequence>,
  );
  if (outro !== undefined) {
    sequences.push(
      <Series.Sequence
        key="fixed-outro"
        durationInFrames={outro.durationInFrames}
      >
        {outro.content}
      </Series.Sequence>,
    );
  }

  return <Series>{sequences}</Series>;
};
