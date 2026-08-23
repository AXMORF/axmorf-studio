import { dirname } from "node:path";

import { RSP_MAX_REQUEST_BYTES } from "../contracts/protocol";
import { executeRspCli } from "./client";

const readStdin = async () => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > RSP_MAX_REQUEST_BYTES) {
      throw new Error("rsp-stdin-too-large");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
};

void executeRspCli(process.argv.slice(2), dirname(process.execPath), {
  stdin: readStdin,
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
}).then((exitCode) => {
  process.exitCode = exitCode;
});
