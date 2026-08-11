const URL_PATTERN = /https?:\/\/[^\s)\]}]+/giu;
const BEARER_PATTERN = /Bearer\s+[^\s,;]+/giu;
const WINDOWS_PATH_PATTERN = /[A-Za-z]:\\[^\s,;]+/gu;
const UNIX_PATH_PATTERN =
  /\/(?:home|data|srv|tmp|Users|var|etc|opt)\/[^\s,;]+/gu;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|TOKEN|SECRET|PASSWORD|PROVIDER[_-]?ENDPOINT)\s*[=:]\s*[^\s,;]+/giu;
const STACK_FRAME_PATTERN = /^\s*at\s+.*$/gimu;

const extractMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error || fallback;
  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message || fallback;
  }
  return fallback;
};

export const redactProductionErrorDescription = ({
  error,
  fallback,
  maximumLength = 1_200,
}: {
  readonly error: unknown;
  readonly fallback: string;
  readonly maximumLength?: number;
}): { readonly description: string; readonly redactionApplied: boolean } => {
  const raw = extractMessage(error, fallback).trim();
  let description = raw;
  description = description.replace(STACK_FRAME_PATTERN, " ");
  description = description.replace(BEARER_PATTERN, "[redacted-credential]");
  description = description.replace(URL_PATTERN, "[redacted-url]");
  description = description.replace(
    SECRET_ASSIGNMENT_PATTERN,
    "[redacted-secret]",
  );
  description = description.replace(WINDOWS_PATH_PATTERN, "[redacted-path]");
  description = description.replace(UNIX_PATH_PATTERN, "[redacted-path]");
  description = description.split(/\r?\n/u, 1)[0].replace(/\s+/gu, " ").trim();
  if (description.length > maximumLength) {
    description = `${description.slice(0, Math.max(1, maximumLength - 1)).trimEnd()}…`;
  }
  if (!description) description = fallback;
  return {
    description,
    redactionApplied: description !== raw,
  };
};
