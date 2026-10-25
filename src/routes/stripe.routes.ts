import express from 'express';
import { stripeService } from '../services/stripe.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { AuthRequest } from '../types';
import { Types } from 'mongoose';

const router = express.Router();

// Create a checkout session
router.post('/create-checkout-session', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { priceId } = req.body;
    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!priceId || !userId || !userEmail) {
      return res.status(400).json({
        message: 'Missing required fields: priceId, userId, or userEmail'
      });
    }

    const session = await stripeService.createCheckoutSession(priceId, userId, userEmail);

    // Temporary solution: Create a "PENDING" subscription in the database
    // This will be visible until the webhook updates it with the actual data
    try {
      const User = (await import('../models/user.model')).default;
      const Subscription = (await import('../models/subscription.model')).default;

      const user = await User.findById(userId);
      if (user) {
        // Check if user already has a subscription
        if (!user.subscriptionId) {
          // Determine plan type
          const plan = priceId === process.env.STRIPE_PRICE_ID_MONTHLY ? 'monthly' : 'yearly';

          const uniquePendingId = `pending_${new Types.ObjectId().toString()}`;

          // Create temporary subscription record
          const subscription = new Subscription({
            userId,
            stripeCustomerId: user.stripeCustomerId || 'pending',
            stripeSubscriptionId: uniquePendingId,
            stripePriceId: priceId,
            status: 'incomplete',
            plan,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + (plan === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000)
          });

          await subscription.save();

          // Update user with subscription reference
          user.subscriptionId = subscription._id as unknown as Types.ObjectId;
          if (!user.stripeCustomerId) {
            user.stripeCustomerId = 'pending';
          }
          await user.save();

        }
      }
    } catch (error) {
      // Don't block the checkout process if this fails
    }

    res.json(session);
  } catch (error: any) {
    res.status(500).json({
      message: error.message || 'Error creating checkout session'
    });
  }
});

// Create a portal session
router.post('/create-portal-session', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const session = await stripeService.createPortalSession(userId);
    res.json(session);
  } catch (error: any) {
    res.status(500).json({
      message: error.message || 'Error creating portal session'
    });
  }
});

// Get subscription details
router.get('/subscription', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const subscription = await stripeService.getSubscription(userId);

    if (!subscription) {
      // Instead of returning 404, return a default empty subscription
      return res.json({
        subscription: {
          plan: 'Free',
          status: 'inactive',
          startDate: new Date(),
          nextBillingDate: null
        }
      });
    }

    res.json({ subscription });
  } catch (error: any) {
    res.status(500).json({
      message: error.message || 'Error fetching subscription'
    });
  }
});

// Get invoice history
router.get('/invoices', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const invoices = await stripeService.getInvoices(userId);
    res.json({ invoices });
  } catch (error: any) {
    res.status(500).json({
      message: error.message || 'Error fetching invoices'
    });
  }
});

// Cancel subscription
router.post('/cancel-subscription', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const canceledSubscription = await stripeService.cancelSubscription(userId);
    res.json({ subscription: canceledSubscription });
  } catch (error: any) {
    res.status(500).json({
      message: error.message || 'Error canceling subscription'
    });
  }
});

// Webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const result = await stripeService.handleWebhook(req);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({
      message: error.message || 'Error handling webhook'
    });
  }
});

export default router; 