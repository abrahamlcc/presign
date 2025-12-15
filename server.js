import express from "express";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const app = express();
app.use(express.json());

// ---- Health & root (para EasyPanel/Proxy) ----
app.get("/", (req, res) => res.status(200).send("presign up"));
app.get("/health", (req, res) => res.status(200).send("ok"));

// ---- ENV ----
const {
  S3_ENDPOINT,              // ej: https://hel1.your-objectstorage.com
  S3_REGION = "hel1",       // ej: hel1
  S3_ACCESS_KEY,
  S3_SECRET_KEY,
  S3_BUCKET,                // ej: lofiarts-digital
  PRESIGN_EXPIRES_SECONDS = "900", // 15 min por defecto
  PRESIGN_API_KEY           // clave para proteger el endpoint
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

requireEnv("S3_ENDPOINT", S3_ENDPOINT);
requireEnv("S3_ACCESS_KEY", S3_ACCESS_KEY);
requireEnv("S3_SECRET_KEY", S3_SECRET_KEY);
requireEnv("S3_BUCKET", S3_BUCKET);
requireEnv("PRESIGN_API_KEY", PRESIGN_API_KEY);

// ---- S3 client (Hetzner S3 compatible) ----
const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
  // En Hetzner normalmente funciona virtual-host style (bucket.subdominio)
  // Si tuvieras problemas, podríamos cambiar a true.
  forcePathStyle: false,
});

// ---- Presign endpoint ----
// GET /presign?key=MLM-TEST.pdf
app.get("/presign", async (req, res) => {
  try {
    // Auth simple por header
    const apiKey = req.header("x-api-key");
    if (apiKey !== PRESIGN_API_KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const key = req.query.key;
    if (!key || typeof key !== "string") {
      return res.status(400).json({ error: "missing key" });
    }

    // Seguridad básica contra paths raros
    if (key.includes("..") || key.startsWith("/")) {
      return res.status(400).json({ error: "invalid key" });
    }

    const cmd = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const expiresIn = Math.max(60, parseInt(PRESIGN_EXPIRES_SECONDS, 10) || 900);

    const url = await getSignedUrl(s3, cmd, { expiresIn });

    return res.json({ url, expiresIn });
  } catch (err) {
    console.error("presign_failed:", err);
    return res.status(500).json({ error: "presign_failed" });
  }
});

// ---- Listen (EasyPanel) ----
const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`presign listening on ${port}`);
});
