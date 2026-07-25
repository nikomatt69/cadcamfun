# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

CAD/CAM FUN is a comprehensive web application for computer-aided design and manufacturing with AI integration. The app features a dual subscription system architecture supporting both legacy Stripe integration and Better Auth Stripe plugin.

## Development Commands

### Core Development
- `yarn dev` - Start development server on port 3000
- `yarn scan` - Start with React Scan debugging on port 3001
- `yarn build` - Production build
- `yarn start` - Start production server
- `yarn lint` - Run ESLint
- `yarn export` - Export static build

### Database & Prisma
- `yarn prisma:generate` - Generate Prisma client
- `yarn prisma:migratedev` - Run database migrations in development
- `yarn prisma:migrate` - Deploy migrations to production

### Desktop (Tauri)
- `yarn tauri:dev` - Start Tauri development
- `yarn tauri:build` - Build desktop application
- `yarn build:desktop` - Build web + desktop

### Testing & Analysis
- `yarn analyze` - Bundle analysis
- `yarn test:component` - Component testing

## Architecture Overview

### Authentication System (Better Auth)
- **Location**: `src/lib/auth.ts`
- **Type**: Better Auth with multiple plugins
- **Plugins**: Passkey, Magic Link, Two-Factor, Stripe
- **Database**: PostgreSQL via Prisma adapter
- **IMPORTANT**: Do not modify existing auth configuration - only add new plugins

### Dual Subscription Architecture

#### 1. Legacy System (Existing)
- **Service**: `src/lib/stripe/stripeService.ts`
- **API**: `src/pages/api/subscriptions/*`
- **Context**: `src/contexts/SubscriptionContext.tsx`
- **Database**: Prisma `Subscription` model
- **Status**: Production-ready, fully functional

#### 2. Better Auth Stripe Plugin (New)
- **Service**: `src/lib/better-auth-stripe.ts`
- **API**: `src/pages/api/better-auth-stripe/*`
- **Hooks**: `src/hooks/useBetterAuthStripe.ts`
- **Integration**: Extends existing SubscriptionContext
- **Status**: Parallel implementation for testing

### Subscription Plans
- **FREE**: Basic access
- **BASIC**: $9.99/month (basic features)
- **PRO**: $19.99/month (advanced features + 14-day trial)
- **ENTERPRISE**: $49.99/month (full feature set)

### Feature Flag System
- **Service**: `src/lib/featureFlags/featureFlagService.ts`
- **Types**: `src/types/featureFlags.ts`
- **Purpose**: Plan-based feature access control
- **Features**: AI, CAD, CAM, Collaboration, Analytics

## Key Components

### Subscription Management
```typescript
// Legacy system
const { plan, createCheckoutSession, hasFeature } = useSubscription();

// Better Auth system
const { createCheckout, hasFeature } = useBetterAuthStripe();
const subscription = useSubscription();
await subscription.betterAuth.createCheckoutSessionBA("PRO");
```

### API Route Structure
```
/api/subscriptions/          # Legacy Stripe
/api/better-auth-stripe/     # Better Auth Stripe
/api/auth/                   # Authentication
/api/ai/                     # AI features
/api/components/             # CAD components
/api/toolpaths/              # CAM toolpaths
```

### Database Schema
- **Users**: Better Auth managed
- **Subscriptions**: Dual system (legacy + Better Auth sync)
- **Components**: CAD component storage
- **Toolpaths**: CAM toolpath data
- **Analytics**: Usage tracking

## Development Guidelines

### Subscription System Rules
1. **NEVER remove or modify legacy subscription code**
2. **ALWAYS maintain backward compatibility**
3. **Use Better Auth methods through `subscription.betterAuth.*`**
4. **Test both systems in parallel**
5. **Sync data between systems when needed**

### Adding New Features
1. Check feature flag access first
2. Use middleware `withApiAuth` for protected routes
3. Use `withSubscription` for plan-based protection
4. Implement both legacy and Better Auth support if subscription-related

### Environment Variables Required
```bash
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Auth
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="..."

# Stripe
STRIPE_SECRET_KEY="sk_..."
STRIPE_PUBLISHABLE_KEY="pk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Plan Price IDs
STRIPE_BASIC_PRICE_ID="price_..."
STRIPE_PRO_PRICE_ID="price_..."
STRIPE_ENTERPRISE_PRICE_ID="price_..."

# Social Auth
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Email
RESEND_API_KEY="re_..."
```

## Testing Strategy

### Subscription Testing
1. Test legacy system functionality
2. Test Better Auth system in parallel
3. Compare results between systems
4. Use `useSubscriptionComparison()` hook for debugging

### Feature Access Testing
```typescript
// Test both systems
const legacyAccess = hasFeature(FeatureFlag.AI_ASSISTANT);
const betterAuthAccess = await hasFeatureBA(FeatureFlag.AI_ASSISTANT);
```

## Common Workflows

### Adding New Subscription Plan
1. Update `src/lib/auth.ts` - Better Auth plans array
2. Update `src/lib/stripe.ts` - Legacy plans
3. Add environment variable for Stripe price ID
4. Update feature flag mappings
5. Test both systems

### Migration Path (Future)
1. Phase 1: Dual system (current)
2. Phase 2: Feature flag to switch systems
3. Phase 3: Migrate users to Better Auth
4. Phase 4: Remove legacy system

### Debugging Subscriptions
```typescript
const { compare } = useSubscriptionComparison();
const comparison = await compare();
console.log("System comparison:", comparison);
```

## File Structure Priority

### High Priority (Core)
- `src/lib/auth.ts` - Authentication configuration
- `src/contexts/SubscriptionContext.tsx` - Subscription state
- `src/lib/better-auth-stripe.ts` - Better Auth integration
- `src/hooks/useBetterAuthStripe.ts` - Better Auth hooks

### Medium Priority (Features)
- `src/pages/api/better-auth-stripe/*` - New API routes
- `src/lib/featureFlags/*` - Feature management
- `src/components/subscription/*` - UI components

### Low Priority (Legacy)
- `src/lib/stripe/*` - Legacy Stripe service
- `src/pages/api/subscriptions/*` - Legacy API routes

## Production Considerations

### Security
- Better Auth handles CSRF protection
- API routes use `withApiAuth` middleware
- Webhook signature verification required
- Secure cookie configuration in production

### Performance
- Prisma with connection pooling
- Feature flag caching
- Subscription data caching in context

### Monitoring
- Both subscription systems logged separately
- Error tracking with proper context
- Usage analytics integration

## Support Commands

### Database Reset (Development Only)
```bash
yarn prisma migrate reset
yarn prisma:generate
```

### Clean Install
```bash
rm -rf node_modules yarn.lock
yarn install
yarn prisma:generate
```

This dual-system approach ensures zero downtime migration from legacy Stripe to Better Auth Stripe while maintaining full backward compatibility.