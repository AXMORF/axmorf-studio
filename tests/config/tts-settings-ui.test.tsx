import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Tts } from "../../settings/client/features/config/TtsSettings";
import { parseEditableConfig } from "../../settings/contracts/api";
import { buildProducerConfig } from "@axmorf/studio/contracts";
import { validProducerConfigInput } from "../contracts/producer-config.test";

test("Edge voices render as a catalog selector with derived locale", () => {
  const config = parseEditableConfig(
    buildProducerConfig({
      ...validProducerConfigInput,
      tts: {
        ...validProducerConfigInput.tts,
        defaultProviderId: "edge-free",
        defaultVoiceProfileId: "edge-voice",
        providers: [
          {
            id: "edge-free",
            kind: "edge-tts",
            service: "microsoft-edge-read-aloud",
            name: "Edge free",
            connection: { timeoutMs: 60_000 },
            modelId: "edge-read-aloud",
            voiceProfiles: [
              {
                id: "edge-voice",
                name: "晓晓",
                voiceId: "zh-CN-XiaoxiaoNeural",
                locale: "zh-CN",
              },
            ],
          },
        ],
      },
    }),
  );

  const markup = renderToStaticMarkup(
    <Tts config={config} update={() => undefined} />,
  );

  assert.match(
    markup,
    /<select[^>]*><option value="zh-CN-XiaoxiaoNeural" selected="">晓晓（女） · zh-CN<\/option>/u,
  );
  assert.match(markup, /value="zh-HK-HiuMaanNeural"/u);
  assert.match(markup, /value="zh-TW-HsiaoYuNeural"/u);
  assert.doesNotMatch(markup, /<input[^>]*value="zh-CN-XiaoxiaoNeural"/u);
  assert.match(
    markup,
    /<input readOnly="" aria-readonly="true" value="zh-CN"/u,
  );
});
