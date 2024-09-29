const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const app = express();

ffmpeg.setFfmpegPath(ffmpegPath);

// Middleware to set CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow any origin
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});
// Trust proxy
app.set('trust proxy', true);

// Rate limiter middleware for the /upload route
const uploadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many uploads, please try again later.'
});

// Configure multer for file size limit (5 MB) and file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB limit
});

// Convert non-MP3 to MP3
const convertToMp3 = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('mp3')
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', reject)
      .save(outputPath);
  });
};

// Apply rate limiter only to /upload
app.post('/upload', uploadLimiter, upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded or file is too large.');
  }

  const originalFilePath = path.join('uploads', req.file.filename);
  const ext = path.extname(req.file.filename).toLowerCase();
  const mp3FileName = uuidv4() + '.mp3';
  const mp3FilePath = path.join('uploads', mp3FileName);

  try {
    // If the file is not an MP3, convert it to MP3
    if (ext !== '.mp3') {
      await convertToMp3(originalFilePath, mp3FilePath);
      // Delete the original file after conversion
      fs.unlinkSync(originalFilePath);
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${ext === '.mp3' ? req.file.filename : mp3FileName}`;
    res.json({ url: fileUrl });
  } catch (error) {
    res.status(500).send('Error converting file to MP3.');
  }
});

app.use('/uploads', express.static('uploads'));

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
