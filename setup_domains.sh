#!/bin/bash
set -e

echo "Setting up Nginx configuration for domains..."

cat > /etc/nginx/sites-available/lanovka << 'EOF'
server {
    listen 80;
    server_name lanovka.orivilon.com;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 10M;

    # Redirect login to the dedicated login domain
    location = /login.html {
        return 301 https://lanovka.login.orivilon.com;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
        proxy_connect_timeout 90s;
    }
}

server {
    listen 80;
    server_name lanovka.login.orivilon.com;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 10M;

    # Rewrite root to login.html
    location = / {
        rewrite ^/$ /login.html break;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
        proxy_connect_timeout 90s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/lanovka /etc/nginx/sites-enabled/
# Remove old overlapping configs
rm -f /etc/nginx/sites-enabled/climbing-app

nginx -t
systemctl restart nginx

echo "Attempting to get SSL certificates..."
certbot --nginx -d lanovka.orivilon.com -d lanovka.login.orivilon.com --non-interactive --agree-tos -m "admin@orivilon.com" || echo "Certbot failed, possibly due to Cloudflare proxied DNS. Please check."

echo "DONE"
