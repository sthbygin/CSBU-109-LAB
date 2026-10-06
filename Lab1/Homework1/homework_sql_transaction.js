require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'store_transaction_db',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10
});

async function processOrderTransaction(customerId, productId, quantity) {
  // Bắt buộc lấy connection riêng từ pool để giữ transaction
  const conn = await pool.getConnection();

  try {
    console.log(`\n=== BẮT ĐẦU TRANSACTION CHO KHÁCH HÀNG ID: ${customerId} ===`);
    await conn.beginTransaction();

    // Bước 1: Kiểm tra khách hàng, số dư và tồn kho sản phẩm
    const [customerRows] = await conn.execute(
      'SELECT id, balance FROM customers WHERE id = ? FOR UPDATE',
      [customerId]
    );
    if (customerRows.length === 0) throw new Error('Không tìm thấy khách hàng.');
    const customer = customerRows[0];

    const [productRows] = await conn.execute(
      'SELECT id, price, stock FROM products WHERE id = ? FOR UPDATE',
      [productId]
    );
    if (productRows.length === 0) throw new Error('Không tìm thấy sản phẩm.');
    const product = productRows[0];

    const totalAmount = Number(product.price) * quantity;

    if (Number(customer.balance) < totalAmount) {
      throw new Error(`Số dư không đủ! (Cần: ${totalAmount}, Hiện có: ${customer.balance})`);
    }
    if (product.stock < quantity) {
      throw new Error(`Kho hàng không đủ số lượng! (Cần: ${quantity}, Còn: ${product.stock})`);
    }
    console.log('-> Bước 1: Kiểm tra hợp lệ thành công.');

    // Bước 2: Trừ tiền khách hàng
    await conn.execute(
      'UPDATE customers SET balance = balance - ? WHERE id = ?',
      [totalAmount, customerId]
    );
    console.log(`-> Bước 2: Đã trừ ${totalAmount} VND trong tài khoản khách hàng.`);

    // Bước 3: Trừ số lượng tồn kho sản phẩm
    await conn.execute(
      'UPDATE products SET stock = stock - ? WHERE id = ?',
      [quantity, productId]
    );
    console.log(`-> Bước 3: Đã trừ ${quantity} sản phẩm trong kho.`);

    // Bước 4: Thêm bản ghi mới vào orders
    const [orderResult] = await conn.execute(
      'INSERT INTO orders (customer_id, total_amount, created_at) VALUES (?, ?, NOW())',
      [customerId, totalAmount]
    );
    const orderId = orderResult.insertId;
    console.log(`-> Bước 4: Đã tạo đơn hàng mới ID: ${orderId}`);

    // Bước 5: Thêm dòng chi tiết vào order_items
    await conn.execute(
      'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
      [orderId, productId, quantity, product.price]
    );
    console.log('-> Bước 5: Đã thêm chi tiết mặt hàng vào order_items.');

    // Thành công hoàn tất toàn bộ -> Commit
    await conn.commit();
    console.log('==> TRANSACTION COMMIT THÀNH CÔNG!');
  } catch (error) {
    // Có bất kỳ lỗi nào -> Rollback khôi phục trạng thái ban đầu
    await conn.rollback();
    console.error('==> TRANSACTION BỊ ROLLBACK DO LỖI:', error.message);
  } finally {
    conn.release();
  }
}

async function main() {
  // Test trường hợp 1: Thành công (mua 2 sản phẩm, tổng 4tr <= 10tr)
  await processOrderTransaction(1, 1, 2);

  // Test trường hợp 2: Thất bại do vượt số dư (mua 10 sản phẩm = 20tr > số dư còn lại)
  await processOrderTransaction(1, 1, 10);

  await pool.end();
}

main();