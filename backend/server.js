import express from 'express';
import cors from 'cors';
import GitReader from './git-reader.js';
import GitAnalyzer from './git-analyzer.js';
import path from 'path';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Repo path - directorio donde está el .git
 */
const REPO_PATH = path.join(process.cwd(), '..');

/**
 * Instancia el GitReader (lee .git/ directamente)
 */
const gitReader = new GitReader(path.join(REPO_PATH, '.git'));

/**
 * Instancia el GitAnalyzer (ejecuta git commands para sugerencias)
 */
const gitAnalyzer = new GitAnalyzer(REPO_PATH);

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
 * Sugerencias inteligentes basadas en el estado del repo
 */
app.get('/api/suggestions', (req, res) => {
  try {
    const suggestions = gitAnalyzer.getSuggestions();
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Estado completo del repo (para debug)
 */
app.get('/api/repo-status', (req, res) => {
  try {
    const status = gitAnalyzer.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Ejecutar una acción git sugerida
 * Body: { command: "git push origin master" }
 */
app.post('/api/execute-action', (req, res) => {
  try {
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    // Whitelist de comandos permitidos por seguridad
    const allowedCommands = [
      'git add',
      'git commit',
      'git push',
      'git pull',
      'git checkout',
      'git merge',
      'git branch -d',
      'git status'
    ];

    const isAllowed = allowedCommands.some(allowed => command.startsWith(allowed));

    if (!isAllowed) {
      return res.status(403).json({
        error: `Comando no permitido. Permitidos: ${allowedCommands.join(', ')}`
      });
    }

    const result = gitAnalyzer.executeAction(command);
    res.json(result);
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
