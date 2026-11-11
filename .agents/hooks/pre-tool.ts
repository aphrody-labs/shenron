import * as fs from "node:fs";

try {
  const input = fs.readFileSync(0, "utf-8");
  const data = JSON.parse(input);
  const cmd = data.toolCall?.args?.CommandLine || "";

  if (/rm\s+-rf\s+\/srv\/shenron|docker\s+rm|docker\s+system\s+prune/i.test(cmd)) {
    console.log(JSON.stringify({
      decision: "deny",
      reason: "Blocked destructive command by Shenron safety guard."
    }));
  } else {
    console.log(JSON.stringify({
      decision: "allow"
    }));
  }
} catch (e) {
  console.log(JSON.stringify({
    decision: "allow"
  }));
}
