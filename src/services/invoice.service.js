// src/services/invoice.service.js
// MongoDB findOneAndUpdate with $inc on Counter replaces Postgres nextval()
// This is atomic — MongoDB guarantees unique incrementing counters via findOneAndUpdate

const { Invoice, Counter, GaragePreferences } = require("../models");
const { NotFoundError, ForbiddenError } = require("../middleware/errorHandler");

class InvoiceService {
  /**
   * Creates an invoice with a guaranteed unique invoice number.
   * MongoDB's findOneAndUpdate({ $inc: { seq: 1 } }, { new: true, upsert: true })
   * is atomic — equivalent to Postgres nextval('invoice_seq').
   */
  static async createInvoice(input, garageId) {
    // Fetch GST settings
    const prefs = await GaragePreferences.findOne({ garageId });
    const gst = prefs?.gstSettings ?? {};

    const servicesSubtotal = (input.services ?? []).reduce(
      (s, l) => s + l.qty * l.unitPrice - (l.discount ?? 0),
      0,
    );
    const partsSubtotal = (input.parts ?? []).reduce(
      (s, l) => s + l.qty * l.unitPrice - (l.discount ?? 0),
      0,
    );
    const taxable = servicesSubtotal + partsSubtotal - (input.discount ?? 0);
    const cgst = gst.intraState ? (taxable * (gst.cgstPct ?? 0)) / 100 : 0;
    const sgst = gst.intraState ? (taxable * (gst.sgstPct ?? 0)) / 100 : 0;
    const igst = !gst.intraState ? (taxable * (gst.igstPct ?? 0)) / 100 : 0;
    const total = taxable + cgst + sgst + igst;

    // ── Atomic sequential counter — replaces Postgres nextval ───────────────
    const counter = await Counter.findOneAndUpdate(
      { _id: "invoice_seq" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );
    const invoiceSerial = counter.seq;
    const year = new Date().getFullYear();
    const invoiceNumber = `GB-${year}-${String(invoiceSerial).padStart(6, "0")}`;

    const invoice = await Invoice.create({
      garageId,
      invoiceNumber,
      invoiceSerial,
      repairOrderId: input.repairOrderId,
      customerId: input.customerId,
      invoiceType: input.invoiceType,
      servicesSubtotal,
      partsSubtotal,
      discount: input.discount ?? 0,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      total,
    });

    return invoice;
  }

  static async updatePaymentStatus(invoiceId, garageId, status, channel) {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) throw new NotFoundError("Invoice not found");
    if (invoice.garageId.toString() !== garageId)
      throw new ForbiddenError("Forbidden");

    const update = { paymentStatus: status };
    if (channel) update.paymentChannel = channel;
    if (status === "PAID") update.paymentDate = new Date();

    return Invoice.findByIdAndUpdate(invoiceId, update, { new: true });
  }

  static async getInvoicesByGarage(
    garageId,
    { page = 1, limit = 20, paymentStatus } = {},
  ) {
    const filter = { garageId };
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    const [data, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("customerId", "name phone")
        .populate("repairOrderId", "status"),
      Invoice.countDocuments(filter),
    ]);

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  static async getInvoiceById(invoiceId, garageId) {
    const invoice = await Invoice.findOne({ _id: invoiceId, garageId })
      .populate("customerId")
      .populate("repairOrderId");
    if (!invoice) throw new NotFoundError("Invoice not found");
    return invoice;
  }
}

module.exports = { InvoiceService };
