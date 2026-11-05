
import * as fs from "fs";
import * as path from "path";

const LOG_DIR = "/home/ashutoshsahoo/Downloads/Hopper/.runtime/local/logs";
const PID_DIR = "/home/ashutoshsahoo/Downloads/Hopper/.runtime/local/pids";

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(PID_DIR)) fs.mkdirSync(PID_DIR, { recursive: true });

export function log(component, level, message) {
  const timestamp = new Date().toISOString();
  const line = `[${level}] ${timestamp} - ${component}: ${message}`;
  fs.appendFileSync(path.join(LOG_DIR, `${component}.log`), line + "
");
  process.stderr.write(line + "
");
}

export function info(component, message) {
  log(component, "INFO", message);
}

export function warn(component, message) {
  log(component, "WARN", message);
}

export function error(component, message) {
  log(component, "ERROR", message);
}
