const express = require("express");
const router = express.Router();
const Branch = require("../models/branches/branch.model");
const auth = require("../middleware/authMiddleware");

router.use(auth);

// Получение списка всех филиалов
router.get("/", async (req, res) => {
  try {
    const branches = await Branch.find();
    res.json(branches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Получение одного филиала по ID
router.get("/:id", async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ message: "Филиал не найден" });
    }
    res.json(branch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Создание нового филиала
router.post("/", async (req, res) => {
  const branch = new Branch({
    name: req.body.name,
    address: req.body.address,
    isActive: req.body.isActive,
  });

  try {
    const newBranch = await branch.save();
    res.status(201).json(newBranch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Обновление филиала
router.patch("/:id", async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ message: "Филиал не найден" });
    }

    if (req.body.name != null) {
      branch.name = req.body.name;
    }
    if (req.body.address != null) {
      branch.address = req.body.address;
    }
    if (req.body.isActive != null) {
      branch.isActive = req.body.isActive;
    }

    const updatedBranch = await branch.save();
    res.json(updatedBranch);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Удаление филиала
router.delete("/:id", async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ message: "Филиал не найден" });
    }

    await branch.deleteOne();
    res.json({ message: "Филиал успешно удален" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
