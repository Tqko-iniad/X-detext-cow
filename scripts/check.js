const fs = require("node:fs");

for (const file of ["manifest.json"]) {
  JSON.parse(fs.readFileSync(file, "utf8"));
}

for (const file of ["background.js", "content.js", "popup.js"]) {
  new Function(fs.readFileSync(file, "utf8"));
}

const requiredFiles = [
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "popup.html",
  "popup.css",
  "popup.js",
  "PRIVACY.md",
  "LICENSE"
];

const missingFiles = requiredFiles.filter((file) => !fs.existsSync(file));
if (missingFiles.length > 0) {
  throw new Error(`Missing required files: ${missingFiles.join(", ")}`);
}

console.log("Extension files look good.");
