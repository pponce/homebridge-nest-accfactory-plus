import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { configuredAccounts } from './public/connection-config.js';

export class ConnectionSetup {
  constructor(configPath, storagePath, forward, loadAuth = () => import('../dist/web-dashboard-auth.js')) {
    Object.assign(this, { configPath, storagePath, forward, loadAuth });
    this.saving = Promise.resolve();
  }

  async read() {
    const bytes = await fs.readFile(this.configPath, 'utf8');
    const platforms = JSON.parse(bytes)?.platforms;
    const blocks = (Array.isArray(platforms) ? platforms : []).filter((block) => typeof block?.platform === 'string' && block.platform.split('.').at(-1) === 'NestClimateCntrl');
    return { revision: crypto.createHash('sha256').update(bytes).digest('hex'), blocks, configured: configuredAccounts(blocks) };
  }

  directory(block) {
    const username = block?._bridge?.username;
    const instance = typeof username === 'string' && /^(?:[a-f\d]{2}:){5}[a-f\d]{2}$/i.test(username) ? 'bridge-' + username.replaceAll(':', '').toLowerCase() : 'main';
    return path.join(this.storagePath, 'nest-climate', 'web', instance);
  }

  async accountStatus() {
    const { blocks } = await this.read();
    const { WebDashboardAuth } = await this.loadAuth();
    const auth = new WebDashboardAuth(this.directory(blocks[0]));
    await auth.load();
    return { accountConfigured: Boolean(auth.account), username: auth.account?.username || 'admin' };
  }

  saveAccount(payload) {
    const operation = this.saving.then(() => this.provision(payload));
    this.saving = operation.catch(() => {});
    return operation;
  }

  async provision(payload) {
    const current = await this.read();
    if (!payload || payload.revision !== current.revision) throw Object.assign(new Error('Configuration changed. Reload Accounts & web access before saving.'), { status: 409 });
    if (current.blocks.length !== 1 || !current.configured) throw new Error('Save your Nest or Google account before creating a web login.');
    const credentials = { username: payload.username, password: payload.password };
    const endpoint = path.join(this.storagePath, 'nest-climate', 'endpoint.json');
    let running = true;
    try { await fs.access(endpoint); } catch (error) { if (error.code !== 'ENOENT') throw error; running = false; }
    // Existing runtimes own credential rotation and session invalidation. Never bypass them on a failed request.
    if (running) return this.forward('/web/account', credentials);
    const directory = this.directory(current.blocks[0]);
    let exists = true;
    try { await fs.access(path.join(directory, 'web-account.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
    if (exists) throw new Error('Start the Nest bridge before changing an existing web login.');
    const { WebDashboardAuth } = await this.loadAuth();
    const auth = new WebDashboardAuth(directory);
    return auth.setup(credentials);
  }
}
