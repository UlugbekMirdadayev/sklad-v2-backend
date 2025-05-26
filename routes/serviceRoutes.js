const express = require("express");
const router = express.Router();
const Service = require("../models/services/service.model");

// CREATE a new service
router.post("/", async (req, res) => {
  try {
    const service = new Service({
      ...req.body,
    });
    await service.save();
    res.status(201).json(service);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// READ all services with filtering and pagination
router.get("/", async (req, res) => {
  try {
    const {
      status,
      branch,
      serviceType,
      priority,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isDeleted: false }; // Only show non-deleted services
    if (status) query.status = status;
    if (branch) query.branch = branch;
    if (serviceType) query.serviceType = serviceType;
    if (priority) query.priority = priority;

    const services = await Service.find(query)
      .populate("branch createdBy client")
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Service.countDocuments(query);

    res.json({
      services,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ one service by ID
router.get("/:id", async (req, res) => {
  try {
    const service = await Service.findOne({
      _id: req.params.id,
      isDeleted: false,
    }).populate("branch createdBy client");
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a service
router.put("/:id", async (req, res) => {
  try {
    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      {
        ...req.body,
      },
      {
        new: true,
        runValidators: true,
      }
    );
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE a service (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const service = await Service.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      {
        isDeleted: true,
        isActive: false,
      },
      { new: true }
    );
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json({ message: "Service deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
