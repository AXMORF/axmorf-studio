export const sine = (cycles: number) => Math.sin(2 * Math.PI * cycles);

export const envelope = (time: number, attack: number, decay: number) =>
  time < 0 ? 0 : Math.min(1, time / attack) * Math.exp(-time / decay);

export const note = (time: number, frequency: number, decay: number) =>
  envelope(time, 0.002, decay) *
  (sine(frequency * time) + 0.12 * sine(2.01 * frequency * time));

export const createNoise = (seed = 0x41584d46) => {
  // Xorshift's zero state is absorbing. This substitution also supports seed 0.
  let state = seed || 0x41584d46;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x80000000 - 1;
  };
};
