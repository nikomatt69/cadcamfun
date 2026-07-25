#!/usr/bin/env node

/**
 * 🚀 CAD/CAM FUN - Production Auth Verification Script
 * 
 * Questo script verifica che l'integrazione Better Auth sia completamente production-ready
 * Controlla configurazioni, dipendenze, file richiesti e sicurezza
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colori per output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
    title: (msg) => console.log(`${colors.bold}${colors.cyan}\n🔍 ${msg}${colors.reset}\n${'='.repeat(60)}`),
    subtitle: (msg) => console.log(`${colors.magenta}\n📋 ${msg}${colors.reset}`)
};

let totalChecks = 0;
let passedChecks = 0;

function check(condition, successMsg, errorMsg) {
    totalChecks++;
    if (condition) {
        log.success(successMsg);
        passedChecks++;
        return true;
    } else {
        log.error(errorMsg);
        return false;
    }
}

function fileExists(filePath) {
    return fs.existsSync(path.join(process.cwd(), filePath));
}

function readFile(filePath) {
    try {
        return fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
    } catch (error) {
        return null;
    }
}

function hasContent(filePath, searchString) {
    const content = readFile(filePath);
    return content && content.includes(searchString);
}

// Main verification function
async function verifyProductionAuth() {
    log.title('CAD/CAM FUN - PRODUCTION AUTH VERIFICATION');

    console.log(`${colors.bold}Verifying Better Auth production-ready integration...${colors.reset}\n`);

    // 1. File Structure Verification
    log.subtitle('1. CORE FILES VERIFICATION');

    check(
        fileExists('src/lib/auth.ts'),
        'Better Auth server configuration found',
        'Better Auth server config missing (src/lib/auth.ts)'
    );

    check(
        fileExists('src/lib/auth-client.ts'),
        'Better Auth client configuration found',
        'Better Auth client config missing (src/lib/auth-client.ts)'
    );

    check(
        fileExists('src/lib/email.ts'),
        'Email service implementation found',
        'Email service missing (src/lib/email.ts)'
    );

    check(
        fileExists('src/contexts/AuthContext.tsx'),
        'Auth context implementation found',
        'Auth context missing (src/contexts/AuthContext.tsx)'
    );

    check(
        fileExists('src/pages/api/auth/[...auth].ts'),
        'Better Auth API handler found',
        'Better Auth API handler missing (src/pages/api/auth/[...auth].ts)'
    );

    check(
        fileExists('prisma/schema.prisma'),
        'Prisma schema found',
        'Prisma schema missing (prisma/schema.prisma)'
    );

    // 2. Dependencies Verification
    log.subtitle('2. DEPENDENCIES VERIFICATION');

    const packageJson = readFile('package.json');
    const dependencies = packageJson ? JSON.parse(packageJson) : {};

    check(
        dependencies.dependencies && dependencies.dependencies['better-auth'],
        'Better Auth dependency installed',
        'Better Auth dependency missing'
    );

    check(
        dependencies.dependencies && dependencies.dependencies['resend'],
        'Resend email service dependency installed',
        'Resend dependency missing'
    );

    check(
        dependencies.dependencies && dependencies.dependencies['@prisma/client'],
        'Prisma client dependency installed',
        'Prisma client dependency missing'
    );

    // 3. Configuration Verification
    log.subtitle('3. CONFIGURATION VERIFICATION');

    // Check auth.ts configuration
    const authConfig = readFile('src/lib/auth.ts');
    if (authConfig) {
        check(
            authConfig.includes('betterAuth'),
            'Better Auth instance configured',
            'Better Auth instance not properly configured'
        );

        check(
            authConfig.includes('sendPasswordResetEmail'),
            'Production password reset email implemented',
            'Password reset still using console.log'
        );

        check(
            authConfig.includes('sendVerificationEmail'),
            'Production verification email implemented',
            'Email verification still using console.log'
        );

        check(
            authConfig.includes('sendEmail'),
            'Production magic link email implemented',
            'Magic link still using console.log'
        );

        check(
            authConfig.includes('rateLimit'),
            'Rate limiting configured',
            'Rate limiting not configured'
        );

        check(
            authConfig.includes('useSecureCookies'),
            'Secure cookies configured for production',
            'Secure cookies not configured'
        );
    }

    // Check email.ts implementation
    const emailConfig = readFile('src/lib/email.ts');
    if (emailConfig) {
        check(
            emailConfig.includes('Resend'),
            'Resend email service configured',
            'Resend email service not configured'
        );

        check(
            emailConfig.includes('RESEND_API_KEY'),
            'Resend API key environment variable used',
            'Resend API key not configured'
        );

        check(
            emailConfig.includes('production-ready'),
            'Production-ready email implementation',
            'Email implementation not production-ready'
        );
    }

    // Check schema for Better Auth tables
    const schema = readFile('prisma/schema.prisma');
    if (schema) {
        check(
            schema.includes('model Session'),
            'Session table configured',
            'Session table missing from schema'
        );

        check(
            schema.includes('model Passkey'),
            'Passkey table configured',
            'Passkey table missing from schema'
        );

        check(
            schema.includes('model TwoFactor'),
            'Two-factor table configured',
            'Two-factor table missing from schema'
        );

        check(
            schema.includes('twoFactorEnabled'),
            'User model updated for Better Auth',
            'User model not updated for Better Auth'
        );
    }

    // 4. Environment Variables Verification
    log.subtitle('4. ENVIRONMENT VARIABLES VERIFICATION');

    const envExample = readFile('.env.example') || readFile('env.example');
    if (envExample) {
        check(
            envExample.includes('NEXTAUTH_SECRET'),
            'Auth secret documented in env.example',
            'NEXTAUTH_SECRET not documented'
        );

        check(
            envExample.includes('RESEND_API_KEY'),
            'Resend API key documented',
            'RESEND_API_KEY not documented'
        );

        check(
            envExample.includes('DATABASE_URL'),
            'Database URL documented',
            'DATABASE_URL not documented'
        );

        check(
            envExample.includes('GITHUB_CLIENT_ID'),
            'GitHub OAuth documented',
            'GitHub OAuth not documented'
        );
    }

    // 5. Pages Verification
    log.subtitle('5. AUTHENTICATION PAGES VERIFICATION');

    check(
        fileExists('src/pages/auth/signin.tsx'),
        'SignIn page exists',
        'SignIn page missing'
    );

    check(
        fileExists('src/pages/auth/signup.tsx'),
        'SignUp page exists',
        'SignUp page missing'
    );

    check(
        fileExists('src/pages/auth/magic-link.tsx'),
        'Magic Link page exists',
        'Magic Link page missing'
    );

    check(
        fileExists('src/pages/auth/two-factor.tsx'),
        'Two-Factor page exists',
        'Two-Factor page missing'
    );

    check(
        fileExists('src/pages/auth/reset-password.tsx'),
        'Password Reset page exists',
        'Password Reset page missing'
    );

    // Check if pages use Better Auth instead of custom implementations
    const signinPage = readFile('src/pages/auth/signin.tsx');
    if (signinPage) {
        check(
            signinPage.includes('signIn') && !signinPage.includes('CustomAuth'),
            'SignIn page uses Better Auth',
            'SignIn page still uses custom auth'
        );
    }

    // 6. TypeScript Compilation
    log.subtitle('6. TYPESCRIPT COMPILATION');

    try {
        execSync('npx tsc --noEmit', { stdio: 'pipe' });
        log.success('TypeScript compilation successful');
        passedChecks++;
    } catch (error) {
        log.error('TypeScript compilation failed');
    }
    totalChecks++;

    // 7. Security Verification
    log.subtitle('7. SECURITY VERIFICATION');

    const authClient = readFile('src/lib/auth-client.ts');
    if (authClient) {
        check(
            authClient.includes('createAuthClient'),
            'Auth client properly configured',
            'Auth client not properly configured'
        );

        check(
            !authClient.includes('TODO') && !authClient.includes('console.log'),
            'No development artifacts in auth client',
            'Development artifacts found in auth client'
        );
    }

    // Check for production environment handling
    if (authConfig) {
        check(
            authConfig.includes('NODE_ENV === "production"'),
            'Production environment detection implemented',
            'Production environment detection missing'
        );
    }

    // 8. Tauri Integration
    log.subtitle('8. TAURI DESKTOP INTEGRATION');

    check(
        fileExists('src-tauri/src/auth.rs'),
        'Tauri auth manager found',
        'Tauri auth manager missing'
    );

    const tauriAuth = readFile('src-tauri/src/auth.rs');
    if (tauriAuth) {
        check(
            tauriAuth.includes('BetterAuthSession'),
            'Better Auth session support in Tauri',
            'Better Auth session not implemented in Tauri'
        );

        check(
            tauriAuth.includes('authenticate_online'),
            'Online authentication implemented',
            'Online authentication missing in Tauri'
        );
    }

    // 9. Documentation
    log.subtitle('9. DOCUMENTATION VERIFICATION');

    check(
        fileExists('PRODUCTION_READY_CHECKLIST.md'),
        'Production checklist documentation found',
        'Production checklist missing'
    );

    // Final Results
    log.title('VERIFICATION RESULTS');

    const percentage = Math.round((passedChecks / totalChecks) * 100);

    console.log(`\n${colors.bold}📊 SUMMARY:${colors.reset}`);
    console.log(`   Total Checks: ${totalChecks}`);
    console.log(`   Passed: ${colors.green}${passedChecks}${colors.reset}`);
    console.log(`   Failed: ${colors.red}${totalChecks - passedChecks}${colors.reset}`);
    console.log(`   Success Rate: ${percentage >= 90 ? colors.green : percentage >= 70 ? colors.yellow : colors.red}${percentage}%${colors.reset}`);

    if (percentage >= 95) {
        console.log(`\n${colors.green}${colors.bold}🎉 PRODUCTION READY! ${colors.reset}`);
        console.log(`${colors.green}Better Auth integration is ready for production deployment.${colors.reset}`);
    } else if (percentage >= 80) {
        console.log(`\n${colors.yellow}${colors.bold}⚠️  MOSTLY READY ${colors.reset}`);
        console.log(`${colors.yellow}A few minor issues need to be resolved before production.${colors.reset}`);
    } else {
        console.log(`\n${colors.red}${colors.bold}❌ NOT READY ${colors.reset}`);
        console.log(`${colors.red}Significant issues need to be resolved before production.${colors.reset}`);
    }

    console.log(`\n${colors.blue}Next steps:${colors.reset}`);
    console.log(`1. Resolve any failing checks above`);
    console.log(`2. Test database connection: npx prisma db push`);
    console.log(`3. Run production build: npm run build`);
    console.log(`4. Deploy to production environment`);

    return percentage >= 95;
}

// Run verification
if (require.main === module) {
    verifyProductionAuth()
        .then((success) => {
            process.exit(success ? 0 : 1);
        })
        .catch((error) => {
            log.error(`Verification failed: ${error.message}`);
            process.exit(1);
        });
}

module.exports = { verifyProductionAuth }; 