// src/routes/index.js
const router = require('express').Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { InvoiceService }    = require('../services/invoice.service');
const { StockInService }    = require('../services/stockIn.service');
const { DashboardService }  = require('../services/dashboard.service');
const {
  GarageService, CustomerService, VehicleService,
  PartService, RepairOrderService, VendorService, UserService,
} = require('../services');

// ─── Garage ──────────────────────────────────────────────────────────────────
router.post('/garages', async (req, res, next) => {
  try { res.status(201).json(await GarageService.createGarage(req.body)); }
  catch (e) { next(e); }
});

router.get('/garages/:id', requireAuth, async (req, res, next) => {
  try { res.json(await GarageService.getGarageById(req.params.id)); }
  catch (e) { next(e); }
});

router.patch('/garages/:id', requireAuth, requireRole('GARAGE_OWNER'), async (req, res, next) => {
  try { res.json(await GarageService.updateGarage(req.params.id, req.body)); }
  catch (e) { next(e); }
});

router.get('/garages/:id/preferences', requireAuth, async (req, res, next) => {
  try { res.json(await GarageService.getPreferences(req.params.id)); }
  catch (e) { next(e); }
});

router.put('/garages/:id/preferences', requireAuth, requireRole('GARAGE_OWNER', 'MANAGER'), async (req, res, next) => {
  try { res.json(await GarageService.upsertPreferences(req.params.id, req.body)); }
  catch (e) { next(e); }
});

// ─── Users ───────────────────────────────────────────────────────────────────
router.get('/users', requireAuth, async (req, res, next) => {
  try { res.json(await UserService.getUsers(req.user.garageId)); }
  catch (e) { next(e); }
});

router.post('/users', requireAuth, requireRole('GARAGE_OWNER', 'MANAGER'), async (req, res, next) => {
  try { res.status(201).json(await UserService.createUser(req.body, req.user.garageId)); }
  catch (e) { next(e); }
});

router.delete('/users/:id', requireAuth, requireRole('GARAGE_OWNER'), async (req, res, next) => {
  try { res.json(await UserService.deactivateUser(req.params.id, req.user.garageId)); }
  catch (e) { next(e); }
});

// ─── Customers ────────────────────────────────────────────────────────────────
router.get('/customers', requireAuth, async (req, res, next) => {
  try {
    const { page, limit, search } = req.query;
    res.json(await CustomerService.getCustomers(req.user.garageId, { page: +page || 1, limit: +limit || 20, search }));
  } catch (e) { next(e); }
});

router.post('/customers', requireAuth, async (req, res, next) => {
  try { res.status(201).json(await CustomerService.createCustomer(req.body, req.user.garageId)); }
  catch (e) { next(e); }
});

router.get('/customers/:id', requireAuth, async (req, res, next) => {
  try { res.json(await CustomerService.getCustomerById(req.params.id, req.user.garageId)); }
  catch (e) { next(e); }
});

router.patch('/customers/:id', requireAuth, async (req, res, next) => {
  try { res.json(await CustomerService.updateCustomer(req.params.id, req.user.garageId, req.body)); }
  catch (e) { next(e); }
});

// ─── Vehicles ────────────────────────────────────────────────────────────────
router.get('/customers/:customerId/vehicles', requireAuth, async (req, res, next) => {
  try { res.json(await VehicleService.getVehiclesByCustomer(req.params.customerId, req.user.garageId)); }
  catch (e) { next(e); }
});

router.post('/vehicles', requireAuth, async (req, res, next) => {
  try { res.status(201).json(await VehicleService.createVehicle(req.body, req.user.garageId)); }
  catch (e) { next(e); }
});

router.get('/vehicles/:id', requireAuth, async (req, res, next) => {
  try { res.json(await VehicleService.getVehicleById(req.params.id, req.user.garageId)); }
  catch (e) { next(e); }
});

// ─── Repair Orders ───────────────────────────────────────────────────────────
router.get('/repair-orders', requireAuth, async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;
    res.json(await RepairOrderService.getRepairOrders(req.user.garageId, { page: +page || 1, limit: +limit || 20, status }));
  } catch (e) { next(e); }
});

router.post('/repair-orders', requireAuth, async (req, res, next) => {
  try { res.status(201).json(await RepairOrderService.createRepairOrder(req.body, req.user.garageId)); }
  catch (e) { next(e); }
});

router.get('/repair-orders/:id', requireAuth, async (req, res, next) => {
  try { res.json(await RepairOrderService.getRepairOrderById(req.params.id, req.user.garageId)); }
  catch (e) { next(e); }
});

router.patch('/repair-orders/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    res.json(await RepairOrderService.updateStatus(req.params.id, req.user.garageId, status));
  } catch (e) { next(e); }
});

// ─── Parts ───────────────────────────────────────────────────────────────────
router.get('/parts', requireAuth, async (req, res, next) => {
  try {
    const { page, limit, search, lowStock } = req.query;
    res.json(await PartService.getParts(req.user.garageId, {
      page: +page || 1, limit: +limit || 20, search,
      lowStock: lowStock === 'true',
    }));
  } catch (e) { next(e); }
});

router.post('/parts', requireAuth, requireRole('GARAGE_OWNER', 'MANAGER', 'PARTS_MANAGER'), async (req, res, next) => {
  try { res.status(201).json(await PartService.createPart(req.body, req.user.garageId)); }
  catch (e) { next(e); }
});

router.get('/parts/:id', requireAuth, async (req, res, next) => {
  try { res.json(await PartService.getPartById(req.params.id, req.user.garageId)); }
  catch (e) { next(e); }
});

router.patch('/parts/:id', requireAuth, requireRole('GARAGE_OWNER', 'MANAGER', 'PARTS_MANAGER'), async (req, res, next) => {
  try { res.json(await PartService.updatePart(req.params.id, req.user.garageId, req.body)); }
  catch (e) { next(e); }
});

// ─── Vendors ─────────────────────────────────────────────────────────────────
router.get('/vendors', requireAuth, async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    res.json(await VendorService.getVendors(req.user.garageId, { page: +page || 1, limit: +limit || 20 }));
  } catch (e) { next(e); }
});

router.post('/vendors', requireAuth, async (req, res, next) => {
  try { res.status(201).json(await VendorService.createVendor(req.body, req.user.garageId)); }
  catch (e) { next(e); }
});

router.get('/vendors/:id', requireAuth, async (req, res, next) => {
  try { res.json(await VendorService.getVendorById(req.params.id, req.user.garageId)); }
  catch (e) { next(e); }
});

// ─── Invoices ────────────────────────────────────────────────────────────────
router.get('/invoices', requireAuth, async (req, res, next) => {
  try {
    const { page, limit, paymentStatus } = req.query;
    res.json(await InvoiceService.getInvoicesByGarage(req.user.garageId, { page: +page || 1, limit: +limit || 20, paymentStatus }));
  } catch (e) { next(e); }
});

router.post('/invoices', requireAuth, async (req, res, next) => {
  try { res.status(201).json(await InvoiceService.createInvoice(req.body, req.user.garageId)); }
  catch (e) { next(e); }
});

router.get('/invoices/:id', requireAuth, async (req, res, next) => {
  try { res.json(await InvoiceService.getInvoiceById(req.params.id, req.user.garageId)); }
  catch (e) { next(e); }
});

router.patch('/invoices/:id/payment', requireAuth, async (req, res, next) => {
  try {
    const { status, channel } = req.body;
    res.json(await InvoiceService.updatePaymentStatus(req.params.id, req.user.garageId, status, channel));
  } catch (e) { next(e); }
});

// ─── StockIn ─────────────────────────────────────────────────────────────────
router.get('/stock-ins', requireAuth, async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    res.json(await StockInService.getStockIns(req.user.garageId, { page: +page || 1, limit: +limit || 20 }));
  } catch (e) { next(e); }
});

router.post('/stock-ins', requireAuth, async (req, res, next) => {
  try { res.status(201).json(await StockInService.createStockIn(req.body, req.user.garageId)); }
  catch (e) { next(e); }
});

router.post('/stock-ins/:id/save', requireAuth, async (req, res, next) => {
  try {
    const result = await StockInService.saveStockIn(req.params.id, req.user.garageId, req.user.userId);
    res.json(result);
  } catch (e) { next(e); }
});

// ─── Dashboard ───────────────────────────────────────────────────────────────
router.get('/dashboard/stats', requireAuth, async (req, res, next) => {
  try { res.json(await DashboardService.getDashboardStats(req.user.garageId)); }
  catch (e) { next(e); }
});

router.get('/dashboard/summary', requireAuth, async (req, res, next) => {
  try {
    const { month } = req.query;
    res.json(await DashboardService.getAccountSummary(req.user.garageId, month));
  } catch (e) { next(e); }
});

module.exports = router;
