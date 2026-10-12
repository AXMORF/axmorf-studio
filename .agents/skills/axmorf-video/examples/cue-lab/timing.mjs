/** Absolute rounding avoids accumulated drift at fractional frames per beat. */
export const beatFrame = (/** @type {number} */ index, /** @type {number} */ bpm, /** @type {number} */ fps) =>
  Math.round(index * 60 * fps / bpm);

export const clamp = (/** @type {number} */ value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** Contact is exactly 1 at `at`; settle is a separate phase after contact. */
export const landing = (/** @type {number} */ frame, /** @type {number} */ at, /** @type {number} */ lead, /** @type {number} */ settle, overshoot = 0.045) => {
  if (frame < at) return 1 - (1 - clamp((frame - at + lead) / lead)) ** 3;
  if (frame >= at + settle) return 1;
  const phase = (frame - at) / settle;
  return 1 + overshoot * Math.sin(phase * Math.PI * 2) * (1 - phase) ** 2;
};

/** @typedef {{id:string, beatIndex:number, leadFrames:number, settleFrames:number, sound:string, alignment:string, sourceOffsetSeconds:number}} Event */
/** @typedef {{fps:number, sampleRate:number, bpm:number, durationInFrames:number, events:Event[]}} Sheet */

/** Both the renderer and the synthesizer consume this function and cue sheet. */
export const schedule = (/** @type {Sheet} */ sheet) => sheet.events.map((event) => {
  const contactFrame = beatFrame(event.beatIndex, sheet.bpm, sheet.fps);
  const targetSample = Math.round(contactFrame / sheet.fps * sheet.sampleRate);
  const sourceOffsetSamples = Math.round(event.sourceOffsetSeconds * sheet.sampleRate);
  const soundStartSample = targetSample - sourceOffsetSamples;
  if (soundStartSample < 0 || contactFrame - event.leadFrames < 0 || contactFrame + event.settleFrames >= sheet.durationInFrames) {
    throw new Error(`Cue ${event.id} is outside the lesson window.`);
  }
  return {...event, contactFrame, visualStartFrame: contactFrame - event.leadFrames, settledFrame: contactFrame + event.settleFrames, targetSample, sourceOffsetSamples, soundStartSample};
});
