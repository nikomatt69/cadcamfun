// src/pages/privacy.tsx

import Head from 'next/head';
import Link from 'next/link';
import { DynamicLayout } from 'src/components/dynamic-imports';
import MetaTags from '../components/layout/Metatags';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function PrivacyPage() {


  const { data: session, status } = useSession();
  const router = useRouter(); 
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  return (
    <>
       <MetaTags 
        title="PRIVACY FUN" 
     
      />
      <DynamicLayout>
        <div className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-6">Privacy Policy</h1>
            
            <div className="prose prose-blue max-w-none">
              <p>Last updated: February 26, 2025</p>
              
              <h2>1. Introduction</h2>
              <p>
                This Privacy Policy describes how the CAD/CAM FUN (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) collects, uses, and discloses your personal information when you use our platform.
              </p>
              
              <h2>2. Information We Collect</h2>
              <p>We collect several types of information from and about users of our platform, including:</p>
              <ul>
                <li>Personal information, such as your name, email address, and other identifying information you provide when registering or using our services.</li>
                <li>Information about your use of our platform, including your designs, projects, and usage patterns.</li>
                <li>Technical information, such as your IP address, browser type, operating system, and other usage details.</li>
              </ul>
              
              <h2>3. How We Use Your Information</h2>
              <p>We use information that we collect about you or that you provide to us:</p>
              <ul>
                <li>To provide and improve our platform.</li>
                <li>To process and complete transactions, and send you related information.</li>
                <li>To communicate with you about products, services, offers, promotions, and events we believe may be of interest to you.</li>
                <li>To respond to your comments, questions, and requests.</li>
                <li>To provide customer service and technical support.</li>
                <li>To monitor and analyze trends, usage, and activities in connection with our platform.</li>
              </ul>
              
              <h2>4. Sharing Your Information</h2>
              <p>
                We may share your personal information with:
              </p>
              <ul>
                <li>Service providers who perform services on our behalf.</li>
                <li>Other users you choose to collaborate with on our platform.</li>
                <li>In response to a request for information if we believe disclosure is in accordance with, or required by, any applicable law or legal process.</li>
                <li>If we believe your actions are inconsistent with our user agreements or policies, or to protect the rights, property, and safety of us or others.</li>
              </ul>
              
              <h2>5. Data Security</h2>
              <p>
                We have implemented measures designed to secure your personal information from accidental loss and from unauthorized access, use, alteration, and disclosure. However, no method of transmission over the Internet or method of electronic storage is 100% secure.
              </p>
              
              <h2>6. Your Rights</h2>
              <p>
                Depending on your location, you may have certain rights regarding your personal information, such as the right to:
              </p>
              <ul>
                <li>Access and receive a copy of your personal information.</li>
                <li>Rectify inaccurate personal information.</li>
                <li>Request deletion of your personal information.</li>
                <li>Restrict or object to the processing of your personal information.</li>
                <li>Data portability (receiving a copy of your personal information in a structured, commonly used format).</li>
              </ul>
              
              <h2>7. Changes to Our Privacy Policy</h2>
              <p>
                We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
              </p>
              
              <h2>8. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy, please contact us at:
              </p>
              <p>
                <a href="mailto:privacy@cadcamsystem.com">privacy@cadcamsystem.com</a>
              </p>
            </div>
            
            <div className="mt-8 flex justify-center">
              <Link href="/terms" className="text-blue-600 hover:text-blue-800">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </DynamicLayout>
    </>
  );
}