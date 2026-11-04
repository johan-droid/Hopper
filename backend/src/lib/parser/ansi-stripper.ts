/**
 * Strips ANSI escape sequences, GitHub Actions timestamps, and internal runner noise.
 */

export const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
export const GH_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/gm;
export const GH_RUNNER_NOISE_REGEX = /^##\[(group|endgroup|command|debug)\].*$/gm;

export function stripAnsiAndRunnerNoise(raw: string): string {
  return raw
    .replace(ANSI_REGEX, '')
    .replace(GH_TIMESTAMP_REGEX, '')
    .replace(GH_RUNNER_NOISE_REGEX, '');
}
