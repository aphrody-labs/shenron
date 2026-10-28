import { execSync } from "child_process";

const input = JSON.stringify({ id: 1, method: "pipeline.status", params: {} }) + "\n";
const res = execSync("ssh dbfr sudo docker exec -i aphrody-site-1 /usr/local/bin/koharu-sdk", {
  input,
  encoding: "utf8",
});
console.log("Result:", res);
