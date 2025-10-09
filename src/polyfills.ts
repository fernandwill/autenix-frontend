const globalWithProcess = globalThis as typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
  global?: typeof globalThis;
  Global?: typeof globalThis;
};

if (!globalWithProcess.process) {
  globalWithProcess.process = { env: {} } as any;
} else if (!globalWithProcess.process.env) {
  globalWithProcess.process.env = {} as any;
}

if (!globalWithProcess.global) {
  globalWithProcess.global = globalWithProcess;
}

if (!globalWithProcess.Global) {
  globalWithProcess.Global = globalWithProcess;
}
