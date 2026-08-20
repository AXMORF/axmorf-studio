import { resolve } from "node:path";
import ts from "typescript";

type CompileRequest = Readonly<{
  rootDir: string;
  rootPath: string;
  label: string;
  virtualSource?: string;
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
  const defaultHost = ts.createCompilerHost(options);
  const virtualSource = request.virtualSource;
  const isVirtualRoot = (path: string) => resolve(path) === rootPath;
  const host: ts.CompilerHost =
    virtualSource === undefined
      ? defaultHost
      : {
          ...defaultHost,
          fileExists: (path) =>
            isVirtualRoot(path) || defaultHost.fileExists(path),
          readFile: (path) =>
            isVirtualRoot(path) ? virtualSource : defaultHost.readFile(path),
          getSourceFile: (fileName, languageVersion, onError, shouldCreate) =>
            isVirtualRoot(fileName)
              ? ts.createSourceFile(
                  fileName,
                  virtualSource,
                  languageVersion,
                  true,
                  ts.ScriptKind.TSX,
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
