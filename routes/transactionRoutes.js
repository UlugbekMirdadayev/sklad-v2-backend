const express = require("express");
const router = express.Router();
const Transaction = require("../models/transactions/transaction.model");
const Client = require("../models/clients/client.model");


// 📊 Oylik kirim/chiqim statistikasi
router.get("/", async (req, res) => {
    try {
        const result = await Transaction.find({ isDeleted: false }).populate("client createdBy");
        res.json({
            transactions: result
        });
    } catch (error) {
        res.status(500).json({ message: "Statistika olishda xatolik", error });
    }
});

// ➕ Kirim
router.post("/cash-in", async (req, res) => {
    try {
        const { amount, paymentType, description, branch, createdBy, client } = req.body;

        const isClient = await Client.findById(client);

        if (isClient?.isVip) {
            isClient.debt -= amount;
            await isClient.save();
        }



        const transaction = await Transaction.create({
            type: "cash-in",
            amount,
            paymentType,
            description,
            branch,
            createdBy,
            client
        });

        res.status(201).json(transaction);
    } catch (error) {
        res.status(500).json({ message: "Kirimni qo‘shishda xatolik", error });
    }
});

// ➖ Chiqim
router.post("/cash-out", async (req, res) => {
    try {
        const { amount, paymentType, description, branch, createdBy, client } = req.body;

        const isClient = await Client.findById(client);

        if (isClient?.isVip) {
            isClient.debt += amount;
            await isClient.save();
        }



        const transaction = await Transaction.create({
            type: "cash-out",
            amount,
            paymentType,
            description,
            branch,
            createdBy,
            client
        });

        res.status(201).json(transaction);
    } catch (error) {
        res.status(500).json({ message: "Chiqimni qo‘shishda xatolik", error });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const transactionId = req.params.id;
        const { amount, paymentType, description, branch, createdBy, client } = req.body;

        const transaction = await Transaction.findById(transactionId);
        if (!transaction || transaction.isDeleted) {
            return res.status(404).json({ message: "Transaction topilmadi" });
        }
        if (client) {

            const oldClientId = transaction;
            const newClientId = client;

            // Eski clientdan eski transaction.amount ni qaytarish
            if (oldClientId) {
                const oldClient = await Client.findById(oldClientId);
                if (oldClient?.isVip) {
                    if (transaction.type === "cash-in") {
                        oldClient.debt += transaction.amount;
                    } else if (transaction.type === "cash-out") {
                        oldClient.debt -= transaction.amount;
                    }
                    await oldClient.save();
                }
            }

            // Yangi clientga yangi amount asosida balansni qo‘llash
            if (newClientId) {
                const newClient = await Client.findById(newClientId);
                if (!newClient?.isVip) {
                    return res.status(404).json({ message: "VIP Mijoz topilmadi" });
                }

                if (transaction.type === "cash-in") {
                    newClient.debt -= amount;
                } else if (transaction.type === "cash-out") {
                    newClient.debt += amount;
                }
                await newClient.save();

                transaction.client = newClientId;
            }
        }

        // Transaction'ni yangilash
        transaction.amount = amount;
        transaction.paymentType = paymentType;
        transaction.description = description;
        transaction.branch = branch;
        transaction.createdBy = createdBy;

        await transaction.save();

        res.json(transaction);
    } catch (error) {
        res.status(500).json({ message: "Transaction yangilashda xatolik", error });
    }
});



// 📊 Oylik kirim/chiqim statistikasi
router.get("/statistics/monthly-transactions", async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const branch = req.query.branch; // optional

        const match = {
            createdAt: {
                $gte: new Date(`${year}-01-01T00:00:00.000Z`),
                $lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
            },
        };

        if (branch) {
            match.branch = branch;
        }

        const pipeline = [
            { $match: match },
            {
                $project: {
                    month: { $month: "$createdAt" },
                    type: 1,
                    amount: 1,
                },
            },
            {
                $group: {
                    _id: { month: "$month", type: "$type" },
                    total: { $sum: "$amount" },
                },
            },
        ];

        const result = await Transaction.aggregate(pipeline);

        const cashIn = Array(12).fill(0);
        const cashOut = Array(12).fill(0);

        result.forEach((item) => {
            const index = item._id.month - 1;
            if (item._id.type === "cash-in") {
                cashIn[index] = item.total;
            } else if (item._id.type === "cash-out") {
                cashOut[index] = item.total;
            }
        });

        res.json({ cashIn, cashOut });
    } catch (error) {
        res.status(500).json({ message: "Statistika olishda xatolik", error });
    }
});

module.exports = router;
