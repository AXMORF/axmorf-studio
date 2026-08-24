import { z } from "zod";

export const RspFieldIssueSchema = z
  .strictObject({
    path: z.string().min(1).max(512),
    code: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    message: z.string().min(1).max(500),
    ownerAction: z.string().min(1).max(500).optional(),
  })
  .readonly();

export type RspFieldIssue = z.infer<typeof RspFieldIssueSchema>;

export type RspPublicCommandFailureCode =
  | "rsp-command-failed"
  | "rsp-conflict";

export class RspPublicCommandError extends Error {
  readonly code: RspPublicCommandFailureCode;
  readonly issues: readonly RspFieldIssue[];

  constructor(
    code: RspPublicCommandFailureCode,
    message: string,
    issues: readonly RspFieldIssue[] = [],
  ) {
    super(message);
    this.code = code;
    this.issues = z.array(RspFieldIssueSchema).max(50).parse(issues);
  }
}

export const rspIssuePath = (path: readonly PropertyKey[]) =>
  path.reduce<string>((result, segment) => {
    if (typeof segment === "number") return `${result}[${segment}]`;
    const value = String(segment);
    return result === "$" ? `$.${value}` : `${result}.${value}`;
  }, "$" as string);

export const rspZodIssues = ({
  error,
  codePrefix,
  ownerAction,
}: {
  readonly error: z.ZodError;
  readonly codePrefix: string;
  readonly ownerAction?: string;
}): readonly RspFieldIssue[] =>
  z
    .array(RspFieldIssueSchema)
    .max(50)
    .parse(
      error.issues.slice(0, 50).map((issue) => ({
        path: rspIssuePath(issue.path),
        code: `${codePrefix}-${issue.code.replaceAll("_", "-")}`,
        message: issue.message,
        ...(ownerAction === undefined ? {} : { ownerAction }),
      })),
    );
