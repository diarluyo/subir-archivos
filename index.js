import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { google } from 'googleapis';

const app = express();
app.use(cors());
const upload = multer({ dest: '/tmp/uploads' }); // Render usa /tmp para archivos temporales

// 🔧 Variables de entorno (Render)
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const TOKEN_ENV = process.env.GOOGLE_TOKENS;

// ⚙️ Crear cliente OAuth2
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
let drive;

// 🔹 Si ya existe token en las variables de entorno, cargarlo automáticamente
if (TOKEN_ENV) {
  try {
    const token = JSON.parse(TOKEN_ENV);
    oauth2Client.setCredentials(token);
    drive = google.drive({ version: 'v3', auth: oauth2Client });
    console.log('✅ Token cargado desde Render Environment');
  } catch (err) {
    console.error('❌ Error cargando token desde GOOGLE_TOKENS:', err);
  }
}

// 🔹 Página de inicio (autorización si no hay token)
app.get('/', (req, res) => {
  if (!drive) {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.file']
    });
    return res.send(`
      <h3>🚀 Autoriza la aplicación para conectar con Google Drive:</h3>
      <a href="${authUrl}">Conectar con Google</a>
    `);
  } else {
    res.send('✅ Aplicación conectada a Google Drive y lista para subir archivos.');
  }
});

// 🔹 Ruta callback de OAuth2
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Falta el código de autorización.');

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Mostrar el token en consola (solo una vez, para copiarlo a Render)
    console.log('💾 TOKEN OBTENIDO:\n', JSON.stringify(tokens, null, 2));

    res.send(`
      <h3>✅ Autenticación completada.</h3>
      <p>Copia el token mostrado en la consola de Render y agrégalo como variable GOOGLE_TOKENS.</p>
      <p>Puedes cerrar esta pestaña.</p>
    `);
  } catch (error) {
    console.error('Error en OAuth2 callback:', error);
    res.status(500).send('Error autenticando con Google.');
  }
});

// 🔹 Ruta para subir archivos al Drive
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

    // Eliminar archivo temporal
    fs.unlink(filePath, () => {});
    res.json({ success: true, fileId: response.data.id, fileName: response.data.name });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Error uploading to Drive', details: err.message });
  }
});

// 🔹 Iniciar servidor
const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
