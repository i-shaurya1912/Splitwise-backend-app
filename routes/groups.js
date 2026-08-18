const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Group = require('../models/Group');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// CREATE a new group
router.post(
  '/',
  authMiddleware,
  [body('name').trim().notEmpty().withMessage('Group name is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name } = req.body;

      const group = await Group.create({
        name,
        members: [req.userId],
        createdBy: req.userId,
      });

      res.status(201).json(group);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// GET all groups the logged-in user belongs to
router.get('/', authMiddleware, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.userId }).populate('members', 'name email');
    res.status(200).json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ADD a member to a group
router.post(
  '/:groupId/add-member',
  authMiddleware,
  [body('email').isEmail().normalizeEmail().withMessage('Valid email is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
      return res.status(400).json({ message: 'Invalid group ID' });
    }

    try {
      const { email } = req.body;

      const userToAdd = await User.findOne({ email });
      if (!userToAdd) {
        return res.status(404).json({ message: 'User with this email not found' });
      }

      const group = await Group.findById(req.params.groupId);
      if (!group) {
        return res.status(404).json({ message: 'Group not found' });
      }

      // sirf group member hi kisi ko add kar sake
      if (!group.members.includes(req.userId)) {
        return res.status(403).json({ message: 'You are not a member of this group' });
      }

      if (group.members.includes(userToAdd._id)) {
        return res.status(400).json({ message: 'User is already a member' });
      }

      group.members.push(userToAdd._id);
      await group.save();

      res.status(200).json(group);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;