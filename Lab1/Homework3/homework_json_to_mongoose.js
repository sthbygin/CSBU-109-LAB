require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/invoices_db';

// 1. Subdocument Schema: Item Detail
const itemSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price must be greater than or equal to 0']
  }
}, { _id: false });

// 2. Main Schema: Invoice with Validation
const invoiceSchema = new mongoose.Schema({
  invoiceCode: {
    type: String,
    required: [true, 'Invoice code is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  customerEmail: {
    type: String,
    required: [true, 'Customer email is required'],
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address format']
  },
  items: {
    type: [itemSchema],
    validate: {
      validator: (items) => Array.isArray(items) && items.length > 0,
      message: 'An invoice must contain at least one item'
    }
  },
  paymentMethod: {
    type: String,
    required: [true, 'Payment method is required'],
    enum: {
      values: ['CreditCard', 'Momo', 'BankTransfer', 'Cash'],
      message: '{VALUE} is not a supported payment method'
    }
  },
  totalAmount: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Pre-save hook: Automatically compute totalAmount from items (Synchronous - No next needed)
invoiceSchema.pre('save', function () {
  if (this.items && this.items.length > 0) {
    this.totalAmount = this.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  }
});

const Invoice = mongoose.model('Invoice', invoiceSchema);

// 3. Automated Test Scenarios
async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('=== DATABASE CONNECTION ESTABLISHED ===');

    // Clean existing records
    await Invoice.deleteMany({});
    console.log('-> Cleaned previous invoice collection.');

    // --- TEST CASE 1: LOAD & SYNC JSON DATA ---
    console.log('\n--- TEST CASE 1: SYNCHRONIZING INVOICES FROM JSON ---');
    const jsonFilePath = path.join(__dirname, 'invoices.json');
    const rawData = fs.readFileSync(jsonFilePath, 'utf8');
    const invoiceList = JSON.parse(rawData);

    for (const item of invoiceList) {
      const invoice = new Invoice(item);
      await invoice.save();
      console.log(`-> [SAVED] Invoice: ${invoice.invoiceCode} | Customer: ${invoice.customerName} | Total: $${invoice.totalAmount}`);
    }

    // --- TEST CASE 2: VALIDATE INVALID EMAIL ---
    console.log('\n--- TEST CASE 2: INVALID EMAIL FORMAT VALIDATION ---');
    try {
      const invalidEmailInvoice = new Invoice({
        invoiceCode: 'INV-ERR-001',
        customerName: 'Error User',
        customerEmail: 'bad-email-format',
        items: [{ productName: 'Mousepad', quantity: 1, price: 15 }],
        paymentMethod: 'Cash'
      });
      await invalidEmailInvoice.save();
    } catch (err) {
      console.log('Caught expected error:', err.message);
    }

    // --- TEST CASE 3: VALIDATE EMPTY ITEMS ARRAY ---
    console.log('\n--- TEST CASE 3: EMPTY ITEMS VALIDATION ---');
    try {
      const emptyItemsInvoice = new Invoice({
        invoiceCode: 'INV-ERR-002',
        customerName: 'Empty Cart User',
        customerEmail: 'empty@example.com',
        items: [],
        paymentMethod: 'CreditCard'
      });
      await emptyItemsInvoice.save();
    } catch (err) {
      console.log('Caught expected error:', err.message);
    }

    // --- TEST CASE 4: VALIDATE UNSUPPORTED PAYMENT METHOD ---
    console.log('\n--- TEST CASE 4: UNSUPPORTED PAYMENT METHOD VALIDATION ---');
    try {
      const badPaymentInvoice = new Invoice({
        invoiceCode: 'INV-ERR-003',
        customerName: 'Crypto User',
        customerEmail: 'crypto@example.com',
        items: [{ productName: 'GPU RTX 4090', quantity: 1, price: 1600 }],
        paymentMethod: 'Bitcoin'
      });
      await badPaymentInvoice.save();
    } catch (err) {
      console.log('Caught expected error:', err.message);
    }

    // --- TEST CASE 5: VERIFY SYNCHRONIZED RECORDS ---
    console.log('\n--- TEST CASE 5: DATABASE VERIFICATION ---');
    const totalCount = await Invoice.countDocuments();
    console.log(`Total active invoices in MongoDB: ${totalCount}`);

  } catch (err) {
    console.error('Execution Error:', err.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n=== DATABASE CONNECTION CLOSED ===');
  }
}

main();