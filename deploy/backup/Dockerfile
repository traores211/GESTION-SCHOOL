# Backup worker: pg_dump/pg_restore 16, openssl, rclone (off-site copy) and crond.
FROM postgres:16-alpine
RUN apk add --no-cache openssl rclone tzdata
COPY backup.sh restore.sh verify.sh /usr/local/bin/
COPY crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/verify.sh \
  && sed -i 's/\r$//' /usr/local/bin/*.sh /etc/crontabs/root
# Environment for cron jobs is written at start (crond does not inherit it).
CMD ["sh", "-c", "env | grep -E '^(PG|BACKUP_|RCLONE|TZ)' | sed 's/^/export /' > /etc/backup.env && crond -f -l 6"]
