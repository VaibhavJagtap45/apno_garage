// src/jobs/index.js
// BullMQ background jobs with idempotency keys and retry/backoff

const { Queue, Worker } = require('bullmq');
const { redis }         = require('../config/redis');
const { Invoice, StockIn } = require('../models');
const { sendNotificationEmail } = require('../lib/email');
const { logger }        = require('../lib/logger');

const connection = redis;

// ─── Queues ──────────────────────────────────────────────────────────────────
const emailQueue = new Queue('email', {
  connection,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 2_000 },
    removeOnComplete: { count: 500 },
    removeOnFail:     { count: 200 },
  },
});

const pdfQueue = new Queue('pdf', {
  connection,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 3_000 },
    removeOnComplete: { count: 200 },
    removeOnFail:     { count: 100 },
  },
});

// ─── Enqueue helpers ─────────────────────────────────────────────────────────
async function enqueueSendInvoiceEmail(data) {
  return emailQueue.add('send-invoice-email', data, {
    jobId: `invoice-email:${data.invoiceId}`,   // idempotency key
  });
}

async function enqueueGenerateInvoicePdf(data) {
  return pdfQueue.add('generate-invoice-pdf', data, {
    jobId: `invoice-pdf:${data.invoiceId}`,
  });
}

async function enqueueStockReportEmail(stockInId, garageId) {
  return emailQueue.add('send-stockin-report', { stockInId, garageId }, {
    jobId: `stockin-report:${stockInId}`,
  });
}

// ─── Workers ─────────────────────────────────────────────────────────────────
function startWorkers() {
  const emailWorker = new Worker('email', async (job) => {
    logger.info({ type: 'JOB_START', queue: 'email', name: job.name, id: job.id });

    if (job.name === 'send-invoice-email') {
      await processInvoiceEmail(job.data);
    } else if (job.name === 'send-stockin-report') {
      await processStockReport(job.data);
    }

    logger.info({ type: 'JOB_SUCCESS', queue: 'email', name: job.name, id: job.id });
  }, { connection, concurrency: 5 });

  const pdfWorker = new Worker('pdf', async (job) => {
    logger.info({ type: 'JOB_START', queue: 'pdf', name: job.name, id: job.id });
    if (job.name === 'generate-invoice-pdf') {
      await processInvoicePdf(job.data);
    }
    logger.info({ type: 'JOB_SUCCESS', queue: 'pdf', name: job.name, id: job.id });
  }, { connection, concurrency: 2 });

  emailWorker.on('failed', (job, err) => {
    logger.error({ type: 'JOB_FAILED', queue: 'email', name: job?.name, id: job?.id, error: err.message });
  });

  pdfWorker.on('failed', (job, err) => {
    logger.error({ type: 'JOB_FAILED', queue: 'pdf', id: job?.id, error: err.message });
  });

  return { emailWorker, pdfWorker };
}

// ─── Processors ──────────────────────────────────────────────────────────────
async function processInvoiceEmail(data) {
  const invoice = await Invoice.findById(data.invoiceId)
    .populate('customerId', 'name email')
    .populate('garageId', 'garageName');

  if (!invoice || !invoice.customerId?.email) return;
  if (invoice.notifiedCustomer) {
    logger.info({ type: 'JOB_SKIPPED', reason: 'already notified', invoiceId: data.invoiceId });
    return;
  }

  await sendNotificationEmail({
    to:      invoice.customerId.email,
    subject: `Invoice ${invoice.invoiceNumber} from ${invoice.garageId.garageName}`,
    body:    `Your invoice of ₹${invoice.total} is ready.`,
  });

  await Invoice.findByIdAndUpdate(data.invoiceId, { notifiedCustomer: true });
}

async function processStockReport(data) {
  const stockIn = await StockIn.findById(data.stockInId)
    .populate('items.partId', 'partName')
    .populate('garageId', 'email');

  if (!stockIn || !stockIn.isSaved) return;
  if (stockIn.jobIdempotencyKey === `report-sent:${data.stockInId}`) return;

  const garageEmail = stockIn.garageId?.email;
  if (!garageEmail) return;

  const body = stockIn.items
    .map((i) => `${i.partId?.partName ?? 'Unknown'}: +${i.receivedQty} (stock now ${i.newStock})`)
    .join('\n');

  await sendNotificationEmail({
    to:      garageEmail,
    subject: `Stock receipt report — ${stockIn.invoiceNo ?? stockIn._id}`,
    body,
  });

  await StockIn.findByIdAndUpdate(data.stockInId, { jobIdempotencyKey: `report-sent:${data.stockInId}` });
}

async function processInvoicePdf(_data) {
  // PDF generation (puppeteer / pdfmake) — write to S3
}

module.exports = {
  emailQueue, pdfQueue,
  enqueueSendInvoiceEmail, enqueueGenerateInvoicePdf, enqueueStockReportEmail,
  startWorkers,
};
