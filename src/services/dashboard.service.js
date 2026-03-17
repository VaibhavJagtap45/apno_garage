// src/services/dashboard.service.js
const { RepairOrder, Invoice, Expense, StockIn } = require('../models');
const { redis } = require('../config/redis');
const { logger } = require('../lib/logger');

const STATS_TTL_SECONDS   = 30;
const SUMMARY_TTL_SECONDS = 60;

const statsKey   = (garageId) => `cache:dashboard:stats:${garageId}`;
const summaryKey = (garageId, month) => `cache:dashboard:summary:${garageId}:${month}`;

class DashboardService {
  static async getDashboardStats(garageId) {
    const key    = statsKey(garageId);
    const cached = await redis.get(key);
    if (cached) {
      logger.debug({ type: 'CACHE_HIT', key });
      return JSON.parse(cached);
    }

    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [open, wip, ready, payDue, completed, payDueAmt] = await Promise.all([
      RepairOrder.countDocuments({ garageId, status: 'CREATED' }),
      RepairOrder.countDocuments({ garageId, status: 'IN_PROGRESS' }),
      RepairOrder.countDocuments({ garageId, status: 'VEHICLE_READY' }),
      RepairOrder.countDocuments({ garageId, status: 'PAYMENT_DUE' }),
      RepairOrder.countDocuments({ garageId, status: 'COMPLETED', updatedAt: { $gte: startOfMonth } }),
      Invoice.aggregate([
        { $match: { garageId: require('mongoose').Types.ObjectId.createFromHexString(garageId), paymentStatus: { $in: ['UNPAID', 'PARTIAL'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);

    const result = {
      openOrders:         open,
      wipOrders:          wip,
      readyOrders:        ready,
      paymentDue:         payDue,
      completedThisMonth: completed,
      paymentDueAmt:      payDueAmt[0]?.total ?? 0,
    };

    await redis.set(key, JSON.stringify(result), 'EX', STATS_TTL_SECONDS);
    return result;
  }

  static async getAccountSummary(garageId, month) {
    const monthStr = month ?? formatMonth(new Date());
    const key      = summaryKey(garageId, monthStr);
    const cached   = await redis.get(key);
    if (cached) return JSON.parse(cached);

    const [start, end] = parseMonthRange(monthStr);
    const gid = require('mongoose').Types.ObjectId.createFromHexString(garageId);

    const [expensesAgg, incomeAgg, partPurchasesAgg] = await Promise.all([
      Expense.aggregate([
        { $match: { garageId: gid, expenseDate: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Invoice.aggregate([
        { $match: { garageId: gid, createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      StockIn.aggregate([
        { $match: { garageId: gid, isSaved: true, createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);

    const totalExpense = expensesAgg[0]?.total ?? 0;
    const totalIncome  = incomeAgg[0]?.total ?? 0;
    const partPurchase = partPurchasesAgg[0]?.total ?? 0;

    const result = {
      totalExpense,
      paidExpense:   totalExpense,
      creditExpense: 0,
      totalIncome,
      partPurchase,
      netAmount:     totalIncome - totalExpense - partPurchase,
    };

    await redis.set(key, JSON.stringify(result), 'EX', SUMMARY_TTL_SECONDS);
    return result;
  }

  static async invalidateStats(garageId) {
    await redis.del(statsKey(garageId));
  }

  static async invalidateSummary(garageId, month) {
    await redis.del(summaryKey(garageId, month));
  }
}

function formatMonth(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthRange(month) {
  const [year, mon] = month.split('-').map(Number);
  return [new Date(year, mon - 1, 1), new Date(year, mon, 1)];
}

module.exports = { DashboardService };
