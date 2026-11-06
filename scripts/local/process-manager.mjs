/**
 * Hopper Local Development Orchestrator — Process Supervision, Lockfile & Conflict Detection
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import * as readline from 'node:readline';
import {
  REPO_ROOT,
  BACKEND_DIR,
  FRONTEND_DIR,
  LOCK_FILE,
  SESSION_FILE,
  TIMEOUTS,
  PORTS,
} from './config.mjs';
import { log, writeLogToFile } from './logger.mjs';

/**
 * Check if a PID is alive.
 */
export function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // Alive but owned by different user
  }
}

/**
 * Read detailed process information from /proc/<pid>.
 */
export function getProcessInfo(pid) {
  if (!isPidAlive(pid)) return null;

  let cmdline = '';
  let cwd = '';
  let exe = '';

  try {
    const rawCmd = fs.readFileSync(`/proc/${pid}/cmdline`);
    cmdline = rawCmd.toString().replace(/\0/g, ' ').trim();
  } catch {}

  try {
    cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch {}

  try {
    exe = fs.readlinkSync(`/proc/${pid}/exe`);
  } catch {}

  return { pid, cmdline, cwd, exe, isAlive: true };
}

/**
 * Confidently classify whether a PID belongs to Hopper development components.
 * IMPORTANT: Explicitly protects IDEs, MCP servers, system services, and unrelated processes.
 */
export function classifyProcess(pid) {
  const info = getProcessInfo(pid);
  if (!info) return null;

  const { cmdline, cwd } = info;
  if (!cmdline) return null;

  // Protected patterns — NEVER classify as Hopper dev component
  const isProtected =
    cmdline.includes('antigravity') ||
    cmdline.includes('agy ') ||
    cmdline.includes('--hub') ||
    cmdline.includes('mcp') ||
    cmdline.includes('rea') ||
    cmdline.includes('playwright-mcp') ||
    cmdline.includes('mempalace') ||
    cmdline.includes('vscode') ||
    cmdline.includes('cline') ||
    cmdline.includes('opencode');

  if (isProtected) {
    return null;
  }

  // Check if cwd is inside Hopper workspace
  const isInRepo = cwd && (cwd === REPO_ROOT || cwd.startsWith(REPO_ROOT + path.sep));

  // 1. Hopper Orchestrator
  if (cmdline.includes('scripts/local/start.mjs')) {
    return 'orchestrator';
  }

  // 2. Hopper Backend Server
  if (
    (isInRepo || cwd === BACKEND_DIR) &&
    (cmdline.includes('src/server/index.ts') ||
     cmdline.includes('dist/server/index.js') ||
     (cmdline.includes('tsx') && cmdline.includes('server/index')))
  ) {
    return 'backend';
  }

  // 3. Hopper Background Worker
  if (
    (isInRepo || cwd === BACKEND_DIR) &&
    (cmdline.includes('src/workers/worker-entry.ts') ||
     cmdline.includes('dist/workers/worker-entry.js') ||
     (cmdline.includes('tsx') && cmdline.includes('worker-entry')))
  ) {
    return 'worker';
  }

  // 4. Hopper Frontend (Vite)
  if (
    (isInRepo || cwd === FRONTEND_DIR) &&
    (cmdline.includes('vite') || cmdline.includes('frontend/node_modules/.bin/vite'))
  ) {
    return 'frontend';
  }

  return null;
}

/**
 * Scan Linux /proc filesystem for any lingering Hopper processes.
 */
export function findHopperProcesses() {
  const results = [];
  try {
    const entries = fs.readdirSync('/proc');
    for (const entry of entries) {
      if (!/^\d+$/.test(entry)) continue;
      const pid = parseInt(entry, 10);
      if (pid === process.pid) continue; // Exclude current process

      const type = classifyProcess(pid);
      if (type) {
        const info = getProcessInfo(pid);
        results.push({ pid, type, info });
      }
    }
  } catch (err) {
    log('orchestrator', `Process scan warning: ${err.message}`, 'warn');
  }
  return results;
}

/**
 * Find the exact PID listening on a given TCP port using /proc/net/tcp.
 */
export function getListeningPidForPort(port) {
  const hexPort = port.toString(16).toUpperCase().padStart(4, '0');
  const inodes = new Set();

  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    if (!fs.existsSync(file)) continue;
    try {
      const lines = fs.readFileSync(file, 'utf8').split('\n').slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 10) continue;
        const localPart = parts[1];
        const state = parts[3];
        const colonIdx = localPart.lastIndexOf(':');
        if (colonIdx === -1) continue;
        const localPort = localPart.slice(colonIdx + 1);

        // 0A = TCP_LISTEN
        if (localPort === hexPort && state === '0A') {
          inodes.add(parts[9]);
        }
      }
    } catch {}
  }

  if (inodes.size === 0) return null;

  try {
    const pids = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p));
    for (const pidStr of pids) {
      const pid = parseInt(pidStr, 10);
      try {
        const fdDir = `/proc/${pid}/fd`;
        if (!fs.existsSync(fdDir)) continue;
        const fds = fs.readdirSync(fdDir);
        for (const fd of fds) {
          try {
            const link = fs.readlinkSync(`${fdDir}/${fd}`);
            const match = link.match(/^socket:\[(\d+)\]$/);
            if (match && inodes.has(match[1])) {
              return pid;
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}

  // Fallback: try lsof -iTCP:<port> -sTCP:LISTEN -t
  try {
    const out = execSync(`lsof -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (out) {
      const firstPid = parseInt(out.split('\n')[0], 10);
      if (firstPid && !isNaN(firstPid)) return firstPid;
    }
  } catch {}

  return null;
}

/**
 * Detect port conflicts and verify ownership before starting.
 */
export function detectPortConflict(port, componentName) {
  const pid = getListeningPidForPort(port);
  if (!pid) {
    return { hasConflict: false };
  }

  const info = getProcessInfo(pid);
  const classification = classifyProcess(pid);

  if (classification) {
    return {
      hasConflict: true,
      isHopper: true,
      component: classification,
      pid,
      info,
    };
  }

  // Unrelated application is using this port!
  return {
    hasConflict: true,
    isHopper: false,
    pid,
    info,
    error: `Port ${port} required for Hopper ${componentName} is occupied by an unrelated process (PID: ${pid}, cmd: "${info?.cmdline?.slice(0, 80) || 'unknown'}"). Cannot safely terminate.`,
  };
}

/**
 * Recursively find all child/descendant PIDs of a given process.
 */
export function getDescendantPids(rootPid) {
  if (!rootPid || typeof rootPid !== 'number') return [];
  let pids = [];
  try {
    pids = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p)).map(Number);
  } catch {
    return [];
  }

  const ppidMap = new Map();
  for (const pid of pids) {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const lastParen = stat.lastIndexOf(')');
      if (lastParen !== -1) {
        const rest = stat.slice(lastParen + 2).split(' ');
        const ppid = parseInt(rest[1], 10);
        if (!ppidMap.has(ppid)) ppidMap.set(ppid, []);
        ppidMap.get(ppid).push(pid);
      }
    } catch {}
  }

  const descendants = [];
  function collect(parent) {
    const children = ppidMap.get(parent) || [];
    for (const child of children) {
      descendants.push(child);
      collect(child);
    }
  }
  collect(rootPid);
  return descendants;
}

/**
 * Gracefully terminate a process and all its child descendants with SIGTERM, then bounded SIGKILL.
 */
export async function terminateProcess(pid, { gracefulTimeoutMs = TIMEOUTS.gracefulShutdownMs, label = 'process' } = {}) {
  if (!isPidAlive(pid)) return true;

  const targetPids = [...getDescendantPids(pid), pid];
  log('orchestrator', `Sending SIGTERM to ${label} (PID: ${pid}, plus ${targetPids.length - 1} children)...`);

  for (const p of targetPids) {
    try {
      process.kill(p, 'SIGTERM');
    } catch (err) {
      if (err.code !== 'ESRCH') {
        log('orchestrator', `Failed to send SIGTERM to ${p}: ${err.message}`, 'warn');
      }
    }
  }

  const deadline = Date.now() + gracefulTimeoutMs;
  while (Date.now() < deadline) {
    const stillAlive = targetPids.filter(isPidAlive);
    if (stillAlive.length === 0) {
      log('orchestrator', `${label} (PID: ${pid}) and all child processes terminated gracefully.`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  // Any remaining processes did not exit in time; send SIGKILL
  const lingering = targetPids.filter(isPidAlive);
  if (lingering.length > 0) {
    log('orchestrator', `${label} (${lingering.length} process(es)) did not exit within ${gracefulTimeoutMs}ms; sending SIGKILL...`, 'warn');
    for (const p of lingering) {
      try {
        process.kill(p, 'SIGKILL');
      } catch {}
    }

    const killDeadline = Date.now() + 2000;
    while (Date.now() < killDeadline) {
      if (!targetPids.some(isPidAlive)) {
        log('orchestrator', `${label} (PID: ${pid}) forcefully killed.`);
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return !isPidAlive(pid);
}

/**
 * Acquire orchestrator instance lock. Prevents competing orchestrators.
 */
export function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      const activePid = lockData.pid;

      if (isPidAlive(activePid)) {
        const info = getProcessInfo(activePid);
        if (info && info.cmdline.includes('start.mjs')) {
          throw new Error(
            `Another Hopper local development orchestrator is currently running (PID: ${activePid}, started at: ${lockData.startedAt}). Use 'npm run local:status' to inspect or 'npm run local:stop' to terminate it first.`
          );
        }
      }

      // Stale lock from a dead or non-Hopper process
      log('orchestrator', `Removing stale lock file from dead PID ${activePid}.`, 'warn');
      fs.unlinkSync(LOCK_FILE);
    } catch (err) {
      if (err.message.includes('Another Hopper local development orchestrator')) {
        throw err;
      }
      // Unparseable lock file; remove it
      try { fs.unlinkSync(LOCK_FILE); } catch {}
    }
  }

  const lockPayload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    cwd: process.cwd(),
    nodeVersion: process.version,
  };

  fs.writeFileSync(LOCK_FILE, JSON.stringify(lockPayload, null, 2), { flag: 'wx' });
  return true;
}

/**
 * Release orchestrator instance lock.
 */
export function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      if (lockData.pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch {}
}

/**
 * Save active session state to .runtime/local/session.json.
 */
export function saveSession(data) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    log('orchestrator', `Failed to save session state: ${err.message}`, 'warn');
  }
}

/**
 * Load active session state.
 */
export function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Clear session state file.
 */
export function clearSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
  } catch {}
}

/**
 * Spawn a child process under orchestrator supervision.
 */
export function spawnSupervisedProcess({ name, command, args = [], cwd = REPO_ROOT, env = {}, onFatalExit }) {
  const mergedEnv = { ...process.env, ...env };

  const child = spawn(command, args, {
    cwd,
    env: mergedEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  const pid = child.pid;
  log('orchestrator', `Spawned ${name} [PID: ${pid}]: ${command} ${args.join(' ')}`);

  // Stream stdout with component prefix
  const stdoutRl = readline.createInterface({ input: child.stdout, terminal: false });
  stdoutRl.on('line', (line) => {
    if (!line.trim()) return;
    log(name, line);
  });

  // Stream stderr with component prefix
  const stderrRl = readline.createInterface({ input: child.stderr, terminal: false });
  stderrRl.on('line', (line) => {
    if (!line.trim()) return;
    log(name, line, 'warn');
  });

  let hasExited = false;
  let exitCode = null;

  child.on('exit', (code, signal) => {
    hasExited = true;
    exitCode = code;
    const exitMsg = `${name} [PID: ${pid}] exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`;
    log(name, exitMsg, code === 0 ? 'info' : 'error');

    if (code !== 0 && code !== null && onFatalExit) {
      onFatalExit({ name, pid, code, signal });
    }
  });

  child.on('error', (err) => {
    log(name, `Failed to start process: ${err.message}`, 'error');
    if (onFatalExit) {
      onFatalExit({ name, pid, error: err });
    }
  });

  return {
    name,
    pid,
    child,
    get hasExited() {
      return hasExited;
    },
    get exitCode() {
      return exitCode;
    },
    async stop(timeoutMs = TIMEOUTS.gracefulShutdownMs) {
      if (hasExited) return true;
      return terminateProcess(pid, { gracefulTimeoutMs: timeoutMs, label: name });
    },
  };
}

