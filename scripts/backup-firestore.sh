#!/bin/bash
# ============================================================
# NOVAPACK CLOUD — Firestore Automated Backup Script
# Run daily via cron or Cloud Scheduler
#
# Usage:
#   ./scripts/backup-firestore.sh
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Cloud Storage bucket exists: gs://novapack-backups
#   - Service account has roles: Cloud Datastore Import Export Admin, Storage Admin
#
# Cron example (daily at 3am):
#   0 3 * * * /path/to/novapack-cloud/scripts/backup-firestore.sh >> /var/log/novapack-backup.log 2>&1
# ============================================================

PROJECT_ID="novapack-68f05"
BUCKET="gs://novapack-backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="${BUCKET}/firestore/${TIMESTAMP}"

echo "[$(date)] Starting Firestore backup to ${BACKUP_PATH}..."

# Export all collections
gcloud firestore export "${BACKUP_PATH}" \
  --project="${PROJECT_ID}" \
  --collection-ids="tickets,users,invoices,adv_invoices,credit_notes,delivery_archive,ticket_counters,pickupRequests,cooper_photos,driver_alerts,user_notifications,config,mailbox,mailIncidencias"

if [ $? -eq 0 ]; then
  echo "[$(date)] Backup completed successfully: ${BACKUP_PATH}"
else
  echo "[$(date)] ERROR: Backup failed!"
  exit 1
fi

# Clean up backups older than 30 days
echo "[$(date)] Cleaning backups older than 30 days..."
CUTOFF=$(date -d "30 days ago" +%Y%m%d 2>/dev/null || date -v-30d +%Y%m%d)
gsutil ls "${BUCKET}/firestore/" 2>/dev/null | while read dir; do
  DIR_DATE=$(basename "$dir" | cut -d'-' -f1)
  if [ "$DIR_DATE" \< "$CUTOFF" ] 2>/dev/null; then
    echo "  Removing old backup: $dir"
    gsutil -m rm -r "$dir"
  fi
done

echo "[$(date)] Backup process complete."
