'use strict';

import Stripe from 'stripe';
import { Request } from 'express';
import User from '../models/user.model';
import Subscription from '../models/subscription.model';
import dotenv from 'dotenv';
import { ExternalServiceError, ValidationError, NotFoundError, AppError } from '../utils/errors';

dotenv.config();

// Initialize Stripe with API key from environment variables
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2023-10-16'
});

// Define price IDs
const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_ID_MONTHLY as string,
  yearly: process.env.STRIPE_PRICE_ID_YEARLY as string
};

// Validate the price ID
const isValidPriceId = (priceId: string): boolean => {
  return Object.values(PRICE_IDS).includes(priceId);
};

export const stripeService = {
  /**
   * Create a checkout session for subscription
   */
  createCheckoutSession: async (priceId: string, userId: string, userEmail: string) => {
    try {
      if (!isValidPriceId(priceId)) {
        throw new ValidationError(`Invalid price ID: ${priceId}`);
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User');
      }

      let customerId = user.stripeCustomerId;

      if (customerId && customerId !== 'pending') {
        try {
          const existingCustomer = await stripe.customers.retrieve(customerId);
          if (existingCustomer.deleted) {
            customerId = null;
          }
        } catch (err: any) {
          if (err.code === 'resource_missing') {
            customerId = null;
          }
        }
      } else if (customerId === 'pending') {
        customerId = null;
      }

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userEmail,
          name: user.name
        });
        customerId = customer.id;

        user.stripeCustomerId = customerId;
        await user.save();
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1
          }
        ],
        mode: 'subscription',
        success_url: `${process.env.FRONTEND_URL}/dashboard/billing?success=true`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard/billing?canceled=true`,
        customer: customerId,
        customer_email: customerId ? undefined : userEmail,
        metadata: {
          userId
        }
      });

      return { sessionId: session.id };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError('Stripe', 'Failed to create checkout session', error);
    }
  },

  /**
   * Create a customer portal session
   */
  createPortalSession: async (userId: string) => {
    try {
      const user = await User.findById(userId);
      if (!user || !user.stripeCustomerId) {
        throw new ValidationError('User or Stripe customer ID not found');
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${process.env.FRONTEND_URL}/dashboard/billing`
      });

      return { url: session.url };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError('Stripe', 'Failed to create portal session', error);
    }
  },

  /**
   * Get user subscription details
   */
  getSubscription: async (userId: string) => {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User');
      }

      if (!user.subscriptionId) {
        return null;
      }

      let subscription = await Subscription.findById(user.subscriptionId);
      if (!subscription) {
        return null;
      }

      // If the local subscription is pending or incomplete, proactively check Stripe
      // This solves issues where webhooks might be delayed or not configured (e.g. localhost)
      if (subscription.status === 'incomplete' || 
          subscription.stripeSubscriptionId.startsWith('pending_')) {
        try {
          if (user.stripeCustomerId && user.stripeCustomerId !== 'pending') {
            const stripeSubs = await stripe.subscriptions.list({
              customer: user.stripeCustomerId,
              limit: 1,
              status: 'active'
            });

            if (stripeSubs.data.length > 0) {
              const stripeSub = stripeSubs.data[0];
              const priceId = stripeSub.items.data[0].price.id;
              const plan = priceId === PRICE_IDS.monthly ? 'monthly' : 'yearly';

              // Update the local subscription record with real Stripe data
              subscription.stripeSubscriptionId = stripeSub.id;
              subscription.status = stripeSub.status as any;
              subscription.stripePriceId = priceId;
              subscription.plan = plan;
              subscription.currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
              subscription.currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
              subscription.cancelAtPeriodEnd = stripeSub.cancel_at_period_end;
              await subscription.save();
              
            }
          }
        } catch (syncError) {
        }
      }

      let paymentMethod = null;
      try {
        if (subscription.stripeSubscriptionId && 
            subscription.stripeSubscriptionId !== 'pending' && 
            !subscription.stripeSubscriptionId.startsWith('pending_')) {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
          if (stripeSubscription.default_payment_method) {
            const paymentMethodId = typeof stripeSubscription.default_payment_method === 'string'
              ? stripeSubscription.default_payment_method
              : stripeSubscription.default_payment_method.id;

            const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
            if (pm.type === 'card' && pm.card) {
              paymentMethod = {
                type: 'card',
                last4: pm.card.last4,
                expiryMonth: pm.card.exp_month,
                expiryYear: pm.card.exp_year,
                brand: pm.card.brand
              };
            }
          }
        }
      } catch (error) {
      }

      return {
        id: subscription._id,
        plan: subscription.plan === 'monthly' ? 'Pro Monthly' : 'Pro Yearly',
        status: subscription.status,
        startDate: subscription.createdAt,
        nextBillingDate: subscription.currentPeriodEnd,
        paymentMethod: paymentMethod || {
          type: 'card',
          last4: '****',
          expiryMonth: 0,
          expiryYear: 0,
          brand: 'unknown'
        }
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError('Stripe', 'Failed to fetch subscription', error);
    }
  },

  /**
   * Cancel an existing subscription
   */
  cancelSubscription: async (userId: string) => {
    try {
      const user = await User.findById(userId);
      if (!user || !user.subscriptionId) {
        throw new ValidationError('User or subscription not found');
      }

      const subscription = await Subscription.findById(user.subscriptionId);
      if (!subscription || 
          subscription.stripeSubscriptionId === 'pending' || 
          subscription.stripeSubscriptionId.startsWith('pending_')) {
        throw new ValidationError('Subscription is not yet active and cannot be canceled');
      }

      await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true
        }
      );

      subscription.cancelAtPeriodEnd = true;
      await subscription.save();

      return {
        id: subscription._id,
        status: 'canceled',
        canceledAt: new Date(),
        effectiveUntil: subscription.currentPeriodEnd
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError('Stripe', 'Failed to cancel subscription', error);
    }
  },

  /**
   * Handle incoming Stripe webhooks
   */
  handleWebhook: async (req: Request) => {
    const sig = req.headers['stripe-signature']!;

    try {

      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
      }

      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );


      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          await handleCheckoutSessionCompleted(session);
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionUpdated(subscription);
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionDeleted(subscription);
          break;
        }

        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoicePaid(invoice);
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          await handleInvoicePaymentFailed(invoice);
          break;
        }

        default:
      }

      return { received: true };
    } catch (error) {
      throw new ExternalServiceError('Stripe Webhook', 'Webhook processing failed', error);
    }
  },

  /**
   * Get user invoices
   */
  getInvoices: async (userId: string) => {
    try {
      const user = await User.findById(userId);
      if (!user || !user.stripeCustomerId) {
        return [];
      }

      const invoices = await stripe.invoices.list({
        customer: user.stripeCustomerId,
        limit: 100,
      });

      return invoices.data.map(invoice => ({
        id: invoice.number || invoice.id,
        date: new Date(invoice.created * 1000),
        amount: invoice.amount_paid / 100,
        status: invoice.status,
        downloadUrl: invoice.invoice_pdf
      }));
    } catch (error) {
      throw new ExternalServiceError('Stripe', 'Failed to fetch invoices', error);
    }
  }
};

/**
 * Helper: Handle checkout session completion
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;

  if (!userId || !session.subscription || !session.customer) {
    return;
  }

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;

  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = stripeSubscription.items.data[0].price.id;
    const plan = priceId === PRICE_IDS.monthly ? 'monthly' : 'yearly';

    let subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });

    if (!subscription) {
      subscription = new Subscription({
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        status: stripeSubscription.status,
        plan,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end
      });
      await subscription.save();
    }

    await User.findByIdAndUpdate(userId, {
      stripeCustomerId: customerId,
      subscriptionId: subscription._id
    });

  } catch (error) {
  }
}

/**
 * Helper: Handle subscription update/creation
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  try {
    const existingSubscription = await Subscription.findOne({
      stripeSubscriptionId: subscription.id
    });

    if (!existingSubscription) {
      return;
    }

    existingSubscription.status = subscription.status;
    existingSubscription.currentPeriodStart = new Date(subscription.current_period_start * 1000);
    existingSubscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    existingSubscription.cancelAtPeriodEnd = subscription.cancel_at_period_end;

    if (subscription.items.data.length > 0) {
      existingSubscription.stripePriceId = subscription.items.data[0].price.id;

      if (existingSubscription.stripePriceId === PRICE_IDS.monthly) {
        existingSubscription.plan = 'monthly';
      } else if (existingSubscription.stripePriceId === PRICE_IDS.yearly) {
        existingSubscription.plan = 'yearly';
      }
    }

    await existingSubscription.save();
  } catch (error) {
  }
}

/**
 * Helper: Handle subscription deletion
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  try {
    const existingSubscription = await Subscription.findOne({
      stripeSubscriptionId: subscription.id
    });

    if (!existingSubscription) {
      return;
    }

    existingSubscription.status = 'canceled';
    await existingSubscription.save();

    await User.findByIdAndUpdate(existingSubscription.userId, {
      $unset: { subscriptionId: 1 }
    });

  } catch (error) {
  }
}

/**
 * Helper: Handle successful invoice payment
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  try {
    if (!invoice.subscription) return;

    const subscriptionId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription.id;

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId
    });

    if (subscription && subscription.status !== 'active') {
      subscription.status = 'active';
      await subscription.save();
    }
  } catch (error) {
  }
}

/**
 * Helper: Handle failed invoice payment
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  try {
    if (!invoice.subscription) return;

    const subscriptionId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription.id;

    const subscription = await Subscription.findOne({
      stripeSubscriptionId: subscriptionId
    });

    if (subscription) {
      subscription.status = 'past_due';
      await subscription.save();
    }
  } catch (error) {
  }
}

export default stripe;