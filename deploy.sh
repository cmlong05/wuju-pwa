#!/bin/bash
# Let's Encrypt 证书签发 & wuju-pwa 部署
# 用法: bash deploy.sh admin@bumooby.com

set -e
EMAIL="${1:-admin@bumooby.com}"
DOMAIN="wuju.bumooby.com"
CERT_DIR="/opt/data/wuju-pwa/certbot/conf"

echo "=== 检查 DNS ==="
if ! python3 -c "import socket; print(socket.gethostbyname('$DOMAIN'))" 2>/dev/null; then
    echo "❌ $DOMAIN DNS 未解析！请先添加 A 记录指向本机 IP"
    exit 1
fi
echo "✅ DNS 已解析"

echo ""
echo "=== 签发 Let's Encrypt 证书 ==="
docker run --rm \
    -v "$CERT_DIR:/etc/letsencrypt" \
    -v "/opt/data/wuju-pwa/certbot/www:/var/www/certbot" \
    -p 80:80 \
    certbot/certbot certonly \
    --standalone \
    -d "$DOMAIN" \
    --agree-tos \
    --email "$EMAIL" \
    --non-interactive \
    --keep-until-expiring

echo ""
echo "=== 构建并部署 wuju-pwa ==="
cd /opt/data/wuju-pwa
docker build -t wuju-pwa . -q
docker rm -f wuju-pwa 2>/dev/null || true
docker run -d \
    --name wuju-pwa \
    --restart unless-stopped \
    --network hermes_hermes-net \
    -v "$CERT_DIR:/etc/letsencrypt:ro" \
    -p 80:80 \
    -p 443:443 \
    wuju-pwa

echo ""
echo "=== 验证 ==="
sleep 2
curl -s -o /dev/null -w "HTTP %{http_code}" "https://$DOMAIN/wuju-pwa/"
echo ""
echo "✅ 部署完成"
echo "   访问: https://$DOMAIN/wuju-pwa/"
