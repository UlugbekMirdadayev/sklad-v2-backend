const express = require("express");
const router = express.Router();
const ServiceList = require("../models/services/servicelist.model");

// Получить все услуги
router.get("/", async (req, res) => {
  try {
    const services = await ServiceList.find();
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Создать услугу
router.post("/", async (req, res) => {
  try {
    const service = new ServiceList(req.body);
    await service.save();
    res.status(201).json(service);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Получить услугу по id
router.get("/:id", async (req, res) => {
  try {
    const service = await ServiceList.findById(req.params.id);
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Обновить услугу
router.put("/:id", async (req, res) => {
  try {
    const service = await ServiceList.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Удалить услугу
router.delete("/:id", async (req, res) => {
  try {
    const service = await ServiceList.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json({ message: "Service deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
