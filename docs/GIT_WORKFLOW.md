# Git Branching Strategy

Simplified Git Flow:

```mermaid
gitGraph
  commit id: "init"
  branch develop
  commit id: "scaffold"
  branch feature/kanban
  commit id: "board"
  commit id: "dnd"
  checkout develop
  merge feature/kanban
  branch feature/rbac
  commit id: "roles"
  checkout develop
  merge feature/rbac
  checkout main
  merge develop tag: "v1.0.0"
```

| Branch | Purpose |
|---|---|
| `main` | Production-ready, tagged releases |
| `develop` | Integration branch |
| `feature/<name>` | New features, branched from `develop` |
| `fix/<name>` | Bug fixes |
| `hotfix/<name>` | Urgent fixes branched from `main` |

Rules: PRs into `develop` require passing `npm test` + review. Conventional commits (`feat:`, `fix:`, `docs:`, `test:`).
