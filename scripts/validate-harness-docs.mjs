#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();

const artifactGroups = [
  {
    aliases: ["AGENTS.md"],
    label: "agent contract",
    type: "file",
  },
  {
    aliases: ["README.md"],
    label: "repo overview",
    type: "file",
  },
  {
    aliases: ["docs/QUALITY.md"],
    label: "quality guide",
    type: "file",
  },
  {
    aliases: ["ARCHITECTURE.md", "docs/ARCHITECTURE.md"],
    label: "architecture guide",
    type: "file",
  },
  {
    aliases: ["docs/product-specs/README.md", "docs/product-specs.md"],
    label: "product specs index",
    type: "file",
  },
  {
    aliases: [
      "docs/exec-plans/README.md",
      "docs/exec-plans.md",
      "docs/PLANS.md",
    ],
    label: "execution plans index",
    type: "file",
  },
  {
    aliases: ["docs/exec-plans/active", "docs/exec-plans/in-progress"],
    label: "active execution plans directory",
    type: "directory",
  },
  {
    aliases: ["docs/exec-plans/completed", "docs/exec-plans/archive"],
    label: "completed execution plans directory",
    type: "directory",
  },
];

const linkExpectations = [
  {
    aliases: ["ARCHITECTURE.md", "docs/ARCHITECTURE.md"],
    label: "architecture guide",
    requiredIn: "AGENTS.md",
  },
  {
    aliases: ["docs/exec-plans", "docs/exec-plans.md", "docs/PLANS.md"],
    label: "execution plans docs",
    requiredIn: "AGENTS.md",
  },
  {
    aliases: ["docs/QUALITY.md"],
    label: "quality guide",
    requiredIn: "AGENTS.md",
  },
  {
    aliases: ["docs/product-specs", "docs/product-specs/README.md"],
    label: "product specs index",
    requiredIn: "AGENTS.md",
  },
  {
    aliases: ["ARCHITECTURE.md", "docs/ARCHITECTURE.md"],
    label: "architecture guide",
    requiredIn: "README.md",
  },
  {
    aliases: ["docs/QUALITY.md"],
    label: "quality guide",
    requiredIn: "README.md",
  },
  {
    aliases: ["docs/product-specs", "docs/product-specs/README.md"],
    label: "product specs index",
    requiredIn: "README.md",
  },
];

const indexLinkExpectations = [
  {
    aliases: ["docs/exec-plans/active", "docs/exec-plans/in-progress"],
    label: "active execution plans directory",
  },
  {
    aliases: ["docs/exec-plans/completed", "docs/exec-plans/archive"],
    label: "completed execution plans directory",
  },
];

/**
 * Checks whether a repo-relative path exists with the expected filesystem type.
 * @param relativePath - Path relative to the repository root.
 * @param expectedType - Expected file-system type.
 * @returns Whether the path exists with the expected type.
 */
async function pathExists(relativePath, expectedType) {
  try {
    const details = await stat(path.join(repoRoot, relativePath));
    if (expectedType === "directory") {
      return details.isDirectory();
    }
    return details.isFile();
  } catch {
    return false;
  }
}

/**
 * Reads a UTF-8 text file from the repository root.
 * @param relativePath - Path relative to the repository root.
 * @returns The decoded file contents.
 */
async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

/**
 * Checks whether any alias string is mentioned in a document.
 * @param content - File content to inspect.
 * @param aliases - Allowed path aliases to search for.
 * @returns Whether any alias appears in the content.
 */
function referencesAny(content, aliases) {
  return aliases.some((alias) => content.includes(alias));
}

/**
 * Resolves the first existing artifact from an alias group.
 * @param group - Artifact group to resolve.
 * @returns The first matching repo-relative path.
 */
async function resolveArtifact(group) {
  for (const candidate of group.aliases) {
    if (await pathExists(candidate, group.type)) {
      return candidate;
    }
  }
  return null;
}

const issues = [];
const resolvedArtifacts = new Map();

for (const group of artifactGroups) {
  const resolved = await resolveArtifact(group);
  if (!resolved) {
    issues.push(
      `Missing ${group.label}. Expected one of: ${group.aliases.join(", ")}`,
    );
    continue;
  }
  resolvedArtifacts.set(group.label, resolved);
}

for (const expectation of linkExpectations) {
  if (!(await pathExists(expectation.requiredIn, "file"))) {
    continue;
  }

  const content = await readText(expectation.requiredIn);
  if (!referencesAny(content, expectation.aliases)) {
    issues.push(
      `${expectation.requiredIn} does not reference the ${expectation.label}.`,
    );
  }
}

const executionPlansIndex = resolvedArtifacts.get("execution plans index");
if (executionPlansIndex) {
  const indexContent = await readText(executionPlansIndex);
  for (const expectation of indexLinkExpectations) {
    if (!referencesAny(indexContent, expectation.aliases)) {
      issues.push(
        `${executionPlansIndex} does not reference the ${expectation.label}.`,
      );
    }
  }
}

if (issues.length > 0) {
  console.error("Harness docs validation failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exitCode = 1;
} else {
  console.log("Harness docs validation passed.");
  for (const [label, resolved] of resolvedArtifacts.entries()) {
    console.log(`- ${label}: ${resolved}`);
  }
}
