#!/bin/bash
# Let's Encrypt DNS-01 签发 + wuju-pwa 部署
# 使用 Cloudflare API Token 自动验证，无需开放 80/443 端口

set -e

DOMAIN="wuju.bumooby.com"
CERT_DIR="/opt/data/wuju-pwa/certbot/conf"
CF_INI="/opt/data/wuju-pwa/certbot/cloudflare.ini"

# 检查 cloudflare.ini 是否已配置
if grep -q "YOUR_CLOUDFLARE_API_TOKEN_HERE" "$CF_INI" 2>/dev/null; then
    echo "❌ 请先在 $CF_INI 中填入 Cloudflare API Token"
    echo "   去 https://dash.cloudflare.com/profile/api-tokens 创建"
    echo "   权限: Zone:DNS:Edit, 区域: bumooby.com"
    exit 1
fi
chmod 600 "$CF_INI"

echo "=== 检查 DNS ==="
if ! python3 -c "import socket; print(socket.gethostbyname('$DOMAIN'))" 2>/dev/null; then
    echo "❌ $DOMAIN DNS 未解析！请确认 A 记录已添加: wuju → 27.29.232.38"
    exit 1
fi
echo "✅ DNS 已解析"

echo ""
echo "=== 签发 Let's Encrypt 证书 (DNS-01) ==="
docker run --rm \
    -v "$CERT_DIR:/etc/letsencrypt" \
    -v "$CF_INI:/cloudflare.ini:ro" \
    certbot/dns-cloudflare certonly \
    --dns-cloudflare \
    --dns-cloudflare-credentials /cloudflare.ini \
    -d "$DOMAIN" \
    --agree-tos \
    --email admin@bumooby.com \
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
    -p 8088:80 \
    -p 8444:443 \
    wuju-pwa

echo ""
echo "=== 验证 ==="
sleep 2
echo "HTTP:  curl -s -o /dev/null -w '%{http_code}' http://$DOMAIN:8088/wuju-pwa/"
curl -s -o /dev/null -w "HTTP %{http_code}" "http://$DOMAIN:8088/wuju-pwa/"
echo ""
echo "HTTPS: curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN:8444/wuju-pwa/"
curl -s -o /dev/null -w "HTTPS %{http_code}" --insecure "https://$DOMAIN:8444/wuju-pwa/"
echo ""
echo "✅ 部署完成"
echo "   HTTP:  http://$DOMAIN:8088/wuju-pwa/"
echo "   HTTPS: https://$DOMAIN:8444/wuju-pwa/"
