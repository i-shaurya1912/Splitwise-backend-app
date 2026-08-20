const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Expense = require('../models/Expense');
const Group = require('../models/Group');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// CREATE expense with equal or custom split
router.post(
  '/',
  authMiddleware,
  [
    body('description').trim().notEmpty().withMessage('Description is required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
    body('groupId').isMongoId().withMessage('Invalid group ID'),
    body('splitAmong').optional().isArray().withMessage('splitAmong must be an array'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { description, amount, groupId, splitAmong } = req.body;

      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Group not found' });
      }

      if (!group.members.includes(req.userId)) {
        return res.status(403).json({ message: 'You are not a member of this group' });
      }

      const groupMemberIds = group.members.map((id) => id.toString());
      let selectedMembers = splitAmong && splitAmong.length > 0 ? splitAmong : groupMemberIds;

      const invalidMember = selectedMembers.find((id) => !groupMemberIds.includes(id));
      if (invalidMember) {
        return res.status(400).json({ message: 'One or more selected members are not in this group' });
      }

      const numMembers = selectedMembers.length;
      const splitAmount = amount / numMembers;

      const splitBetween = selectedMembers.map((memberId) => ({
        user: memberId,
        amount: parseFloat(splitAmount.toFixed(2)),
      }));

      const expense = await Expense.create({
        description,
        amount,
        group: groupId,
        paidBy: req.userId,
        splitBetween,
      });

      res.status(201).json(expense);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// GET all expenses for a group
router.get('/group/:groupId', authMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
    return res.status(400).json({ message: 'Invalid group ID' });
  }

  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!group.members.includes(req.userId)) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const expenses = await Expense.find({ group: req.params.groupId })
      .populate('paidBy', 'name email')
      .populate('splitBetween.user', 'name email');

    res.status(200).json(expenses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET balances for a group
router.get('/group/:groupId/balances', authMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
    return res.status(400).json({ message: 'Invalid group ID' });
  }

  try {
    const group = await Group.findById(req.params.groupId).populate('members', 'name email');
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!group.members.some((m) => m._id.toString() === req.userId)) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const expenses = await Expense.find({ group: req.params.groupId });

    const balances = {};
    group.members.forEach((member) => {
      balances[member._id.toString()] = { name: member.name, email: member.email, balance: 0 };
    });

    expenses.forEach((exp) => {
      const paidById = exp.paidBy.toString();
      if (balances[paidById]) balances[paidById].balance += exp.amount;

      exp.splitBetween.forEach((split) => {
        const userId = split.user.toString();
        if (balances[userId]) balances[userId].balance -= split.amount;
      });
    });

    res.status(200).json(Object.values(balances));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET simplified settlements for a group
router.get('/group/:groupId/settlements', authMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.groupId)) {
    return res.status(400).json({ message: 'Invalid group ID' });
  }

  try {
    const group = await Group.findById(req.params.groupId).populate('members', 'name email');
    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (!group.members.some((m) => m._id.toString() === req.userId)) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const expenses = await Expense.find({ group: req.params.groupId });

    const balances = {};
    group.members.forEach((m) => {
      balances[m._id.toString()] = { name: m.name, balance: 0 };
    });
    expenses.forEach((exp) => {
      const paidById = exp.paidBy.toString();
      if (balances[paidById]) balances[paidById].balance += exp.amount;
      exp.splitBetween.forEach((split) => {
        const userId = split.user.toString();
        if (balances[userId]) balances[userId].balance -= split.amount;
      });
    });

    const debtors = [];
    const creditors = [];
    Object.entries(balances).forEach(([userId, data]) => {
      if (data.balance < -0.01) debtors.push({ userId, name: data.name, amount: -data.balance });
      else if (data.balance > 0.01) creditors.push({ userId, name: data.name, amount: data.balance });
    });

    const settlements = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const settleAmount = Math.min(debtor.amount, creditor.amount);

      settlements.push({
        from: debtor.name,
        fromUserId: debtor.userId,
        to: creditor.name,
        toUserId: creditor.userId,
        amount: parseFloat(settleAmount.toFixed(2)),
      });

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;

      if (debtor.amount < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    res.status(200).json(settlements);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;