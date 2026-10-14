import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

function isMongoConnectionString(value: string) {
  return value.startsWith("mongodb+srv://") || value.startsWith("mongodb://");
}

function readEnv(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value || value === "undefined") return "";
  return value;
}

/** Standard (non-SRV) URI — works when mongodb+srv DNS fails on Windows */
function buildStandardMongoUri(): string {
  const direct = readEnv("MONGODB_URI_STANDARD");
  if (direct && isMongoConnectionString(direct)) {
    return direct;
  }

  const user = readEnv("MONGODB_USER");
  const password = readEnv("MONGODB_PASSWORD");
  const hosts = readEnv("MONGODB_STANDARD_HOSTS");
  const dbName = readEnv("MONGODB_DB_NAME") || "tracker_app";

  if (user && password && hosts) {
    const encodedUser = encodeURIComponent(user);
    const encodedPass = encodeURIComponent(password);
    return `mongodb://${encodedUser}:${encodedPass}@${hosts}/${dbName}?ssl=true&authSource=admin&retryWrites=true&w=majority`;
  }

  return "";
}

function buildSrvMongoUri(): string {
  const direct = readEnv("MONGODB_URI");
  if (direct && !direct.includes("YOUR_CLUSTER") && isMongoConnectionString(direct)) {
    return direct;
  }

  const legacy = readEnv("DATABASE_URL");
  if (legacy && isMongoConnectionString(legacy) && !legacy.includes("YOUR_CLUSTER")) {
    return legacy;
  }

  const user = readEnv("MONGODB_USER");
  const password = readEnv("MONGODB_PASSWORD");
  const host = readEnv("MONGODB_CLUSTER_HOST");
  const dbName = readEnv("MONGODB_DB_NAME") || "tracker_app";

  if (user && password && host) {
    const encodedUser = encodeURIComponent(user);
    const encodedPass = encodeURIComponent(password);
    return `mongodb+srv://${encodedUser}:${encodedPass}@${host}/${dbName}?retryWrites=true&w=majority`;
  }

  return "";
}

function buildMongoUri(): string {
  // Prefer standard URI (avoids querySrv ECONNREFUSED on some Windows networks)
  const standard = buildStandardMongoUri();
  if (standard) return standard;

  return buildSrvMongoUri();
}

export function getMongoUri(): string {
  return buildMongoUri();
}

export function isMongoUriConfigured(): boolean {
  const uri = getMongoUri();
  return Boolean(uri) && !uri.includes("YOUR_CLUSTER");
}

export const env = {
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  get mongoUri() {
    return getMongoUri();
  },
  mongoDbName: readEnv("MONGODB_DB_NAME") || "tracker_app",
  databaseUrl: process.env.DATABASE_URL ?? "",
};
