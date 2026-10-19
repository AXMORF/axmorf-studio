export const describeWorkspaceCliHelp = () => ({
  status: "help" as const,
  commands: [
    "npm run doctor",
    "npm run film:new -- --film <filmId> --title <title> [--width <px>] [--height <px>] [--fps <n>]",
    "npm run film:voice -- --film <filmId>",
    "npm run film:music -- --film <filmId>",
    "npm run film:asset -- --film <filmId> --file <absolute-path> --name <file-name> --origin generated|original|licensed --creator <who> --license <license>",
    "npm run film:review -- --film <filmId> [--frames <f1,f2,...>]",
    "npm run film:check -- --film <filmId>",
    "npm run film:deliver -- --film <filmId>",
    "npm run film:list",
    "npm run film:delete -- --film <filmId> --confirm-delete",
    "npm run browser:prepare",
    "npm run dev",
  ],
  guidance: [
    "Read .agents/skills/axmorf-film/SKILL.md before making a video.",
  ],
});
