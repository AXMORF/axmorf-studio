# V4 GlobalVisual layering hardening

- Run: `neural-network-name-run-20260806183441-73b9ef34d7d6`
- Terminal sequence observed: `17`
- Safe symptom: the mechanically valid Preview rendered the opaque project-global paper background
  above every Scene, so representative frames contained captions and global decoration but no Scene
  semantic visuals.
- Expected invariant: a v4 GlobalVisual background, texture, and continuity layer must be composited
  behind `StoryVisualTrack`; captions remain top-level.
- Owner classification: fixed production scaffold and Preview assembly ordering defect.
- Containment: the Run and its append-only state remain unchanged; no result or event was edited.
  The first Preview and local production commit are retained as evidence, and no protected voice
  profile, private provider configuration, historical Scene, or unrelated project artifact was
  opened or changed during diagnosis.
- Red proof: the focused scaffold and Preview assembly tests rejected the required background-first
  slot and layer order before the common fix.
- Green target: v4 scaffolds use an explicit background slot before `StoryVisualTrack`, new v3
  assemblies declare background-first order, and the parser retains read compatibility for existing
  v3 assembly bytes.
- Follow-up fixed-flow finding: after the template changed, `production:start` initially rejected the
  exact previous generated v4 Preview scaffold before creating a Run. A second focused Red/Green adds
  byte-exact recognition for that one legacy generator output while drifted and hand-written sources
  remain protected.
