FROM nginx:alpine

# Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# SSL 证书
COPY ssl/ /etc/nginx/ssl/

# 复制 PWA 静态文件
COPY . /usr/share/nginx/html/wuju-pwa/
RUN chmod -R a+rX /usr/share/nginx/html/wuju-pwa/

EXPOSE 80 443
