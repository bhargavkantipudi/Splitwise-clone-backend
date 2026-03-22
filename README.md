# Splitwise Clone (Backend API)

The backend provides a robust RESTful API for managing users, groups, friends, shared expenses, and settlements. It leverages **Prisma ORM** for database interactions and **JWT** for secure authentication.

## 🛠️ Requirements

- **Node.js** (v18 or higher).
- **PostgreSQL** database (Local or Docker).
- **Docker & Docker Compose** (Recommended).

## 🚀 Setup & Execution

### Option 1: Docker (Recommended)
You can directly run the backend using the main repository's `docker-compose.yaml` file:
```bash
cd ..
docker-compose up --build -d backend
```

### Option 2: Local Manual Setup
1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env` file in this directory based on `.env.example`:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://user:pass@localhost:5432/splitwise_db?schema=public"
   JWT_SECRET="your-secret-key"
   ```

3. **Prisma Setup**:
   Generate the client and push the schema to the database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Run the server**:
   ```bash
   npm start
   ```
   *For development, use `npm run dev` (if nodemon is configured).*

## 📡 API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register a new user |
| POST | /api/auth/login | Login and get JWT |
| GET | /api/friends | Get all friends with balances |
| GET | /api/friends/:id/transactions | Shared history with a friend |
| POST | /api/expenses | Create a group or 1-on-1 expense |
| GET | /api/groups | List your groups |
| GET | /api/groups/:id/balances | Simplified debts in a group |
| POST | /api/settlements | Record a payment to settle up |

## 🧪 Testing
Run our integration and unit tests:
```bash
npm test
```
*Tests are built using **Jest** and **Supertest** for the API.*
