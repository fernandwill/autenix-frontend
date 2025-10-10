type ProcessEnv = Record<string, string | undefined>;

const globalWithProcess = globalThis as typeof globalThis & {
  process?: {
    env?: ProcessEnv;
  };
  global?: typeof globalThis;
  Global?: typeof globalThis;
};

if (!globalWithProcess.process) {
  const env: ProcessEnv = {};
  globalWithProcess.process = { env };
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
