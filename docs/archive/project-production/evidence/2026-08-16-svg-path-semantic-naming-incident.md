# SVG path semantic naming incident

## Symptom

The full repository check rejected a valid project-local SVG path because the
path data command `M1` matched the retired milestone-name pattern.

## Root cause

The semantic naming scan inspected raw source lines without distinguishing SVG
`<path d="...">` data from identifiers and prose. The guard already permitted
other vector and audio syntax, but its fixture did not cover a retired milestone
number immediately following an SVG move command.

## Resolution

The scanner now uses the TypeScript TSX parser to identify exact SVG `path`
elements and their attributes, masking only a direct string-literal `d` value
while preserving line breaks and therefore diagnostic line numbers. Active
paths and all other source content remain subject to the existing
milestone-name rule. Regression fixtures cover the exact
`M1 1 L11 6 L1 11` path data that triggered the incident plus adversarial
`aria-label`, similarly named tag, embedded `>`, multiline, and braced-comment
cases. Tag and attribute matching is case-sensitive so React components such as
`Path` and non-SVG attributes such as `D` remain inside the naming guard.
