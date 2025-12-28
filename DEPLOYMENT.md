# 🚀 Guide de déploiement en production

## 📋 Pré-requis

- Un nom de domaine (ex: connectmeifucan.com)
- Accès à un serveur ou service d'hébergement
- Node.js installé sur le serveur (pour le backend)

## 🎯 Architecture de production

```
Frontend (index.html, index.com.html)
├─ Hébergement statique: Netlify, Vercel, GitHub Pages, ou serveur web
└─ CDN pour les assets

Backend (Node.js + Express + MQTT)
├─ VPS/Cloud: DigitalOcean, AWS, Azure, Heroku
├─ Base de données: JSON files ou migration vers MongoDB/PostgreSQL
└─ MQTT Broker: HiveMQ Cloud, EMQX Cloud, ou auto-hébergé
```

---

## 📦 Option 1: Déploiement rapide (Netlify + Render)

### Frontend sur Netlify

**1. Préparation:**
```powershell
# Créer un fichier netlify.toml
```

**2. Déploiement:**
- Connectez-vous sur https://netlify.com
- "Add new site" → "Deploy manually"
- Glissez-déposez le dossier du projet
- Configurez le domaine custom

**3. Configuration DNS:**
```
Type: A Record
Name: @
Value: 75.2.60.5 (IP Netlify)

Type: CNAME
Name: www
Value: votresite.netlify.app
```

### Backend sur Render

**1. Créer un service Web:**
- Allez sur https://render.com
- "New" → "Web Service"
- Connectez votre repo GitHub ou déployez depuis le dossier `backend/`

**2. Configuration:**
```
Build Command: npm install
Start Command: node server.js
Environment Variables:
  - PORT=3000
  - MQTT_BROKER=mqtt://broker.hivemq.com:1883
  - NODE_ENV=production
```

**3. Récupérez l'URL backend (ex: https://cmuc-backend.onrender.com)**

---

## 🖥️ Option 2: VPS (DigitalOcean, AWS, etc.)

### Installation sur Ubuntu/Debian

**1. Connexion SSH:**
```bash
ssh root@votre-serveur-ip
```

**2. Installation Node.js:**
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

**3. Installation NGINX:**
```bash
sudo apt update
sudo apt install nginx
```

**4. Déployer le backend:**
```bash
# Créer le dossier
mkdir -p /var/www/cmuc-backend
cd /var/www/cmuc-backend

# Cloner ou copier les fichiers backend
scp -r backend/* root@serveur:/var/www/cmuc-backend/

# Installer les dépendances
npm install --production

# Initialiser les codes
node scripts/init-codes.js

# Démarrer avec PM2
pm2 start server.js --name cmuc-backend
pm2 save
pm2 startup
```

**5. Configuration NGINX (Backend API):**
```nginx
# /etc/nginx/sites-available/api.connectmeifucan.com
server {
    listen 80;
    server_name api.connectmeifucan.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**6. Configuration NGINX (Frontend):**
```nginx
# /etc/nginx/sites-available/connectmeifucan.com
server {
    listen 80;
    server_name connectmeifucan.com www.connectmeifucan.com;
    root /var/www/html/connectmeifucan;
    index index.html index.com.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**7. Activer les sites:**
```bash
sudo ln -s /etc/nginx/sites-available/api.connectmeifucan.com /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/connectmeifucan.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**8. SSL avec Let's Encrypt:**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d connectmeifucan.com -d www.connectmeifucan.com
sudo certbot --nginx -d api.connectmeifucan.com
```

**9. Déployer le frontend:**
```bash
# Copier les fichiers
sudo mkdir -p /var/www/html/connectmeifucan
scp -r *.html *.jpg Picto/ Site/ backend/data root@serveur:/var/www/html/connectmeifucan/
sudo chown -R www-data:www-data /var/www/html/connectmeifucan
```

---

## 🔧 Configuration de production

### Frontend (index.com.html)

Remplacez la ligne API_BASE:
```javascript
const API_BASE = localStorage.getItem('cmuc_api_base') || 'https://api.connectmeifucan.com';
```

### Backend (.env)

Créez `/var/www/cmuc-backend/.env`:
```env
PORT=3000
NODE_ENV=production
MQTT_BROKER=mqtt://broker.hivemq.com:1883
MQTT_USERNAME=
MQTT_PASSWORD=
```

### CORS Backend (server.js)

Vérifiez que CORS autorise votre domaine:
```javascript
app.use(cors({
  origin: ['https://connectmeifucan.com', 'https://www.connectmeifucan.com'],
  credentials: true
}));
```

---

## 🔒 Sécurité

**1. Firewall:**
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

**2. Fail2ban:**
```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

**3. Mise à jour automatique:**
```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

**4. Rotation des logs:**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 📊 Monitoring

**1. PM2 Monitoring:**
```bash
pm2 monit
pm2 logs cmuc-backend
```

**2. NGINX Logs:**
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

**3. Health checks:**
- Backend: https://api.connectmeifucan.com/health
- Frontend: https://connectmeifucan.com

---

## 🔄 Mise à jour

**Backend:**
```bash
cd /var/www/cmuc-backend
git pull  # ou scp des nouveaux fichiers
npm install
pm2 restart cmuc-backend
```

**Frontend:**
```bash
cd /var/www/html/connectmeifucan
# Copier les nouveaux fichiers
sudo systemctl reload nginx
```

---

## 🚨 Dépannage

**Backend ne démarre pas:**
```bash
pm2 logs cmuc-backend --lines 50
pm2 restart cmuc-backend
```

**CORS errors:**
- Vérifiez les origines autorisées dans `server.js`
- Vérifiez les headers NGINX

**SSL issues:**
```bash
sudo certbot renew --dry-run
sudo certbot renew
```

**MQTT connection failed:**
- Vérifiez les credentials dans `.env`
- Testez avec `mqtt://broker.hivemq.com:1883` (public)
- L'API REST fonctionne sans MQTT

---

## 📱 Alternative: Hébergement Cloud

### Vercel (Frontend)
```powershell
npm install -g vercel
cd connectmeifucan-PROD
vercel
```

### Railway (Backend)
1. https://railway.app
2. "New Project" → "Deploy from GitHub"
3. Sélectionnez le dossier backend
4. Variables d'environnement automatiques

### Netlify (Frontend)
```powershell
npm install -g netlify-cli
netlify deploy --prod
```

---

## ✅ Checklist de déploiement

- [ ] Domaine configuré et DNS propagé
- [ ] SSL/HTTPS activé
- [ ] Backend déployé et accessible
- [ ] Frontend déployé
- [ ] Variables d'environnement configurées
- [ ] Codes d'accès initialisés
- [ ] CORS configuré correctement
- [ ] Tests d'authentification réussis
- [ ] Monitoring en place
- [ ] Sauvegardes configurées (users.json)
- [ ] Documentation mise à jour

---

## 🎓 Ressources

- [Netlify Docs](https://docs.netlify.com)
- [Render Docs](https://render.com/docs)
- [DigitalOcean Tutorials](https://www.digitalocean.com/community/tutorials)
- [PM2 Documentation](https://pm2.keymetrics.io/docs)
- [NGINX Documentation](https://nginx.org/en/docs/)
