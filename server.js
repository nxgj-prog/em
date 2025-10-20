const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite (use env for persistent path if set)
const dbPath = process.env.DATA_DIR || __dirname;
const db = new sqlite3.Database(path.join(dbPath, 'mail-tracker.db'), (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database.');
    // Create tables if not existing
    db.run(`CREATE TABLE IF NOT EXISTS pixels (
      id TEXT PRIMARY KEY,
      name TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pixelId TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip TEXT,
      userAgent TEXT,
      FOREIGN KEY (pixelId) REFERENCES pixels (id)
    )`);
  }
});

// Middleware to get baseUrl (uses Railway's public URL)
app.use((req, res, next) => {
  const protocol = req.protocol;
  const host = req.get('host');
  res.locals.baseUrl = `${protocol}://${host}`;
  next();
});

// Dashboard: list all pixels
app.get('/', (req, res) => {
  db.all('SELECT * FROM pixels ORDER BY createdAt DESC', (err, pixels) => {
    if (err) {
      res.status(500).send('Database error');
    } else {
      res.render('index', { pixels });
    }
  });
});

// Create pixel
app.post('/create', (req, res) => {
  const pixelId = uuidv4();
  const name = req.body.name || 'Unnamed Pixel';
  db.run('INSERT INTO pixels (id, name) VALUES (?, ?)', [pixelId, name], (err) => {
    if (err) {
      res.status(500).send('Database error');
    } else {
      res.redirect('/');
    }
  });
});

// The tracker route
app.get('/tracker/:id.png', (req, res) => {
  const pixelId = req.params.id;
  db.get('SELECT * FROM pixels WHERE id = ?', [pixelId], (err, pixel) => {
    if (err || !pixel) {
      // If pixel not found, still serve a pixel to avoid errors
      return res.sendFile(path.join(__dirname, 'public', 'images', 'pixel.png'));
    }
    // Log the open
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    db.run('INSERT INTO logs (pixelId, ip, userAgent) VALUES (?, ?, ?)', [pixelId, ip, userAgent]);
  });
  // Serve the real pixel.png
  res.sendFile(path.join(__dirname, 'public', 'images', 'pixel.png'));
});

// View logs
app.get('/logs/:id', (req, res) => {
  const pixelId = req.params.id;
  db.get('SELECT * FROM pixels WHERE id = ?', [pixelId], (err, pixel) => {
    if (err || !pixel) {
      return res.status(404).send('Pixel not found');
    }
    db.all('SELECT * FROM logs WHERE pixelId = ? ORDER BY timestamp DESC', [pixelId], (err, logs) => {
      if (err) {
        res.status(500).send('Database error');
      } else {
        res.render('logs', { pixel, logs });
      }
    });
  });
});

// Start server (Railway sets PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
