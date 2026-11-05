
import * as fs from "fs";
import * as path from "path";

console.log("Hopper local development orchestrator");

// Simple check for Docker
try {
  require("child_process").execSync("docker ps > /dev/null 2>&1");
  console.log("Docker is available");
} catch {
  console.log("Docker not available");
}

// Check backend .env
const backendEnv = "/home/ashutoshsahoo/Downloads/Hopper/backend/.env";
if (fs.existsSync(backendEnv)) {
  console.log("Backend .env found");
} else {
  console.log("Backend .env not found");
}

// Check frontend .env
const frontendEnv = "/home/ashutoshsahoo/Downloads/Hopper/frontend/.env";
if (fs.existsSync(frontendEnv)) {
  console.log("Frontend .env found");
} else {
  console.log("Frontend .env not found");
}

console.log("Hopper orchestrator ready.");
