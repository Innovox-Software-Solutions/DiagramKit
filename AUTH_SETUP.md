# DiagramKit - Authentication Setup

## What's been configured:

### 🔐 Google OAuth Authentication
- Users can sign in with their Google account
- Sign-in UI at `/auth/signin`
- User profile menu in top-right corner

### 🚪 Auth-gated features (login required):
- **Export/Download** - PNG/JPG export
- **Share** - Save board to file
- **Import** - Load board from file

### ✅ Public features (no login needed):
- Drawing and creating shapes
- Zooming, panning, selecting
- All drawing tools
- Local board management
- Undo/redo

### 📦 Tech Stack:
- **NextAuth v5** (beta) for authentication
- **Prisma 7** with MongoDB adapter
- **MongoDB Atlas** for data storage

## Running the app:

1. **Generate Prisma Client** (already done):
   ```bash
   npx prisma generate
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Visit**: http://localhost:3000

## Environment Variables (already configured in .env):
- `DATABASE_URL` - MongoDB connection string
- `NEXTAUTH_URL` - App URL (http://localhost:3000)
- `NEXTAUTH_SECRET` - Generated secure secret
- `GOOGLE_CLIENT_ID` - Your Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Your Google OAuth secret

## How it works:

1. Users can browse and draw without signing in
2. When they try to export, share, or import:
   - A confirmation dialog appears
   - They're redirected to Google sign-in
   - After auth, they can use those features
3. User menu shows in top-right when signed in
4. Sign out option available in dropdown

## MongoDB Schema:
- **User** - Google profile info
- **Account** - OAuth provider data
- **Session** - Authentication sessions
- **Board** - Saved drawings (future feature)

## Future Enhancements:
- Save boards to cloud (MongoDB)
- Load user's boards from database
- Share boards with other users
- Real-time collaboration
