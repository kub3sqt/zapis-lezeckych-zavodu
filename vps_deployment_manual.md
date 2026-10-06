# 🧗 Kompletní manuál: Nasazení Climbing Competition App na VPS

Tento manuál pokrývá celý proces od pořízení VPS až po plně funkční a zabezpečenou produkční aplikaci.

---

## 📋 Přehled architektury

```
Internet
   │
   ▼
┌──────────────┐
│   Cloudflare  │  (DNS + SSL + DDoS ochrana)
│   nebo jiný   │
│   DNS provider│
└──────┬───────┘
       │ HTTPS (443)
       ▼
┌──────────────┐
│    Nginx      │  (Reverse proxy + SSL terminace)
│    Port 80/443│
└──────┬───────┘
       │ HTTP (localhost:3000)
       ▼
┌──────────────┐
│   Node.js     │  (Express backend + statický frontend)
│   PM2 managed │
│   Port 3000   │
└──────────────┘
       │
       ▼
┌──────────────┐
│   SQLite DB   │  (climbing.db)
└──────────────┘
```

---

## 1. 🛒 Výběr a pořízení VPS

### Doporučení poskytovatelé
| Poskytovatel | Min. cena/měsíc | Poznámka |
|---|---|---|
| **Hetzner** | ~€4 | Nejlepší poměr cena/výkon, EU servery |
| **Contabo** | ~€5 | Hodně RAM za nízkou cenu |
| **DigitalOcean** | ~$6 | Skvělá dokumentace |
| **Linode (Akamai)** | ~$5 | Spolehlivý |

### Minimální parametry
- **OS:** Ubuntu 22.04 nebo 24.04 LTS
- **RAM:** 1 GB (stačí pro SQLite + Node.js)
- **Disk:** 20 GB SSD
- **CPU:** 1 vCPU

### Po vytvoření VPS
Poskytovatel ti dá:
- **IP adresu** (např. `203.0.113.50`)
- **Root heslo** nebo SSH klíč

---

## 2. 🔐 První připojení a zabezpečení serveru

### 2.1 Připojení přes SSH

Na Windows použij **Windows Terminal** nebo **PuTTY**:

```bash
ssh root@TVOJE_IP_ADRESA
```

### 2.2 Aktualizace systému

```bash
apt update && apt upgrade -y
```

### 2.3 Vytvoření nového uživatele (nekdy pod rootem!)

```bash
adduser deploy
usermod -aG sudo deploy
```

Zadej silné heslo. Pak nastav SSH klíč:

```bash
# Na svém PC vygeneruj klíč (pokud nemáš):
ssh-keygen -t ed25519 -C "tvuj@email.cz"

# Zkopíruj veřejný klíč na server:
ssh-copy-id deploy@TVOJE_IP_ADRESA
```

### 2.4 Zabezpečení SSH

Otevři konfiguraci:

```bash
sudo nano /etc/ssh/sshd_config
```

Změň/přidej tyto řádky:

```
Port 2222                       # Změna výchozího portu (volitelné, ale doporučené)
PermitRootLogin no              # Zakázat přihlášení jako root
PasswordAuthentication no       # Jen SSH klíče
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

Restartuj SSH:

```bash
sudo systemctl restart sshd
```

> [!CAUTION]
> **Před restartem SSH** se ujisti, že máš funkční SSH klíč a můžeš se přihlásit jako `deploy`! Jinak se zamkneš.
> Otevři **nové** terminálové okno a ověř přihlášení: `ssh -p 2222 deploy@TVOJE_IP_ADRESA`

### 2.5 Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 2222/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw enable
sudo ufw status
```

### 2.6 Fail2Ban (ochrana proti brute-force)

```bash
sudo apt install fail2ban -y
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```

Najdi sekci `[sshd]` a nastav:

```ini
[sshd]
enabled = true
port = 2222
maxretry = 3
bantime = 3600
findtime = 600
```

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 2.7 Automatické bezpečnostní aktualizace

```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
# Vyber "Yes" (Ano)
```

---

## 3. 📦 Instalace potřebného software

Přihlas se jako `deploy`:

```bash
ssh -p 2222 deploy@TVOJE_IP_ADRESA
```

### 3.1 Node.js (přes NodeSource)

```bash
# Instalace Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Ověření
node --version    # mělo by zobrazit v20.x.x
npm --version
```

### 3.2 PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

### 3.3 Nginx (Reverse Proxy)

```bash
sudo apt install nginx -y
sudo systemctl enable nginx
```

### 3.4 Certbot (SSL certifikáty – Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 3.5 Build nástroje pro native moduly (better-sqlite3)

```bash
sudo apt install build-essential python3 -y
```

---

## 4. 📤 Nahrání aplikace na server

### 4.1 Struktura na serveru

```bash
sudo mkdir -p /var/www/climbing-app
sudo chown deploy:deploy /var/www/climbing-app
```

### 4.2 Nahrání souborů (z tvého PC)

Otevři terminál **na svém PC** (PowerShell):

```powershell
# Nahraj backend (BEZ node_modules a databáze!)
scp -P 2222 -r C:\Users\Kubík\Desktop\Web\backend\*.js deploy@TVOJE_IP_ADRESA:/var/www/climbing-app/backend/
scp -P 2222 C:\Users\Kubík\Desktop\Web\backend\package.json deploy@TVOJE_IP_ADRESA:/var/www/climbing-app/backend/
scp -P 2222 C:\Users\Kubík\Desktop\Web\backend\package-lock.json deploy@TVOJE_IP_ADRESA:/var/www/climbing-app/backend/

# Nahraj backend/routes
scp -P 2222 -r C:\Users\Kubík\Desktop\Web\backend\routes deploy@TVOJE_IP_ADRESA:/var/www/climbing-app/backend/

# Nahraj frontend
scp -P 2222 -r C:\Users\Kubík\Desktop\Web\frontend deploy@TVOJE_IP_ADRESA:/var/www/climbing-app/
```

**Alternativa – celý adresář najednou (jednodušší):**

```powershell
# Z PC: zabal celý projekt (bez node_modules a .db souborů)
cd C:\Users\Kubík\Desktop\Web
tar --exclude="node_modules" --exclude="*.db" --exclude="*.db-shm" --exclude="*.db-wal" -czf climbing-app.tar.gz backend frontend

# Nahraj archiv
scp -P 2222 climbing-app.tar.gz deploy@TVOJE_IP_ADRESA:/var/www/climbing-app/

# Na serveru: rozbal
ssh -p 2222 deploy@TVOJE_IP_ADRESA
cd /var/www/climbing-app
tar -xzf climbing-app.tar.gz
rm climbing-app.tar.gz
```

> [!IMPORTANT]
> **Nenahrávej `node_modules`** – nainstalují se na serveru. Také **nenahrávej databázové soubory** ([climbing.db](file:///c:/Users/Kub%C3%ADk/Desktop/Web/backend/climbing.db), [.db-shm](file:///c:/Users/Kub%C3%ADk/Desktop/Web/backend/climbing.db-shm), [.db-wal](file:///c:/Users/Kub%C3%ADk/Desktop/Web/backend/climbing.db-wal)) – nová prázdná DB se vytvoří automaticky.

### 4.3 Instalace závislostí na serveru

```bash
cd /var/www/climbing-app/backend
npm ci --production
```

> Příkaz `npm ci` nainstaluje přesně ty verze, které jsou v [package-lock.json](file:///c:/Users/Kub%C3%ADk/Desktop/Web/backend/package-lock.json).

---

## 5. ⚙️ Konfigurace aplikace pro produkci

### 5.1 Environment proměnné

Vytvoř soubor `.env` (nebo nastav přímo v PM2):

```bash
nano /var/www/climbing-app/backend/.env
```

```env
PORT=3000
JWT_SECRET=ZDE_VLOZ_NAHODNY_RETEZEC_MIN_64_ZNAKU
NODE_ENV=production
```

Vygeneruj silný JWT secret:

```bash
openssl rand -hex 32
```

> [!CAUTION]
> **Nikdy nepoužívej výchozí JWT secret z kódu!** Vždy vygeneruj nový náhodný řetězec pro produkci.

### 5.2 Upravit načítání .env v aplikaci

Nainstaluj `dotenv`:

```bash
cd /var/www/climbing-app/backend
npm install dotenv
```

Na **začátek** souboru [server.js](file:///c:/Users/Kub%C3%ADk/Desktop/Web/backend/server.js) přidej:

```javascript
require('dotenv').config();
```

Alternativně můžeš proměnné nastavit přímo přes PM2 (viz další krok).

### 5.3 Omezení CORS pro produkci

V [server.js](file:///c:/Users/Kub%C3%ADk/Desktop/Web/backend/server.js) změň CORS nastavení:

```javascript
app.use(cors({
  origin: 'https://tvoje-domena.cz',  // Tvoje skutečná doména
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

---

## 6. 🚀 Spuštění s PM2

### 6.1 Spuštění aplikace

```bash
cd /var/www/climbing-app/backend

# S .env souborem
pm2 start server.js --name climbing-app --env production

# NEBO s proměnnými přímo:
pm2 start server.js --name climbing-app -- \
  --env PORT=3000 \
  --env JWT_SECRET=tvuj_tajny_klic \
  --env NODE_ENV=production
```

**Doporučená varianta – PM2 ecosystem soubor:**

```bash
nano /var/www/climbing-app/ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'climbing-app',
    script: './backend/server.js',
    cwd: '/var/www/climbing-app',
    instances: 1,                    // SQLite nepodporuje více instancí
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      JWT_SECRET: 'ZDE_TVUJ_TAJNY_KLIC'
    },
    error_file: '/var/log/climbing-app/error.log',
    out_file: '/var/log/climbing-app/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_memory_restart: '300M',
    restart_delay: 5000,
    max_restarts: 10,
    watch: false
  }]
};
```

```bash
# Vytvoř log adresář
sudo mkdir -p /var/log/climbing-app
sudo chown deploy:deploy /var/log/climbing-app

# Spusť přes ecosystem
cd /var/www/climbing-app
pm2 start ecosystem.config.js --env production

# Ověř, že běží
pm2 status
pm2 logs climbing-app
```

### 6.2 Automatický start po restartu serveru

```bash
pm2 startup systemd
# PM2 vypíše příkaz – zkopíruj ho a spusť (začíná sudo env ...)

pm2 save
```

---

## 7. 🌐 Nginx jako Reverse Proxy

### 7.1 Konfigurace Nginx

```bash
sudo nano /etc/nginx/sites-available/climbing-app
```

```nginx
server {
    listen 80;
    server_name tvoje-domena.cz www.tvoje-domena.cz;

    # Bezpečnostní hlavičky
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;" always;

    # Limity
    client_max_body_size 10M;

    # Rate limiting zóna (definice v hlavním nginx.conf)
    # limit_req zone=api burst=20 nodelay;

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

    # Cachování statických souborů
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3000;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 7.2 Rate limiting (ochrana API)

Přidej do hlavního konfiguráku:

```bash
sudo nano /etc/nginx/nginx.conf
```

Do bloku `http { ... }` přidej:

```nginx
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=3r/s;
```

### 7.3 Aktivace konfigurace

```bash
# Aktivuj site
sudo ln -s /etc/nginx/sites-available/climbing-app /etc/nginx/sites-enabled/

# Odstraň výchozí site
sudo rm /etc/nginx/sites-enabled/default

# Otestuj konfiguraci
sudo nginx -t

# Restartuj Nginx
sudo systemctl restart nginx
```

### 7.4 Ověření

Otevři v prohlížeči: `http://TVOJE_IP_ADRESA` – měla by se zobrazit tvoje aplikace.

---

## 8. 🔒 SSL certifikát (HTTPS)

### 8.1 Předpoklady

Musíš mít **doménu** nasměrovanou na IP adresu serveru:
- Jdi k registrátorovi domény (Wedos, Forpsi, Cloudflare, apod.)
- Přidej **A záznam**: `tvoje-domena.cz` → `TVOJE_IP_ADRESA`
- Přidej **A záznam**: `www.tvoje-domena.cz` → `TVOJE_IP_ADRESA`
- Počkej na propagaci DNS (5 min – 48 hodin, obvykle do 30 min)

### 8.2 Certbot – automatický SSL

```bash
sudo certbot --nginx -d tvoje-domena.cz -d www.tvoje-domena.cz
```

- Zadej e-mail pro notifikace
- Souhlasíš s podmínkami
- Vyber **"2: Redirect"** (automatické přesměrování HTTP → HTTPS)

### 8.3 Automatická obnova certifikátu

Certbot automaticky nastaví timer. Ověř:

```bash
sudo certbot renew --dry-run
```

### 8.4 Ověření

Otevři `https://tvoje-domena.cz` – měl bys vidět zámek 🔒 a funkční aplikaci.

---

## 9. 💾 Zálohování

### 9.1 Automatické zálohování databáze

```bash
# Vytvoř adresář pro zálohy
sudo mkdir -p /var/backups/climbing-app
sudo chown deploy:deploy /var/backups/climbing-app

# Vytvoř zálohovací skript
nano /var/www/climbing-app/backup.sh
```

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/climbing-app"
DB_PATH="/var/www/climbing-app/backend/climbing.db"

# SQLite safe backup (pomocí .backup příkazu)
sqlite3 "$DB_PATH" ".backup '${BACKUP_DIR}/climbing_${TIMESTAMP}.db'"

# Smaž zálohy starší než 30 dní
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete

echo "Backup completed: climbing_${TIMESTAMP}.db"
```

```bash
chmod +x /var/www/climbing-app/backup.sh

# Nainstaluj sqlite3 pro zálohy
sudo apt install sqlite3 -y

# Přidej do cronu (každý den ve 3:00)
crontab -e
```

Přidej řádek:

```cron
0 3 * * * /var/www/climbing-app/backup.sh >> /var/log/climbing-app/backup.log 2>&1
```

### 9.2 Ruční záloha na svůj PC

```powershell
# Stáhni zálohu na svůj PC (z PowerShellu)
scp -P 2222 deploy@TVOJE_IP_ADRESA:/var/backups/climbing-app/climbing_latest.db C:\Users\Kubík\Desktop\
```

---

## 10. 📊 Monitoring

### 10.1 PM2 monitoring

```bash
pm2 monit              # Živé sledování
pm2 status             # Stav aplikace
pm2 logs climbing-app  # Logy v reálném čase
pm2 info climbing-app  # Detailní info
```

### 10.2 Systémové monitoring nástroje

```bash
# Sledování disku
df -h

# Sledování paměti
free -h

# Sledování procesů
htop
```

### 10.3 Logrotate pro PM2 logy

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## 11. 🔄 Aktualizace aplikace

Když uděláš změny v kódu na svém PC, takto je nasadíš:

### Z tvého PC (PowerShell):

```powershell
cd C:\Users\Kubík\Desktop\Web
tar --exclude="node_modules" --exclude="*.db" --exclude="*.db-shm" --exclude="*.db-wal" -czf climbing-app.tar.gz backend frontend
scp -P 2222 climbing-app.tar.gz deploy@TVOJE_IP_ADRESA:/var/www/climbing-app/
```

### Na serveru:

```bash
cd /var/www/climbing-app

# Záloha DB
./backup.sh

# Rozbal nové soubory
tar -xzf climbing-app.tar.gz
rm climbing-app.tar.gz

# Aktualizuj závislosti (jen pokud se změnil package.json)
cd backend && npm ci --production && cd ..

# Restartuj aplikaci
pm2 restart climbing-app

# Ověř
pm2 logs climbing-app --lines 20
```

---

## 12. 🛡️ Checklist zabezpečení

Po nasazení projdi tento seznam:

- [ ] SSH přístup pouze přes klíč (žádná hesla)
- [ ] Root login zakázán
- [ ] SSH na nestandardním portu (např. 2222)
- [ ] UFW firewall aktivní (pouze porty 2222, 80, 443)
- [ ] Fail2Ban běží
- [ ] Automatické bezpečnostní aktualizace
- [ ] Nginx bezpečnostní hlavičky nastavené
- [ ] SSL certifikát aktivní (HTTPS)
- [ ] JWT_SECRET změněn na silný náhodný řetězec
- [ ] Výchozí admin heslo (`admin123`) změněno po prvním přihlášení!
- [ ] CORS omezen na tvoji doménu
- [ ] Rate limiting na API
- [ ] Automatické zálohy databáze
- [ ] PM2 logrotate nastavený

---

## 13. 🚨 Troubleshooting

| Problém | Řešení |
|---|---|
| Aplikace nefunguje po restartu serveru | `pm2 startup systemd && pm2 save` |
| Port 3000 obsazený | `sudo lsof -i :3000` a `pm2 delete all && pm2 start ecosystem.config.js` |
| Nginx 502 Bad Gateway | Ověř `pm2 status` – Node.js asi neběží |
| SSL certifikát expiroval | `sudo certbot renew` |
| "Cannot find module better-sqlite3" | `cd backend && npm rebuild better-sqlite3` |
| Permission denied na DB | `chown deploy:deploy /var/www/climbing-app/backend/climbing.db` |
| Zamknul jsem se z SSH | Použij VPS konzoli přes web panel poskytovatele |

---

## 📌 Rychlý přehled příkazů

```bash
# Stav aplikace
pm2 status

# Logy
pm2 logs climbing-app

# Restart
pm2 restart climbing-app

# Stop
pm2 stop climbing-app

# Stav Nginx
sudo systemctl status nginx

# Firewall
sudo ufw status

# SSL obnova
sudo certbot renew

# Záloha DB
/var/www/climbing-app/backup.sh
```

---

> [!TIP]
> **Pro budoucnost zvažte:** Nastavení Git-based deployment (push kódu přímo na server přes Git hook) nebo CI/CD pipeline pro automatizované nasazení.
