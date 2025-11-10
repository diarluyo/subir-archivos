import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { google } from 'googleapis';
import path from 'path';

const app = express();
app.use(cors()); // permite peticiones desde tu frontend (configura origen en prod)
const upload = multer({ dest: '/tmp/uploads' }); // /tmp/uploads también funciona en Render

// CONFIG via environment variables (setearás en Render)
const FOLDER_ID = process.env.DRIVE_FOLDER_ID; // ID de la carpeta en Drive
const SERVICE_ACCOUNT_KEY_PATH = process.env.GCP_SERVICE_KEY_PATH || '/etc/secrets/service_account.json';
// alternativa: si subiste la key como secret file en Render, estará en /etc/secrets/<name>

if (!FOLDER_ID) {
  console.error('ERROR: falta la variable DRIVE_FOLDER_ID');
  process.exit(1);
}

// Autenticación con la service account
const auth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_KEY_PATH,
  scopes: ['https://www.googleapis.com/auth/drive.file']
});

const driveClient = google.drive({ version: 'v3', auth });

app.get('/', (req, res) => res.send('Drive uploader backend running'));

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const fileName = req.file.originalname;
  const mimeType = req.file.mimetype;

  try {
    const response = await driveClient.files.create({
      requestBody: {
        name: fileName,
        parents: [FOLDER_ID]
      },
      media: {
        mimeType,
        body: fs.createReadStream(filePath)
      },
      fields: 'id, name'
    });

    // Limpia archivo temporal
    fs.unlink(filePath, (err) => { if (err) console.error('unlink error', err); });

    res.json({ success: true, fileId: response.data.id, fileName: response.data.name });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Error uploading to Drive', details: err.message });
  }
});

// puerto que Render expecta: usar process.env.PORT
const port = Number(process.env.PORT || 10000);
app.listen(port, () => console.log(`Server listening on port ${port}`));
