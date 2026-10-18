# Scene capability admission diagnosis

A synthetic, provider-free reproduction found that Scene task contracts/finalization accepted bare SelectedResourceRef
items while Scene checking required `{selected, descriptor}` records. Empty arrays passed both schemas; neither nonempty
representation could pass the complete path. No active attempt was repaired or reopened.

Creation guidance defaulted to empty resource selections. Scene immutable context contained allowlist IDs without resolved
resource descriptors, API guidance or descriptor fingerprints. Workers could not inspect undeclared repository files to
resolve these missing inputs, and checking did not connect capability declarations with source invocations.

The engineering change shares the existing canonical wrapper across the whole Scene path, freezes selected Catalog
records into task context, exposes API guides at authoring time and checks matching source calls. Regression coverage
includes nonempty finalization/checking, aliases, namespace mounts, unused declarations and unselected invocations.
Real rendering remains required to assess visible behavior; source checks are not aesthetic acceptance.
