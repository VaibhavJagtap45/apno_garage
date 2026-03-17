// src/models/index.js
// All Mongoose models converted from Prisma schema
const mongoose = require("mongoose");
const { Schema } = mongoose;

// ─── Enums ───────────────────────────────────────────────────────────────────
const GarageType = ["TWO_WHEELER", "FOUR_WHEELER", "BOTH"];
const SubscriptionStatus = ["TRIAL", "ACTIVE", "EXPIRED"];
const UserRole = ["GARAGE_OWNER", "MANAGER", "MECHANIC", "PARTS_MANAGER"];
const RepairOrderStatus = [
  "CREATED",
  "IN_PROGRESS",
  "VEHICLE_READY",
  "PAYMENT_DUE",
  "COMPLETED",
  "CANCELLED",
];
const PartsStatus = ["REQUESTED", "RESERVED", "ISSUED", "RETURNED"];
const InvoiceType = ["REPAIR_ORDER", "COUNTER_SALE"];
const PaymentStatus = ["PAID", "PARTIAL", "CREDIT", "UNPAID"];
const PaymentChannel = ["CASH", "CARD", "UPI", "BANK_TRANSFER", "OTHER"];
const PurchaseOrderStatus = ["CREATED", "SENT", "RECEIVED", "CANCELLED"];
const ApplicableType = ["GENERIC", "SPECIFIC", "BY_CLASS"];
const PackageType = ["GENERAL", "AMC"];
const AppointmentStatus = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"];
const CommChannel = ["SMS", "EMAIL", "WHATSAPP", "PUSH"];
const CommStatus = ["PENDING", "SENT", "FAILED"];
const StockLedgerSource = [
  "STOCK_IN",
  "REPAIR_ORDER_ISSUE",
  "REPAIR_ORDER_RETURN",
  "MANUAL_ADJUSTMENT",
];

// ─── Garage ──────────────────────────────────────────────────────────────────
// const garageSchema = new Schema(
//   {
//     garageName: { type: String, required: true },
//     ownerName: { type: String, required: true },
//     garageType: { type: String, enum: GarageType, required: true },
//     contactNo: { type: String, required: true, unique: true },
//     ownerPhone: String,
//     email: { type: String, required: true },
//     address: String,
//     state: String,
//     gstApplicable: { type: Boolean, default: false },
//     gstin: String,
//     referralCode: String,
//     // smsSenderName: { type: String, default: "GARAGE" },
//     logoUrl: String,
//     subscriptionStatus: {
//       type: String,
//       enum: SubscriptionStatus,
//       default: "TRIAL",
//     },
//     trialExpiryDate: Date,
//   },
//   { timestamps: true },
// );
// src/models/index.js — garageSchema
const garageSchema = new Schema(
  {
    garageName: { type: String, required: true },
    ownerName: { type: String, required: true },
    garageType: { type: String, enum: GarageType, default: "BOTH" }, // ← was required, now has default
    contactNo: { type: String, unique: true, sparse: true }, // ← sparse so null doesn't conflict
    phone: { type: String, unique: true, sparse: true }, // ← add this for auth flow lookups
    contactNumber: { type: String }, // ← add this (auth.routes uses it)
    ownerPhone: String,
    email: { type: String, sparse: true }, // ← was required, now optional
    address: String,
    state: String,
    gstApplicable: { type: Boolean, default: false },
    gstin: String,
    referralCode: String,
    logoUrl: String,
    subscriptionStatus: {
      type: String,
      enum: SubscriptionStatus,
      default: "TRIAL",
    },
    trialExpiryDate: Date,
  },
  { timestamps: true },
);

// ─── GarageUser ──────────────────────────────────────────────────────────────
// src/models/index.js — garageUserSchema
const garageUserSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    name: { type: String, required: true },
    phone: { type: String, unique: true, sparse: true },
    email: { type: String, unique: true, sparse: true },
    role: { type: String, enum: UserRole, required: true },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false }, // ← add this
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// ─── RefreshToken ─────────────────────────────────────────────────────────────
const refreshTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "GarageUser",
      required: true,
      index: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    isRevoked: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    replacedBy: String,
  },
  { timestamps: true },
);

// ─── Customer ────────────────────────────────────────────────────────────────
const customerSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: String,
    address: String,
  },
  { timestamps: true },
);
customerSchema.index({ garageId: 1, phone: 1 });

// ─── Vehicle ─────────────────────────────────────────────────────────────────
const vehicleSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    registrationNumber: { type: String, required: true },
    brand: { type: String, required: true },
    model: { type: String, required: true },
    purchaseDate: Date,
  },
  { timestamps: true },
);
vehicleSchema.index({ garageId: 1, registrationNumber: 1 });

// ─── RepairOrder ─────────────────────────────────────────────────────────────
const repairOrderServiceSchema = new Schema({
  serviceId: { type: Schema.Types.ObjectId, ref: "ServiceMaster" },
  serviceName: { type: String, required: true },
  qty: { type: Number, default: 1 },
  unitPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
});

const repairOrderPartSchema = new Schema({
  partId: { type: Schema.Types.ObjectId, ref: "Part" },
  partName: { type: String, required: true },
  qty: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  partsStatus: { type: String, enum: PartsStatus, default: "REQUESTED" },
});

const repairOrderSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    assignedUserId: { type: Schema.Types.ObjectId, ref: "GarageUser" },
    status: { type: String, enum: RepairOrderStatus, default: "CREATED" },
    problemsRemark: String,
    checklistId: { type: Schema.Types.ObjectId, ref: "Checklist" },
    services: [repairOrderServiceSchema],
    parts: [repairOrderPartSchema],
    tags: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  },
  { timestamps: true },
);
repairOrderSchema.index({ garageId: 1, status: 1 });
repairOrderSchema.index({ garageId: 1, updatedAt: -1 });

// ─── Invoice ─────────────────────────────────────────────────────────────────
// Note: invoiceSerial handled by a MongoDB counter collection (replaces Postgres sequence)
const invoiceSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    repairOrderId: { type: Schema.Types.ObjectId, ref: "RepairOrder" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    invoiceType: { type: String, enum: InvoiceType, required: true },
    invoiceNumber: { type: String, required: true, unique: true },
    invoiceSerial: { type: Number, required: true },
    servicesSubtotal: { type: Number, default: 0 },
    partsSubtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentStatus: { type: String, enum: PaymentStatus, default: "UNPAID" },
    paymentChannel: { type: String, enum: PaymentChannel },
    paymentDate: Date,
    notifiedCustomer: { type: Boolean, default: false },
  },
  { timestamps: true },
);
invoiceSchema.index({ garageId: 1, paymentStatus: 1 });
invoiceSchema.index({ garageId: 1, createdAt: -1 });

// ─── Counter (replaces Postgres sequences) ───────────────────────────────────
const counterSchema = new Schema({
  _id: String, // e.g. "invoice_seq"
  seq: { type: Number, default: 0 },
});

// ─── Vendor ──────────────────────────────────────────────────────────────────
const vendorSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    vendorName: { type: String, required: true },
    phone: String,
    email: String,
    address: String,
    gstin: String,
    pan: String,
    vendorReferenceId: String,
    totalDue: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// ─── Part ─────────────────────────────────────────────────────────────────────
const partSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    partNumber: String,
    partName: { type: String, required: true },
    stockQty: { type: Number, default: 0 },
    mrp: Number,
    purchasePrice: Number,
    rackNo: String,
    minQty: { type: Number, default: 0 },
    maxQty: Number,
    orderQty: Number,
    barcode: String,
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);
partSchema.index({ garageId: 1, stockQty: 1 });

// ─── StockLedger ─────────────────────────────────────────────────────────────
const stockLedgerSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    partId: { type: Schema.Types.ObjectId, ref: "Part", required: true },
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    source: { type: String, enum: StockLedgerSource, required: true },
    referenceId: String,
    operatorId: { type: Schema.Types.ObjectId, ref: "GarageUser" },
    note: String,
  },
  { timestamps: true },
);
stockLedgerSchema.index({ garageId: 1, partId: 1 });
stockLedgerSchema.index({ garageId: 1, createdAt: -1 });

// ─── PurchaseOrder ───────────────────────────────────────────────────────────
const purchaseOrderItemSchema = new Schema({
  partId: { type: Schema.Types.ObjectId, ref: "Part" },
  partNumber: String,
  partName: { type: String, required: true },
  qty: { type: Number, required: true },
  imageUrl: String,
});

const purchaseOrderSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    repairOrderId: { type: Schema.Types.ObjectId, ref: "RepairOrder" },
    status: { type: String, enum: PurchaseOrderStatus, default: "CREATED" },
    comments: String,
    notifyVendor: { type: Boolean, default: false },
    pdfUrl: String,
    items: [purchaseOrderItemSchema],
  },
  { timestamps: true },
);

// ─── StockIn ─────────────────────────────────────────────────────────────────
const stockInItemSchema = new Schema({
  partId: { type: Schema.Types.ObjectId, ref: "Part", required: true },
  receivedQty: { type: Number, required: true },
  currentStock: { type: Number, required: true },
  newStock: { type: Number, required: true },
  purchasePrice: Number,
  mrp: Number,
});

const stockInSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    date: { type: Date, required: true },
    invoiceNo: String,
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    poId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder" },
    paymentChannel: { type: String, enum: PaymentChannel, default: "CASH" },
    paidAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    invoiceImageUrl: String,
    sendReportEmail: { type: Boolean, default: false },
    isSaved: { type: Boolean, default: false },
    jobIdempotencyKey: { type: String, unique: true, sparse: true },
    items: [stockInItemSchema],
  },
  { timestamps: true },
);

// ─── Expense ─────────────────────────────────────────────────────────────────
const expenseSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    amountLabel: { type: String, required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    repairOrderId: { type: Schema.Types.ObjectId, ref: "RepairOrder" },
    totalAmount: { type: Number, required: true },
    comment: String,
    expenseDate: { type: Date, required: true },
    referenceNumber: String,
    paymentStatus: { type: String, enum: PaymentStatus, required: true },
    paymentChannel: { type: String, enum: PaymentChannel },
    paymentDate: Date,
    receiptImageUrl: String,
  },
  { timestamps: true },
);
expenseSchema.index({ garageId: 1, expenseDate: -1 });

// ─── Tag ─────────────────────────────────────────────────────────────────────
const tagSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    tagName: { type: String, required: true },
    tagType: String,
    tagColor: { type: String, default: "BLACK" },
  },
  { timestamps: true },
);

// ─── ServiceMaster ────────────────────────────────────────────────────────────
const serviceMasterSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    serviceName: { type: String, required: true },
    serviceNumber: String,
    priceMrp: Number,
    serviceCategory: String,
    applicableType: { type: String, enum: ApplicableType, default: "GENERIC" },
    vehicleFilters: Schema.Types.Mixed,
  },
  { timestamps: true },
);

// ─── GaragePackage ───────────────────────────────────────────────────────────
const garagePackageSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    packageName: { type: String, required: true },
    packageType: { type: String, enum: PackageType, required: true },
    price: Number,
    validityDays: Number,
    services: [{ type: Schema.Types.ObjectId, ref: "ServiceMaster" }],
    parts: [
      {
        partId: { type: Schema.Types.ObjectId, ref: "Part" },
        qty: { type: Number, default: 1 },
      },
    ],
  },
  { timestamps: true },
);

// ─── Checklist ───────────────────────────────────────────────────────────────
const checklistSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    name: { type: String, required: true },
    items: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

// ─── Appointment ─────────────────────────────────────────────────────────────
const appointmentSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    assignedUserId: { type: Schema.Types.ObjectId, ref: "GarageUser" },
    scheduledAt: { type: Date, required: true },
    status: { type: String, enum: AppointmentStatus, default: "PENDING" },
    notes: String,
  },
  { timestamps: true },
);
appointmentSchema.index({ garageId: 1, scheduledAt: 1 });

// ─── GaragePreferences ───────────────────────────────────────────────────────
const garagePreferencesSchema = new Schema({
  garageId: {
    type: Schema.Types.ObjectId,
    ref: "Garage",
    required: true,
    unique: true,
  },
  gstSettings: Schema.Types.Mixed,
  smsSettings: Schema.Types.Mixed,
  emailSettings: Schema.Types.Mixed,
});

// ─── CommunicationLog ────────────────────────────────────────────────────────
const communicationLogSchema = new Schema(
  {
    garageId: { type: Schema.Types.ObjectId, ref: "Garage", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    channel: { type: String, enum: CommChannel, required: true },
    status: { type: String, enum: CommStatus, default: "PENDING" },
    subject: String,
    body: { type: String, required: true },
    sentAt: Date,
  },
  { timestamps: true },
);

// ─── Register models ─────────────────────────────────────────────────────────
module.exports = {
  Garage: mongoose.model("Garage", garageSchema),
  GarageUser: mongoose.model("GarageUser", garageUserSchema),
  RefreshToken: mongoose.model("RefreshToken", refreshTokenSchema),
  Customer: mongoose.model("Customer", customerSchema),
  Vehicle: mongoose.model("Vehicle", vehicleSchema),
  RepairOrder: mongoose.model("RepairOrder", repairOrderSchema),
  Invoice: mongoose.model("Invoice", invoiceSchema),
  Counter: mongoose.model("Counter", counterSchema),
  Vendor: mongoose.model("Vendor", vendorSchema),
  Part: mongoose.model("Part", partSchema),
  StockLedger: mongoose.model("StockLedger", stockLedgerSchema),
  PurchaseOrder: mongoose.model("PurchaseOrder", purchaseOrderSchema),
  StockIn: mongoose.model("StockIn", stockInSchema),
  Expense: mongoose.model("Expense", expenseSchema),
  Tag: mongoose.model("Tag", tagSchema),
  ServiceMaster: mongoose.model("ServiceMaster", serviceMasterSchema),
  GaragePackage: mongoose.model("GaragePackage", garagePackageSchema),
  Checklist: mongoose.model("Checklist", checklistSchema),
  Appointment: mongoose.model("Appointment", appointmentSchema),
  GaragePreferences: mongoose.model(
    "GaragePreferences",
    garagePreferencesSchema,
  ),
  CommunicationLog: mongoose.model("CommunicationLog", communicationLogSchema),
};
