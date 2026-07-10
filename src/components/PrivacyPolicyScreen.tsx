"use client";

import Link from "next/link";
import { ArrowLeft, Shield, Lock, Eye, Database, Bell, Trash2, Mail, Phone } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { BuyerHeader } from "@/components/buyer/BuyerHeader";
import { Card, CardBody } from "@/components/ui/Card";

export function PrivacyPolicyScreen() {
  return (
    <AppShell header={<BuyerHeader />}>
      <div className="flex flex-col gap-3 p-4">
        <Link href="/" className="flex w-fit items-center gap-1 text-xs font-semibold text-fg-subtle hover:text-fg-muted">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to shop
        </Link>

        <div className="mb-2">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-brand-500" />
            <h1 className="text-xl font-extrabold text-fg">Privacy Policy</h1>
          </div>
          <p className="mt-1 text-xs text-fg-subtle">Green Basket B2B Wholesale Platform</p>
          <p className="text-xs text-fg-subtle">Last updated: July 3, 2026</p>
        </div>

        <Card>
          <CardBody className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <div>
                <h2 className="text-sm font-bold text-fg">Information We Collect</h2>
                <p className="mt-1 text-xs text-fg-muted leading-relaxed">
                  We collect business name, contact person name, email address, phone number, delivery address,
                  GSTIN (if provided), and order history. This information is necessary to process your orders
                  and ensure timely delivery of fresh produce to your business.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <div>
                <h2 className="text-sm font-bold text-fg">How We Use Your Information</h2>
                <ul className="mt-1 space-y-1.5 text-xs text-fg-muted leading-relaxed">
                  <li>&bull; Process and deliver your orders</li>
                  <li>&bull; Send order status updates via email and SMS</li>
                  <li>&bull; Verify your business identity</li>
                  <li>&bull; Generate GST-compliant invoices</li>
                  <li>&bull; Improve our product quality and service</li>
                  <li>&bull; Comply with applicable laws and regulations</li>
                </ul>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <div>
                <h2 className="text-sm font-bold text-fg">Data Storage & Security</h2>
                <p className="mt-1 text-xs text-fg-muted leading-relaxed">
                  Your data is stored on Firebase (Google Cloud Platform) servers located in secure data centers.
                  All data transmission is encrypted using SSL/TLS. We implement industry-standard security measures
                  to protect your personal and business information from unauthorized access.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <div>
                <h2 className="text-sm font-bold text-fg">Communications</h2>
                <p className="mt-1 text-xs text-fg-muted leading-relaxed">
                  We send transactional messages: order confirmations, delivery updates, payment receipts,
                  and return status notifications. You can opt out of non-essential communications at any time
                  by contacting our support team. Essential order-related communications cannot be disabled.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <div>
                <h2 className="text-sm font-bold text-fg">Data Retention & Deletion</h2>
                <p className="mt-1 text-xs text-fg-muted leading-relaxed">
                  We retain your data for as long as your account is active or as needed to provide services.
                  Order and invoice data is retained for 7 years as required by Indian tax laws.
                  You can request account deletion at any time by contacting us. Upon deletion,
                  your personal data will be removed within 30 days, except where retention is legally required.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <div>
                <h2 className="text-sm font-bold text-fg">Your Rights</h2>
                <ul className="mt-1 space-y-1.5 text-xs text-fg-muted leading-relaxed">
                  <li>&bull; Right to access your personal data</li>
                  <li>&bull; Right to correct inaccurate information</li>
                  <li>&bull; Right to delete your account and data</li>
                  <li>&bull; Right to object to data processing</li>
                  <li>&bull; Right to data portability</li>
                </ul>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <div>
                <h2 className="text-sm font-bold text-fg">Contact Us</h2>
                <p className="mt-1 text-xs text-fg-muted leading-relaxed">
                  For privacy-related queries, data access requests, or account deletion requests, contact us:
                </p>
                <div className="mt-2 space-y-1 text-xs text-fg">
                  <p>Email: privacy@green-basket.in</p>
                  <p>Phone: +91-98765-43210</p>
                  <p>Address: Green Basket HQ, Bengaluru, Karnataka 560001</p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <p className="pb-4 text-center text-xs text-fg-subtle">
          By using Green Basket, you agree to this Privacy Policy. We may update this policy from time to time.
        </p>
      </div>
    </AppShell>
  );
}
