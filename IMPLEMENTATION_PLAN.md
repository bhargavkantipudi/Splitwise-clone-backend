# Backend Implementation Plan

## 1. Architecture Overview
- **Framework**: Node.js + Express
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT (JSON Web Tokens)

## 2. Database Schema (Prisma)
- **User**: id, email, password_hash, name, created_at
- **Group**: id, name, created_at, updated_at
- **GroupMember**: user_id, group_id, joined_at
- **Expense**: id, group_id, payer_id, amount, description, date
- **ExpenseSplit**: expense_id, user_id, amount_owed

## 3. Core Features & API Endpoints
### Authentication
- `POST /api/auth/register` - Create a new user
- `POST /api/auth/login` - Authenticate and return JWT

### Users
- `GET /api/users/me` - Get current user profile and balances

### Groups
- `GET /api/groups` - List user's groups
- `POST /api/groups` - Create a new group
- `GET /api/groups/:id` - Get group details and expenses
- `POST /api/groups/:id/members` - Add user to group

### Expenses
- `POST /api/expenses` - Create a new expense and splits
- `GET /api/expenses/:id` - Get expense details
- `DELETE /api/expenses/:id` - Delete an expense

### Balances (Debt Simplification)
- `GET /api/groups/:id/balances` - Get simplified debts for a group (who owes who)

## 4. Development Steps
1. Define the models in `prisma/schema.prisma`.
2. Generate Prisma Client and apply migrations.
3. Setup global Error Handling middleware.
4. Implement JWT validation middleware.
5. Create Controllers and Routes for the endpoints listed above.
6. Write unit and integration tests.
