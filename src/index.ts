import { loadConfig } from './config.js';
import { createDirectoryAuth } from './google.js';
import { ScimClient } from './scim.js';
import { runSync } from './sync.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const auth = createDirectoryAuth(config.googleKeyFile, config.googleAdminEmail);
  const scim = new ScimClient(config.scimBaseUrl, config.scimToken);

  const tick = async () => {
    try {
      console.log(`sync start ${new Date().toISOString()}`);
      await runSync(auth, scim, config);
      console.log(`sync done ${new Date().toISOString()}`);
    } catch (err) {
      console.error('sync failed', err);
    }
  };

  await tick();
  setInterval(() => {
    void tick();
  }, config.pollIntervalMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
