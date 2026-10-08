import type {
  ReferenceCoarseInterval,
  ReferenceRefinement,
} from "./diagnostics";
import type { parseReferenceVideoProbe, planReferenceSamples } from "./domain";

export type ReferencePreview = Readonly<{
  path: string;
  nominalFrame: number;
  requestedTimeSeconds: number;
  width: number;
  height: number;
  checksum: string;
  sizeBytes: number;
}>;

export type ReadableReferenceReport = Readonly<{
  input: { path: string; checksum: string };
  media: ReturnType<typeof parseReferenceVideoProbe>;
  status: "reference-analysis-ready" | "reference-analysis-unavailable";
  method: {
    algorithmId: string;
    threshold: number;
    sampling: ReturnType<typeof planReferenceSamples>;
  };
  missingCapabilities: readonly string[];
  coarseIntervals: readonly ReferenceCoarseInterval[];
  refinements: readonly ReferenceRefinement[];
  cutCandidates: readonly ReferenceRefinement[];
  previews: readonly ReferencePreview[];
  limits: readonly string[];
}>;

const decimal = (value: number | null) =>
  value === null ? "unavailable" : value.toFixed(4);
const timestamp = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const escapeMarkdown = (value: string) =>
  [...value]
    .map((character) =>
      "\\[]*_`<>|".includes(character) ? `\\${character}` : character,
    )
    .join("");

export const renderReferenceMarkdown = (
  report: ReadableReferenceReport,
  fingerprint: string,
) => {
  const lines = [
    "# Local reference diagnostics",
    "",
    `Input: ${escapeMarkdown(report.input.path)} (${report.input.checksum}).`,
    `Analysis: ${fingerprint}; status: ${report.status}.`,
    `Media: ${report.media.width}×${report.media.height}, nominal fps ${report.media.frameRate.numerator}/${report.media.frameRate.denominator}, duration ${decimal(report.media.durationSeconds)} seconds.`,
    "",
    "This report contains pixel evidence. Cut candidates are hypotheses; image translation/scale does not establish semantic camera movement. Source frame ordinals and decoded PTS are not measured. Semantic interpretation, motion quality and aesthetic approval remain not-assessed.",
    "",
    "## Cut candidate brackets",
    "",
    "| Requested seek bracket | Nominal fps grid | MAD / fitted residual | Evidence |",
    "| --- | --- | --- | --- |",
    ...report.cutCandidates.map(
      (candidate) =>
        `| ${timestamp(candidate.startSeconds)}–${timestamp(candidate.endSeconds)} | (${candidate.beforeFrame}, ${candidate.afterFrame}], width ${candidate.nominalBoundaryFrameRange.resolutionFrames} | ${decimal(candidate.normalizedMeanAbsoluteDifference)} / ${decimal(candidate.imageMotion.evidence.normalizedFitResidual)} | ${candidate.confidence.evidenceLevel}; ${candidate.confidence.interpretation} |`,
    ),
    ...(report.cutCandidates.length === 0
      ? [
          "",
          "No abrupt-change candidate survived the tested brackets. This does not prove an uninterrupted shot.",
        ]
      : []),
    "",
    "## Coarse image motion",
    "",
    "Positive translation moves image content right/down; centered scale >1 expands the image. Values are measured in the stretched 64×36 diagnostic grid, not world or camera coordinates.",
    "",
    "| Requested interval | Fit status | Grid dx / dy / scale | Residual / overlap / alternative gap |",
    "| --- | --- | --- | --- |",
    ...report.coarseIntervals.map((interval) => {
      const motion = interval.imageMotion;
      return `| ${timestamp(interval.startSeconds)}–${timestamp(interval.endSeconds)} | ${motion.status} | ${motion.transform === null ? "withheld" : `${decimal(motion.transform.translationXPixels)} / ${decimal(motion.transform.translationYPixels)} / ${decimal(motion.transform.centeredScale)}`} | ${decimal(motion.evidence.normalizedFitResidual)} / ${decimal(motion.evidence.overlapFraction)} / ${decimal(motion.evidence.distinctAlternativeGap)} |`;
    }),
    "",
    "## Timestamped local previews",
    "",
    "These are color PNGs at requested seek positions. Read them in order and compare candidate before/after pairs. An Agent may describe subjects, framing, continuity and likely edits, citing these frame paths and brackets; those interpretations are separate from machine measurements.",
    "",
    ...report.previews.flatMap((preview) => [
      `### Requested ${timestamp(preview.requestedTimeSeconds)} · nominal frame ${preview.nominalFrame}`,
      "",
      `![Requested ${timestamp(preview.requestedTimeSeconds)}](${preview.path})`,
      "",
      `PNG checksum: ${preview.checksum}; ${preview.width}×${preview.height}.`,
      "",
    ]),
    "## Limits",
    "",
    ...report.limits.map((limit) => `- ${limit}`),
    ...report.missingCapabilities.map(
      (capability) => `- Missing pinned capability: ${capability}`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
};

export const renderReferenceHtml = (
  report: ReadableReferenceReport,
  fingerprint: string,
) => `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Local reference diagnostics</title>
<style>body{max-width:1200px;margin:32px auto;padding:0 24px;font:16px/1.5 system-ui;color:#18212b;background:#f6f7f9}h1,h2{line-height:1.2}code{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #ccd2dc;padding:10px;font-size:14px}.frames{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}figure{margin:0;background:white;padding:12px}img{max-width:100%;height:auto}figcaption{font-size:14px}a{color:#2352a4}.limit{background:#fff1cd;padding:16px}</style>
<body><h1>Local reference diagnostics</h1><p>${escapeHtml(report.input.path)} · ${escapeHtml(report.status)}</p><p><code>${fingerprint}</code></p>
<p class="limit">Pixels support candidate brackets and image registration. They do not establish actual edits, semantic camera movement or visual quality. Every frame label is a requested seek / nominal fps-grid position; decoded PTS and source frame ordinals are unmeasured. Human or Agent interpretation remains separate.</p>
<p><a href="analysis.json">Machine evidence</a> · <a href="report.md">Readable report</a></p>
<h2>Cut candidate brackets (${report.cutCandidates.length})</h2>
<table><thead><tr><th>Requested bracket</th><th>Nominal frame bracket</th><th>MAD / residual</th><th>Evidence</th></tr></thead><tbody>${report.cutCandidates.map((candidate) => `<tr><td>${timestamp(candidate.startSeconds)}–${timestamp(candidate.endSeconds)}</td><td>(${candidate.beforeFrame}, ${candidate.afterFrame}] · width ${candidate.nominalBoundaryFrameRange.resolutionFrames}</td><td>${decimal(candidate.normalizedMeanAbsoluteDifference)} / ${decimal(candidate.imageMotion.evidence.normalizedFitResidual)}</td><td>${candidate.confidence.evidenceLevel}<br>${candidate.confidence.interpretation}</td></tr>`).join("")}</tbody></table>
${report.cutCandidates.length === 0 ? "<p>No surviving candidate in tested brackets. This does not prove one uninterrupted shot.</p>" : ""}
<h2>Coarse image translation / scale</h2><p>Positive dx/dy moves image content right/down. Scale &gt;1 expands around image center. Coordinates use the diagnostic 64×36 grid.</p>
<table><thead><tr><th>Requested interval</th><th>Fit</th><th>dx / dy / scale</th><th>Residual / overlap / ambiguity gap</th></tr></thead><tbody>${report.coarseIntervals.map(({ startSeconds, endSeconds, imageMotion: motion }) => `<tr><td>${timestamp(startSeconds)}–${timestamp(endSeconds)}</td><td>${motion.status}</td><td>${motion.transform === null ? "withheld" : `${decimal(motion.transform.translationXPixels)} / ${decimal(motion.transform.translationYPixels)} / ${decimal(motion.transform.centeredScale)}`}</td><td>${decimal(motion.evidence.normalizedFitResidual)} / ${decimal(motion.evidence.overlapFraction)} / ${decimal(motion.evidence.distinctAlternativeGap)}</td></tr>`).join("")}</tbody></table>
<h2>Timestamped local frames</h2><div class="frames">${report.previews.map((preview) => `<figure><img loading="lazy" src="${preview.path}" alt="Requested ${timestamp(preview.requestedTimeSeconds)}"><figcaption>Requested ${timestamp(preview.requestedTimeSeconds)} · nominal frame ${preview.nominalFrame}<br><code>${preview.checksum}</code></figcaption></figure>`).join("")}</div>
<h2>Interpretation prompts</h2><p>Read subjects and framing across local frames. Compare candidate before/after pairs. Distinguish likely cuts, flashes/fades, object movement and continuous framing; cite frame paths and nominal brackets. Record explanations as Agent observations, with uncertainty, separately from machine diagnostics.</p>
<h2>Limits</h2><ul>${report.limits.map((limit) => `<li>${escapeHtml(limit)}</li>`).join("")}${report.missingCapabilities.map((capability) => `<li>Missing pinned capability: ${escapeHtml(capability)}</li>`).join("")}</ul></body></html>
`;
