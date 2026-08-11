import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({});
const __dirname = dirname(fileURLToPath(import.meta.url));

const database = process.env.DB_NAME;
const resourceArn = process.env.DB_CLUSTER_ARN;
const secretArn = process.env.DB_SECRET_ARN;

export async function handler() {
  assertConfig();

  const migrations = readdirSync(join(__dirname, "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const applied = [];
  const skipped = [];

  for (const file of migrations) {
    const version = file.replace(/\.sql$/, "");

    if (await migrationApplied(version)) {
      skipped.push(version);
      continue;
    }

    await applyMigration(file, version);
    applied.push(version);
  }

  return {
    applied,
    skipped,
  };
}

async function migrationApplied(version) {
  try {
    const result = await execute(
      "select 1 from schema_migrations where version = :version limit 1",
      [{ name: "version", value: { stringValue: version } }],
    );

    return (result.records ?? []).length > 0;
  } catch (error) {
    if (String(error.message ?? "").includes("schema_migrations")) {
      return false;
    }

    throw error;
  }
}

async function applyMigration(file, version) {
  const sql = readFileSync(join(__dirname, "migrations", file), "utf8");
  const statements = splitSqlStatements(sql);
  const transaction = await client.send(
    new BeginTransactionCommand({
      database,
      resourceArn,
      secretArn,
    }),
  );
  const transactionId = transaction.transactionId;

  try {
    for (const statement of statements) {
      const normalized = statement.trim().toLowerCase();
      if (normalized === "begin" || normalized === "commit") {
        continue;
      }

      await execute(statement, [], transactionId);
    }

    await client.send(
      new CommitTransactionCommand({
        resourceArn,
        secretArn,
        transactionId,
      }),
    );
  } catch (error) {
    await client.send(
      new RollbackTransactionCommand({
        resourceArn,
        secretArn,
        transactionId,
      }),
    );

    error.message = `Failed migration ${version}: ${error.message}`;
    throw error;
  }
}

async function execute(sql, parameters = [], transactionId = undefined) {
  return client.send(
    new ExecuteStatementCommand({
      database,
      parameters,
      resourceArn,
      secretArn,
      sql,
      transactionId,
    }),
  );
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  let dollarQuote = null;
  let lineComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      current += char;
      if (char === "\n") {
        lineComment = false;
      }
      continue;
    }

    if (!quote && !dollarQuote && char === "-" && next === "-") {
      lineComment = true;
      current += char;
      continue;
    }

    if (!quote && char === "$") {
      const match = sql.slice(index).match(/^\$[a-zA-Z0-9_]*\$/);
      if (match) {
        const tag = match[0];
        dollarQuote = dollarQuote === tag ? null : tag;
        current += tag;
        index += tag.length - 1;
        continue;
      }
    }

    if (!dollarQuote && (char === "'" || char === '"')) {
      if (quote === char && next === char) {
        current += char + next;
        index += 1;
        continue;
      }

      quote = quote === char ? null : quote ?? char;
    }

    if (!quote && !dollarQuote && char === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const finalStatement = current.trim();
  if (finalStatement) {
    statements.push(finalStatement);
  }

  return statements;
}

function assertConfig() {
  const missing = [
    ["DB_CLUSTER_ARN", resourceArn],
    ["DB_NAME", database],
    ["DB_SECRET_ARN", secretArn],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
