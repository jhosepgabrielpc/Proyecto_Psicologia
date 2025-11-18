# Guía de Despliegue - MindCare

## Requisitos del Sistema

### Hardware Mínimo
- CPU: 2 cores
- RAM: 4 GB
- Disco: 20 GB SSD
- Ancho de banda: 10 Mbps

### Hardware Recomendado (Producción)
- CPU: 4+ cores
- RAM: 8+ GB
- Disco: 50+ GB SSD
- Ancho de banda: 100 Mbps

### Software
- Node.js v16 o superior
- PostgreSQL 12+ o SQL Server 2019+
- Nginx (para proxy reverso)
- SSL Certificate (Let's Encrypt recomendado)
- PM2 (para gestión de procesos)

---

## Instalación en Producción

### 1. Preparar el Servidor

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Instalar Nginx
sudo apt install -y nginx

# Instalar PM2
sudo npm install -g pm2
```

### 2. Configurar Base de Datos

```bash
# Conectar a PostgreSQL
sudo -u postgres psql

# Crear base de datos y usuario
CREATE DATABASE mindcare_db;
CREATE USER mindcare_user WITH ENCRYPTED PASSWORD 'tu_password_seguro';
GRANT ALL PRIVILEGES ON DATABASE mindcare_db TO mindcare_user;
\q
```

### 3. Clonar y Configurar Aplicación

```bash
# Crear directorio
sudo mkdir -p /var/www/mindcare
cd /var/www/mindcare

# Clonar repositorio
git clone <repository-url> .

# Instalar dependencias
npm install --production

# Configurar variables de entorno
cp .env.example .env
nano .env
```

**Configurar `.env` para producción:**
```env
NODE_ENV=production
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=mindcare_db
DB_USER=mindcare_user
DB_PASSWORD=tu_password_seguro

JWT_SECRET=genera_una_clave_super_segura_aqui
SESSION_SECRET=genera_otra_clave_segura_aqui

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_password_de_app

BASE_URL=https://mindcare.bo
FRONTEND_URL=https://mindcare.bo
```

### 4. Inicializar Base de Datos

```bash
# Ejecutar schema
psql -U mindcare_user -d mindcare_db -f database/schema.sql

# Cargar datos iniciales
npm run init-db
```

### 5. Configurar PM2

```bash
# Iniciar aplicación con PM2
pm2 start server.js --name mindcare

# Configurar inicio automático
pm2 startup systemd
pm2 save

# Verificar estado
pm2 status
pm2 logs mindcare
```

### 6. Configurar Nginx

```bash
# Crear configuración
sudo nano /etc/nginx/sites-available/mindcare
```

**Contenido del archivo:**
```nginx
server {
    listen 80;
    server_name mindcare.bo www.mindcare.bo;

    # Redirigir HTTP a HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mindcare.bo www.mindcare.bo;

    # Certificados SSL
    ssl_certificate /etc/letsencrypt/live/mindcare.bo/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mindcare.bo/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Configuración de seguridad
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Logs
    access_log /var/log/nginx/mindcare_access.log;
    error_log /var/log/nginx/mindcare_error.log;

    # Proxy a Node.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts para WebRTC
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Archivos estáticos
    location /uploads/ {
        alias /var/www/mindcare/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Límite de tamaño de archivo
    client_max_body_size 10M;
}
```

```bash
# Habilitar sitio
sudo ln -s /etc/nginx/sites-available/mindcare /etc/nginx/sites-enabled/

# Verificar configuración
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

### 7. Configurar SSL con Let's Encrypt

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtener certificado
sudo certbot --nginx -d mindcare.bo -d www.mindcare.bo

# Renovación automática (ya configurado por Certbot)
sudo certbot renew --dry-run
```

### 8. Configurar Firewall

```bash
# Permitir SSH, HTTP, HTTPS
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## Configuración de Backups

### 1. Backup Automático de Base de Datos

```bash
# Crear script de backup
sudo nano /usr/local/bin/backup-mindcare.sh
```

**Contenido del script:**
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/mindcare"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_NAME="mindcare_db"
DB_USER="mindcare_user"

mkdir -p $BACKUP_DIR

# Backup de base de datos
pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/db_$TIMESTAMP.sql.gz

# Backup de archivos subidos
tar -czf $BACKUP_DIR/uploads_$TIMESTAMP.tar.gz /var/www/mindcare/uploads/

# Eliminar backups antiguos (más de 30 días)
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completado: $TIMESTAMP"
```

```bash
# Hacer ejecutable
sudo chmod +x /usr/local/bin/backup-mindcare.sh

# Configurar cron (diario a las 2 AM)
sudo crontab -e
```

**Agregar:**
```
0 2 * * * /usr/local/bin/backup-mindcare.sh >> /var/log/mindcare-backup.log 2>&1
```

---

## Monitoreo y Logs

### 1. Configurar Logs

```bash
# Ver logs de aplicación
pm2 logs mindcare

# Ver logs de Nginx
sudo tail -f /var/log/nginx/mindcare_access.log
sudo tail -f /var/log/nginx/mindcare_error.log

# Ver logs del sistema
sudo journalctl -u nginx -f
```

### 2. Monitoreo con PM2

```bash
# Instalar PM2 Plus (opcional, monitoreo avanzado)
pm2 plus

# Ver métricas
pm2 monit
```

---

## Despliegue con Docker (Alternativa)

### 1. Crear Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### 2. Crear docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=mindcare_db
      - DB_USER=mindcare_user
      - DB_PASSWORD=secure_password
    depends_on:
      - db
    volumes:
      - ./uploads:/app/uploads
    restart: unless-stopped

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_DB=mindcare_db
      - POSTGRES_USER=mindcare_user
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - /etc/letsencrypt:/etc/letsencrypt
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
```

### 3. Desplegar con Docker

```bash
# Construir y levantar servicios
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down
```

---

## Optimizaciones de Rendimiento

### 1. Configurar Redis (Caché de Sesiones)

```bash
# Instalar Redis
sudo apt install -y redis-server

# Configurar en aplicación
npm install connect-redis redis
```

**Actualizar server.js:**
```javascript
const Redis = require('redis');
const RedisStore = require('connect-redis').default;

const redisClient = Redis.createClient({
  host: 'localhost',
  port: 6379
});

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
```

### 2. Habilitar Compresión

```javascript
// En server.js
const compression = require('compression');
app.use(compression());
```

### 3. Configurar CDN para Archivos Estáticos

Usar AWS CloudFront, Cloudflare, o similar para servir:
- CSS/JS
- Imágenes
- Archivos subidos

---

## Seguridad Adicional

### 1. Fail2Ban (Protección contra Brute Force)

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 2. Auditoría Regular

```bash
# Actualizar dependencias
npm audit
npm audit fix

# Actualizar sistema
sudo apt update && sudo apt upgrade -y
```

### 3. Monitoreo de Intrusiones

```bash
# Instalar AIDE
sudo apt install -y aide
sudo aideinit
```

---

## Troubleshooting

### Aplicación no inicia
```bash
# Verificar logs
pm2 logs mindcare --lines 100

# Verificar puerto
sudo netstat -tlnp | grep 3000

# Reiniciar aplicación
pm2 restart mindcare
```

### Problema de Base de Datos
```bash
# Verificar conexión
psql -U mindcare_user -d mindcare_db

# Verificar logs
sudo journalctl -u postgresql -f
```

### Error de SSL
```bash
# Verificar certificados
sudo certbot certificates

# Renovar manualmente
sudo certbot renew
```

---

## Checklist de Despliegue

- [ ] Servidor configurado y actualizado
- [ ] Base de datos creada e inicializada
- [ ] Variables de entorno configuradas
- [ ] Aplicación iniciada con PM2
- [ ] Nginx configurado y funcionando
- [ ] SSL certificado instalado
- [ ] Firewall configurado
- [ ] Backups automáticos configurados
- [ ] Monitoreo configurado
- [ ] Pruebas de funcionalidad completas
- [ ] DNS configurado
- [ ] Email configurado y probado

---

## Soporte

Para problemas de despliegue, contactar:
- Email: devops@mindcare.bo
- Documentación: https://docs.mindcare.bo