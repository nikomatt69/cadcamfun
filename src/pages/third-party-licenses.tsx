import React from "react";
import EnhancedLayout from "@/src/components/layout/Layout"; // Adjust import path if necessary
import MetaTags from "@/src/components/layout/Metatags"; // Adjust import path if necessary

const ThirdPartyLicensesPage = () => {
  // **IMPORTANT:** Replace this placeholder data with your actual providers and packages.
  // Consult with legal counsel to ensure accuracy and compliance.

  const serviceProviders = [
    {
      name: "Vercel",
      purpose: "Hosting provider for our web application.",
      link: "https://vercel.com/legal/privacy-policy"
    },
    {
      name: "Prisma",
      purpose: "Database toolkit (ORM) used to interact with our database.",
      link: "https://www.prisma.io/legal/privacy-policy"
    },
    {
      name: "Neon",
      purpose: "Database hosting.",
      link: "https://neon.tech/privacy-policy"
    },
    {
      name: "NextAuth.js",
      purpose: "Authentication library handling user sign-in.",
      link: "https://next-auth.js.org/" // Link to project site, they likely don't have a separate policy
    },
    {
      name: "OpenAI",
      purpose: "Provides AI features within the application.",
      link: "https://openai.com/policies/privacy-policy"
    },
    {
      name: "Anthropic (Claude)",
      purpose: "Provides AI features within the application.",
      link: "https://www.anthropic.com/privacy"
    },
    { name: "Stripe", purpose: "Payment processing for subscriptions.", link: "https://stripe.com/privacy" },
    { name: "Resend", purpose: "Sending transactional emails.", link: "https://resend.com/privacy" }
    // Add other providers as needed (Analytics, Error Tracking, etc.)
  ];

  const openSourcePackages = [
    {
      name: "React",
      license: "MIT License",
      link: "https://github.com/facebook/react/blob/main/LICENSE"
    },
    {
      name: "Next.js",
      license: "MIT License",
      link: "https://github.com/vercel/next.js/blob/canary/LICENSE"
    },
    {
      name: "Prisma Client",
      license: "Apache License 2.0",
      link: "https://github.com/prisma/prisma/blob/main/LICENSE"
    },
    {
      name: "Tailwind CSS",
      license: "MIT License",
      link: "https://github.com/tailwindlabs/tailwindcss/blob/master/LICENSE"
    },
    {
      name: "NextAuth.js",
      license: "ISC License",
      link: "https://github.com/nextauthjs/next-auth/blob/main/LICENSE"
    },
    {
      name: "Headless UI",
      license: "MIT License",
      link: "https://github.com/tailwindlabs/headlessui/blob/main/LICENSE"
    },
    {
      name: "react-hot-toast",
      license: "MIT License",
      link: "https://github.com/timolins/react-hot-toast/blob/main/LICENSE"
    },
    {
      name: "Feather Icons",
      license: "MIT License",
      link: "https://github.com/feathericons/feather/blob/master/LICENSE"
    },
    {
      name: "Stripe",
      license: "MIT License",
      link: "https://github.com/stripe/stripe-js/blob/main/LICENSE"
    },
    {
      name: "Resend",
      license: "MIT License",
      link: "https://github.com/resend/resend-js/blob/main/LICENSE"
    },
    {
      name: "Prisma",
      license: "Apache License 2.0",
      link: "https://github.com/prisma/prisma/blob/main/LICENSE"
    },
    {
      name: "Neon",
      license: "Apache License 2.0",
      link: "https://github.com/neondatabase/neon/blob/main/LICENSE"
    },
    {
      name: "OpenAI",
      license: "MIT License",
      link: "https://github.com/openai/openai-js/blob/main/LICENSE"
    },
    {
      name: "Anthropic",
      license: "MIT License",
      link: "https://github.com/anthropics/anthropic-sdk-typescript/blob/main/LICENSE"
    }

    // Add other significant dependencies (check package.json and use tools like license-checker)
  ];

  return (
    <EnhancedLayout>
      <MetaTags ogImage="/og-image.png" title="Third-Party Services & Licenses - CAM/CAM FUN" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 bg-white dark:bg-gray-800 shadow rounded-lg">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-6">
          Third-Party Services & Licenses
        </h1>

        <p className="mb-8 text-gray-600 dark:text-gray-400">
          Our application utilizes various third-party services and open-source software to provide its functionality.
          Below is a list of these components and links to their respective terms and licenses. This list is provided
          for informational purposes and may be updated periodically.
        </p>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 border-b pb-2 border-gray-300 dark:border-gray-600">
            Service Providers
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            We rely on the following third-party service providers to operate our application. Your use of our service
            may also be subject to their terms and privacy policies.
          </p>
          <ul className="space-y-4">
            {serviceProviders.map(provider => (
              <li
                key={provider.name}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-850"
              >
                <h3 className="font-semibold text-gray-800 dark:text-gray-100">{provider.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 mb-2">{provider.purpose}</p>
                <a
                  href={provider.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View Privacy Policy / Terms
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 border-b pb-2 border-gray-300 dark:border-gray-600">
            Open-Source Software
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Our application incorporates open-source software components listed below. We are grateful to the developers
            and communities who create and maintain this software. Use of these components is subject to their
            respective licenses.
          </p>
          <ul className="space-y-3">
            {openSourcePackages.map(pkg => (
              <li key={pkg.name} className="text-sm">
                <span className="font-medium text-gray-800 dark:text-gray-100">{pkg.name}</span> -
                <span className="text-gray-600 dark:text-gray-300"> Licensed under the </span>
                <a
                  href={pkg.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {pkg.license}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
            This list may not be exhaustive and primarily includes major dependencies. For a complete list of
            dependencies and their licenses, you may inspect our applications source code or contact us.
          </p>
        </section>

        <div className="mt-12 border-t pt-6 border-gray-300 dark:border-gray-600">
          <p className="text-sm text-gray-500 dark:text-gray-400">Last Updated: 16/04/2025</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Please review this page periodically for updates. If you have any questions, please contact us at [Your
            Support Email Address].
          </p>
        </div>
      </div>
    </EnhancedLayout>
  );
};

export default ThirdPartyLicensesPage;
