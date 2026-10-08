export const measurePcmLag = ({
  reference,
  decoded,
  startSample,
  endSample,
  maxLagSamples,
}: {
  readonly reference: Buffer;
  readonly decoded: Buffer;
  readonly startSample: number;
  readonly endSample: number;
  readonly maxLagSamples: number;
}) => {
  if (
    reference.length % 2 !== 0 ||
    decoded.length % 2 !== 0 ||
    ![startSample, endSample, maxLagSamples].every(Number.isSafeInteger) ||
    maxLagSamples < 0 ||
    startSample < maxLagSamples ||
    endSample <= startSample ||
    endSample > reference.length / 2 ||
    endSample + maxLagSamples > decoded.length / 2
  ) {
    throw new Error(
      "PCM lag measurement requires a complete s16le sample window.",
    );
  }
  const source = new Float64Array(endSample - startSample);
  let referenceEnergy = 0;
  for (let index = 0; index < source.length; index += 1) {
    source[index] = reference.readInt16LE((startSample + index) * 2);
    referenceEnergy += source[index] ** 2;
  }
  if (referenceEnergy === 0) {
    throw new Error("PCM lag measurement requires an audible reference.");
  }
  const target = new Float64Array(source.length + 2 * maxLagSamples);
  for (let index = 0; index < target.length; index += 1)
    target[index] = decoded.readInt16LE(
      (startSample - maxLagSamples + index) * 2,
    );
  let lagSamples = 0;
  let correlation = -Infinity;
  for (let lag = -maxLagSamples; lag <= maxLagSamples; lag += 1) {
    let dot = 0;
    let targetEnergy = 0;
    for (let index = 0; index < source.length; index += 1) {
      const value = target[index + maxLagSamples + lag];
      dot += source[index] * value;
      targetEnergy += value ** 2;
    }
    const score = dot / Math.sqrt(referenceEnergy * targetEnergy);
    if (score > correlation) {
      correlation = score;
      lagSamples = lag;
    }
  }
  return { lagSamples, correlation };
};
