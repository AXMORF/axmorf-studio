import { basename, dirname, join, resolve } from "node:path";
import ts from "typescript";

type CompileRequest = Readonly<{
  rootDir: string;
  rootPath: string;
  typescriptLibRoot: string;
  label: string;
  virtualSource?: string;
  virtualSources?: Readonly<Record<string, string>>;
}>;

const diagnosticCodes = (diagnostics: readonly ts.Diagnostic[]) =>
  [...new Set(diagnostics.map(({ code }) => code))].sort(
    (left, right) => left - right,
  );

const failForDiagnostics = (
  label: string,
  diagnostics: readonly ts.Diagnostic[],
) => {
  const errors = diagnostics.filter(
    ({ category }) => category === ts.DiagnosticCategory.Error,
  );
  if (errors.length === 0) return;
  const codes = diagnosticCodes(errors).map((code) => `TS${code}`).join(", ");
  throw new Error(`${label} failed (${codes}).`);
};

const readCompilerOptions = ({ rootDir, rootPath, label }: CompileRequest) => {
  const configPath = resolve(rootDir, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined) failForDiagnostics(label, [config.error]);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    {
      useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: () => [rootPath],
    },
    rootDir,
    { noEmit: true },
    configPath,
  );
  failForDiagnostics(label, parsed.errors);
  return { ...parsed.options, noEmit: true } as const;
};

export const compileTypeScriptImportGraph = (request: CompileRequest) => {
  const rootPath = resolve(request.rootPath);
  const options = readCompilerOptions({ ...request, rootPath });
  const defaultHost = {
    ...ts.createCompilerHost(options),
    getDefaultLibFileName: (compilerOptions: ts.CompilerOptions) =>
      join(
        resolve(request.typescriptLibRoot),
        basename(ts.getDefaultLibFilePath(compilerOptions)),
      ),
    getDefaultLibLocation: () => resolve(request.typescriptLibRoot),
  };
  if (
    request.virtualSource !== undefined &&
    request.virtualSources !== undefined
  ) {
    throw new Error("TypeScript compile accepts one virtual source mode.");
  }
  const virtualSources = new Map(
    request.virtualSources === undefined
      ? request.virtualSource === undefined
        ? []
        : [[rootPath, request.virtualSource] as const]
      : Object.entries(request.virtualSources).map(
          ([path, source]) => [resolve(path), source] as const,
        ),
  );
  const virtualDirectories = new Set<string>();
  for (const path of virtualSources.keys()) {
    let directory = dirname(path);
    while (!virtualDirectories.has(directory)) {
      virtualDirectories.add(directory);
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  const virtualSourceFor = (path: string) => virtualSources.get(resolve(path));
  const host: ts.CompilerHost =
    virtualSources.size === 0
      ? defaultHost
      : {
          ...defaultHost,
          fileExists: (path) =>
            virtualSourceFor(path) !== undefined || defaultHost.fileExists(path),
          directoryExists: (path) =>
            virtualDirectories.has(resolve(path)) ||
            defaultHost.directoryExists?.(path) === true,
          readFile: (path) =>
            virtualSourceFor(path) ?? defaultHost.readFile(path),
          getSourceFile: (fileName, languageVersion, onError, shouldCreate) =>
            virtualSourceFor(fileName) !== undefined
              ? ts.createSourceFile(
                  fileName,
                  virtualSourceFor(fileName)!,
                  languageVersion,
                  true,
                  fileName.endsWith(".tsx")
                    ? ts.ScriptKind.TSX
                    : fileName.endsWith(".json")
                      ? ts.ScriptKind.JSON
                      : ts.ScriptKind.TS,
                )
              : defaultHost.getSourceFile(
                  fileName,
                  languageVersion,
                  onError,
                  shouldCreate,
                ),
        };
  const program = ts.createProgram({ rootNames: [rootPath], options, host });
  failForDiagnostics(request.label, ts.getPreEmitDiagnostics(program));
};
