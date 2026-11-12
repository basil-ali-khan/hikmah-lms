import { execFileSync } from "node:child_process";
import path from "node:path";

/** Fresh, known dev data before every run. Refuses outside DEBUG (enforced by the command). */
export default function globalSetup() {
  const backend = path.resolve(__dirname, "../../backend");
  execFileSync("uv", ["run", "python", "manage.py", "seed_dev", "--reset"], { cwd: backend, stdio: "inherit" });
}
