import { createHash } from "node:crypto";

export const RUNTIME_POLICY_MANIFEST_VERSION = "npm-runtime-policy-v1" as const;

export const RUNTIME_POLICY_SCOPES = [
  "composition",
  "delivery",
  "global-visual",
  "scene",
] as const;

export type RuntimePolicyScope = (typeof RUNTIME_POLICY_SCOPES)[number];

export type RuntimePolicyManifestFile = Readonly<{
  logicalPath: string;
  checksum: `sha256:${string}`;
  sizeBytes: number;
  scopes: readonly RuntimePolicyScope[];
}>;

export type RuntimePolicyManifest = Readonly<{
  schemaVersion: 1;
  policyVersion: typeof RUNTIME_POLICY_MANIFEST_VERSION;
  packageName: "@axmorf/studio";
  packageVersion: string;
  publicExports: readonly ["./contracts", "./remotion"];
  files: readonly RuntimePolicyManifestFile[];
}>;

export type RuntimePolicySourceFile = Readonly<{
  logicalPath: string;
  bytes: Uint8Array;
  scopes: readonly RuntimePolicyScope[];
}>;

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PACKAGE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const assertExactKeys = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
) => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} has an invalid exact field set.`);
  }
};

const parseLogicalPath = (value: unknown) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("Runtime policy logical path is invalid.");
  }
  return value;
};

const parseScopes = (value: unknown): readonly RuntimePolicyScope[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Runtime policy file scopes are missing.");
  }
  const scopes = value.map((scope) => {
    if (
      typeof scope !== "string" ||
      !(RUNTIME_POLICY_SCOPES as readonly string[]).includes(scope)
    ) {
      throw new Error("Runtime policy file scope is invalid.");
    }
    return scope as RuntimePolicyScope;
  });
  const canonical = [...scopes].sort();
  if (
    new Set(scopes).size !== scopes.length ||
    scopes.some((scope, index) => scope !== canonical[index])
  ) {
    throw new Error("Runtime policy file scopes must be sorted and unique.");
  }
  return scopes;
};

const parseFile = (raw: unknown): RuntimePolicyManifestFile => {
  if (!isRecord(raw)) throw new Error("Runtime policy file is malformed.");
  assertExactKeys(
    raw,
    ["logicalPath", "checksum", "sizeBytes", "scopes"],
    "Runtime policy file",
  );
  const logicalPath = parseLogicalPath(raw.logicalPath);
  if (typeof raw.checksum !== "string" || !SHA256_PATTERN.test(raw.checksum)) {
    throw new Error("Runtime policy file checksum is invalid.");
  }
  if (
    typeof raw.sizeBytes !== "number" ||
    !Number.isSafeInteger(raw.sizeBytes) ||
    raw.sizeBytes < 0
  ) {
    throw new Error("Runtime policy file size is invalid.");
  }
  return {
    logicalPath,
    checksum: raw.checksum as `sha256:${string}`,
    sizeBytes: raw.sizeBytes,
    scopes: parseScopes(raw.scopes),
  };
};

export const parseRuntimePolicyManifest = (
  raw: unknown,
): RuntimePolicyManifest => {
  if (!isRecord(raw)) throw new Error("Runtime policy manifest is malformed.");
  assertExactKeys(
    raw,
    [
      "schemaVersion",
      "policyVersion",
      "packageName",
      "packageVersion",
      "publicExports",
      "files",
    ],
    "Runtime policy manifest",
  );
  if (
    raw.schemaVersion !== 1 ||
    raw.policyVersion !== RUNTIME_POLICY_MANIFEST_VERSION ||
    raw.packageName !== "@axmorf/studio" ||
    typeof raw.packageVersion !== "string" ||
    !PACKAGE_VERSION_PATTERN.test(raw.packageVersion) ||
    !Array.isArray(raw.publicExports) ||
    raw.publicExports.length !== 2 ||
    raw.publicExports[0] !== "./contracts" ||
    raw.publicExports[1] !== "./remotion" ||
    !Array.isArray(raw.files) ||
    raw.files.length === 0
  ) {
    throw new Error("Runtime policy manifest identity is invalid.");
  }
  const files = raw.files.map(parseFile);
  const canonical = [...files].sort((left, right) =>
    left.logicalPath.localeCompare(right.logicalPath),
  );
  if (
    new Set(files.map(({ logicalPath }) => logicalPath)).size !==
      files.length ||
    files.some(
      ({ logicalPath }, index) => logicalPath !== canonical[index]?.logicalPath,
    )
  ) {
    throw new Error("Runtime policy files must be sorted and unique.");
  }
  return {
    schemaVersion: 1,
    policyVersion: RUNTIME_POLICY_MANIFEST_VERSION,
    packageName: "@axmorf/studio",
    packageVersion: raw.packageVersion,
    publicExports: ["./contracts", "./remotion"],
    files,
  };
};

const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

export const buildRuntimePolicyManifest = ({
  packageVersion,
  files: sourceFiles,
}: {
  readonly packageVersion: string;
  readonly files: readonly RuntimePolicySourceFile[];
}): RuntimePolicyManifest =>
  parseRuntimePolicyManifest({
    schemaVersion: 1,
    policyVersion: RUNTIME_POLICY_MANIFEST_VERSION,
    packageName: "@axmorf/studio",
    packageVersion,
    publicExports: ["./contracts", "./remotion"],
    files: sourceFiles
      .map((file) => ({
        logicalPath: file.logicalPath,
        checksum: checksum(file.bytes),
        sizeBytes: file.bytes.byteLength,
        scopes: [...file.scopes].sort(),
      }))
      .sort((left, right) => left.logicalPath.localeCompare(right.logicalPath)),
  });

export const serializeRuntimePolicyManifest = (
  manifest: RuntimePolicyManifest,
) => `${JSON.stringify(parseRuntimePolicyManifest(manifest), null, 2)}\n`;

export const selectRuntimePolicyFiles = (
  manifest: RuntimePolicyManifest,
  scope: RuntimePolicyScope | null,
) => {
  const parsed = parseRuntimePolicyManifest(manifest);
  return scope === null
    ? parsed.files
    : parsed.files.filter((file) => file.scopes.includes(scope));
};
