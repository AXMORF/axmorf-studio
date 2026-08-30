#!/usr/bin/env node

import process from "node:process";

import { runCli } from "../src/index.js";

try {
  await runCli(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
