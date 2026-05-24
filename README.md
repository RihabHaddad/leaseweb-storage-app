# Dummy App — Deploy Guide (LeaseWeb)
# Rihab's tasks: deploy the app, run all tests

---

## Structure

dummyapp/
├── backend/          → Node.js Express API
│   ├── src/
│   │   ├── index.js      main app
│   │   ├── db.js         PostgreSQL connection + schema
│   │   └── routes/
│   │       ├── health.js     GET /health
│   │       ├── items.js      GET/POST/DELETE /api/items
│   │       └── upload.js     POST/GET /api/upload
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/
│   └── index.html    → single-page test dashboard
├── helm/dummyapp/    → Helm chart for LKS
├── k8s/              → raw manifests (secret)
├── nginx.conf        → nginx config for IaaS (vm-frontend)
├── docker-compose.yml  → local dev
└── docker-nginx-dev.conf

---

## Option A — IaaS (VMs)

### 1. On vm-backend (10.1.1.20)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone / copy the app
scp -r ./backend ubuntu@10.1.1.20:/home/ubuntu/dummyapp

# On vm-backend:
cd /home/ubuntu/dummyapp/backend
cp .env.example .env
nano .env   # fill in DB_HOST, DB_PASSWORD

npm install
npm start
# → Running on port 3000
```

### 2. On vm-frontend (10.1.1.10)

```bash
# Install nginx + certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Copy frontend files
sudo mkdir -p /var/www/dummyapp
sudo cp frontend/index.html /var/www/dummyapp/

# Copy nginx config
sudo cp nginx.conf /etc/nginx/sites-available/dummyapp
sudo ln -s /etc/nginx/sites-available/dummyapp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# TLS cert
sudo certbot --nginx -d yourdomain.com
```

### 3. Validate

```bash
# Health check (DB connectivity)
curl https://yourdomain.com/health

# Create an item (DB write)
curl -X POST https://yourdomain.com/api/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"test","value":"hello"}'

# File upload (storage)
curl -X POST https://yourdomain.com/api/upload \
  -F 'file=@/tmp/testfile.txt'

# List items
curl https://yourdomain.com/api/items
```

---

## Option B — LKS (Kubernetes)

### 1. Build & push image

```bash
cd backend
docker build -t your-registry/dummyapp-backend:latest .
docker push your-registry/dummyapp-backend:latest
```

### 2. Create namespace + secret

```bash
kubectl create namespace app

# Edit k8s/db-secret.yaml — replace base64 password:
echo -n 'yourpassword' | base64
# Paste result into db-secret.yaml

kubectl apply -f k8s/db-secret.yaml
```

### 3. Edit Helm values

```bash
nano helm/dummyapp/values.yaml
# Set:
#   image.repository  → your registry image
#   db.host           → LeaseWeb managed DB private IP
#   ingress.hosts     → your domain
#   ingress.tls       → your domain
```

### 4. Deploy via Helm

```bash
helm install dummyapp ./helm/dummyapp \
  --namespace app \
  --create-namespace

# Watch rollout:
kubectl rollout status deployment/dummyapp-backend -n app
```

### 5. Validate

```bash
# Check pods
kubectl get pods -n app

# Check ingress
kubectl get ingress -n app

# Check TLS cert
kubectl get certificate -n app

# Test health
curl https://app.yourdomain.com/health

# Test HPA (run k6 load test to trigger scaling)
kubectl get hpa -n app -w
```

---

## Local dev (quick test before deploying)

```bash
docker compose up --build
# Frontend: http://localhost:8080
# API:      http://localhost:3000
# Health:   http://localhost:3000/health
```

---

## Endpoints summary

| Method | Path             | What it tests              |
|--------|-----------------|----------------------------|
| GET    | /health          | DB connectivity            |
| GET    | /api/items       | DB read                    |
| POST   | /api/items       | DB write                   |
| DELETE | /api/items/:id   | DB delete                  |
| POST   | /api/upload      | File storage write         |
| GET    | /api/upload      | File storage read (list)   |
| GET    | /files/:filename | Serve uploaded file        |

---

## WAF test payloads (run from WAF test panel in browser or curl)

```bash
# SQLi — should be blocked 403
curl -X POST https://yourdomain.com/api/items \
  -H 'Content-Type: application/json' \
  -d '{"name": "'"'"' OR '"'"'1'"'"'='"'"'1'"'"'; DROP TABLE items;--"}'

# XSS
curl -X POST https://yourdomain.com/api/items \
  -H 'Content-Type: application/json' \
  -d '{"name": "<script>alert(1)</script>"}'

# Path traversal
curl https://yourdomain.com/files/../../../../etc/passwd

# Rate limit — run 110 times quickly:
for i in $(seq 1 110); do curl -s -o /dev/null -w "%{http_code}\n" https://yourdomain.com/api/items; done
```
