# ⚡ QUICKSTART - School ERP

Get the system running in 2 minutes.

## Prerequisites

- ✅ Node.js 18+ installed
- ✅ Docker & Docker Compose installed
- ✅ Git (optional)

## 🚀 Windows Setup

```powershell
# 1. Navigate to project
cd "C:\Users\XFMW0715\Desktop\GESTION SCHOOL"

# 2. Run setup
.\setup.bat

# 3. Wait ~30 seconds for services to start
# 4. Open your browser
```

**Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000/api
- API Docs: http://localhost:4000/api/docs

## 🚀 Linux/macOS Setup

```bash
# 1. Navigate to project
cd ~/Desktop/GESTION\ SCHOOL

# 2. Make setup executable
chmod +x setup.sh

# 3. Run setup
./setup.sh

# 4. Wait ~30 seconds for services to start
# 5. Open your browser
```

**Access:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000/api
- API Docs: http://localhost:4000/api/docs

## 📍 Access Everything

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3000 | Web application |
| Backend API | http://localhost:4000/api | REST API |
| Swagger Docs | http://localhost:4000/api/docs | API documentation |
| MailHog | http://localhost:8025 | Email testing |
| Database GUI | See commands below | Prisma Studio |

## 🎓 Test Accounts (Coming Soon)

When implementation is complete:

```
Email: admin@school.local
Password: admin123

Email: director@school.local
Password: dir123

Email: teacher@school.local
Password: teach123
```

## 📚 Documentation

- **Full Setup**: See [README.md](README.md)
- **Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md)
- **Roadmap**: See [ROADMAP.md](ROADMAP.md)
- **Implementation**: See [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)
- **Navigation**: See [INDEX.md](INDEX.md)

## 🛠️ Common Commands

### View Services Status
```bash
docker-compose ps
```

### View Logs
```bash
docker-compose logs -f
```

### View Backend Logs Only
```bash
docker-compose logs -f backend
```

### Open Database GUI
```bash
docker-compose exec backend npx prisma studio
```

### Stop Services
```bash
docker-compose down
```

### Reset Everything (⚠️ Deletes all data)
```bash
docker-compose down -v
docker-compose up -d
```

## ⚠️ Troubleshooting

### Port Already in Use

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Services Not Starting

```bash
# Check logs
docker-compose logs -f

# Ensure Docker is running
docker ps

# Rebuild images
docker-compose up -d --build
```

### LDAP Connection Error

```bash
# LDAP needs time to start, wait 20 seconds
docker-compose logs openldap

# Or restart it
docker-compose restart openldap
```

## ✅ Verification

After setup, verify everything is working:

```bash
# 1. Check all services are running
docker-compose ps
# Should show: postgres, redis, openldap, mailhog, backend, frontend, nginx (all UP)

# 2. Test backend
curl http://localhost:4000/health

# 3. Test frontend
curl http://localhost:3000

# 4. View API docs
# Open http://localhost:4000/api/docs in browser
```

## 🚀 What's Next?

1. **Explore API Docs**: http://localhost:4000/api/docs
2. **View Database**: `docker-compose exec backend npx prisma studio`
3. **Read Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)
4. **Follow Implementation**: [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)

## 📞 Need Help?

- **Common Issues**: [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md#common-issues--solutions)
- **Full Docs**: [INDEX.md](INDEX.md)
- **Check Logs**: `docker-compose logs -f`

---

**Ready to go? 🎉**

Your School ERP system is now running locally!

Next step: Read the [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) to start development.
