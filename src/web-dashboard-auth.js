import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SESSION_AGE = 8 * 60 * 60 * 1000;
export const SESSION_COOKIE = '__Host-nest-climate';

export class WebDashboardAuth {
  constructor(directory, { now = Date.now } = {}) {
    this.directory = directory;
    this.now = now;
    this.sessions = new Map();
    this.attempts = new Map();
    this.pending = 0;
    this.account = undefined;
    this.generation = 0;
    this.provisioning = Promise.resolve();
  }

  async load() {
    this.account = undefined;
    this.generation++;
    this.sessions.clear();
    try {
      const file = path.join(this.directory, 'web-account.json');
      if ((await fs.stat(file)).size > 4096) {
        return;
      }
      const account = JSON.parse(await fs.readFile(file, 'utf8'));
      if (
        account.version === 1 &&
        typeof account.username === 'string' &&
        /^[a-zA-Z0-9_.-]{1,64}$/.test(account.username) &&
        typeof account.salt === 'string' &&
        /^[a-f0-9]{64}$/.test(account.salt) &&
        typeof account.hash === 'string' &&
        /^[a-f0-9]{128}$/.test(account.hash)
      ) {
        this.account = account;
      }
    } catch {
      // A missing or invalid account can only be replaced from authenticated Homebridge Settings.
    }
  }

  setup(payload) {
    const operation = this.provisioning.then(() => this.saveAccount(payload));
    this.provisioning = operation.catch(() => {});
    return operation;
  }

  async saveAccount({ username, password } = {}) {
    if (
      typeof username !== 'string' ||
      !/^[a-zA-Z0-9_.-]{1,64}$/.test(username) ||
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128
    ) {
      throw new Error('Use a username of 1–64 letters, numbers, dots or dashes and a password of 8–128 characters.');
    }
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = (await scrypt(password, salt, 64)).toString('hex');
    const account = { version: 1, username, salt, hash };
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(this.directory, 'web-account.' + crypto.randomUUID() + '.tmp');
    try {
      await fs.writeFile(temporary, JSON.stringify(account), { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, path.join(this.directory, 'web-account.json'));
    } finally {
      await fs.rm(temporary, { force: true });
    }
    this.account = account;
    this.generation++;
    this.sessions.clear();
    this.attempts.clear();
    return { accountConfigured: true, username };
  }

  prune() {
    const now = this.now();
    for (const [key, session] of this.sessions) {
      if (session.expires <= now) {
        this.sessions.delete(key);
      }
    }
    for (const [key, attempt] of this.attempts) {
      if (attempt.expires <= now) {
        this.attempts.delete(key);
      }
    }
  }

  async login(payload, address) {
    this.prune();
    const attempt = this.attempts.get(address) ?? { count: 0, expires: this.now() + 300000 };
    if (attempt.count >= 5 || this.pending >= 2 || (this.attempts.size >= 256 && !this.attempts.has(address))) {
      return { limited: true };
    }
    attempt.count++;
    this.attempts.set(address, attempt);
    this.pending++;
    try {
      const password = typeof payload?.password === 'string' && payload.password.length <= 128 ? payload.password : '';
      const account = this.account;
      const generation = this.generation;
      const derived = await scrypt(password, account?.salt ?? 'not-configured', 64);
      if (
        !account ||
        generation !== this.generation ||
        this.account !== account ||
        payload?.username !== account.username ||
        !crypto.timingSafeEqual(derived, Buffer.from(account.hash, 'hex'))
      ) {
        return { authenticated: false };
      }
      this.attempts.delete(address);
      if (this.sessions.size >= 128) {
        this.sessions.delete(this.sessions.keys().next().value);
      }
      const token = crypto.randomBytes(32).toString('hex');
      const session = { username: account.username, csrfToken: crypto.randomBytes(32).toString('hex'), expires: this.now() + SESSION_AGE };
      this.sessions.set(token, session);
      return { authenticated: true, token, session };
    } finally {
      this.pending--;
    }
  }

  session(cookie = '') {
    this.prune();
    const token = cookie
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(SESSION_COOKIE + '='))
      ?.slice(SESSION_COOKIE.length + 1);
    return /^[a-f0-9]{64}$/.test(token ?? '') ? { token, session: this.sessions.get(token) } : {};
  }

  revoke(token) {
    this.sessions.delete(token);
  }
  close() {
    this.generation++;
    this.sessions.clear();
    this.attempts.clear();
  }
}
