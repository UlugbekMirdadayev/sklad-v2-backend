const express = require('express');
const router = express.Router();
const Batch = require('../models/products/batch.model');

// Create a new batch
router.post('/', async (req, res) => {
  try {
    const { batch_number } = req.body;
    if (!batch_number) {
      return res.status(400).json({ message: 'batch_number is required' });
    }
    const batch = new Batch({ batch_number });
    await batch.save();
    res.status(201).json({ batch_number: batch.batch_number });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all batches (only batch_number, exclude deleted)
router.get('/', async (req, res) => {
  try {
    const batches = await Batch.find({ isDeleted: false }, 'batch_number');
    res.json(batches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a batch by batch_number (exclude deleted)
router.get('/:batch_number', async (req, res) => {
  try {
    const batch = await Batch.findOne({ batch_number: req.params.batch_number, isDeleted: false }, 'batch_number');
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }
    res.json({ batch_number: batch.batch_number });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a batch (only batch_number can be updated, exclude deleted)
router.patch('/:batch_number', async (req, res) => {
  try {
    const { batch_number: newBatchNumber } = req.body;
    if (!newBatchNumber) {
      return res.status(400).json({ message: 'batch_number is required' });
    }
    const batch = await Batch.findOneAndUpdate(
      { batch_number: req.params.batch_number, isDeleted: false },
      { batch_number: newBatchNumber },
      { new: true, runValidators: true, fields: 'batch_number' }
    );
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }
    res.json({ batch_number: batch.batch_number });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Soft delete a batch by batch_number
router.delete('/:batch_number', async (req, res) => {
  try {
    const batch = await Batch.findOne({ batch_number: req.params.batch_number, isDeleted: false });
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }
    batch.isDeleted = true;
    batch.deletedAt = new Date();
    await batch.save();
    res.json({ message: 'Batch soft deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
