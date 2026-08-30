import assert from "node:assert/strict";
import test from "node:test";

import { parseDevLanFlag } from "../../scripts/dev/cli";
import {
  isLanDevEnabled,
  isSameOriginSettingsWrite,
} from "../../settings/server/dev-network";
import {
  buildStudioUrl,
  isLanAccessHostname,
  resolveStudioUrl,
} from "../../settings/client/network";

test("LAN development mode is explicit and fail-closed", () => {
  assert.equal(parseDevLanFlag([]), false);
  assert.equal(parseDevLanFlag(["--lan"]), true);
  assert.throws(() => parseDevLanFlag(["--host", "0.0.0.0"]), /--lan/iu);
  assert.equal(isLanDevEnabled({ RSP_DEV_LAN: "1" }), true);
  assert.equal(isLanDevEnabled({ RSP_DEV_LAN: "0" }), false);
});

test("settings writes accept the exact browser origin on loopback or LAN", () => {
  assert.equal(
    isSameOriginSettingsWrite({
      origin: "http://192.168.50.6:3100",
      host: "192.168.50.6:3100",
    }),
    true,
  );
  assert.equal(
    isSameOriginSettingsWrite({
      origin: "http://127.0.0.1:3100",
      host: "127.0.0.1:3100",
    }),
    true,
  );
  assert.equal(
    isSameOriginSettingsWrite({
      origin: "http://attacker.invalid:3100",
      host: "192.168.50.6:3100",
    }),
    false,
  );
});

test("the config page keeps the current LAN host when linking to Studio", () => {
  assert.equal(
    buildStudioUrl("http://192.168.50.6:3100/somewhere?x=1#hash"),
    "http://192.168.50.6:3101/",
  );
  assert.equal(isLanAccessHostname("192.168.50.6"), true);
  assert.equal(isLanAccessHostname("127.0.0.1"), false);
  assert.equal(
    resolveStudioUrl("http://127.0.0.1:3100/", "http://127.0.0.1:43101/"),
    "http://127.0.0.1:43101/",
  );
  assert.equal(
    resolveStudioUrl("http://127.0.0.1:3100/", "__AXMORF_STUDIO_URL__"),
    "http://127.0.0.1:3101/",
  );
});
