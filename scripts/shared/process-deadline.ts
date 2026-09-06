import { AsyncLocalStorage } from "node:async_hooks";

const deadlines = new AsyncLocalStorage<number>();

export const withProcessDeadline = <T>(
  deadlineMs: number,
  operation: () => Promise<T>,
): Promise<T> => {
  if (!Number.isSafeInteger(deadlineMs))
    throw new Error("Process deadline must be an absolute integer timestamp.");
  const inherited = deadlines.getStore();
  return deadlines.run(
    inherited === undefined ? deadlineMs : Math.min(inherited, deadlineMs),
    operation,
  );
};

export const hasProcessDeadline = (): boolean =>
  deadlines.getStore() !== undefined;

export const resolveProcessTimeout = (timeoutMs = 15 * 60_000): number => {
  const deadline = deadlines.getStore();
  if (deadline === undefined) return timeoutMs;
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0)
    throw new Error(
      "Production deadline exceeded before media process could start.",
    );
  return Math.min(timeoutMs, remainingMs);
};
