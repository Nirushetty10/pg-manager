#!/bin/bash
# PG Manager v2 — VPS Deploy Script (Ubuntu 22.04)
set -e

DOMAIN="your-domain.com"
APP_DIR="/var/www/pg-manager"
DB_NAME="pg_manager"
DB_USER="pgmanager"
DB_PASS="$(openssl rand -hex 16)"
NODE_VER="20"

echo "======================================"
echo "  PG Manager v2 — VPS Setup"
echo "======================================"

# 1. Update system
apt-get update -qq && apt-get upgrade -y -qq

# 2. Node.js
curl -fsSL https://deb.nodesource.com/setup_${NODE_VER}.x | bash -
apt-get install -y nodejs

# 3. PostgreSQL
apt-get install -y postgresql postgresql-contrib
systemctl start postgresql && systemctl enable postgresql

# 4. Create DB
sudo -u postgres psql <<SQL
CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASS';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL

# 5. Nginx + PM2
apt-get install -y nginx
npm install -g pm2
systemctl start nginx && systemctl enable nginx

# 6. Copy app
mkdir -p $APP_DIR/logs
cp -r /tmp/pg-manager/* $APP_DIR/

# 7. Backend .env
cat > $APP_DIR/backend/.env <<ENV
PORT=5000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://$DOMAIN
ENV

# 8. Frontend .env
echo "VITE_API_URL=/api" > $APP_DIR/frontend/.env.production

# 9. Install + Build
cd $APP_DIR/backend && npm install --production
node src/config/migrate.js

cd $APP_DIR/frontend && npm install && npm run build

# 10. Nginx config
cp $APP_DIR/deploy/nginx.conf /etc/nginx/sites-available/pg-manager
sed -i "s/your-domain.com/$DOMAIN/g" /etc/nginx/sites-available/pg-manager
sed -i "s|/var/www/pg-manager|$APP_DIR|g" /etc/nginx/sites-available/pg-manager
ln -sf /etc/nginx/sites-available/pg-manager /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# 11. Start with PM2
cd $APP_DIR
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup systemd -u root --hp /root

# 12. SSL
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || echo "⚠️ SSL skipped — configure DNS first"

echo ""
echo "======================================"
echo "  ✅ Deployment Complete!"
echo "======================================"
echo "  URL:           https://$DOMAIN"
echo "  DB Name:        $DB_NAME"
echo "  DB Password:    $DB_PASS  ← SAVE THIS"
echo ""
echo "  Master Admin:   admin@pgplatform.com / admin123"
echo "  Owner Login:    ravi@grandpg.com / owner123"
echo ""
echo "  pm2 status           — app health"
echo "  pm2 logs pg-manager-api  — live logs"
