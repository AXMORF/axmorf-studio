import { createHash } from "node:crypto";
import ts from "typescript";

import type { Sha256Digest } from "../../../src/contracts";

export const fingerprintSceneRendererSource = (
  source: string,
): Sha256Digest => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.JSX,
    source.replace(/^\uFEFF/u, ""),
  );
  const hash = createHash("sha256");
  for (;;) {
    const kind = scanner.scan();
    if (kind === ts.SyntaxKind.EndOfFileToken) break;
    const token = scanner.getTokenText();
    hash.update(String(kind));
    hash.update(":");
    hash.update(String(Buffer.byteLength(token)));
    hash.update(":");
    hash.update(token);
    hash.update("\n");
  }
  return `sha256:${hash.digest("hex")}` as Sha256Digest;
};
