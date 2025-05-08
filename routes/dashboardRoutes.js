const express = require("express");
const router = express.Router();

// Получение данных для графика Kirim
router.get("/kirim-data", (req, res) => {
  const data = [
    { month: "Yan", percent: 25 },
    { month: "Fev", percent: 30 },
    { month: "Mar", percent: 20 },
    { month: "Apr", percent: 35 },
    { month: "May", percent: 28 },
    { month: "Iyun", percent: 32 },
    { month: "Iyul", percent: 26 },
    { month: "Avg", percent: 31 },
    { month: "Sen", percent: 22 },
    { month: "Okt", percent: 27 },
    { month: "Noy", percent: 24 },
    { month: "Dek", percent: 29 },
  ];
  res.json(data);
});

// Получение данных для графика Chiqim
router.get("/chiqim-data", (req, res) => {
  const data = [
    { month: "Yan", percent: 35 },
    { month: "Fev", percent: 28 },
    { month: "Mar", percent: 42 },
    { month: "Apr", percent: 31 },
    { month: "May", percent: 45 },
    { month: "Iyun", percent: 38 },
    { month: "Iyul", percent: 41 },
    { month: "Avg", percent: 33 },
    { month: "Sen", percent: 39 },
    { month: "Okt", percent: 36 },
    { month: "Noy", percent: 44 },
    { month: "Dek", percent: 37 },
  ];
  res.json(data);
});

module.exports = router;
