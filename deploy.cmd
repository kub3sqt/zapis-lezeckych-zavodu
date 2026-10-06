@echo off
REM Zabalit projekt (ignorovat nepotřebné soubory jako node_modules a lokální databázi)
tar --exclude="node_modules" --exclude="*.db" --exclude="*.db-shm" --exclude="*.db-wal" -czf climbing-app.tar.gz backend frontend

REM Odeslat archiv na VPS
scp -o StrictHostKeyChecking=no -i "C:/Users/Kubík/web_ssh" climbing-app.tar.gz root@216.201.76.198:/var/www/climbing-app/

REM Rozbalit a restartovat PM2 na serveru
ssh -o StrictHostKeyChecking=no -i "C:/Users/Kubík/web_ssh" root@216.201.76.198 "cd /var/www/climbing-app && tar -xzf climbing-app.tar.gz && rm climbing-app.tar.gz && pm2 restart climbing-app"

echo Nasazeni dokonceno!
pause
