// Loads .env, if there is one, before any other module reads process.env.
// Imported first for that reason.
try {
  process.loadEnvFile();
} catch {
  // No .env: the project runs in demo mode.
}
