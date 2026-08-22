const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const sendOTPEmail = require('../utils/sendEmail');

const router = express.Router();

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: 'Too many OTP requests, please try again later',
});

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// SIGNUP — creates unverified user, sends OTP
router.post(
  '/signup',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('phone').optional().isMobilePhone().withMessage('Valid phone number required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, email, phone, password } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const otp = generateOTP();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      const user = await User.create({
        name,
        email,
        phone: phone || undefined,
        password: hashedPassword,
        isVerified: false,
        otp,
        otpExpiry,
      });

      try {
        await sendOTPEmail(email, otp);
      } catch (emailErr) {
        console.error('⚠️ Failed to send OTP email via Nodemailer:', emailErr.message);
        console.log(`🔑 [DEV FALLBACK] Generated OTP for ${email}: ${otp}`);
      }

      res.status(201).json({ message: 'OTP sent to your email', userId: user._id, email: user.email });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// VERIFY OTP
router.post(
  '/verify-otp',
  [
    body('email').isEmail().normalizeEmail(),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, otp } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (user.isVerified) {
        return res.status(400).json({ message: 'User already verified' });
      }

      if (!user.otp || user.otp !== otp) {
        return res.status(400).json({ message: 'Invalid OTP' });
      }

      if (user.otpExpiry < new Date()) {
        return res.status(400).json({ message: 'OTP expired, please request a new one' });
      }

      user.isVerified = true;
      user.otp = undefined;
      user.otpExpiry = undefined;
      await user.save();

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

      res.status(200).json({ 
        message: 'Email verified successfully',
        token,
        user: { id: user._id, name: user.name, email: user.email }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// RESEND OTP
router.post(
  '/resend-otp',
  otpLimiter,
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email } = req.body;
      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ message: 'User not found' });
      if (user.isVerified) return res.status(400).json({ message: 'User already verified' });

      const otp = generateOTP();
      user.otp = otp;
      user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      try {
        await sendOTPEmail(email, otp);
      } catch (emailErr) {
        console.error('⚠️ Failed to send OTP email via Nodemailer:', emailErr.message);
        console.log(`🔑 [DEV FALLBACK] Generated OTP for ${email}: ${otp}`);
      }

      res.status(200).json({ message: 'OTP resent' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// LOGIN — blocks unverified users
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      if (!user.isVerified) {
        return res.status(403).json({ message: 'Please verify your email first', needsVerification: true, email: user.email });
      }

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

      res.status(200).json({ token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

router.get('/me', authMiddleware, async (req, res) => {
  res.json({ message: 'You are authenticated!', userId: req.userId });
});

module.exports = router;