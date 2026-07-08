FROM nginx:alpine

# Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# SSL 自签证书
COPY ssl/ /etc/nginx/ssl/

# Let's Encrypt well-known dir for renewal
RUN mkdir -p /var/www/certbot

# 复制 PWA 静态文件
COPY . /usr/share/nginx/html/wuju-pwa/
RUN chmod -R a+rX /usr/share/nginx/html/wuju-pwa/

EXPOSE 80 443
