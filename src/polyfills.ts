const globalWithProcess = globalThis as typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

if (!globalWithProcess.process) {
  globalWithProcess.process = { env: {} } as any;
} else if (!globalWithProcess.process.env) {
  globalWithProcess.process.env = {} as any;
}
