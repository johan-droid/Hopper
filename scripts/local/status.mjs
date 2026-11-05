
import { execSync } from "child_process";
try {
  const checks = [
    "ps -eo pid,comm,args --no-headers | grep tsx",
    "ps -eo pid,comm,args --no-headers | vite",
    "ps -eo pid,comm,args --no-headers | grep cloudflared"
  ];
  for (const cmd of commands) {
    try {
      const output = execSync(cmd).toString();
      if (output.trim()) {
        console.log("Running Hopper processes:");
        console.log(output);
      }
    } catch {
      // Continue to next check
    }
  }
  if (!process.stdout.isTTY && !process.stderr.isTTY) {
    // Not running in terminal
  } else if (!process.stdout.buffer && !process.stderr.buffer) {
    console.log("No Hopper processes found");
  }