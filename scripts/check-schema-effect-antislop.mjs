import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]);

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", "dist", ".git", ".alchemy"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(path)));
      continue;
    }
    if (sourceExtensions.has(extname(path))) files.push(path);
  }
  return files;
};

const isSourceFile = (path) => {
  const normalized = path.replaceAll("\\", "/");
  return !normalized.includes("/test/") && !/\.(?:test|spec)\.[^.]+$/.test(normalized);
};

const maskNonCode = (source) => {
  let result = "";
  let mode = "code";
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (mode === "code") {
      if (character === "/" && next === "/") {
        result += "  ";
        mode = "line-comment";
        index += 1;
        continue;
      }
      if (character === "/" && next === "*") {
        result += "  ";
        mode = "block-comment";
        index += 1;
        continue;
      }
      if (character === "\"" || character === "'" || character === "`") {
        result += " ";
        mode = "string";
        quote = character;
        continue;
      }
      result += character;
      continue;
    }
    if (mode === "line-comment") {
      result += character === "\n" ? "\n" : " ";
      if (character === "\n") mode = "code";
      continue;
    }
    if (mode === "block-comment") {
      result += character === "\n" ? "\n" : " ";
      if (character === "*" && next === "/") {
        result += " ";
        mode = "code";
        index += 1;
      }
      continue;
    }
    result += character === "\n" ? "\n" : " ";
    if (character === "\\") {
      result += next === "\n" ? "\n" : " ";
      index += 1;
      continue;
    }
    if (character === quote) mode = "code";
  }
  return result;
};

const lineNumber = (source, offset) => source.slice(0, offset).split("\n").length;

const findClosingParen = (source, openingIndex) => {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
};

const reportUnusedSchemas = ({ path, source, maskedSource, report }) => {
  const declarationPattern = /(?<![\w$])(?:(?:export\s+)?const)\s+([A-Za-z_$][\w$]*Schema)\s*=\s*(?:Schema\.|[A-Za-z_$][\w$]*\.schemas\.)/g;
  for (const match of maskedSource.matchAll(declarationPattern)) {
    const name = match[1];
    if (/export\s+const/.test(match[0])) continue;
    const identifierPattern = new RegExp(`(?:^|[^A-Za-z0-9_$])${name}(?![A-Za-z0-9_$])`, "g");
    const references = maskedSource.match(identifierPattern)?.length ?? 0;
    if (references <= 1) {
      report(path, lineNumber(source, match.index), `schema declaration ${name} is never used; delete it or route it through the owning contract.`);
    }
  }
};

const reportDuplicateInlineSchemas = ({ path, source, maskedSource, report }) => {
  const callPattern = /\bSchema\.(Struct|Union|Literals|Array|Tuple|Record)\s*\(/g;
  const calls = [];
  for (const match of maskedSource.matchAll(callPattern)) {
    const openingIndex = maskedSource.indexOf("(", match.index);
    const closingIndex = findClosingParen(maskedSource, openingIndex);
    if (closingIndex === undefined) continue;
    const expression = source.slice(match.index, closingIndex + 1);
    const declarationPrefix = maskedSource.slice(Math.max(0, match.index - 120), match.index);
    calls.push({
      end: closingIndex,
      key: expression.replace(/\s+/g, " ").trim(),
      named: /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*$/.test(declarationPrefix),
      start: match.index,
    });
  }
  const topLevelCalls = calls.filter(
    (call) => !calls.some((parent) => parent.start < call.start && parent.end >= call.end),
  );
  const callsByExpression = new Map();
  for (const call of topLevelCalls.filter((item) => !item.named)) {
    const locations = callsByExpression.get(call.key) ?? [];
    locations.push(call.start);
    callsByExpression.set(call.key, locations);
  }
  for (const [expression, locations] of callsByExpression) {
    if (locations.length < 2) continue;
    for (const location of locations.slice(1)) {
      report(
        path,
        lineNumber(source, location),
        `duplicate inline schema ${expression}; declare one named schema and reuse it.`,
      );
    }
  }
};

const reportUnnecessaryProviderWrappers = ({ path, source, maskedSource, report }) => {
  const patterns = [
    /Effect\.provide\s*\(\s*Effect\.(?:succeed|fail)\s*\(/g,
    /Effect\.(?:succeed|fail)\s*\([^\n]*\)\s*\.pipe\s*\(\s*Effect\.provide\s*\(/g,
    /Effect\.provide\s*\(\s*Effect\.provide\s*\(/g,
  ];
  for (const pattern of patterns) {
    for (const match of maskedSource.matchAll(pattern)) {
      report(path, lineNumber(source, match.index), "unnecessary Effect/provider wrapper; provide a layer only to an effect that reads that service, and compose nested layers once.");
    }
  }
};

const main = async () => {
  const roots = [join(repositoryRoot, "apps"), join(repositoryRoot, "packages")];
  const paths = (await Promise.all(roots.map(filesUnder))).flat().filter(isSourceFile);
  const violations = [];
  const report = (path, line, message) =>
    violations.push(`${relative(repositoryRoot, path)}:${line}: ${message}`);

  for (const path of paths) {
    const source = await readFile(path, "utf8");
    const maskedSource = maskNonCode(source);
    reportUnusedSchemas({ path, source, maskedSource, report });
    reportDuplicateInlineSchemas({ path, source, maskedSource, report });
    reportUnnecessaryProviderWrappers({ path, source, maskedSource, report });
  }

  if (violations.length > 0) {
    console.error(`Schema/effect anti-slop check failed with ${violations.length} violation(s):`);
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
    return;
  }
  console.log("Schema/effect anti-slop check passed.");
};

await main();
