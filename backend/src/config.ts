export type AppConfig = {
  database?: DatabaseConfig;
  environment: string;
  projectName: string;
  port: number;
};

export type DatabaseConfig = {
  clusterArn: string;
  databaseName: string;
  secretArn: string;
};

export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    database: getOptionalDatabaseConfig(env),
    environment: env.ENVIRONMENT ?? "local",
    projectName: env.PROJECT_NAME ?? "colt-tracker",
    port: parsePort(env.PORT),
  };
}

export function getDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const config = getOptionalDatabaseConfig(env);
  if (!config) {
    throw new Error("Missing required database environment variables: DB_CLUSTER_ARN, DB_NAME, DB_SECRET_ARN");
  }

  return config;
}

function getOptionalDatabaseConfig(env: NodeJS.ProcessEnv): DatabaseConfig | undefined {
  const clusterArn = env.DB_CLUSTER_ARN;
  const databaseName = env.DB_NAME;
  const secretArn = env.DB_SECRET_ARN;

  if (!clusterArn && !databaseName && !secretArn) return undefined;

  const missing = [
    ["DB_CLUSTER_ARN", clusterArn],
    ["DB_NAME", databaseName],
    ["DB_SECRET_ARN", secretArn],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required database environment variables: ${missing.join(", ")}`);
  }

  return {
    clusterArn: clusterArn as string,
    databaseName: databaseName as string,
    secretArn: secretArn as string,
  };
}

function parsePort(value: string | undefined) {
  if (!value) return 8787;

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
}
