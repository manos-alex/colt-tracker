# Local Backend Development Against Dev Database

The dev Aurora database is private. Do not make it public for local development.

Use Aurora's Data API from local backend code. The app stack already enables the Data API and stores
database credentials in Secrets Manager.

## Export Environment

From the repo root after the dev stack has been applied:

```sh
export AWS_PROFILE=colt-dev-deploy
export AWS_REGION="$(terraform -chdir=infra output -raw aws_region)"
export DB_CLUSTER_ARN="$(terraform -chdir=infra output -raw database_cluster_arn)"
export DB_SECRET_ARN="$(terraform -chdir=infra output -raw database_secret_arn)"
export DB_NAME="$(terraform -chdir=infra output -raw database_name)"
```

## Smoke Test

```sh
aws rds-data execute-statement \
  --resource-arn "$DB_CLUSTER_ARN" \
  --secret-arn "$DB_SECRET_ARN" \
  --database "$DB_NAME" \
  --sql "select table_name from information_schema.tables where table_schema = 'public' order by table_name;"
```

## TypeScript Shape

Install the SDK package in the backend package once it exists:

```sh
npm install @aws-sdk/client-rds-data
```

Minimal query helper:

```ts
import {
  ExecuteStatementCommand,
  RDSDataClient,
  type Field,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({ region: process.env.AWS_REGION });

export async function executeSql(sql: string, parameters: SqlParameter[] = []) {
  return client.send(
    new ExecuteStatementCommand({
      resourceArn: requiredEnv("DB_CLUSTER_ARN"),
      secretArn: requiredEnv("DB_SECRET_ARN"),
      database: requiredEnv("DB_NAME"),
      sql,
      parameters,
    }),
  );
}

export function fieldValue(field: Field) {
  if ("isNull" in field && field.isNull) return null;
  if ("stringValue" in field) return field.stringValue;
  if ("longValue" in field) return field.longValue;
  if ("doubleValue" in field) return field.doubleValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("blobValue" in field) return field.blobValue;
  if ("arrayValue" in field) return field.arrayValue;
  return null;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}
```

## Tradeoff

Data API is easy and secure for local development and serverless Lambda code. If the backend later
needs long transactions, high-throughput queries, or PostgreSQL driver features that Data API does
not expose well, add an SSM tunnel or RDS Proxy path instead of making the database public.
