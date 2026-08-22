export type CloseIntent = "window-close" | "explicit-quit" | "system-quit";

export type ClosePolicyDecision =
  | "hide-window"
  | "confirm-quit"
  | "shutdown-and-quit";

export const resolveClosePolicy = ({
  activeWork,
  intent,
}: Readonly<{
  activeWork: boolean;
  intent: CloseIntent;
}>): ClosePolicyDecision => {
  if (activeWork && intent === "window-close") return "hide-window";
  if (activeWork && intent === "explicit-quit") return "confirm-quit";
  return "shutdown-and-quit";
};

export const shouldQuitAfterConfirmation = (
  decision: ClosePolicyDecision,
  confirmed: boolean,
) =>
  decision === "shutdown-and-quit" ||
  (decision === "confirm-quit" && confirmed);
