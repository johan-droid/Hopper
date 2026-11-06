/**
 * Hopper Local Development Orchestrator — Cloudflare Quick Tunnel Supervisor
 */

import { spawn, execSync } from 'node:child_process';
import * as readline from 'node:readline';
import { log } from './logger.mjs';
import { TIMEOUTS, PORTS } from './config.mjs';
import { verifyWebhookRoute } from './health-check.mjs';
import { isPidAlive, terminateProcess } from './process-manager.mjs';

/**
 * Check if the cloudflared binary is installed and executable.
 */
export function isCloudflaredInstalled() {
  try {
    execSync('which cloudflared', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Start and supervise a Cloudflare Quick Tunnel forwarding to the local Hopper backend.
 */
export async function startCloudflareTunnel(backendPort = PORTS.backend, timeoutMs = TIMEOUTS.tunnelReadyMs) {
  if (!isCloudflaredInstalled()) {
    log('tunnel', 'cloudflared binary is not installed in system PATH.', 'warn');
    return {
      active: false,
      publicUrl: null,
      webhookUrl: null,
      error: 'cloudflared binary not found. Install via: brew install cloudflared or https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
    };
  }

  const backendTarget = `http://localhost:${backendPort}`;
  log('tunnel', `Starting Cloudflare Quick Tunnel forwarding to ${backendTarget}...`);

  const child = spawn('cloudflared', ['tunnel', '--url', backendTarget], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  const pid = child.pid;
  let publicUrl = null;
  let hasExited = false;
  let exitError = null;

  const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i;

  const urlPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!publicUrl) {
        reject(new Error(`Timed out waiting for Cloudflare Quick Tunnel URL after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    function handleLine(line) {
      log('tunnel', line.trim());
      const match = line.match(urlRegex);
      if (match && !publicUrl) {
        publicUrl = match[0];
        clearTimeout(timer);
        resolve(publicUrl);
      }
    }

    const stdoutRl = readline.createInterface({ input: child.stdout, terminal: false });
    stdoutRl.on('line', handleLine);

    const stderrRl = readline.createInterface({ input: child.stderr, terminal: false });
    stderrRl.on('line', handleLine);

    child.on('exit', (code, signal) => {
      hasExited = true;
      exitError = `cloudflared exited with code ${code}${signal ? ` (${signal})` : ''}`;
      if (!publicUrl) {
        clearTimeout(timer);
        reject(new Error(exitError));
      }
    });

    child.on('error', (err) => {
      hasExited = true;
      clearTimeout(timer);
      reject(err);
    });
  });

  try {
    const resolvedUrl = await urlPromise;
    log('tunnel', `Tunnel established successfully: ${resolvedUrl}`, 'success');

    // Verify webhook route on local backend
    const routeCheck = await verifyWebhookRoute(`http://localhost:${backendPort}`, '/api/webhooks/github');
    let webhookUrl = null;

    if (routeCheck.verified) {
      webhookUrl = `${resolvedUrl}/api/webhooks/github`;
      log('tunnel', `Verified GitHub Webhook URL: ${webhookUrl}`, 'success');
    } else {
      log('tunnel', `Warning: Webhook route check returned unexpected status (${routeCheck.detail})`, 'warn');
      webhookUrl = `${resolvedUrl}/api/webhooks/github`;
    }

    return {
      active: true,
      pid,
      child,
      publicUrl: resolvedUrl,
      webhookUrl,
      async stop() {
        if (!hasExited && isPidAlive(pid)) {
          log('tunnel', `Stopping Cloudflare Quick Tunnel [PID: ${pid}]...`);
          await terminateProcess(pid, { gracefulTimeoutMs: 3000, label: 'cloudflared tunnel' });
        }
      },
    };
  } catch (err) {
    if (!hasExited && isPidAlive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
    log('tunnel', `Tunnel startup failed: ${err.message}`, 'error');
    return {
      active: false,
      publicUrl: null,
      webhookUrl: null,
      error: err.message,
    };
  }
}

