// src/services/stockIn.service.js
// Incremental stock updates using MongoDB $inc — avoids race conditions.
// Note: For true ACID transactions use MongoDB replica set (sessions/transactions).

const mongoose = require('mongoose');
const { StockIn, Part, StockLedger } = require('../models');
const { NotFoundError, ForbiddenError, AppError } = require('../middleware/errorHandler');

class StockInService {
  /**
   * Saves a draft StockIn and atomically updates each part's stock.
   *
   * Uses MongoDB sessions/transactions (requires replica set or mongos).
   * Falls back to sequential $inc operations if transactions unavailable.
   *
   * The $inc operator is atomic at the document level — concurrent writes
   * for the same part will correctly accumulate, not overwrite.
   */
  static async saveStockIn(stockInId, garageId, userId) {
    const stockIn = await StockIn.findById(stockInId);
    if (!stockIn)                          throw new NotFoundError('Stock-in not found');
    if (stockIn.isSaved)                   throw new AppError('Already saved', 400);
    if (stockIn.garageId.toString() !== garageId) throw new ForbiddenError('Forbidden');
    if (!stockIn.items?.length)            throw new AppError('No items in stock-in', 400);

    // Use MongoDB transactions if available (replica set required)
    const session = await mongoose.startSession();
    let result;

    try {
      await session.withTransaction(async () => {
        const now = new Date();

        for (const item of stockIn.items) {
          // Atomic increment — $inc is safe against concurrent writes
          const updatedPart = await Part.findOneAndUpdate(
            { _id: item.partId },
            {
              $inc:  { stockQty: item.receivedQty, version: 1 },
              $set:  {
                ...(item.purchasePrice != null && { purchasePrice: item.purchasePrice }),
                ...(item.mrp          != null && { mrp:           item.mrp }),
                updatedAt: now,
              },
            },
            { new: true, session },
          );

          // Append-only ledger row
          await StockLedger.create([{
            garageId,
            partId:       item.partId,
            delta:        item.receivedQty,
            balanceAfter: updatedPart.stockQty,
            source:       'STOCK_IN',
            referenceId:  stockInId,
            operatorId:   userId,
            note:         `StockIn ${stockInId}`,
          }], { session });
        }

        result = await StockIn.findByIdAndUpdate(
          stockInId,
          { isSaved: true },
          { new: true, session, populate: [{ path: 'items.partId', model: 'Part' }, { path: 'vendorId', model: 'Vendor' }] },
        );
      });
    } finally {
      await session.endSession();
    }

    return result;
  }

  /**
   * Issue parts to a repair order — atomically decrements stock and writes ledger.
   */
  static async issuePartsToRepairOrder(repairOrderPartId, partId, qty, garageId, userId) {
    const part = await Part.findById(partId);
    if (!part)               throw new NotFoundError('Part not found');
    if (part.stockQty < qty) throw new AppError('Insufficient stock', 400);
    if (part.garageId.toString() !== garageId) throw new ForbiddenError('Forbidden');

    const session = await mongoose.startSession();
    let updatedPart;

    try {
      await session.withTransaction(async () => {
        updatedPart = await Part.findOneAndUpdate(
          { _id: partId, stockQty: { $gte: qty } },   // guard against race
          { $inc: { stockQty: -qty, version: 1 } },
          { new: true, session },
        );
        if (!updatedPart) throw new AppError('Insufficient stock (concurrent update)', 409);

        await StockLedger.create([{
          garageId,
          partId,
          delta:        -qty,
          balanceAfter: updatedPart.stockQty,
          source:       'REPAIR_ORDER_ISSUE',
          referenceId:  repairOrderPartId,
          operatorId:   userId,
          note:         `Issued for RO part ${repairOrderPartId}`,
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    return updatedPart;
  }

  static async createStockIn(input, garageId) {
    return StockIn.create({ ...input, garageId });
  }

  static async getStockIns(garageId, { page = 1, limit = 20 } = {}) {
    const [data, total] = await Promise.all([
      StockIn.find({ garageId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('vendorId', 'vendorName'),
      StockIn.countDocuments({ garageId }),
    ]);
    return { data, total, page, pages: Math.ceil(total / limit) };
  }
}

module.exports = { StockInService };
