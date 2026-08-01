import { createHash } from "node:crypto";

import { Sha256DigestSchema, type Sha256Digest } from "./primitives";

export const FINGERPRINT_ALGORITHM_ID = "sha256-canonical-json-v1" as const;

const serialize = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Canonical JSON accepts finite numbers only.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value))
        throw new Error("Canonical JSON does not accept sparse arrays.");
    }
    return `[${value.map((item) => serialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Canonical JSON accepts plain objects only.");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error("Canonical JSON does not accept symbol keys.");
    }
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
    );
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${serialize(entryValue)}`,
      )
      .join(",")}}`;
  }
  throw new Error(`Canonical JSON does not accept ${typeof value}.`);
};

export const serializeCanonicalJson = (value: unknown): string =>
  serialize(value);

export const createFingerprint = ({
  namespace,
  version,
  value,
}: {
  readonly namespace: string;
  readonly version: number;
  readonly value: unknown;
}): Sha256Digest => {
  if (!namespace.trim())
    throw new Error("Fingerprint namespace must be non-empty.");
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error("Fingerprint version must be a positive safe integer.");
  }
  const canonical = serializeCanonicalJson({ namespace, value, version });
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
  );
};
