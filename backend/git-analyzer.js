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
   * Analiza el estado y genera sugerencias inteligentes
   */
  getSuggestions() {
    const status = this.getStatus()
    if (!status) return []

    const suggestions = []

    // 1. Cambios sin commitear (alta prioridad)
    const totalChanges = status.untracked.length + status.modified.length
    if (totalChanges > 0) {
      suggestions.push({
        id: 'commit-changes',
        priority: 'high',
        icon: '💾',
        title: `${totalChanges} ${totalChanges === 1 ? 'cambio' : 'cambios'} sin commitear`,
        description: `Tienes ${status.modified.length} archivos modificados y ${status.untracked.length} sin trackear`,
        actions: [
          {
            id: 'stage-all',
            label: 'Stage all changes',
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

    // 2. Commits sin push
    if (status.ahead > 0) {
      suggestions.push({
        id: 'push-commits',
        priority: status.ahead >= 5 ? 'high' : 'medium',
        icon: '🚀',
        title: `${status.ahead} ${status.ahead === 1 ? 'commit' : 'commits'} sin push`,
        description: status.ahead >= 5
          ? 'Tienes muchos commits acumulados localmente. Push pronto para evitar perder trabajo.'
          : `Push tus cambios a ${status.remoteBranch || 'origin'}`,
        actions: [
          {
            id: 'push',
            label: `Push to ${status.remoteBranch || 'origin'}`,
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

    // 5. En una feature branch - sugerir merge a main
    const mainBranches = ['main', 'master']
    if (!mainBranches.includes(status.currentBranch) &&
        status.currentBranch.startsWith('feature/')) {
      const mainBranch = status.allBranches.find(b => mainBranches.includes(b))
      if (mainBranch) {
        suggestions.push({
          id: 'merge-to-main',
          priority: 'medium',
          icon: '🔀',
          title: `Mergear '${status.currentBranch}' a ${mainBranch}`,
          description: 'Si la feature está lista, intégrala a la rama principal',
          actions: [
            {
              id: 'checkout-main',
              label: `Checkout to ${mainBranch}`,
              command: `git checkout ${mainBranch}`,
              type: 'checkout',
              followUp: 'merge'
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
