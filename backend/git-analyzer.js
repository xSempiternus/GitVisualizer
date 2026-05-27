import { execSync } from 'child_process'
import path from 'path'

/**
 * GitAnalyzer: Analiza el estado del repo y sugiere acciones
 *
 * Detecta patrones comunes del flujo Git y devuelve sugerencias
 * accionables (con su comando correspondiente).
 */

class GitAnalyzer {
  constructor(repoPath = '.') {
    this.repoPath = repoPath
  }

  /**
   * Ejecuta un comando git en el repo
   */
  exec(cmd) {
    try {
      return execSync(`git ${cmd}`, {
        cwd: this.repoPath,
        encoding: 'utf8'
      }).trim()
    } catch (error) {
      return null
    }
  }

  /**
   * Obtiene el estado completo del repo
   */
  getStatus() {
    try {
      const currentBranch = this.exec('rev-parse --abbrev-ref HEAD')
      const remoteBranch = this.exec(`rev-parse --abbrev-ref ${currentBranch}@{upstream}`) || null

      // Untracked files
      const untrackedRaw = this.exec('ls-files --others --exclude-standard') || ''
      const untracked = untrackedRaw.split('\n').filter(Boolean)

      // Modified files (staged y unstaged)
      const modifiedRaw = this.exec('diff --name-only HEAD') || ''
      const modified = modifiedRaw.split('\n').filter(Boolean)

      // Commits ahead/behind del remote
      let ahead = 0, behind = 0
      if (remoteBranch) {
        const aheadBehind = this.exec(`rev-list --left-right --count ${remoteBranch}...HEAD`)
        if (aheadBehind) {
          const [b, a] = aheadBehind.split('\t').map(n => parseInt(n) || 0)
          behind = b
          ahead = a
        }
      }

      // Branches mergeadas (ya integradas a la rama actual)
      const mergedBranchesRaw = this.exec('branch --merged') || ''
      const mergedBranches = mergedBranchesRaw
        .split('\n')
        .map(b => b.trim().replace(/^\*\s+/, ''))
        .filter(b => b && b !== currentBranch && b !== 'main' && b !== 'master')

      // Todas las ramas
      const allBranchesRaw = this.exec('branch') || ''
      const allBranches = allBranchesRaw
        .split('\n')
        .map(b => b.trim().replace(/^\*\s+/, ''))
        .filter(Boolean)

      return {
        currentBranch,
        remoteBranch,
        hasRemote: !!remoteBranch,
        untracked,
        modified,
        ahead,
        behind,
        mergedBranches,
        allBranches
      }
    } catch (error) {
      console.error('Error getting git status:', error.message)
      return null
    }
  }

  /**
   * Analiza el estado y genera sugerencias inteligentes en orden de flujo Git:
   *
   * Flujo natural: edit → stage → commit → push → merge → cleanup
   *
   * Solo muestra el SIGUIENTE paso que tiene sentido. Si hay cambios sin commit,
   * NO sugerimos push (push primero requiere commit).
   */
  getSuggestions() {
    const status = this.getStatus()
    if (!status) return []

    const suggestions = []

    // ============================================
    // PASO 1: ¿Hay cambios pendientes? → COMMIT FIRST
    // ============================================
    const totalChanges = status.untracked.length + status.modified.length
    const stagedRaw = this.exec('diff --cached --name-only') || ''
    const staged = stagedRaw.split('\n').filter(Boolean)

    if (totalChanges > 0 && staged.length === 0) {
      // Hay cambios pero NADA staged → sugerir stage
      suggestions.push({
        id: 'stage-changes',
        priority: 'high',
        icon: '📥',
        title: `Paso 1: Stage ${totalChanges} ${totalChanges === 1 ? 'cambio' : 'cambios'}`,
        description: `Tienes archivos modificados/nuevos. Primero hay que prepararlos para commit (staging).`,
        actions: [
          {
            id: 'stage-all',
            label: 'git add .',
            command: 'git add .',
            type: 'stage'
          }
        ],
        details: {
          untracked: status.untracked.slice(0, 5),
          modified: status.modified.slice(0, 5)
        }
      })
    }

    if (staged.length > 0) {
      // Hay archivos staged → sugerir commit
      suggestions.push({
        id: 'commit-staged',
        priority: 'high',
        icon: '💾',
        title: `Paso 2: Commit ${staged.length} ${staged.length === 1 ? 'archivo' : 'archivos'} staged`,
        description: 'Tienes archivos listos para commit. Crea un commit descriptivo con los cambios.',
        actions: [
          {
            id: 'commit-quick',
            label: 'Quick commit (WIP)',
            command: `git commit -m "wip: work in progress"`,
            type: 'commit'
          }
        ],
        details: {
          staged: staged.slice(0, 5)
        }
      })
    }

    // ============================================
    // PASO 2: ¿Hay commits sin push? → PUSH
    // Solo si NO hay cambios pendientes (commit primero)
    // ============================================
    if (totalChanges === 0 && status.ahead > 0) {
      suggestions.push({
        id: 'push-commits',
        priority: status.ahead >= 5 ? 'high' : 'medium',
        icon: '🚀',
        title: `Paso 3: Push ${status.ahead} ${status.ahead === 1 ? 'commit' : 'commits'} a GitHub`,
        description: status.ahead >= 5
          ? '⚠️ Muchos commits acumulados. Push para no perder trabajo.'
          : `Sube tus commits a ${status.remoteBranch || 'origin'} para respaldarlos`,
        actions: [
          {
            id: 'push',
            label: `git push origin ${status.currentBranch}`,
            command: `git push origin ${status.currentBranch}`,
            type: 'push'
          }
        ]
      })
    }

    // 3. Behind del remote
    if (status.behind > 0) {
      suggestions.push({
        id: 'pull-changes',
        priority: 'medium',
        icon: '⬇️',
        title: `${status.behind} ${status.behind === 1 ? 'commit nuevo' : 'commits nuevos'} en remoto`,
        description: 'Tu rama local está atrasada. Considera hacer pull antes de seguir trabajando.',
        actions: [
          {
            id: 'pull',
            label: 'Pull changes',
            command: `git pull origin ${status.currentBranch}`,
            type: 'pull'
          }
        ]
      })
    }

    // 4. Branches mergeadas que se pueden borrar
    if (status.mergedBranches.length > 0) {
      suggestions.push({
        id: 'cleanup-branches',
        priority: 'low',
        icon: '🗑️',
        title: `${status.mergedBranches.length} ${status.mergedBranches.length === 1 ? 'rama mergeada' : 'ramas mergeadas'}`,
        description: 'Estas ramas ya están integradas y se pueden borrar de forma segura',
        actions: status.mergedBranches.map(branch => ({
          id: `delete-${branch}`,
          label: `Delete '${branch}'`,
          command: `git branch -d ${branch}`,
          type: 'delete-branch'
        })),
        details: {
          branches: status.mergedBranches
        }
      })
    }

    // ============================================
    // PASO 3: ¿Estás en feature y todo está pusheado? → MERGE
    // Solo sugerir merge si NO hay cambios pendientes Y nada por push
    // ============================================
    const mainBranches = ['main', 'master']
    const isOnFeature = !mainBranches.includes(status.currentBranch) &&
                       (status.currentBranch.startsWith('feature/') ||
                        status.currentBranch.startsWith('refactor/') ||
                        status.currentBranch.startsWith('fix/'))

    if (isOnFeature && totalChanges === 0 && status.ahead === 0) {
      const mainBranch = status.allBranches.find(b => mainBranches.includes(b))
      if (mainBranch) {
        suggestions.push({
          id: 'merge-to-main',
          priority: 'medium',
          icon: '🔀',
          title: `Paso 4: Mergear a ${mainBranch}`,
          description: `Tu feature '${status.currentBranch}' está lista. Intégrala a producción.`,
          actions: [
            {
              id: 'checkout-and-merge',
              label: `Merge '${status.currentBranch}' → ${mainBranch}`,
              command: `git checkout ${mainBranch}`,
              type: 'checkout',
              followUp: `git merge ${status.currentBranch} --no-ff -m "merge: integrate ${status.currentBranch}"`
            }
          ]
        })
      }
    }

    // 6. Sin remote configurado
    if (!status.hasRemote) {
      suggestions.push({
        id: 'no-remote',
        priority: 'low',
        icon: '🔗',
        title: 'Sin tracking remoto configurado',
        description: `La rama '${status.currentBranch}' no está conectada a ningún remote`,
        actions: [
          {
            id: 'push-set-upstream',
            label: 'Push y configurar upstream',
            command: `git push -u origin ${status.currentBranch}`,
            type: 'push'
          }
        ]
      })
    }

    // Ordenar por prioridad
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

    return suggestions
  }

  /**
   * Ejecuta una acción sugerida
   */
  executeAction(command) {
    try {
      // Solo permite comandos git (seguridad)
      if (!command.startsWith('git ')) {
        throw new Error('Solo se permiten comandos git')
      }

      const result = this.exec(command.substring(4))
      return { success: true, output: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

export default GitAnalyzer
