import { verifyDesktopBuildInventory } from "./package-inventory";

const inventory = verifyDesktopBuildInventory();
process.stdout.write(`${JSON.stringify(inventory)}\n`);
