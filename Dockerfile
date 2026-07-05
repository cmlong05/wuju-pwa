FROM nginx:alpine

# 复制 PWA 静态文件
COPY . /usr/share/nginx/html/wuju-pwa/

# Nginx 配置
RUN echo 'server {\
    listen 80;\
    server_name _;\
    root /usr/share/nginx/html;\
    index index.html;\
\
    # PWA 入口\
    location /wuju-pwa/ {\
        try_files $uri $uri/ /wuju-pwa/index.html;\
    }\
\
    # Service Worker 禁止缓存\
    location = /wuju-pwa/sw.js {\
        add_header Cache-Control "no-cache";\
    }\
\
    # 静态资源长期缓存\
    location ~* \.(js|css|png|json|ico)$ {\
        expires 30d;\
        add_header Cache-Control "public, immutable";\
    }\
\
    # Manifest 不缓存\
    location = /wuju-pwa/manifest.json {\
        add_header Cache-Control "no-cache";\
    }\
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
