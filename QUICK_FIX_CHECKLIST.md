# Quick Fix Checklist for Render Deployment

## ✅ What to Update in Render Dashboard

### Location: Settings Tab → Service Configuration

```
┌─────────────────────────────────────┐
│  Root Directory:  [server]          │
│  Build Command:   [npm install]     │
│  Start Command:   [npm start]       │
└─────────────────────────────────────┘
```

## 📍 Exact Steps

1. ✅ Go to: https://dashboard.render.com
2. ✅ Click: Your "Neo" service
3. ✅ Click: "Settings" tab
4. ✅ Update: Root Directory = `server`
5. ✅ Update: Build Command = `npm install`
6. ✅ Update: Start Command = `npm start`
7. ✅ Click: "Save Changes"
8. ✅ Go to: "Manual Deploy"
9. ✅ Select: "Deploy latest commit"
10. ✅ Wait: For deployment to complete

## 🎯 Expected Outcome

After these changes, your service should:
- ✅ Build successfully
- ✅ Start without errors
- ✅ Respond to health checks
- ✅ Be accessible at your Render URL

## 🔍 Verification

Test your service:
```bash
curl https://neo-tvrz.onrender.com/health
```

Should return:
```json
{"status":"ok","ts":"..."}
```

---

**Time Required**: ~5 minutes
**Difficulty**: Easy
**Status**: Ready to deploy ✅

