import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
  type Field,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";
import { getDatabaseConfig } from "../config.js";

export type QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
  rows: Row[];
};

const client = new RDSDataClient({});

export async function executeSql<Row extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  parameters: SqlParameter[] = [],
  transactionId?: string,
): Promise<QueryResult<Row>> {
  const config = getDatabaseConfig();
  const result = await sendWithResumeRetry(() =>
    client.send(
      new ExecuteStatementCommand({
        database: config.databaseName,
        includeResultMetadata: true,
        parameters,
        resourceArn: config.clusterArn,
        secretArn: config.secretArn,
        sql,
        transactionId,
      }),
    ),
  );

  return {
    rows: recordsToRows<Row>(result.columnMetadata?.map((column) => column.name ?? "") ?? [], result.records ?? []),
  };
}

export async function withTransaction<T>(callback: (transactionId: string) => Promise<T>): Promise<T> {
  const config = getDatabaseConfig();
  const transaction = await sendWithResumeRetry(() =>
    client.send(
      new BeginTransactionCommand({
        database: config.databaseName,
        resourceArn: config.clusterArn,
        secretArn: config.secretArn,
      }),
    ),
  );
  const transactionId = transaction.transactionId;

  if (!transactionId) {
    throw new Error("Failed to start database transaction.");
  }

  try {
    const result = await callback(transactionId);
    await client.send(
      new CommitTransactionCommand({
        resourceArn: config.clusterArn,
        secretArn: config.secretArn,
        transactionId,
      }),
    );

    return result;
  } catch (error) {
    await client.send(
      new RollbackTransactionCommand({
        resourceArn: config.clusterArn,
        secretArn: config.secretArn,
        transactionId,
      }),
    );

    throw error;
  }
}

export function sqlParam(name: string, value: unknown): SqlParameter {
  if (value === null || value === undefined) {
    return { name, value: { isNull: true } };
  }

  if (typeof value === "string") {
    return { name, value: { stringValue: value } };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { name, value: { longValue: value } }
      : { name, value: { doubleValue: value } };
  }

  if (typeof value === "boolean") {
    return { name, value: { booleanValue: value } };
  }

  return { name, value: { stringValue: JSON.stringify(value) }, typeHint: "JSON" };
}

export function fieldValue(field: Field): unknown {
  if ("isNull" in field && field.isNull) return null;
  if ("stringValue" in field) return field.stringValue;
  if ("longValue" in field) return field.longValue;
  if ("doubleValue" in field) return field.doubleValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("blobValue" in field) return field.blobValue;
  if ("arrayValue" in field) return field.arrayValue;
  return null;
}

function recordsToRows<Row extends Record<string, unknown>>(columns: string[], records: Field[][]): Row[] {
  return records.map((record) => {
    const row: Record<string, unknown> = {};

    record.forEach((field, index) => {
      const column = columns[index];
      if (column) {
        row[column] = fieldValue(field);
      }
    });

    return row as Row;
  });
}

async function sendWithResumeRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isDatabaseResuming(error) || attempt === 5) {
        throw error;
      }

      await delay(1000 * (attempt + 1));
    }
  }

  throw lastError;
}

function isDatabaseResuming(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "DatabaseResumingException" || error.message.includes("is resuming after being auto-paused"))
  );
}

function delay(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
