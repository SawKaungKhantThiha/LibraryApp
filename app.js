// library_app/app.js

const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage });

// MySQL connection pool
const pool = mysql.createPool({
    host: 'zsp64e.h.filess.io',
    port: 3307,
    user: 'LibraryDB_coldmerely',
    password: 'a78327d540ed00af78012898e5f20f777af6e10f',
    database: 'LibraryDB_coldmerely',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
});

// View engine and middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());

// Middleware
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in to view this resource');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') return next();
    req.flash('error', 'Access denied');
    res.redirect('/shopping');
};

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact} = req.body;
    if (!username || !email || !password || !address || !contact) return res.status(400).send('All fields required');
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 characters');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Routes
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

app.get('/books', checkAuthenticated, checkAdmin, (req, res) => {
    pool.query('SELECT * FROM books', (error, results) => {
        if (error) throw error;
        res.render('books', { books: results, user: req.session.user });
    });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact} = req.body;
    const role = 'user';
    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    pool.query(sql, [username, email, password, address, contact, role], (err) => {
        if (err) throw err;
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        req.flash('error', 'All fields required');
        return res.redirect('/login');
    }
    pool.query('SELECT * FROM users WHERE email = ? AND password = SHA1(?)', [email, password], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            req.session.user = results[0];
            res.redirect(results[0].role === 'admin' ? '/' : '/');
        } else {
            req.flash('error', 'Invalid email or password');
            res.redirect('/login');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

//Books Table Routes

app.get('/addBook', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addBook', { user: req.session.user });
});

app.post('/addBook', checkAuthenticated, checkAdmin, (req, res) => {
    const { title, author, isbn, image } = req.body;

    const sql = `
      INSERT INTO books (title, author, isbn, image_url)
      VALUES (?, ?, ?, ?)
    `;

    pool.query(sql, [title, author, isbn, image], (error) => {
        if (error) {
            console.error(error);
            return res.status(500).send('Error adding book');
        }
        res.redirect('/books');
    });
});

app.get('/updateBook/:id', checkAuthenticated, checkAdmin, (req, res) => {
    pool.query('SELECT * FROM books WHERE book_id = ?', [req.params.id], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            res.render('updateBook', { book: results[0] });
        } else {
            res.status(404).send('Book not found');
        }
    });
});

app.post('/updateBook/:id', (req, res) => {
  const { title, author, isbn, image_url } = req.body;

  pool.query(
    'UPDATE books SET title = ?, author = ?, isbn = ?, image_url = ? WHERE book_id = ?',
    [title, author, isbn, image_url, req.params.id],
    (error) => {
      if (error) return res.status(500).send('Error updating book');
      res.redirect('/books');
    }
  );
});


app.get('/deleteBook/:id', (req, res) => {
    pool.query('DELETE FROM books WHERE book_id = ?', [req.params.id], (error) => {
        if (error) return res.status(500).send('Error deleting book');
        res.redirect('/books');
    });
});

// Publishers Table Routes

app.get('/publishers', checkAuthenticated, checkAdmin, (req, res) => {
    pool.query('SELECT * FROM publishers', (error, results) => {
        if (error) return res.status(500).send('Error fetching publishers');
        res.render('publishers', { publishers: results, user: req.session.user });
    });
});

app.get('/publisher/:id', checkAuthenticated, (req, res) => {
    pool.query('SELECT * FROM publishers WHERE publisher_id = ?', [req.params.id], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            res.render('publisher', { publisher: results[0], user: req.session.user });
        } else {
            res.status(404).send('Publisher not found');
        }
    });
});

app.get('/addPublisher', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addPublisher', { user: req.session.user });
});

app.post('/addPublisher', (req, res) => {
    const { name, address, contact, email } = req.body;
    pool.query(
        'INSERT INTO publishers (name, address, contact, email) VALUES (?, ?, ?, ?)',
        [name, address, contact, email],
        (error) => {
            if (error) {
                console.error(error);
                return res.status(500).send('Error adding publisher');
            }
            res.redirect('/publishers');
        }
    );
});

app.get('/updatePublisher/:id', checkAuthenticated, checkAdmin, (req, res) => {
    pool.query('SELECT * FROM publishers WHERE publisher_id = ?', [req.params.id], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            res.render('updatePublisher', { publisher: results[0], user: req.session.user });
        } else {
            res.status(404).send('Publisher not found');
        }
    });
});

app.post('/updatePublisher/:id', (req, res) => {
    const { name, address, contact, email } = req.body;
    pool.query(
        'UPDATE publishers SET name = ?, address = ?, contact = ?, email = ? WHERE publisher_id = ?',
        [name, address, contact, email, req.params.id],
        (error) => {
            if (error) return res.status(500).send('Error updating publisher');
            res.redirect('/publishers');
        }
    );
});

app.get('/deletePublisher/:id', checkAuthenticated, checkAdmin, (req, res) => {
    pool.query('DELETE FROM publishers WHERE publisher_id = ?', [req.params.id], (error) => {
        if (error) return res.status(500).send('Error deleting publisher');
        res.redirect('/publishers');
    });
});

//Availablity Table Routes

app.get('/availability', checkAuthenticated, checkAdmin, (req, res) => {
  const sql = `
    SELECT a.*, b.title, b.image_url, p.name 
    FROM availability a 
    JOIN books b ON a.book_id = b.book_id 
    JOIN publishers p ON a.publisher_id = p.publisher_id
  `;

  pool.query(sql, (err, results) => {
    if (err) return res.status(500).send('Error loading availability');
    res.render('availability', { availability: results, user: req.session.user });
  });
});

app.get('/addAvailability', checkAuthenticated, checkAdmin, (req, res) => {
  pool.query('SELECT * FROM books; SELECT * FROM publishers', (err, results) => {
    if (err) return res.status(500).send('Error');
    const books = results[0];
    const publishers = results[1];
    res.render('addAvailability', { books, publishers, user: req.session.user });
  });
});

app.post('/addAvailability', checkAuthenticated, checkAdmin, (req, res) => {
  const { book_id, publisher_id, available_quantity } = req.body;

  const sql = `
    INSERT INTO availability (book_id, publisher_id, available_quantity)
    VALUES (?, ?, ?)
  `;

  pool.query(sql, [book_id, publisher_id, available_quantity], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Insert failed');
    }
    res.redirect('/availability');
  });
});


app.post('/updateAvailability/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const id = req.params.id;
  const { available_quantity } = req.body;

  const sql = `
    UPDATE availability 
    SET available_quantity = ?
    WHERE availability_id = ?
  `;

  pool.query(sql, [available_quantity, id], (err) => {
    if (err) return res.status(500).send('Update failed');
    res.redirect('/availability');
  });
});

app.get('/updateAvailability/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const id = req.params.id;
  const sql = `
    SELECT a.*, b.title, p.name 
    FROM availability a
    JOIN books b ON a.book_id = b.book_id
    JOIN publishers p ON a.publisher_id = p.publisher_id
    WHERE a.availability_id = ?
  `;
  
  pool.query(sql, [id], (err, results) => {
    if (err) return res.status(500).send('Error');

    res.render('updateAvailability', {
      availability: results[0],
      user: req.session.user
    });
  });
});

app.post('/updateAvailability/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const id = req.params.id;
  const { book_id, publisher_id, available_quantity} = req.body;
  const sql = `
    UPDATE availability 
    SET book_id = ?, publisher_id = ?, available_quantity = ? 
    WHERE availability_id = ?
  `;
  pool.query(sql, [book_id, publisher_id, available_quantity, id], (err) => {
    if (err) return res.status(500).send('Update failed');
    res.redirect('/availability');
  });
});

app.get('/deleteAvailability/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const id = req.params.id;
  pool.query('DELETE FROM availability WHERE availability_id = ?', [id], (err) => {
    if (err) return res.status(500).send('Delete failed');
    res.redirect('/availability');
  });
});



// Loan Table Routes

app.get('/loans', checkAuthenticated, checkAdmin, (req, res) => {
  const sql = `
    SELECT l.*, u.username, b.title, p.name AS publisher 
    FROM loan l 
    JOIN users u ON l.user_id = u.user_id
    JOIN availability a ON l.availability_id = a.availability_id
    JOIN books b ON a.book_id = b.book_id
    JOIN publishers p ON a.publisher_id = p.publisher_id
  `;
  pool.query(sql, (err, results) => {
    if (err) return res.status(500).send('Error loading loans');
    res.render('loan', { loans: results, user: req.session.user });
  });
});

app.get('/addLoan', checkAuthenticated, checkAdmin, (req, res) => {
  const sql = `
    SELECT a.availability_id, b.title AS book_title, p.name AS publisher_name
    FROM availability a
    JOIN books b ON a.book_id = b.book_id
    JOIN publishers p ON a.publisher_id = p.publisher_id;

    SELECT * FROM users;
  `;

  pool.query(sql, (err, results) => {
    if (err) return res.status(500).send('Error loading data');
    res.render('addLoan', {
      availability: results[0],
      users: results[1],
      user: req.session.user
    });
  });
});

app.post('/addLoan', checkAuthenticated, checkAdmin, (req, res) => {
  const { availability_id, user_id, loan_date, return_date } = req.body;

  const sql = `
    INSERT INTO loan (availability_id, user_id, loan_date, due_date, return_date, status)
    VALUES (?, ?, ?, DATE_ADD(?, INTERVAL 14 DAY), ?, 'Borrowed')
  `;

  pool.query(sql, [availability_id, user_id, loan_date, loan_date, return_date || null], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Insert failed');
    }
    res.redirect('/loans');
  });
});



app.get('/updateLoan/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const id = req.params.id;
  const sql = `
    SELECT * FROM loan WHERE loan_id = ?;
    SELECT * FROM availability;
    SELECT * FROM users
  `;
  pool.query(sql, [id], (err, results) => {
    if (err) return res.status(500).send('Error loading loan');
    res.render('updateLoan', {
      loan: results[0][0],
      availability: results[1],
      users: results[2],
      user: req.session.user
    });
  });
});

app.post('/updateLoan/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const id = req.params.id;
  const { availability_id, user_id, loan_date, return_date, status } = req.body;
  const sql = `
    UPDATE loan 
    SET availability_id = ?, user_id = ?, loan_date = ?, return_date = ?, status = ?
    WHERE loan_id = ?
  `;
  pool.query(sql, [availability_id, user_id, loan_date, return_date || null, status, id], (err) => {
    if (err) return res.status(500).send('Update failed');
    res.redirect('/loans');
  });
});

app.get('/deleteLoan/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const id = req.params.id;
  pool.query('DELETE FROM loan WHERE loan_id = ?', [id], (err) => {
    if (err) return res.status(500).send('Delete failed');
    res.redirect('/loans');
  });
});

// Users Table Routes

app.get('/users', checkAuthenticated, checkAdmin, (req, res) => {
  pool.query('SELECT * FROM users', (err, results) => {
    if (err) return res.status(500).send('Error loading users');
    res.render('users', { users: results, user: req.session.user });
  });
});

app.get('/deleteUser/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const userId = req.params.id;

  const sql = 'DELETE FROM users WHERE user_id = ?';
  pool.query(sql, [userId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Delete failed');
    }
    res.redirect('/users');
  });
});

app.get('/updateUser/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const userId = req.params.id;
  pool.query('SELECT * FROM users WHERE user_id = ?', [userId], (err, results) => {
    if (err) return res.status(500).send('Error fetching user');
    if (results.length === 0) return res.status(404).send('User not found');
    res.render('updateUser', { user: results[0] });
  });
});

app.post('/updateUser/:id', checkAuthenticated, checkAdmin, (req, res) => {
  const { username, email, address, contact, role } = req.body;
  const sql = `
    UPDATE users SET username = ?, email = ?, address = ?, contact = ?, role = ?
    WHERE user_id = ?
  `;
  pool.query(sql, [username, email, address, contact, role, req.params.id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Update failed');
    }
    res.redirect('/users');
  });
});

app.get('/addUser', checkAuthenticated, checkAdmin, (req, res) => {
  res.render('addUser', { user: req.session.user });
});

app.post('/addUser', checkAuthenticated, checkAdmin, (req, res) => {
  const { username, email, password, address, contact, role } = req.body;

  if (!username || !email || !password || !address || !contact || !role) {
    return res.status(400).send('All fields are required');
  }

  const sql = `
    INSERT INTO users (username, email, password, address, contact, role)
    VALUES (?, ?, SHA1(?), ?, ?, ?)
  `;

  pool.query(sql, [username, email, password, address, contact, role], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('User registration failed');
    }
    res.redirect('/users');
  });
});



// Availability Table Route for Users

app.get('/shopping', checkAuthenticated, (req, res) => {
  if (req.session.user.role !== 'user') return res.redirect('/');

  const query = req.query.q || '';

  const availabilitySql = `
    SELECT a.availability_id, a.available_quantity, 
          b.title, b.author, b.image_url, 
          p.name AS publisher
    FROM availability a
    JOIN books b ON a.book_id = b.book_id
    JOIN publishers p ON a.publisher_id = p.publisher_id
  `;

  const searchSql = `
    SELECT a.availability_id, a.available_quantity,
          b.title, b.author, b.isbn, b.book_id, b.image_url,
          p.name AS publisher
    FROM availability a
    JOIN books b ON a.book_id = b.book_id
    JOIN publishers p ON a.publisher_id = p.publisher_id
    WHERE b.title LIKE CONCAT('%', ?, '%') OR b.author LIKE CONCAT('%', ?, '%')
  `;

  pool.query(availabilitySql, (err1, availabilityResults) => {
    if (err1) return res.status(500).send('Error loading availability');

    if (query.trim() !== '') {
      pool.query(searchSql, [query, query], (err2, bookResults) => {
        if (err2) return res.status(500).send('Error during search');
        return res.render('shopping', {
          user: req.session.user,
          availability: availabilityResults,
          books: bookResults,
          query
        });
      });
    } else {
      return res.render('shopping', {
        user: req.session.user,
        availability: availabilityResults,
        books: null,
        query: ''
      });
    }
  });
});

//add to cart route
app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', {
        cart,
        messages: req.flash('error'),
        successes: req.flash('success')
    });
});

app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
    const availabilityId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity);
    if (!req.session.cart) req.session.cart = [];

    const query = `
        SELECT a.availability_id, b.title, b.author, p.name AS publisher, a.available_quantity
        FROM availability a
        JOIN books b ON a.book_id = b.book_id
        JOIN publishers p ON a.publisher_id = p.publisher_id
        WHERE a.availability_id = ?
    `;

    pool.query(query, [availabilityId], (err, results) => {
        if (err) return res.status(500).send('Database error');
        if (results.length === 0) return res.status(404).send('Item not found');

        const row = results[0];
        const cartItem = req.session.cart.find(item => item.availabilityId === availabilityId);
        const alreadyInCart = cartItem ? cartItem.quantity : 0;
        const qtyToAdd = Math.min(quantity, row.available_quantity - alreadyInCart);

        if (qtyToAdd <= 0) {
            req.flash('error', 'Not enough stock available or already added to cart.');
            return res.redirect('/shopping');
        }

        if (cartItem) {
            cartItem.quantity += qtyToAdd;
        } else {
            req.session.cart.push({
                availabilityId: row.availability_id,
                title: row.title,
                author: row.author,
                publisher: row.publisher,
                quantity: qtyToAdd
            });
        }

        req.flash('success', 'Item(s) added to cart.');
        res.redirect('/shopping');
    });
});

app.post('/remove-from-cart/:id', checkAuthenticated, (req, res) => {
    const { id } = req.params;
    const removeQuantity = parseInt(req.body.removeQuantity, 10);
    const cart = req.session.cart || [];

    if (isNaN(removeQuantity) || removeQuantity <= 0) {
        req.flash('error', 'Invalid quantity to remove.');
        return res.redirect('/cart');
    }

    const index = cart.findIndex(item => item.availabilityId == id);
    if (index !== -1) {
        const item = cart[index];
        if (removeQuantity > item.quantity) {
            req.flash('error', 'Cannot remove more items than are in the cart.');
            return res.redirect('/cart');
        }
        item.quantity -= removeQuantity;
        if (item.quantity <= 0) {
            cart.splice(index, 1);
        }
        req.session.cart = cart;
        req.flash('success', 'Item(s) removed from cart.');
    } else {
        req.flash('error', 'Item not found in cart.');
    }
    res.redirect('/cart');
});

app.post('/clear-cart', checkAuthenticated, (req, res) => {
    req.session.cart = [];
    req.flash('success', 'Cart cleared.');
    res.redirect('/cart');
});

// Checkout Route
app.post('/checkout', checkAuthenticated, async (req, res) => {
    const userId = req.session.user.user_id;
    const cart = req.session.cart || [];
    if (!userId || cart.length === 0) {
        req.flash('error', 'Cart is empty or user not logged in.');
        return res.redirect('/cart');
    }

    let connection;
    try {
        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        for (const item of cart) {
            const [checkResults] = await connection.query(
                'SELECT available_quantity FROM availability WHERE availability_id = ?',
                [item.availabilityId]
            );
            if (checkResults.length === 0 || checkResults[0].available_quantity < item.quantity) {
                throw new Error(`Not enough stock available for ${item.title}`);
            }

            await connection.query(
                'INSERT INTO loan (user_id, availability_id, loan_date, return_date, status, quantity) VALUES (?, ?, CURDATE(), NULL, "Borrowed", ?)',
                [userId, item.availabilityId, item.quantity]
            );

            await connection.query(
                'UPDATE availability SET available_quantity = available_quantity - ? WHERE availability_id = ?',
                [item.quantity, item.availabilityId]
            );
        }

        await connection.commit();
        req.session.cart = [];
        req.flash('success', 'Checkout successful! Books borrowed.');
        res.redirect('/userLoans');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Error processing checkout:', err);
        req.flash('error', 'Checkout failed: ' + (err.message || 'Unknown error.'));
        res.redirect('/cart');
    } finally {
        if (connection) await connection.release();
    }
});

// Return Loan Route
app.post('/return-loan/:id', checkAuthenticated, async (req, res) => {
    const loanId = req.params.id;
    const userId = req.session.user.user_id;
    const returnQuantity = parseInt(req.body.quantity) || 1;

    let connection;
    try {
        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        const [loanResults] = await connection.query(
            `SELECT l.availability_id, l.quantity as loaned_quantity, l.status
             FROM loan l
             WHERE l.loan_id = ? AND l.user_id = ? AND l.status = 'Borrowed'`,
            [loanId, userId]
        );

        if (loanResults.length === 0) {
            throw new Error('Loan not found, already returned, or does not belong to you.');
        }

        const loan = loanResults[0];
        if (returnQuantity <= 0 || returnQuantity > loan.loaned_quantity) {
            throw new Error('Invalid return quantity.');
        }

        await connection.query(
            'UPDATE availability SET available_quantity = available_quantity + ? WHERE availability_id = ?',
            [returnQuantity, loan.availability_id]
        );

        if (returnQuantity === loan.loaned_quantity) {
            await connection.query(
                'UPDATE loan SET status = "Returned", return_date = CURDATE() WHERE loan_id = ?',
                [loanId]
            );
        } else {
            await connection.query(
                'UPDATE loan SET quantity = quantity - ? WHERE loan_id = ?',
                [returnQuantity, loanId]
            );
        }

        await connection.commit();
        req.flash('success', `Successfully returned ${returnQuantity} book(s).`);
        res.redirect('/userLoans');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Error returning loan:', err);
        req.flash('error', 'Failed to return book: ' + err.message);
        res.redirect('/userLoans');
    } finally {
        if (connection) connection.release();
    }
});

// User Loans Page
app.get('/userLoans', checkAuthenticated, (req, res) => {
    if (req.session.user.role !== 'user') return res.redirect('/');
    const userId = req.session.user.user_id;

    const sql = `
        SELECT l.*, b.title, b.author, b.image_url, p.name AS publisher
        FROM loan l
        JOIN availability a ON l.availability_id = a.availability_id
        JOIN books b ON a.book_id = b.book_id
        JOIN publishers p ON a.publisher_id = p.publisher_id
        WHERE l.user_id = ?
        ORDER BY l.loan_date DESC
    `;

    pool.query(sql, [userId], (err, results) => {
        if (err) {
            console.error("Error fetching user loans:", err);
            req.flash('error', 'Could not load loan history.');
            return res.render('userLoans', {
                loans: [],
                user: req.session.user,
                messages: req.flash('error'),
                successes: req.flash('success')
            });
        }
        res.render('userLoans', {
            loans: results,
            user: req.session.user,
            messages: req.flash('error'),
            successes: req.flash('success')
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

