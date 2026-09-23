# Project Workflow Rules

## Automatic GitHub Synchronization
- Whenever you finish implementing a feature, bugfix, or modification requested by the user, ALWAYS commit the changes with a clear commit message and push them to GitHub (`origin main`):
  ```bash
  git add .
  git commit -m "<clear description of changes>"
  git push origin main
  ```
- Notify the user once the changes have been pushed successfully to GitHub.
