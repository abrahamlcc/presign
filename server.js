import express from "express";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const app = express();
app.use(express.json());

const {
  S3_ENDPOINT,
  S3_REGION = "hel1",
  S3_ACCESS_KEY,
  S3_SECRET_KEY,
  S3_BUCKET,
  PRESIGN_EXPIRES_SECONDS = "900",
  PRESIGN_API_KEY,
} = process.env;

if (!S3_ENDPOINT || !S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET || !PRESIGN_API_KEY) {
  console.error("Missing required env vars");
  process.exit(1);
}

const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
  forcePathStyle: false, // Hetzner soporta virtual-host style
});

app.get("/presign", async (req, res) => {
  try {
    const apiKey = req.header("x-api-key");
    if (apiKey !== PRESIGN_API_KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const key = req.query.key;
    if (!key || typeof key !== "string") {
      return res.status(400).json({ error: "missing key" });
    }

    // (Opcional) seguridad: bloquear paths raros
    if (key.includes("..") || key.startsWith("/")) {
      return res.status(400).json({ error: "invalid key" });
    }

    const cmd = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(s3, cmd, { expiresIn: parseInt(PRESIGN_EXPIRES_SECONDS, 10) });

    return res.json({ url, expiresIn: parseInt(PRESIGN_EXPIRES_SECONDS, 10) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "presign_failed" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`presign listening on ${port}`));
