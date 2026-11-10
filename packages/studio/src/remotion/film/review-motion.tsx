import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import type { FilmReviewMotionEvent } from "../../contracts/film";

type Registry = {
  events: Map<string, FilmReviewMotionEvent>;
  truncated: boolean;
  bytes: number;
};
const ReviewMotionContext = createContext<Registry | null>(null);
/** Fresh for each review index. Outside review this context is absent. */
export const ReviewMotionProvider = ({
  children,
}: {
  readonly children: ReactNode;
}) => {
  const registry = useRef<Registry>({
    events: new Map(),
    truncated: false,
    bytes: 0,
  });
  return (
    <ReviewMotionContext.Provider value={registry.current}>
      {children}
    </ReviewMotionContext.Provider>
  );
};
export const useReviewMotionRegistry = () => useContext(ReviewMotionContext);
export const useReviewMotion = (event: FilmReviewMotionEvent) => {
  const registry = useReviewMotionRegistry();
  useLayoutEffect(() => {
    if (!registry) return;
    const key = JSON.stringify(event);
    if (registry.events.has(key)) return;
    const bytes = new TextEncoder().encode(key).length;
    // 48 CLI frames × <=16 KiB stays below the bounded stderr tail (1 MiB).
    if (registry.events.size >= 120 || registry.bytes + bytes > 16_000) {
      registry.truncated = true;
      return;
    }
    registry.events.set(key, event);
    registry.bytes += bytes;
  }, [registry, event]);
};
