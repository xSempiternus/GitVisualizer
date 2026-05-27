import express from 'express';
import cors from 'cors';
import GitReader from './git-reader.js';
import path from 'path';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Instancia el GitReader
 * IMPORTANTE: Apunta al .git del proyecto raíz (GitVisualizer/.git)
 */
const gitReader = new GitReader(path.join(process.cwd(), '..', '.git'));

/**
 * Ruta principal: devuelve toda la estructura del grafo
 */
app.get('/api/git-data', (req, res) => {
  try {
    const data = gitReader.getGraphData();
    res.json(data);
  } catch (error) {
    console.error('Error fetching git data:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Ruta para debug: muestra branches
 */
app.get('/api/branches', (req, res) => {
  try {
    const branches = gitReader.getBranches();
    res.json(branches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Ruta para debug: muestra commit actual
 */
app.get('/api/head', (req, res) => {
  try {
    const head = {
      branch: gitReader.getCurrentBranch(),
      commit: gitReader.getHeadCommit()
    };
    res.json(head);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║  Git Visualizer Backend               ║
║  http://localhost:${PORT}/api/git-data      ║
╚═══════════════════════════════════════╝
  `);
  console.log('Leyendo datos desde: ' + path.join(process.cwd(), '..', '.git'));
});
