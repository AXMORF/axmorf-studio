import { join } from "node:path";

import { VoiceProfileIdSchema } from "@axmorf/studio/contracts";
import {
  migrateVoxcpmPrivateConfigFile,
  VoxcpmPrivateConfigMigrationBlocker,
} from "./adapters/private-config-migration";

const configPath =
  process.env.RSP_VOXCPM_PRIVATE_CONFIG?.trim() ||
  join(process.cwd(), "voxcpm", "voxcpm.private.json");

const main = async () => {
  try {
    const args = process.argv.slice(2);
    if (
      (args.length !== 2 && args.length !== 3) ||
      args[0] !== "--profile" ||
      (args.length === 3 && args[2] !== "--confirm-adjacent-transcript")
    ) {
      throw new Error(
        "Expected --profile <voice-profile-id> [--confirm-adjacent-transcript].",
      );
    }
    const targetProfileId = VoiceProfileIdSchema.parse(args[1]);
    const result = await migrateVoxcpmPrivateConfigFile({
      configPath,
      targetProfileId,
      confirmAdjacentTranscript: args[2] === "--confirm-adjacent-transcript",
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (error instanceof VoxcpmPrivateConfigMigrationBlocker) {
      process.stderr.write(`${error.code}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write("VOXCPM_PRIVATE_CONFIG_MIGRATION_FAILED\n");
      process.exitCode = 1;
    }
  }
};

void main();
