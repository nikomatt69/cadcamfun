# GitHub OAuth Integration Setup Guide

This guide will help you set up GitHub OAuth authentication in your CAD/CAM FUN application using Better Auth.

## Prerequisites

- A GitHub account
- Access to your GitHub organization (if using organization-level OAuth)
- Admin access to your application's repository

## Step 1: Create a GitHub OAuth App

1. Go to GitHub Settings:
   - Personal account: https://github.com/settings/developers
   - Organization: https://github.com/organizations/YOUR_ORG/settings/applications

2. Click "New OAuth App" or "Register a new application"

3. Fill in the application details:
   - **Application name**: CAD/CAM FUN
   - **Homepage URL**: 
     - Development: `https://localhost:3000`
     - Production: `https://cadcamfun.xyz`
   - **Application description**: Advanced CAD/CAM workspace with AI-powered design capabilities
   - **Authorization callback URL**: 
     - Development: `https://localhost:3000/api/auth/callback/github`
     - Production: `https://cadcamfun.xyz/api/auth/callback/github`

4. Click "Register application"

5. After creation, you'll see:
   - **Client ID**: Copy this value
   - **Client Secret**: Click "Generate a new client secret" and copy the value

## Step 2: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Add your GitHub OAuth credentials to `.env.local`:
   ```env
   GITHUB_CLIENT_ID="your_github_client_id_here"
   GITHUB_CLIENT_SECRET="your_github_client_secret_here"
   ```

3. Ensure other required variables are set:
   ```env
   NEXTAUTH_URL="https://localhost:3000"  # or your production URL
   NEXTAUTH_SECRET="your-secret-key-here"
   DATABASE_URL="your-database-connection-string"
   ```

## Step 3: Database Setup

The GitHub OAuth integration uses Better Auth's built-in account linking system. Ensure your database has the required tables:

1. Run Prisma migrations:
   ```bash
   npm run prisma:migrate
   ```

2. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```

## Step 4: Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to the sign-in page: `https://localhost:3000/auth/signin`

3. Click "Continue with GitHub" button

4. You should be redirected to GitHub for authorization

5. After granting permissions, you'll be redirected back to your application

## Features Included

### Authentication
- ✅ GitHub OAuth sign-in
- ✅ GitHub OAuth sign-up
- ✅ Account linking for existing users
- ✅ Automatic user profile creation
- ✅ Session management

### User Interface
- ✅ GitHub sign-in button on login page
- ✅ GitHub sign-up button on registration page
- ✅ Loading states and error handling
- ✅ Responsive design with animations

### Profile Integration
- ✅ GitHub profile information sync
- ✅ Avatar image from GitHub
- ✅ GitHub username display
- ✅ Link to GitHub profile

## Configuration Options

### Scopes
The default configuration requests basic user information. To request additional scopes, modify the auth configuration in `src/lib/auth.ts`:

```typescript
socialProviders: {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    scope: ["user:email", "read:user"], // Add additional scopes here
  },
}
```

### Custom User Mapping
To customize how GitHub profile data maps to your user model:

```typescript
socialProviders: {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    mapProfileToUser: (profile) => {
      return {
        name: profile.name || profile.login,
        email: profile.email,
        image: profile.avatar_url,
        github: profile.login,
        bio: profile.bio,
        location: profile.location,
        website: profile.blog,
      };
    },
  },
}
```

## Production Deployment

### Vercel
1. Add environment variables in Vercel dashboard
2. Update the GitHub OAuth app callback URL to your production domain
3. Deploy your application

### Other Platforms
1. Set environment variables in your hosting platform
2. Update callback URLs in GitHub OAuth app settings
3. Ensure HTTPS is enabled for production

## Troubleshooting

### Common Issues

1. **"OAuth App not found" error**
   - Verify `GITHUB_CLIENT_ID` is correct
   - Ensure the OAuth app exists in the correct GitHub account/organization

2. **"Invalid client secret" error**
   - Regenerate the client secret in GitHub
   - Update `GITHUB_CLIENT_SECRET` in your environment variables

3. **Callback URL mismatch**
   - Ensure the callback URL in GitHub matches exactly: `https://yourdomain.com/api/auth/callback/github`
   - Check for trailing slashes or protocol mismatches

4. **Database connection issues**
   - Verify `DATABASE_URL` is correct
   - Ensure database is running and accessible
   - Run migrations if tables are missing

5. **CORS issues in development**
   - Ensure you're using `https://localhost:3000` (not `http://`)
   - Check that `NEXTAUTH_URL` matches your development URL

### Debug Mode
Enable debug logging by setting in your environment:
```env
NODE_ENV=development
```

Check the browser console and server logs for detailed error messages.

## Security Considerations

1. **Environment Variables**: Never commit `.env.local` to version control
2. **Client Secret**: Keep your GitHub client secret secure and rotate it regularly
3. **HTTPS**: Always use HTTPS in production
4. **Scope Permissions**: Only request the minimum required scopes
5. **Rate Limiting**: GitHub has API rate limits; implement appropriate caching

## Next Steps

After setting up GitHub OAuth, you can:
1. Add additional OAuth providers (Google, Discord, etc.)
2. Implement team/organization features using GitHub organizations
3. Sync repositories or project data from GitHub
4. Add GitHub-specific features like repository integration

## Support

If you encounter issues:
1. Check the [Better Auth documentation](https://www.better-auth.com/docs)
2. Review GitHub OAuth documentation
3. Check the application logs for detailed error messages
4. Ensure all environment variables are correctly set

## Updates and Maintenance

- Regularly update Better Auth to the latest version
- Monitor GitHub OAuth app usage in GitHub settings
- Rotate client secrets periodically for security
- Update callback URLs when deploying to new domains