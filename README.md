# Metricorex (Fusion Starter)

Metricorex web app (project: Metroflow) — the all-in-one business suite: workspace (tasks, boards, backlog, ideas), team tools (meetings, calls, chat), finance (wallets, transfers, payroll) and the Get Paid revenue suite (payment links, smart invoices, storefront, recurring billing, MetricAi credits). Built with React (Vite), Node.js and PostgreSQL.

## 🚀 Features

- **Authentication & Authorization**: Secure login, registration, password recovery, and role-based access control (Admin/Developer).
- **Business Management**: Multi-tenant support with business-specific data isolation.
- **Task Management**:
  - Create and track tasks with targets and accomplished values.
  - Organize tasks by Sprints and Epics.
  - Assign tasks to specific developers.
  - Track status, due dates, and overdue items.
- **Dashboard**: Visual analytics using Recharts to monitor progress and KPIs.
- **Activity Logs**: Audit trail of user actions and system events.
- **Developer Management**: Manage team members, invites, and profiles.
- **Wallet & Fintech**: Personal + business wallets, virtual accounts, card funding, single/bulk/international transfers, payroll.
- **Payment Links**: create shareable checkout links (fixed or custom amount) and track every payment.
- **Smart Invoices**: itemised invoices with tax & due dates and a public checkout page clients pay on.
- **Storefront**: list products/services, share your store link and get paid through hosted checkout (public page at `/store/public/:businessId`, order tracking at `/store/order/:reference`).
- **Recurring Billing (Subscriptions)**: create customer subscription plans on any interval with auto-charging wallet subscribers and emailed checkout links (public subscribe at `/subscribe/:publicId`).
- **Collapsible sidebar**: nav restructured into expandable groups (Workspace / Team / Finance / Get Paid / Account) so the suite stays easy to scan.
- **MetricAi**: AI copilot (chat, images, meeting notes, product documentation) with purchasable credit packs.
- **Subscription & Pricing**: plan limits ladder (team, RTC, MetricAi, store, recurring, links, invoices) with full feature lists (see more/see less).

## 🛠️ Tech Stack

### Frontend

- **Framework**: [React](https://reactjs.org/) with [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Radix UI](https://www.radix-ui.com/) (via shadcn/ui patterns)
- **State Management**: [TanStack Query](https://tanstack.com/query/latest) (React Query)
- **Forms**: [React Hook Form](https://react-hook-form.com/) with [Zod](https://zod.dev/) validation
- **Charts**: [Recharts](https://recharts.org/)

### Backend

- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Express](https://expressjs.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) (using `pg` driver)
- **API**: RESTful API architecture
- **Deployment**: Configured for [Netlify](https://www.netlify.com/) Functions

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [PostgreSQL](https://www.postgresql.org/) database
- [pnpm](https://pnpm.io/) (recommended package manager)

## ⚙️ Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd Metricorex
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   # or
   npm install
   ```

## 🔧 Configuration

1. **Environment Variables**
   Create a `.env` file in the root directory based on `.env.example`:

   ```bash
   cp .env.example .env
   ```

2. **Update `.env` values**
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/your_database"
   JWT_SECRET="your-secure-jwt-secret"
   CLIENT_URL="http://localhost:5173" # Update port if different
   ```

## 🏃‍♂️ Running the Application

### Development

Start the development server (Frontend + Backend in development mode):

```bash
npm run dev
```

This will start Vite for the frontend. The backend setup depends on your specific dev environment configuration, but typically Vite proxies API requests or you run the server separately.

### Production Build

Build both client and server:

```bash
npm run build
```

To start the production server:

```bash
npm start
```

## 📜 Scripts

- `npm run dev`: Start the development server (Vite).
- `npm run build`: Build both client and server.
- `npm run build:client`: Build only the frontend.
- `npm run build:server`: Build only the backend.
- `npm run test`: Run tests using Vitest.
- `npm run typecheck`: Run TypeScript type checking.
- `npm run format.fix`: Format code using Prettier.

## 📂 Project Structure

```
Metricorex/
├── client/                 # Frontend source code
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── pages/              # Application pages/routes
│   └── lib/                # Utility functions
├── server/                 # Backend source code
│   ├── routes/             # API routes
│   ├── middleware/         # Express middleware (auth, etc.)
│   ├── services/           # Business logic services
│   └── db.ts               # Database connection and schema
├── shared/                 # Shared types/utils between client and server
├── netlify/                # Netlify serverless functions configuration
└── public/                 # Static assets
```

## 🤝 Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Branching

- `main` — production (deployed via Netlify).
- `develop` — integration branch. Changes land here first and are verified, then a PR `develop → main` is merged for release.
- Hotfixes may branch from `main` and be merged back into `develop` to keep them in sync.
