#!/usr/bin/env bun
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';

type StoredLocalMcpAuth = {
  baseUrl: string;
  agentId: string;
  tokenId: string;
  token: string;
  tokenPreview: string;
  tokenFingerprint: string;
  createdAt: string;
};

type RuntimeLocalMcpAuth = {
  source: 'env' | 'file';
  baseUrl: string;
  agentId: string;
  token: string;
  tokenEnvVar: string;
  configPath: string;
  tokenId: string | null;
  tokenPreview: string | null;
  tokenFingerprint: string | null;
  createdAt: string | null;
};

type DeviceCodeResponse = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
};

type TokenExchangePending = {
  error: 'authorization_pending' | 'expired_token' | 'invalid_grant';
  interval: number;
};

type TokenExchangeSuccess = {
  accessToken: string;
  agentId: string;
  token: {
    id: string;
    tokenPreview: string;
    tokenFingerprint: string;
  };
};

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
  };
};

type LocalMcpServerConfig = {
  url: string;
  bearer_token_env_var: string;
};

type LocalMcpClientConfig = {
  mcp_servers: Record<'database' | 'system' | 'tools' | 'cicd', LocalMcpServerConfig>;
};

type EnvShell = 'bash' | 'powershell' | 'cmd' | 'json';

const DEFAULT_BASE_URL = 'https://app.my-core.ru';
const DEFAULT_TOKEN_ENV_VAR = 'MY_CORE_MCP_TOKEN';
const LOCAL_AUTH_PATH = join(homedir(), '.my-core', 'local-mcp.json');
const SERVER_IDS = ['database', 'system', 'tools', 'cicd'] as const;
const TOKEN_ENV_CANDIDATES = ['MY_CORE_MCP_TOKEN', 'MCP_API_KEY', 'MY_CORE_RUNNER_TOKEN'] as const;
const AGENT_ID_ENV_CANDIDATES = ['MY_CORE_MCP_AGENT_ID', 'MY_CORE_AGENT_ID'] as const;
const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

const readArg = (name: string): string | null => {
  const index = Bun.argv.indexOf(name);
  if (index === -1) return null;
  const value = Bun.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
};

const readEnv = (name: string): string | null => {
  const value = Bun.env[name]?.trim();
  return value ? value : null;
};

const command = Bun.argv[2] ?? 'help';

const configPath = (): string => LOCAL_AUTH_PATH;

const validateEnvName = (name: string): string => {
  const normalized = name.trim();
  if (!ENV_NAME_RE.test(normalized)) {
    throw new Error(`Invalid environment variable name: ${name}`);
  }
  return normalized;
};

const normalizeLocalMcpBaseUrl = (rawUrl: string): string => {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Local MCP server URL must use http or https: ${rawUrl}`);
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
};

const configuredBaseUrl = (fallback?: string): string =>
  normalizeLocalMcpBaseUrl(
    readArg('--server') ??
    readEnv('MY_CORE_MCP_BASE_URL') ??
    readEnv('MY_CORE_URL') ??
    readEnv('MY_CORE_BACKEND_URL') ??
    fallback ??
    DEFAULT_BASE_URL,
  );

const configuredAgentId = (): string | null =>
  readArg('--agent-id') ??
  AGENT_ID_ENV_CANDIDATES.map((name) => readEnv(name)).find((value): value is string => Boolean(value)) ??
  null;

const explicitTokenEnvVar = (): string | null => {
  const explicit = readArg('--token-env-var') ?? readArg('--bearer-env-var') ?? readEnv('MY_CORE_MCP_TOKEN_ENV_VAR');
  if (explicit) return validateEnvName(explicit);
  return null;
};

const detectedTokenEnvVar = (): string | null => {
  const explicit = explicitTokenEnvVar();
  if (explicit) return explicit;
  return TOKEN_ENV_CANDIDATES.find((name) => Boolean(readEnv(name))) ?? null;
};

const runtimeTokenEnvVar = (fallback = DEFAULT_TOKEN_ENV_VAR): string =>
  explicitTokenEnvVar() ?? fallback;

const buildLocalMcpClientConfig = (
  input: { baseUrl: string; agentId: string; tokenEnvVar: string },
): LocalMcpClientConfig => {
  const servers = Object.fromEntries(SERVER_IDS.map((serverId) => [
    serverId,
    {
      url: `${input.baseUrl}/mcp/http/${serverId}?agentId=${encodeURIComponent(input.agentId)}`,
      bearer_token_env_var: input.tokenEnvVar,
    },
  ])) as LocalMcpClientConfig['mcp_servers'];

  return { mcp_servers: servers };
};

const apiBaseUrl = (): string => configuredBaseUrl();

const parseApiEnvelope = async <T>(response: Response): Promise<ApiEnvelope<T>> => {
  try {
    return await response.json() as ApiEnvelope<T>;
  } catch {
    return { error: { message: `Request failed with HTTP ${response.status}` } };
  }
};

const requestJson = async <T>(url: string, init: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  const payload = await parseApiEnvelope<T>(response);
  if (!response.ok && response.status !== 428) {
    throw new Error(payload.error?.message ?? `Request failed with HTTP ${response.status}`);
  }
  if (payload.data === undefined) {
    throw new Error(payload.error?.message ?? 'Invalid my-core API response');
  }
  return payload.data;
};

const saveAuth = async (auth: StoredLocalMcpAuth): Promise<void> => {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
};

const loadAuthFile = async (): Promise<StoredLocalMcpAuth> => {
  const path = configPath();
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw) as Partial<StoredLocalMcpAuth>;
  if (!parsed.baseUrl || !parsed.agentId || !parsed.token) {
    throw new Error(`Invalid local MCP auth file: ${path}`);
  }
  return parsed as StoredLocalMcpAuth;
};

const resolveRuntimeAuth = async (): Promise<RuntimeLocalMcpAuth> => {
  const path = configPath();
  const envAgentId = configuredAgentId();
  const envTokenVar = detectedTokenEnvVar();
  const envToken = envTokenVar ? readEnv(envTokenVar) : null;

  if (envAgentId && envTokenVar && envToken) {
    return {
      source: 'env',
      baseUrl: configuredBaseUrl(),
      agentId: envAgentId,
      token: envToken,
      tokenEnvVar: envTokenVar,
      configPath: path,
      tokenId: null,
      tokenPreview: null,
      tokenFingerprint: null,
      createdAt: null,
    };
  }

  const auth = await loadAuthFile();
  return {
    source: 'file',
    baseUrl: configuredBaseUrl(auth.baseUrl),
    agentId: envAgentId ?? auth.agentId,
    token: auth.token,
    tokenEnvVar: runtimeTokenEnvVar(DEFAULT_TOKEN_ENV_VAR),
    configPath: path,
    tokenId: auth.tokenId ?? null,
    tokenPreview: auth.tokenPreview ?? null,
    tokenFingerprint: auth.tokenFingerprint ?? null,
    createdAt: auth.createdAt ?? null,
  };
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const shellQuoteBash = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

const shellQuotePowerShell = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const resolveEnvShell = (): EnvShell => {
  const shell = readArg('--shell')?.toLowerCase();
  if (shell === 'bash' || shell === 'sh') return 'bash';
  if (shell === 'powershell' || shell === 'pwsh' || shell === 'ps') return 'powershell';
  if (shell === 'cmd' || shell === 'cmd.exe') return 'cmd';
  if (shell === 'json') return 'json';
  if (shell) throw new Error(`Unsupported shell: ${shell}`);
  return process.platform === 'win32' ? 'powershell' : 'bash';
};

const formatEnv = (env: Record<string, string>, shell: EnvShell): string => {
  if (shell === 'json') return `${JSON.stringify(env, null, 2)}\n`;
  const lines = Object.entries(env).map(([key, value]) => {
    validateEnvName(key);
    if (shell === 'bash') return `export ${key}=${shellQuoteBash(value)}`;
    if (shell === 'powershell') return `$env:${key} = ${shellQuotePowerShell(value)}`;
    return `set "${key}=${value.replace(/"/g, '""')}"`;
  });
  return `${lines.join('\n')}\n`;
};

const login = async (): Promise<void> => {
  const baseUrl = apiBaseUrl();
  const clientName = readArg('--client-name') ?? `local-mcp:${hostname()}`;
  const code = await requestJson<DeviceCodeResponse>(`${baseUrl}/v1/local-mcp/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientName, baseUrl }),
  });

  console.log(`Open: ${code.verificationUriComplete}`);
  console.log(`Code: ${code.userCode}`);
  console.log('Waiting for approval...');

  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > code.expiresIn * 1000) {
      throw new Error('Local MCP authorization code expired');
    }

    await sleep(Math.max(code.interval, 1) * 1000);
    const result = await requestJson<TokenExchangePending | TokenExchangeSuccess>(`${baseUrl}/v1/local-mcp/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode: code.deviceCode }),
    });

    if ('error' in result) {
      if (result.error === 'authorization_pending') continue;
      throw new Error(`Local MCP authorization failed: ${result.error}`);
    }

    await saveAuth({
      baseUrl,
      agentId: result.agentId,
      tokenId: result.token.id,
      token: result.accessToken,
      tokenPreview: result.token.tokenPreview,
      tokenFingerprint: result.token.tokenFingerprint,
      createdAt: new Date().toISOString(),
    });

    console.log(`Saved: ${configPath()}`);
    console.log(`Token: ${result.token.tokenPreview}`);
    console.log('Run `bun run local-mcp.ts config` to print MCP server config.');
    return;
  }
};

const printConfig = async (): Promise<void> => {
  const auth = await resolveRuntimeAuth();
  console.log(JSON.stringify(buildLocalMcpClientConfig({
    baseUrl: auth.baseUrl,
    agentId: auth.agentId,
    tokenEnvVar: auth.tokenEnvVar,
  }), null, 2));
};

const printEnv = async (): Promise<void> => {
  const auth = await resolveRuntimeAuth();
  const tokenEnvVar = validateEnvName(readArg('--target-token-env-var') ?? DEFAULT_TOKEN_ENV_VAR);
  const env = {
    MY_CORE_MCP_BASE_URL: auth.baseUrl,
    MY_CORE_MCP_AGENT_ID: auth.agentId,
    [tokenEnvVar]: auth.token,
  };
  process.stdout.write(formatEnv(env, resolveEnvShell()));
};

const printStatus = async (): Promise<void> => {
  const auth = await resolveRuntimeAuth();
  console.log(JSON.stringify({
    source: auth.source,
    baseUrl: auth.baseUrl,
    agentId: auth.agentId,
    tokenEnvVar: auth.tokenEnvVar,
    tokenConfigured: true,
    tokenId: auth.tokenId,
    tokenPreview: auth.tokenPreview,
    tokenFingerprint: auth.tokenFingerprint,
    createdAt: auth.createdAt,
    configPath: auth.configPath,
  }, null, 2));
};

const help = (): void => {
  console.log(`Usage:
  bun run local-mcp.ts login [--server https://app.my-core.ru] [--client-name NAME]
  bun run local-mcp.ts config [--server URL] [--agent-id ID] [--token-env-var NAME]
  bun run local-mcp.ts env [--shell bash|powershell|cmd|json] [--target-token-env-var NAME]
  bun run local-mcp.ts status

Shared auth:
  Local development uses one machine-wide file: ~/.my-core/local-mcp.json
  Runners/containers use their shared environment and do not write auth files.

Environment-first mode for containers/runners:
  MY_CORE_BACKEND_URL or MY_CORE_MCP_BASE_URL
  MY_CORE_AGENT_ID or MY_CORE_MCP_AGENT_ID
  MY_CORE_RUNNER_TOKEN, MCP_API_KEY, or MY_CORE_MCP_TOKEN

Local dev mode:
  bun run local-mcp.ts login --server https://app.my-core.ru
  bun run local-mcp.ts env --shell bash
  bun run local-mcp.ts env --shell powershell
`);
};

try {
  switch (command) {
    case 'login':
      await login();
      break;
    case 'config':
      await printConfig();
      break;
    case 'env':
      await printEnv();
      break;
    case 'status':
      await printStatus();
      break;
    default:
      help();
  }
} catch (err) {
  const path = configPath();
  const message = err instanceof Error && 'code' in err && err.code === 'ENOENT'
    ? `Local MCP auth is not configured. Either set runner env (MY_CORE_BACKEND_URL/MY_CORE_AGENT_ID/MY_CORE_RUNNER_TOKEN) or run \`bun run local-mcp.ts login\` first. Auth file checked: ${path}.`
    : err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
}
