import { execFile } from "node:child_process";
import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type NativeProcessIdentity = Readonly<{
  pid: number;
  parentPid: number;
  command: string;
  startedAt: string;
}>;

export type NativeTcpListener = Readonly<{
  pid: number;
  host: string;
  port: number;
}>;

export type NativeTcpConnection = Readonly<{
  pid: number;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}>;

export type NativeExpectedListenerEndpoint = Readonly<{
  host: "127.0.0.1";
  port: number;
}>;

export type NativeNetworkEvidenceSample = Readonly<{
  capturedAt: string;
  phase: string;
  processes: readonly NativeProcessIdentity[];
  listeners: readonly NativeTcpListener[];
  connections: readonly NativeTcpConnection[];
}>;

const evidenceError = (code: string) =>
  new Error(`native-network-evidence-${code}`);

export const nativeProcessCommandIdentity = (command: string) => {
  const identity = basename(command.trim());
  if (identity === "" || identity.length > 160) {
    throw evidenceError("process-command-invalid");
  }
  return identity;
};

const parseEndpoint = (raw: string) => {
  const value = raw.replace(/^TCP\s+/u, "").replace(/\s+\(LISTEN\)$/u, "");
  if (value.startsWith("[")) {
    const match = /^\[([^\]]+)\]:(\d+)$/u.exec(value);
    if (match === null) throw evidenceError("lsof-endpoint-invalid");
    return { host: match[1]!, port: Number(match[2]!) };
  }
  const separator = value.lastIndexOf(":");
  if (separator <= 0) throw evidenceError("lsof-endpoint-invalid");
  const host = value.slice(0, separator);
  const port = Number(value.slice(separator + 1));
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw evidenceError("lsof-port-invalid");
  }
  return { host, port };
};

export const parseLsofListenerOutput = (
  output: string,
): readonly NativeTcpListener[] => {
  const listeners: NativeTcpListener[] = [];
  let pid: number | null = null;
  for (const line of output.split(/\r?\n/u)) {
    if (line.startsWith("p")) {
      const parsed = Number(line.slice(1));
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw evidenceError("lsof-pid-invalid");
      }
      pid = parsed;
    } else if (line.startsWith("n")) {
      if (pid === null) throw evidenceError("lsof-owner-missing");
      listeners.push({ pid, ...parseEndpoint(line.slice(1)) });
    }
  }
  return listeners;
};

export const parseLsofConnectionOutput = (
  output: string,
): readonly NativeTcpConnection[] => {
  const connections: NativeTcpConnection[] = [];
  let pid: number | null = null;
  for (const line of output.split(/\r?\n/u)) {
    if (line.startsWith("p")) {
      const parsed = Number(line.slice(1));
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw evidenceError("lsof-pid-invalid");
      }
      pid = parsed;
    } else if (line.startsWith("n")) {
      if (pid === null) throw evidenceError("lsof-owner-missing");
      const endpoints = line.slice(1).split("->");
      if (endpoints.length !== 2) {
        throw evidenceError("lsof-connection-invalid");
      }
      const local = parseEndpoint(endpoints[0]!);
      const remote = parseEndpoint(endpoints[1]!);
      connections.push({
        pid,
        localHost: local.host,
        localPort: local.port,
        remoteHost: remote.host,
        remotePort: remote.port,
      });
    }
  }
  return connections;
};

const parseProcessIdentity = (raw: string): NativeProcessIdentity | null => {
  const match =
    /^\s*(\d+)\s+(\d+)\s+([A-Za-z]{3}\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+?)\s*$/u.exec(
      raw,
    );
  if (match === null) return null;
  return {
    pid: Number(match[1]!),
    parentPid: Number(match[2]!),
    startedAt: match[3]!,
    command: nativeProcessCommandIdentity(match[4]!),
  };
};

const runOptional = async (command: string, args: readonly string[]) => {
  try {
    return (await execFileAsync(command, [...args], { encoding: "utf8" }))
      .stdout;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException & { code?: number }).code;
    if (code === 1) return "";
    throw error;
  }
};

const inspectProcess = async (pid: number) => {
  const output = await runOptional("ps", [
    "-p",
    String(pid),
    "-o",
    "pid=,ppid=,lstart=,comm=",
  ]);
  return parseProcessIdentity(output);
};

const inspectProcessTree = async (rootPid: number) => {
  const pending = [rootPid];
  const seen = new Set<number>();
  const processes: NativeProcessIdentity[] = [];
  while (pending.length > 0) {
    const pid = pending.shift()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    const identity = await inspectProcess(pid);
    if (identity === null) continue;
    processes.push(identity);
    const children = await runOptional("pgrep", ["-P", String(pid)]);
    for (const value of children.split(/\r?\n/u)) {
      if (/^\d+$/u.test(value)) pending.push(Number(value));
    }
  }
  return processes.sort((left, right) => left.pid - right.pid);
};

const captureSample = async ({
  rootPid,
  phase,
}: {
  readonly rootPid: number;
  readonly phase: string;
}): Promise<NativeNetworkEvidenceSample> => {
  const processes = await inspectProcessTree(rootPid);
  const listeners: NativeTcpListener[] = [];
  const connections: NativeTcpConnection[] = [];
  for (const process of processes) {
    const [listenerOutput, connectionOutput] = await Promise.all([
      runOptional("lsof", [
        "-nP",
        "-a",
        "-p",
        String(process.pid),
        "-iTCP",
        "-sTCP:LISTEN",
        "-FpcfnT",
      ]),
      runOptional("lsof", [
        "-nP",
        "-a",
        "-p",
        String(process.pid),
        "-iTCP",
        "-sTCP:ESTABLISHED",
        "-FpcfnT",
      ]),
    ]);
    listeners.push(...parseLsofListenerOutput(listenerOutput));
    connections.push(...parseLsofConnectionOutput(connectionOutput));
  }
  return {
    capturedAt: new Date().toISOString(),
    phase,
    processes,
    listeners,
    connections,
  };
};

const readPhase = async (path: string) => {
  const phase = (await readFile(path, "utf8")).trim();
  if (!/^[a-z]+(?:-[a-z]+)*$/u.test(phase)) {
    throw evidenceError("phase-invalid");
  }
  return phase;
};

const fileExists = async (path: string) => {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

export const monitorNativeNetworkEvidence = async ({
  rootPid,
  phaseFile,
  stopFile,
  output,
  intervalMs = 100,
}: {
  readonly rootPid: number;
  readonly phaseFile: string;
  readonly stopFile: string;
  readonly output: string;
  readonly intervalMs?: number;
}) => {
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    throw evidenceError("root-pid-invalid");
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 50 || intervalMs > 5_000) {
    throw evidenceError("interval-invalid");
  }
  await writeFile(output, "", { flag: "wx", mode: 0o600 });
  while (!(await fileExists(stopFile))) {
    const sample = await captureSample({
      rootPid,
      phase: await readPhase(phaseFile),
    });
    await appendFile(output, `${JSON.stringify(sample)}\n`);
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, intervalMs),
    );
  }
};

const assertSample = (sample: NativeNetworkEvidenceSample) => {
  if (
    !Number.isFinite(Date.parse(sample.capturedAt)) ||
    !/^[a-z]+(?:-[a-z]+)*$/u.test(sample.phase)
  ) {
    throw evidenceError("sample-invalid");
  }
  const processIds = new Set(sample.processes.map(({ pid }) => pid));
  if (processIds.size !== sample.processes.length) {
    throw evidenceError("process-duplicate");
  }
  const listeners = new Set(
    sample.listeners.map(({ pid, host, port }) => `${pid}:${host}:${port}`),
  );
  if (listeners.size !== sample.listeners.length) {
    throw evidenceError("listener-duplicate");
  }
  const connections = new Set(
    sample.connections.map(
      ({ pid, localHost, localPort, remoteHost, remotePort }) =>
        `${pid}:${localHost}:${localPort}->${remoteHost}:${remotePort}`,
    ),
  );
  if (connections.size !== sample.connections.length) {
    throw evidenceError("connection-duplicate");
  }
  for (const listener of sample.listeners) {
    if (!processIds.has(listener.pid)) {
      throw evidenceError("listener-owner-invalid");
    }
  }
  for (const connection of sample.connections) {
    if (
      !processIds.has(connection.pid) ||
      connection.localHost !== "127.0.0.1" ||
      connection.remoteHost !== "127.0.0.1"
    ) {
      throw evidenceError("external-connection-observed");
    }
  }
};

export const assertNativeNetworkEvidence = ({
  samples,
  requiredActivePhases,
  ephemeralPortRange,
  expectedListenerEndpoints = [],
}: {
  readonly samples: readonly NativeNetworkEvidenceSample[];
  readonly requiredActivePhases: readonly string[];
  readonly ephemeralPortRange: Readonly<{ first: number; last: number }>;
  readonly expectedListenerEndpoints?: readonly NativeExpectedListenerEndpoint[];
}) => {
  if (
    samples.length === 0 ||
    requiredActivePhases.length === 0 ||
    ephemeralPortRange.first <= 0 ||
    ephemeralPortRange.last > 65_535 ||
    ephemeralPortRange.first > ephemeralPortRange.last
  ) {
    throw evidenceError("input-invalid");
  }
  const active = new Set(requiredActivePhases);
  const ports = new Set<number>();
  const portsByPhase = new Map<string, Set<number>>();
  let previousTime = -1;
  for (const sample of samples) {
    assertSample(sample);
    const capturedAt = Date.parse(sample.capturedAt);
    if (capturedAt < previousTime) throw evidenceError("time-order-invalid");
    previousTime = capturedAt;
    for (const listener of sample.listeners) {
      if (!active.has(sample.phase)) {
        throw evidenceError("persistent-listener-observed");
      }
      if (listener.host !== "127.0.0.1") {
        throw evidenceError("listener-host-invalid");
      }
      if (
        listener.port < ephemeralPortRange.first ||
        listener.port > ephemeralPortRange.last
      ) {
        throw evidenceError("listener-port-not-ephemeral");
      }
      ports.add(listener.port);
      const phasePorts = portsByPhase.get(sample.phase) ?? new Set<number>();
      phasePorts.add(listener.port);
      portsByPhase.set(sample.phase, phasePorts);
    }
  }
  for (const phase of active) {
    const phasePorts = portsByPhase.get(phase);
    if (phasePorts === undefined || phasePorts.size === 0) {
      throw evidenceError(`active-listener-missing:${phase}`);
    }
  }
  const observedEndpoints = new Set(
    samples.flatMap(({ listeners }) =>
      listeners.map(({ host, port }) => `${host}:${port}`),
    ),
  );
  for (const endpoint of expectedListenerEndpoints) {
    if (!observedEndpoints.has(`${endpoint.host}:${endpoint.port}`)) {
      throw evidenceError("listener-event-not-observed");
    }
  }
  const terminal = samples.at(-1)!;
  if (
    !terminal.phase.startsWith("idle-after-") ||
    terminal.listeners.length > 0
  ) {
    throw evidenceError("terminal-idle-missing");
  }
  return {
    controlPlane: "authenticated-unix-domain-socket-only" as const,
    persistentTcpListeners: false as const,
    deliveryBuildListener: {
      host: "127.0.0.1" as const,
      portAllocation: "os-ephemeral" as const,
      scope: "delivery-build" as const,
    },
    listenerPorts: [...ports].sort((left, right) => left - right),
    expectedListenerCount: expectedListenerEndpoints.length,
    externalTcpConnections: 0 as const,
    offlineRuntimeObserved: true as const,
    sampleCount: samples.length,
  };
};

const readExpectedListenerEndpoints = async (directory: string) => {
  const entries = (await readdir(directory))
    .filter((name) => /^listener-ready-.+\.json$/u.test(name))
    .sort();
  if (entries.length === 0) throw evidenceError("listener-events-missing");
  const sequences = new Set<number>();
  const endpoints: NativeExpectedListenerEndpoint[] = [];
  for (const name of entries) {
    const value = JSON.parse(
      await readFile(resolve(directory, name), "utf8"),
    ) as Readonly<Record<string, unknown>>;
    if (
      Object.keys(value).sort().join(",") !== "host,port,sequence,storyId" ||
      value.storyId !== "desktop-native-fixture" ||
      value.host !== "127.0.0.1" ||
      !Number.isInteger(value.port) ||
      Number(value.port) <= 0 ||
      Number(value.port) > 65_535 ||
      !Number.isInteger(value.sequence) ||
      Number(value.sequence) <= 0 ||
      sequences.has(Number(value.sequence))
    ) {
      throw evidenceError("listener-event-invalid");
    }
    sequences.add(Number(value.sequence));
    endpoints.push({ host: "127.0.0.1", port: Number(value.port) });
  }
  return endpoints;
};

export const assertNativeIdleNetworkEvidence = (
  samples: readonly NativeNetworkEvidenceSample[],
) => {
  if (samples.length === 0) throw evidenceError("idle-samples-missing");
  for (const sample of samples) {
    assertSample(sample);
    if (sample.listeners.length > 0 || sample.connections.length > 0) {
      throw evidenceError("persistent-listener-observed");
    }
  }
  return {
    persistentTcpListeners: false as const,
    externalTcpConnections: 0 as const,
    offlineRuntimeObserved: true as const,
    sampleCount: samples.length,
  };
};

export const readNativeNetworkEvidence = async (path: string) => {
  const text = await readFile(path, "utf8");
  const samples = text
    .split(/\r?\n/u)
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as NativeNetworkEvidenceSample);
  for (const sample of samples) assertSample(sample);
  return samples;
};

export const assertNativeProcessCleanup = async (
  samples: readonly NativeNetworkEvidenceSample[],
) => {
  const observed = new Map<number, NativeProcessIdentity>();
  for (const sample of samples) {
    for (const process of sample.processes) observed.set(process.pid, process);
  }
  const remaining: NativeProcessIdentity[] = [];
  for (const identity of observed.values()) {
    const current = await inspectProcess(identity.pid);
    if (
      current !== null &&
      current.startedAt === identity.startedAt &&
      current.command === identity.command
    ) {
      remaining.push(current);
    }
  }
  if (remaining.length > 0) throw evidenceError("process-cleanup-failed");
  return { observedProcesses: observed.size, remainingProcesses: 0 } as const;
};

const option = (args: readonly string[], name: string) => {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw evidenceError(`option-required:${name.slice(2)}`);
  }
  return value;
};

const runCli = async (args: readonly string[]) => {
  const command = args[0];
  if (command === "monitor") {
    await monitorNativeNetworkEvidence({
      rootPid: Number(option(args, "--root-pid")),
      phaseFile: resolve(option(args, "--phase-file")),
      stopFile: resolve(option(args, "--stop-file")),
      output: resolve(option(args, "--output")),
    });
    return;
  }
  const input = resolve(option(args, "--input"));
  const samples = await readNativeNetworkEvidence(input);
  if (command === "assert") {
    const result = assertNativeNetworkEvidence({
      samples,
      requiredActivePhases: option(args, "--required-active-phases").split(","),
      ephemeralPortRange: {
        first: Number(option(args, "--ephemeral-first")),
        last: Number(option(args, "--ephemeral-last")),
      },
      expectedListenerEndpoints: await readExpectedListenerEndpoints(
        resolve(option(args, "--listener-events-directory")),
      ),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === "assert-idle") {
    process.stdout.write(
      `${JSON.stringify(assertNativeIdleNetworkEvidence(samples))}\n`,
    );
    return;
  }
  if (command === "assert-process-cleanup") {
    process.stdout.write(
      `${JSON.stringify(await assertNativeProcessCleanup(samples))}\n`,
    );
    return;
  }
  throw evidenceError("command-invalid");
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "native-network-evidence-failed"}\n`,
    );
    process.exitCode = 1;
  });
}
