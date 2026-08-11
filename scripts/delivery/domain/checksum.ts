import { createHash } from "node:crypto";

import { Sha256DigestSchema } from "../../../src/contracts";

export const checksumDeliveryBytes = (bytes: Uint8Array) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  );
