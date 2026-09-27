import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../static/", import.meta.url);

const imageData = Object.fromEntries([
  ["/agentic-human-robot-hero.webp", ["agentic-human-robot-hero.webp", "image/webp"]],
  ["/buildawallet-human-robot.webp", ["buildawallet-human-robot.webp", "image/webp"]],
  ["/human-robot-center.webp", ["human-robot-center.webp", "image/webp"]],
].map(([publicPath, [filename, mime]]) => {
  const bytes = readFileSync(fileURLToPath(new URL(filename, root)));
  return [publicPath, `data:${mime};base64,${bytes.toString("base64")}`];
}));

function readHtml(filename, { inlineArtwork = true } = {}) {
  let source = readFileSync(fileURLToPath(new URL(filename, root)), "utf8");
  if (!inlineArtwork) return source;
  for (const [publicPath, dataUrl] of Object.entries(imageData)) {
    source = source.split(publicPath).join(dataUrl);
  }
  return source;
}

const html = Object.fromEntries([
  ["/", "index.html", false],
  ["/pay", "human-pay.html", true],
  ["/human/pay", "human-pay.html", true],
  ["/human", "human.html", true],
  ["/human/build", "human-build.html", true],
  ["/human/studio", "human-studio.html", true],
  ["/human/live", "human-live.html", true],
  ["/pricing", "pricing.html", false],
  ["/docs", "docs.html", false],
  ["/terms", "terms.html", false],
  ["/privacy", "privacy.html", false],
].map(([route, filename, inlineArtwork]) => [route, readHtml(filename, { inlineArtwork })]));

const script = readFileSync(fileURLToPath(new URL("app.js", root)), "utf8");
const style = readFileSync(fileURLToPath(new URL("human.css", root)), "utf8");
const output = fileURLToPath(new URL("../src/human-pages.ts", import.meta.url));
writeFileSync(output, `// Generated from static/*.html and static/app.js. Do not edit.\nexport default ${JSON.stringify({ html, script, style })};\n`);

const swaggerRoot = new URL("../node_modules/swagger-ui-dist/", import.meta.url);
const swaggerCss = readFileSync(fileURLToPath(new URL("swagger-ui.css", swaggerRoot)), "utf8");
const swaggerJs = readFileSync(fileURLToPath(new URL("swagger-ui-bundle.js", swaggerRoot)), "utf8");
writeFileSync(fileURLToPath(new URL("../src/swagger-assets.ts", import.meta.url)),
  `// Generated from the pinned swagger-ui-dist package. Do not edit.\nexport const css = ${JSON.stringify(swaggerCss)};\nexport const js = ${JSON.stringify(swaggerJs)};\n`);
