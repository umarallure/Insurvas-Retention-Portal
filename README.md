# Retention Portal

A comprehensive retention management system for insurance policies, built with Next.js and Supabase.

## Features

- **Lead Management**: Track and manage customer leads and policies
- **Retention Agent Workflows**: Fixed payment, carrier requirements, and new sale workflows
- **Manager Dashboard**: Assign leads, track performance, and monitor fixed policies
- **Data Quality**: Cross-table validation and completeness scoring
- **Activity Timeline**: Complete audit trail of all activities
- **Real-time Updates**: Live data synchronization with Supabase

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm, yarn, pnpm, or bun
- Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd RetentionPortal
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Fill in your environment variables in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

5. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
RetentionPortal/
├── src/
│   ├── components/       # React components
│   ├── lib/             # Utility functions and logic
│   ├── pages/            # Next.js pages and API routes
│   └── hooks/            # Custom React hooks
├── supabase/
│   └── migrations/      # Database migrations
└── scripts/             # Utility scripts (development only)
```

## Security

**IMPORTANT**: Never commit `.env*` files or any files containing secrets to version control.

See [SECURITY.md](./SECURITY.md) for detailed security guidelines.

## Documentation

- [Database Schema](./DATABASE_SCHEMA.md) - Complete database structure
- [How It Works](./HOW_IT_WORKS.md) - Business flow and data flow
- [Portal Enhancement Plan](./PORTAL_ENHANCEMENT_PLAN.md) - Enhancement roadmap

## Tech Stack

- **Framework**: Next.js 16
- **Database**: Supabase (PostgreSQL)
- **UI**: React 19, Tailwind CSS, Radix UI
- **State Management**: React Hooks
- **Charts**: Recharts
- **Forms**: React Hook Form, Zod

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Contributing

1. Create a feature branch
2. Make your changes
3. Ensure all tests pass
4. Submit a pull request

## License

Private - All rights reserved
