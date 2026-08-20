const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { body, validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// STEP 1: Order create karo (settlement start karte waqt)
router.post(
  '/create-order',
  authMiddleware,
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
    body('toUserId').isMongoId().withMessage('Invalid recipient'),
    body('groupId').isMongoId().withMessage('Invalid group'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { amount, toUserId, groupId } = req.body;

      // Razorpay paise "paise" (smallest unit) me leta hai, isliye *100
      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: 'INR',
        receipt: `settlement_${Date.now()}`,
      });

      const payment = await Payment.create({
        group: groupId,
        from: req.userId,
        to: toUserId,
        amount,
        razorpayOrderId: order.id,
        status: 'pending',
      });

      res.status(201).json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        paymentId: payment._id,
        key: process.env.RAZORPAY_KEY_ID, // frontend ko chahiye checkout ke liye
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Could not create payment order' });
    }
  }
);

// STEP 2: Payment verify karo (ye SABSE ZAROORI security step hai)
router.post(
  '/verify',
  authMiddleware,
  [
    body('razorpay_order_id').notEmpty(),
    body('razorpay_payment_id').notEmpty(),
    body('razorpay_signature').notEmpty(),
    body('paymentId').isMongoId(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = req.body;

      // Ye asli security check hai: hum khud ek signature generate karte hain
      // apni secret key se, aur usse Razorpay ke bheje signature se compare karte hain.
      // Sirf tabhi match hoga jab payment genuinely Razorpay ne process ki ho.
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({ message: 'Payment verification failed' });
      }

      // Signature match hua — genuinely payment successful hui
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        return res.status(404).json({ message: 'Payment record not found' });
      }

      payment.razorpayPaymentId = razorpay_payment_id;
      payment.status = 'paid';
      await payment.save();

      res.status(200).json({ message: 'Payment verified successfully', payment });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Verification error' });
    }
  }
);

// Group ke saare payments dekho
router.get('/group/:groupId', authMiddleware, async (req, res) => {
  try {
    const payments = await Payment.find({ group: req.params.groupId, status: 'paid' })
      .populate('from', 'name')
      .populate('to', 'name');
    res.status(200).json(payments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;