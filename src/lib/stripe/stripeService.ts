import Stripe from "stripe";
import stripe, {
  executeStripeOperation,
  logStripeEvent,
} from "../stripe-server";
import { prisma } from "../prisma";
import { SUBSCRIPTION_PLANS } from "../stripe";

export interface CreateSubscriptionParams {
  userId: string;
  priceId: string;
  paymentMethodId?: string;
  customerId?: string;
  trialPeriodDays?: number;
  automaticTax?: boolean;
  collectionMethod?: "charge_automatically" | "send_invoice";
  metadata?: Record<string, string>;
  customerType?: "individual" | "company";
  taxId?: string;
}

export interface CreateCheckoutSessionParams {
  userId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  mode?: "subscription" | "payment";
  allowPromotionCodes?: boolean;
  automaticTax?: boolean;
  billingAddressCollection?: "auto" | "required";
  customerEmail?: string;
  trialPeriodDays?: number;
  metadata?: Record<string, string>;
  customerType?: "individual" | "company";
}

export interface SubscriptionUpdateParams {
  subscriptionId: string;
  priceId?: string;
  quantity?: number;
  prorationBehavior?: "create_prorations" | "none" | "always_invoice";
  metadata?: Record<string, string>;
}

export interface CreateCustomerParams {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
  customerType?: "individual" | "company";
  taxId?: string;
  billingAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code: string;
    country: string;
  };
}

export class EnterpriseStripeService {
  /**
   * Create a new customer in Stripe with Enterprise-grade support
   */
  async createCustomer(params: CreateCustomerParams): Promise<Stripe.Customer> {
    // B2B vs B2C determination
    const isBusinessCustomer = params.customerType === "company";

    const customerData: Stripe.CustomerCreateParams = {
      email: params.email,
      name: params.name,
      metadata: {
        userId: params.metadata?.userId || "",
        environment: process.env.NODE_ENV || "development",
        customerType: params.customerType || "individual",
        source: "cadcamfun-app",
        ...params.metadata,
      },
    };

    // Add tax ID for business customers
    if (isBusinessCustomer && params.taxId) {
      customerData.tax_id_data = [
        {
          type: this.determineTaxIdType(params.taxId),
          value: params.taxId,
        },
      ];
    }

    // Add billing address if provided
    if (params.billingAddress) {
      customerData.address = {
        line1: params.billingAddress.line1,
        line2: params.billingAddress.line2,
        city: params.billingAddress.city,
        state: params.billingAddress.state,
        postal_code: params.billingAddress.postal_code,
        country: params.billingAddress.country,
      };
    }

    try {
      return await executeStripeOperation(
        () => stripe.customers.create(customerData),
        "create_customer"
      );
    } catch (error) {
      logStripeEvent(
        "customer_create_failed",
        {
          email: params.email,
          error: (error as Error).message,
        },
        "error"
      );
      throw error;
    }
  }

  /**
   * Create a subscription with advanced options and improved error handling
   */
  async createSubscription(
    params: CreateSubscriptionParams
  ): Promise<Stripe.Subscription> {
    // Transaction tracking ID for idempotency
    const idempotencyKey = `sub_create_${params.userId}_${params.priceId}_${Date.now()}`;

    // Get or create customer with B2B/B2C support
    let customerId = params.customerId;
    if (!customerId) {
      const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { email: true, name: true },
      });

      if (!user) {
        logStripeEvent(
          "subscription_create_failed",
          {
            userId: params.userId,
            reason: "User not found",
          },
          "error"
        );
        throw new Error("User not found");
      }

      const customer = await this.createCustomer({
        email: user.email!,
        name: user.name || undefined,
        metadata: { userId: params.userId },
        customerType: params.customerType,
        taxId: params.taxId,
      });

      customerId = customer.id;

      logStripeEvent("customer_created_for_subscription", {
        customerId: customer.id,
        userId: params.userId,
      });
    }

    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: params.priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_options: {
          card: {
            request_three_d_secure: "automatic",
          },
        },
      },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        userId: params.userId,
        environment: process.env.NODE_ENV || "development",
        customerType: params.customerType || "individual",
        creationMethod: "api",
        ...params.metadata,
      },
    };

    // Add trial period if specified
    if (params.trialPeriodDays) {
      subscriptionParams.trial_period_days = params.trialPeriodDays;
    }

    // Add payment method if provided
    if (params.paymentMethodId) {
      subscriptionParams.default_payment_method = params.paymentMethodId;
    }

    // Add automatic tax if enabled
    if (params.automaticTax) {
      subscriptionParams.automatic_tax = { enabled: true };
    }

    // Set collection method
    if (params.collectionMethod) {
      subscriptionParams.collection_method = params.collectionMethod;

      // For invoiced subscriptions, set reasonable default
      if (params.collectionMethod === "send_invoice") {
        subscriptionParams.days_until_due = 30;
      }
    }

    try {
      const subscription = await executeStripeOperation(
        () =>
          stripe.subscriptions.create(subscriptionParams, {
            idempotencyKey,
          }),
        "create_subscription"
      );

      // Create or update DB record
      await prisma.subscription.upsert({
        where: { id: params.userId },
        update: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          stripePriceId: params.priceId,
          plan: params.priceId,
          status: subscription.status,
          stripeCurrentPeriodStart: new Date(
            subscription.current_period_start * 1000
          ),
          stripeCurrentPeriodEnd: new Date(
            subscription.current_period_end * 1000
          ),
          trialEndsAt: subscription.trial_end
            ? new Date(subscription.trial_end * 1000)
            : null,
        },
        create: {
          id: params.userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          stripePriceId: params.priceId,
          plan: params.priceId,
          status: subscription.status,
          stripeCurrentPeriodStart: new Date(
            subscription.current_period_start * 1000
          ),
          stripeCurrentPeriodEnd: new Date(
            subscription.current_period_end * 1000
          ),
          trialEndsAt: subscription.trial_end
            ? new Date(subscription.trial_end * 1000)
            : null,
          user: { connect: { id: params.userId } },
        },
      });

      return subscription;
    } catch (error) {
      logStripeEvent(
        "subscription_create_failed",
        {
          userId: params.userId,
          priceId: params.priceId,
          customerId,
          error: (error as Error).message,
        },
        "error"
      );
      throw error;
    }
  }

  /**
   * Create a checkout session with enterprise features
   */
  async createCheckoutSession(
    params: CreateCheckoutSessionParams
  ): Promise<Stripe.Checkout.Session> {
    const idempotencyKey = `checkout_${params.userId}_${params.priceId}_${Date.now()}`;

    // B2B vs B2C determination
    const isBusinessCustomer = params.customerType === "company";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      client_reference_id: params.userId,
      payment_method_types: ["card"],
      mode: params.mode || "subscription",
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        userId: params.userId,
        environment: process.env.NODE_ENV || "development",
        customerType: params.customerType || "individual",
        ...params.metadata,
      },
      subscription_data:
        params.mode === "subscription"
          ? {
            metadata: {
              userId: params.userId,
              customerType: params.customerType || "individual",
              ...params.metadata,
            },
            trial_period_days: params.trialPeriodDays,
          }
          : undefined,
    };

    // Add customer email if provided
    if (params.customerEmail) {
      sessionParams.customer_email = params.customerEmail;
    }

    // Enable promotion codes
    if (params.allowPromotionCodes) {
      sessionParams.allow_promotion_codes = true;
    }

    // Enable automatic tax
    if (params.automaticTax) {
      sessionParams.automatic_tax = { enabled: true };
    }

    // Set billing address collection
    if (params.billingAddressCollection) {
      sessionParams.billing_address_collection =
        params.billingAddressCollection;
    } else {
      // Always require billing address for enterprise customers
      sessionParams.billing_address_collection = "required";
    }

    // Add consent collection for terms of service
    sessionParams.consent_collection = {
      terms_of_service: "required",
    };

    // Add tax ID collection for business customers
    if (isBusinessCustomer) {
      sessionParams.tax_id_collection = { enabled: true };
    }

    // Add custom fields for enterprise use
    sessionParams.custom_fields = [
      {
        key: "company_size",
        label: { type: "custom", custom: "Company Size" },
        type: "dropdown",
        dropdown: {
          options: [
            { label: "1-10 employees", value: "small" },
            { label: "11-50 employees", value: "medium" },
            { label: "51-200 employees", value: "large" },
            { label: "200+ employees", value: "enterprise" },
          ],
        },
        optional: !isBusinessCustomer, // Required for business customers
      },
    ];

    try {
      return await executeStripeOperation(
        () =>
          stripe.checkout.sessions.create(sessionParams, {
            idempotencyKey,
          }),
        "create_checkout_session"
      );
    } catch (error) {
      logStripeEvent(
        "checkout_session_create_failed",
        {
          userId: params.userId,
          priceId: params.priceId,
          error: (error as Error).message,
        },
        "error"
      );
      throw error;
    }
  }

  // Helper method to determine tax ID type
  private determineTaxIdType(taxId: string): Stripe.TaxIdCreateParams.Type {
    // Basic pattern recognition - could be expanded
    if (/^[A-Z]{2}[0-9]{9}$/.test(taxId)) {
      return "eu_vat"; // EU VAT format
    } else if (/^[0-9]{9}$/.test(taxId)) {
      return "us_ein"; // US EIN
    } else if (/^GB[0-9]{9}$/.test(taxId) || /^GB[0-9]{12}$/.test(taxId)) {
      return "gb_vat"; // UK VAT
    } else if (/^[0-9]{11}$/.test(taxId)) {
      return "br_cnpj"; // Brazilian CNPJ
    } else if (/^[0-9]{15}$/.test(taxId)) {
      return "in_gst"; // Indian GST
    } else {
      // Default to au_abn as safer default that accepts various formats
      return "au_abn";
    }
  }

  /**
   * Update a subscription
   */
  async updateSubscription(
    params: SubscriptionUpdateParams
  ): Promise<Stripe.Subscription> {
    const updateParams: Stripe.SubscriptionUpdateParams = {
      proration_behavior: params.prorationBehavior || "create_prorations",
      metadata: params.metadata,
    };

    // Update price if provided
    if (params.priceId) {
      const subscription = await stripe.subscriptions.retrieve(
        params.subscriptionId
      );
      updateParams.items = [
        {
          id: subscription.items.data[0].id,
          price: params.priceId,
          quantity: params.quantity || 1,
        },
      ];
    }

    return executeStripeOperation(
      () => stripe.subscriptions.update(params.subscriptionId, updateParams),
      "update_subscription"
    );
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean = true,
    cancellationDetails?: string
  ): Promise<Stripe.Subscription> {
    const updateParams: Stripe.SubscriptionUpdateParams = {
      cancel_at_period_end: cancelAtPeriodEnd,
      metadata: {
        cancellation_reason: cancellationDetails || "user_requested",
        cancelled_at: new Date().toISOString(),
      },
    };

    if (!cancelAtPeriodEnd) {
      // Immediate cancellation
      return executeStripeOperation(
        () =>
          stripe.subscriptions.cancel(subscriptionId, {
            invoice_now: true,
            prorate: true,
          }),
        "cancel_subscription_immediately"
      );
    }

    return executeStripeOperation(
      () => stripe.subscriptions.update(subscriptionId, updateParams),
      "cancel_subscription_at_period_end"
    );
  }

  /**
   * Create a billing portal session
   */
  async createBillingPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<Stripe.BillingPortal.Session> {
    return executeStripeOperation(
      () =>
        stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: returnUrl,
        }),
      "create_billing_portal_session"
    );
  }

  /**
   * Get subscription details with usage data
   */
  async getSubscriptionDetails(subscriptionId: string): Promise<{
    subscription: Stripe.Subscription;
    usage?: Stripe.UsageRecord[];
    upcomingInvoice?: Stripe.Invoice;
  }> {
    const subscription = await executeStripeOperation(
      () =>
        stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["latest_invoice", "customer", "default_payment_method"],
        }),
      "get_subscription_details"
    );

    // Get upcoming invoice for preview
    const upcomingInvoice = await executeStripeOperation(
      () =>
        stripe.invoices.retrieveUpcoming({
          subscription: subscriptionId,
        }),
      "get_upcoming_invoice"
    ).catch(() => null); // Don't fail if no upcoming invoice

    return {
      subscription,
      upcomingInvoice: upcomingInvoice as unknown as Stripe.Invoice | undefined,
    };
  }

  /**
   * Handle failed payments
   */
  async handleFailedPayment(invoiceId: string): Promise<void> {
    const invoice = await stripe.invoices.retrieve(invoiceId);

    logStripeEvent(
      "payment_failed",
      {
        invoiceId,
        customerId: invoice.customer,
        amount: invoice.amount_due,
        currency: invoice.currency,
      },
      "warn"
    );

    // Update subscription status in database
    if (invoice.subscription) {
      await this.updateSubscriptionInDatabase(
        invoice.subscription as string,
        "past_due"
      );
    }
  }

  /**
   * Update subscription in database
   */
  private async updateSubscriptionInDatabase(
    stripeSubscriptionId: string,
    status: string
  ): Promise<void> {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId },
      data: { status },
    });
  }

  /**
   * Get subscription metrics for analytics
   */
  async getSubscriptionMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRevenue: number;
    newSubscriptions: number;
    cancelledSubscriptions: number;
    activeSubscriptions: number;
  }> {
    // This would typically use Stripe's reporting API or your own analytics
    const metrics = {
      totalRevenue: 0,
      newSubscriptions: 0,
      cancelledSubscriptions: 0,
      activeSubscriptions: 0,
    };

    // Implementation would query Stripe's reporting API
    logStripeEvent("metrics_requested", {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    return metrics;
  }
}

// Singleton instance
export const stripeService = new EnterpriseStripeService();
