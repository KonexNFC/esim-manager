#!/bin/bash
# Post-merge setup: runs automatically after a task branch is merged.
# Idempotent, non-interactive, fail-fast.
set -e

# Install any new dependencies added by the merged task
npm install --no-audit --no-fund

# Apply any schema changes to the development database
npm run db:push -- --force
