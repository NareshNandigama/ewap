// Load local development settings before modules read process.env. Injected values win.
export function loadLocalEnvironment() {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
