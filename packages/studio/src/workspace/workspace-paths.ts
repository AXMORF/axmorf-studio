import { join } from "node:path";

export type WorkspacePaths = Readonly<{
  root: string;
  privateConfig: string;
  projectsSource: string;
  projectsPublic: string;
  narrationWork: string;
  producerWork: string;
  producerArtifacts: string;
  producerAttempts: string;
  output: string;
  deliveries: string;
}>;

export const createWorkspacePaths = (root: string): WorkspacePaths => ({
  root,
  privateConfig: join(root, "private"),
  projectsSource: join(root, "src", "projects"),
  projectsPublic: join(root, "public", "projects"),
  narrationWork: join(root, ".narration-work"),
  producerWork: join(root, ".producer-work"),
  producerArtifacts: join(root, ".producer-artifacts"),
  producerAttempts: join(root, ".producer-attempts"),
  output: join(root, "out"),
  deliveries: join(root, "deliveries"),
});
