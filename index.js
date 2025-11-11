import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { google } from 'googleapis';

const app = express();
app.use(cors());
const upload = multer({ dest: '/tmp/uploads' }); // Render usa /tmp para archivos temporales

// Variables de entorno
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const TOKEN_PATH = './token.json';

// OAuth2 client
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
let drive;

// Si ya existe el token, lo cargamos automáticamente
if (fs.existsSync(TOKEN_PATH)) {
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oauth2Client.setCredentials(token);
  drive = google.drive({ version: 'v3', auth: oauth2Client });
}

// Ruta de inicio
app.get('/', (req, res) => {
  if (!drive) {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file']
    });
    return res.send(`<h3>🚀 Autoriza la aplicación para conectar con Google Drive:</h3>
                     <a href="${authUrl}">Conectar con Google</a>`);
  } else {
    res.send('✅ Aplicación conectada a Google Drive y lista para subir archivos.');
  }
});

// Ruta de callback OAuth2
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Falta el código de autorización.');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    drive = google.drive({ version: 'v3', auth: oauth2Client });
    res.send('✅ Autenticación completada. Puedes cerrar esta pestaña.');
  } catch (error) {
    console.error('Error en OAuth2 callback:', error);
    res.status(500).send('Error autenticando con Google.');
  }
});

// Ruta para subir archivos
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!drive) return res.status(400).json({ error: 'No autorizado aún. Visita la raíz (/) para autorizar.' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const fileName = req.file.originalname;
  const mimeType = req.file.mimetype;

  try {
    const response = await drive.files.create({
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

    fs.unlink(filePath, () => {});
    res.json({ success: true, fileId: response.data.id, fileName: response.data.name });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Error uploading to Drive', details: err.message });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
