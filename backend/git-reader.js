import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * GitReader: Lee datos desde un repositorio .git local
 *
 * ¿Cómo funciona?
 * 1. Lee .git/HEAD para saber en qué rama estamos
 * 2. Lee .git/refs/heads/* para obtener branches y sus commits
 * 3. Descomprime .git/objects/* para leer datos de commits
 */

class GitReader {
  constructor(gitPath = '.git') {
    this.gitPath = gitPath;
  }

  /**
   * Lee el contenido de un archivo git comprimido
   * Los objetos en .git/objects están en formato zlib (comprimidos)
   */
  readGitObject(hash) {
    // El hash está dividido: "abc123def" → "ab/c123def"
    const dir = hash.slice(0, 2);
    const file = hash.slice(2);
    const objectPath = path.join(this.gitPath, 'objects', dir, file);

    if (!fs.existsSync(objectPath)) {
      return null;
    }

    try {
      const compressed = fs.readFileSync(objectPath);
      const decompressed = zlib.inflateSync(compressed).toString();
      return decompressed;
    } catch (error) {
      console.error(`Error reading object ${hash}:`, error.message);
      return null;
    }
  }

  /**
   * Parsea un objeto commit
   * Formato git:
   * tree abc123...
   * parent def456...
   * author Nombre <email> timestamp +0000
   * committer Nombre <email> timestamp +0000
   *
   * Mensaje del commit
   */
  parseCommit(data) {
    if (!data) return null;

    const lines = data.split('\n');
    const commit = {
      tree: null,
      parents: [],
      author: null,
      committer: null,
      timestamp: null,
      message: ''
    };

    let messageStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Cuando llegamos a una línea vacía, el resto es el mensaje
      if (line === '') {
        messageStart = i + 1;
        break;
      }

      if (line.startsWith('tree ')) {
        commit.tree = line.slice(5);
      } else if (line.startsWith('parent ')) {
        commit.parents.push(line.slice(7));
      } else if (line.startsWith('author ')) {
        commit.author = this.parseAuthorLine(line.slice(7));
      } else if (line.startsWith('committer ')) {
        commit.committer = this.parseAuthorLine(line.slice(10));
      }
    }

    // Extrae el mensaje (puede ser multiline)
    commit.message = lines.slice(messageStart).join('\n').trim();

    return commit;
  }

  /**
   * Parsea la línea de autor: "Nombre <email> 1234567890 +0000"
   */
  parseAuthorLine(line) {
    const match = line.match(/^(.+) <(.+)> (\d+) ([\+\-]\d{4})$/);
    if (!match) return null;

    return {
      name: match[1],
      email: match[2],
      timestamp: parseInt(match[3]),
      timezone: match[4]
    };
  }

  /**
   * Lee todas las branches locales desde .git/refs/heads/
   */
  getBranches() {
    const headsPath = path.join(this.gitPath, 'refs', 'heads');
    const branches = [];

    if (!fs.existsSync(headsPath)) {
      return branches;
    }

    try {
      const files = fs.readdirSync(headsPath, { recursive: true });

      for (const file of files) {
        const branchPath = path.join(headsPath, file);
        const isFile = fs.statSync(branchPath).isFile();

        if (isFile) {
          const hash = fs.readFileSync(branchPath, 'utf8').trim();
          branches.push({
            name: file.replace(/\\/g, '/'), // Windows fix
            hash: hash,
            type: 'local'
          });
        }
      }
    } catch (error) {
      console.error('Error reading branches:', error.message);
    }

    return branches;
  }

  /**
   * Lee la rama actual desde .git/HEAD
   */
  getCurrentBranch() {
    try {
      const headPath = path.join(this.gitPath, 'HEAD');
      const content = fs.readFileSync(headPath, 'utf8').trim();

      // Formato: "ref: refs/heads/main"
      if (content.startsWith('ref: ')) {
        const ref = content.slice(5);
        return ref.replace('refs/heads/', '');
      }

      // Si no es una rama (detached HEAD)
      return content;
    } catch (error) {
      return null;
    }
  }

  /**
   * Obtiene el commit actual (HEAD)
   */
  getHeadCommit() {
    try {
      const currentBranch = this.getCurrentBranch();
      const branches = this.getBranches();
      const branch = branches.find(b => b.name === currentBranch);

      return branch ? branch.hash : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Obtiene todos los commits (hace un BFS desde HEAD)
   */
  getAllCommits() {
    const commits = new Map(); // hash → commit object
    const visited = new Set();
    const queue = [];

    // Empieza desde HEAD
    const headHash = this.getHeadCommit();
    if (!headHash) {
      return commits;
    }

    queue.push(headHash);

    while (queue.length > 0) {
      const hash = queue.shift();

      if (visited.has(hash)) continue;
      visited.add(hash);

      // Lee el objeto comprimido
      const data = this.readGitObject(hash);
      const commit = this.parseCommit(data);

      if (!commit) continue;

      commits.set(hash, {
        hash: hash.slice(0, 7), // Solo primeros 7 caracteres (como en git log)
        fullHash: hash,
        message: commit.message.split('\n')[0], // Primera línea
        author: commit.author?.name || 'Unknown',
        timestamp: commit.author?.timestamp || 0,
        parents: commit.parents
      });

      // Agrega parents a la cola para procesarlos
      for (const parent of commit.parents) {
        if (!visited.has(parent)) {
          queue.push(parent);
        }
      }
    }

    return commits;
  }

  /**
   * Determina a qué rama(s) pertenece cada commit
   * Hace un BFS desde cada rama hacia atrás
   */
  assignBranchesToCommits(commits, branches) {
    const commitToBranches = new Map();

    // Inicializa cada commit con un array vacío de branches
    for (const [hash, commit] of commits) {
      commitToBranches.set(hash, []);
    }

    // Para cada branch, marca todos los commits alcanzables desde ella
    for (const branch of branches) {
      const visited = new Set();
      const queue = [branch.hash];

      while (queue.length > 0) {
        const hash = queue.shift();
        if (visited.has(hash)) continue;
        visited.add(hash);

        const commit = commits.get(hash);
        if (!commit) continue;

        // Agrega esta rama al commit
        const branchList = commitToBranches.get(hash);
        if (branchList && !branchList.includes(branch.name)) {
          branchList.push(branch.name);
        }

        // Agrega los parents a la cola
        if (commit.parents) {
          for (const parent of commit.parents) {
            if (!visited.has(parent)) {
              queue.push(parent);
            }
          }
        }
      }
    }

    return commitToBranches;
  }

  /**
   * Asigna colores a las branches
   */
  assignColors() {
    const colors = [
      '#3fb950', // verde
      '#58a6ff', // azul
      '#d29922', // naranja
      '#a371f7', // púrpura
      '#fb8500', // rojo-naranja
      '#1f883d', // verde oscuro
      '#0969da', // azul oscuro
      '#6e40c9'  // púrpura oscuro
    ];

    const colorMap = new Map();
    const branches = this.getBranches();

    branches.forEach((branch, index) => {
      colorMap.set(branch.name, colors[index % colors.length]);
    });

    return colorMap;
  }

  /**
   * Método principal: retorna toda la estructura del grafo
   */
  getGraphData() {
    const branches = this.getBranches();
    const commits = this.getAllCommits();
    const currentBranch = this.getCurrentBranch();
    const headCommit = this.getHeadCommit();

    // Asigna branches a commits
    const commitToBranches = this.assignBranchesToCommits(commits, branches);

    // Asigna colores a branches
    const branchColors = this.assignColors();

    // Construye la estructura que el frontend necesita
    return {
      commits: Array.from(commits.values()).map(commit => ({
        ...commit,
        branches: commitToBranches.get(commit.fullHash) || [],
        color: commitToBranches.get(commit.fullHash)?.length > 0
          ? branchColors.get(commitToBranches.get(commit.fullHash)[0])
          : '#58a6ff'
      })),
      branches: branches.map(b => ({
        name: b.name,
        head: b.hash.slice(0, 7),
        fullHead: b.hash,
        type: b.type,
        color: branchColors.get(b.name)
      })),
      branchColors: Object.fromEntries(branchColors),
      HEAD: {
        branch: currentBranch,
        commit: headCommit ? headCommit.slice(0, 7) : null
      },
      timestamp: new Date().toISOString()
    };
  }
}

export default GitReader;
