const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Worker = require("../models/Worker");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(404).json({
        message: `Noto‘g‘ri ma’lumot: ${!phone ? "`phone`" : ""} ${
          !password ? "`password`" : ""
        } topilmadi.`,
      });
    }

    const worker = await Worker.findOne({ phone });
    if (!worker) {
      return res
        .status(404)
        .json({ message: "Bu telefon raqami ro'yxatdan o'tmagan!" });
    }

    const isMatch = await bcrypt.compare(password, worker.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Parol noto'g'ri!" });
    }

    const token = jwt.sign({ workerId: worker._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });

    const userData = worker.toObject();
    delete userData.password;

    res.json({
      message: "Muvaffaqiyatli tizimga kirildi!",
      worker: userData,
      token,
    });
  } catch (error) {
    res.status(500).json({ message: `Xatolik yuz berdi! ${error.message}` });
  }
});

module.exports = router;
