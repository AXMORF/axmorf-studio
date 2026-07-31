export const assertProducerLocalMediaPath = (src: string, label = "media src"): void => {
  if (
    !src.trim() ||
    src.startsWith("/") ||
    src.includes("\\") ||
    src.split("/").some((part) => part === "." || part === "..") ||
    /^https?:\/\//iu.test(src)
  ) {
    throw new Error(`${label} must be a repository-local public path.`);
  }
};

export const requirePositiveFiniteMediaNumber = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
};
