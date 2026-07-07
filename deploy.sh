#!/bin/bash
# Let's Encrypt DNS-01 签发 + wuju-pwa 部署
# 使用 Cloudflare API Token 自动验证，无需开放 80/443 端口

set -e

DOMAIN="wuju.bumooby.com"
PROJECT="/opt/data/wuju-pwa"
HOST_PROJECT="/srv/dev-disk-by-uuid-e6381e02-8c81-433f-85f3-76b093022769/docker/volumes/hermes_hermes_data/_data/wuju-pwa"

CF_INI="${PROJECT}/certbot/cloudflare.ini"
CERT_CONF="${PROJECT}/certbot/conf"

# Check cloudflare.ini
if grep -q "YOUR_CLOUDFLARE_API_TOKEN_HERE" "$CF_INI" 2>/dev/null; then
    echo "❌ 请先在 cloudflare.ini 中填入 Cloudflare API Token"
    exit 1
fi

echo "=== 签发 Let's Encrypt 证书 (DNS-01) ==="
docker run --rm \
    -v "${HOST_PROJECT}/certbot/conf:/etc/letsencrypt" \
    -v "${HOST_PROJECT}/certbot/cloudflare.ini:/root/.cf.ini:ro" \
    certbot/dns-cloudflare certonly \
    --dns-cloudflare \
    --dns-cloudflare-credentials /root/.cf.ini \
    -d "$DOMAIN" \
    --agree-tos \
    --email admin@bumooby.com \
    --non-interactive \
    --keep-until-expiring

echo ""
echo "=== 部署 wuju-pwa ==="
cd "$PROJECT"
docker build -t wuju-pwa . -q
docker rm -f wuju-pwa 2>/dev/null || true
docker run -d \
    --name wuju-pwa \
    --restart unless-stopped \
    --network hermes_hermes-net \
    -v "${HOST_PROJECT}/certbot/conf:/etc/letsencrypt:ro" \
    -p 8088:80 \
    -p 8444:443 \
    wuju-pwa

echo ""
echo "=== 验证 ==="
sleep 2
echo -n "HTTPS: "
curl -sk -o /dev/null -w '%{http_code}' "https://$DOMAIN:8444/wuju-pwa/"
echo ""
echo "✅ 部署完成"
echo "   https://$DOMAIN:8444/wuju-pwa/"
