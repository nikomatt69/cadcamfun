// src/pages/terms.tsx

import Head from 'next/head';
import Link from 'next/link';
import { DynamicLayout } from 'src/components/dynamic-imports';
import MetaTags from '../components/layout/Metatags';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function TermsPage() {
  const { data: session, status } = useSession();
  const router = useRouter(); 
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  } 
  return (
    <>
       <MetaTags 
        title="CAM/CAM FUN TERMS" 
     
      />
      <DynamicLayout>
        <div className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-6">Terms of Service</h1>
            
            <div className="prose prose-blue max-w-none">
              <p>Last updated: February 26, 2025</p>
              
              <h2>1. Introduzione</h2>
              <p>
                Benvenuti nel sistema CAD/CAM (&quot;noi,&quot; &quot;nostro,&quot; o &quot;ci&quot;). Utilizzando la nostra piattaforma, accetti di essere vincolato da questi Termini di Servizio (&quot;Termini&quot;).
              </p>
              
              <h2>2. Uso del Servizio</h2>
              <p>
                You may use our service only for lawful purposes and in accordance with these Terms. You agree not to use our service:
              </p>
              <ul>
                <li>In any way that violates any applicable federal, state, local, or international law or regulation.</li>
                <li>To transmit, or procure the sending of, any advertising or promotional material, including any &quot;junk mail,&quot; &quot;chain letter,&quot; &quot;spam,&quot; or any other similar solicitation.</li>
                <li>To impersonate or attempt to impersonate the Company, a Company employee, another user, or any other person or entity.</li>
                <li>To engage in any other conduct that restricts or inhibits anyone&apos;s use or enjoyment of the Service, or which, as determined by us, may harm the Company or users of the Service, or expose them to liability.</li>
              </ul>
              
              <h2>3. Intellectual Property</h2>
              <p>
                The Service and its original content, features, and functionality are and will remain the exclusive property of our company and its licensors. The Service is protected by copyright, trademark, and other laws of both the United States and foreign countries.
              </p>
              
              <h2>4. User Accounts</h2>
              <p>
                When you create an account with us, you guarantee that the information you provide is accurate, complete, and current at all times. Inaccurate, incomplete, or obsolete information may result in the immediate termination of your account.
              </p>
              <p>
                You are responsible for maintaining the confidentiality of your account and password, including but not limited to the restriction of access to your computer and/or account. You agree to accept responsibility for any and all activities or actions that occur under your account and/or password.
              </p>
              
              <h2>5. Termination</h2>
              <p>
                We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever and without limitation, including but not limited to a breach of the Terms.
              </p>
              
              <h2>6. Limitation of Liability</h2>
              <p>
                In no event shall we, nor our directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
              </p>
              
              <h2>7. Changes</h2>
              <p>
                We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
              </p>
              
              <h2>8. Contact Us</h2>
              <p>
                If you have any questions about these Terms, please contact us at:
              </p>
              <p>
                <a href="mailto:support@cadcamsystem.com">support@cadcamsystem.com</a>
              </p>
            </div>
            
            <div className="mt-8 flex justify-center">
              <Link href="/privacy" className="text-blue-600 hover:text-blue-800">
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </DynamicLayout>
    </>
  );
}