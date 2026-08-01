import type { FC, ReactNode } from "react";

export type CompositionAssemblyProps = {
  readonly narrativeCore: ReactNode;
};

export const CompositionAssembly: FC<CompositionAssemblyProps> = ({
  narrativeCore,
}) => <>{narrativeCore}</>;
