import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../static/", import.meta.url);
const html = Object.fromEntries([
  ["/pay", "human-pay.html"],
  ["/human/pay", "human-pay.html"],
  ["/human", "human.html"],
  ["/human/build", "human-build.html"],
  ["/human/studio", "human-studio.html"],
  ["/human/live", "human-live.html"],
  ["/pricing", "pricing.html"],
  ["/docs", "docs.html"],
  ["/terms", "terms.html"],
  ["/privacy", "privacy.html"],
].map(([route, filename]) => [route, readFileSync(fileURLToPath(new URL(filename, root)), "utf8")]));
const script = readFileSync(fileURLToPath(new URL("app.js", root)), "utf8");
const output = fileURLToPath(new URL("../src/human-pages.ts", import.meta.url));
writeFileSync(output, `// Generated from static/*.html and static/app.js. Do not edit.\nexport default ${JSON.stringify({ html, script })};\n`);

const swaggerRoot = new URL("../node_modules/swagger-ui-dist/", import.meta.url);
const swaggerCss = readFileSync(fileURLToPath(new URL("swagger-ui.css", swaggerRoot)), "utf8");
const swaggerJs = readFileSync(fileURLToPath(new URL("swagger-ui-bundle.js", swaggerRoot)), "utf8");
writeFileSync(fileURLToPath(new URL("../src/swagger-assets.ts", import.meta.url)),
  `// Generated from the pinned swagger-ui-dist package. Do not edit.\nexport const css = ${JSON.stringify(swaggerCss)};\nexport const js = ${JSON.stringify(swaggerJs)};\n`);
