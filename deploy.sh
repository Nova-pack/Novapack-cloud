#!/bin/bash
# ============================================
# NOVAPACK CLOUD - Deploy Protocol v1.0
# Git commit + push + Firebase Hosting deploy
# ============================================

set -e

echo ""
echo "=========================================="
echo "  NOVAPACK CLOUD - DEPLOY PROTOCOL"
echo "=========================================="
echo ""

# 1. Git status check
echo "[1/5] Verificando cambios..."
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    echo "  ⚠️  No hay cambios para commitear."
    echo "  Desplegando lo que ya está en el branch..."
else
    # 2. Stage all relevant changes
    echo "[2/5] Staging archivos..."
    git add public/ mail_engine.js firebase.json firestore.rules storage.rules package.json 2>/dev/null || true
    git add deploy.sh .agents/ 2>/dev/null || true

    # Show what's staged
    echo ""
    git diff --cached --stat
    echo ""

    # 3. Commit with date prefix
    COMMIT_DATE=$(date +%Y-%m-%d)
    COMMIT_MSG="${DEPLOY_MSG:-Actualización NOVAPACK Cloud}"
    FULL_MSG="[$COMMIT_DATE] $COMMIT_MSG"

    echo "[3/5] Commit: $FULL_MSG"
    git commit -m "$FULL_MSG

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
fi

# 4. Push to remote
echo "[4/5] Push a origin..."
BRANCH=$(git branch --show-current)
git push origin "$BRANCH" 2>&1 || git push -u origin "$BRANCH" 2>&1

# 5. Firebase deploy
echo "[5/5] Desplegando a Firebase Hosting..."
firebase deploy --only hosting

echo ""
echo "=========================================="
echo "  ✅ DEPLOY COMPLETADO"
echo "  Branch: $BRANCH"
echo "  URL: https://novapack-68f05.web.app"
echo "=========================================="
echo ""
