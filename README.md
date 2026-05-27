# GitVisualizer

Visualización interactiva de repositorios git con animaciones en tiempo real.

## Estructura del Proyecto

```
GitVisualizer/
├── backend/          # Servidor Node.js (extrae datos de .git)
├── frontend/         # React + D3.js (dibuja el grafo)
└── README.md
```

## Objetivo del Proyecto

Entender **cómo git almacena datos** y **visualizarlos interactivamente**:
1. Leer commits, branches y merges desde `.git/`
2. Renderizar un grafo con D3.js
3. Animar "electrones" fluyendo por las conexiones
4. Sincronizar en tiempo real

## Fases de Desarrollo

- [ ] Fase 1: Backend que lee `.git` local
- [ ] Fase 2: API REST que expone datos
- [ ] Fase 3: React component que renderiza grafo
- [ ] Fase 4: Animaciones con SVG
- [ ] Fase 5: WebSocket para actualizaciones en tiempo real
