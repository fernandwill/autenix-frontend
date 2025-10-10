type ProcessEnv = Record<string, string | undefined>;
type PolyfillProcess = { env?: ProcessEnv; [key: string]: unknown };

const globalWithProcess = globalThis as typeof globalThis & {
  process?: PolyfillProcess;
  global?: typeof globalThis;
  Global?: typeof globalThis;
};

if (!globalWithProcess.process) {
  const env: ProcessEnv = {};
  Object.defineProperty(globalWithProcess, "process", {
    configurable: true,
    writable: true,
    value: { env } as PolyfillProcess,
  });
} else if (!globalWithProcess.process.env) {
  const env: ProcessEnv = {};
  globalWithProcess.process.env = env;
}

if (!globalWithProcess.global) {
  globalWithProcess.global = globalWithProcess;
}

if (!globalWithProcess.Global) {
  globalWithProcess.Global = globalWithProcess;
}
