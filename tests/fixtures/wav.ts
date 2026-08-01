export const createRawPcmFixture = (samples: readonly number[]): Buffer => {
  const raw = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => raw.writeInt16LE(sample, index * 2));
  return raw;
};

export const createWavFixture = ({
  rawPcm,
  audioFormat = 1,
  channels = 1,
  sampleRate = 48_000,
  bitsPerSample = 16,
}: {
  readonly rawPcm: Buffer;
  readonly audioFormat?: number;
  readonly channels?: number;
  readonly sampleRate?: number;
  readonly bitsPerSample?: number;
}): Buffer => {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const wav = Buffer.alloc(44 + rawPcm.length);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + rawPcm.length, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(audioFormat, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(rawPcm.length, 40);
  wav.set(Uint8Array.from(rawPcm), 44);
  return wav;
};
