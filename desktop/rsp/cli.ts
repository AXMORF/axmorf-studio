import { executeRspCli } from "./client";

void executeRspCli(process.argv.slice(2), __dirname, {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
}).then((exitCode) => {
  process.exitCode = exitCode;
});
